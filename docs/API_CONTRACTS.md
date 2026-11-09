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
| Auth          | Shopper auth is not implemented. `/admin/**` (except login) requires `Authorization: Bearer <admin-jwt>`; see §14.                    |

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

Caching (Sprint 3):

- a response is cached per product, currency and enabled-source set, for at most
  `COMPARISON_CACHE_TTL_SECONDS` (default 300 s) **and never longer than the smallest remaining
  source freshness**; a cached offer that would have aged past its TTL is discarded and the
  comparison recomputed;
- a run in which any adapter failed is never cached, so a transient provider error cannot pin a
  degraded answer in place;
- the cached payload is re-parsed against the contract on every hit, and a cache outage degrades to
  a normal recomputation rather than an error.

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

## 6. `GET /api/v1/products/:productId/history`

Stored price observations for one product. Every point is a row that was actually ingested from a
source; nothing is interpolated, smoothed, back-filled or synthesised. A product with one
observation returns one observation.

Query parameters (all validated with Zod; unknown values are a `400`):

| Parameter       | Type                   | Default | Notes                                                         |
| --------------- | ---------------------- | ------- | ------------------------------------------------------------- |
| `period`        | `7d` \| `30d` \| `90d` | `30d`   | Window ends now; no arbitrary ranges                          |
| `sourceId`      | string                 | —       | Exact source filter                                           |
| `marketplaceId` | string                 | —       | Exact marketplace filter                                      |
| `limit`         | integer 1–500          | `200`   | Keeps the **most recent** observations, returned oldest first |

**200**

```json
{
  "data": {
    "productId": "sony-wh1000xm5",
    "product": {
      "id": "sony-wh1000xm5",
      "title": "Sony WH-1000XM5",
      "brand": "Sony",
      "catalog": "demo-catalog"
    },
    "currency": "INR",
    "period": "30d",
    "from": "2026-10-08T05:57:26.000Z",
    "to": "2026-11-07T05:57:26.000Z",
    "generatedAt": "2026-11-07T05:57:26.000Z",
    "status": "sample_only",
    "observations": [
      {
        "productId": "sony-wh1000xm5",
        "marketplaceId": "amazon",
        "sourceId": "demo-catalog",
        "productUrl": "https://demo.saveshop.example/product/sony-wh1000xm5",
        "price": { "amountMinor": 2699000, "currency": "INR" },
        "availability": "in_stock",
        "capturedAt": "2026-11-07T05:55:26.000Z",
        "ttlSeconds": 3600,
        "attribution": { "label": "Amazon India - invented sample price" },
        "source": { "id": "demo-catalog", "verification": "sample", "...": "..." },
        "isSample": true,
        "freshness": "fresh"
      }
    ],
    "rollups": [
      {
        "productId": "sony-wh1000xm5",
        "sourceId": "demo-catalog",
        "marketplaceId": "amazon",
        "currency": "INR",
        "date": "2026-08-14",
        "minPrice": { "amountMinor": 2499000, "currency": "INR" },
        "maxPrice": { "amountMinor": 2899000, "currency": "INR" },
        "firstPrice": { "amountMinor": 2899000, "currency": "INR" },
        "lastPrice": { "amountMinor": 2499000, "currency": "INR" },
        "observationCount": 6,
        "availabilityCounts": { "inStock": 5, "outOfStock": 1, "preorder": 0, "unknown": 0 },
        "sourceVerification": "sample",
        "isSample": true,
        "generatedAt": "2026-11-07T02:00:00.000Z",
        "aggregated": true,
        "source": { "id": "demo-catalog", "verification": "sample", "...": "..." }
      }
    ],
    "summary": {
      "verified": { "count": 0, "lowest": null, "latest": null },
      "sample": {
        "count": 1,
        "lowest": {
          "price": { "amountMinor": 2699000, "currency": "INR" },
          "capturedAt": "2026-11-07T05:55:26.000Z",
          "marketplaceId": "amazon",
          "sourceId": "demo-catalog"
        },
        "latest": {
          "price": { "amountMinor": 2699000, "currency": "INR" },
          "capturedAt": "2026-11-07T05:55:26.000Z",
          "marketplaceId": "amazon",
          "sourceId": "demo-catalog"
        }
      }
    },
    "filters": { "sourceId": null, "marketplaceId": null, "limit": 200 },
    "notices": [
      "History covers 1 stored observation from 2026-10-08 to 2026-11-07.",
      "Sample observations are invented demo prices, not marketplace history, and are summarised separately from verified observations."
    ]
  }
}
```

