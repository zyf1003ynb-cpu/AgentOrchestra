---
name: sol-dsh-codex-team
description: Use when implementing code for a project whose Sol + DSH + Codex team mode is enabled; check the project's mode first, then follow its optional fixed role setting or automatically assign work from discovered agents.
---

# Sol + DSH + Codex team workflow

Before implementation work, call team_mode_status with the exact project root open in the current Codex conversation. If enabled, call team_configuration for that same root. If either tool fails or the workspace identity does not match, stop and report that team state cannot be confirmed.

When team mode is OFF, use the normal Codex workflow.

When team mode is ON, Sol remains the coordinator: plan the work, set shared contracts, delegate, integrate, and review.

- If the profile is standard, keep the fixed assignments: send frontend-only work and tests to DSH through submit_frontend_task, requiring exact DeepSeek V4.1 Flash model readback. Assign backend, API, database, infrastructure, and backend-only tests to the backend-gpt Codex subagent and explicitly select an available GPT model in the current Codex session.
- If the profile is auto, call discover_agents first. Sol chooses suitable available agents and models for each subtask, validates file ownership, and chooses safe parallelism or sequence. For an ACP agent, the exact provider/model must be currently advertised and verified with verify_agent_model before dispatch through submit_agent_task. Supply role with Sol's concrete task assignment. For Codex-native work, use the current Codex session's native subagent and select the GPT model there; do not claim that the local ACP scan discovered Codex session models.
- For full-stack tasks, define the API/data contract and file ownership before parallel work. Keep shared contract files with one named owner. Sequence tasks if ownership would overlap.

For every delegated task, inspect completion evidence, run integration checks, and report remaining blockers. Never silently substitute an unavailable agent or model. If no compatible verified agent is available, explain the blocker and ask before changing the configured assignment. Turning team mode OFF blocks new ACP team tasks; if a Codex subagent is still running, report its status and where to stop it in Codex.
