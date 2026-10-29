import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext, ToolModule } from "../types.js";
import { resolveSiteId, runTool } from "../util.js";

const ipSchema = z.string().regex(/^(?:\d{1,3}\.){3}\d{1,3}$/);
const macSchema = z.string().regex(/^([0-9A-F]{2}-){5}[0-9A-F]{2}$/i);
export type ReservationPlan = { mac: string; ip: string; name: string };
const normalizedMac = (mac: string) => mac.replace(/[-:]/g, "").toUpperCase();
function octets(ip: string): number[] {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((x) => !Number.isInteger(x) || x < 0 || x > 255))
    throw new Error(`Invalid IPv4: ${ip}`);
  return parts;
}

export async function checkDhcpPlan(
  ctx: ToolContext,
  siteId: string,
  expectedStart: string,
  expectedEnd: string,
  poolStart: string,
  poolEnd: string,
  reservations: ReservationPlan[],
) {
  const networks = await ctx.client.getDhcpNetworks(siteId);
  const iotSummary = networks.find(
    (x) => x.name === "Domotica" && x.vlan === 20 && x.gatewaySubnet === "192.168.5.1/24",
  );
  const mainSummary = networks.find(
    (x) => x.name === "Default" && x.vlan === 1 && x.gatewaySubnet === "192.168.0.1/24",
  );
  if (!iotSummary || !mainSummary)
    throw new Error("Expected Omada Domotica/Default network missing");
  // The list endpoint omits dhcpSettings. Use full detail for every mutation preflight.
  const [domotica, main] = await Promise.all([
    ctx.client.getDhcpNetwork(siteId, iotSummary.id),
    ctx.client.getDhcpNetwork(siteId, mainSummary.id),
  ]);
  if (
    domotica.vlan !== 20 ||
    main.vlan !== 1 ||
    domotica.gatewaySubnet !== "192.168.5.1/24" ||
    main.gatewaySubnet !== "192.168.0.1/24"
  ) {
    throw new Error("Network detail mismatch");
  }
  const dhcp = domotica.dhcpSettings;
  if (!dhcp?.enable || dhcp.ipRangePool?.length !== 1 || !main.dhcpSettings?.enable)
    throw new Error("Unexpected DHCP pool configuration");
  const current = dhcp.ipRangePool[0];
  const same = current.ipaddrStart === poolStart && current.ipaddrEnd === poolEnd;
  if (!same && (current.ipaddrStart !== expectedStart || current.ipaddrEnd !== expectedEnd))
    throw new Error("DHCP pool was modified externally: refusing to overwrite it");
  const a = octets(poolStart),
    b = octets(poolEnd);
  if (a.join(".") !== "192.168.5.2" || b.join(".") !== "192.168.5.99")
    throw new Error("Only the verified Domotica pool 192.168.5.2–99 is supported");
  const all = await ctx.client.getDhcpReservations(siteId);
  const active = await ctx.client.listClients(siteId, { page: 1, pageSize: 1000 });
  if ((active.totalRows ?? 0) > 1000 || !Array.isArray(active.data))
    throw new Error("Truncated or invalid client inventory");
  const deviceInventory = await ctx.client.listDevices(siteId);
  if (!Array.isArray(deviceInventory)) throw new Error("Invalid Omada network equipment inventory");
  const byMac = new Set<string>(),
    byIp = new Set<string>();
  const changes = [] as { r: ReservationPlan; existing: any }[];
  for (const r of reservations) {
    const ip = octets(r.ip);
    const key = normalizedMac(r.mac);
    if (
      ip[0] !== 192 ||
      ip[1] !== 168 ||
      ip[2] !== 0 ||
      ip[3] === undefined ||
      ip[3] < 200 ||
      ip[3] > 219
    )
      throw new Error(`IP ${r.ip} not in management block 192.168.0.200–219`);
    if (byMac.has(key) || byIp.has(r.ip)) throw new Error("Duplicate planned MAC/IP");
    byMac.add(key);
    byIp.add(r.ip);
    const existing = all.find((x: any) => normalizedMac(x.mac) === key);
    if (existing && existing.netId !== main.id)
      throw new Error(`Reservation MAC ${r.mac} belongs to another network`);
    if (all.some((x: any) => x.ip === r.ip && normalizedMac(x.mac) !== key))
      throw new Error(`IP ${r.ip} reserved for another device`);
    if (active.data.some((c) => c.ip === r.ip && normalizedMac(c.mac) !== key))
      throw new Error(`IP ${r.ip} currently in use`);
    if (r.name.startsWith("EAP ")) {
      const ap = deviceInventory.find((x) => normalizedMac(x.mac) === key);
      if (
        !ap ||
        !String(ap.type ?? "")
          .toLowerCase()
          .includes("ap")
      )
        throw new Error(`EAP ${r.name} not found as an adopted access point`);
    }
    changes.push({ r, existing });
  }
  return {
    domotica,
    main,
    changes,
    poolNeedsChange: !same,
    summary: [
      `Domotica pool: ${current.ipaddrStart}–${current.ipaddrEnd} => ${poolStart}–${poolEnd}`,
      ...changes.map(
        ({ r, existing }) => `${r.name} (${r.mac}): ${existing?.ip ?? "unreserved"} => ${r.ip}`,
      ),
    ].join("\n"),
  };
}