Field rules:

- `observations` — chronological, oldest first. Stale observations are kept (history is history) but
  carry `freshness: "stale"`, so a client can never present one as current.
- `rollups` — archived **daily aggregates** for days already compacted out of raw storage, oldest
  first (Sprint 4). One entry per `(day, marketplace, source, currency, provenance)`. It carries
  `aggregated: true`, the day's `minPrice`/`maxPrice`/`firstPrice`/`lastPrice`, the
  `observationCount` and the availability counts. Rollups are **not** observations: they are never
  added to `observations`, never counted in `summary`, and never plotted as a point-in-time price.
  The field defaults to `[]`, so payloads (and older clients) without it remain valid.
- `summary.verified` / `summary.sample` — **separate by provenance and never merged**. There is no
  single "lowest ever" figure, because that number would mix invented and observed data.
- `status` — `no_history`, `sample_only`, `verified` or `mixed`; `mixed` means both provenances are
  present and the UI must keep them apart.
- Excluded from the payload and explained in `notices`: unparseable rows, rows from a source that is
  no longer registered, and prices in another currency (no conversion is performed).
- A known product with nothing stored is `200` with `status: "no_history"` and empty
  `observations`/`rollups` arrays; an unknown product is `404 NOT_FOUND`.
- When a window has been compacted, `observations` may be empty while `rollups` is not. `status` is
  then derived from the archived provenance (`verified`, `sample_only` or `mixed`), never reported as
  `no_history`, and a notice explains the compaction. Rollups in another currency, or from a source
  that is no longer registered, are excluded and counted in `notices` — never converted or merged.

## 7. `GET /api/v1/products`

Canonical catalogue search. Returns **products**, never marketplace listings.

Query parameters (all validated with Zod; unknown values are a `400`):

| Parameter  | Type                        | Default  | Notes                                                  |
| ---------- | --------------------------- | -------- | ------------------------------------------------------ |
| `q`        | string (≤ 120)              | –        | Matched against name, brand, model, id and identifiers |
| `brand`    | string (≤ 80)               | –        | Exact brand key filter                                 |
| `category` | slug                        | –        | e.g. `audio`, `phones`                                 |
| `model`    | string (≤ 40)               | –        | Reserved; currently reported back in `query`           |
| `status`   | `active`/`draft`/`archived` | `active` | Archived products are excluded by default              |
| `page`     | integer 1–500               | `1`      | 1-based                                                |
| `pageSize` | integer 1–48                | `12`     | Maximum page size                                      |

```json
{
  "data": {
    "query": { "q": "sony", "brand": null, "category": null, "model": null },
    "products": [
      {
        "id": "sony-wh1000xm5",
        "name": "Sony WH-1000XM5 Wireless Headphones",
        "brand": "Sony",
        "category": "audio",
        "specifications": {},
        "variantOf": null,
        "variantAttributes": {},
        "imageUrls": [],
        "status": "active",
        "provenance": "demo",
        "isSample": true,
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z"
      }
    ],
    "page": 1,
    "pageSize": 12,
    "totalItems": 1,
    "ordering": "relevance",
    "notices": [
      "Matches are against canonical product identity (name, brand, model and identifiers), not marketplace titles."
    ]
  },
  "meta": { "page": 1, "pageSize": 12, "totalItems": 1 }
}
```

Relevance is deterministic and additive (documented in `catalogue.service.ts`): exact product id 1000,
GTIN 900, MPN 850, exact brand query 400, model inside the query 350, full-name substring 120, each
query token present in the name 60, each prefix token 35. Ties are broken by name and then id, so a
page is always a slice of a stable order. An empty result is a `200` with `products: []`.

## 8. `GET /api/v1/products/:productId`

Canonical product plus a summary of its listing matches. `404 NOT_FOUND` for an unknown or malformed
`productId` shape (malformed is `400 VALIDATION_ERROR`).

