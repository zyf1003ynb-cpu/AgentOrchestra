import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveWorkspaceIdentity } from "../src/workspace-identity.mjs";
import { DshAcpWorker } from "../src/dsh-acp-worker.mjs";
const workspaceRoot = await mkdtemp(path.join(tmpdir(), "sol-dsh-real-"));
const identity = await resolveWorkspaceIdentity(workspaceRoot, { gitCommonDirResolver: async () => null });
const worker = new DshAcpWorker({ teamMode: { status: async () => ({ enabled: true, projectId: identity.projectId }) }, onEvent: event => process.stderr.write(`${event.status}${event.error ? `: ${event.error}` : ""}\\n`) });
const task = await worker.startFrontendTask({ workspaceRoot, prompt: "Create frontend-proof.txt containing exactly REAL_DSH_OK. Do not modify any other file.", allowedPaths: ["frontend-proof.txt"], timeoutMs: 120000 });
const result = await worker.wait(task.taskId);
let fileContent = null; try { fileContent = await readFile(path.join(workspaceRoot, "frontend-proof.txt"), "utf8"); } catch {}
process.stdout.write(`${JSON.stringify({ status: result.status, model: result.modelName, error: result.error, result: result.result, fileContent, workspaceRoot })}\\n`);
