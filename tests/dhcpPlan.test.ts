import { describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../src/tools/types.js";
import { checkDhcpPlan } from "../src/tools/write/applyDhcpPlan.js";

const reservations = [
  { name: "Switch v5", mac: "A8-6E-84-1B-B3-19", ip: "192.168.0.200" },
  { name: "Switch v4", mac: "48-22-54-42-14-44", ip: "192.168.0.201" },
  { name: "EAP Caldaia", mac: "CC-BA-BD-C0-F4-62", ip: "192.168.0.212" },
];
function makeContext(overrides: Record<string, unknown> = {}) {
  const client = {
    getDhcpNetworks: vi.fn().mockResolvedValue([
      {
        id: "main",
        name: "Default",
        vlan: 1,
        gatewaySubnet: "192.168.0.1/24",
        deviceMac: "router",
        dhcpSettings: { enable: true },
      },
      {
        id: "iot",
        name: "Domotica",
        vlan: 20,
        gatewaySubnet: "192.168.5.1/24",
        dhcpSettings: {
          enable: true,
          ipRangePool: [{ ipaddrStart: "192.168.5.1", ipaddrEnd: "192.168.5.254" }],
        },
      },
    ]),
    getDhcpNetwork: vi.fn().mockImplementation(async (_site: string, id: string) =>
      id === "iot"
        ? {
            id: "iot",
            name: "Domotica",
            vlan: 20,
            gatewaySubnet: "192.168.5.1/24",
            dhcpSettings: {
              enable: true,
              ipRangePool: [{ ipaddrStart: "192.168.5.1", ipaddrEnd: "192.168.5.254" }],
            },
          }
        : {
            id: "main",
            name: "Default",
            vlan: 1,
            gatewaySubnet: "192.168.0.1/24",
            dhcpSettings: { enable: true },
          },
    ),
    getDhcpReservations: vi.fn().mockResolvedValue([]),
    listClients: vi.fn().mockResolvedValue({ totalRows: 0, data: [] }),
    listDevices: vi
      .fn()
      .mockResolvedValue([{ mac: "CC-BA-BD-C0-F4-62", type: "ap", ip: "192.168.0.8" }]),
    updateDhcpNetworkPool: vi.fn(),
    upsertDhcpReservation: vi.fn(),
    ...overrides,
  };
  return { ctx: { config: { siteId: "Borgaro" }, client } as unknown as ToolContext, client };
}
const check = (ctx: ToolContext, r = reservations) =>
  checkDhcpPlan(ctx, "Borgaro", "192.168.5.1", "192.168.5.254", "192.168.5.2", "192.168.5.99", r);

describe("Omada DHCP pool + management reservation plan", () => {
  it("validates full plan without ever mutating DHCP or reconnecting", async () => {
    const { ctx, client } = makeContext();
    const x = await check(ctx);
    expect(x.poolNeedsChange).toBe(true);
    expect(x.changes).toHaveLength(3);
    expect(client.updateDhcpNetworkPool).not.toHaveBeenCalled();
    expect(client.upsertDhcpReservation).not.toHaveBeenCalled();
  });
  it("rejects a reservation collision with another client", async () => {
    const { ctx } = makeContext({
      listClients: vi.fn().mockResolvedValue({
        totalRows: 1,
        data: [{ mac: "A0-B0-C0-D0-E0-F0", ip: "192.168.0.200" }],
      }),
    });
    await expect(check(ctx)).rejects.toThrow(/currently in use/);
  });
  it("rejects a duplicate reserved IP", async () => {
    const { ctx } = makeContext({
      getDhcpReservations: vi
        .fn()
        .mockResolvedValue([
          { ip: "192.168.0.200", mac: "AA-BB-CC-DD-EE-FF", netId: "main", status: true },
        ]),
    });
    await expect(check(ctx)).rejects.toThrow(/reserved for another/);
  });
  it("rejects modified pool instead of overwriting operator changes", async () => {
    const { ctx, client } = makeContext();
    client.getDhcpNetwork.mockImplementation(async (_site: string, id: string) =>
      id === "iot"
        ? {
            id: "iot",
            name: "Domotica",
            vlan: 20,
            gatewaySubnet: "192.168.5.1/24",
            dhcpSettings: {
              enable: true,
              ipRangePool: [{ ipaddrStart: "192.168.5.10", ipaddrEnd: "192.168.5.200" }],
            },
          }
        : {
            id: "main",
            name: "Default",
            vlan: 1,
            gatewaySubnet: "192.168.0.1/24",
            dhcpSettings: { enable: true },
          },
    );
    client.getDhcpNetworks.mockResolvedValue([
      {
        id: "main",
        name: "Default",
        vlan: 1,
        gatewaySubnet: "192.168.0.1/24",
        dhcpSettings: { enable: true },
      },
      {
        id: "iot",
        name: "Domotica",
        vlan: 20,
        gatewaySubnet: "192.168.5.1/24",
        dhcpSettings: {
          enable: true,
          ipRangePool: [{ ipaddrStart: "192.168.5.10", ipaddrEnd: "192.168.5.200" }],
        },
      },
    ]);
    await expect(check(ctx)).rejects.toThrow(/modified externally/);
  });
  it("rejects static-system or dynamic pool destinations", async () => {
    const { ctx } = makeContext();
    await expect(
      check(ctx, [{ name: "Bad", mac: "A8-6E-84-1B-B3-19", ip: "192.168.0.60" }]),
    ).rejects.toThrow(/not in management block/);
  });
  it("is repeatable when pool and reservation already match", async () => {
    const { ctx, client } = makeContext({
      getDhcpReservations: vi
        .fn()
        .mockResolvedValue([
          { mac: reservations[0]?.mac, ip: reservations[0]?.ip, netId: "main", status: true },
        ]),
    });
    const x = await check(ctx, [reservations[0]!]);
    expect(x.changes[0]?.existing?.ip).toBe("192.168.0.200");
    expect(client.updateDhcpNetworkPool).not.toHaveBeenCalled();
  });
});
