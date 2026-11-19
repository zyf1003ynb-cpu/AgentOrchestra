import path from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";

export class StateStore {
  constructor(rootDir) {
    this.rootDir = path.resolve(rootDir);
  }

  teamModePath(identity) {
    return path.join(this.rootDir, identity.projectId, "team-mode.json");
  }

  async readTeamMode(identity) {
    const filePath = this.teamModePath(identity);
    try {
      const parsed = JSON.parse(await readFile(filePath, "utf8"));
      if (typeof parsed.enabled !== "boolean") return this.#defaultTeamMode();
      if (parsed.projectId !== undefined && parsed.projectId !== identity.projectId) {
        return this.#defaultTeamMode();
      }
      return {
        enabled: parsed.enabled,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      };
    } catch {
      return this.#defaultTeamMode();
    }
  }

  async writeTeamMode(identity, enabled) {
    if (typeof enabled !== "boolean") throw new TypeError("enabled must be boolean");
    const filePath = this.teamModePath(identity);
    await mkdir(path.dirname(filePath), { recursive: true });
    const value = { enabled, projectId: identity.projectId, updatedAt: new Date().toISOString() };
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(value)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(tempPath, filePath);
    return value;
  }

  #defaultTeamMode() {
    return { enabled: false, updatedAt: null };
  }
}
