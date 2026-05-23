import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext, ToolModule } from "../types.js";
import { fmtTime, resolveSiteId, runTool } from "../util.js";

/** Compare MACs case-insensitively, ignoring dashes/colons. */
function macsEqual(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/[-:]/g, "").toLowerCase();
  return norm(a) === norm(b);
}

export const getDeviceTool: ToolModule = {
  name: "get_device",
  tier: "safe-read",
  register(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
      "get_device",
      {
        title: "Get device detail",
        description:
          "Get detail for one device by MAC. For APs, also includes per-band " +
          "radio config (channel, width, Tx power). Use list_devices to find MACs.",
        inputSchema: {
          deviceMac: z.string().min(1).describe("MAC, e.g. 'A8-29-48-C1-BB-C0'."),
          siteId: z.string().optional().describe("Override the default site."),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async (args) =>
        runTool("get_device", async () => {
          const siteId = resolveSiteId(ctx, args);
          const devices = await ctx.client.listDevices(siteId);
          const row = devices.find((d) => macsEqual(d.mac, args.deviceMac));
          if (!row) {
            return `Device ${args.deviceMac} not found at site ${siteId}.`;
          }
          const baseLines = [
            `Name:     ${row.name}`,
            `MAC:      ${row.mac}`,
            `Type:     ${row.type}`,
            `Model:    ${row.modelName ?? row.model ?? "—"}`,
            `IP:       ${row.ip ?? "—"}`,
            `Status:   ${row.status ?? "—"}`,
            `Firmware: ${row.firmwareVersion ?? "—"}`,
            `Last seen: ${fmtTime(row.lastSeen)}`,
          ];

          if (row.type !== "ap") {
            return [
              `Device detail (basic — full detail for ${row.type} devices arrives in a later phase):`,
              ...baseLines,
            ].join("\n");
          }

          // For APs, also fetch detail + radio config in parallel.
          const [info, radios] = await Promise.all([
            ctx.client.getApInfo(siteId, row.mac),
            ctx.client.getApRadioConfig(siteId, row.mac),
          ]);

          const radioLines: string[] = [];
          const bands: [string, typeof radios.radioSetting2g][] = [
            ["2.4 GHz", radios.radioSetting2g],
            ["5 GHz", radios.radioSetting5g],
            ["6 GHz", radios.radioSetting6g],
          ];
          for (const [name, r] of bands) {
            if (!r) continue;
            radioLines.push(
              `  ${name}: enable=${r.radioEnable ?? "—"}  channel=${r.channel ?? "—"}  ` +
                `width=${r.channelWidth ?? "—"}  txPower=${r.txPower ?? "—"} (level ${r.txPowerLevel ?? "—"})`,
            );
          }

          return [
            "AP detail:",
            ...baseLines,
            `Show model:  ${info.showModel ?? "—"}`,
            `WLAN group:  ${info.wlanId ?? "—"}`,
            "",
            "Radio config:",
            ...(radioLines.length > 0 ? radioLines : ["  (no radios reported)"]),
          ].join("\n");
        }),
    );
  },
};
