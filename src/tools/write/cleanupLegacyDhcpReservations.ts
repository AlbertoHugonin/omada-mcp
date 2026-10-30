import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext, ToolModule } from "../types.js";
import { resolveSiteId, runTool } from "../util.js";

const macRegex = /^([0-9A-F]{2}-){5}[0-9A-F]{2}$/i;
const planned = Object.freeze([
  { mac: "AC-84-C6-F1-4D-21", ip: "192.168.0.38", label: "Orphan .38" },
  {
    mac: "BC-24-11-3A-15-60",
    ip: "192.168.0.6",
    label: "Old Omada",
    currentStaticIp: "192.168.0.112",
  },
  {
    mac: "BC-24-11-D0-5E-6C",
    ip: "192.168.0.42",
    label: "Old Komodo",
    currentStaticIp: "192.168.0.131",
  },
  { mac: "BC-24-11-44-A8-A2", ip: "192.168.0.89", label: "Old Jarvis" },
]);
const norm = (s: string) => s.replace(/[-:]/g, "").toUpperCase();

export async function checkLegacyDhcpCleanup(ctx: ToolContext, siteId: string) {
  const networks = await ctx.client.getDhcpNetworks(siteId);
  const main = networks.find(
    (n) => n.name === "Default" && n.vlan === 1 && n.gatewaySubnet === "192.168.0.1/24",
  );
  if (!main) throw new Error("Default network not found");
  const all = await ctx.client.getDhcpReservations(siteId);
  const clients = await ctx.client.listClients(siteId, { page: 1, pageSize: 1000 });
  const equipment = await ctx.client.listDevices(siteId);
  if (!Array.isArray(clients.data) || (clients.totalRows ?? 0) > 1000 || !Array.isArray(equipment))
    throw new Error("Client or device inventory unavailable");
  const changes = [] as { mac: string; ip: string; label: string; exists: boolean }[];
  for (const entry of planned) {
    if (!macRegex.test(entry.mac)) throw new Error("Bad cleanup MAC");
    const match = all.find((r) => norm(r.mac) === norm(entry.mac));
    if (match && (match.ip !== entry.ip || match.netId !== main.id))
      throw new Error(`Reservation changed for ${entry.label}: refusing deletion`);
    if (
      clients.data.some(
        (c) =>
          c.ip === entry.ip ||
          (norm(c.mac) === norm(entry.mac) &&
            c.ip !== ("currentStaticIp" in entry ? entry.currentStaticIp : undefined)),
      )
    ) {
      throw new Error(
        `${entry.label} currently uses the obsolete IP or has an unexpected current IP`,
      );
    }
    if (equipment.some((d) => norm(d.mac) === norm(entry.mac) || d.ip === entry.ip))
      throw new Error(`${entry.label} still used by adopted Omada equipment`);
    changes.push({ ...entry, exists: Boolean(match) });
  }
  return {
    changes,
    summary: changes
      .map((e) => `${e.label}: ${e.mac} -> ${e.ip}: ${e.exists ? "DELETE" : "already absent"}`)
      .join("\n"),
  };
}

export const cleanupLegacyDhcpReservationsTool: ToolModule = {
  name: "cleanup_legacy_dhcp_reservations",
  tier: "admin",
  register(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
      "cleanup_legacy_dhcp_reservations",
      {
        title: "Remove four verified obsolete DHCP reservations",
        description:
          "Delete only the four exactly-identified obsolete LAN reservations for .38, .6, .42, and .89. Never remove any other reservation, restart, renew leases or reconnect devices. Full read-only preflight, per-step verification and independent Jarvis approval.",
        inputSchema: { siteId: z.string().optional(), dryRun: z.boolean().optional() },
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      async (args) =>
        runTool("cleanup_legacy_dhcp_reservations", async () => {
          const siteId = resolveSiteId(ctx, args);
          const plan = await checkLegacyDhcpCleanup(ctx, siteId);
          if (args.dryRun !== false) return `DRY RUN — no changes:\n${plan.summary}`;
          const completed: string[] = [];
          for (const item of plan.changes) {
            if (!item.exists) {
              completed.push(`${item.label}: already absent`);
              continue;
            }
            // Recheck the live reservation and client inventory immediately before each deletion.
            const current = await checkLegacyDhcpCleanup(ctx, siteId);
            const target = current.changes.find((x) => x.mac === item.mac);
            if (!target?.exists) {
              completed.push(`${item.label}: already absent`);
              continue;
            }
            await ctx.client.deleteDhcpReservation(siteId, item.mac);
            const after = await ctx.client.getDhcpReservations(siteId);
            if (after.some((r) => norm(r.mac) === norm(item.mac))) {
              throw new Error(
                `Delete not confirmed for ${item.label}; completed: ${completed.join("; ")}`,
              );
            }
            completed.push(`${item.label}: removed (${item.ip})`);
          }
          return `OMADA DHCP CLEANUP VERIFIED (no leases touched):\n${completed.join("\n")}`;
        }),
    );
  },
};
