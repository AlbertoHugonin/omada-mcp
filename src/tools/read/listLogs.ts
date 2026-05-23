import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext, ToolModule } from "../types.js";
import { resolveSiteId, runTool } from "../util.js";

function summarize(entry: Record<string, unknown>): string {
  const time = entry.time ?? entry.timeStamp ?? entry.timestamp;
  const mod = entry.module ?? entry.modName ?? "";
  const sev = entry.level ?? entry.severity ?? "";
  const text =
    entry.content ?? entry.message ?? entry.description ?? entry.event ?? JSON.stringify(entry);
  const parts = [
    typeof time === "number"
      ? `[${new Date(time).toISOString()}]`
      : typeof time === "string"
        ? `[${time}]`
        : "",
    mod ? `(${mod})` : "",
    sev ? `<${sev}>` : "",
    typeof text === "string" ? text : JSON.stringify(text),
  ].filter(Boolean);
  return parts.join(" ");
}

export const listLogsTool: ToolModule = {
  name: "list_logs",
  tier: "safe-read",
  register(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
      "list_logs",
      {
        title: "List alert log",
        description:
          "Site alert log within a time window. Defaults to the last 24 hours. " +
          "Optionally filter by module or resolved/unresolved.",
        inputSchema: {
          siteId: z.string().optional(),
          hoursAgo: z
            .number()
            .int()
            .positive()
            .max(168)
            .optional()
            .describe("Look-back window in hours (1-168, default 24)."),
          module: z.enum(["System", "Device", "Client"]).optional(),
          resolved: z
            .boolean()
            .optional()
            .describe("If set, only show resolved (true) or unresolved (false) alerts."),
          pageSize: z.number().int().positive().max(100).optional(),
          page: z.number().int().positive().optional(),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async (args) =>
        runTool("list_logs", async () => {
          const siteId = resolveSiteId(ctx, args);
          const hours = args.hoursAgo ?? 24;
          const timeEndMs = Date.now();
          const timeStartMs = timeEndMs - hours * 3600_000;
          const opts: {
            timeStartMs: number;
            timeEndMs: number;
            module?: "System" | "Device" | "Client";
            resolved?: boolean;
            page?: number;
            pageSize?: number;
          } = { timeStartMs, timeEndMs };
          if (args.module) opts.module = args.module;
          if (args.resolved !== undefined) opts.resolved = args.resolved;
          if (args.page !== undefined) opts.page = args.page;
          if (args.pageSize !== undefined) opts.pageSize = args.pageSize;

          const resp = await ctx.client.listAlerts(siteId, opts);
          const stat = resp.alertLogStat ?? {};
          const filterDesc = [
            args.module ? `module=${args.module}` : "",
            args.resolved !== undefined ? `resolved=${args.resolved}` : "",
          ]
            .filter(Boolean)
            .join(", ");
          const header =
            `Alerts in the last ${hours}h at site ${siteId}` +
            (filterDesc ? ` (${filterDesc})` : "") +
            `:\n  total=${stat.totalLogNum ?? "?"}  unresolved=${stat.unResolvedLogNum ?? "?"}  ` +
            `resolved=${stat.resolvedLogNum ?? "?"}  ` +
            `system=${stat.systemLogNum ?? "?"}  device=${stat.deviceLogNum ?? "?"}`;
          if (resp.data.length === 0) {
            return `${header}\nNo entries in this page.`;
          }
          const lines = resp.data.map((e) => `- ${summarize(e)}`);
          return `${header}\nShowing ${resp.data.length} of ${resp.totalRows ?? "?"} (page ${resp.currentPage ?? "?"}):\n${lines.join("\n")}`;
        }),
    );
  },
};
