import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logger } from "../../logger.js";
import type { ToolContext, ToolModule } from "../types.js";

export const listSitesTool: ToolModule = {
  name: "list_sites",
  tier: "safe-read",
  register(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
      "list_sites",
      {
        title: "List sites",
        description:
          "List all sites on the Omada controller. Returns each site's id, " +
          "name, region and time zone — useful as a starting point and to find " +
          "the siteId that other tools need.",
        inputSchema: {},
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async () => {
        try {
          const sites = await ctx.client.listSites();
          if (sites.length === 0) {
            return { content: [{ type: "text", text: "No sites found on this controller." }] };
          }
          const lines = sites.map((site) => {
            const extra = [site.region, site.timeZone].filter(Boolean).join(", ");
            return `- ${site.name}  [siteId: ${site.siteId}]${extra ? `  (${extra})` : ""}`;
          });
          const text = `${sites.length} site(s) on the controller:\n${lines.join("\n")}`;
          return { content: [{ type: "text", text }] };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error("list_sites failed", { error: message });
          return {
            isError: true,
            content: [{ type: "text", text: `list_sites failed: ${message}` }],
          };
        }
      },
    );
  },
};
