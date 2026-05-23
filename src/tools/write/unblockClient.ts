import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { actionPreview } from "../dryRun.js";
import type { ToolContext, ToolModule } from "../types.js";
import { resolveSiteId, runTool } from "../util.js";

export const unblockClientTool: ToolModule = {
  name: "unblock_client",
  tier: "ops-write",
  register(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
      "unblock_client",
      {
        title: "Unblock client",
        description: "Unblock a previously blocked client. Defaults to dryRun:true.",
        inputSchema: {
          clientMac: z.string().min(1),
          dryRun: z.boolean().optional(),
          siteId: z.string().optional(),
        },
        annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      async (args) =>
        runTool("unblock_client", async () => {
          const siteId = resolveSiteId(ctx, args);
          const dryRun = args.dryRun ?? true;
          let context = "";
          let target = args.clientMac;
          try {
            const c = await ctx.client.getClient(siteId, args.clientMac);
            target = `${c.name ?? c.hostName ?? c.mac} [${c.mac}]`;
            context = `Currently: blocked=${c.blocked ?? "?"}`;
          } catch (e) {
            context = `(could not look up current state: ${e instanceof Error ? e.message : String(e)})`;
          }
          if (!dryRun) {
            await ctx.client.unblockClient(siteId, args.clientMac);
          }
          return actionPreview({ action: "unblock", target, context, dryRun });
        }),
    );
  },
};
