import { describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../src/tools/types.js";
import { checkIotReservationPlan } from "../src/tools/write/applyIotReservations.js";

const gate = { mac: "48-3F-DA-33-1D-FB", expectedOldIp: "", ip: "192.168.5.130", name: "Cancello" };
const tapo = {
  mac: "98-03-8E-DA-A5-9B",
  expectedOldIp: "192.168.5.6",
  ip: "192.168.5.120",
  name: "Tapo P125M",
};
function makeCtx(extra: Record<string, unknown> = {}) {
  const client = {
    getDhcpNetworks: vi
      .fn()
      .mockResolvedValue([
        { id: "iot", name: "Domotica", vlan: 20, gatewaySubnet: "192.168.5.1/24" },
      ]),
    getDhcpNetwork: vi.fn().mockResolvedValue({
      id: "iot",
      name: "Domotica",
      vlan: 20,
      gatewaySubnet: "192.168.5.1/24",
      deviceMac: "router",
      dhcpSettings: {
        enable: true,
        ipRangePool: [{ ipaddrStart: "192.168.5.2", ipaddrEnd: "192.168.5.99" }],
      },
    }),
    getDhcpReservations: vi
      .fn()
      .mockResolvedValue([{ netId: "iot", mac: tapo.mac, ip: "192.168.5.6", status: true }]),
    listClients: vi.fn().mockResolvedValue({
      data: [
        { ip: "192.168.5.6", mac: tapo.mac },
        { ip: "192.168.5.18", mac: gate.mac },
      ],
      totalRows: 2,
    }),
    upsertDhcpReservation: vi.fn(),
    ...extra,
  };
  return { ctx: { client, config: { siteId: "test" } } as unknown as ToolContext, client };
}
const preflight = (ctx: ToolContext, entries = [gate, tapo]) =>
  checkIotReservationPlan(ctx, "site", entries);
describe("IoT reservations safe preflight", () => {
  it("accepts gate first and five Tapo/old reservation migrations without writes", async () => {
    const { ctx, client } = makeCtx();
    const r = await preflight(ctx);
    expect(r.changes).toHaveLength(2);
    expect(r.changes[0]?.existing).toBeUndefined();
    expect(r.changes[1]?.existing?.ip).toBe("192.168.5.6");
    expect(client.upsertDhcpReservation).not.toHaveBeenCalled();
  });
  it("rejects target within dynamic pool", async () => {
    const { ctx } = makeCtx();
    await expect(preflight(ctx, [{ ...tapo, ip: "192.168.5.19" }])).rejects.toThrow(
      /Invalid reserved IoT IP/,
    );
  });
  it("rejects existing reservation drift", async () => {
    const { ctx } = makeCtx({
      getDhcpReservations: vi
        .fn()
        .mockResolvedValue([{ ...tapo, netId: "iot", ip: "192.168.5.18", status: true }]),
    });
    await expect(preflight(ctx, [tapo])).rejects.toThrow(/unexpectedly changed/);
  });
  it("rejects existing target belonging to other mac", async () => {
    const { ctx } = makeCtx({
      getDhcpReservations: vi
        .fn()
        .mockResolvedValue([
          { netId: "iot", mac: "AA-BB-CC-DD-EE-FF", ip: "192.168.5.130", status: true },
        ]),
    });
    await expect(preflight(ctx, [gate])).rejects.toThrow(/reserved for another MAC/);
  });
  it("rejects active IP conflict", async () => {
    const { ctx } = makeCtx({
      listClients: vi.fn().mockResolvedValue({
        totalRows: 1,
        data: [{ mac: "AA-BB-CC-DD-EE-FF", ip: "192.168.5.120" }],
      }),
    });
    await expect(preflight(ctx, [tapo])).rejects.toThrow(/already in use/);
  });
  it("refuses when DHCP pool changed", async () => {
    const { ctx } = makeCtx({
      getDhcpNetwork: vi.fn().mockResolvedValue({
        id: "iot",
        deviceMac: "router",
        dhcpSettings: {
          enable: true,
          ipRangePool: [{ ipaddrStart: "192.168.5.2", ipaddrEnd: "192.168.5.254" }],
        },
      }),
    });
    await expect(preflight(ctx)).rejects.toThrow(/unexpected/);
  });
  it("is idempotent when all reservations already reached target", async () => {
    const { ctx } = makeCtx({
      getDhcpReservations: vi.fn().mockResolvedValue([
        { netId: "iot", mac: gate.mac, ip: gate.ip, status: true },
        { netId: "iot", mac: tapo.mac, ip: tapo.ip, status: true },
      ]),
    });
    const r = await preflight(ctx);
    expect(r.changes[0]?.existing?.ip).toBe(gate.ip);
    expect(r.changes[1]?.existing?.ip).toBe(tapo.ip);
  });
});
