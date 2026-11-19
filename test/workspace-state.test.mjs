import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { resolveWorkspaceIdentity } from "../src/workspace-identity.mjs";
import { StateStore } from "../src/state-store.mjs";

async function tempWorkspace(name) {
  return mkdtemp(path.join(tmpdir(), `${name}-`));
}

test("non-git workspace identity is stable and state defaults to off", async () => {
  const workspaceRoot = await tempWorkspace("team-state");
  const stateRoot = await tempWorkspace("team-state-storage");
  const identity = await resolveWorkspaceIdentity(workspaceRoot, {
    gitCommonDirResolver: async () => null,
  });
  const store = new StateStore(stateRoot);

  assert.equal(identity.kind, "directory");
  assert.equal(identity.workspaceRoot, path.resolve(workspaceRoot));
  assert.equal((await store.readTeamMode(identity)).enabled, false);
});

test("team mode persists by project identity and rejects invalid values", async () => {
  const workspaceRoot = await tempWorkspace("team-state");
  const otherRoot = await tempWorkspace("team-state");
  const stateRoot = await tempWorkspace("team-state-storage");
  const identity = await resolveWorkspaceIdentity(workspaceRoot, {
    gitCommonDirResolver: async () => null,
  });
  const otherIdentity = await resolveWorkspaceIdentity(otherRoot, {
    gitCommonDirResolver: async () => null,
  });
  const store = new StateStore(stateRoot);

  await store.writeTeamMode(identity, true);
  assert.equal((await store.readTeamMode(identity)).enabled, true);
  assert.equal((await store.readTeamMode(otherIdentity)).enabled, false);
  await assert.rejects(() => store.writeTeamMode(identity, "true"), /enabled must be boolean/);
});

test("corrupt state fails closed", async () => {
  const workspaceRoot = await tempWorkspace("team-state");
  const stateRoot = await tempWorkspace("team-state-storage");
  const identity = await resolveWorkspaceIdentity(workspaceRoot, {
    gitCommonDirResolver: async () => null,
  });
  const store = new StateStore(stateRoot);
  await mkdir(path.dirname(store.teamModePath(identity)), { recursive: true });
  await writeFile(store.teamModePath(identity), "{broken", "utf8");

  assert.equal((await store.readTeamMode(identity)).enabled, false);
});
