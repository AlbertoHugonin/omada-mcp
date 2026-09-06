import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { diff, postApplyReport, statePreview } from "../dryRun.js";
import type { ToolContext, ToolModule } from "../types.js";
import { resolveSiteId, runTool } from "../util.js";

export const setClientNameTool: ToolModule = {
  name: "set_client_name",
  tier: "ops-write",
  register(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
      "set_client_name",
      {
        title: "Set client name",
        description:
          "Set the Omada display name for a client identified by MAC address. " +
          "Defaults to dryRun:true and re-reads the client after applying.",
        inputSchema: {
          clientMac: z.string().min(1),
          name: z.string().trim().min(1),
          dryRun: z.boolean().optional(),
          siteId: z.string().optional(),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      async (args) =>
        runTool("set_client_name", async () => {
          const siteId = resolveSiteId(ctx, args);
          const dryRun = args.dryRun ?? true;
          const client = await ctx.client.getClient(siteId, args.clientMac);
          const name = args.name.trim();

          const before = { name: client.name ?? null };
          const proposed = { name };
          const changes = diff(before, proposed);
          const target = `${client.name ?? client.hostName ?? client.mac} [${client.mac}]`;

          if (dryRun) {
            return statePreview({ what: "client name", target, changes, dryRun: true });
          }

          await ctx.client.updateClient(siteId, args.clientMac, { name });
          const after = await ctx.client.getClient(siteId, args.clientMac);
          const actual = { name: after.name ?? null };

          return [
            statePreview({ what: "client name", target, changes, dryRun: false }),
            postApplyReport({ what: "client name", target, before, actual, proposed }),
          ].join("\n\n");
        }),
    );
  },
};
