import path from "node:path";
import crypto from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { probeAcpAgent, verifyAcpModel } from "./adapters/acp-agent.mjs";
import { getDshAcpCommand } from "./dsh-command.mjs";

export const DSH_ACP_COMMAND = getDshAcpCommand();
const DSH_ARGS = ["--profile", "acp"];
const BUILT_INS = [
  {
    id: "dsh", displayName: "DeepSeek Harness", runtime: "dsh",
    command: DSH_ACP_COMMAND, args: DSH_ARGS,
    connection: { protocol: "acp", transport: "stdio", source: "built-in" },
    modelApi: { type: "unknown", source: "unknown" },
    provider: { id: null, source: "agent" }, models: [],
    capabilities: [], auth: "managed-by-agent", verifiedModels: [],
  },
  {
    id: "codex", displayName: "Codex native subagent", runtime: "codex",
    connection: { protocol: "native", transport: "current-session", source: "built-in" },
    modelApi: { type: "codex", source: "agent" }, provider: { id: "openai", source: "unknown" },
    models: [], capabilities: ["text", "file_read", "file_write"], auth: "managed-by-codex", verifiedModels: [],
  },
];
const clone = (value) => JSON.parse(JSON.stringify(value));
const safeId = (value) => typeof value === "string" && /^[a-z][a-z0-9_-]{1,48}$/.test(value);
const credentialLike = (value) => /(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|authorization|bearer\s)/i.test(String(value));

export class AgentRegistry {
  constructor({ stateRoot, probeCommand, verifyCommand } = {}) {
    if (!stateRoot) throw new TypeError("stateRoot is required");
    this.stateRoot = path.resolve(stateRoot); this.filePath = path.join(this.stateRoot, "agents.json");
    this.probeCommand = probeCommand; this.verifyCommand = verifyCommand; this.cache = new Map();
  }

  async listAgents() {
    const saved = await this.#readSaved();
    const builtIns = BUILT_INS.map((agent) => {
      const stored = saved.find((item) => item.id === agent.id);
      return { ...clone(agent), ...(stored ? { verifiedModels: stored.verifiedModels ?? [], lastProbe: stored.lastProbe } : {}) };
    });
    return [...builtIns, ...saved.filter((agent) => !BUILT_INS.some((builtIn) => builtIn.id === agent.id)).map(clone)];
  }
  async getAgent(agentId) { const agent = (await this.listAgents()).find((item) => item.id === agentId); if (!agent) throw new Error(`Unknown agent: ${agentId}`); return agent; }

  async probeAgent(agentId, { cwd = process.cwd() } = {}) {
    const agent = await this.getAgent(agentId);
    try {
      if (agent.id === "codex") throw new Error("Codex native models must be verified by spawning from the current Codex session");
      const response = await (this.probeCommand ? this.probeCommand(agent, { cwd }) : probeAcpAgent(agent, { cwd }));
      return this.#normaliseProbe(agent, response);
    } catch (error) {
      return { ...clone(agent), connected: false, models: [], capabilities: [], auth: "unknown", error: error instanceof Error ? error.message : String(error), checkedAt: new Date().toISOString() };
    }
  }

  async addAcpAgent({ id, displayName, command, args = [], envVarNames = [], cwd = process.cwd() } = {}) {
    if (!safeId(id)) throw new TypeError("id must be lowercase letters, digits, _ or -");
    if (BUILT_INS.some((agent) => agent.id === id)) throw new Error(`Agent id is reserved: ${id}`);
    if (typeof displayName !== "string" || !displayName.trim()) throw new TypeError("displayName is required");
    if (typeof command !== "string" || !command.trim()) throw new TypeError("command is required");
    if (!Array.isArray(args) || args.some((value) => typeof value !== "string")) throw new TypeError("args must be strings");
    if (!Array.isArray(envVarNames) || envVarNames.some((value) => typeof value !== "string" || !/^[A-Z_][A-Z0-9_]*$/i.test(value))) throw new TypeError("envVarNames must be environment variable names");
    if ([command, ...args].some(credentialLike)) throw new Error("credential-like command or argument is not allowed");
    const agent = {
      id, displayName: displayName.trim(), runtime: "external", command, args, envVarNames: [...envVarNames],
      connection: { protocol: "acp", transport: "stdio", source: "user" },
      modelApi: { type: "unknown", source: "unknown" }, provider: { id: null, source: "unknown" },
      models: [], capabilities: [], auth: "unknown", verifiedModels: [],
    };
    let response;
    try { response = await (this.probeCommand ? this.probeCommand(agent, { cwd }) : probeAcpAgent(agent, { cwd })); }
    catch (error) { throw new Error(`handshake failed: ${error instanceof Error ? error.message : String(error)}`); }
    const probe = this.#normaliseProbe(agent, response);
    if (!probe.connected) throw new Error(`handshake failed: ${probe.error ?? "agent unavailable"}`);
    if (!(await this.getAgentIds()).includes(id)) {
      const saved = await this.#readSaved(); saved.push({ ...agent, lastProbe: probe }); await this.#writeSaved(saved);
    }
    return clone(agent);
  }

