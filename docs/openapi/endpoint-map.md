# Brief tool → Omada Open API endpoint map

Drawn from the official `omada-open-api-v1-spec.json` captured in this folder
(OpenAPI 3.0.1) and from live/reference validation against Omada controllers.
Path prefix is elided below: paths are rooted at
`/openapi/v1/{omadacId}/sites/{siteId}/...` unless noted.

## Read tools (`safe-read` profile)

| Tool | Method | Path | Notes |
|---|---|---|---|
| `list_sites` | GET | `/openapi/v1/{omadacId}/sites` | Paginated. Verified upstream. |
| `list_devices` | GET | `devices` | Paginated; `page` + `pageSize` required. |
| `get_device` | GET | `aps/{apMac}` for APs | Device-type-specific sibling paths exist. |
| `get_ap_radios` | GET | `aps/{apMac}/radio-config` | Configured per-band radio state. |
| `list_clients` | GET | `clients` | Paginated; response includes summary counters. |
| `get_client` | GET | `clients/{clientMac}` | Client detail; fork retains `fixedIp`/`useFixedIp` when returned. |
| `list_ssids` | GET | `wireless-network/wlans/.../ssids` | Composed across WLAN groups. |
| `get_ssid` | GET | `wireless-network/wlans/{wlanId}/ssids/{ssidId}` | Needs both IDs. |
| `get_site_settings` | GET | `roaming`, `band-steering`, `mesh` | Composite read. |
| `list_events` | GET | `logs/events` | Paginated. |
| `list_logs` | GET | `logs/alerts` | Paginated alert log. |

## Operational writes (`ops-write` profile)

| Tool | Method | Path | Notes |
|---|---|---|---|
| `reboot_device` | POST | `devices/{deviceMac}/reboot` | Action endpoint. |
| `block_client` | POST | `clients/{clientMac}/block` | Action endpoint. |
| `unblock_client` | POST | `clients/{clientMac}/unblock` | Action endpoint. |
| `reconnect_client` | POST | `clients/{clientMac}/reconnect` | Action endpoint. |
| `set_site_led` | PUT | `led` | Site-wide LED state. |
| `set_client_rate_limit` | PATCH | `clients/{clientMac}/ratelimit` | Per-client custom/profile rate limit. |
| `set_client_name` | PATCH | `clients/{clientMac}` | Payload `{name}`. Ported from the Omada v1 client-update surface; target-controller live validation pending. |
| `set_client_fixed_ip` | PATCH | `clients/{clientMac}` | Payload `{fixedIp}`. If omitted by the caller, the tool first reads and preserves the current IPv4. Target-controller live validation pending. |

## Admin writes (`admin` profile)

| Tool | Method | Path | Notes |
|---|---|---|---|
| `update_site_roaming` | PATCH | `roaming` | GET/merge/PATCH/re-read. |
| `update_band_steering` | PATCH | `band-steering` | GET/merge/PATCH/re-read. |
| `update_ssid` | PATCH | `wireless-network/wlans/{wlanId}/ssids/{ssidId}/update-basic-config` | Full required basic-config body. |
| `update_ap_radio` | PATCH | `aps/{apMac}/radio-config` | Full multi-band config body. |

## WLAN groups helper

`GET wireless-network/wlans` lists WLAN groups and is used internally when an
SSID operation needs a `wlanId`.

## Authentication

`POST /openapi/authorize/token?grant_type=client_credentials` with Omada
client-credentials returns an access token. Authenticated Open API requests
use:

```text
Authorization: AccessToken=<accessToken>
```

This is separate from the fork's MCP-over-HTTP authentication. Remote MCP
clients call `/mcp` with:

```text
X-API-Key: <MCP_HTTP_API_KEY>
```

## Notes / gotchas

- Pagination is mandatory on list endpoints such as `devices`, `clients`,
  `logs/events`, and `logs/alerts`.
- Device detail varies by device type.
- Write tools default to `dryRun: true` at the MCP layer.
- The fork deliberately does not expose a generic arbitrary Omada API tool.
- New client PATCH operations should be exercised against the actual target
  controller in dry-run first and then with a reversible test client before
  production use.
