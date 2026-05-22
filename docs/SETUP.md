# Setup — creating an Omada Open API client

`omada-mcp` talks to the controller through the **Omada Open API** using an
OAuth2 **client-credentials** grant. You create an API client inside the
controller UI; that yields the `OMADA_CLIENT_ID` / `OMADA_CLIENT_SECRET` pair
the server needs. This guide covers Omada Controller **6.2.10.17**.

> Menu labels move between controller versions. The steps below match the 6.2.x
> line; if a label differs on your controller, look for the nearest equivalent
> under **Settings**. Confirm the exact wording on your own controller — and
> tell the maintainer if it differs, so this doc can be corrected.

## 1. Prerequisites

- Admin access to the Omada Controller web UI.
- The controller reachable over HTTPS (default port `8043`, or `443` for some
  installs / the cloud-style setup).

## 2. Create the API client

1. Log in to the controller as an administrator.
2. Go to **Settings → Platform Integration**.
3. Open the **Open API** section/tab and choose **Add** (or **Create New App**).
4. Fill in:
   - **Name** — e.g. `omada-mcp`.
   - **Grant Type / Mode** — select **Client Credentials**.
   - **Role** — controls what the API client may do:
     - For `safe-read` (read-only) a **Viewer** role is enough.
     - For `ops-write` / `admin` write profiles, assign a role with write
       permissions on the target site (e.g. **Administrator**, or a custom
       role scoped to that site).
   - **Site privileges** — grant the client access to the site(s) you will
     manage. If unsure, grant the specific site you operate.
5. Save. The controller shows a **Client ID** and a **Client Secret**.

> Copy the **Client Secret now** — most versions show it only once. If you lose
> it, regenerate the secret from the same page.

## 3. Find the `omadacId` (Controller ID)

The Open API scopes every request by the controller ID. Three ways to get it:

- **From the URL** — after logging in, the browser URL looks like
  `https://<host>:8043/<omadacId>/...`. The long hex segment is the `omadacId`.
- **From the API client page** — some versions display the Controller ID
  alongside the client credentials.
- **From the unauthenticated info endpoint** — `GET https://<host>:8043/api/info`
  returns JSON containing `omadacId` and the controller version.

## 4. Fill in `.env`

Copy `.env.example` to `.env` and set at least:

```ini
OMADA_BASE_URL=https://<host>:8043
OMADA_CLIENT_ID=<client id from step 2>
OMADA_CLIENT_SECRET=<client secret from step 2>
OMADA_OMADAC_ID=<omadacId from step 3>

# Self-signed controller certificate? Disable TLS verification:
OMADA_VERIFY_TLS=false

# Start read-only; raise this only when you intend to make changes:
OMADA_CAPABILITY_PROFILE=safe-read
```

`.env` is git-ignored. Never commit it and never paste the secret into a chat,
an issue, or a tool argument — `omada-mcp` reads credentials only from the
environment and never logs or echoes them.

## 5. Verify

Once Phase 1 of the build is in place, the `list_sites` tool confirms the
credentials end-to-end: a successful call means auth works and the controller
is reachable.

## Notes on the Open API

- The Open API lives under an `/openapi/...` path and is distinct from the
  controller's internal `/<omadacId>/api/v2/...` cookie-based API. `omada-mcp`
  uses the Open API exclusively.
- Token requests use the client-credentials grant; the controller returns an
  access token with a finite lifetime, which the server caches and refreshes.
- The captured Open API specification for the target controller version lives
  in [`openapi/`](./openapi/) once recorded against the live controller.
