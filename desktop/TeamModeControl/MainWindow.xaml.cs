using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Threading;
using Microsoft.Win32;

namespace TeamModeControl;

public partial class MainWindow : Window
{
    private const double CompactHeight = 86;
    private const double ExpandedHeight = 658;
    private static readonly string ProjectRoot = FindProjectRoot();
    private static readonly string StateRoot = Path.Combine(ProjectRoot, "state");
    private readonly DispatcherTimer _statusTimer = new() { Interval = TimeSpan.FromSeconds(3) };
    private readonly List<ModelOption> _agentModels = [];
    private string _workspaceRoot = "";
    private bool _enabled;
    private bool _expanded = true;
    private bool _busy;
    private bool _ignoreAgentSelection;
    private bool _ignoreModelSelection;

    public MainWindow()
    {
        InitializeComponent();
        _workspaceRoot = LoadLastWorkspace();
        ExpandedPanel.Visibility = Visibility.Visible;
        Height = ExpandedHeight;
        UpdateModeVisual();
        _statusTimer.Tick += async (_, _) =>
        {
            if (!_busy && !string.IsNullOrWhiteSpace(_workspaceRoot)) await RefreshModeAsync(quiet: true);
        };
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        Left = Math.Max(16, (SystemParameters.WorkArea.Width - Width) / 2);
        Top = Math.Max(12, SystemParameters.WorkArea.Top + 28);
        HeaderSubtitle.Text = string.IsNullOrWhiteSpace(_workspaceRoot) ? "先选择一个项目" : Path.GetFileName(_workspaceRoot);
        ProjectPathText.Text = string.IsNullOrWhiteSpace(_workspaceRoot) ? "尚未选择" : _workspaceRoot;
        ProjectPathText.ToolTip = _workspaceRoot;
        if (!string.IsNullOrWhiteSpace(_workspaceRoot)) await RefreshAllAsync();
        else FooterStatus.Text = "先选择项目；开关状态会按项目分别保存。";
        _statusTimer.Start();
    }

    private void Window_SourceInitialized(object? sender, EventArgs e)
    {
        try
        {
            var handle = new System.Windows.Interop.WindowInteropHelper(this).Handle;
            EnableAcrylicBackdrop(handle);
        }
        catch { /* Custom glass layers remain readable if Windows backdrop support is unavailable. */ }
    }

