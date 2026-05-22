# Verified Omada Open API endpoints

Shapes confirmed against a **live Omada Controller 6.2.10.17** (`apiVer` 3).
Sample values are redacted. This file grows as each phase verifies more
endpoints; it is the authoritative reference for what `omada-mcp` actually
relies on.

## Common envelope

Every Open API response is a JSON envelope:

```jsonc
{
  "errorCode": 0,            // 0 = success; non-zero = error
  "msg": "Success.",         // human-readable status / error text
  "result": { /* ... */ }    // payload, present on success
}
```

`errorCode !== 0` must be treated as a failure regardless of HTTP status.

## Paginated list result

List endpoints wrap their items like this:

```jsonc
{
  "totalRows": 1,
  "currentPage": 1,
  "currentSize": 100,
  "data": [ /* items */ ]
}
```

## GET /api/info  (unauthenticated)

Controller discovery. No auth required. Useful to confirm reachability and the
`omadacId`.

```jsonc
{
  "errorCode": 0,
  "msg": "Success.",
  "result": {
    "controllerVer": "6.2.10.17",
    "apiVer": "3",
    "configured": true,
    "type": 1,
    "supportApp": true,
    "omadacId": "<32-char hex>",
    "registeredRoot": true,
    "omadacCategory": "advanced",
    "mspMode": false,
    "omadaCloudUrl": "https://omada.tplinkcloud.com"
  }
}
```

## POST /openapi/authorize/token?grant_type=client_credentials

OAuth2 client-credentials grant. Request body is JSON:

```jsonc
{
  "omadacId": "<OMADA_OMADAC_ID>",
  "client_id": "<OMADA_CLIENT_ID>",
  "client_secret": "<OMADA_CLIENT_SECRET>"
}
```

Response `result`:

```jsonc
{
  "accessToken": "<token>",
  "tokenType": "bearer",
  "expiresIn": 7200,          // seconds
  "refreshToken": "<token>"
}
```

## Authenticated requests — Authorization header

Authenticated Open API calls use a **non-standard** header scheme — the literal
prefix `AccessToken=`, not `Bearer`:

```
Authorization: AccessToken=<accessToken>
```

Confirmed working on 6.2.10.17.

## GET /openapi/v1/{omadacId}/sites

Lists sites. Query params: `page` (1-based), `pageSize`.

`result` is a paginated list; each item:

```jsonc
{
  "siteId": "<24-char hex>",
  "name": "Site Name",
  "region": "Canada",
  "timeZone": "America/Los_Angeles",
  "scenario": "Home",
  "type": 0,
  "supportES": true,
  "supportL2": true,
  "primary": true
}
```
