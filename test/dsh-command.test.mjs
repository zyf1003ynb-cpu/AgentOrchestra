import test from "node:test";
import assert from "node:assert/strict";
import { getDshAcpCommand } from "../src/dsh-command.mjs";

test("DSH command uses a supplied executable path when configured", () => {
  assert.equal(getDshAcpCommand({ SOL_DSH_ACP_COMMAND: "  C:\\Tools\\dsh.cmd  " }, "win32"), "C:\\Tools\\dsh.cmd");
});

test("DSH command falls back to the platform command name", () => {
  assert.equal(getDshAcpCommand({}, "win32"), "dsh.cmd");
  assert.equal(getDshAcpCommand({}, "linux"), "dsh");
});
