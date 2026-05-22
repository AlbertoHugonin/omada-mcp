import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CapabilityTier } from "../capability.js";
import type { Config } from "../config.js";
import type { OmadaClient } from "../omada/client.js";

/** Shared dependencies handed to every tool at registration time. */
export interface ToolContext {
  client: OmadaClient;
  config: Config;
}

/** A single tool: its name, the capability tier it requires, and a registrar. */
export interface ToolModule {
  name: string;
  tier: CapabilityTier;
  register(server: McpServer, ctx: ToolContext): void;
}
