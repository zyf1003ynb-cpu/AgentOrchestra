import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const code = await readFile(new URL("../desktop/TeamModeControl/MainWindow.xaml.cs", import.meta.url), "utf8");

test("agent summary stays short enough for the compact status row", () => {
  assert.ok(code.includes('AgentSummary.Text = $"Agent {agentOptions.Count} · ACP 在线 {connected} · 模型 {modelCount}"'));
});
