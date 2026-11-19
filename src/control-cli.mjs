import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { AgentRegistry } from "./agent-registry.mjs";
import { TeamMode } from "./team-mode.mjs";
import { TeamProfile } from "./team-profile.mjs";
import { StateStore } from "./state-store.mjs";
import { installCodexMcp } from "../scripts/install-codex.mjs";

export async function runControlCommand({ command, workspaceRoot, projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), stateRoot, enabled, agentId, id, displayName, executable, args = [], modelId, providerId, profile, roles, registryProbe, modelVerifier, codexInstaller = installCodexMcp } = {}) {
  if (!stateRoot) throw new Error("state-root is required");
  if (["status", "set", "configuration", "save-profile", "discover"].includes(command) && !workspaceRoot) throw new Error("workspace is required");
  const mode = new TeamMode({ stateStore: new StateStore(stateRoot) });
  const registry = new AgentRegistry({ stateRoot, probeCommand: registryProbe, verifyCommand: modelVerifier });
  const profiles = new TeamProfile({ stateRoot, registry });
  if (command === "status") return mode.status(workspaceRoot);
  if (command === "set") return mode.set(workspaceRoot, enabled === true);
  if (command === "agents") return registry.listAgents();
  if (command === "discover") return registry.discoverAgents({ cwd: workspaceRoot ?? process.cwd() });
  if (command === "probe") {
    if (!agentId) throw new Error("agent-id is required");
    return registry.probeAgent(agentId, { cwd: workspaceRoot ?? process.cwd() });
  }
  if (command === "verify-model") {
    if (!agentId || !modelId || !providerId) throw new Error("agent-id, model-id and provider-id are required");
    return registry.verifyAgentModel(agentId, modelId, providerId, { cwd: workspaceRoot ?? process.cwd() });
  }
  if (command === "add-agent") return registry.addAcpAgent({ id, displayName, command: executable, args, cwd: workspaceRoot ?? process.cwd() });
  if (command === "configuration") return profiles.get(workspaceRoot);
  if (command === "install-codex") return codexInstaller({ projectRoot, agentTemplatePath: path.join(projectRoot, "templates", "codex", "agents", "backend-gpt.toml"), skillTemplatePath: path.join(projectRoot, "templates", "codex", "skills", "sol-team-mode", "SKILL.md") });
  if (command === "save-profile") return profiles.save(workspaceRoot, { profile, roles });
  throw new Error("Unknown command: " + command);
}

function parseArguments(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item.startsWith("--")) parsed[item.slice(2)] = argv[++index];
    else if (!parsed.command) parsed.command = item;
  }
  return parsed;
}

function parseJson(value, name, fallback) {
  if (value === undefined) return fallback;
  try { return JSON.parse(value); } catch { throw new Error(name + " must be valid JSON"); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const parsed = parseArguments(process.argv.slice(2));
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const stateRoot = path.resolve(parsed["state-root"] ?? path.join(sourceRoot, "state"));
  const workspaceRoot = path.resolve(parsed.workspace ?? process.cwd());
  try {
    const value = await runControlCommand({
      command: parsed.command, workspaceRoot, stateRoot, enabled: parsed.enabled === "true",
      agentId: parsed["agent-id"], id: parsed.id, displayName: parsed.name, executable: parsed.executable,
      args: parseJson(parsed["args-json"], "args-json", []), modelId: parsed["model-id"], providerId: parsed["provider-id"],
      profile: parsed.profile, roles: parseJson(parsed.roles, "roles", undefined),
    });
    process.stdout.write(JSON.stringify({ ok: true, value }) + "\n");
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }) + "\n");
    process.exitCode = 1;
  }
}
