# Project plan

## Release 0.1.1

Prepare a portable, source-only GitHub repository for the Sol + DSH + Codex team-mode MVP.

- Default to coordinator-led assignment: Sol uses detected, available, verified agents and chooses work per task; Codex-native GPT agents remain managed by the active Codex session. Keep the fixed DSH frontend/Codex GPT backend roles as an optional project setting.
- Keep the team switch scoped to the selected project.
- Resolve the installed DSH ACP launcher from its Windows registration or PATH, allow SOL_DSH_ACP_COMMAND to override it, and never commit machine-specific paths or credentials.
- Include source, tests, templates, and focused documentation.
- Exclude local state, browser profiles, build output, raw web captures, and development-only prompt artifacts.
- Provide a parent-folder PowerShell helper for staging, committing, and pushing after the owner configures a GitHub remote.

## Release acceptance

- npm test passes.
- npm run check passes.
- WPF Release build passes.
- Public-release scan finds no personal machine paths, local browser data, or credentials.
- The push helper never embeds a token, never force-pushes, and asks before committing/pushing.

## Future work

After user-level Codex integration is validated, consider a graphical team-profile editor for choosing among explicitly configured agents and models. Additional agent protocols, including visual-design agents, require a separate adapter and security review. A packaged installer may follow if users need a machine without the .NET SDK to run the panel.

See DESIGN.md, research/MATURE_OPTIONS.md, and docs/VALIDATION.md.
