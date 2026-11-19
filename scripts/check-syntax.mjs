import { readdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function findJavaScriptFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await findJavaScriptFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith(".mjs")) files.push(fullPath);
  }
  return files;
}

const files = await Promise.all(["src", "test", "scripts"].map((directory) =>
  findJavaScriptFiles(path.join(root, directory))));

for (const file of files.flat()) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
