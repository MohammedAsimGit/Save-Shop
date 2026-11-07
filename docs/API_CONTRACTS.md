# API Contracts

Base path: `{API_PREFIX}` (default `/api/v1`). Health, product comparison and source coverage
exist today; the envelope and conventions below apply to every future endpoint.

## 1. Conventions

| Topic         | Convention                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Format        | JSON, UTF-8                                                                                                                           |
| Versioning    | URL path segment (`/api/v1`); a breaking change means `/api/v2`                                                                       |
| Success shape | `{ "data": <payload> }`, optionally `"meta"` for pagination/request id                                                                |
| Error shape   | `{ "error": { "code", "message", "details"?, "requestId"? } }`                                                                        |
| Correlation   | `x-request-id` request header is reused if well-formed, otherwise generated; always echoed in the response header and in error bodies |
| Validation    | Zod at the API boundary; failures return `400 VALIDATION_ERROR` with field messages                                                   |
| Timestamps    | ISO 8601 UTC strings (`2026-11-05T09:30:00.000Z`)                                                                                     |
| Money         | `{ "amountMinor": 129900, "currency": "INR" }` — integers only                                                                        |
| Auth          | Not implemented. When added, `Authorization: Bearer <firebase-id-token>`                                                              |

Clients must branch on `error.code`, never on `message` text.

## 2. Error codes

`VALIDATION_ERROR` (400), `NOT_FOUND` (404), `CONFLICT` (409), `UNAUTHORIZED` (401),
`FORBIDDEN` (403), `RATE_LIMITED` (429), `SERVICE_UNAVAILABLE` (503), `INTERNAL_ERROR` (500).

## 3. `GET /api/v1/health`

Reports process health plus a real dependency check.

**200 – healthy or no database configured**

```json
{
  "data": {
    "status": "ok",
    "service": "smart-shopping-api",
    "version": "0.1.0",
    "environment": "development",
    "uptimeSeconds": 42,
    "timestamp": "2026-11-05T09:30:00.000Z",
    "checks": {
      "database": {
        "status": "not_configured",
        "message": "MONGODB_URI is not set for this environment"
      }
    }
  }
}
```

**200 – database up** (`checks.database.status = "up"`, with `latencyMs` from a real ping):

```json
{
  "data": {
    "status": "ok",
    "...": "...",
    "checks": { "database": { "status": "up", "latencyMs": 3 } }
  }
}
```

**503 – configured database unreachable** (`status: "degraded"`):

```json
{
  "data": {
    "status": "degraded",
    "...": "...",
    "checks": { "database": { "status": "down", "message": "Connection state: disconnected" } }
  }
}
```

Rules:

- `status` is `ok` only when every checked dependency is up **or** legitimately absent
  (`not_configured`).
- The database is never reported as `up` without a successful ping.
- `not_configured` is never reported as healthy — it is reported as absent.
- The payload is validated by `healthResponseSchema` in `@smart-shopping/shared`, which both clients
  use before rendering.

## 4. `GET /api/v1/products/:productId/comparison`

Ranks the price snapshots every enabled source returns for one product. Ranking happens in the
shared engine (`packages/shared/src/comparison/engine.ts`), so the API, web and mobile cannot
disagree about which offer is lowest.

`productId` is a lowercase catalogue slug (`/^[a-z0-9][a-z0-9-]*$/`, max 120 chars); a malformed id
is `400 VALIDATION_ERROR`, an unknown product is `404 NOT_FOUND`.

**200**

```json
{
  "data": {
    "productId": "sony-wh1000xm5",
    "product": {
      "id": "sony-wh1000xm5",
      "title": "Sony WH-1000XM5 Wireless Headphones",
      "brand": "Sony",
      "catalog": "demo-catalog"
    },
    "currency": "INR",
    "generatedAt": "2026-11-07T05:59:26.092Z",
    "status": "sample_only",
    "lowest": {
      "productId": "sony-wh1000xm5",
      "marketplaceId": "amazon",
      "sourceId": "demo-catalog",
      "productUrl": "https://demo.saveshop.example/product/sony-wh1000xm5",
      "price": { "amountMinor": 2699000, "currency": "INR" },
      "availability": "in_stock",
      "capturedAt": "2026-11-07T05:57:26.000Z",
      "ttlSeconds": 3600,
      "attribution": { "label": "Amazon India - invented sample price" },
      "source": { "id": "demo-catalog", "verification": "sample", "...": "..." },
      "freshness": "fresh",
      "isLowest": true,
      "isVerified": false
    },
    "lowestVerified": null,
    "offers": [],
    "excluded": [
      { "reason": "unavailable", "detail": "The offer is not in stock", "snapshot": {} }
    ],
    "sources": [],
    "notices": [
      "Demo source: prices are generated sample values, not marketplace observations.",
      "Every eligible offer comes from a sample source and is not a live price."
    ]
  }
}
```

