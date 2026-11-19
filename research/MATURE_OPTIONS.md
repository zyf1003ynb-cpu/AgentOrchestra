# Mature tooling notes

The design keeps the existing Codex conversation as the coordinator and adds the smallest local bridge needed for project mode, DSH task dispatch, and agent discovery.

| Option | Useful capability | Fit for this project | Tradeoff |
|---|---|---|---|
| Codex MCP + native subagents | Local tools and GPT subagents from the active Codex session | Strong fit for keeping Codex as the main interface | MCP does not add a custom switch to the Codex chat window; the companion panel owns the switch |
| ACP (Agent Client Protocol) | Standardized client/agent handshake, model options, sessions, and task operations | Strong fit for DSH and other explicitly configured ACP agents | Agents using a different protocol need an adapter |
| Agent Orchestration MCP | Reference for task status, cancellation, and local agent bridges | Useful architecture reference | This project implements only the subset required by its fixed team workflow |
| General-purpose multi-agent platforms | Visual flows, broader integrations, and provider choice | Potential future option | More moving parts than the current single-computer, Codex-centered workflow needs |

Version 0.1.1 keeps the frontend/backend roles fixed. A later team-profile editor can map roles to explicitly added and verified agents. It should preserve model readback, visible failures, project scoping, and user control over model-verification requests.

The reference project is [agent-orchestration-mcp](https://github.com/dvdxfv/agent-orchestration-mcp). This repository uses it as an architectural reference and does not copy its source code.
