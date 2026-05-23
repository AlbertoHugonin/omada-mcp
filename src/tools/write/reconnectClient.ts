import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { actionPreview } from "../dryRun.js";
import type { ToolContext, ToolModule } from "../types.js";
import { resolveSiteId, runTool } from "../util.js";

export const reconnectClientTool: ToolModule = {
  name: "reconnect_client",
  tier: "ops-write",
  register(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
      "reconnect_client",
      {
        title: "Reconnect client",
        description:
          "Force a client to reconnect (kick + rejoin). Useful for nudging a " +
          "stuck client onto a better AP / band. Defaults to dryRun:true.",
        inputSchema: {
          clientMac: z.string().min(1),
          dryRun: z.boolean().optional(),
          siteId: z.string().optional(),
        },
        annotations: { destructiveHint: true, idempotentHint: false, openWorldHint: true },
      },
      async (args) =>
        runTool("reconnect_client", async () => {
          const siteId = resolveSiteId(ctx, args);
          const dryRun = args.dryRun ?? true;
          let target = args.clientMac;
          let context = "";
          try {
            const c = await ctx.client.getClient(siteId, args.clientMac);
            target = `${c.name ?? c.hostName ?? c.mac} [${c.mac}]`;
            context = c.wireless
              ? `Currently on ${c.ssid ?? "?"} @ ${c.apName ?? "?"} ch${c.channel ?? "?"}`
              : "Wired client.";
          } catch (e) {
            context = `(could not look up current state: ${e instanceof Error ? e.message : String(e)})`;
          }
          if (!dryRun) {
            await ctx.client.reconnectClient(siteId, args.clientMac);
          }
          return actionPreview({ action: "reconnect", target, context, dryRun });
        }),
    );
  },
};
