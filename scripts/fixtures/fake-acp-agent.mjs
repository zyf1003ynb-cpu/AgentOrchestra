import { createInterface } from "node:readline";
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
let model = '["deepseek-official","deepseek-v4-flash"]';
const options = [{ id: "model", name: "Model", category: "model", type: "select", currentValue: model, options: [
  { group: "deepseek-account", name: "DeepSeek Account", options: [{ value: '["deepseek-account","deepseek-flash"]', name: "DeepSeek-V41-Flash" }] },
  { group: "deepseek-official", name: "DeepSeek", options: [{ value: '["deepseek-official","deepseek-flash"]', name: "DeepSeek-V41-Flash" }] },
] }];
for await (const line of input) {
  const message = JSON.parse(line); const { id, method, params = {} } = message;
  let result = {};
  if (method === "initialize") result = { protocolVersion: 1, agentInfo: { name: "fake-acp", version: "1" }, agentCapabilities: { sessionCapabilities: { close: {} } }, authMethods: [] };
  else if (method === "session/new") result = { sessionId: "fake-session", configOptions: options };
  else if (method === "session/set_config_option") { model = params.value; options[0].currentValue = model; result = { configOptions: options }; }
  else if (method === "session/prompt") result = { stopReason: "end_turn", text: "ACP_FAKE_OK" };
  else if (method === "session/close") result = {};
  if (id !== undefined) process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}
