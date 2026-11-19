import test from "node:test";
import assert from "node:assert/strict";
import { DshAcpWorker } from "../src/dsh-acp-worker.mjs";

test("frontend task requires team mode and verifies the exact DeepSeek model", async () => {
  const events = [];
  const worker = new DshAcpWorker({
    teamMode: { status: async () => ({ enabled: true, projectId: "p" }) },
    identityResolver: async () => ({ projectId: "p" }),
    clientFactory: async () => ({
      initialize: async () => {}, newSession: async () => "session-1",
      setModel: async () => ({ value: '["deepseek-account","deepseek-flash"]', name: "DeepSeek-V41-Flash" }),
      prompt: async () => ({ stopReason: "end_turn", text: "done" }),
      close: async () => {}, cancel: async () => ({ stopReason: "cancelled" }),
    }),
    onEvent: (event) => events.push(event),
  });
  const task = await worker.startFrontendTask({ workspaceRoot: "C:\\project", prompt: "build UI", allowedPaths: ["src"] });
  const result = await worker.wait(task.taskId);
  assert.equal(result.status, "completed");
  assert.equal(result.modelName, "DeepSeek-V41-Flash");
  assert.equal(events.at(-1).status, "completed");
});

test("frontend task fails closed when mode is off or model readback differs", async () => {
  const off = new DshAcpWorker({ teamMode: { status: async () => ({ enabled: false }) } });
  await assert.rejects(() => off.startFrontendTask({ workspaceRoot: "C:\\project", prompt: "x" }), /team mode is off/);
  const mismatch = new DshAcpWorker({
    teamMode: { status: async () => ({ enabled: true }) },
    identityResolver: async () => ({ projectId: "p" }),
    clientFactory: async () => ({ initialize: async () => {}, newSession: async () => "s", setModel: async () => ({ value: "wrong", name: "Wrong" }), close: async () => {} }),
  });
  await assert.rejects(() => mismatch.startFrontendTask({ workspaceRoot: "C:\\project", prompt: "x" }), /did not read back the exact DeepSeek-V41-Flash model/);
});

test("cancellation is reported only after the ACP worker confirms cancelled", async () => {
  let cancelCalled = false; let finishPrompt;
  const worker = new DshAcpWorker({
    teamMode: { status: async () => ({ enabled: true }) }, identityResolver: async () => ({ projectId: "p" }),
    clientFactory: async () => ({
      initialize: async () => {}, newSession: async () => "s", setModel: async () => ({ value: '["deepseek-account","deepseek-flash"]', name: "DeepSeek-V41-Flash" }),
      prompt: () => new Promise((resolve) => { finishPrompt = resolve; }), close: async () => {}, cancel: async () => { cancelCalled = true; finishPrompt({ stopReason: "cancelled" }); },
    }),
  });
  const task = await worker.startFrontendTask({ workspaceRoot: "C:\\project", prompt: "long" });
  const cancelled = await worker.cancelTeamTask({ workspaceRoot: "C:\\project", taskId: task.taskId });
  assert.equal(cancelCalled, true);
  assert.equal(cancelled.status, "cancelled");
});

test("cancellation waits for ACP prompt completion before reporting success", async () => {
  let finishPrompt; let cancelFinished = false; let closeSessionCalls = 0;
  const worker = new DshAcpWorker({
    teamMode: { status: async () => ({ enabled: true }) }, identityResolver: async () => ({ projectId: "p" }),
    clientFactory: async () => ({
      initialize: async () => {}, newSession: async () => "s",
      setModel: async () => ({ value: '["deepseek-account","deepseek-flash"]', name: "DeepSeek-V41-Flash" }),
      prompt: () => new Promise((resolve) => { finishPrompt = resolve; }), cancel: async () => {},
      closeSession: async () => { closeSessionCalls += 1; }, close: async () => {},
    }),
  });
  const task = await worker.startFrontendTask({ workspaceRoot: "C:\\project", prompt: "long" });
  const cancellation = worker.cancelTeamTask({ workspaceRoot: "C:\\project", taskId: task.taskId }).then((value) => { cancelFinished = true; return value; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cancelFinished, false);
  assert.equal(closeSessionCalls, 0);
  finishPrompt({ stopReason: "cancelled" });
  const result = await cancellation;
  assert.equal(result.status, "cancelled");
  assert.equal(closeSessionCalls, 1);
});

test("frontend worker cancels its active ACP session when another process switches the project off", async () => {
  let enabled = true; let finishPrompt; let cancelCalled = false;
  const worker = new DshAcpWorker({
    teamMode: { status: async () => ({ enabled }) }, identityResolver: async () => ({ projectId: "p" }),
    clientFactory: async () => ({
      initialize: async () => {}, newSession: async () => "s",
      setModel: async () => ({ value: '["deepseek-account","deepseek-flash"]', name: "DeepSeek-V41-Flash" }),
      prompt: () => new Promise((resolve) => { finishPrompt = resolve; }),
      cancel: () => { cancelCalled = true; finishPrompt({ stopReason: "cancelled" }); },
      closeSession: async () => {}, close: async () => {},
    }),
  });
  const task = await worker.startFrontendTask({ workspaceRoot: "C:\\project", prompt: "long" });
  enabled = false;
  for (let attempt = 0; attempt < 80 && !cancelCalled; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(cancelCalled, true);
  assert.equal((await worker.getTeamTask({ workspaceRoot: "C:\\project", taskId: task.taskId })).status, "cancelled");
});
