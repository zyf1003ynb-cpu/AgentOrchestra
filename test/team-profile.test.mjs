import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { TeamProfile } from "../src/team-profile.mjs";

const temp = (name) => mkdtemp(path.join(tmpdir(), `${name}-`));
const registry = { isVerifiedAssignment: async () => false };
const standardRoles = {
  frontend: { agentId: "dsh", providerId: "deepseek-account", modelId: "deepseek-flash" },
  backend: { agentId: "codex", providerId: "openai", modelId: "select-per-task" },
};

test("automatic profile is the default and fixed roles remain optional", async () => {
  const root = await temp("profile-state");
  const workspace = await temp("profile-workspace");
  const profile = new TeamProfile({ stateRoot: root, registry });
  assert.deepEqual(await profile.get(workspace), { profile: "auto", roles: null, updatedAt: null });
  const automatic = await profile.save(workspace, { profile: "auto" });
  assert.equal(automatic.profile, "auto");
  assert.equal(automatic.roles, null);
  assert.equal((await profile.get(workspace)).profile, "auto");
  const fixed = await profile.save(workspace, { profile: "standard", roles: standardRoles });
  assert.equal(fixed.profile, "standard");
  assert.deepEqual(fixed.roles, standardRoles);
  assert.deepEqual((await profile.get(workspace)).roles, standardRoles);
});

test("fixed profile uses the approved role map when saved from the panel toggle", async () => {
  const root = await temp("profile-state");
  const workspace = await temp("profile-workspace");
  const profile = new TeamProfile({ stateRoot: root, registry });
  const fixed = await profile.save(workspace, { profile: "standard" });
  assert.deepEqual(fixed.roles, standardRoles);
  assert.deepEqual((await profile.get(workspace)).roles, standardRoles);
});

test("profile rejects changed fixed mappings and unknown mode names", async () => {
  const root = await temp("profile-state");
  const workspace = await temp("profile-workspace");
  const profile = new TeamProfile({ stateRoot: root, registry });
  await assert.rejects(() => profile.save(workspace, { profile: "standard", roles: { ...standardRoles, frontend: { agentId: "codex", providerId: "openai", modelId: "gpt-custom" } } }), /roles are fixed/);
  await assert.rejects(() => profile.save(workspace, { profile: "custom", roles: standardRoles }), /profile must be auto or standard/);
  assert.deepEqual(await profile.get(workspace), { profile: "auto", roles: null, updatedAt: null });
});

test("team profile stays inside the selected workspace identity", async () => {
  const root = await temp("profile-state");
  const first = await temp("profile-first");
  const second = await temp("profile-second");
  const profile = new TeamProfile({ stateRoot: root, registry });
  await profile.save(first, { profile: "standard", roles: standardRoles });
  assert.ok(await readFile(path.join(root, "projects", (await import("node:crypto")).default.createHash("sha256").update(`directory:${first.toLowerCase()}`).digest("hex"), "team-profile.json"), "utf8"));
  assert.equal((await profile.get(second)).updatedAt, null);
});
