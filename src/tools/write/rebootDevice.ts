import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { actionPreview } from "../dryRun.js";
import type { ToolContext, ToolModule } from "../types.js";
import { resolveSiteId, runTool } from "../util.js";

export const rebootDeviceTool: ToolModule = {
  name: "reboot_device",
  tier: "ops-write",
  register(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
      "reboot_device",
      {
        title: "Reboot device",
        description:
          "Reboot one AP / switch / gateway. The device drops offline briefly. " +
          "Defaults to dryRun:true — pass dryRun:false to actually reboot.",
        inputSchema: {
          deviceMac: z.string().min(1).describe("Device MAC, e.g. 'A8-29-48-C1-BB-C0'."),
          dryRun: z
            .boolean()
            .optional()
            .describe("If true (default), only preview; do not reboot."),
          siteId: z.string().optional(),
        },
        annotations: { destructiveHint: true, idempotentHint: false, openWorldHint: true },
      },
      async (args) =>
        runTool("reboot_device", async () => {
          const siteId = resolveSiteId(ctx, args);
          const dryRun = args.dryRun ?? true;
          const devices = await ctx.client.listDevices(siteId);
          const dev = devices.find(
            (d) =>
              d.mac.replace(/[-:]/g, "").toLowerCase() ===
              args.deviceMac.replace(/[-:]/g, "").toLowerCase(),
          );
          const target = dev ? `${dev.name} [${dev.mac}, ${dev.type}]` : args.deviceMac;
          const context = dev
            ? `Current status: ${dev.status ?? "?"}  model=${dev.modelName ?? dev.model ?? "?"}`
            : `Warning: device ${args.deviceMac} not currently listed at site ${siteId}.`;
          if (!dryRun) {
            await ctx.client.rebootDevice(siteId, dev?.mac ?? args.deviceMac);
          }
          return actionPreview({ action: "reboot", target, context, dryRun });
        }),
    );
  },
};
