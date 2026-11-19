# Agent Orchestra interface, discovery, and assignment modes

**Status:** Implemented in the 0.1.1 source tree; verification recorded in the current release notes.

**Goal:** Make the floating panel draggable and rounded, automatically inspect configured Agents and their published provider/API/model data, and make the fixed DSH/GPT role map optional per project.

**Architecture:** Retain the WPF panel, local Node control layer, and Codex MCP service. Probe only built-in and explicitly registered ACP Agents; leave Codex-native model availability to the active Codex session. Automatic coordinator assignment is the default; the existing fixed role map remains available as a per-project option. Require an advertised, verified provider/model before generic ACP dispatch.

## Completed work

- Added automatic and fixed per-project assignment profiles. Fixed mode stores the approved DSH/DeepSeek V4.1 Flash frontend and Codex-session GPT backend map.
- Added registry discovery, provider and capability reporting, failure visibility for unavailable entries, and generic ACP task submission with role, path, and model checks.
- Updated the Codex workflow template to follow the selected profile and explicitly choose available Agents and models.
- Added glass-surface dragging, rounded clipping, hidden main and dropdown scrollbars, and profile/discovery details to the WPF panel.
- Added Windows DeepSeek Harness installation lookup, with an explicit environment-variable override. No personal install path is embedded in the release source.
- Updated release documentation and focused automated checks.

## Boundaries

- Discovery reports built-in DSH and user-registered ACP stdio agents only; it does not scan the computer or launch unknown programs.
- Codex GPT availability and model choices are selected within the current Codex session.
- Model verification makes a real request and can use provider quota.
- Team mode coordinates workflow and is not an OS security boundary.
- This change does not commit, push, or include local app state/build output.

## Verification

- npm test
- npm run check
- dotnet build desktop/TeamModeControl/TeamModeControl.csproj --configuration Release
- Live ACP handshake against the registered DeepSeek Harness installation, confirming the published API, providers, and advertised DeepSeek V4.1 Flash options.
