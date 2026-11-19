# Product requirements

## Purpose

Provide a simple project-level switch for coordinating work from the user's existing Codex conversation. Sol plans and reviews; DeepSeek Harness with DeepSeek V4.1 Flash handles frontend changes; a user-selected GPT subagent in Codex handles backend changes. With the switch off, normal Codex work continues.

## Version 0.1.1 scope

- Windows floating control panel with project selection and an ON/OFF switch.
- Local MCP service and workspace-specific mode state.
- DSH ACP dispatch for frontend tasks with exact model readback.
- Codex backend agent template and team workflow skill.
- Agent/model discovery for built-in and explicitly configured ACP stdio agents.
- Tests, UI mockups, and source setup instructions.

## Constraints

- Do not silently change the frontend/backend role assignment.
- Do not scan the entire computer for agents.
- Do not save API keys or credentials in project files.
- Show unknown provider/API details as unknown.
- Treat team mode as workflow coordination, not an OS security boundary.
- Keep DSH installation location configurable and outside the repository.

## Deferred

A graphical role editor, non-ACP adapters, additional executor types, and a packaged installer are not part of version 0.1.1.
