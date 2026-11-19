import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const code = await readFile(new URL("../desktop/TeamModeControl/MainWindow.xaml.cs", import.meta.url), "utf8");

test("the project panel explains automatic versus fixed assignment accurately", () => {
  const updateMode = code.match(/private void UpdateModeVisual\(\)[\s\S]*?\n    }/)?.[0] ?? "";
  const refreshProfile = code.match(/private async Task RefreshProfileAsync\(\)[\s\S]*?\n    }/)?.[0] ?? "";
  assert.match(updateMode, /FixedAssignmentToggle.IsChecked == true/);
  assert.match(updateMode, /自动选择可用 Agent 与模型/);
  assert.match(updateMode, /DeepSeek V4\.1 Flash · GPT/);
  assert.match(refreshProfile, /UpdateModeVisual\(\)/);
  const toggleMode = code.match(/private async void ModeToggle_Click\([\s\S]*?\n    }/)?.[0] ?? "";
  assert.match(toggleMode, /FixedAssignmentToggle\.IsChecked == true/);
  assert.match(toggleMode, /固定分工/);
  assert.match(toggleMode, /Sol 自主分配/);
  const runBusy = code.match(/private async Task RunBusyAsync\([\s\S]*?\n    }/)?.[0] ?? "";
  assert.match(runBusy, /_busy = true;\s+UpdateAssignmentVisual\(\);/);
  assert.match(runBusy, /_busy = false;\s+UpdateAssignmentVisual\(\);/);
});
