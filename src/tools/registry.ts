import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isToolAllowed } from "../capability.js";
import { logger } from "../logger.js";
import { listSitesTool } from "./read/listSites.js";
import type { ToolContext, ToolModule } from "./types.js";

/** Every tool the server knows about, in registration order. */
const ALL_TOOLS: readonly ToolModule[] = [listSitesTool];

/**
 * Registers only the tools allowed by the active capability profile. Tools
 * above the profile are never registered with the MCP server, so the assistant
 * can neither see nor call them.
 */
export function registerTools(server: McpServer, ctx: ToolContext): void {
  const profile = ctx.config.capabilityProfile;
  const registered: string[] = [];
  const hidden: string[] = [];

  for (const tool of ALL_TOOLS) {
    if (isToolAllowed(tool.tier, profile)) {
      tool.register(server, ctx);
      registered.push(tool.name);
    } else {
      hidden.push(tool.name);
    }
  }

  logger.info(`registered ${registered.length} tool(s) for profile "${profile}"`, {
    tools: registered,
    ...(hidden.length > 0 ? { hiddenByProfile: hidden } : {}),
  });
}
