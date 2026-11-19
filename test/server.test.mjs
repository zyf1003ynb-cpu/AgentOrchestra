import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";

import { createMcpServer } from "../src/server.mjs";

async function tempWorkspace(name) {
  return mkdtemp(path.join(tmpdir(), `${name}-`));
}

test("MCP exposes project-scoped team mode tools and preserves state", async () => {
  const stateRoot = await tempWorkspace("mcp-state");
  const workspaceRoot = await tempWorkspace("mcp-workspace");
  const server = createMcpServer({ stateRoot, gitCommonDirResolver: async () => null });

  const listed = await server.handle({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
  assert.deepEqual(listed.result.tools.map((tool) => tool.name).slice(0, 2), ["team_mode_status", "set_team_mode"]);

  const on = await server.handle({
    jsonrpc: "2.0", id: 2, method: "tools/call",
    params: { name: "set_team_mode", arguments: { workspace_root: workspaceRoot, enabled: true } },
  });
  assert.equal(JSON.parse(on.result.content[0].text).enabled, true);

  const status = await server.handle({
    jsonrpc: "2.0", id: 3, method: "tools/call",
    params: { name: "team_mode_status", arguments: { workspace_root: workspaceRoot } },
  });
  assert.equal(JSON.parse(status.result.content[0].text).enabled, true);
});

test("MCP rejects malformed team mode requests without enabling it", async () => {
  const stateRoot = await tempWorkspace("mcp-state");
  const server = createMcpServer({ stateRoot, gitCommonDirResolver: async () => null });
  const result = await server.handle({
    jsonrpc: "2.0", id: 4, method: "tools/call",
    params: { name: "set_team_mode", arguments: { workspace_root: "", enabled: "true" } },
  });
  assert.equal(result.error.code, -32602);
});

test("stdio entrypoint responds when launched from a workspace path containing spaces", async () => {
  const stateRoot = await tempWorkspace("mcp-state");
  const serverPath = fileURLToPath(new URL("../src/server.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [serverPath], {
    env: { ...process.env, SOL_TEAM_STATE_ROOT: stateRoot },
    input: '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n',
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  const responses = result.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.deepEqual(responses.map((response) => response.id), [1, 2]);
  assert.deepEqual(responses[1].result.tools.map((tool) => tool.name).slice(0, 2), ["team_mode_status", "set_team_mode"]);
});

test("MCP exposes agent inventory and project team configuration", async () => {
  const stateRoot = await tempWorkspace("mcp-state");
  const workspaceRoot = await tempWorkspace("mcp-workspace");
  const server = createMcpServer({ stateRoot, gitCommonDirResolver: async () => null, registryProbe: async () => ({}) });
  const listed = await server.handle({ jsonrpc: "2.0", id: 5, method: "tools/list", params: {} });
  assert.ok(listed.result.tools.some((tool) => tool.name === "list_agents"));
  const profileTool = listed.result.tools.find((tool) => tool.name === "save_team_profile");
  assert.deepEqual(profileTool.inputSchema.properties.profile.enum, ["auto", "standard"]);
  const dispatchTool = listed.result.tools.find((tool) => tool.name === "submit_agent_task");
  assert.equal(dispatchTool.inputSchema.properties.role.type, "string");
  assert.ok(listed.result.tools.some((tool) => tool.name === "discover_agents"));
  const agents = await server.handle({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "list_agents", arguments: {} } });
  assert.deepEqual(JSON.parse(agents.result.content[0].text).map((agent) => agent.id), ["dsh", "codex"]);
  const config = await server.handle({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "team_configuration", arguments: { workspace_root: workspaceRoot } } });
  const value = JSON.parse(config.result.content[0].text);
  assert.equal(value.profile, "auto");
  assert.equal(value.roles, null);
  const fixed = await server.handle({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "save_team_profile", arguments: { workspace_root: workspaceRoot, profile: "standard" } } });
  assert.equal(JSON.parse(fixed.result.content[0].text).roles.frontend.agentId, "dsh");
  const rejected = await server.handle({
    jsonrpc: "2.0", id: 9, method: "tools/call",
    params: { name: "save_team_profile", arguments: { workspace_root: workspaceRoot, profile: "custom", roles: value.roles } },
  });
  assert.equal(rejected.error.code, -32602);
});



test("MCP exposes the real DSH task lifecycle and cancels project work when team mode is switched off", async () => {
  const stateRoot = await tempWorkspace("mcp-state");
  const workspaceRoot = await tempWorkspace("mcp-workspace");
  let finishPrompt; let cancelNotified = false;
  const server = createMcpServer({
    stateRoot, gitCommonDirResolver: async () => null,
    dshClientFactory: async () => ({
      initialize: async () => {}, newSession: async () => "session-1",
      setModel: async () => ({ value: '["deepseek-account","deepseek-flash"]', name: "DeepSeek-V41-Flash" }),
      prompt: () => new Promise((resolve) => { finishPrompt = resolve; }),
      cancel: () => { cancelNotified = true; finishPrompt({ stopReason: "cancelled" }); },
      closeSession: async () => {}, close: async () => {},
    }),
  });
  const call = (id, name, args) => server.handle({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
  await call(1, "set_team_mode", { workspace_root: workspaceRoot, enabled: true });
  await call(2, "save_team_profile", { workspace_root: workspaceRoot, profile: "standard" });
  const started = await call(3, "submit_frontend_task", { workspace_root: workspaceRoot, prompt: "implement the dashboard", allowed_paths: ["src"] });
  const task = JSON.parse(started.result.content[0].text);
  assert.equal(task.status, "running");
  const status = await call(4, "get_team_task", { workspace_root: workspaceRoot, task_id: task.taskId });
  assert.equal(JSON.parse(status.result.content[0].text).modelName, "DeepSeek-V41-Flash");
  await call(5, "set_team_mode", { workspace_root: workspaceRoot, enabled: false });
  const result = await call(6, "get_team_task", { workspace_root: workspaceRoot, task_id: task.taskId });
  assert.equal(cancelNotified, true);
  assert.equal(JSON.parse(result.result.content[0].text).status, "cancelled");
});
