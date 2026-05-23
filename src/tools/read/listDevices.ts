import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext, ToolModule } from "../types.js";
import { fmtTime, resolveSiteId, runTool } from "../util.js";

export const listDevicesTool: ToolModule = {
  name: "list_devices",
  tier: "safe-read",
  register(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
      "list_devices",
      {
        title: "List devices",
        description:
          "List APs, switches and gateways at a site, with model, IP, status, " +
          "firmware version and last-seen timestamp.",
        inputSchema: {
          siteId: z.string().optional().describe("Override the default site (OMADA_SITE_ID)."),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async (args) =>
        runTool("list_devices", async () => {
          const siteId = resolveSiteId(ctx, args);
          const devices = await ctx.client.listDevices(siteId);
          if (devices.length === 0) {
            return `No devices found at site ${siteId}.`;
          }
          const lines = devices.map((d) => {
            const model = d.modelName ?? d.model ?? "";
            const fw = d.firmwareVersion ? `fw ${d.firmwareVersion}` : "";
            const status = d.status !== undefined ? `status=${d.status}` : "";
            const seen = `seen ${fmtTime(d.lastSeen)}`;
            const meta = [model, d.ip, status, fw, seen].filter(Boolean).join("  ");
            return `- ${d.name}  [${d.type}, ${d.mac}]  ${meta}`;
          });
          return `${devices.length} device(s) at site ${siteId}:\n${lines.join("\n")}`;
        }),
    );
  },
};
