import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext, ToolModule } from "../types.js";
import { fmtBytes, resolveSiteId, runTool } from "../util.js";

export const listClientsTool: ToolModule = {
  name: "list_clients",
  tier: "safe-read",
  register(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
      "list_clients",
      {
        title: "List clients",
        description:
          "List connected clients (wired + wireless) at a site, with SSID, " +
          "AP, band, channel, RSSI, Tx/Rx rate and total traffic. Also returns " +
          "site summary counts.",
        inputSchema: {
          siteId: z.string().optional().describe("Override the default site."),
          pageSize: z
            .number()
            .int()
            .positive()
            .max(1000)
            .optional()
            .describe("Max rows per page (1-1000, default 100)."),
          page: z.number().int().positive().optional().describe("Page number (default 1)."),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async (args) =>
        runTool("list_clients", async () => {
          const siteId = resolveSiteId(ctx, args);
          const opts: { page?: number; pageSize?: number } = {};
          if (args.page !== undefined) opts.page = args.page;
          if (args.pageSize !== undefined) opts.pageSize = args.pageSize;
          const resp = await ctx.client.listClients(siteId, opts);

          const stat = resp.clientStat ?? {};
          const summary =
            `Summary: total=${stat.total ?? "?"}  ` +
            `wireless=${stat.wireless ?? "?"}  wired=${stat.wired ?? "?"}  ` +
            `2g=${stat.num2g ?? "?"}  5g=${stat.num5g ?? "?"}  6g=${stat.num6g ?? "?"}`;

          if (resp.data.length === 0) {
            return `${summary}\nNo clients matched this page.`;
          }
          const lines = resp.data.map((c) => {
            const where = c.wireless
              ? `${c.ssid ?? "?"} @ ${c.apName ?? "?"} ch${c.channel ?? "?"}`
              : "wired";
            const sig = c.rssi !== undefined ? `rssi=${c.rssi}dBm` : "";
            const tx = c.txRate !== undefined ? `tx=${c.txRate}` : "";
            const rx = c.rxRate !== undefined ? `rx=${c.rxRate}` : "";
            const traffic = `↓${fmtBytes(c.trafficDown)} ↑${fmtBytes(c.trafficUp)}`;
            const cells = [where, sig, tx, rx, traffic].filter(Boolean).join("  ");
            return `- ${c.name ?? c.hostName ?? c.mac}  [${c.mac}, ${c.ip ?? "—"}]  ${cells}`;
          });
          const header =
            `${summary}\n` +
            `Showing ${resp.data.length} of ${resp.totalRows ?? "?"} (page ${resp.currentPage ?? "?"}, size ${resp.currentSize ?? "?"}):`;
          return `${header}\n${lines.join("\n")}`;
        }),
    );
  },
};
