import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext, ToolModule } from "../types.js";
import { resolveSiteId, runTool } from "../util.js";

export const listKnownClientsTool: ToolModule = {
  name: "list_known_clients",
  tier: "safe-read",
  register(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
      "list_known_clients",
      {
        title: "List known clients",
        description:
          "List historical clients known to a site through the Site Insight endpoint. " +
          "This is separate from the connected-client list and is useful for compatibility diagnostics.",
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
        runTool("list_known_clients", async () => {
          const siteId = resolveSiteId(ctx, args);
          const opts: { page?: number; pageSize?: number } = {};
          if (args.page !== undefined) opts.page = args.page;
          if (args.pageSize !== undefined) opts.pageSize = args.pageSize;
          const resp = await ctx.client.listKnownClients(siteId, opts);

          if (resp.data.length === 0) {
            return "No known clients matched this page.";
          }
          const lines = resp.data.map((client) => {
            const status = client.active === undefined ? "" : `active=${client.active}`;
            const lastSeen = client.lastSeen === undefined ? "" : `lastSeen=${client.lastSeen}`;
            const details = [status, lastSeen].filter(Boolean).join("  ");
            return (
              `- ${client.name ?? client.hostName ?? client.mac}  ` +
              `[${client.mac}, ${client.ip ?? "—"}]${details ? `  ${details}` : ""}`
            );
          });
          const header =
            `Showing ${resp.data.length} of ${resp.totalRows ?? "?"} known clients ` +
            `(page ${resp.currentPage ?? "?"}, size ${resp.currentSize ?? "?"}):`;
          return `${header}\n${lines.join("\n")}`;
        }),
    );
  },
};