Field rules:

- `offers` — eligible offers, cheapest first. Ties break on the freshest observation, then
  `marketplaceId`, so identical input always produces identical order.
- `lowest` / `lowestVerified` — `lowest` is the cheapest eligible offer whatever its provenance;
  `lowestVerified` is the cheapest offer whose **source** is permitted to verify prices, and is
  `null` for demo data. A price is never "verified" because it looks plausible.
- `isVerified` — derived from `source.verification`, never from the number.
- `status` — `verified` (at least one eligible offer from a verified source), `sample_only` (only
  sample data was eligible), `no_offers` (nothing usable right now).
- `excluded` — every observation left out, with a reason: `invalid`, `unknown_source`, `stale`,
  `unavailable`, `currency_mismatch`, `future_timestamp`. Excluded prices never appear in `offers`.
- `freshness` — `fresh` only while `capturedAt + ttlSeconds` is in the future. Stale observations are
  excluded and counted in `notices`, never shown as current.
- **No conversion, no invention.** A price in another currency is excluded rather than converted,
  and shipping, discounts and delivery estimates are absent because no source supplies them.

## 5. `GET /api/v1/sources`

Reports which price sources exist, which are enabled, and why the rest are not.

```json
{
  "data": {
    "generatedAt": "2026-11-07T05:59:26.092Z",
    "sources": [
      {
        "id": "demo-catalog",
        "displayName": "SaveShop demo catalogue",
        "kind": "demo",
        "verification": "sample",
        "attribution": { "label": "Invented sample prices, not marketplace data" },
        "permission": { "status": "granted", "permitsPriceAlerts": false },
        "coverage": { "countries": ["IN"], "marketplaces": ["amazon", "flipkart"] },
        "enabled": true
      },
      {
        "id": "amazon-in",
        "displayName": "Amazon India",
        "kind": "marketplace_api",
        "verification": "verified",
        "permission": { "status": "pending", "permitsPriceAlerts": false },
        "coverage": { "countries": ["IN"], "marketplaces": ["amazon"] },
        "enabled": false,
        "disabledReason": "No written permission. The Associates Creators API must not be used ..."
      }
    ],
    "notices": [
      "Enabled sources: SaveShop demo catalogue.",
      "Enabled sample sources return invented prices and are labelled as demo data.",
      "Awaiting written permission: Amazon India, Flipkart."
    ]
  }
}
```

A disabled source is a descriptor only: it has no request code, no endpoint and no credential, and
its adapter throws if anything tries to query it. See
[INGESTION_FEASIBILITY.md](INGESTION_FEASIBILITY.md) for the evidence behind each status.

## 6. Other endpoints

**`GET /`** — discovery document (`{ data: { name, version, apiPrefix } }`). Useful for humans.

**Unmatched routes** — `404` with `{ "error": { "code": "NOT_FOUND", "message": "Route not found: GET /x", "requestId": "..." } }`.

**CORS** — requests from an origin not on `CORS_ALLOWED_ORIGINS` receive `403 FORBIDDEN` and no
`access-control-allow-origin` header. Requests without an `Origin` header (curl, server-to-server,
native apps) are allowed.

## 7. Planned endpoints (NOT implemented)

Listed only so the contract can be designed coherently later. Definitions, field names and status
codes are not final and must not be relied upon.

- `GET /products?q=` — search
- `GET /products/:id` — product with variants
- `GET /products/:id/history` — stored price observations
- `GET|POST|DELETE /wishlist`
- `POST /auth/session` — verify a Firebase token (design undecided)
- `GET /me/subscription`

## 8. Client behaviour

Both clients implement the same rules in `src/services/apiClient.ts`:

- 8 s timeout (web: `AbortSignal.timeout`; mobile: `AbortController`, since Hermes support for
  `AbortSignal.timeout` is not guaranteed);
- non-2xx + `error` envelope → typed `ApiError` with `code`, `message`, `details`, `requestId`;
- transport failure → `ApiError` with `code: "NETWORK_ERROR"`;
- a 2xx body without `data` → `ApiError` with `code: "INVALID_RESPONSE"` (contract drift is never
  silently ignored);
- comparison and coverage payloads are parsed against their Zod schemas before rendering, so a
  drifted response surfaces as an error instead of a wrong price.
