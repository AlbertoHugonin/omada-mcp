import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { logger, registerSecret, setLogLevel } from "./logger.js";
import { OmadaClient } from "./omada/client.js";
import { registerTools } from "./tools/registry.js";

export const SERVER_NAME = "omada-mcp";
export const SERVER_VERSION = "0.1.0";

/**
 * Boots the MCP server: load config, build the Omada client, register the
 * capability-gated tools and connect a transport.
 */
export async function startServer(): Promise<void> {
  const config = loadConfig();
  setLogLevel(config.logLevel);
  registerSecret(config.clientSecret);

  if (config.transport === "http") {
    throw new Error(
      "HTTP transport is not implemented yet — use MCP_TRANSPORT=stdio (HTTP arrives in Phase 5).",
    );
  }

  const client = new OmadaClient(config);
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerTools(server, { client, config });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdout is reserved for the MCP JSON-RPC stream; status goes to stderr.
  logger.info(`${SERVER_NAME} ${SERVER_VERSION} started on stdio`, {
    profile: config.capabilityProfile,
    controller: config.baseUrl,
  });
}
