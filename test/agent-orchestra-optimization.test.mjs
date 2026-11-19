import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { AgentRegistry } from "../src/agent-registry.mjs";
import { DshAcpWorker } from "../src/dsh-acp-worker.mjs";
import { TeamProfile } from "../src/team-profile.mjs";

const temp = (name) => mkdtemp(path.join(tmpdir(), `${name}-`));

test("team profile defaults to coordinator assignment and can opt into fixed roles", async () => {
  const stateRoot = await temp("profile-state");
  const workspace = await temp("profile-workspace");
  const profile = new TeamProfile({ stateRoot, registry: {} });

  assert.deepEqual(await profile.get(workspace), { profile: "auto", roles: null, updatedAt: null });
  const automatic = await profile.save(workspace, { profile: "auto" });
  assert.equal(automatic.profile, "auto");
  assert.equal(automatic.roles, null);
  assert.ok(typeof automatic.updatedAt === "string");
  const fixed = await profile.save(workspace, {
    profile: "standard",
    roles: {
      frontend: { agentId: "dsh", providerId: "deepseek-account", modelId: "deepseek-flash" },
      backend: { agentId: "codex", providerId: "openai", modelId: "select-per-task" },
    },
  });
  assert.equal(fixed.profile, "standard");
  assert.deepEqual(fixed.roles, {
    frontend: { agentId: "dsh", providerId: "deepseek-account", modelId: "deepseek-flash" },
    backend: { agentId: "codex", providerId: "openai", modelId: "select-per-task" },
  });
  assert.equal((await profile.get(workspace)).profile, "standard");
});

test("agent discovery probes all configured ACP agents and reports their API and models", async () => {
  const calls = [];
  const registry = new AgentRegistry({
    stateRoot: await temp("agent-state"),
    probeCommand: async (agent) => {
      calls.push(agent.id);
      return {
        connected: true,
        modelApi: { type: "acp", source: "agent" },
        provider: { id: "provider-one", source: "agent" },
        models: [{ id: "model-one", modelId: "model-one", providerId: "provider-one", name: "Model One", status: "supported" }],
      };
    },
  });
  await registry.addAcpAgent({ id: "custom-agent", displayName: "Custom Agent", command: "custom-acp" });
  calls.length = 0;

  const discovered = await registry.discoverAgents({ cwd: process.cwd() });
  assert.deepEqual(calls.sort(), ["custom-agent", "dsh"]);
  assert.deepEqual(discovered.map((agent) => agent.id), ["dsh", "codex", "custom-agent"]);
  assert.equal(discovered.find((agent) => agent.id === "custom-agent").provider.id, "provider-one");
  assert.equal(discovered.find((agent) => agent.id === "custom-agent").models[0].name, "Model One");
  assert.equal(discovered.find((agent) => agent.id === "codex").availability, "session-managed");
});

test("coordinator can dispatch a verified ACP model in automatic assignment mode", async () => {
  const workspaceRoot = await temp("dispatch-workspace");
  const expectedValue = JSON.stringify(["provider-one", "model-one"]);
  let dispatchedAgent;
  let dispatchedPrompt;
  const registry = {
    getAgent: async (id) => ({ id, displayName: "Custom Agent", command: "custom-acp", args: [], verifiedModels: [{ modelId: "model-one", providerId: "provider-one" }] }),
    probeAgent: async () => ({
      connected: true,
      models: [{ modelId: "model-one", providerId: "provider-one", name: "Model One" }],
    }),
    isVerifiedAssignment: async () => true,
  };
  const worker = new DshAcpWorker({
    teamMode: { status: async () => ({ enabled: true, projectId: "project-one" }) },
    identityResolver: async () => ({ projectId: "project-one" }),
    registry,
    profiles: { get: async () => ({ profile: "auto" }) },
    clientFactory: async (options) => {
      dispatchedAgent = options.agent.id;
      return {
        initialize: async () => {},
        newSession: async () => "session-one",
        setModel: async (_session, value) => ({ value, name: "Model One" }),
        prompt: async (_session, prompt) => { dispatchedPrompt = prompt; return { stopReason: "end_turn", text: "done" }; },
        closeSession: async () => {},
        close: async () => {},
      };
    },
  });

  const task = await worker.startAgentTask({
    workspaceRoot,
    prompt: "Implement the assigned task",
    role: "backend data migration",
    agentId: "custom-agent",
    providerId: "provider-one",
    modelId: "model-one",
    allowedPaths: ["src"],
  });
  assert.equal(dispatchedAgent, "custom-agent");
  assert.equal(task.modelValue, expectedValue);
  assert.equal(task.modelName, "Model One");
  assert.equal((await worker.wait(task.taskId)).status, "completed");
  assert.match(dispatchedPrompt, /Assignment: backend data migration/);
  assert.doesNotMatch(dispatchedPrompt, /assigned frontend task/);
});

test("generic agent dispatch is refused when fixed role assignments are enabled", async () => {
  const worker = new DshAcpWorker({
    teamMode: { status: async () => ({ enabled: true, projectId: "project-one" }) },
    identityResolver: async () => ({ projectId: "project-one" }),
    registry: {},
    profiles: { get: async () => ({ profile: "standard" }) },
  });
  const workspaceRoot = await temp("fixed-workspace");
  await assert.rejects(() => worker.startAgentTask({
    workspaceRoot,
    prompt: "Do work",
    agentId: "custom-agent",
    providerId: "provider-one",
    modelId: "model-one",
  }), /automatic assignment mode/);
});

test("floating panel drags from the glass surface and keeps scrolling without visible bars", async () => {
  const xaml = await readFile(new URL("../desktop/TeamModeControl/MainWindow.xaml", import.meta.url), "utf8");
  const code = await readFile(new URL("../desktop/TeamModeControl/MainWindow.xaml.cs", import.meta.url), "utf8");
  assert.match(xaml, /x:Name="WindowShell"[^>]*PreviewMouseLeftButtonDown="WindowShell_PreviewMouseLeftButtonDown"/s);
  assert.match(xaml, /VerticalScrollBarVisibility="Hidden"/);
  assert.match(xaml, /<ScrollViewer MaxHeight="220"[^>]*VerticalScrollBarVisibility="Hidden"/);
  assert.match(xaml, /IsChecked="False"[^>]*Click="AssignmentMode_Click"/);
  assert.match(code, /TextBoxBase/);
  assert.match(code, /RectangleGeometry\(new Rect\(0, 0, bounds.Width, bounds.Height\), 31, 31\)/);
  assert.match(code, /"discover"/);
  assert.ok(code.includes("_agentDiscovery.TryGetValue(selected.Id"));
  assert.doesNotMatch(code, /EnableAcrylicBackdrop\(handle\)/);
});







