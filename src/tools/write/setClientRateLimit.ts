import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { diff, postApplyReport, statePreview } from "../dryRun.js";
import type { ToolContext, ToolModule } from "../types.js";
import { resolveSiteId, runTool } from "../util.js";

/**
 * Rate-limit modes (from the Open API):
 *   0 — Custom: use customRateLimit (this tool's primary path).
 *   1 — Profile: use a pre-defined rateLimitProfileId.
 */
export const setClientRateLimitTool: ToolModule = {
  name: "set_client_rate_limit",
  tier: "ops-write",
  register(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
      "set_client_rate_limit",
      {
        title: "Set client rate limit",
        description:
          "Apply per-client rate limiting. Up/down limit values are in the unit " +
          "selected (1=Kbps, 2=Mbps), in the range 1-1024. Set enable=false to " +
          "remove a direction's limit. Defaults to dryRun:true.",
        inputSchema: {
          clientMac: z.string().min(1),
          upEnable: z.boolean().optional(),
          upLimit: z.number().int().min(1).max(1024).optional(),
          upUnit: z.enum(["Kbps", "Mbps"]).optional().describe("Up-limit unit."),
          downEnable: z.boolean().optional(),
          downLimit: z.number().int().min(1).max(1024).optional(),
          downUnit: z.enum(["Kbps", "Mbps"]).optional(),
          dryRun: z.boolean().optional(),
          siteId: z.string().optional(),
        },
        annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      async (args) =>
        runTool("set_client_rate_limit", async () => {
          const siteId = resolveSiteId(ctx, args);
          const dryRun = args.dryRun ?? true;

          const client = await ctx.client.getClient(siteId, args.clientMac);
          // The client detail carries the existing rate-limit settings. Treat
          // a missing block as "unconfigured custom mode".
          const existing = ((client as unknown as { rateLimit?: Record<string, unknown> })
            .rateLimit ?? {}) as Record<string, unknown>;

          const readBool = (v: unknown, def: boolean): boolean =>
            typeof v === "boolean" ? v : def;
          const readNum = (v: unknown, def: number): number => (typeof v === "number" ? v : def);
          const unitFor = (u: "Kbps" | "Mbps" | undefined, fallback: number): number =>
            u === "Kbps" ? 1 : u === "Mbps" ? 2 : fallback;

          interface RateLimitBody {
            upEnable: boolean;
            upUnit: number;
            upLimit: number;
            downEnable: boolean;
            downUnit: number;
            downLimit: number;
          }
          const before: RateLimitBody = {
            upEnable: readBool(existing.upEnable, false),
            upUnit: readNum(existing.upUnit, 1),
            upLimit: readNum(existing.upLimit, 0),
            downEnable: readBool(existing.downEnable, false),
            downUnit: readNum(existing.downUnit, 1),
            downLimit: readNum(existing.downLimit, 0),
          };
          const proposed: RateLimitBody = {
            upEnable: args.upEnable ?? before.upEnable,
            upUnit: unitFor(args.upUnit, before.upUnit),
            upLimit: args.upLimit ?? before.upLimit,
            downEnable: args.downEnable ?? before.downEnable,
            downUnit: unitFor(args.downUnit, before.downUnit),
            downLimit: args.downLimit ?? before.downLimit,
          };
          const changes = diff(before, proposed);

          const target = `${client.name ?? client.hostName ?? client.mac} [${client.mac}]`;
          if (dryRun) {
            return statePreview({ what: "rate limit", target, changes, dryRun: true });
          }

          await ctx.client.setClientRateLimit(siteId, args.clientMac, {
            mode: 0,
            customRateLimit: proposed,
          });
          const after = await ctx.client.getClient(siteId, args.clientMac);
          const actual = ((after as unknown as { rateLimit?: Record<string, unknown> }).rateLimit ??
            {}) as Record<string, unknown>;
          return [
            statePreview({ what: "rate limit", target, changes, dryRun: false }),
            postApplyReport({ what: "rate limit", target, before, actual, proposed }),
          ].join("\n\n");
        }),
    );
  },
};
