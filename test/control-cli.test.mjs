import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runControlCommand } from "../src/control-cli.mjs";

const temp = (name) => mkdtemp(path.join(tmpdir(), name));

test("control bridge toggles one workspace and probes registered agents", async () => {
  const stateRoot = await temp("control-state-");
  const workspaceRoot = await temp("control-workspace-");
  let probeCwd = null;
  const registryProbe = async (agent, options) => { probeCwd = options?.cwd ?? null; return ({ connected: true, connection: agent.connection, models: [{ id: "m1", modelId: "m1", providerId: "p1", name: "Model One", status: "supported" }], capabilities: ["text"] }); };
  await runControlCommand({ command: "set", enabled: true, workspaceRoot, stateRoot });
  const status = await runControlCommand({ command: "status", workspaceRoot, stateRoot });
  assert.equal(status.enabled, true);
  const probe = await runControlCommand({ command: "probe", agentId: "dsh", workspaceRoot, stateRoot, registryProbe });
  assert.equal(probe.connected, true);
  assert.equal(probe.models[0].modelId, "m1");
  assert.equal(probeCwd, workspaceRoot);
});

test("control bridge adds only an explicitly configured ACP agent", async () => {
  const stateRoot = await temp("control-agents-");
  const registryProbe = async (agent) => ({ connected: true, models: [{ id: "m1", modelId: "m1", providerId: "p1", name: "Model One" }], capabilities: ["text"] });
  const agent = await runControlCommand({ command: "add-agent", stateRoot, registryProbe, id: "local-agent", displayName: "Local Agent", executable: "agent.exe", args: ["--profile", "local"] });
  assert.equal(agent.id, "local-agent");
  assert.deepEqual((await runControlCommand({ command: "agents", stateRoot, registryProbe })).map((item) => item.id), ["dsh", "codex", "local-agent"]);
});

test("control bridge saves automatic and optional fixed assignment profiles", async () => {
  const stateRoot = await temp("control-profile-");
  const workspaceRoot = await temp("control-workspace-");
  const roles = {
    frontend: { agentId: "dsh", providerId: "deepseek-account", modelId: "deepseek-flash" },
    backend: { agentId: "codex", providerId: "openai", modelId: "select-per-task" },
  };
  await assert.rejects(() => runControlCommand({ command: "save-profile", workspaceRoot, stateRoot, profile: "custom", roles }), /auto or standard/);
  const automatic = await runControlCommand({ command: "save-profile", workspaceRoot, stateRoot, profile: "auto" });
  assert.equal(automatic.profile, "auto");
  const value = await runControlCommand({ command: "save-profile", workspaceRoot, stateRoot, profile: "standard" });
  assert.equal(value.profile, "standard");
  assert.deepEqual(value.roles, roles);
});

test("control bridge installs Codex MCP and backend agent from the selected project", async () => {
  const stateRoot = await temp("control-install-state-");
  const projectRoot = await temp("control-install-project-");
  let received;
  const codexInstaller = async (options) => {
    received = options;
    return { installed: true, configPath: "codex-config", agentInstalled: true };
  };
  const result = await runControlCommand({ command: "install-codex", stateRoot, projectRoot, codexInstaller });
  assert.equal(result.installed, true);
  assert.equal(received.projectRoot, projectRoot);
  assert.equal(path.basename(received.agentTemplatePath), "backend-gpt.toml");
  assert.equal(path.basename(received.skillTemplatePath), "SKILL.md");
});
