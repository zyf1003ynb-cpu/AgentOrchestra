---
name: sol-dsh-codex-team
description: Use when implementing code for a project whose Sol + DSH + Codex team mode is enabled; check the project's mode first and follow the fixed frontend and GPT backend roles.
---

# Sol + DSH + Codex team workflow

Before doing implementation work, call `team_mode_status` with the exact project root open in the current Codex conversation. If it is enabled, call `team_configuration` for that same root. If the tools fail or the workspace identity does not match, stop and report that the team state cannot be confirmed.

When team mode is OFF, follow the normal Codex workflow.

When team mode is ON, Sol plans, defines shared contracts, assigns work, integrates results, and reviews. Keep these implementation roles fixed:

- Frontend files and frontend-only tests: submit them through `submit_frontend_task` to DSH and require the exact DeepSeek-V41-Flash selection. Check its task state with `get_team_task`; use `cancel_team_task` for cancellation and report success only after the worker confirms it.
- Backend, API, database, infrastructure, and backend-only tests: assign the task to the `backend-gpt` Codex subagent. Select an available GPT model explicitly for that spawn. If no GPT model can be selected, the subagent cannot start, or its selected model cannot be confirmed, stop and report the blocker. Never implement the assigned backend work in Sol as a fallback.
- Full-stack tasks: first write down the API/data contract and divide file ownership so the two workers do not edit the same files. Then dispatch the frontend and backend portions. Keep shared contract files with one named owner; if safe ownership is unclear, sequence the tasks.

Sol may inspect changes, review the work, run integration checks, and ask the assigned worker to fix issues. Sol must not take over implementation files from either role. Never silently change an Agent or model, add an unverified Agent to the active team, or report a task as cancelled before confirmation. Turning team mode OFF blocks new DSH team tasks; if a backend subagent is still running, report its status and where to stop it in Codex.
