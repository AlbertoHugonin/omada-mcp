import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext, ToolModule } from "../types.js";
import { fmtBytes, fmtTime, resolveSiteId, runTool } from "../util.js";

export const getClientTool: ToolModule = {
  name: "get_client",
  tier: "safe-read",
  register(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
      "get_client",
      {
        title: "Get client detail",
        description:
          "Get full detail for one client by MAC: connection (SSID, AP, " +
          "channel, RSSI, SNR, rates), addressing, traffic, uptime and lifecycle.",
        inputSchema: {
          clientMac: z.string().min(1).describe("Client MAC, e.g. '5C-1B-F4-7C-25-C9'."),
          siteId: z.string().optional().describe("Override the default site."),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async (args) =>
        runTool("get_client", async () => {
          const siteId = resolveSiteId(ctx, args);
          const c = await ctx.client.getClient(siteId, args.clientMac);
          const ipv6 =
            c.ipv6List && c.ipv6List.length > 0 ? `\nIPv6:        ${c.ipv6List.join(", ")}` : "";
          const wireless = c.wireless
            ? [
                "",
                "Wireless:",
                `  SSID:          ${c.ssid ?? "—"}`,
                `  AP:            ${c.apName ?? "—"}  [${c.apMac ?? "—"}]`,
                `  Channel:       ${c.channel ?? "—"}  (radioId ${c.radioId ?? "—"})`,
                `  RSSI / SNR:    ${c.rssi ?? "—"} dBm / ${c.snr ?? "—"} dB  (rank ${c.signalRank ?? "—"})`,
                `  Tx / Rx rate:  ${c.txRate ?? "—"} / ${c.rxRate ?? "—"}`,
                `  Power save:    ${c.powerSave ?? "—"}`,
              ].join("\n")
            : "";
          return [
            `Client ${c.name ?? c.hostName ?? c.mac}`,
            `MAC:         ${c.mac}`,
            `IP:          ${c.ip ?? "—"}${ipv6}`,
            `Vendor:      ${c.vendor ?? "—"}`,
            `Device:      ${c.deviceType ?? "—"}  (${c.deviceCategory ?? "—"}, OS ${c.osName ?? "—"})`,
            `Connection:  ${c.wireless ? "wireless" : "wired"}  via ${c.connectDevType ?? "—"}`,
            `Active:      ${c.active ?? "—"}  blocked=${c.blocked ?? "—"}  guest=${c.guest ?? "—"}`,
            wireless,
            "",
            "Traffic:",
            `  Down:        ${fmtBytes(c.trafficDown)}`,
            `  Up:          ${fmtBytes(c.trafficUp)}`,
            `  Uptime:      ${c.uptime ?? "—"} s`,
            `  Last seen:   ${fmtTime(c.lastSeen)}`,
          ]
            .filter((line) => line !== undefined && line !== null)
            .join("\n");
        }),
    );
  },
};
