import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { diff, postApplyReport, statePreview } from "../dryRun.js";
import type { ToolContext, ToolModule } from "../types.js";
import { resolveSiteId, runTool } from "../util.js";

/**
 * Modify SSID basic config. The Open API endpoint declares 9 required body
 * fields (name, band, guestNetEnable, security, broadcast, vlanEnable,
 * mloEnable, pmfMode, enable11r) so this tool GETs the full SSID detail,
 * merges in the caller's requested fields, and sends the full body back —
 * brief §5 lesson 1.
 *
 * If `wlanId` is omitted, the tool discovers it via list_ssids.
 */
export const updateSsidTool: ToolModule = {
  name: "update_ssid",
  tier: "admin",
  register(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
      "update_ssid",
      {
        title: "Update SSID",
        description:
          "Modify an SSID's basic configuration: name, band bitmask, broadcast, " +
          "802.11r, PMF mode, VLAN. Defaults to dryRun:true.",
        inputSchema: {
          ssidId: z.string().min(1),
          wlanId: z.string().optional().describe("WLAN-group id (auto-discovered if omitted)."),
          name: z.string().min(1).max(32).optional().describe("New SSID name."),
          band: z
            .number()
            .int()
            .min(1)
            .max(7)
            .optional()
            .describe(
              "Bitmask: bit0=2.4 GHz, bit1=5 GHz, bit2=6 GHz. e.g. 3 = 2.4 + 5 GHz, 7 = all.",
            ),
          broadcast: z.boolean().optional().describe("Broadcast SSID (visible network)."),
          enable11r: z.boolean().optional().describe("802.11r fast roaming."),
          pmfMode: z
            .number()
            .int()
            .min(1)
            .max(3)
            .optional()
            .describe("1=Mandatory, 2=Capable, 3=Disabled."),
          vlanEnable: z.boolean().optional(),
          vlanId: z.number().int().min(1).max(4094).optional(),
          dryRun: z.boolean().optional(),
          siteId: z.string().optional(),
        },
        annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
      },
      async (args) =>
        runTool("update_ssid", async () => {
          const siteId = resolveSiteId(ctx, args);
          const dryRun = args.dryRun ?? true;

          let wlanId = args.wlanId;
          if (!wlanId) {
            const groups = await ctx.client.listSiteSsids(siteId);
            const match = groups.find((g) => g.ssidList.some((s) => s.ssidId === args.ssidId));
            if (!match) {
              return `SSID ${args.ssidId} not found at site ${siteId}.`;
            }
            wlanId = match.wlanId;
          }

          const currentRaw = (await ctx.client.getSsid(siteId, wlanId, args.ssidId)) as
            | Record<string, unknown>
            | null
            | undefined;
          if (!currentRaw || typeof currentRaw !== "object") {
            return `Could not load current SSID detail for ${args.ssidId}.`;
          }

          // Build the proposed body — copy current then overlay only the
          // fields the caller actually specified.
          const proposed: Record<string, unknown> = { ...currentRaw };
          if (args.name !== undefined) proposed.name = args.name;
          if (args.band !== undefined) proposed.band = args.band;
          if (args.broadcast !== undefined) proposed.broadcast = args.broadcast;
          if (args.enable11r !== undefined) proposed.enable11r = args.enable11r;
          if (args.pmfMode !== undefined) proposed.pmfMode = args.pmfMode;
          if (args.vlanEnable !== undefined) proposed.vlanEnable = args.vlanEnable;
          if (args.vlanId !== undefined) proposed.vlanId = args.vlanId;

          // Surface only the fields that actually differ — including any
          // nested objects the API requires us to send unchanged.
          const changes = diff(currentRaw, proposed);
          const target = `ssid ${args.ssidId} (wlan ${wlanId})`;
          if (dryRun) {
            return statePreview({ what: "SSID basic config", target, changes, dryRun: true });
          }

          await ctx.client.updateSsidBasicConfig(siteId, wlanId, args.ssidId, proposed);

          const after = (await ctx.client.getSsid(siteId, wlanId, args.ssidId)) as Record<
            string,
            unknown
          >;
          return [
            statePreview({ what: "SSID basic config", target, changes, dryRun: false }),
            postApplyReport({
              what: "SSID basic config",
              target,
              before: currentRaw,
              actual: after,
              proposed,
            }),
          ].join("\n\n");
        }),
    );
  },
};
