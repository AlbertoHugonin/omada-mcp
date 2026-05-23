import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext, ToolModule } from "../types.js";
import { resolveSiteId, runTool } from "../util.js";

export const getSsidTool: ToolModule = {
  name: "get_ssid",
  tier: "safe-read",
  register(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
      "get_ssid",
      {
        title: "Get SSID detail",
        description:
          "Full SSID configuration. If `wlanId` is omitted, the tool finds the " +
          "owning WLAN group automatically via list_ssids.",
        inputSchema: {
          ssidId: z.string().min(1).describe("SSID id (from list_ssids)."),
          wlanId: z.string().optional().describe("WLAN-group id (auto-discovered if omitted)."),
          siteId: z.string().optional().describe("Override the default site."),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async (args) =>
        runTool("get_ssid", async () => {
          const siteId = resolveSiteId(ctx, args);
          let wlanId = args.wlanId;
          if (!wlanId) {
            const groups = await ctx.client.listSiteSsids(siteId);
            const match = groups.find((g) => g.ssidList.some((s) => s.ssidId === args.ssidId));
            if (!match) {
              return `SSID ${args.ssidId} not found at site ${siteId}.`;
            }
            wlanId = match.wlanId;
          }
          const detail = await ctx.client.getSsid(siteId, wlanId, args.ssidId);
          return `SSID detail (wlanId: ${wlanId}, ssidId: ${args.ssidId}):\n${JSON.stringify(detail, null, 2)}`;
        }),
    );
  },
};
