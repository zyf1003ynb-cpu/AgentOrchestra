export function getDshAcpCommand(env = process.env, platform = process.platform) {
  const configured = env.SOL_DSH_ACP_COMMAND?.trim();
  return configured || (platform === "win32" ? "dsh.cmd" : "dsh");
}
