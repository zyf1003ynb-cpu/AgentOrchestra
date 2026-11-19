import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { resolveWorkspaceIdentity } from "../src/workspace-identity.mjs";
import { StateStore } from "../src/state-store.mjs";
import { TeamMode } from "../src/team-mode.mjs";

async function tempWorkspace(name) {
  return mkdtemp(path.join(tmpdir(), `${name}-`));
}

test("linked worktrees sharing a git common dir share one team mode", async () => {
  const workspace = await tempWorkspace("team-git");
  const linked = await tempWorkspace("team-linked");
  const stateRoot = await tempWorkspace("team-storage");
  const commonDir = path.join(workspace, ".git");
  const resolver = async () => commonDir;
  const first = await resolveWorkspaceIdentity(workspace, { gitCommonDirResolver: resolver });
  const second = await resolveWorkspaceIdentity(linked, { gitCommonDirResolver: resolver });
  const store = new StateStore(stateRoot);
  const mode = new TeamMode({ stateStore: store, identityResolver: async (root) =>
    resolveWorkspaceIdentity(root, { gitCommonDirResolver: resolver }) });

  assert.equal(first.projectId, second.projectId);
  await mode.set(linked, true);
  assert.equal((await mode.status(workspace)).enabled, true);
});

test("identity metadata rejects a state file moved to another project", async () => {
  const workspace = await tempWorkspace("team-identity");
  const other = await tempWorkspace("team-identity");
  const stateRoot = await tempWorkspace("team-storage");
  const identity = await resolveWorkspaceIdentity(workspace, { gitCommonDirResolver: async () => null });
  const otherIdentity = await resolveWorkspaceIdentity(other, { gitCommonDirResolver: async () => null });
  const store = new StateStore(stateRoot);
  await mkdir(path.dirname(store.teamModePath(otherIdentity)), { recursive: true });
  await writeFile(store.teamModePath(otherIdentity), JSON.stringify({
    enabled: true,
    projectId: identity.projectId,
    updatedAt: new Date().toISOString(),
  }), "utf8");

  assert.equal((await store.readTeamMode(otherIdentity)).enabled, false);
});
