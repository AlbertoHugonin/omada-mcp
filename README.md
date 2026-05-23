# omada-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server for the
**TP-Link Omada SDN Controller**. It lets an AI assistant read and safely
modify an Omada network through well-defined, capability-gated tools.

Designed as a security-first companion to
[`mbentley/docker-omada-controller`](https://github.com/mbentley/docker-omada-controller).

- Talks to the **Omada Open API** (OAuth2 client-credentials) — *not* the
  internal cookie/CSRF API. The full v1 OpenAPI spec is captured in
  [`docs/openapi/`](docs/openapi/).
- **21 tools** covering reads (sites, devices, clients, SSIDs, site settings,
  events, logs) and writes (reboot, block/unblock/reconnect client, rate
  limit, LED, SSID config, AP radio config, site roaming, band steering).
- **Capability profiles** gate what the assistant can do — `safe-read` is the
  default and exposes only read tools. Writes require explicit opt-in via
  env var.
- Every write tool defaults to `dryRun: true` — preview the diff before
  applying. After apply, the controller is re-read and any silent overrides
  are surfaced (see [§5 of the build brief](docs/SETUP.md#notes-on-the-open-api)).
- stdio transport by default. HTTP transport is opt-in and gated by two
  env vars; not yet implemented.

Verified against **Omada Controller 6.2.10.17** (`apiVer 3`).

## Quick start

### 1. Create an Open API client in the controller

Follow [`docs/SETUP.md`](docs/SETUP.md): in the controller go to
**Settings → Platform Integration → Open API**, create a client-credentials
app, and capture the **client ID**, **client secret** and **omadacId**.

### 2. Configure `.env`

Copy `.env.example` to `.env` and fill in:

```ini
OMADA_BASE_URL=https://omada.local:8043
OMADA_CLIENT_ID=...
OMADA_CLIENT_SECRET=...
OMADA_OMADAC_ID=...
OMADA_SITE_ID=...            # optional; tools require an explicit siteId otherwise
OMADA_VERIFY_TLS=false       # for self-signed controller certs
OMADA_CAPABILITY_PROFILE=safe-read   # safe-read | ops-write | admin
```

### 3a. Run via `docker run` (recommended, alongside mbentley)

```sh
docker compose -f docker-compose.example.yml up -d omada-controller
# then point your MCP client at:
docker run -i --rm --env-file .env ghcr.io/<owner>/omada-mcp:latest
```

MCP-client config snippet (Claude Desktop, `claude_desktop_config.json`):

```jsonc
{
  "mcpServers": {
    "omada": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "--env-file", "/abs/path/to/.env",
               "ghcr.io/<owner>/omada-mcp:latest"]
    }
  }
}
```

### 3b. Run from source

```sh
npm install
npm run build
node dist/index.js
```

## Tool catalog

All read tools are tagged `safe-read`. Every write tool defaults to
`dryRun: true` — pass `dryRun: false` to apply.

### Read (`safe-read`)

| Tool | Purpose |
|---|---|
| `list_sites` | List sites on the controller. |
| `list_devices` | APs / switches / gateway at a site, with status & firmware. |
| `get_device` | Per-device detail; for APs, also per-band radio config. |
| `get_ap_radios` | Per-band radio settings on one AP. |
| `list_clients` | Connected clients with SSID, AP, RSSI, traffic. Summary counts. |
| `get_client` | Full client detail. |
| `list_ssids` | SSIDs grouped by WLAN group. |
| `get_ssid` | Full SSID configuration. |
| `get_site_settings` | Aggregate roaming + band-steering + mesh. |
| `list_events` | Site event log within a time window. |
| `list_logs` | Site alert log (with `resolved` filter). |

### Operational writes (`ops-write`)

| Tool | Purpose |
|---|---|
| `reboot_device` | Reboot one AP / switch / gateway. |
| `block_client` / `unblock_client` | Block / allow a client by MAC. |
| `reconnect_client` | Force a client to re-associate. |
| `set_client_rate_limit` | Per-client up / down bandwidth limit. |
| `set_site_led` | Site-wide LED on / off. |

### Admin writes (`admin`)

| Tool | Purpose |
|---|---|
| `update_site_roaming` | Fast roaming, AI roaming, force-disassociation, non-stick. |
| `update_band_steering` | Site band-steering mode. |
| `update_ssid` | Modify SSID basic config (name, band, broadcast, 802.11r, PMF, VLAN). |
| `update_ap_radio` | Per-AP per-band: channel, width, Tx power, radio enable. |

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `OMADA_BASE_URL` | yes | — | Controller URL, no trailing slash. |
| `OMADA_CLIENT_ID` | yes | — | From the Open API app. |
| `OMADA_CLIENT_SECRET` | yes | — | From the Open API app. Never logged. |
| `OMADA_OMADAC_ID` | yes | — | Controller ID. |
| `OMADA_SITE_ID` | no | — | Default site; otherwise tools need `siteId`. |
| `OMADA_VERIFY_TLS` | no | `true` | `false` for self-signed. |
| `OMADA_TIMEOUT_MS` | no | `30000` | HTTP timeout. |
| `OMADA_CAPABILITY_PROFILE` | no | `safe-read` | `safe-read` / `ops-write` / `admin`. |
| `MCP_TRANSPORT` | no | `stdio` | `stdio` or `http`. |
| `MCP_HTTP_ENABLE` | no | `false` | Must be `true` AND `MCP_TRANSPORT=http` for HTTP. |
| `MCP_HTTP_BIND` | no | `127.0.0.1` | Loopback by default. |
| `MCP_HTTP_PORT` | no | `3000` | |
| `LOG_LEVEL` | no | `info` | `debug` / `info` / `warn` / `error`. |

## Security

- Default profile is `safe-read` — writes require an explicit env-var opt-in.
- Every write tool defaults to `dryRun: true`. Apply mode performs a
  GET-merge-PATCH and **re-reads** to surface any controller-side overrides
  (mutually-exclusive settings, silent rejections).
- Credentials are read only from env vars, never from tool arguments, never
  logged, never returned in tool output. The access token is registered with
  the logger so any accidental serialisation is masked.
- HTTP transport is off unless both `MCP_TRANSPORT=http` and
  `MCP_HTTP_ENABLE=true`. Loopback bind by default. (Implementation lands
  in a future release.)

## Development

```sh
npm install
npm run build         # tsc
npm run typecheck     # tsc --noEmit
npm run lint          # biome check
npm run test          # vitest
```

`docs/openapi/` holds the captured TP-Link Omada Open API v1 spec
(`omada-open-api-v1-spec.json`, OpenAPI 3.0.1) and an `endpoint-map.md`
documenting which Open API endpoint backs each MCP tool.

## Prior art

Three other Omada MCP projects were consulted as references during the
design (all MIT):

- [`MiguelTVMS/tplink-omada-mcp`](https://github.com/MiguelTVMS/tplink-omada-mcp)
- [`realtydev/omada-mcp`](https://github.com/realtydev/omada-mcp)
- [`gaspareduard/Omada-mcp`](https://github.com/gaspareduard/Omada-mcp)

`omada-mcp` is independent code; the differentiator is the security-first
capability tiers, the dry-run framework with post-apply re-read, and
first-class write coverage of SSID / AP-radio / site-roaming config.

## License

MIT — see [LICENSE](LICENSE).
