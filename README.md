# Agent Orchestra 0.1.1

Agent Orchestra adds a small Windows control panel and a local Codex MCP service for a project-specific coding team. In team mode, Sol plans and reviews, DeepSeek Harness (DSH) with DeepSeek V4.1 Flash handles frontend work, and a GPT subagent started by the current Codex session handles backend work. Turning the switch off returns the project to the normal Codex workflow.

## Run it

1. Install Node.js 22+ and the .NET 10 SDK on Windows 10/11.
2. Configure the DSH ACP command as described in [docs/SETUP.md](docs/SETUP.md).
3. Double-click `Start-TeamMode.vbs` to open the control panel.
4. Select the project currently open in Codex and choose **Connect to Codex**.
5. Restart Codex, turn on team mode for that project, and continue in the same Codex conversation.

The DSH chat window does not need to stay open. The MCP service starts its ACP process when frontend work is dispatched. Python is not required. This source release does not include a packaged installer.

## What it includes

- A light, rounded, translucent WPF control panel with a project-level team switch.
- A local stdio MCP service for team state, agent/model discovery, and DSH task dispatch.
- Codex templates for the GPT backend agent and the team workflow skill.
- Tests and focused setup/validation documentation.

The default team assignment is automatic: Sol checks the configured ACP agents and chooses suitable verified models, while Codex-native GPT agents are selected in the current Codex session. You can turn on the per-project fixed-role option to require DSH/DeepSeek V4.1 Flash for frontend work and a GPT subagent in Codex for backend work. Team mode is a workflow guard, not an operating-system security boundary.

## Development checks

```powershell
npm test
npm run check
dotnet build desktop\TeamModeControl\TeamModeControl.csproj --configuration Release
```

See [docs/SETUP.md](docs/SETUP.md) for installation and [docs/VALIDATION.md](docs/VALIDATION.md) for the checks that still require a connected Codex session. A push helper is available one level above this folder as `Push-AgentOrchestra.ps1`; it runs the release checks and asks before pushing. The current source version is `0.1.1`. No software license has been selected for this repository yet; choose one before publishing if you intend to grant reuse rights.
