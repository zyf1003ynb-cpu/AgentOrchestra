import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const code = await readFile(new URL("../desktop/TeamModeControl/MainWindow.xaml.cs", import.meta.url), "utf8");

test("agent summary stays short enough for the compact status row", () => {
  assert.ok(/AgentSummary\.Text = customCount == 0\s*\? "2 个内置 Agent · DSH：ACP · Codex：GPT"/.test(code), "summary should fit on one short status line");
});
