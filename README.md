# omada-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server for the
**TP-Link Omada SDN Controller**. It lets an MCP client read and safely modify
an Omada network through explicit, capability-gated tools.

This fork keeps the security-first design of `dfla-me/omada-mcp` and adds the
small set of features needed for remote Jarvis integration:

- **23 explicit tools** — no generic arbitrary-API escape hatch.
- Omada **Open API** with OAuth2 client credentials; no cookie/CSRF scraping.
- `safe-read`, `ops-write`, and `admin` capability profiles.
- Every write defaults to `dryRun: true` and state mutations are re-read after
  apply whenever the Omada API exposes the resulting state.
- Client identity management:
  - `set_client_name`
  - `set_client_fixed_ip`
- Native **MCP Streamable HTTP** at `/mcp` for remote clients such as Jarvis.
- HTTP mode requires an **`X-API-Key`** secret and an explicit enable switch.
- `stdio` remains the default transport for local MCP clients.

The original implementation was verified against **Omada Controller
6.2.10.17** (`apiVer 3`). The new client-update endpoint follows the Omada v1
Open API surface also used by the referenced Omada MCP implementations; live
validation against the target controller should still be performed before
using write mode in production.

## Quick start

### 1. Create an Omada Open API client

In the Omada controller open **Settings → Platform Integration → Open API**,
create a client-credentials application, and record:

- client ID
- client secret
- `omadacId`

See [`docs/SETUP.md`](docs/SETUP.md) for details.

### 2. Configure `.env`

```sh
cp .env.example .env
```

Minimum Omada configuration:

```ini
OMADA_BASE_URL=https://omada.local:8043
OMADA_CLIENT_ID=...
OMADA_CLIENT_SECRET=...
OMADA_OMADAC_ID=...
OMADA_SITE_ID=...                    # optional
OMADA_VERIFY_TLS=true
OMADA_CAPABILITY_PROFILE=safe-read   # safe-read | ops-write | admin
```

`.env` is git-ignored and must never be committed.

## Local stdio mode

`stdio` is the default and preserves upstream behavior.

```sh
npm install
npm run build
npm start
```

Example MCP-client configuration:

```jsonc
{
  "mcpServers": {
    "omada": {
      "command": "node",
      "args": ["/abs/path/to/omada-mcp/dist/index.js"]
    }
  }
}
```

The server looks for `.env` in the current working directory, next to the
project root resolved from the compiled entry point, or at
`OMADA_DOTENV_PATH` when explicitly provided.

## Remote Streamable HTTP mode

This mode is intended for Jarvis or another MCP client running on a different
host/container.

Generate a secret, for example:

```sh
openssl rand -hex 32
```

Then configure:

```ini
MCP_TRANSPORT=http
MCP_HTTP_ENABLE=true
MCP_HTTP_BIND=0.0.0.0
MCP_HTTP_PORT=3000
MCP_HTTP_API_KEY=<long-random-secret>
```

The MCP endpoint is:

```text
http://<omada-mcp-host>:3000/mcp
```

Every MCP request must contain:

```text
X-API-Key: <MCP_HTTP_API_KEY>
```

A static liveness endpoint is available at:

```text
GET /healthz
```

`/healthz` intentionally does not require authentication and returns only a
minimal `{ "status": "ok" }` response.

HTTP mode will refuse to start unless both `MCP_HTTP_ENABLE=true` and an API
key of at least 16 characters are configured. The API key is registered with
the logger's secret-redaction mechanism.

### Docker

Build locally:

```sh
docker build -t omada-mcp:local .
```

For a long-running remote MCP service, `docker-compose.example.yml` now
contains an authenticated Streamable HTTP example. Its port mapping is bound
to loopback by default; change that only when Jarvis is on another trusted
host and protect the port with the host/network firewall.

## Jarvis integration profile

The intended Jarvis deployment is:

```text
Jarvis dynamic MCP
        │
        │ Streamable HTTP + X-API-Key
        ▼
omada-mcp
        │
        │ Omada Open API + OAuth2 client credentials
        ▼
Omada Controller
```

Recommended Omada MCP capability profile for Jarvis:

```ini
OMADA_CAPABILITY_PROFILE=ops-write
```

This exposes reads plus low-risk operational writes, including the two client
management tools, while keeping the `admin` network/Wi-Fi configuration tools
hidden until explicitly enabled.

The client-management tools advertise MCP annotations compatible with
Jarvis's dynamic risk model:

- `readOnlyHint: false`
- `destructiveHint: false`
- `idempotentHint: true`

They therefore remain governed **WRITE** capabilities rather than being
misclassified as destructive operations.

## Tool catalog

All writes default to `dryRun: true`; pass `dryRun: false` to apply.

### Read (`safe-read`)

| Tool | Purpose |
|---|---|
| `list_sites` | List sites on the controller. |
| `list_devices` | APs, switches and gateways at a site. |
| `get_device` | Per-device detail; APs also expose radio config. |
| `get_ap_radios` | Per-band AP radio settings. |
| `list_clients` | Connected clients, network attachment and traffic summary. |
| `get_client` | Full client detail, including fixed-IP state when returned by Omada. |
| `list_ssids` | SSIDs grouped by WLAN group. |
| `get_ssid` | Full SSID configuration. |
| `get_site_settings` | Roaming, band-steering and mesh settings. |
| `list_events` | Site event log within a time window. |
| `list_logs` | Site alert log. |

