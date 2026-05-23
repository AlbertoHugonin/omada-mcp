import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext, ToolModule } from "../types.js";
import { resolveSiteId, runTool } from "../util.js";

const BAND_STEERING_MODE: Record<number, string> = {
  0: "off",
  1: "prefer 5 GHz",
  2: "balance",
  3: "force 5 GHz",
};

export const getSiteSettingsTool: ToolModule = {
  name: "get_site_settings",
  tier: "safe-read",
  register(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
      "get_site_settings",
      {
        title: "Get site settings",
        description:
          "Aggregate site-level wireless settings: roaming (fast roaming, AI " +
          "roaming, force-disassociation, non-stick, 802.11k report), band " +
          "steering and mesh. Reads three Open API endpoints in parallel.",
        inputSchema: {
          siteId: z.string().optional().describe("Override the default site."),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async (args) =>
        runTool("get_site_settings", async () => {
          const siteId = resolveSiteId(ctx, args);
          const [roaming, bandSteering, mesh] = await Promise.all([
            ctx.client.getSiteRoaming(siteId),
            ctx.client.getSiteBandSteering(siteId),
            ctx.client.getSiteMesh(siteId),
          ]);

          const r = roaming.roaming ?? {};
          const bs = bandSteering.bandSteeringForMultiBand ?? {};
          const m = mesh.mesh ?? {};

          return [
            `Site settings for ${siteId}:`,
            "",
            "Roaming:",
            `  Fast roaming (802.11r):     ${r.fastRoamingEnable ?? "—"}`,
            `  AI roaming:                 ${r.aiRoamingEnable ?? "—"}`,
            `  Force disassociation:       ${r.forceDisassociationEnable ?? "—"}`,
            `  Non-stick:                  ${r.nonStickEnable ?? "—"}`,
            `  802.11k dual-band report:   ${r.dualBand11kReportEnable ?? "—"}`,
            "",
            "Band steering:",
            `  Mode:                       ${bs.mode ?? "—"}` +
              (bs.mode !== undefined ? `  (${BAND_STEERING_MODE[bs.mode] ?? "unknown"})` : ""),
            "",
            "Mesh:",
            `  Enabled:                    ${m.meshEnable ?? "—"}`,
            `  Auto-failover:              ${m.autoFailoverEnable ?? "—"}`,
            `  Default gateway forwarding: ${m.defGatewayEnable ?? "—"}`,
            `  Full sector:                ${m.fullSector ?? "—"}`,
          ].join("\n");
        }),
    );
  },
};
