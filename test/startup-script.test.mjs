import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const startupScript = await readFile(new URL("../scripts/start-panel.ps1", import.meta.url), "utf8");

test("double-click startup rebuilds the panel when project sources changed", () => {
  assert.match(startupScript, /LastWriteTimeUtc/);
  assert.match(startupScript, /desktop\\TeamModeControl/);
  assert.match(startupScript, /templates\\codex/);
  assert.match(startupScript, /src/);
});
