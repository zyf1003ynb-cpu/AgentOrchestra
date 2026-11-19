import { execFileSync } from "node:child_process";
import path from "node:path";

function findInstalledDshCommand() {
  if (process.platform !== "win32") return null;
  const powershell = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const script = [
    "$roots = @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall')",
    "foreach ($root in $roots) {",
    "  if (-not (Test-Path -LiteralPath $root)) { continue }",
    "  foreach ($entry in Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue) {",
    "    $app = Get-ItemProperty -LiteralPath $entry.PSPath -ErrorAction SilentlyContinue",
    "    if ($app.DisplayName -notlike 'DeepSeek Harness*') { continue }",
    "    $location = [string]$app.InstallLocation",
    "    if ([string]::IsNullOrWhiteSpace($location) -and $app.DisplayIcon) { $location = Split-Path -Parent ([string]$app.DisplayIcon).Split(',')[0] }",
    "    if ([string]::IsNullOrWhiteSpace($location)) { continue }",
    "    $candidate = Join-Path $location 'resources\\runtime\\cli\\bin\\dsh.cmd'",
    "    if (Test-Path -LiteralPath $candidate -PathType Leaf) { [Console]::Out.Write($candidate); exit 0 }",
    "  }",
    "}",
  ].join("\n");
  try {
    const output = execFileSync(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
      encoding: "utf8", timeout: 5000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return output || null;
  } catch { return null; }
}

export function getDshAcpCommand(env = process.env, platform = process.platform) {
  const configured = env.SOL_DSH_ACP_COMMAND?.trim();
  if (configured) return configured;
  if (platform === "win32") {
    if (env === process.env) return findInstalledDshCommand() ?? "dsh.cmd";
    return "dsh.cmd";
  }
  return "dsh";
}
