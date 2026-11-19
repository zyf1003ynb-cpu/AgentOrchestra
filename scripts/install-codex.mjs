import path from "node:path";
import os from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";
import { mkdir, readFile, rename, copyFile, writeFile } from "node:fs/promises";

const serverName = "sol_dsh_codex_team";
const quoteToml = (value) => JSON.stringify(String(value));

export async function installCodexMcp({ codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), configPath, projectRoot, nodePath = process.execPath, agentTemplatePath, skillTemplatePath, makeBackup = true } = {}) {
  if (typeof projectRoot !== "string" || !projectRoot.trim()) throw new TypeError("projectRoot is required");
  const resolvedProject = path.resolve(projectRoot);
  const resolvedCodexHome = path.resolve(codexHome);
  const config = path.resolve(configPath ?? path.join(resolvedCodexHome, "config.toml"));
  const agentTemplate = agentTemplatePath ? await readFile(agentTemplatePath) : null;
  const skillTemplate = skillTemplatePath ? await readFile(skillTemplatePath) : null;
  const section = [
    `[mcp_servers.${serverName}]`,
    `command = ${quoteToml(nodePath)}`,
    `args = [${quoteToml(path.join(resolvedProject, "src", "server.mjs"))}]`,
    `env = { SOL_TEAM_STATE_ROOT = ${quoteToml(path.join(resolvedProject, "state"))} }`,
    "enabled = true",
    "startup_timeout_sec = 30",
  ].join("\n");

  let existing = "";
  try { existing = await readFile(config, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const filtered = [];
  let skipping = false;
  for (const line of existing.replaceAll("\r\n", "\n").split("\n")) {
    const header = line.trim();
    if (header.startsWith("[") && header.endsWith("]")) {
      const name = header.slice(1, -1);
      skipping = name === `mcp_servers.${serverName}` || name.startsWith(`mcp_servers.${serverName}.`);
      if (skipping) continue;
    }
    if (!skipping) filtered.push(line);
  }
  while (filtered.length && filtered.at(-1) === "") filtered.pop();
  const next = `${filtered.join("\n")}\n\n${section}\n`;
  await mkdir(path.dirname(config), { recursive: true });
  const backupSuffix = `.sol-team.${new Date().toISOString().replaceAll(":", "-")}.bak`;
  const changed = existing !== next;
  if (makeBackup && existing && changed) await copyFile(config, `${config}${backupSuffix}`);
  if (changed) {
    const temporary = `${config}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, next, { encoding: "utf8", flag: "wx" });
    await rename(temporary, config);
  }

  let installedAgent = false;
  if (agentTemplatePath) {
    const target = path.join(resolvedCodexHome, "agents", "backend-gpt.toml");
    await mkdir(path.dirname(target), { recursive: true });
    const template = agentTemplate;
    let previous;
    try { previous = await readFile(target); } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (!previous || !previous.equals(template)) {
      if (previous && makeBackup) await copyFile(target, `${target}${backupSuffix}`);
      await writeFile(target, template);
      installedAgent = true;
    }
  }
  let skillInstalled = false;
  if (skillTemplatePath) {
    const target = path.join(resolvedCodexHome, "skills", "sol-team-mode", "SKILL.md");
    await mkdir(path.dirname(target), { recursive: true });
    const template = skillTemplate;
    let previous;
    try { previous = await readFile(target); } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (!previous || !previous.equals(template)) {
      if (previous && makeBackup) await copyFile(target, target + backupSuffix);
      await writeFile(target, template);
      skillInstalled = true;
    }
  }
  return { installed: true, configPath: config, backedUp: Boolean(makeBackup && existing && changed), agentInstalled: installedAgent, skillInstalled };
}

async function main(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value.startsWith("--")) options[value.slice(2)] = argv[++index];
  }
  const projectRoot = options.project ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const template = options["agent-template"] ?? path.join(projectRoot, "templates", "codex", "agents", "backend-gpt.toml");
  const skillTemplate = options["skill-template"] ?? path.join(projectRoot, "templates", "codex", "skills", "sol-team-mode", "SKILL.md");
  const result = await installCodexMcp({ projectRoot, nodePath: options.node ?? process.execPath, codexHome: options["codex-home"], configPath: options.config, agentTemplatePath: template, skillTemplatePath: skillTemplate, makeBackup: options["no-backup"] !== "true" });
  process.stdout.write(JSON.stringify({ ok: true, value: result }) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { await main(process.argv.slice(2)); }
  catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }) + "\n");
    process.exitCode = 1;
  }
}
