import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { diff, statePreview } from "../dryRun.js";
import type { ToolContext, ToolModule } from "../types.js";
import { resolveSiteId, runTool } from "../util.js";

/**
 * The Omada Open API exposes only a site-wide LED toggle (`PUT /sites/{sid}/led`),
 * not a per-device LED. The brief listed `set_device_led`; this tool replaces
 * that with the available site-wide control. Per-device LED can be addressed
 * later via the AP general-config endpoint when admin-tier reaches there.
 */
export const setSiteLedTool: ToolModule = {
  name: "set_site_led",
  tier: "ops-write",
  register(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
      "set_site_led",
      {
        title: "Set site-wide LED",
        description:
          "Enable or disable the status LEDs on every device at the site. " +
          "Defaults to dryRun:true. (The Open API exposes only site-wide LED, " +
          "not per-device.)",
        inputSchema: {
          enable: z.boolean().describe("Turn LEDs on (true) or off (false)."),
          dryRun: z.boolean().optional(),
          siteId: z.string().optional(),
        },
        annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      async (args) =>
        runTool("set_site_led", async () => {
          const siteId = resolveSiteId(ctx, args);
          const dryRun = args.dryRun ?? true;
          const before = await ctx.client.getSiteLed(siteId);
          const proposed = { ...before, enable: args.enable };
          const changes = diff(before, proposed);
          if (dryRun) {
            return statePreview({ what: "site LED", target: siteId, changes, dryRun: true });
          }
          await ctx.client.setSiteLed(siteId, args.enable);
          const after = await ctx.client.getSiteLed(siteId);
          const actualChanges = diff(before, after);
          return [
            statePreview({
              what: "site LED",
              target: siteId,
              changes: actualChanges,
              dryRun: false,
            }),
            actualChanges.length === changes.length
              ? ""
              : `\n⚠ Controller-side diff:\n${JSON.stringify(diff(proposed, after))}`,
          ]
            .filter(Boolean)
            .join("\n");
        }),
    );
  },
};
