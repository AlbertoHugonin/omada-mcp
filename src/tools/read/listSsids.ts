import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext, ToolModule } from "../types.js";
import { resolveSiteId, runTool } from "../util.js";

export const listSsidsTool: ToolModule = {
  name: "list_ssids",
  tier: "safe-read",
  register(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
      "list_ssids",
      {
        title: "List SSIDs",
        description:
          "List all SSIDs at a site, grouped by their WLAN group. Returns " +
          "wlanId/wlanName and the ssidId/ssidName for each SSID — use those " +
          "ids with get_ssid for full SSID configuration.",
        inputSchema: {
          siteId: z.string().optional().describe("Override the default site."),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async (args) =>
        runTool("list_ssids", async () => {
          const siteId = resolveSiteId(ctx, args);
          const groups = await ctx.client.listSiteSsids(siteId);
          if (groups.length === 0) {
            return `No WLAN groups / SSIDs found at site ${siteId}.`;
          }
          const blocks = groups.map((g) => {
            if (g.ssidList.length === 0) {
              return `WLAN group "${g.wlanName}"  [wlanId: ${g.wlanId}]\n  (no SSIDs)`;
            }
            const rows = g.ssidList.map((s) => `  - ${s.ssidName}  [ssidId: ${s.ssidId}]`);
            return `WLAN group "${g.wlanName}"  [wlanId: ${g.wlanId}]\n${rows.join("\n")}`;
          });
          return blocks.join("\n\n");
        }),
    );
  },
};
