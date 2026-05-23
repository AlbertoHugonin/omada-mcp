import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext, ToolModule } from "../types.js";
import { resolveSiteId, runTool } from "../util.js";

export const getApRadiosTool: ToolModule = {
  name: "get_ap_radios",
  tier: "safe-read",
  register(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
      "get_ap_radios",
      {
        title: "Get AP radio config",
        description:
          "Per-band radio configuration for one AP: channel, channel width, " +
          "Tx power and Tx-power level for 2.4/5/6 GHz. Use list_devices to find " +
          "the AP MAC.",
        inputSchema: {
          apMac: z.string().min(1).describe("AP MAC, e.g. 'A8-29-48-C1-BB-C0'."),
          siteId: z.string().optional().describe("Override the default site."),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async (args) =>
        runTool("get_ap_radios", async () => {
          const siteId = resolveSiteId(ctx, args);
          const radios = await ctx.client.getApRadioConfig(siteId, args.apMac);
          const bands: [string, typeof radios.radioSetting2g][] = [
            ["2.4 GHz", radios.radioSetting2g],
            ["5 GHz", radios.radioSetting5g],
            ["6 GHz", radios.radioSetting6g],
          ];
          const lines: string[] = [];
          for (const [name, r] of bands) {
            if (!r) continue;
            lines.push(
              `${name}:`,
              `  radio enabled:   ${r.radioEnable ?? "—"}`,
              `  channel:         ${r.channel ?? "—"}`,
              `  channel width:   ${r.channelWidth ?? "—"}`,
              `  tx power:        ${r.txPower ?? "—"}  (level ${r.txPowerLevel ?? "—"})`,
              `  wireless mode:   ${r.wirelessMode ?? "—"}`,
              "",
            );
          }
          if (lines.length === 0) {
            return `AP ${args.apMac}: no radio config returned (AP may be offline).`;
          }
          return `AP ${args.apMac} radio config:\n${lines.join("\n").trimEnd()}`;
        }),
    );
  },
};
