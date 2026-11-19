import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { TeamProfile } from "../src/team-profile.mjs";

const temp = (name) => mkdtemp(path.join(tmpdir(), `${name}-`));

const registry = { isVerifiedAssignment: async () => false };

test("standard profile keeps the approved fixed frontend and task-selected Codex GPT backend", async () => {
  const root = await temp("profile-state");
  const workspace = await temp("profile-workspace");
  const profile = new TeamProfile({ stateRoot: root, registry });
  const initial = await profile.get(workspace);
  assert.equal(initial.profile, "standard");
  assert.deepEqual(initial.roles.frontend, { agentId: "dsh", providerId: "deepseek-account", modelId: "deepseek-flash" });
  assert.deepEqual(initial.roles.backend, { agentId: "codex", providerId: "openai", modelId: "select-per-task" });
  const saved = await profile.save(workspace, initial);
  assert.deepEqual(saved.roles, initial.roles);
  assert.deepEqual((await profile.get(workspace)).roles, initial.roles);
});

test("standard profile rejects changed role mappings and refuses custom mode", async () => {
  const root = await temp("profile-state");
  const workspace = await temp("profile-workspace");
  const profile = new TeamProfile({ stateRoot: root, registry });
  const initial = await profile.get(workspace);
  await assert.rejects(() => profile.save(workspace, { ...initial, roles: { ...initial.roles, frontend: { agentId: "codex", providerId: "openai", modelId: "gpt-custom" } } }), /roles are fixed/);
  await assert.rejects(() => profile.save(workspace, { ...initial, profile: "custom" }), /standard team/);
  assert.equal((await profile.get(workspace)).updatedAt, null);
});

test("standard role mapping stays inside the selected workspace identity", async () => {
  const root = await temp("profile-state");
  const first = await temp("profile-first");
  const second = await temp("profile-second");
  const profile = new TeamProfile({ stateRoot: root, registry });
  const initial = await profile.get(first);
  await profile.save(first, initial);
  assert.ok(await readFile(path.join(root, "projects", (await import("node:crypto")).default.createHash("sha256").update(`directory:${first.toLowerCase()}`).digest("hex"), "team-profile.json"), "utf8"));
  assert.equal((await profile.get(second)).updatedAt, null);
});