  async verifyAgentModel(agentId, modelId, providerId, { cwd = process.cwd() } = {}) {
    const agent = await this.getAgent(agentId);
    if (agent.id === "codex") return { verified: false, agentId, modelId, providerId, reason: "Codex model choices must be selected and checked when the native backend agent is spawned" };
    const found = await this.probeAgent(agentId, { cwd });
    const model = found.models.find((item) => item.modelId === modelId && (!providerId || item.providerId === providerId));
    if (!model || !found.connected) return { verified: false, agentId, modelId, providerId, reason: "model is not currently advertised" };
    try {
      const verify = await (this.verifyCommand ? this.verifyCommand(agent, { providerId: model.providerId, modelId: model.modelId, cwd }) : verifyAcpModel(agent, { providerId: model.providerId, modelId: model.modelId, cwd }));
      if (!verify.verified) return { ...verify, agentId, modelId, providerId: model.providerId };
      await this.#saveVerified(agentId, { modelId: model.modelId, providerId: model.providerId, checkedAt: new Date().toISOString() });
      return { ...verify, agentId, checkedAt: new Date().toISOString() };
    } catch (error) {
      return { verified: false, agentId, modelId, providerId, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  async isVerifiedAssignment({ agentId, modelId, providerId } = {}, { cwd = process.cwd() } = {}) {
    if (agentId === "codex") return modelId === "select-per-task" && providerId === "openai";
    try {
      const agent = await this.getAgent(agentId);
      const probe = await this.probeAgent(agentId, { cwd });
      const advertised = probe.connected && probe.models.some((item) => item.modelId === modelId && item.providerId === providerId);
      const verified = (agent.verifiedModels ?? []).some((item) => item.modelId === modelId && item.providerId === providerId);
      return advertised && verified;
    } catch { return false; }
  }

  async getAgentIds() { return (await this.listAgents()).map((agent) => agent.id); }
  async #saveVerified(agentId, record) {
    const saved = await this.#readSaved();
    const existing = saved.find((item) => item.id === agentId);
    const agent = existing ?? clone(BUILT_INS.find((item) => item.id === agentId));
    if (!agent) return;
    agent.verifiedModels = [...(agent.verifiedModels ?? []).filter((item) => item.modelId !== record.modelId || item.providerId !== record.providerId), record];
    if (existing) saved[saved.indexOf(existing)] = agent;
    else saved.push(agent);
    await this.#writeSaved(saved);
  }
  #normaliseProbe(agent, result = {}) {
    const models = Array.isArray(result.models) ? result.models.map((model) => ({ ...model, id: model.id ?? model.modelId, modelId: model.modelId ?? model.id, name: model.name ?? model.modelId ?? model.id, status: ["verified", "supported", "unknown"].includes(model.status) ? model.status : "unknown", capabilities: Array.isArray(model.capabilities) ? [...model.capabilities] : [] })).filter((model) => typeof model.id === "string") : [];
    return { ...clone(agent), ...clone(result), connected: result.connected !== false, checkedAt: result.checkedAt ?? new Date().toISOString(), modelApi: result.modelApi ?? agent.modelApi ?? { type: "unknown", source: "unknown" }, provider: result.provider ?? agent.provider ?? { id: null, source: "unknown" }, models, capabilities: Array.isArray(result.capabilities) ? [...result.capabilities] : [] };
  }
  async #readSaved() {
    try { const parsed = JSON.parse(await readFile(this.filePath, "utf8")); const agents = Array.isArray(parsed) ? parsed : parsed.agents; return Array.isArray(agents) ? agents : []; }
    catch { return []; }
  }
  async #writeSaved(agents) {
    await mkdir(this.stateRoot, { recursive: true }); const temp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, `${JSON.stringify(agents, null, 2)}\n`, { encoding: "utf8", flag: "wx" }); await rename(temp, this.filePath);
  }
}

export function projectKey(workspaceRoot) { const resolved = path.resolve(String(workspaceRoot)); return crypto.createHash("sha256").update(`directory:${resolved.toLowerCase()}`).digest("hex"); }
