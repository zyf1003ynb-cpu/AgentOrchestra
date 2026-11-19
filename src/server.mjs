import { createInterface } from "node:readline";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { StateStore } from "./state-store.mjs";
import { TeamMode } from "./team-mode.mjs";
import { resolveWorkspaceIdentity } from "./workspace-identity.mjs";
import { AgentRegistry } from "./agent-registry.mjs";
import { TeamProfile } from "./team-profile.mjs";
import { DshAcpWorker } from "./dsh-acp-worker.mjs";

const TOOL_DEFINITIONS = [
  {
    name: "team_mode_status", description: "Read the team-mode state for one existing workspace.",
    inputSchema: { type: "object", properties: { workspace_root: { type: "string" } }, required: ["workspace_root"], additionalProperties: false },
  },
  {
    name: "set_team_mode", description: "Enable or disable team routing for one workspace.",
    inputSchema: { type: "object", properties: { workspace_root: { type: "string" }, enabled: { type: "boolean" } }, required: ["workspace_root", "enabled"], additionalProperties: false },
  },
  {
    name: "list_agents", description: "List built-in and explicitly registered agents without reading credentials.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "discover_agents", description: "Probe built-in and explicitly registered ACP agents and report their advertised providers, APIs, models, and capabilities.",
    inputSchema: { type: "object", properties: { workspace_root: { type: "string" } }, required: ["workspace_root"], additionalProperties: false },
  },
  {
    name: "probe_agent", description: "Probe one registered agent and return its reported models and capabilities.",
    inputSchema: { type: "object", properties: { agent_id: { type: "string" } }, required: ["agent_id"], additionalProperties: false },
  },
  {
    name: "verify_agent_model", description: "Verify one model advertised by a registered ACP agent, including a no-write prompt.",
    inputSchema: { type: "object", properties: { agent_id: { type: "string" }, model_id: { type: "string" }, provider_id: { type: "string" } }, required: ["agent_id", "model_id", "provider_id"], additionalProperties: false },
  },
  {
    name: "add_acp_agent", description: "Add one explicitly selected ACP stdio agent without scanning or launching other local programs.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, display_name: { type: "string" }, command: { type: "string" }, args: { type: "array", items: { type: "string" } }, env_var_names: { type: "array", items: { type: "string" } } }, required: ["id", "display_name", "command"], additionalProperties: false },
  },
  {
    name: "team_configuration", description: "Read the automatic or fixed assignment mode for one project.",
    inputSchema: { type: "object", properties: { workspace_root: { type: "string" } }, required: ["workspace_root"], additionalProperties: false },
  },
  {
    name: "save_team_profile", description: "Choose coordinator-led automatic assignment or the optional fixed team for one project.",
    inputSchema: { type: "object", properties: { workspace_root: { type: "string" }, profile: { type: "string", enum: ["auto", "standard"] }, roles: { type: "object" } }, required: ["workspace_root", "profile"], additionalProperties: false },
  },
  {
    name: "submit_frontend_task", description: "In fixed assignment mode, submit frontend work to DSH using exact DeepSeek V4.1 Flash.",
    inputSchema: { type: "object", properties: { workspace_root: { type: "string" }, prompt: { type: "string" }, allowed_paths: { type: "array", items: { type: "string" } }, timeout_ms: { type: "integer" } }, required: ["workspace_root", "prompt"], additionalProperties: false },
  },
  {
    name: "submit_agent_task", description: "In automatic assignment mode, submit Sol's explicitly described role to a registered ACP agent with an exactly selected, previously verified provider and model.",
    inputSchema: { type: "object", properties: { workspace_root: { type: "string" }, agent_id: { type: "string" }, provider_id: { type: "string" }, model_id: { type: "string" }, role: { type: "string" }, prompt: { type: "string" }, allowed_paths: { type: "array", items: { type: "string" } }, timeout_ms: { type: "integer" } }, required: ["workspace_root", "agent_id", "provider_id", "model_id", "role", "prompt"], additionalProperties: false },
  },
  { name: "get_team_task", description: "Read an ACP team task status.", inputSchema: { type: "object", properties: { workspace_root: { type: "string" }, task_id: { type: "string" } }, required: ["workspace_root", "task_id"], additionalProperties: false } },
  { name: "cancel_team_task", description: "Cancel an active ACP team task.", inputSchema: { type: "object", properties: { workspace_root: { type: "string" }, task_id: { type: "string" } }, required: ["workspace_root", "task_id"], additionalProperties: false } },
];

