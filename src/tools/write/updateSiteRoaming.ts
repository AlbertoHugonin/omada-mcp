import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { diff, postApplyReport, statePreview } from "../dryRun.js";
import type { ToolContext, ToolModule } from "../types.js";
import { resolveSiteId, runTool } from "../util.js";

/**
 * Modify the site-level roaming settings. The Open API PATCH body wraps the
 * fields in `{ roaming: { ... } }` and requires `fastRoamingEnable` and
 * `aiRoamingEnable` — this tool GETs the current state, merges the requested
 * changes, and sends the full body. After apply, it re-reads to surface the
 * actual resulting state (the controller can silently flip a mutually-exclusive
 * field, e.g. force-disassociation when AI roaming is on).
 *
 * Note: the Open API uses `nonStickRoamingEnable` in the PATCH body but
 * returns `nonStickEnable` in the GET response — `omada-mcp` smooths over that
 * field-name drift here.
 */
export const updateSiteRoamingTool: ToolModule = {
  name: "update_site_roaming",
  tier: "admin",
  register(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
      "update_site_roaming",
      {
        title: "Update site roaming",
        description:
          "Modify the site's wireless roaming settings (fast roaming, AI roaming, " +
          "force-disassociation, non-stick). Defaults to dryRun:true.",
        inputSchema: {
          fastRoamingEnable: z.boolean().optional().describe("802.11r fast roaming."),
          aiRoamingEnable: z
            .boolean()
            .optional()
            .describe("AI roaming. Forces force-disassociation off when enabled."),
          forceDisassociationEnable: z.boolean().optional(),
          nonStickRoamingEnable: z.boolean().optional(),
          dryRun: z.boolean().optional(),
          siteId: z.string().optional(),
        },
        annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
      },
      async (args) =>
        runTool("update_site_roaming", async () => {
          const siteId = resolveSiteId(ctx, args);
          const dryRun = args.dryRun ?? true;

          const current = await ctx.client.getSiteRoaming(siteId);
          const cur = (current.roaming as undefined | Record<string, unknown>) ?? {};
          // Normalize the field-name drift between GET (nonStickEnable) and PATCH (nonStickRoamingEnable).
          const before = {
            fastRoamingEnable: cur.fastRoamingEnable ?? false,
            aiRoamingEnable: cur.aiRoamingEnable ?? false,
            forceDisassociationEnable: cur.forceDisassociationEnable ?? false,
            nonStickRoamingEnable: cur.nonStickRoamingEnable ?? cur.nonStickEnable ?? false,
          };
          const proposed = {
            fastRoamingEnable: args.fastRoamingEnable ?? before.fastRoamingEnable,
            aiRoamingEnable: args.aiRoamingEnable ?? before.aiRoamingEnable,
            forceDisassociationEnable:
              args.forceDisassociationEnable ?? before.forceDisassociationEnable,
            nonStickRoamingEnable: args.nonStickRoamingEnable ?? before.nonStickRoamingEnable,
          };
          const changes = diff(before, proposed);
          if (dryRun) {
            return statePreview({ what: "site roaming", target: siteId, changes, dryRun: true });
          }

          await ctx.client.updateSiteRoaming(siteId, { roaming: proposed });
          const reread = await ctx.client.getSiteRoaming(siteId);
          const newCur = (reread.roaming as Record<string, unknown>) ?? {};
          const actual = {
            fastRoamingEnable: newCur.fastRoamingEnable ?? false,
            aiRoamingEnable: newCur.aiRoamingEnable ?? false,
            forceDisassociationEnable: newCur.forceDisassociationEnable ?? false,
            nonStickRoamingEnable: newCur.nonStickRoamingEnable ?? newCur.nonStickEnable ?? false,
          };
          return [
            statePreview({ what: "site roaming", target: siteId, changes, dryRun: false }),
            postApplyReport({ what: "site roaming", target: siteId, before, actual, proposed }),
          ].join("\n\n");
        }),
    );
  },
};
