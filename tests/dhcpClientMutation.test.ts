import { describe, expect, it, vi } from "vitest";
import { OmadaClient } from "../src/omada/client.js";

describe("DHCP network and reservation API request bodies", () => {
  it("preserves LAN/VLAN ports, DNS, lease, guard and IPv6 options while only narrowing the DHCP pool", async () => {
    const client = Object.create(OmadaClient.prototype) as OmadaClient & {
      authedRequest: ReturnType<typeof vi.fn>;
    };
    client.authedRequest = vi.fn().mockResolvedValue({});
    Object.assign(client, { config: { omadacId: "test-controller" } });
    const current = {
      id: "iot",
      name: "Domotica",
      purpose: 1,
      interfaceIds: ["2_tag", "3_tag", "5_tag"],
      isolation: false,
      vlanType: 0,
      application: 0,
      vlan: 20,
      gatewaySubnet: "192.168.5.1/24",
      igmpSnoopEnable: false,
      mldSnoopEnable: true,
      dhcpL2RelayEnable: false,
      dhcpGuard: { enable: true },
      dhcpv6Guard: { enable: false },
      lanNeworkIpv6Config: { enable: false },
      allLan: false,
      dhcpSettings: {
        enable: true,
        ipRangePool: [{ ipaddrStart: "192.168.5.1", ipaddrEnd: "192.168.5.254" }],
        ipRangeStart: 3232236800,
        ipRangeEnd: 3232237055,
        dhcpns: "manual",
        priDns: "192.168.0.110",
        sndDns: "192.168.0.111",
        leasetime: 2880,
        options: [],
      },
    };
    await client.updateDhcpNetworkPool("site-1", current, "192.168.5.2", "192.168.5.99");
    const [_url, req] = client.authedRequest.mock.calls[0] as [
      string,
      { method: string; body: any },
    ];
    expect(req.method).toBe("PATCH");
    expect(req.body.interfaceIds).toEqual(current.interfaceIds);
    expect(req.body.vlan).toBe(20);
    expect(req.body.dhcpGuard).toEqual({ enable: true });
    expect(req.body.dhcpv6Guard).toEqual({ enable: false });
    expect(req.body.mldSnoopEnable).toBe(true);
    expect(req.body.allLan).toBe(false);
    expect(req.body.dhcpSettingsVO).toMatchObject({
      enable: true,
      ipaddrStart: "192.168.5.2",
      ipaddrEnd: "192.168.5.99",
      ipRangeStart: 3232236800,
      ipRangeEnd: 3232237055,
      dhcpns: "manual",
      priDns: "192.168.0.110",
      sndDns: "192.168.0.111",
      leasetime: 2880,
      options: [],
    });
    expect(Object.keys(req.body).join(" ")).not.toMatch(/reconnect|reboot|release|renew/);
  });
  it("uses router-side reservation endpoints, not per-client fixed IP", async () => {
    const client = Object.create(OmadaClient.prototype) as OmadaClient & {
      authedRequest: ReturnType<typeof vi.fn>;
    };
    client.authedRequest = vi.fn().mockResolvedValue({});
    Object.assign(client, { config: { omadacId: "test-controller" } });
    const b = { mac: "CC-BA-BD-C0-F4-62", ip: "192.168.0.212", netId: "main", status: true };
    await client.upsertDhcpReservation("site-1", b.mac, b, false);
    await client.upsertDhcpReservation("site-1", b.mac, b, true);
    expect(client.authedRequest.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: b });
    expect(client.authedRequest.mock.calls[1]?.[1]).toMatchObject({ method: "PATCH", body: b });
    expect(client.authedRequest.mock.calls[0]?.[0]).toMatch(/\/setting\/service\/dhcp$/);
    expect(client.authedRequest.mock.calls[1]?.[0]).toContain(b.mac);
  });
});