### Operational writes (`ops-write`)

| Tool | Purpose |
|---|---|
| `reboot_device` | Reboot one AP, switch or gateway. |
| `block_client` / `unblock_client` | Block or allow a client by MAC. |
| `reconnect_client` | Force a client to re-associate. |
| `set_site_led` | Site-wide LED on/off. |
| `set_client_name` | Change the Omada display name of a client. |
| `set_client_fixed_ip` | Set a client fixed IPv4 address; if omitted, preserve its current IPv4 address. |
| `set_client_rate_limit` | Per-client upload/download bandwidth limits. |

### Admin writes (`admin`)

| Tool | Purpose |
|---|---|
| `update_site_roaming` | Fast roaming, AI roaming, force-disassociation and non-stick settings. |
| `update_band_steering` | Site band-steering mode. |
| `update_ssid` | Modify SSID basic configuration including name, band, broadcast, 802.11r, PMF and VLAN. |
| `update_ap_radio` | Per-AP/per-band channel, width, Tx power and radio enable. |

## Client management behavior

### `set_client_name`

Arguments:

```text
clientMac   required
name        required
dryRun      optional, defaults true
siteId      optional when OMADA_SITE_ID is configured
```

Apply flow:

```text
GET client → diff → PATCH client name → GET client → report actual state
```

### `set_client_fixed_ip`

Arguments:

```text
clientMac   required
fixedIp     optional IPv4 address
dryRun      optional, defaults true
siteId      optional when OMADA_SITE_ID is configured
```

When `fixedIp` is omitted, the tool reads the client's current IPv4 address
and uses that value. This allows requests such as "make the printer's current
IP fixed" without requiring the caller to know the address in advance.

Apply flow:

```text
GET client → choose/validate IPv4 → diff → PATCH fixedIp → GET client → report actual state
```

If the client has no current IPv4 address and no `fixedIp` was supplied, the
tool fails without sending a mutation.

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `OMADA_BASE_URL` | yes | — | Controller URL. |
| `OMADA_CLIENT_ID` | yes | — | Open API client ID. |
| `OMADA_CLIENT_SECRET` | yes | — | Open API client secret; redacted from logs. |
| `OMADA_OMADAC_ID` | yes | — | Controller ID. |
| `OMADA_SITE_ID` | no | — | Default site; otherwise tools require `siteId`. |
| `OMADA_VERIFY_TLS` | no | `true` | Disable only when required for a trusted self-signed controller certificate. |
| `OMADA_TIMEOUT_MS` | no | `30000` | Omada HTTP timeout. |
| `OMADA_CAPABILITY_PROFILE` | no | `safe-read` | `safe-read`, `ops-write`, or `admin`. |
| `MCP_TRANSPORT` | no | `stdio` | `stdio` or `http`. |
| `MCP_HTTP_ENABLE` | no | `false` | Required explicit opt-in for HTTP mode. |
| `MCP_HTTP_BIND` | no | `127.0.0.1` | Bind address for HTTP mode. |
| `MCP_HTTP_PORT` | no | `3000` | `/mcp` and `/healthz`. |
| `MCP_HTTP_API_KEY` | HTTP only | — | Required for HTTP mode; minimum 16 characters. Sent by clients as `X-API-Key`. |
| `LOG_LEVEL` | no | `info` | `debug`, `info`, `warn`, `error`. |
| `OMADA_DOTENV_PATH` | no | — | Explicit `.env` path override. |

## Security model

- `safe-read` is the default capability profile.
- Write tools are absent from the MCP inventory unless their capability tier
  is enabled.
- Writes default to `dryRun: true`.
- There is no generic tool that accepts an arbitrary Omada endpoint.
- Omada credentials are environment-only and never tool arguments.
- HTTP MCP traffic requires `X-API-Key` on every `/mcp` request.
- API secrets are registered for log redaction.
- The HTTP service should still be restricted to a trusted LAN/VPN/firewall;
  application authentication is not a substitute for network isolation.

## Development

```sh
npm install
npm run build
npm run typecheck
npm run lint
npm run test
```

CI runs lint, typecheck, tests and a Docker build.

`docs/openapi/` contains the captured TP-Link Omada Open API v1 specification
and endpoint notes.

## Prior art and attribution

The project builds on `dfla-me/omada-mcp`. The client update and Streamable
HTTP work was informed by other MIT-licensed Omada MCP implementations,
including:

- [`MiguelTVMS/tplink-omada-mcp`](https://github.com/MiguelTVMS/tplink-omada-mcp)
- [`realtydev/omada-mcp`](https://github.com/realtydev/omada-mcp)
- [`gaspareduard/Omada-mcp`](https://github.com/gaspareduard/Omada-mcp)

See `THIRD_PARTY_NOTICES.md` for retained notices relevant to adapted work.

## License

MIT — see [LICENSE](LICENSE).
