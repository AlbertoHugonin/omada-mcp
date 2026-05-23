import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { diff, postApplyReport, statePreview } from "../dryRun.js";
import type { ToolContext, ToolModule } from "../types.js";
import { resolveSiteId, runTool } from "../util.js";

const MODES = { off: 0, "prefer-5g": 1, balance: 2, "force-5g": 3 } as const;
type ModeLabel = keyof typeof MODES;

export const updateBandSteeringTool: ToolModule = {
  name: "update_band_steering",
  tier: "admin",
  register(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
      "update_band_steering",
      {
        title: "Update band steering",
        description: "Configure the site's band-steering mode. Defaults to dryRun:true.",
        inputSchema: {
          mode: z.enum(["off", "prefer-5g", "balance", "force-5g"]).describe("Band-steering mode."),
          dryRun: z.boolean().optional(),
          siteId: z.string().optional(),
        },
        annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
      },
      async (args) =>
        runTool("update_band_steering", async () => {
          const siteId = resolveSiteId(ctx, args);
          const dryRun = args.dryRun ?? true;
          const proposedMode = MODES[args.mode as ModeLabel];

          const current = await ctx.client.getSiteBandSteering(siteId);
          const cur = current.bandSteeringForMultiBand ?? {};
          const before = { mode: cur.mode ?? 0 };
          const proposed = { mode: proposedMode };
          const changes = diff(before, proposed);
          if (dryRun) {
            return statePreview({
              what: "band steering",
              target: siteId,
              changes,
              dryRun: true,
            });
          }
          await ctx.client.updateBandSteering(siteId, {
            bandSteeringForMultiBand: proposed,
          });
          const reread = await ctx.client.getSiteBandSteering(siteId);
          const actual = { mode: reread.bandSteeringForMultiBand?.mode ?? 0 };
          return [
            statePreview({
              what: "band steering",
              target: siteId,
              changes,
              dryRun: false,
            }),
            postApplyReport({
              what: "band steering",
              target: siteId,
              before,
              actual,
              proposed,
            }),
          ].join("\n\n");
        }),
    );
  },
};
