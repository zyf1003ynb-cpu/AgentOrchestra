import path from "node:path";
import { AcpSession } from "../src/adapters/acp-agent.mjs";
import { getDshAcpCommand } from "../src/dsh-command.mjs";

const workspaceRoot = path.resolve(process.env.SOL_TEAM_WORKSPACE_ROOT ?? process.cwd());
const client = new AcpSession({ command: getDshAcpCommand(), args: ["--profile", "acp"] }, { cwd: workspaceRoot, allowedPaths: [] });
try {
  console.log("INIT", JSON.stringify(await client.initialize()));
  const session = await client.newSession(workspaceRoot);
  console.log("NEW", JSON.stringify(session));
  const sessionId = typeof session === "string" ? session : session.sessionId;
  const selected = await client.setModel(sessionId, '["deepseek-account","deepseek-flash"]');
  console.log("MODEL", JSON.stringify(selected));
  await client.close();
} catch (error) {
  await client.close().catch(() => {});
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
