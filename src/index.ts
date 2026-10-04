#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createServer } from "./server.js";
import { loadConfig } from "./config.js";

async function main() {
  const server: McpServer = createServer(loadConfig());
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdout 僅供 MCP 協定使用；診斷訊息應輸出至 stderr。
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
