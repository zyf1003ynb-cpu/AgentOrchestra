import crypto from "node:crypto";
import path from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolveWorkspaceIdentity } from "./workspace-identity.mjs";

const STANDARD_FRONTEND = { agentId: "dsh", providerId: "deepseek-account", modelId: "deepseek-flash" };
const STANDARD_BACKEND = { agentId: "codex", providerId: "openai", modelId: "select-per-task" };
const clone = (value) => JSON.parse(JSON.stringify(value));

export class TeamProfile {
  constructor({ stateRoot, registry, identityResolver = resolveWorkspaceIdentity } = {}) {
    if (!stateRoot || !registry) throw new TypeError("stateRoot and registry are required");
    this.stateRoot = path.resolve(stateRoot);
    this.registry = registry;
    this.identityResolver = identityResolver;
  }

  async get(workspaceRoot) {
    const filePath = await this.#path(workspaceRoot);
    try {
      const value = JSON.parse(await readFile(filePath, "utf8"));
      if (value.profile === "auto" && (value.roles === undefined || value.roles === null)) {
        return { profile: "auto", roles: null, updatedAt: value.updatedAt ?? null };
      }
      if (value.profile === "standard" && this.#matchesStandard(value.roles)) {
        return { profile: "standard", roles: { frontend: clone(STANDARD_FRONTEND), backend: clone(STANDARD_BACKEND) }, updatedAt: value.updatedAt ?? null };
      }
      return this.#default();
    } catch { return this.#default(); }
  }

  async save(workspaceRoot, value) {
    let saved;
    if (value?.profile === "auto") {
      saved = { profile: "auto", roles: null, updatedAt: new Date().toISOString() };
    } else if (value?.profile === "standard" && (value.roles == null || this.#matchesStandard(value.roles))) {
      saved = { profile: "standard", roles: { frontend: clone(STANDARD_FRONTEND), backend: clone(STANDARD_BACKEND) }, updatedAt: new Date().toISOString() };
    } else if (value?.profile === "standard") {
      throw new Error("standard team roles are fixed");
    } else {
      throw new TypeError("profile must be auto or standard");
    }
    const filePath = await this.#path(workspaceRoot);
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(saved, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporary, filePath);
    return saved;
  }

  #default() { return { profile: "auto", roles: null, updatedAt: null }; }

  #matchesStandard(roles) {
    const frontend = roles?.frontend;
    const backend = roles?.backend;
    return frontend?.agentId === STANDARD_FRONTEND.agentId
      && frontend?.providerId === STANDARD_FRONTEND.providerId
      && frontend?.modelId === STANDARD_FRONTEND.modelId
      && backend?.agentId === STANDARD_BACKEND.agentId
      && backend?.providerId === STANDARD_BACKEND.providerId
      && backend?.modelId === STANDARD_BACKEND.modelId;
  }

  async #path(workspaceRoot) {
    const identity = await this.identityResolver(workspaceRoot);
    const key = crypto.createHash("sha256").update(`${identity.kind}:${identity.canonicalProjectRoot.toLowerCase()}`).digest("hex");
    return path.join(this.stateRoot, "projects", key, "team-profile.json");
  }
}

export { STANDARD_FRONTEND, STANDARD_BACKEND };
