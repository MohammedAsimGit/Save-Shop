# API Contracts

Base path: `{API_PREFIX}` (default `/api/v1`). Only the health endpoint exists today; the envelope
and conventions below apply to every future endpoint.

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

## 4. Other endpoints

**`GET /`** — discovery document (`{ data: { name, version, apiPrefix } }`). Useful for humans.

**Unmatched routes** — `404` with `{ "error": { "code": "NOT_FOUND", "message": "Route not found: GET /x", "requestId": "..." } }`.

**CORS** — requests from an origin not on `CORS_ALLOWED_ORIGINS` receive `403 FORBIDDEN` and no
`access-control-allow-origin` header. Requests without an `Origin` header (curl, server-to-server,
native apps) are allowed.

## 5. Planned endpoints (NOT implemented)

Listed only so the contract can be designed coherently later. Definitions, field names and status
codes are not final and must not be relied upon.

- `GET /products?q=` — search
- `GET /products/:id` — product with variants
- `GET /products/:id/comparison` — listings + latest verified prices
- `GET /products/:id/history` — price snapshots
- `GET|POST|DELETE /wishlist`
- `POST /auth/session` — verify a Firebase token (design undecided)
- `GET /me/subscription`

## 6. Client behaviour

Both clients implement the same rules in `src/services/apiClient.ts`:

- 8 s timeout (web: `AbortSignal.timeout`; mobile: `AbortController`, since Hermes support for
  `AbortSignal.timeout` is not guaranteed);
- non-2xx + `error` envelope → typed `ApiError` with `code`, `message`, `details`, `requestId`;
- transport failure → `ApiError` with `code: "NETWORK_ERROR"`;
- a 2xx body without `data` → `ApiError` with `code: "INVALID_RESPONSE"` (contract drift is never
  silently ignored).
