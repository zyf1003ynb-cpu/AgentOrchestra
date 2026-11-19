import { randomUUID } from "node:crypto";
import path from "node:path";
import { AcpSession } from "./adapters/acp-agent.mjs";
import { resolveWorkspaceIdentity } from "./workspace-identity.mjs";
import { getDshAcpCommand } from "./dsh-command.mjs";

export const DSH_MODEL_VALUE = '["deepseek-account","deepseek-flash"]';
export const DSH_MODEL_NAME = "DeepSeek-V41-Flash";

export class DshAcpWorker {
  constructor({ teamMode, identityResolver = resolveWorkspaceIdentity, clientFactory, onEvent, registry, profiles } = {}) {
    if (!teamMode || !identityResolver) throw new TypeError("teamMode and identityResolver are required");
    this.teamMode = teamMode;
    this.identityResolver = identityResolver;
    this.registry = registry;
    this.profiles = profiles;
    this.clientFactory = clientFactory ?? ((options) => new AcpSession(options.agent ?? { command: getDshAcpCommand(), args: ["--profile", "acp"] }, { cwd: options.workspaceRoot, allowedPaths: options.allowedPaths }));
    this.onEvent = onEvent;
    this.tasks = new Map();
  }

  async startFrontendTask({ workspaceRoot, prompt, allowedPaths = [], timeoutMs = 900000 } = {}) {
    if (this.profiles && (await this.profiles.get(workspaceRoot)).profile !== "standard") throw new Error("fixed frontend dispatch requires fixed assignment mode");
    return this.#startTask({
      workspaceRoot, prompt, allowedPaths, timeoutMs, role: "frontend", agentId: "dsh",
      agent: { id: "dsh", displayName: "DeepSeek Harness", command: getDshAcpCommand(), args: ["--profile", "acp"] },
      modelValue: DSH_MODEL_VALUE, expectedModelName: DSH_MODEL_NAME,
    });
  }

  async startAgentTask({ workspaceRoot, prompt, role, agentId, providerId, modelId, allowedPaths = [], timeoutMs = 900000 } = {}) {
    if (typeof workspaceRoot !== "string" || !workspaceRoot.trim()) throw new TypeError("workspaceRoot is required");
    if (!this.registry || !this.profiles) throw new Error("automatic agent dispatch is not configured");
    const profile = await this.profiles.get(workspaceRoot);
    if (profile.profile !== "auto") throw new Error("generic agent dispatch requires automatic assignment mode");
    if (agentId === "codex") throw new Error("Codex-native tasks must be assigned through the current Codex session");
    if (typeof providerId !== "string" || !providerId.trim() || typeof modelId !== "string" || !modelId.trim()) throw new TypeError("providerId and modelId are required");
    if (typeof role !== "string" || !role.trim()) throw new TypeError("role is required");

    const agent = await this.registry.getAgent(agentId);
    const verified = (agent.verifiedModels ?? []).some((item) => item.providerId === providerId && item.modelId === modelId);
    if (!verified) throw new Error("the selected provider/model must be verified before automatic dispatch");
    const probe = await this.registry.probeAgent(agentId, { cwd: workspaceRoot });
    const model = probe.models.find((item) => item.providerId === providerId && item.modelId === modelId);
    if (!probe.connected || !model) throw new Error("the selected provider/model is not currently advertised by this agent");

    return this.#startTask({
      workspaceRoot, prompt, allowedPaths, timeoutMs, role: role.trim(), agentId,
      agent, modelValue: JSON.stringify([providerId, modelId]), expectedModelName: model.name,
    });
  }

  async #startTask({ workspaceRoot, prompt, allowedPaths, timeoutMs, role, agentId, agent, modelValue, expectedModelName }) {
    if (typeof workspaceRoot !== "string" || !workspaceRoot.trim()) throw new TypeError("workspaceRoot is required");
    if (typeof prompt !== "string" || !prompt.trim()) throw new TypeError("prompt is required");
    if (!Array.isArray(allowedPaths) || allowedPaths.some((item) => typeof item !== "string" || path.isAbsolute(item) || item.split(/[\\/]/).includes(".."))) throw new TypeError("allowedPaths must be workspace-relative paths");
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 3600000) throw new RangeError("timeoutMs must be between 1000 and 3600000");
    const mode = await this.teamMode.status(workspaceRoot);
    if (!mode.enabled) throw new Error("team mode is off");
    const identity = await this.identityResolver(workspaceRoot);
    if (mode.projectId && identity.projectId !== mode.projectId) throw new Error("workspace identity does not match team mode");
    const task = {
      taskId: `${agentId}-${randomUUID()}`,
      workspaceRoot: path.resolve(workspaceRoot),
      projectId: identity.projectId,
      role,
      agentId,
      agentName: agent.displayName,
      status: "running",
      prompt,
      allowedPaths: [...allowedPaths],
      timeoutMs,
      modelValue,
      modelName: null,
      sessionId: null,
      result: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cancelled: false,
    };
    this.tasks.set(task.taskId, task);
    try {
      const client = await this.clientFactory({ agent, workspaceRoot: task.workspaceRoot, taskId: task.taskId, allowedPaths: task.allowedPaths });
      task.client = client;
      await client.initialize();
      const opened = await client.newSession(task.workspaceRoot);
      task.sessionId = typeof opened === "string" ? opened : opened.sessionId;
      const selected = await client.setModel(task.sessionId, modelValue);
      if (selected.value !== modelValue || selected.name !== expectedModelName) {
        const error = agentId === "dsh" ? "ACP did not read back the exact DeepSeek-V41-Flash model" : "ACP did not read back the exact selected model";
        throw new Error(error);
      }
      task.modelName = selected.name;
      task.updatedAt = new Date().toISOString();
      task.promise = this.#run(task, client);
      this.#emit(task);
      return this.#view(task);
    } catch (error) {
      task.status = "failed";
      task.error = error instanceof Error ? error.message : String(error);
      task.updatedAt = new Date().toISOString();
      await task.client?.close?.();
      this.#emit(task);
      this.tasks.delete(task.taskId);
      throw error;
    }
  }
  async getTeamTask({ workspaceRoot, taskId } = {}) {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error("unknown task");
    await this.#assertWorkspace(task, workspaceRoot);
    return this.#view(task);
  }

  async wait(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error("unknown task");
    await task.promise;
    return this.#view(task);
  }

  async cancelTeamTask({ workspaceRoot, taskId } = {}) {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error("unknown task");
    await this.#assertWorkspace(task, workspaceRoot);
    if (task.status === "stopping") { await task.promise; return this.#view(task); }
    if (task.status !== "running") return this.#view(task);
    task.status = "stopping";
    task.updatedAt = new Date().toISOString();
    this.#emit(task);
    try {
      await task.client.cancel(task.sessionId);
      await task.promise;
      if (task.status !== "cancelled" && task.status !== "completed") throw new Error("ACP did not confirm cancellation");
      return this.#view(task);
    } catch (error) {
      if (task.status === "stopping") {
        task.status = "running";
        task.error = error instanceof Error ? error.message : String(error);
        task.updatedAt = new Date().toISOString();
        this.#emit(task);
      }
      throw error;
    }
  }

  async cancelWorkspaceTasks(workspaceRoot) {
    const identity = await this.identityResolver(workspaceRoot);
    const active = [...this.tasks.values()].filter((task) => task.projectId === identity.projectId && ["running", "stopping"].includes(task.status));
    const results = [];
    for (const task of active) results.push(await this.cancelTeamTask({ workspaceRoot, taskId: task.taskId }));
    return results;
  }

  async #run(task, client) {
    let timer;
    task.modeMonitor = setInterval(async () => {
      if (task.modeCheck || task.status !== "running") return;
      task.modeCheck = true;
      try {
        const status = await this.teamMode.status(task.workspaceRoot);
        if (!status.enabled && task.status === "running") await this.cancelTeamTask({ workspaceRoot: task.workspaceRoot, taskId: task.taskId });
      } catch {
        if (task.status === "running") await this.cancelTeamTask({ workspaceRoot: task.workspaceRoot, taskId: task.taskId }).catch(() => {});
      } finally { task.modeCheck = false; }
    }, 1000);
    task.modeMonitor.unref?.();
    try {
      const workPrompt = [
        "You are an implementation agent assigned by Sol.",
        `Assignment: ${task.role}`,
        `Agent: ${task.agentName}`,
        `Workspace: ${task.workspaceRoot}`,
        `Allowed relative paths: ${task.allowedPaths.length ? task.allowedPaths.join(", ") : "the workspace, preserving unrelated files"}`,
        "Implement only the assigned task, run focused checks, and report evidence. Do not modify files outside the workspace or add credentials.",
        `Task: ${task.prompt}`,
      ].join("\n");
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${task.agentId === "dsh" ? "frontend" : "agent"} task exceeded ${task.timeoutMs}ms`)), task.timeoutMs); task.timer = timer; });
      const result = await Promise.race([client.prompt(task.sessionId, workPrompt), timeout]);
      if (result?.stopReason === "cancelled") { task.cancelled = true; task.status = "cancelled"; task.updatedAt = new Date().toISOString(); this.#emit(task); return; }
      if (result?.stopReason !== "end_turn") throw new Error(`ACP task stopped with ${result?.stopReason ?? "unknown"}`);
      task.status = "completed";
      task.result = result.text ?? "";
      task.updatedAt = new Date().toISOString();
      this.#emit(task);
    } catch (error) {
      task.status = error instanceof Error && error.message.includes("exceeded") ? "timed_out" : "failed";
      task.error = error instanceof Error ? error.message : String(error);
      task.updatedAt = new Date().toISOString();
      this.#emit(task);
    } finally {
      clearTimeout(timer);
      task.timer = null;
      clearInterval(task.modeMonitor);
      task.modeMonitor = null;
      await client.closeSession?.(task.sessionId);
      await client.close?.();
    }
  }

  async #assertWorkspace(task, workspaceRoot) {
    const identity = await this.identityResolver(workspaceRoot);
    if (identity.projectId !== task.projectId) throw new Error("workspace identity does not match task");
  }

  #view(task) {
    const { client, promise, timer, modeMonitor, modeCheck, ...view } = task;
    return { ...view };
  }

  #emit(task) {
    try { this.onEvent?.(this.#view(task)); } catch { /* Status reporting cannot alter task execution. */ }
  }
}
