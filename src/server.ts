import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

export const SERVER_NAME = "omada-mcp";
export const SERVER_VERSION = "0.1.0";

/**
 * Phase 0: a minimal MCP server that starts over stdio and registers zero
 * tools. The capability-gated tool registry, Omada client and HTTP transport
 * arrive in later phases.
 */
export async function startServer(): Promise<void> {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdout is reserved for the MCP JSON-RPC stream; status goes to stderr.
  process.stderr.write(`[${SERVER_NAME}] ${SERVER_VERSION} started on stdio (0 tools)\n`);
}
