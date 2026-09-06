import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { startHttpServer } from "./httpServer.js";
import { logger, registerSecret, setLogLevel } from "./logger.js";
import { OmadaClient } from "./omada/client.js";
import { SERVER_NAME, SERVER_VERSION } from "./serverInfo.js";
import { registerTools } from "./tools/registry.js";

export { SERVER_NAME, SERVER_VERSION } from "./serverInfo.js";

/**
 * Boots the MCP server: load config, build the Omada client, register the
 * capability-gated tools and connect the requested transport.
 */
export async function startServer(): Promise<void> {
  const config = loadConfig();
  setLogLevel(config.logLevel);
  registerSecret(config.clientSecret);
  if (config.httpApiKey) registerSecret(config.httpApiKey);

  const client = new OmadaClient(config);

  if (config.transport === "http") {
    await startHttpServer(client, config);
    return;
  }

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
