# Sol + DSH + Codex team mode design

## Goal

Keep the user's existing Codex conversation as the place where Sol plans and coordinates work, while providing a separate, project-level switch for the fixed frontend and backend roles. The compact Windows panel uses rounded shapes, light translucent surfaces, clear text, and restrained animation.

## Team behavior

- When OFF, normal Codex work continues.
- When ON, Sol plans, defines shared API/file contracts, assigns work, integrates, and reviews.
- Frontend implementation is dispatched through DSH ACP and requires the exact DeepSeek V4.1 Flash selection.
- Backend implementation is assigned to a GPT subagent started by the current Codex session.
- Full-stack work is split by file ownership before parallel dispatch; shared contract files get one owner.
- The MCP service rejects new DSH team tasks while the project switch is OFF and requests cancellation of active DSH tasks.

The switch provides workflow routing, not operating-system isolation. The main Codex session still has its normal editing capabilities. MCP does not manage the internal status of Codex-native GPT subagents.

## Components

- WPF control panel for project selection and mode state.
- Node.js stdio MCP/ACP service for workspace identity, agent discovery, team state, and DSH tasks.
- Codex user-level templates for the GPT backend subagent and workflow skill.
- DSH ACP launcher configured through `SOL_DSH_ACP_COMMAND` or the system `PATH`.

## Agent discovery limits

The panel lists built-in DSH and Codex agents plus ACP stdio agents explicitly added by the user. It reads the models and capabilities each agent advertises. It does not search the whole computer, infer hidden provider APIs, or save credentials. A successful model verification performs a real request and can consume quota.

Non-ACP agents need a separate adapter. Other agents can be added in a future configurable team profile; this release keeps the standard role mapping fixed.

## Operation

The user launches the panel, selects the same project as the Codex conversation, connects the Codex templates once, restarts Codex, then toggles team mode as needed. DSH's regular chat UI does not need to remain open; MCP starts its ACP process when frontend work is dispatched.

The source release requires Windows, Node.js 22+, and the .NET 10 SDK. It does not require Python and does not include a packaged installer.
