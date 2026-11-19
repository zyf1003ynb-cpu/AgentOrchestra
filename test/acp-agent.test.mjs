import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { probeAcpAgent, verifyAcpModel } from "../src/adapters/acp-agent.mjs";

const fake = fileURLToPath(new URL("../scripts/fixtures/fake-acp-agent.mjs", import.meta.url));
const agent = { id: "fake", displayName: "Fake", command: process.execPath, args: [fake], connection: { protocol: "acp", transport: "stdio" } };

test("ACP probe reads the models actually advertised by the agent", async () => {
  const result = await probeAcpAgent(agent, { cwd: path.resolve(".") });
  assert.equal(result.connected, true);
  assert.equal(result.connection.protocol, "acp");
  assert.ok(result.models.some((model) => model.modelId === "deepseek-flash" && model.providerId === "deepseek-account"));
  assert.equal(result.models[0].status, "supported");
});

test("ACP verification sets and reads back the selected model and sends a no-write ping", async () => {
  const result = await verifyAcpModel(agent, { providerId: "deepseek-account", modelId: "deepseek-flash", cwd: path.resolve(".") });
  assert.equal(result.verified, true);
  assert.equal(result.modelName, "DeepSeek-V41-Flash");
  assert.equal(result.ping, "ACP_FAKE_OK");
});

test("ACP cancellation is sent as a notification without a reply", async () => {
  const { AcpSession } = await import("../src/adapters/acp-agent.mjs");
  const session = new AcpSession(agent, { cwd: path.resolve(".") });
  try {
    await session.initialize();
    await session.newSession();
    assert.equal(await session.cancel("fake-session"), undefined);
  } finally {
    await session.close();
  }
});
