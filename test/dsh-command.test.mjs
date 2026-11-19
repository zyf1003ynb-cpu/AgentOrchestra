import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getDshAcpCommand } from "../src/dsh-command.mjs";

test("DSH command uses a supplied executable path when configured", () => {
  assert.equal(getDshAcpCommand({ SOL_DSH_ACP_COMMAND: "  C:\\Tools\\dsh.cmd  " }, "win32"), "C:\\Tools\\dsh.cmd");
});

test("DSH command falls back to the platform command name", () => {
  assert.equal(getDshAcpCommand({}, "win32"), "dsh.cmd");
  assert.equal(getDshAcpCommand({}, "linux"), "dsh");
});

test("DSH command resolves a registered Windows installation when available", { skip: process.platform !== "win32" }, (context) => {
  if (process.env.SOL_DSH_ACP_COMMAND?.trim()) return;
  const command = getDshAcpCommand();
  if (command === "dsh.cmd") return context.skip("No registered DeepSeek Harness installation was found.");
  assert.equal(command.endsWith("resources\\runtime\\cli\\bin\\dsh.cmd"), true);
  assert.equal(fs.existsSync(command), true);
});
