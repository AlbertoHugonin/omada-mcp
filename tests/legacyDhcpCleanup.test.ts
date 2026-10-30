import { describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../src/tools/types.js";
import { checkLegacyDhcpCleanup } from "../src/tools/write/cleanupLegacyDhcpReservations.js";

const base = [
  { netId: "lan", mac: "AC-84-C6-F1-4D-21", ip: "192.168.0.38", status: true },
  { netId: "lan", mac: "BC-24-11-3A-15-60", ip: "192.168.0.6", status: true },
  { netId: "lan", mac: "BC-24-11-D0-5E-6C", ip: "192.168.0.42", status: true },
  { netId: "lan", mac: "BC-24-11-44-A8-A2", ip: "192.168.0.89", status: true },
];
function ctx(overrides: Record<string, unknown> = {}) {
  const client = {
    getDhcpNetworks: vi
      .fn()
      .mockResolvedValue([
        { name: "Default", vlan: 1, gatewaySubnet: "192.168.0.1/24", id: "lan" },
      ]),
    getDhcpReservations: vi.fn().mockResolvedValue(base),
    listClients: vi.fn().mockResolvedValue({ data: [], totalRows: 0 }),
    listDevices: vi.fn().mockResolvedValue([]),
    deleteDhcpReservation: vi.fn(),
    ...overrides,
  };
  return { client, ctx: { client } as unknown as ToolContext };
}
describe("safe legacy DHCP cleanup", () => {
  it("previews only the four exact MAC/IP pairs and never mutates", async () => {
    const t = ctx();
    const d = await checkLegacyDhcpCleanup(t.ctx, "site");
    expect(d.changes).toHaveLength(4);
    expect(d.changes.every((x) => x.exists)).toBe(true);
    expect(t.client.deleteDhcpReservation).not.toHaveBeenCalled();
  });
  it("is repeatable for already absent records", async () => {
    const t = ctx({ getDhcpReservations: vi.fn().mockResolvedValue([]) });
    const d = await checkLegacyDhcpCleanup(t.ctx, "site");
    expect(d.changes.every((x) => !x.exists)).toBe(true);
  });
  it("rejects changed target reservation", async () => {
    const t = ctx({
      getDhcpReservations: vi.fn().mockResolvedValue([{ ...base[0], ip: "192.168.0.133" }]),
    });
    await expect(checkLegacyDhcpCleanup(t.ctx, "site")).rejects.toThrow(/Reservation changed/);
  });
  it("rejects another live client using a target IP", async () => {
    const t = ctx({
      listClients: vi.fn().mockResolvedValue({
        totalRows: 1,
        data: [{ mac: "11-22-33-44-55-66", ip: "192.168.0.38" }],
      }),
    });
    await expect(checkLegacyDhcpCleanup(t.ctx, "site")).rejects.toThrow(/obsolete IP/);
  });
  it("allows obsolete reservations of active Omada and Komodo only when each has its verified local static IP", async () => {
    const t = ctx({
      listClients: vi.fn().mockResolvedValue({
        totalRows: 2,
        data: [
          { mac: "BC-24-11-3A-15-60", ip: "192.168.0.112" },
          { mac: "BC-24-11-D0-5E-6C", ip: "192.168.0.131" },
        ],
      }),
    });
    const d = await checkLegacyDhcpCleanup(t.ctx, "site");
    expect(d.changes.filter((x) => x.exists)).toHaveLength(4);
  });
  it("rejects stale MAC still using its old DHCP address", async () => {
    const t = ctx({
      listClients: vi.fn().mockResolvedValue({
        totalRows: 1,
        data: [{ mac: "BC-24-11-3A-15-60", ip: "192.168.0.6" }],
      }),
    });
    await expect(checkLegacyDhcpCleanup(t.ctx, "site")).rejects.toThrow(/obsolete IP/);
  });
  it("rejects old MAC reappearing at unexpected address", async () => {
    const t = ctx({
      listClients: vi.fn().mockResolvedValue({
        totalRows: 1,
        data: [{ mac: "BC-24-11-3A-15-60", ip: "192.168.0.80" }],
      }),
    });
    await expect(checkLegacyDhcpCleanup(t.ctx, "site")).rejects.toThrow(/unexpected current IP/);
  });
  it("rejects adopted Omada device occupying target", async () => {
    const t = ctx({
      listDevices: vi.fn().mockResolvedValue([{ mac: "CC-BB-AA-33-22-11", ip: "192.168.0.42" }]),
    });
    await expect(checkLegacyDhcpCleanup(t.ctx, "site")).rejects.toThrow(/adopted Omada equipment/);
  });
});
