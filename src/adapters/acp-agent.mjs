import { spawn } from "node:child_process";
import path from "node:path";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";

function spawnAcp(agent) {
  const command = agent.command;
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(command)) {
    const powershell = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const quotedArgs = (agent.args ?? []).map((arg) => `'${String(arg).replaceAll("'", "''")}'`).join(" ");
    return spawn(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", `& '${command.replaceAll("'", "''")}' ${quotedArgs}`], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  }
  return spawn(command, agent.args ?? [], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, shell: false });
}

function parseModelValue(value) {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.length === 2) return { providerId: parsed[0], modelId: parsed[1] };
  } catch { /* model values are opaque to us */ }
  return { providerId: null, modelId: String(value) };
}

function advertisedModels(configOptions = []) {
  const modelOption = configOptions.find((option) => option.id === "model");
  const models = [];
  for (const group of modelOption?.options ?? []) {
    for (const option of group.options ?? []) {
      const parsed = parseModelValue(option.value);
      models.push({ providerId: parsed.providerId ?? group.group, modelId: parsed.modelId, name: option.name ?? parsed.modelId, status: "supported", source: "agent" });
    }
  }
  return models;
}

export class AcpSession {
  constructor(agent, { cwd, onNotification, allowedPaths = [] } = {}) {
    this.agent = agent; this.cwd = path.resolve(cwd ?? process.cwd()); this.onNotification = onNotification;
    this.allowedRoots = allowedPaths.map((item) => path.resolve(this.cwd, item));
    if (this.allowedRoots.some((root) => !this.#within(this.cwd, root))) throw new Error("allowedPaths must stay inside the workspace");
    this.child = spawnAcp(agent); this.pending = new Map(); this.nextId = 1; this.buffer = ""; this.closed = false;
    this.stderr = "";
    this.exited = new Promise((resolve) => this.child.once("close", (code, signal) => resolve({ code, signal })));
    this.child.stdout.setEncoding("utf8"); this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.#onData(chunk));
    this.child.stderr.on("data", (chunk) => { this.stderr = `${this.stderr}${chunk}`.slice(-4000); });
    this.child.on("error", (error) => this.#rejectAll(error));
    this.child.on("close", (code, signal) => { if (!this.closed) this.#rejectAll(new Error(`ACP agent exited (${code ?? signal})${this.stderr ? `: ${this.stderr}` : ""}`)); });
  }

  request(method, params = {}) {
    if (this.closed) return Promise.reject(new Error("ACP session is closed"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  notify(method, params = {}) { if (!this.closed) this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`); }

  async initialize() {
    const response = await this.request("initialize", { protocolVersion: 1, clientInfo: { name: "sol-dsh-codex-team", version: "0.1.1" }, clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false } });
    this.notify("notifications/initialized");
    return response.result;
  }

  async newSession() { return (await this.request("session/new", { cwd: this.cwd, mcpServers: [] })).result; }
  async setModel(sessionId, value) {
    const response = await this.request("session/set_config_option", { sessionId, configId: "model", value });
    const option = response.result?.configOptions?.find((item) => item.id === "model");
    return { value: option?.currentValue, name: (option?.options ?? []).flatMap((group) => group.options ?? []).find((item) => item.value === option?.currentValue)?.name };
  }
  async prompt(sessionId, text) {
    return (await this.request("session/prompt", { sessionId, prompt: [{ type: "text", text }] })).result;
  }
  cancel(sessionId) { this.notify("session/cancel", { sessionId }); }
  async closeSession(sessionId) { try { await this.request("session/close", { sessionId }); } catch { /* agent may already have exited */ } }
  async close() {
    if (this.closed) return;
    this.closed = true;
    this.#rejectAll(new Error("ACP session closed"));
    this.child.stdin.end();
    let timer;
    await Promise.race([this.exited, new Promise((resolve) => { timer = setTimeout(resolve, 2000); })]);
    clearTimeout(timer);
    if (this.child.exitCode === null && this.child.signalCode === null) {
      this.child.kill();
      await Promise.race([this.exited, new Promise((resolve) => { timer = setTimeout(resolve, 1000); })]);
      clearTimeout(timer);
    }
  }
  #onData(chunk) {
    this.buffer += chunk;
    let index;
    while ((index = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, index).trim(); this.buffer = this.buffer.slice(index + 1); if (!line) continue;
      let message; try { message = JSON.parse(line); } catch { continue; }
      if (message.id !== undefined && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id); this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message ?? "ACP request failed")); else pending.resolve(message);
      } else if (message.id !== undefined && message.method) this.#handleAgentRequest(message);
      else this.onNotification?.(message);
    }
  }

  async #handleAgentRequest(message) {
    try {
      const params = message.params ?? {};
      let result;
      if (message.method === "fs/read_text_file") {
        result = { content: await this.#readSafe(params.path) };
      } else if (message.method === "fs/write_text_file") {
        await this.#writeSafe(params.path, params.content); result = {};
      } else if (message.method === "session/request_permission") {
        result = { outcome: { outcome: "selected", optionId: "allow" } };
      } else {
        this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: `Unsupported ACP client method: ${message.method}` } })}\n`); return;
      }
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, result })}\n`);
    } catch (error) {
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32602, message: error instanceof Error ? error.message : String(error) } })}\n`);
    }
  }

  async #readSafe(filePath) {
    const safe = await this.#checkedPath(filePath);
    return readFile(safe, "utf8");
  }
  async #writeSafe(filePath, content) {
    const safe = await this.#checkedPath(filePath);
    await mkdir(path.dirname(safe), { recursive: true });
    await this.#checkedPath(filePath);
    await writeFile(safe, String(content ?? ""), "utf8");
  }
  #within(parent, target) {
    const relative = path.relative(parent, target);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  }
  async #checkedPath(filePath) {
    if (typeof filePath !== "string" || !path.isAbsolute(filePath)) throw new Error("ACP file paths must be absolute");
    const target = path.resolve(filePath);
    if (!this.#within(this.cwd, target)) throw new Error("ACP path is outside the workspace");
    if (this.allowedRoots.length && !this.allowedRoots.some((root) => this.#within(root, target))) throw new Error("ACP path is outside allowedPaths");
    let existing = target;
    while (true) {
      try { await stat(existing); break; }
      catch (error) {
        if (error.code !== "ENOENT") throw error;
        const parent = path.dirname(existing);
        if (parent === existing) throw error;
        existing = parent;
      }
    }
    const physical = await realpath(existing);
    const physicalWorkspace = await realpath(this.cwd);
    if (!this.#within(physicalWorkspace, physical)) throw new Error("ACP path resolves outside the workspace");
    if (this.allowedRoots.length) {
      let insideAllowed = false;
      for (const root of this.allowedRoots) {
        const resolvedRoot = await realpath(root).catch(() => root);
        if (this.#within(resolvedRoot, physical) || this.#within(physical, resolvedRoot)) insideAllowed = true;
      }
      if (!insideAllowed) throw new Error("ACP path resolves outside allowedPaths");
    }
    return target;
  }  #rejectAll(error) { for (const { reject } of this.pending.values()) reject(error); this.pending.clear(); }
}

export async function probeAcpAgent(agent, { cwd } = {}) {
  const session = new AcpSession(agent, { cwd });
  try {
    const init = await session.initialize(); const opened = await session.newSession();
    return { connected: true, agentInfo: init.agentInfo, connection: { protocol: "acp", transport: "stdio" }, capabilities: init.agentCapabilities ?? {}, models: advertisedModels(opened.configOptions), auth: init.authMethods?.length ? "available" : "unknown", checkedAt: new Date().toISOString() };
  } finally { await session.close(); }
}

export async function verifyAcpModel(agent, { providerId, modelId, cwd } = {}) {
  const session = new AcpSession(agent, { cwd }); let sessionId;
  try {
    await session.initialize(); const opened = await session.newSession(); sessionId = opened.sessionId;
    const value = JSON.stringify([providerId, modelId]); const selected = await session.setModel(sessionId, value);
    if (selected.value !== value || !selected.name) return { verified: false, reason: "ACP model readback did not match" };
    const ping = await session.prompt(sessionId, "Reply with exactly ACP_FAKE_OK and do not modify files.");
    if (ping.stopReason !== "end_turn") return { verified: false, reason: `ACP ping stopped with ${ping.stopReason ?? "unknown"}` };
    return { verified: true, providerId, modelId, modelName: selected.name, ping: ping.text ?? "" };
  } finally { if (sessionId) await session.closeSession(sessionId); await session.close(); }
}

export { advertisedModels };
