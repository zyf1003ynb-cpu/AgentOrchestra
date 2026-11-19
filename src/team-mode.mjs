import { resolveWorkspaceIdentity } from "./workspace-identity.mjs";

export class TeamMode {
  constructor({ stateStore, identityResolver = resolveWorkspaceIdentity }) {
    if (!stateStore) throw new TypeError("stateStore is required");
    this.stateStore = stateStore;
    this.identityResolver = identityResolver;
  }

  async status(workspaceRoot) {
    const identity = await this.identityResolver(workspaceRoot);
    return { ...identity, ...(await this.stateStore.readTeamMode(identity)) };
  }

  async set(workspaceRoot, enabled) {
    const identity = await this.identityResolver(workspaceRoot);
    return { ...identity, ...(await this.stateStore.writeTeamMode(identity, enabled)) };
  }
}
