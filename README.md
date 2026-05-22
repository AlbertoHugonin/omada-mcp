# omada-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server for the
**TP-Link Omada SDN Controller**. It lets an AI assistant read and safely
modify an Omada network through well-defined, capability-gated tools.

Designed as a security-first companion to
[`mbentley/docker-omada-controller`](https://github.com/mbentley/docker-omada-controller) —
drop it into the same `docker-compose.yml` as the controller.

- Talks to the **Omada Open API** (OAuth2 client-credentials), not the internal
  cookie/CSRF API.
- Read **and** write tools, gated by capability profiles (`safe-read` /
  `ops-write` / `admin`); read-only by default.
- Every write tool previews changes with `dryRun` before applying.
- stdio transport by default; HTTP transport is opt-in.

## Status

Under active development, built in phases. Phase 0 (scaffold) is complete:
the server starts over stdio. Read tools, write tools, Docker packaging and
the full test suite land in subsequent phases.

## Getting started

See [`docs/SETUP.md`](docs/SETUP.md) for creating the Open API client in the
controller and populating `.env`.

Full quick-start, the env-var reference and the tool catalog will be documented
here as the build progresses.

## License

MIT — see [LICENSE](LICENSE).
