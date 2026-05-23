# Contributing to omada-mcp

Thanks for considering a contribution.

## Quick-start for development

```sh
git clone https://github.com/<owner>/omada-mcp
cd omada-mcp
npm install
cp .env.example .env   # fill in your controller credentials
npm run build
npm run test
```

Then exercise the server against your own controller (see the README's
"Run from source" section).

## Workflow

- Open an issue first for anything beyond a small fix — it's worth
  agreeing on direction before someone writes code.
- Branch off `main`. Keep PRs small and focused on one concern.
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:` …) so the
  CHANGELOG can be generated cleanly.
- Run `npm run lint`, `npm run typecheck`, `npm run test` and `npm run
  build` locally before pushing. CI runs the same.
- For any change that touches a write tool, verify the dry-run preview
  against a live controller, and ideally the apply path on a
  reversible setting (e.g. site LED toggle).

## Adding a new tool

1. Identify the Open API endpoint(s) in `docs/openapi/omada-open-api-v1-spec.json`.
   Pull request the `docs/openapi/endpoint-map.md` if the mapping changes.
2. Add typed schemas to `src/omada/types.ts`. Keep them tolerant — extra
   fields are stripped, missing required fields fail loudly.
3. Add a client method to `src/omada/client.ts`.
4. Create the tool file under `src/tools/read/` or `src/tools/write/`.
   Tag with the correct `tier` (`safe-read` / `ops-write` / `admin`).
5. Register it in `src/tools/registry.ts`.
6. Write tests under `tests/` for any new helper logic.
7. For write tools, integrate with `src/tools/dryRun.ts` — every write
   tool defaults to `dryRun: true` and must re-read after applying so
   silent controller overrides are surfaced.

## Code quality

- Strict TypeScript; no `any` in public interfaces.
- Validate every Open API response with Zod and throw a clear,
  actionable error on shape mismatch — the early-warning system for
  firmware drift.
- Never accept credentials in tool arguments. Never log secrets.
- Default to safe: read-only profile, dry-run write tools, loopback
  binds, TLS verification on.

## Security disclosures

If you find a security issue, please open a private security advisory
on GitHub rather than a public issue. Do not include secrets, tokens
or controller URLs in any public report.
