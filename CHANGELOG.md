# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/) and the
project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `set_client_name` — governed client display-name update through the Omada
  v1 client PATCH endpoint. Defaults to `dryRun: true`, is explicitly marked
  non-destructive/idempotent for MCP clients such as Jarvis, and re-reads the
  client after apply.
- `set_client_fixed_ip` — set an explicit client fixed IPv4 address or omit the
  address to preserve the client's current IPv4 value. Defaults to dry-run and
  re-reads after apply.
- Client read schema now retains `fixedIp` and `useFixedIp` when returned by
  the controller.
- Authenticated MCP **Streamable HTTP** transport at `/mcp`, suitable for
  remote Jarvis integration.
- HTTP mode requires both `MCP_HTTP_ENABLE=true` and `MCP_HTTP_API_KEY`; every
  `/mcp` request is authenticated with `X-API-Key`.
- Minimal unauthenticated `/healthz` liveness endpoint.
- HTTP authentication and client-write tests.
- `THIRD_PARTY_NOTICES.md` retaining the MIT notice relevant to adapted work.

### Changed

- Tool inventory is now 23 tools: 11 reads, 8 `ops-write`, and 4 `admin`.
- `docker-compose.example.yml` now contains a working authenticated HTTP MCP
  service instead of a future placeholder.
- Docker image documents port 3000 with `EXPOSE` while preserving stdio as the
  default transport.
- README now documents both local stdio and remote Jarvis-compatible HTTP
  deployments.

### Fixed

- `.env` loads when the server is launched by an MCP client (e.g. Claude
  Desktop) that doesn't set the working directory. The config loader also
  looks beside the compiled entry point and at an explicit
  `OMADA_DOTENV_PATH` override, in addition to `cwd`.

### Existing upstream additions

- Multi-stage `Dockerfile` and `docker-compose.example.yml` paired with
  `mbentley/omada-controller`.
- `vitest` suite covering capability gating, dry-run diffing, the OAuth2 token
  manager, HTTP errorCode handling and Zod shape validation.
- GitHub Actions CI: lint, typecheck, test and docker build.
- `update_ssid` and `update_ap_radio` admin writes.
- Dry-run framework with diff helpers, action-preview, state-preview and
  post-apply override report.
- `ops-write` tier originally included `reboot_device`, `block_client`,
  `unblock_client`, `reconnect_client`, `set_site_led`, and
  `set_client_rate_limit`.
- `admin` tier originally included `update_site_roaming` and
  `update_band_steering`.
- Read tools include `list_sites`, `list_devices`, `get_device`,
  `get_ap_radios`, `list_clients`, `get_client`, `list_ssids`, `get_ssid`,
  `get_site_settings`, `list_events`, and `list_logs`.
- Captured the official TP-Link Omada Open API v1 spec into `docs/openapi/`.
