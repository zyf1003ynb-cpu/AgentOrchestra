# Validation

## Automated checks

Run these commands from the repository root:

```powershell
npm test
npm run check
dotnet build desktop\TeamModeControl\TeamModeControl.csproj --configuration Release
```

The Node test suite covers team state, workspace identity, ACP discovery and model/provider data, automatic and fixed assignment modes, DSH task lifecycle, Codex configuration installation, and panel UI structure. The syntax check covers project JavaScript modules. The Release build verifies the WPF control panel compiles.

## Environment-specific checks

These checks require the user's own DSH and Codex setup and are not performed by the source-only release process:

1. Confirm the configured ACP command starts DSH and advertises DeepSeek V4.1 Flash.
2. Connect the project to Codex, restart Codex, and confirm it discovers the MCP tools, `backend-gpt` agent, and workflow skill.
3. In a disposable project, verify frontend dispatch, backend GPT selection, task cancellation, and project-level OFF behavior.
4. Confirm DSH tasks only edit the paths assigned to them and review all integrated changes before use.

The checked-in test suite does not prove that every user's provider authentication, model availability, or Codex session configuration works. Model/API availability depends on the configured agent and account.