function jsonResult(id, value) {
  return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(value) }] } };
}
function errorResult(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export function createMcpServer({ stateRoot, gitCommonDirResolver, registryProbe, dshClientFactory } = {}) {
  if (!stateRoot) throw new TypeError("stateRoot is required");
  const identityResolver = (workspaceRoot) => resolveWorkspaceIdentity(workspaceRoot, { gitCommonDirResolver });
  const mode = new TeamMode({ stateStore: new StateStore(stateRoot), identityResolver });
  const registry = new AgentRegistry({ stateRoot, probeCommand: registryProbe });
  const profiles = new TeamProfile({ stateRoot, registry });
  const frontend = new DshAcpWorker({ teamMode: mode, identityResolver, clientFactory: dshClientFactory, registry, profiles });
  return {
    async handle(message) {
      if (!message || typeof message !== "object") return errorResult(null, -32600, "Invalid request");
      const { id = null, method, params = {} } = message;
      if (method === "notifications/initialized") return null;
      if (method === "initialize") return { jsonrpc: "2.0", id, result: {
        protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "sol-dsh-codex-team", version: "0.1.1" },
        instructions: "Check team_mode_status and team_configuration for the exact workspace before each task. When OFF, use normal Codex behavior. When ON with profile=standard, Sol plans and reviews, submits frontend work only through submit_frontend_task (exact DeepSeek V4.1 Flash), and assigns backend work to a GPT subagent in the current Codex session. When ON with profile=auto, Sol plans and reviews, inspects discover_agents, then chooses a suitable available agent per subtask. For ACP agents, verify the exact model with verify_agent_model before submit_agent_task; for Codex-managed GPT models, use the current Codex session's native subagent. Define shared contracts before parallel full-stack work. Stop and report if the selected agent or model cannot be confirmed; never silently substitute. The switch is an orchestration rule, not an OS security boundary.",
      } };
      if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOL_DEFINITIONS } };
      if (method !== "tools/call") return errorResult(id, -32601, `Unknown method: ${method}`);
      const name = params?.name;
      const args = params?.arguments ?? {};
      if (!TOOL_DEFINITIONS.some((tool) => tool.name === name) || typeof args !== "object") return errorResult(id, -32602, "Unknown tool or invalid arguments");
      try {
        if (name === "list_agents") return jsonResult(id, await registry.listAgents());
        if (name === "discover_agents") {
          if (typeof args.workspace_root !== "string" || !args.workspace_root.trim()) return errorResult(id, -32602, "workspace_root is required");
          return jsonResult(id, await registry.discoverAgents({ cwd: args.workspace_root }));
        }
        if (name === "probe_agent") {
          if (typeof args.agent_id !== "string" || !args.agent_id.trim()) return errorResult(id, -32602, "agent_id is required");
          return jsonResult(id, await registry.probeAgent(args.agent_id));
        }
        if (name === "verify_agent_model") {
          if (typeof args.agent_id !== "string" || typeof args.model_id !== "string" || typeof args.provider_id !== "string") return errorResult(id, -32602, "agent_id, model_id and provider_id are required");
          return jsonResult(id, await registry.verifyAgentModel(args.agent_id, args.model_id, args.provider_id));
        }
        if (name === "add_acp_agent") {
          if (typeof args.id !== "string" || typeof args.display_name !== "string" || typeof args.command !== "string") return errorResult(id, -32602, "id, display_name and command are required");
          return jsonResult(id, await registry.addAcpAgent({ id: args.id, displayName: args.display_name, command: args.command, args: args.args ?? [], envVarNames: args.env_var_names ?? [] }));
        }
        if (name === "team_configuration") {
          if (typeof args.workspace_root !== "string" || !args.workspace_root.trim()) return errorResult(id, -32602, "workspace_root is required");
          return jsonResult(id, await profiles.get(args.workspace_root));
        }
        if (name === "save_team_profile") {
          if (typeof args.workspace_root !== "string" || !args.workspace_root.trim()) return errorResult(id, -32602, "workspace_root is required");
          return jsonResult(id, await profiles.save(args.workspace_root, { profile: args.profile, roles: args.roles }));
        }
        if (name === "submit_frontend_task") {
          if (typeof args.workspace_root !== "string" || typeof args.prompt !== "string") return errorResult(id, -32602, "workspace_root and prompt are required");
          return jsonResult(id, await frontend.startFrontendTask({ workspaceRoot: args.workspace_root, prompt: args.prompt, allowedPaths: args.allowed_paths ?? [], timeoutMs: args.timeout_ms ?? 900000 }));
        }
        if (name === "submit_agent_task") {
          if (typeof args.workspace_root !== "string" || typeof args.prompt !== "string" || typeof args.agent_id !== "string" || typeof args.provider_id !== "string" || typeof args.model_id !== "string") return errorResult(id, -32602, "workspace_root, agent_id, provider_id, model_id, and prompt are required");
          return jsonResult(id, await frontend.startAgentTask({ workspaceRoot: args.workspace_root, agentId: args.agent_id, providerId: args.provider_id, modelId: args.model_id, role: args.role, prompt: args.prompt, allowedPaths: args.allowed_paths ?? [], timeoutMs: args.timeout_ms ?? 900000 }));
        }
        if (name === "get_team_task") return jsonResult(id, await frontend.getTeamTask({ workspaceRoot: args.workspace_root, taskId: args.task_id }));
        if (name === "cancel_team_task") return jsonResult(id, await frontend.cancelTeamTask({ workspaceRoot: args.workspace_root, taskId: args.task_id }));
        if (name === "team_mode_status") {
          if (typeof args.workspace_root !== "string" || !args.workspace_root.trim()) return errorResult(id, -32602, "workspace_root must be a non-empty string");
          return jsonResult(id, await mode.status(args.workspace_root));
        }
        if (typeof args.workspace_root !== "string" || !args.workspace_root.trim() || typeof args.enabled !== "boolean") return errorResult(id, -32602, "workspace_root must be non-empty and enabled must be boolean");
        const status = await mode.set(args.workspace_root, args.enabled);
        if (!args.enabled) await frontend.cancelWorkspaceTasks(args.workspace_root);
        return jsonResult(id, status);
      } catch (error) {
        return errorResult(id, -32602, error instanceof Error ? error.message : String(error));
      }
    },
  };
}

export async function startStdioServer({ stateRoot } = {}) {
  const server = createMcpServer({ stateRoot });
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of input) {
    if (!line.trim()) continue;
    let message;
    try { message = JSON.parse(line); } catch { process.stderr.write("Invalid JSON-RPC input\n"); continue; }
    const response = await server.handle(message);
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const stateRoot = process.env.SOL_TEAM_STATE_ROOT;
  if (!stateRoot) { process.stderr.write("SOL_TEAM_STATE_ROOT is required\n"); process.exitCode = 2; }
  else await startStdioServer({ stateRoot });
}