export const applyDhcpPlanTool: ToolModule = {
  name: "apply_dhcp_plan",
  tier: "admin",
  register(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
      "apply_dhcp_plan",
      {
        title: "Apply approved DHCP pool and network-equipment reservations",
        description:
          "Restrict Omada Domotica to .2–.99 and reserve management IPs .200–.219. Does not release/renew leases, reboot devices or change AP settings. Performs full validation and rereads after writes. Independent Jarvis approval required.",
        inputSchema: {
          siteId: z.string().optional(),
          expectedPoolStart: ipSchema,
          expectedPoolEnd: ipSchema,
          poolStart: ipSchema,
          poolEnd: ipSchema,
          reservations: z
            .array(z.object({ mac: macSchema, ip: ipSchema, name: z.string().min(1).max(90) }))
            .min(1)
            .max(12),
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
        runTool("apply_dhcp_plan", async () => {
          const siteId = resolveSiteId(ctx, args);
          const plan = await checkDhcpPlan(
            ctx,
            siteId,
            args.expectedPoolStart,
            args.expectedPoolEnd,
            args.poolStart,
            args.poolEnd,
            args.reservations,
          );
          if (args.dryRun !== false) return `DRY RUN — no configuration changed:\n${plan.summary}`;
          const done: string[] = [];
          if (plan.poolNeedsChange) {
            await ctx.client.updateDhcpNetworkPool(
              siteId,
              plan.domotica,
              args.poolStart,
              args.poolEnd,
            );
            const updated = await ctx.client.getDhcpNetwork(siteId, plan.domotica.id);
            if (
              updated.dhcpSettings?.ipRangePool?.[0]?.ipaddrStart !== args.poolStart ||
              updated.dhcpSettings?.ipRangePool?.[0]?.ipaddrEnd !== args.poolEnd
            ) {
              throw new Error(
                `DHCP pool accepted but not confirmed. Stop before reservations; inspect Omada.`,
              );
            }
            done.push(`Domotica DHCP ${args.poolStart}–${args.poolEnd}`);
          } else done.push("Domotica DHCP pool already matches target");
          for (const { r, existing } of plan.changes) {
            if (existing?.ip === r.ip && existing.status) {
              done.push(`${r.name}: already reserved`);
              continue;
            }
            const payload = {
              netId: plan.main.id,
              mac: r.mac,
              ip: r.ip,
              status: true,
              serverType: "gateway",
              serverMac: plan.main.deviceMac,
              description: r.name,
            };
            await ctx.client.upsertDhcpReservation(siteId, r.mac, payload, !!existing);
            const reread = await ctx.client.getDhcpReservations(siteId);
            if (
              !reread.some(
                (x: any) =>
                  normalizedMac(x.mac) === normalizedMac(r.mac) &&
                  x.ip === r.ip &&
                  x.netId === plan.main.id &&
                  x.status,
              )
            ) {
              throw new Error(
                `Reservation not confirmed for ${r.name}; prior operations: ${done.join("; ")}`,
              );
            }
            done.push(`${r.name} -> ${r.ip}`);
          }
          return `APPLIED AND VERIFIED ON OMADA — no forced DHCP renewals or reconnects:\n${done.join("\n")}`;
        }),
    );
  },
};
