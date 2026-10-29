import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext, ToolModule } from "../types.js";
import { resolveSiteId, runTool } from "../util.js";

const fixedMac = z.string().regex(/^([0-9A-F]{2}-){5}[0-9A-F]{2}$/i);
const ipv4 = z.string().regex(/^\d{1,3}(\.\d{1,3}){3}$/);
const normalized = (mac: string) => mac.replace(/[:-]/g, "").toUpperCase();
export type IotReservation = { mac: string; expectedOldIp: string; ip: string; name: string };

/** Read-only preflight for IoT migration; intentionally never touches client settings or leases. */
export async function checkIotReservationPlan(
  ctx: ToolContext,
  siteId: string,
  entries: IotReservation[],
) {
  if (entries.length < 1 || entries.length > 6) throw new Error("Expected 1–6 IoT reservations");
  const summary = await ctx.client.getDhcpNetworks(siteId);
  const candidate = summary.find(
    (n) => n.name === "Domotica" && n.vlan === 20 && n.gatewaySubnet === "192.168.5.1/24",
  );
  if (!candidate) throw new Error("Expected Domotica VLAN20 is missing");
  const net = await ctx.client.getDhcpNetwork(siteId, candidate.id);
  const pool = net.dhcpSettings?.ipRangePool;
  if (
    !net.dhcpSettings?.enable ||
    pool?.length !== 1 ||
    pool[0].ipaddrStart !== "192.168.5.2" ||
    pool[0].ipaddrEnd !== "192.168.5.99"
  ) {
    throw new Error("Domotica DHCP range unexpected; IoT migration cannot continue");
  }
  if (!net.deviceMac) throw new Error("DHCP network gateway MAC missing");
  const reserved = await ctx.client.getDhcpReservations(siteId);
  const live = await ctx.client.listClients(siteId, { page: 1, pageSize: 1000 });
  if (!Array.isArray(live.data) || (live.totalRows ?? 0) > 1000)
    throw new Error("Client inventory incomplete");
  const seenMac = new Set<string>(),
    seenIp = new Set<string>();
  const changes: { entry: IotReservation; existing: any }[] = [];
  for (const entry of entries) {
    const mac = normalized(entry.mac);
    const ipPieces = entry.ip.split(".").map(Number);
    if (
      ipPieces.length !== 4 ||
      ipPieces.some((o) => !Number.isInteger(o) || o < 0 || o > 255) ||
      ipPieces.slice(0, 3).join(".") !== "192.168.5" ||
      !ipPieces[3] ||
      ipPieces[3] < 100 ||
      ipPieces[3] > 169
    )
      throw new Error(`Invalid reserved IoT IP ${entry.ip}`);
    if (seenMac.has(mac) || seenIp.has(entry.ip)) throw new Error("Duplicate IP or MAC");
    seenMac.add(mac);
    seenIp.add(entry.ip);
    const existing = reserved.find((r) => normalized(r.mac) === mac);
    if (existing && existing.netId !== net.id)
      throw new Error(`Client is reserved on another VLAN: ${mac}`);
    if (existing && existing.ip !== entry.expectedOldIp && existing.ip !== entry.ip)
      throw new Error(`Client reservation unexpectedly changed: ${mac}`);
    if (!existing && entry.expectedOldIp !== "" && entry.name !== "Cancello")
      throw new Error(`Missing original reservation for ${entry.name}`);
    if (reserved.some((r) => r.ip === entry.ip && normalized(r.mac) !== mac))
      throw new Error(`Target ${entry.ip} already reserved for another MAC`);
    if (live.data.some((c) => c.ip === entry.ip && normalized(c.mac) !== mac))
      throw new Error(`Target ${entry.ip} already in use`);
    changes.push({ entry, existing });
  }
  return {
    net,
    changes,
    preview: changes
      .map(
        ({ entry, existing }) =>
          `${entry.name} ${entry.mac} ${existing?.ip ?? "no prior reservation"} -> ${entry.ip}`,
      )
      .join("\n"),
  };
}

export const applyIotReservationsTool: ToolModule = {
  name: "apply_iot_reservations",
  tier: "admin",
  register(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
      "apply_iot_reservations",
      {
        title: "Reserve specific Domotica IoT addresses in Omada DHCP",
        description:
          "Create a gateway DHCP reservation for Cancello and update existing Tapo reservations. Only 192.168.5.100–169, with strict MAC/IP conflict checks. Never forces lease renewals, restarts or device configuration. Requires independent Jarvis approval.",
        inputSchema: {
          siteId: z.string().optional(),
          reservations: z
            .array(
              z.object({
                mac: fixedMac,
                expectedOldIp: z.union([ipv4, z.literal("")]),
                ip: ipv4,
                name: z.string().min(1).max(90),
              }),
            )
            .min(1)
            .max(6),
          dryRun: z.boolean().optional(),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      async (args) =>
        runTool("apply_iot_reservations", async () => {
          const siteId = resolveSiteId(ctx, args);
          const plan = await checkIotReservationPlan(ctx, siteId, args.reservations);
          if (args.dryRun !== false) return `DRY RUN — no changes:\n${plan.preview}`;
          const completed: string[] = [];
          for (const { entry, existing } of plan.changes) {
            if (existing?.ip === entry.ip && existing.status) {
              completed.push(`${entry.name}: already reserved ${entry.ip}`);
              continue;
            }
            await ctx.client.upsertDhcpReservation(
              siteId,
              entry.mac,
              {
                netId: plan.net.id,
                mac: entry.mac,
                ip: entry.ip,
                status: true,
                serverType: "gateway",
                serverMac: plan.net.deviceMac,
                description: entry.name,
              },
              Boolean(existing),
            );
            const updated = await ctx.client.getDhcpReservations(siteId);
            const actual = updated.find((r) => normalized(r.mac) === normalized(entry.mac));
            if (actual?.ip !== entry.ip || actual?.netId !== plan.net.id || !actual.status) {
              throw new Error(
                `Reservation ${entry.name} not verified; completed: ${completed.join("; ")}`,
              );
            }
            completed.push(`${entry.name}: reserved ${entry.ip}`);
          }
          return `APPLIED AND VERIFIED on Omada DHCP (no lease renewal/restart):\n${completed.join("\n")}\nDevices may keep prior IP until natural DHCP renewal. A device configured with local static IP will not move.`;
        }),
    );
  },
};