```json
{
  "data": {
    "product": { "id": "sony-wh1000xm5", "name": "Sony WH-1000XM5", "brand": "Sony", "...": "..." },
    "listingSummary": {
      "total": 3,
      "resolved": 3,
      "unresolved": 0,
      "requiresReview": 0,
      "byStatus": { "exact": 3, "strong": 0, "possible": 0, "unmatched": 0, "conflict": 0 }
    },
    "notices": [
      "This is a sample catalogue record: the product identity is demo data, not a verified marketplace catalogue entry."
    ]
  }
}
```

## 9. `GET /api/v1/products/:productId/listings`

Resolved marketplace listings for one product, oldest listing id order stable by marketplace then
source (at most 50). Each listing carries the source title, URL, provenance and the full match
verdict. Storage-only fields (`contentHash`) are never returned.

```json
{
  "data": {
    "productId": "sony-wh1000xm5",
    "listings": [
      {
        "id": "6f1d…",
        "canonicalProductId": "sony-wh1000xm5",
        "sourceId": "demo-catalog",
        "marketplaceId": "amazon",
        "externalId": "demo:sony-wh1000xm5:amazon",
        "title": "Sony WH-1000XM5 Wireless Headphones",
        "url": "https://demo.saveshop.example/product/sony-wh1000xm5",
        "provenance": "demo",
        "isSample": true,
        "match": {
          "status": "exact",
          "method": "canonical_id",
          "confidence": 100,
          "requiresReview": false,
          "reasons": ["canonical id supplied by a trusted catalogue source"]
        },
        "lastObservedAt": "2026-11-08T07:00:00.000Z",
        "createdAt": "2026-11-08T07:00:00.000Z",
        "updatedAt": "2026-11-08T07:00:00.000Z"
      }
    ],
    "listingSummary": {
      "total": 1,
      "resolved": 1,
      "unresolved": 0,
      "requiresReview": 0,
      "byStatus": { "exact": 1, "strong": 0, "possible": 0, "unmatched": 0, "conflict": 0 }
    },
    "notices": [
      "A listing is one marketplace's item. Only exact and strong matches are resolved; possible and conflicting matches stay unresolved until reviewed."
    ]
  }
}
```

