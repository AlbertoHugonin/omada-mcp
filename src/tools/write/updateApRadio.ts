import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { diff, postApplyReport, statePreview } from "../dryRun.js";
import type { ToolContext, ToolModule } from "../types.js";
import { resolveSiteId, runTool } from "../util.js";

const BAND_KEY = {
  "2g": "radioSetting2g",
  "5g": "radioSetting5g",
  "5g1": "radioSetting5g1",
  "5g2": "radioSetting5g2",
  "6g": "radioSetting6g",
} as const;
type BandLabel = keyof typeof BAND_KEY;

/**
 * Modifies per-band radio config on one AP. The Open API encodes
 * `channel`/`channelWidth` as numeric codes inside strings — get_ap_radios
 * surfaces the current codes so callers can mirror them. "0" channel = auto.
 *
 * Brief §5 lesson 6 — channel encoding is version-dependent; this tool passes
 * the API's own representation through rather than translating to friendly
 * values.
 */
export const updateApRadioTool: ToolModule = {
  name: "update_ap_radio",
  tier: "admin",
  register(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
      "update_ap_radio",
      {
        title: "Update AP radio",
        description:
          "Modify one band's radio config on one AP — radioEnable, channel " +
          '(string, "0" = auto), channelWidth (string code), txPower (numeric) ' +
          "and/or txPowerLevel (0=Low, 1=Medium, 2=High, 3=Custom). Use " +
          "get_ap_radios to see current codes. Defaults to dryRun:true.",
        inputSchema: {
          apMac: z.string().min(1),
          band: z.enum(["2g", "5g", "5g1", "5g2", "6g"]).describe("Which radio band to modify."),
          radioEnable: z.boolean().optional(),
          channel: z.string().optional().describe('"0" = auto; else the API channel index code.'),
          channelWidth: z.string().optional().describe("API channelWidth code as string."),
          txPower: z.number().int().optional(),
          txPowerLevel: z
            .number()
            .int()
            .min(0)
            .max(3)
            .optional()
            .describe("0=Low, 1=Medium, 2=High, 3=Custom."),
          dryRun: z.boolean().optional(),
          siteId: z.string().optional(),
        },
        annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
      },
      async (args) =>
        runTool("update_ap_radio", async () => {
          const siteId = resolveSiteId(ctx, args);
          const dryRun = args.dryRun ?? true;
          const bandKey = BAND_KEY[args.band as BandLabel];

          const current = await ctx.client.getApRadioConfig(siteId, args.apMac);
          const currentBand = (current as Record<string, unknown>)[bandKey] as
            | Record<string, unknown>
            | undefined;
          if (!currentBand) {
            return `AP ${args.apMac} does not report a ${args.band} radio (does it support that band?).`;
          }

          // Merge only the fields the caller actually specified into the
          // current band block. Everything else passes through unchanged.
          const proposedBand: Record<string, unknown> = { ...currentBand };
          if (args.radioEnable !== undefined) proposedBand.radioEnable = args.radioEnable;
          if (args.channel !== undefined) proposedBand.channel = args.channel;
          if (args.channelWidth !== undefined) proposedBand.channelWidth = args.channelWidth;
          if (args.txPower !== undefined) proposedBand.txPower = args.txPower;
          if (args.txPowerLevel !== undefined) proposedBand.txPowerLevel = args.txPowerLevel;

          const changes = diff(currentBand, proposedBand);
          const target = `${args.apMac} band ${args.band}`;
          if (dryRun) {
            return statePreview({ what: "AP radio", target, changes, dryRun: true });
          }

          // Full body: copy the full current config and replace only the
          // chosen band — the PATCH endpoint accepts the full multi-band
          // object (brief §5 lesson 1).
          const fullBody = { ...(current as Record<string, unknown>), [bandKey]: proposedBand };
          await ctx.client.updateApRadioConfig(siteId, args.apMac, fullBody);

          const reread = await ctx.client.getApRadioConfig(siteId, args.apMac);
          const actualBand = (reread as Record<string, unknown>)[bandKey] ?? {};

          return [
            statePreview({ what: "AP radio", target, changes, dryRun: false }),
            postApplyReport({
              what: "AP radio",
              target,
              before: currentBand,
              actual: actualBand,
              proposed: proposedBand,
            }),
          ].join("\n\n");
        }),
    );
  },
};
