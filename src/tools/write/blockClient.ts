import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { actionPreview } from "../dryRun.js";
import type { ToolContext, ToolModule } from "../types.js";
import { resolveSiteId, runTool } from "../util.js";

export const blockClientTool: ToolModule = {
  name: "block_client",
  tier: "ops-write",
  register(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
      "block_client",
      {
        title: "Block client",
        description:
          "Block a client from joining the network. The client is immediately " +
          "disassociated and prevented from reconnecting. Reversible with " +
          "unblock_client. Defaults to dryRun:true.",
        inputSchema: {
          clientMac: z.string().min(1).describe("Client MAC, e.g. '5C-1B-F4-7C-25-C9'."),
          dryRun: z.boolean().optional(),
          siteId: z.string().optional(),
        },
        annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
      },
      async (args) =>
        runTool("block_client", async () => {
          const siteId = resolveSiteId(ctx, args);
          const dryRun = args.dryRun ?? true;
          let context = "";
          let target = args.clientMac;
          try {
            const c = await ctx.client.getClient(siteId, args.clientMac);
            target = `${c.name ?? c.hostName ?? c.mac} [${c.mac}]`;
            context = `Currently: blocked=${c.blocked ?? "?"}  active=${c.active ?? "?"}  ip=${c.ip ?? "?"}`;
          } catch (e) {
            context = `(could not look up current state: ${e instanceof Error ? e.message : String(e)})`;
          }
          if (!dryRun) {
            await ctx.client.blockClient(siteId, args.clientMac);
          }
          return actionPreview({ action: "block", target, context, dryRun });
        }),
    );
  },
};