`match.confidence` is a deterministic strength score (0–100) from the rules in
[DATABASE_DESIGN.md](DATABASE_DESIGN.md#9-identity-matching-rules). It is **not** a probability and
no client may present it as one.

## 10. Catalogue ingestion — deliberately not an HTTP endpoint

The project has **no admin authentication**, so there is no public `POST /catalogue/ingest`:
an unauthenticated write endpoint that creates product identity would be a security hole. Ingestion
runs locally through the CLI instead:

```bash
npm run catalogue -- seed-demo [--dry-run]
npm run catalogue -- ingest --file=catalogue.json [--dry-run]
```

A future authorised provider gets an adapter behind the same service, and the endpoint question is
revisited only once admin authorisation exists.

The CLI prints the ingestion report as JSON and exits `1` when the run is `failed` — which happens
when **every** source could not be read. A partial failure (one source unreadable, another fine)
stays `completed` with a warning, because the records that were read really were ingested.

## 11. Other endpoints

**`GET /`** — discovery document (`{ data: { name, version, apiPrefix } }`). Useful for humans.

**Unmatched routes** — `404` with `{ "error": { "code": "NOT_FOUND", "message": "Route not found: GET /x", "requestId": "..." } }`.

**CORS** — requests from an origin not on `CORS_ALLOWED_ORIGINS` receive `403 FORBIDDEN` and no
`access-control-allow-origin` header. Requests without an `Origin` header (curl, server-to-server,
native apps) are allowed.

## 12. Planned endpoints (NOT implemented)

Listed only so the contract can be designed coherently later. Definitions, field names and status
codes are not final and must not be relied upon.

- `GET /products/:id/variants` — expanded variant listing (variants are currently rows with `variantOf`)
- `GET|POST|DELETE /wishlist`
- `POST /auth/session` — verify a Firebase token (design undecided)
- `GET /me/subscription`

## 13. Client behaviour

Both clients implement the same rules in `src/services/apiClient.ts`:

- 8 s timeout (web: `AbortSignal.timeout`; mobile: `AbortController`, since Hermes support for
  `AbortSignal.timeout` is not guaranteed);
- non-2xx + `error` envelope → typed `ApiError` with `code`, `message`, `details`, `requestId`;
- transport failure → `ApiError` with `code: "NETWORK_ERROR"`;
- a 2xx body without `data` → `ApiError` with `code: "INVALID_RESPONSE"` (contract drift is never
  silently ignored);
- comparison, coverage, history, catalogue search, product identity and listing payloads are parsed
  against their Zod schemas before rendering, so a drifted response surfaces as an error instead of a
  wrong price or a false product identity;
- catalogue search falls back to the local sample catalogue only when the API is unreachable, and
  says so on screen: searching a different catalogue silently would be misleading.

## 14. Admin authentication

Admin routes live under `/api/v1/admin`. The only public route is login; everything else requires a
bearer token that the API verifies **and** resolves to a live, active `catalogue_admin` account.

| Method | Path                | Body                  | Notes                                                      |
| ------ | ------------------- | --------------------- | ---------------------------------------------------------- |
| `POST` | `/admin/auth/login` | `{ email, password }` | 200 with a session, 401 `UNAUTHORIZED`, 429 `RATE_LIMITED` |
| `GET`  | `/admin/auth/me`    | —                     | current credential-free profile                            |

`POST /admin/auth/login` → `{ "data": { "token", "tokenType": "Bearer", "expiresAt", "admin" } }`.
`admin` is `{ id, email, displayName, role, status, createdAt, lastLoginAt }`; no hash or session
secret is ever returned. Responses carry `Cache-Control: no-store`.

Failures are deliberately indistinguishable: unknown email, wrong password and disabled account all
return `401` with `Invalid email or password`. Repeated failures return `429`. A stale token, a
token for a disabled account, a token whose `tokenVersion` was bumped, and a non-admin role all
return `401`.

## 15. `GET /api/v1/admin/catalogue/review-queue`

Auth: `catalogue_admin`. Query (Zod-validated, all optional except defaults):

| Parameter            | Default   | Bounds                                                         |
| -------------------- | --------- | -------------------------------------------------------------- |
| `scope`              | `pending` | `pending` \| `decided` \| `all`                                |
| `verdict`            | —         | `exact` \| `strong` \| `possible` \| `unmatched` \| `conflict` |
| `sourceId`           | —         | max 80 chars                                                   |
| `marketplaceId`      | —         | max 80 chars                                                   |
| `canonicalProductId` | —         | catalogue slug                                                 |
| `q`                  | —         | max 120 chars; title, brand, model, external id, id            |
| `sort`               | `oldest`  | `oldest` \| `newest` \| `confidence_asc` \| `confidence_desc`  |
| `page`               | `1`       | 1–500                                                          |
| `pageSize`           | `20`      | 1–50                                                           |

`pending` means the listing has no settled human decision and is unresolved or flagged. Response:

```json
{
  "data": {
    "items": [
      {
        "listing": { "...": "full MarketplaceListing contract" },
        "candidates": [
          {
            "productId": "sony-wh1000xm5",
            "name": "…",
            "brand": "Sony",
            "category": "audio",
            "status": "possible",
            "method": "title_similarity",
            "confidence": 72,
            "reasons": ["title similarity 0.86 with the same brand"],
            "isSample": true,
            "mergedInto": null
          }
        ],
        "conflicts": ["different GTIN for the same candidate"],
        "reviewRequiredReason": "The automatic matcher found more than one plausible product; a human must choose.",
        "pending": true
      }
    ],
    "page": 1,
    "pageSize": 20,
    "totalItems": 1,
    "counts": {
      "pending": 1,
      "decided": 0,
      "requiresReview": 1,
      "byVerdict": { "exact": 0, "strong": 0, "possible": 1, "unmatched": 0, "conflict": 0 }
    },
    "notices": [
      "Matching strength is a deterministic 0-100 score from documented identity rules, not a probability."
    ]
  },
  "meta": { "requestId": "…", "page": 1, "pageSize": 20, "totalItems": 1 }
}
```

At most five candidates per item. `confidence` is a strength score, never a probability.

## 16. `GET /api/v1/admin/catalogue/listings/:listingId`

Returns `{ item, decisions, audit, notices }`: the queue item, the append-only decision history
(newest data in `decisions`) and up to 20 audit events for the listing. Unknown id → `404`.

## 17. Review decisions

All four decision routes require `expectedRevision` (the listing's current `revision`), a `reason`
(3–240 characters) and optional `notes` (≤1000). A stale revision → `409 CONFLICT` with the current
revision in `details`; reload and retry.

| Method | Path                                     | Body                                                                         |
| ------ | ---------------------------------------- | ---------------------------------------------------------------------------- |
| `POST` | `/admin/catalogue/listings/:id/accept`   | `{ canonicalProductId, confirmConflicts, expectedRevision, reason, notes? }` |
| `POST` | `/admin/catalogue/listings/:id/reassign` | same shape as accept                                                         |
| `POST` | `/admin/catalogue/listings/:id/reject`   | `{ canonicalProductId?, expectedRevision, reason, notes? }`                  |
| `POST` | `/admin/catalogue/listings/:id/defer`    | `{ expectedRevision, reason, notes? }`                                       |
| `POST` | `/admin/catalogue/listings/:id/reopen`   | `{ expectedRevision, reason, notes? }`                                       |

- Accept/reassign validate that the product exists, is not archived and is not itself merged.
  Contradicting GTIN/MPN/model/generation/capacity/colour/variant facts return `409` unless
  `confirmConflicts: true`; the acknowledgement is recorded.
- Reject keeps the listing, leaves it unresolved and stores the refused candidate in
  `review.rejectedProductIds`, so the matcher will not propose it again until a reopen.
- Defer keeps the listing in the queue with the note.
- Reopen re-runs the automatic matcher, clears previous refusals and records a `reopened` decision.

Response:

```json
{
  "data": {
    "listing": { "...": "MarketplaceListing with review, revision + 1" },
    "decision": {
      "id": "...",
      "decision": "accepted",
      "previousStatus": "possible",
      "previousCanonicalProductId": null,
      "newCanonicalProductId": "sony-wh1000xm5",
      "adminId": "...",
      "adminEmail": "...",
      "reason": "...",
      "notes": null,
      "identityFacts": { "brand": "Sony", "...": "..." },
      "matcherVersion": "catalogue-matcher/1",
      "requestId": "...",
      "listingRevision": 1,
      "decidedAt": "2026-11-09T10:00:00.000Z"
    },
    "acknowledgedConflicts": [],
    "notices": ["The match was approved and now outranks the automatic matcher."]
  }
}
```

Unknown listing/product → `404`; stale revision or blocked conflicts → `409`.

## 18. Canonical product merge

`GET /api/v1/admin/catalogue/merge-preview?sourceProductId=…&targetProductId=…`

```json
{
  "data": {
    "sourceProductId": "duplicate-product",
    "targetProductId": "surviving-product",
    "compatible": true,
    "blockers": [],
    "conflicts": [],
    "summary": { "listings": 1, "snapshots": 2, "rollups": 1, "variants": 0 },
    "notices": [
      "The source product is archived, not deleted, and remains resolvable as a redirect."
    ]
  }
}
```

`POST /api/v1/admin/catalogue/products/merge` with
`{ sourceProductId, targetProductId, reason, notes?, confirmConflicts? }`.

Blockers (`409`, cannot be overridden): self-merge, unknown product, source already merged, source
archived without a merge target, archived target, target is a variant of the source, different brand
or category. Conflicts (`409` unless `confirmConflicts: true`): differing GTIN/MPN/model/colour/
capacity, generation mismatch, variant-attribute differences, sample/verified or provenance
mismatch.

Response: `{ mergeRunId, status, sourceProductId, targetProductId, transactionUsed, listingsMoved,
snapshotsMoved, snapshotsDeduped, rollupsMoved, rollupsCombined, variantsRepointed,
acknowledgedConflicts, notices }`. If a step fails, the API returns `500`, the run remains open, and
`npm run admin -- repair-merges` completes or fails it safely. MongoDB transactions are used only
when the server supports them; `transactionUsed` reports what actually happened.

## 19. `GET /api/v1/admin/catalogue/audit`

Auth: `catalogue_admin`. Query: `action` (enum), `actorId`, `targetId`, `page` (1-500, default 1),
`pageSize` (1-100, default 20). Returns `{ events, page, pageSize, totalItems }`, newest first.
Each event is `{ id, action, actorId, actorEmail, targetType, targetId, previousState, newState,
reason, requestId, occurredAt }`; states contain only non-secret fields.

## 20. Admin caching and errors

Every admin response sets `Cache-Control: no-store` and `Vary: Authorization`. `401` always means
the session is not (or no longer) valid; the web client clears its stored token and shows the gate.
`403` is unused in this sprint because there is one admin role, but the error code remains defined.
