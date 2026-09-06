import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { diff, postApplyReport, statePreview } from "../dryRun.js";
import type { ToolContext, ToolModule } from "../types.js";
import { resolveSiteId, runTool } from "../util.js";

const ipv4Schema = z.string().refine(
  (value) => {
    const parts = value.split(".");
    return (
      parts.length === 4 &&
      parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255)
    );
  },
  { message: "fixedIp must be a valid IPv4 address" },
);

export const setClientFixedIpTool: ToolModule = {
  name: "set_client_fixed_ip",
  tier: "ops-write",
  register(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
      "set_client_fixed_ip",
      {
        title: "Set client fixed IP",
        description:
          "Set a client's fixed IPv4 address using the Omada client update API. " +
          "If fixedIp is omitted, the client's current IPv4 address is retained and made fixed. " +
          "Defaults to dryRun:true and re-reads the client after applying.",
        inputSchema: {
          clientMac: z.string().min(1),
          fixedIp: ipv4Schema.optional(),
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
        runTool("set_client_fixed_ip", async () => {
          const siteId = resolveSiteId(ctx, args);
          const dryRun = args.dryRun ?? true;
          const client = await ctx.client.getClient(siteId, args.clientMac);
          const fixedIp = args.fixedIp ?? client.ip;

          if (!fixedIp) {
            throw new Error(
              "fixedIp was not supplied and the client has no current IPv4 address to preserve",
            );
          }

          const before = { fixedIp: client.fixedIp ?? null };
          const proposed = { fixedIp };
          const changes = diff(before, proposed);
          const target = `${client.name ?? client.hostName ?? client.mac} [${client.mac}]`;

          if (dryRun) {
            return statePreview({ what: "client fixed IP", target, changes, dryRun: true });
          }

          await ctx.client.updateClient(siteId, args.clientMac, { fixedIp });
          const after = await ctx.client.getClient(siteId, args.clientMac);
          const actual = { fixedIp: after.fixedIp ?? null };

          return [
            statePreview({ what: "client fixed IP", target, changes, dryRun: false }),
            postApplyReport({ what: "client fixed IP", target, before, actual, proposed }),
          ].join("\n\n");
        }),
    );
  },
};
