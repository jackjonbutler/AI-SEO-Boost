// src/index.ts
// Entry point for the AI SEO Boost MCP server.
// Run after build: `node dist/index.js`
// Dev mode:       `npm run dev` (uses tsx to run TypeScript directly)

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./tools/index.js";

const server = new McpServer({
  name: "ai-seo-boost",
  version: "1.0.0",
});

registerAllTools(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // IMPORTANT: stderr only — writing to stdout corrupts the JSON-RPC stream
  // and silently breaks every tool call. See RESEARCH.md Pitfall 1.
  console.error("AI SEO Boost MCP Server running on stdio");
}

main().catch((err: unknown) => {
  // Fatal error during startup. Log to stderr (stdout is reserved for JSON-RPC)
  // and exit with non-zero so the MCP host knows the server failed to start.
  console.error("Fatal:", err);
  process.exit(1);
});
