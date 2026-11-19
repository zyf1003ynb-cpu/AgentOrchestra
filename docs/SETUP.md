# Setup and daily use

## Requirements

- Windows 10 or 11.
- Node.js 22 or later for the MCP service and control logic.
- .NET 10 SDK to build the WPF control panel from source.
- DeepSeek Harness with its ACP command available.
- Codex desktop or CLI, already configured and signed in by the user.

Python is not used by this project. A packaged installer is not included in version 0.1.1.

## Configure DeepSeek Harness

The app first checks the DeepSeek Harness installation registered with Windows and uses its bundled `dsh.cmd --profile acp` launcher. On other platforms it uses `dsh --profile acp`. You can override the command with the `SOL_DSH_ACP_COMMAND` user environment variable if the automatic lookup does not find your installation, for example:

```powershell
setx SOL_DSH_ACP_COMMAND "C:\path\to\dsh.cmd"
```

Replace the example with the path on your computer. Open a new terminal and restart Codex and the control panel after setting it; already-running processes do not receive newly saved environment variables. Do not put API keys or other credentials in the command or in tracked project files.

## First use

1. Double-click `Start-TeamMode.vbs` in the repository root.
2. Select the folder currently open in Codex.
3. Choose **Connect to Codex**. The installer adds the local MCP service, `backend-gpt` agent template, and team workflow skill to the user's Codex configuration. Existing matching configuration is backed up before replacement.
4. Fully restart Codex so it loads the new MCP, agent, and skill.
5. In the control panel, select the same project and switch team mode on.
6. Continue the task in that project's existing Codex conversation.

The installer does not log in to a browser or change Codex credentials. Team state is saved per project. A new project starts with team mode off. Closing the control panel does not change the saved mode; turn the switch off explicitly when needed.

## Daily use

Open the control panel, select the project, and use the switch. Keep using the existing Codex conversation. DSH's normal chat window does not need to stay open; its ACP process is started for a dispatched frontend task. The GPT backend agent is started by the active Codex session and its activity is shown in Codex's own agent view.

Agent discovery checks the built-in DSH entry and ACP agents you explicitly added. It reads the API/protocol, provider IDs, published models, and advertised capabilities from the ACP handshake. Codex-native model choices stay in the active Codex session and are not enumerated by that ACP scan. Added agents must be explicitly configured as ACP stdio programs; the app does not scan the computer. Model verification sends a real request and may use provider quota. The default project assignment lets Sol choose among detected, available, verified agents and models. The optional fixed-role switch pins frontend work to DSH/DeepSeek V4.1 Flash and backend work to a GPT subagent in Codex.

## Development checks

Run from the repository root:

```powershell
npm test
npm run check
dotnet build desktop\TeamModeControl\TeamModeControl.csproj --configuration Release
```
