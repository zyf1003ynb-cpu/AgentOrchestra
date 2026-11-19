import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { installCodexMcp } from "../scripts/install-codex.mjs";

test("Codex installer uses the configured Codex home when no path is passed", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "codex-home-env-"));
  const previous = process.env.CODEX_HOME;
  process.env.CODEX_HOME = root;
  try {
    await installCodexMcp({ projectRoot: "C:\\team-project", makeBackup: false });
    const config = await readFile(path.join(root, "config.toml"), "utf8");
    assert.match(config, /mcp_servers\.sol_dsh_codex_team/);
  } finally {
    if (previous === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test("Codex installer preserves unrelated config and replaces only the project MCP section", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "codex-config-"));
  const config = path.join(root, "config.toml");
  await writeFile(config, 'model = "gpt-6.1-sol"\n\n[mcp_servers.other]\ncommand = "other-tool"\n\n[features]\nexample = true\n', "utf8");
  const result = await installCodexMcp({ configPath: config, projectRoot: "C:\\Agents and Agents\\Sol-DSH-Codex-Team", nodePath: "C:\\node\\node.exe", makeBackup: false });
  const installed = await readFile(config, "utf8");
  assert.equal(result.installed, true);
  assert.match(installed, /model = "gpt-6.1-sol"/);
  assert.match(installed, /\[mcp_servers\.other\]/);
  assert.match(installed, /\[features\]/);
  assert.match(installed, /\[mcp_servers\.sol_dsh_codex_team\]/);
  assert.match(installed, /SOL_TEAM_STATE_ROOT/);
  assert.equal((installed.match(/\[mcp_servers\.sol_dsh_codex_team\]/g) ?? []).length, 1);
  await rm(root, { recursive: true, force: true });
});

test("Codex installer creates the target MCP section when the config does not exist", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "codex-config-"));
  const config = path.join(root, "nested", "config.toml");
  await installCodexMcp({ configPath: config, projectRoot: "C:\\team-project", nodePath: "C:\\node\\node.exe", makeBackup: false });
  const installed = await readFile(config, "utf8");
  assert.match(installed, /\[mcp_servers\.sol_dsh_codex_team\]/);
  assert.match(installed, /C:\\\\team-project/);
  await rm(root, { recursive: true, force: true });
});

test("Codex installer validates all templates before changing user configuration", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "codex-team-install-invalid-"));
  const projectRoot = path.join(root, "project");
  const codexHome = path.join(root, "codex-home");
  const config = path.join(codexHome, "config.toml");
  const agentTemplatePath = path.join(root, "backend-gpt.toml");
  await mkdir(codexHome, { recursive: true });
  await writeFile(config, 'model = "keep-me"\n', "utf8");
  await writeFile(agentTemplatePath, 'name = "backend-gpt"\n', "utf8");
  await assert.rejects(() => installCodexMcp({
    codexHome, configPath: config, projectRoot, agentTemplatePath,
    skillTemplatePath: path.join(root, "missing-SKILL.md"), makeBackup: false,
  }), { code: "ENOENT" });
  assert.equal(await readFile(config, "utf8"), 'model = "keep-me"\n');
  await rm(root, { recursive: true, force: true });
});

test("Codex installer installs the backend agent and team-mode skill into the selected Codex home", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "codex-team-install-"));
  const projectRoot = path.join(root, "project");
  const codexHome = path.join(root, "codex-home");
  const agentTemplatePath = path.join(projectRoot, "templates", "codex", "agents", "backend-gpt.toml");
  const skillTemplatePath = path.join(projectRoot, "templates", "codex", "skills", "sol-team-mode", "SKILL.md");
  await mkdir(path.dirname(agentTemplatePath), { recursive: true });
  await mkdir(path.dirname(skillTemplatePath), { recursive: true });
  await writeFile(agentTemplatePath, 'name = "backend-gpt"\n', "utf8");
  await writeFile(skillTemplatePath, "---\nname: sol-dsh-codex-team\n---\n", "utf8");
  const result = await installCodexMcp({ projectRoot, codexHome, agentTemplatePath, skillTemplatePath, makeBackup: false });
  assert.equal(result.agentInstalled, true);
  assert.equal(result.skillInstalled, true);
  assert.equal(await readFile(path.join(codexHome, "agents", "backend-gpt.toml"), "utf8"), 'name = "backend-gpt"\n');
  assert.equal(await readFile(path.join(codexHome, "skills", "sol-team-mode", "SKILL.md"), "utf8"), "---\nname: sol-dsh-codex-team\n---\n");
  await rm(root, { recursive: true, force: true });
});

test("Codex installer backs up existing config and same-name user templates before replacing them", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "codex-backup-"));
  const projectRoot = path.join(root, "project");
  const codexHome = path.join(root, "codex-home");
  const config = path.join(codexHome, "config.toml");
  const agentTarget = path.join(codexHome, "agents", "backend-gpt.toml");
  const skillTarget = path.join(codexHome, "skills", "sol-team-mode", "SKILL.md");
  const agentTemplatePath = path.join(projectRoot, "backend-gpt.toml");
  const skillTemplatePath = path.join(projectRoot, "SKILL.md");
  await mkdir(path.dirname(agentTarget), { recursive: true });
  await mkdir(path.dirname(skillTarget), { recursive: true });
  await mkdir(path.dirname(agentTemplatePath), { recursive: true });
  await writeFile(config, 'model = "keep"\n', "utf8");
  await writeFile(agentTarget, 'name = "my-backend-agent"\n', "utf8");
  await writeFile(skillTarget, "my existing instructions\n", "utf8");
  await writeFile(agentTemplatePath, 'name = "backend-gpt"\n', "utf8");
  await writeFile(skillTemplatePath, "---\nname: sol-dsh-codex-team\n---\n", "utf8");
  const result = await installCodexMcp({ projectRoot, codexHome, configPath: config, agentTemplatePath, skillTemplatePath });
  assert.equal(result.backedUp, true);
  const configBackup = (await readdir(codexHome)).find((name) => name.startsWith("config.toml.sol-team."));
  const agentBackup = (await readdir(path.dirname(agentTarget))).find((name) => name.startsWith("backend-gpt.toml.sol-team."));
  const skillBackup = (await readdir(path.dirname(skillTarget))).find((name) => name.startsWith("SKILL.md.sol-team."));
  assert.equal(await readFile(path.join(codexHome, configBackup), "utf8"), 'model = "keep"\n');
  assert.equal(await readFile(path.join(path.dirname(agentTarget), agentBackup), "utf8"), 'name = "my-backend-agent"\n');
  assert.equal(await readFile(path.join(path.dirname(skillTarget), skillBackup), "utf8"), "my existing instructions\n");
  await rm(root, { recursive: true, force: true });
});
