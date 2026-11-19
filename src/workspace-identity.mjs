import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { stat } from "node:fs/promises";
import crypto from "node:crypto";

const execFileAsync = promisify(execFile);

async function defaultGitCommonDirResolver(workspaceRoot) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", workspaceRoot, "rev-parse", "--git-common-dir"], {
      windowsHide: true,
      timeout: 5000,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function resolveWorkspaceIdentity(workspaceRoot, {
  gitCommonDirResolver = defaultGitCommonDirResolver,
} = {}) {
  if (typeof workspaceRoot !== "string" || !workspaceRoot.trim()) {
    throw new TypeError("workspaceRoot must be a non-empty string");
  }
  const normalizedRoot = path.resolve(workspaceRoot);
  const info = await stat(normalizedRoot);
  if (!info.isDirectory()) throw new Error("workspaceRoot must be a directory");

  const gitCommonDir = await gitCommonDirResolver(normalizedRoot);
  const canonicalProjectRoot = gitCommonDir
    ? path.resolve(normalizedRoot, gitCommonDir)
    : normalizedRoot;
  const kind = gitCommonDir ? "git" : "directory";
  const projectId = crypto
    .createHash("sha256")
    .update(`${kind}:${canonicalProjectRoot.toLowerCase()}`)
    .digest("hex");

  return {
    workspaceRoot: normalizedRoot,
    canonicalProjectRoot,
    kind,
    projectId,
  };
}
