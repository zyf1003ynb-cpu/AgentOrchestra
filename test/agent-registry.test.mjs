import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { AgentRegistry } from "../src/agent-registry.mjs";

const temp = (name) => mkdtemp(path.join(tmpdir(), `${name}-`));

test("registry exposes only built-ins and explicitly added ACP agents", async () => {
  const root = await temp("agents");
  const registry = new AgentRegistry({ stateRoot: root, probeCommand: async () => ({
    protocol: "acp",
    connection: "stdio",
    modelApi: { type: "unknown", source: "unknown" },
    provider: { id: "fake", source: "agent" },
    models: [{ id: "fake-model", name: "Fake Model", status: "verified", capabilities: ["text"] }],
    capabilities: ["text", "file_read", "file_write", "cancel"],
    auth: "unknown",
  }) });
  assert.deepEqual((await registry.listAgents()).map((agent) => agent.id), ["dsh", "codex"]);
  await registry.addAcpAgent({ id: "fake", displayName: "Fake ACP", command: "fake-agent", args: [] });
  assert.deepEqual((await registry.listAgents()).map((agent) => agent.id), ["dsh", "codex", "fake"]);
  const probe = await registry.probeAgent("fake");
  assert.equal(probe.models[0].status, "verified");
  assert.equal(probe.credentials, undefined);
});

test("registry rejects credentials and invalid ACP commands", async () => {
  const root = await temp("agents");
  const registry = new AgentRegistry({ stateRoot: root, probeCommand: async () => { throw new Error("not reachable"); } });
  await assert.rejects(() => registry.addAcpAgent({ id: "bad", displayName: "Bad", command: "fake", args: ["--api-key=secret"] }), /credential-like/);
  await assert.rejects(() => registry.addAcpAgent({ id: "bad", displayName: "Bad", command: "fake", args: [] }), /handshake failed/);
});

test("registry can re-verify the built-in DSH model from its live ACP handshake", async () => {
  const root = await temp("agents");
  let verifyCalls = 0;
  const registry = new AgentRegistry({
    stateRoot: root,
    probeCommand: async () => ({ connected: true, models: [{ id: "deepseek-flash", modelId: "deepseek-flash", providerId: "deepseek-account", name: "DeepSeek-V41-Flash" }] }),
    verifyCommand: async (_agent, selection) => { verifyCalls += 1; return { verified: selection.modelId === "deepseek-flash", modelName: "DeepSeek-V41-Flash", ping: "ACP_FAKE_OK" }; },
  });
  const result = await registry.verifyAgentModel("dsh", "deepseek-flash", "deepseek-account");
  assert.equal(result.verified, true);
  assert.equal(verifyCalls, 1);
});

test("built-in DSH model verification survives a control-panel process restart", async () => {
  const root = await temp("agents");
  const probeCommand = async () => ({ connected: true, models: [{ id: "deepseek-flash", modelId: "deepseek-flash", providerId: "deepseek-account", name: "DeepSeek-V41-Flash" }] });
  const verifyCommand = async () => ({ verified: true, modelName: "DeepSeek-V41-Flash" });
  const first = new AgentRegistry({ stateRoot: root, probeCommand, verifyCommand });
  await first.verifyAgentModel("dsh", "deepseek-flash", "deepseek-account");
  const restarted = new AgentRegistry({ stateRoot: root, probeCommand, verifyCommand });
  const dsh = await restarted.getAgent("dsh");
  assert.equal(dsh.verifiedModels.some((item) => item.providerId === "deepseek-account" && item.modelId === "deepseek-flash"), true);
});