    private void Header_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (IsInsideButton(e.OriginalSource as DependencyObject)) return;
        if (e.LeftButton == MouseButtonState.Pressed) DragMove();
    }

    private static bool IsInsideButton(DependencyObject? element)
    {
        while (element is not null)
        {
            if (element is ButtonBase) return true;
            element = element is System.Windows.Media.Visual or System.Windows.Media.Media3D.Visual3D
                ? System.Windows.Media.VisualTreeHelper.GetParent(element)
                : LogicalTreeHelper.GetParent(element);
        }
        return false;
    }

    private void Window_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Escape && _expanded) SetExpanded(false);
    }

    private async void ChooseProject_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFolderDialog
        {
            Title = "选择要管理的项目文件夹",
            InitialDirectory = Directory.Exists(_workspaceRoot) ? _workspaceRoot : Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            Multiselect = false,
        };
        if (dialog.ShowDialog(this) != true) return;
        _workspaceRoot = Path.GetFullPath(dialog.FolderName);
        Directory.CreateDirectory(StateRoot);
        await File.WriteAllTextAsync(Path.Combine(StateRoot, "last-workspace.txt"), _workspaceRoot);
        ProjectPathText.Text = _workspaceRoot;
        ProjectPathText.ToolTip = _workspaceRoot;
        HeaderSubtitle.Text = Path.GetFileName(_workspaceRoot);
        FooterStatus.Text = "正在读取这个项目的团队状态…";
        await RefreshAllAsync();
    }

    private async void ModeToggle_Click(object sender, RoutedEventArgs e)
    {
        if (_busy || string.IsNullOrWhiteSpace(_workspaceRoot)) return;
        await RunBusyAsync(async () =>
        {
            var result = await ControlCommandAsync("set", "--workspace", _workspaceRoot, "--enabled", (!_enabled).ToString().ToLowerInvariant());
            _enabled = result?["enabled"]?.GetValue<bool>() ?? !_enabled;
            UpdateModeVisual();
            FooterStatus.Text = _enabled
                ? "团队模式已开启。前端派给 DSH；后端由 Sol 在 Codex 会话选择 GPT。"
                : "团队模式已关闭。当前 Codex 对话恢复普通工作方式。";
            await RefreshModeAsync(quiet: true);
        });
    }

    private async void RefreshAgents_Click(object sender, RoutedEventArgs e)
    {
        if (_busy) return;
        await RunBusyAsync(async () => await RefreshAgentsAsync());
    }

    private async void VerifyModel_Click(object sender, RoutedEventArgs e)
    {
        if (_busy || ModelPicker.SelectedItem is not ModelOption model || AgentPicker.SelectedItem is not AgentOption agent) return;
        if (agent.Id == "codex")
        {
            VerifyStatusText.Text = "Codex 模型会在当前会话实际启动后确认；不可用时停止并向你报告。";
            return;
        }
        await RunBusyAsync(async () =>
        {
            var result = await ControlCommandAsync("verify-model", "--agent-id", agent.Id, "--provider-id", model.ProviderId,
                "--model-id", model.ModelId, "--workspace", _workspaceRoot);
            var verified = result?["verified"]?.GetValue<bool>() == true;
            VerifyStatusText.Text = verified
                ? $"已验证：{model.DisplayName} · 当前 ACP 会话可以设置并回读精确模型。"
                : "验证失败：" + (result?["reason"]?.GetValue<string>() ?? "没有得到模型确认");
            VerifyStatusText.Foreground = verified ? (Brush)FindResource("Mint") : Brushes.Firebrick;
            await LoadSelectedAgentAsync();
        });
    }

    private async void AddAgent_Click(object sender, RoutedEventArgs e)
    {
        if (_busy) return;
        await RunBusyAsync(async () =>
        {
            var argsText = AgentArgsInput.Text.Trim();
            var args = string.IsNullOrEmpty(argsText) ? Array.Empty<string>() : JsonSerializer.Deserialize<string[]>(argsText) ?? Array.Empty<string>();
            var added = await ControlCommandAsync("add-agent", "--id", AgentIdInput.Text.Trim(), "--name", AgentNameInput.Text.Trim(),
                "--executable", AgentCommandInput.Text.Trim(), "--args-json", JsonSerializer.Serialize(args), "--workspace", _workspaceRoot);
            FooterStatus.Text = $"已连接 {added?["displayName"]?.GetValue<string>() ?? AgentNameInput.Text}。"
                + "可查看该 Agent 实际公布的连接协议、Provider、模型与能力。";
            AgentIdInput.Clear(); AgentNameInput.Clear(); AgentCommandInput.Clear(); AgentArgsInput.Clear();
            await RefreshAgentsAsync();
        });
    }

    private async void AgentPicker_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_ignoreAgentSelection || _busy || AgentPicker.SelectedItem is not AgentOption) return;
        await RunBusyAsync(async () =>
        {
            await LoadSelectedAgentAsync();
        });
    }

    private void ModelPicker_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!_ignoreModelSelection && ModelPicker.SelectedItem is ModelOption model && AgentPicker.SelectedItem is AgentOption agent)
        {
            VerifyModelButton.IsEnabled = !_busy && model.IsSelectable;
            if (agent.Id == "codex")
            {
                VerifyStatusText.Text = "Codex 原生子代理在每项任务启动时使用你选定的 GPT 模型。";
                VerifyStatusText.Foreground = (Brush)FindResource("TextSoft");
            }
        }
        else
        {
            VerifyModelButton.IsEnabled = false;
        }
    }

    private async void ConnectCodex_Click(object sender, RoutedEventArgs e)
    {
        if (_busy) return;
        await RunBusyAsync(async () =>
        {
            await ControlCommandAsync("install-codex");
            FooterStatus.Text = "Codex 配置已更新；如需改动已有配置会先备份。请重启 Codex，再回到所选项目对话使用团队模式。";
        });
    }

    private void CollapseButton_Click(object sender, RoutedEventArgs e) => SetExpanded(!_expanded);
    private void CloseButton_Click(object sender, RoutedEventArgs e) => Close();

    private async Task RefreshAllAsync(bool quiet = false)
    {
        if (_busy || string.IsNullOrWhiteSpace(_workspaceRoot) || !Directory.Exists(_workspaceRoot))
        {
            if (!quiet && !string.IsNullOrWhiteSpace(_workspaceRoot)) FooterStatus.Text = "所选项目不存在，请重新选择。";
            return;
        }
        await RunBusyAsync(async () =>
        {
            await RefreshModeAsync(quiet: true);
            await RefreshAgentsAsync();
        });
    }

    private async Task RefreshModeAsync(bool quiet)
    {
        if (string.IsNullOrWhiteSpace(_workspaceRoot) || !Directory.Exists(_workspaceRoot))
        {
            if (!quiet) FooterStatus.Text = "所选项目不存在，请重新选择。";
            return;
        }
        try
        {
            var status = await ControlCommandAsync("status", "--workspace", _workspaceRoot);
            var next = status?["enabled"]?.GetValue<bool>() ?? false;
            if (_enabled != next)
            {
                _enabled = next;
                UpdateModeVisual();
                if (!quiet) FooterStatus.Text = _enabled ? "团队模式已在 Codex 中开启。" : "团队模式已在 Codex 中关闭。";
            }
        }
        catch (Exception ex)
        {
            if (!quiet) FooterStatus.Text = "读取项目状态失败：" + ex.Message;
        }
    }

    private async Task RefreshAgentsAsync()
    {
        if (string.IsNullOrWhiteSpace(_workspaceRoot)) return;
        var agents = await ControlCommandAsync("agents") as JsonArray ?? new JsonArray();
        var agentOptions = agents
            .Where(agent => agent?["id"]?.GetValue<string>() == "dsh" || agent?["id"]?.GetValue<string>() == "codex" || agent?["runtime"]?.GetValue<string>() == "external")
            .Select(agent => new AgentOption(agent?["id"]?.GetValue<string>() ?? "", agent?["displayName"]?.GetValue<string>() ?? "Agent"))
            .Where(agent => !string.IsNullOrWhiteSpace(agent.Id))
            .ToList();
        var customCount = agentOptions.Count(agent => agent.Id is not ("dsh" or "codex"));
        AgentSummary.Text = customCount == 0
            ? "2 个内置 Agent · DSH：ACP · Codex：GPT"
            : $"2 个内置 Agent · 已添加 {customCount} 个 ACP Agent";
        ExternalAgentsText.Text = customCount == 0
            ? "只显示内置连接器与明确添加的 Agent，不扫描其他程序。"
            : "已添加：" + string.Join(" · ", agentOptions.Where(agent => agent.Id is not ("dsh" or "codex")).Select(agent => agent.DisplayName)) + "。";
        var selectedId = (AgentPicker.SelectedItem as AgentOption)?.Id ?? "dsh";
        _ignoreAgentSelection = true;
        AgentPicker.ItemsSource = agentOptions;
        AgentPicker.SelectedItem = agentOptions.FirstOrDefault(agent => agent.Id == selectedId) ?? agentOptions.FirstOrDefault(agent => agent.Id == "dsh");
        _ignoreAgentSelection = false;
        if (AgentPicker.SelectedItem is AgentOption) await LoadSelectedAgentAsync();
    }

    private async Task LoadSelectedAgentAsync()
    {
        if (AgentPicker.SelectedItem is not AgentOption selected || string.IsNullOrWhiteSpace(_workspaceRoot)) return;
        _agentModels.Clear();
        _ignoreModelSelection = true;
        if (selected.Id == "codex")
        {
            AgentConnectionText.Text = "Codex 原生 · 当前会话";
            AgentConnectionText.Foreground = (Brush)FindResource("Mint");
            AgentModelText.Text = "Codex 子代理从当前 Codex 会话启动。每项任务使用 Sol 选定的可用 GPT 模型；模型菜单由 Codex 提供。";
            _agentModels.Add(new ModelOption("由 Sol 为当前任务选择 GPT", "select-per-task", "openai", "当前会话", false));
            ModelPicker.ItemsSource = null;
            ModelPicker.ItemsSource = _agentModels;
            ModelPicker.SelectedIndex = 0;
            VerifyStatusText.Text = "具体模型在子代理启动时由当前 Codex 会话决定；不可用时会停止并报告。";
            VerifyStatusText.Foreground = (Brush)FindResource("TextSoft");
            VerifyModelButton.IsEnabled = false;
            _ignoreModelSelection = false;
            return;
        }
        AgentConnectionText.Text = "ACP · 正在读取";
        AgentConnectionText.Foreground = (Brush)FindResource("TextSoft");
        AgentModelText.Text = "正在与所选 Agent 握手并读取公开模型…";
        var probe = await ControlCommandAsync("probe", "--agent-id", selected.Id, "--workspace", _workspaceRoot);
        var connected = probe?["connected"]?.GetValue<bool>() == true;
        var connection = probe?["connection"];
        var protocol = connection is JsonObject ? connection["protocol"]?.GetValue<string>() : connection?.GetValue<string>();
        var transport = connection is JsonObject ? connection["transport"]?.GetValue<string>() : null;
        AgentConnectionText.Text = connected ? $"{protocol ?? "ACP"} · {transport ?? "stdio"} · 已连接" : "ACP · 未连接";
        AgentConnectionText.Foreground = connected ? (Brush)FindResource("Mint") : Brushes.Firebrick;
        var modelApi = probe?["modelApi"]?["type"]?.GetValue<string>() ?? "unknown";
        var provider = probe?["provider"]?["id"]?.GetValue<string>() ?? "Agent 公布";
        var models = probe?["models"] as JsonArray ?? new JsonArray();
        foreach (var item in models)
        {
            if (item is null) continue;
            var option = new ModelOption(
                item["name"]?.GetValue<string>() ?? item["modelId"]?.GetValue<string>() ?? "未知模型",
                item["modelId"]?.GetValue<string>() ?? "",
                item["providerId"]?.GetValue<string>() ?? "",
                item["status"]?.GetValue<string>() ?? "unknown",
                true);
            if (!string.IsNullOrWhiteSpace(option.ModelId)) _agentModels.Add(option);
        }
        ModelPicker.ItemsSource = null;
        ModelPicker.ItemsSource = _agentModels;
        ModelPicker.SelectedItem = _agentModels.FirstOrDefault(model => selected.Id == "dsh" && model.ModelId == "deepseek-flash" && model.ProviderId == "deepseek-account")
            ?? _agentModels.FirstOrDefault();
        _ignoreModelSelection = false;
        AgentModelText.Text = connected
            ? $"模型 API {modelApi} · Provider {provider} · {_agentModels.Count} 个公开选项"
            : probe?["error"]?.GetValue<string>() ?? "没有完成 ACP 握手。请检查程序路径和 ACP stdio 配置。";
        await UpdateSelectedModelStatusAsync(probe);
    }

    private async Task UpdateSelectedModelStatusAsync(JsonNode? probe = null)
    {
        if (AgentPicker.SelectedItem is not AgentOption agent || ModelPicker.SelectedItem is not ModelOption model) return;
        probe ??= await ControlCommandAsync("probe", "--agent-id", agent.Id, "--workspace", _workspaceRoot);
        var verified = probe?["verifiedModels"] as JsonArray;
        var status = model.Status is "verified" or "supported" ? model.Status : "unknown";
        var stored = verified?.Any(item => item?["modelId"]?.GetValue<string>() == model.ModelId && item?["providerId"]?.GetValue<string>() == model.ProviderId) == true;
        VerifyStatusText.Text = stored
            ? $"已验证 {model.DisplayName}；记录会保存在本机。"
            : status == "supported"
                ? "模型来自 Agent 公开清单；仍需主动验证后才会标为可用。"
                : "Agent 已公布此模型；尚未完成端到端验证。";
        VerifyStatusText.Foreground = stored ? (Brush)FindResource("Mint") : (Brush)FindResource("TextSoft");
        VerifyModelButton.IsEnabled = model.IsSelectable && !_busy;
    }
    private async Task RunBusyAsync(Func<Task> action)
    {
        _busy = true;
        ModeToggle.IsEnabled = false;
        VerifyModelButton.IsEnabled = false;
        ConnectCodexButton.IsEnabled = false;
        try { await action(); }
        catch (Exception ex)
        {
            FooterStatus.Text = "操作未完成：" + ex.Message;
            FooterStatus.Foreground = Brushes.Firebrick;
        }
        finally
        {
            _busy = false;
            ModeToggle.IsEnabled = !string.IsNullOrWhiteSpace(_workspaceRoot);
            VerifyModelButton.IsEnabled = ModelPicker.SelectedItem is ModelOption model && model.IsSelectable;
            ConnectCodexButton.IsEnabled = true;
        }
    }

    private async Task<JsonNode?> ControlCommandAsync(string command, params string[] args)
    {
        var script = Path.Combine(ProjectRoot, "src", "control-cli.mjs");
        if (!File.Exists(script)) throw new FileNotFoundException("本地控制服务文件不在应用目录中。请从项目安装目录启动面板。", script);
        Directory.CreateDirectory(StateRoot);
        var start = new ProcessStartInfo(ResolveNode())
        {
            WorkingDirectory = Directory.Exists(_workspaceRoot) ? _workspaceRoot : ProjectRoot,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
        };
        start.ArgumentList.Add(script);
        start.ArgumentList.Add(command);
        for (var index = 0; index < args.Length; index += 2)
        {
            start.ArgumentList.Add(args[index]);
            start.ArgumentList.Add(index + 1 < args.Length ? args[index + 1] : "");
        }
        start.ArgumentList.Add("--state-root");
        start.ArgumentList.Add(StateRoot);
        start.Environment["SOL_TEAM_STATE_ROOT"] = StateRoot;
        using var process = new Process { StartInfo = start };
        if (!process.Start()) throw new InvalidOperationException("无法启动 Node.js 控制服务。");
        var outputTask = process.StandardOutput.ReadToEndAsync();
        var errorTask = process.StandardError.ReadToEndAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        await process.WaitForExitAsync(timeout.Token);
        var output = await outputTask;
        var error = await errorTask;
        if (process.ExitCode != 0 && string.IsNullOrWhiteSpace(output)) throw new InvalidOperationException(string.IsNullOrWhiteSpace(error) ? "Node.js 控制服务启动失败。" : error.Trim());
        var response = JsonNode.Parse(output) as JsonObject ?? throw new InvalidOperationException("控制服务返回了无法识别的数据。");
        if (response["ok"]?.GetValue<bool>() != true) throw new InvalidOperationException(response["error"]?.GetValue<string>() ?? "控制服务没有完成操作。");
        return response["value"]?.DeepClone();
    }

    private static string ResolveNode()
    {
        var suffix = OperatingSystem.IsWindows() ? "node.exe" : "node";
        foreach (var directory in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            var candidate = Path.Combine(directory.Trim('"'), suffix);
            if (File.Exists(candidate)) return candidate;
        }
        throw new FileNotFoundException("没有找到 Node.js。请先安装 Node.js 22 或更新版本。", suffix);
    }

    private static string FindProjectRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
        {
            if (File.Exists(Path.Combine(directory.FullName, "package.json")) && File.Exists(Path.Combine(directory.FullName, "src", "control-cli.mjs")) && File.Exists(Path.Combine(directory.FullName, "templates", "codex", "skills", "sol-team-mode", "SKILL.md"))) return directory.FullName;
        }
        throw new DirectoryNotFoundException("没有找到团队模式项目目录。请从项目目录构建或启动控制面板。");
    }

    private string LoadLastWorkspace()
    {
        var selected = Environment.GetEnvironmentVariable("SOL_TEAM_WORKSPACE");
        var path = Path.Combine(StateRoot, "last-workspace.txt");
        if (string.IsNullOrWhiteSpace(selected) && File.Exists(path)) selected = File.ReadAllText(path).Trim();
        if (string.IsNullOrWhiteSpace(selected)) return "";
        var full = Path.GetFullPath(selected);
        return Directory.Exists(full) ? full : "";
    }

    private void UpdateModeVisual()
    {
        var mint = (Brush)FindResource("Mint");
        var soft = (Brush)FindResource("TextSoft");
        ModeValue.Text = _enabled ? "ON" : "OFF";
        ModeValue.Foreground = _enabled ? mint : soft;
        HeaderState.Background = _enabled ? new SolidColorBrush(Color.FromArgb(0x42, 0x79, 0xE4, 0xC8)) : new SolidColorBrush(Color.FromArgb(0x48, 0xFF, 0xFF, 0xFF));
        HeaderStateText.Text = _enabled ? "● ON" : "OFF";
        HeaderStateText.Foreground = _enabled ? mint : soft;
        MarkA.Fill = MarkB.Fill = MarkC.Fill = _enabled ? mint : new SolidColorBrush(Color.FromArgb(0x96, 0x8F, 0xA4, 0xA3));
        ToggleTrack.Background = _enabled ? new SolidColorBrush(Color.FromArgb(0xF2, 0xAD, 0xED, 0xD5)) : new SolidColorBrush(Color.FromArgb(0x54, 0xFF, 0xFF, 0xFF));
        ToggleTrack.BorderBrush = _enabled ? new SolidColorBrush(Color.FromArgb(0x8A, 0x54, 0xA9, 0x95)) : new SolidColorBrush(Color.FromArgb(0x78, 0x96, 0xB1, 0xAA));
        ToggleLabel.Text = _enabled ? "关闭团队" : "开启团队";
        ToggleLabel.Foreground = _enabled ? new SolidColorBrush(Color.FromRgb(0x12, 0x38, 0x31)) : (Brush)FindResource("TextMain");
        ToggleLabel.Margin = _enabled ? new Thickness(4, 0, 31, 0) : new Thickness(32, 0, 3, 0);
        ToggleThumb.RenderTransform = new TranslateTransform(_enabled ? 96 : 0, 0);
        ModeDescription.Text = _enabled
            ? "Sol 主控 · DSH 前端 · GPT 后端由当前 Codex 会话派发"
            : "团队分工未启用；Codex 按普通模式工作";
        if (string.IsNullOrWhiteSpace(_workspaceRoot)) ModeToggle.IsEnabled = false;
        else ModeToggle.IsEnabled = !_busy;
    }

    private void SetExpanded(bool expanded)
    {
        _expanded = expanded;
        CollapseButton.Visibility = Visibility.Visible;
        CloseButton.Visibility = expanded ? Visibility.Visible : Visibility.Collapsed;
        Chevron.Data = expanded ? Geometry.Parse("M 1,1 L 5,5 L 9,1") : Geometry.Parse("M 1,5 L 5,1 L 9,5");
        if (expanded) ExpandedPanel.Visibility = Visibility.Visible;
        var animation = new DoubleAnimation
        {
            To = expanded ? ExpandedHeight : CompactHeight,
            Duration = SystemParameters.ClientAreaAnimation ? TimeSpan.FromMilliseconds(330) : TimeSpan.Zero,
            EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut },
        };
        animation.Completed += (_, _) => { if (!expanded) ExpandedPanel.Visibility = Visibility.Collapsed; };
        BeginAnimation(HeightProperty, animation);
    }

    private static void EnableAcrylicBackdrop(IntPtr handle)
    {
        var policy = new AccentPolicy { State = 4, Flags = 2, GradientColor = unchecked((int)0x80F5EFE7), AnimationId = 0 };
        var size = Marshal.SizeOf<AccentPolicy>();
        var memory = Marshal.AllocHGlobal(size);
        try
        {
            Marshal.StructureToPtr(policy, memory, false);
            var data = new WindowCompositionAttributeData { Attribute = 19, Data = memory, SizeOfData = size };
            _ = SetWindowCompositionAttribute(handle, ref data);
        }
        finally { Marshal.FreeHGlobal(memory); }
    }

    private sealed record AgentOption(string Id, string DisplayName);
    private sealed record ModelOption(string DisplayName, string ModelId, string ProviderId, string Status, bool IsSelectable);

    [StructLayout(LayoutKind.Sequential)]
    private struct AccentPolicy { public int State; public int Flags; public int GradientColor; public int AnimationId; }

    [StructLayout(LayoutKind.Sequential)]
    private struct WindowCompositionAttributeData { public int Attribute; public IntPtr Data; public int SizeOfData; }

    [DllImport("user32.dll")]
    private static extern int SetWindowCompositionAttribute(IntPtr windowHandle, ref WindowCompositionAttributeData data);
}
