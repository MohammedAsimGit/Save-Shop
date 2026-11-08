# Database Design

Status: **partially implemented.** Sprint 0 configured the connection only. Sprint 3 added
`price_snapshots` (durable price observations) and `comparison_cache` (short-lived response cache).
Sprint 4 adds `price_daily_rollups` (daily aggregates for compacted days) and `retention_runs` (an
audit trail for every compaction run). Everything else on this page is still a design, not a schema.

## 1. Core distinction: product vs variant vs listing

| Concept            | Meaning                                                                                                                      | Owned by                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **Product**        | The abstract thing a shopper searches for ("Sony WH-1000XM5"). Independent of any shop.                                      | Platform                          |
| **ProductVariant** | A concrete purchasable variation of a product (colour, size, capacity). Carries the identifiers that make matching possible. | Platform                          |
| **ProductListing** | A product/variant _as offered on one marketplace_, identified by that marketplace's own id and URL.                          | Marketplace (referenced by us)    |
| **PriceSnapshot**  | An immutable observation of a listing's price at a moment in time.                                                           | Platform (captured from a source) |

Prices live on **listings**, never on products. A product has no single price; it has one price per
listing per moment. Fabricating a "product price" would be misleading and is explicitly avoided.

## 2. Implemented: `price_snapshots`

One document = one observation a source reported. Append-only: a new capture is a new row, never an
update. Written only by the API when it reads a source; read by `GET /products/:id/history`.

| Field                | Type                        | Notes                                                            |
| -------------------- | --------------------------- | ---------------------------------------------------------------- |
| `observationKey`     | string (sha256 hex, unique) | Identity of the observation; makes re-ingestion idempotent       |
| `productId`          | string                      | Catalogue slug (identity is still catalogue-owned)               |
| `marketplaceId`      | string                      | Marketplace the price belongs to                                 |
| `sourceId`           | string                      | Registered source that reported it                               |
| `productUrl`         | string                      | Source's URL for the offer (demo sources use `.example`)         |
| `price.amountMinor`  | number (integer, ≥ 1)       | No floats, no rounding at write time                             |
| `price.currency`     | string (`^[A-Z]{3}$`)       | ISO 4217; no conversion anywhere                                 |
| `availability`       | enum                        | `in_stock` \| `out_of_stock` \| `preorder` \| `unknown`          |
| `capturedAt`         | Date                        | When the source observed the price (not when we stored it)       |
| `ttlSeconds`         | number (30–604800)          | Source-specific freshness limit                                  |
| `expiresAt`          | Date                        | Derived: `capturedAt + ttlSeconds`; indexed, **not** a TTL index |
| `attribution.label`  | string                      | Copied at ingest so provenance survives a source edit            |
| `attribution.url`    | string?                     | Optional attribution link                                        |
| `sourceVerification` | enum                        | `verified` \| `sample`, copied from the source at ingest         |
| `isSample`           | boolean                     | True only for sample sources; never settable by a client         |
| `ingestedAt`         | Date                        | When this API stored the row                                     |

### Indexes

| Index                                               | Serves                                                |
| --------------------------------------------------- | ----------------------------------------------------- |
| `{ observationKey: 1 }` **unique**                  | Idempotent upsert; one row per distinct observation   |
| `{ productId: 1, capturedAt: 1 }`                   | Product history window (`from`/`to`, chronological)   |
| `{ productId: 1, sourceId: 1, capturedAt: 1 }`      | History filtered by source                            |
| `{ productId: 1, marketplaceId: 1, capturedAt: 1 }` | History filtered by marketplace                       |
| `{ sourceId: 1, capturedAt: 1 }`                    | Cross-product source diagnostics / retention day scan |
| `{ expiresAt: 1 }`                                  | Freshness lookups                                     |

`ensureModelIndexes()` runs at boot (after a successful connection), so the unique key exists before
the first write instead of relying on `autoIndex` timing. Creating an identical index is a no-op.

### Idempotency

`observationKey = sha256(sourceId|productId|marketplaceId|amountMinor|currency|availability|capturedAt)`.
`ingestedAt` is excluded on purpose: it describes us, not the price. Writes are
`bulkWrite` upserts with `$setOnInsert`, so replaying a provider response inserts nothing new and
never rewrites history.

### Retention

There is **no TTL index on `price_snapshots`** - an expiring index would silently delete history.
Retention is a documented, manually invoked job (`npm run retention`) that first writes a daily
rollup for the day, verifies it against the remaining rows, and only then deletes that day's raw
observations in bounded batches. See §4 and §5 below, and
[SPRINT_4_REPORT.md](SPRINT_4_REPORT.md) for the full policy. `comparison_cache` is the only
collection with a TTL index, because losing a cache entry is harmless.

### Sample-data policy

Sample (demo) observations may be persisted outside production (`PERSIST_DEMO_SNAPSHOTS`, default
on in development/test, **off in production**). They are always stored with
`sourceVerification: "sample"` and `isSample: true`, are summarised separately in the history
response, and are never counted as verified or plotted alongside verified points.

## 3. Implemented: `comparison_cache`

| Field       | Type   | Notes                                                     |
| ----------- | ------ | --------------------------------------------------------- |
| `key`       | string | `comparison:v1:<productId>:<currency>:<enabledSourceIds>` |
| `payload`   | Mixed  | The exact `ProductComparisonResponse` returned to clients |
| `createdAt` | Date   | When the entry was written                                |
| `expiresAt` | Date   | Hard cut-off; reads treat an expired row as a miss        |

Indexes: unique `{ key: 1 }` and `{ expiresAt: 1 }` with `expireAfterSeconds: 0` (eviction only -
correctness comes from checking `expiresAt` on read, because the TTL monitor is asynchronous).

## 4. Implemented: `price_daily_rollups`

One document = one **UTC calendar day** for one `(productId, sourceId, marketplaceId, currency,
sourceVerification)` group. Written only by the rollup service from rows that already exist in
`price_snapshots`; it never estimates, interpolates or fabricates a price.

| Field                       | Type                        | Notes                                                                     |
| --------------------------- | --------------------------- | ------------------------------------------------------------------------- |
| `rollupKey`                 | string (sha256 hex, unique) | `product\|source\|marketplace\|currency\|verification\|date`; idempotency |
| `productId`                 | string                      | Catalogue slug                                                            |
| `sourceId`                  | string                      | Source that reported the observations                                     |
| `marketplaceId`             | string                      | Marketplace the prices belong to                                          |
| `currency`                  | string (`^[A-Z]{3}$`)       | Rollups are never merged across currencies                                |
| `dateKey`                   | string (`YYYY-MM-DD`)       | UTC day; the queryable form of `date`                                     |
| `date`                      | Date                        | Start of that UTC day                                                     |
| `windowStart` / `windowEnd` | Date                        | Half-open `[start, end)` window the aggregate covers                      |
| `minPrice` / `maxPrice`     | `{ amountMinor, currency }` | Extremes among the stored observations                                    |
| `firstPrice` / `lastPrice`  | `{ amountMinor, currency }` | Earliest/latest observation by `capturedAt` (ties break on key)           |
| `observationCount`          | integer (≥ 1)               | Rows aggregated; never invented                                           |
| `availabilityCounts`        | object                      | `{ inStock, outOfStock, preorder, unknown }` counts                       |
| `sourceVerification`        | enum                        | `verified` \| `sample`, copied from the rows                              |
| `isSample`                  | boolean                     | True only for sample groups; sample and verified never share a rollup     |
| `generatedAt`               | Date                        | When the aggregate was written                                            |

### Indexes

| Index                                            | Serves                                                        |
| ------------------------------------------------ | ------------------------------------------------------------- |
| `{ rollupKey: 1 }` **unique**                    | Idempotent generation; one document per group per day         |
| `{ productId: 1, dateKey: 1 }`                   | History reads over archived days                              |
| `{ productId: 1, sourceId: 1, dateKey: 1 }`      | Archived history filtered by source                           |
| `{ productId: 1, marketplaceId: 1, dateKey: 1 }` | Archived history filtered by marketplace                      |
| `{ dateKey: 1 }`                                 | Rollup retention pruning (`countOlderThan`/`deleteOlderThan`) |

### Idempotency and safety

- Normal generation is **insert-only** (`$setOnInsert` upserts, or `onConflict`-style skip in the
  memory store). Re-running the job for a day inserts nothing and never rewrites a committed day.
- `replaceDay` is the only path that can recompute a day, and only when explicitly requested
  (`rollupDay(date, { refresh: true })`).
- Because writes never shrink a rollup, a compaction run that crashes halfway cannot damage the
  aggregate it already wrote: a later run simply deletes the remaining rows.

## 5. Implemented: `retention_runs`

One document per compaction run, dry-run or not. Deletions are destructive, so the question "what
was removed, from which window, and was it a dry run" must be answerable after the terminal that
ran it is gone.

| Field                                      | Type                   | Notes                                         |
| ------------------------------------------ | ---------------------- | --------------------------------------------- |
| `startedAt` / `finishedAt`                 | Date                   | Wall-clock bounds of the run                  |
| `status`                                   | enum                   | `completed` \| `aborted` (signal received)    |
| `dryRun`                                   | boolean                | True when nothing was deleted                 |
| `rawRetentionDays` / `rollupRetentionDays` | number                 | Effective policy for this run                 |
| `batchSize`                                | number                 | Documents per read/delete batch               |
| `rawCutoff` / `rollupCutoff`               | Date                   | Computed cut-offs, stored for audit           |
| `dateRange`                                | `{ from, to }` \| null | UTC days touched by the run                   |
| `stats`                                    | Mixed                  | The full report (counts, scans, deletions)    |
| `failedDays`                               | array                  | Days skipped by verification failure or error |

Index: `{ startedAt: -1 }` ("what did the last run do?").

## 6. Planned entities (not implemented)

| Entity               | Key fields                                                                                                      | Notes                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `User`               | `email` (unique), `displayName`, `authProviderId`, `createdAt`                                                  | `authProviderId` is the Firebase UID; no password is ever stored here    |
| `Product`            | `title`, `brand`, `category`, `imageUrls[]`, `identifiers{gtin?,mpn?}`                                          | canonical record                                                         |
| `ProductVariant`     | `productId`, `title`, `attributes{}`, `identifiers{gtin?,mpn?}`                                                 | unique per `productId + attribute hash`                                  |
| `Marketplace`        | `slug` (unique), `displayName`, `isActive`                                                                      | seeded manually once access is approved; slugs must be real, not guessed |
| `ProductListing`     | `productId`, `variantId?`, `marketplaceId`, `externalId`, `url`, `sellerName?`, `availability`, `lastCheckedAt` | unique on `marketplaceId + externalId`                                   |
| `Wishlist`           | `userId`, `productId`, `variantId?`, `targetPrice?`                                                             | unique on `userId + productId + variantId`                               |
| `Subscription`       | `userId`, `tier`, `status`, `currentPeriodEnd`                                                                  | one active per user                                                      |
| `AffiliateClick`     | `userId?`, `listingId`, `marketplaceId`, `occurredAt`, `campaignId?`                                            | for commission attribution                                               |
| `AdvertisementEvent` | `slot`, `campaignId`, `eventType` (`impression`/`click`), `occurredAt`                                          | no personal data beyond a pseudonymous id                                |

Planned indexes: `User.email` unique, `Marketplace.slug` unique, `ProductListing`
`(marketplaceId, externalId)` unique plus `(productId, marketplaceId)`, `Product` text index on
`title` plus `identifiers.gtin`, `Wishlist` unique `(userId, productId, variantId)`,
`AffiliateClick` `(listingId, occurredAt)` and `(userId, occurredAt)`.

## 7. Data ownership and access

- Every client request will be scoped to the authenticated user; user-owned documents
  (`Wishlist`, `Subscription`) filtered by `userId` from the verified token, never from a
  client-supplied id.
- Catalogue, listings and snapshots are platform-owned read-mostly data, written only by the server.
  In Sprint 3 the only writer is the comparison service, and the only caller of the history endpoint
  is a read.
- `AffiliateClick` and `AdvertisementEvent` will be written by the server; users can never edit them.

## 8. Data retention

Implemented policy (Sprint 4). The windows are **product decisions, not legal requirements**: no
regulator mandates a retention period for this data, so the defaults are configurable and documented
rather than presented as compliance rules.

| Data                           | Retention                                              | Configuration                                    |
| ------------------------------ | ------------------------------------------------------ | ------------------------------------------------ || `price_snapshots` (raw)      | 30 days at full resolution, then compacted to rollups  | `RETENTION_RAW_DAYS` (1–3650)                    |
| `price_daily_rollups`          | 730 days, then pruned                                  | `RETENTION_ROLLUP_DAYS` (≥ `RETENTION_RAW_DAYS`) |
| `comparison_cache`             | minutes (source freshness, capped at 300 s by default) | `COMPARISON_CACHE_TTL_SECONDS`                   |
| `AffiliateClick` (planned)     | 13–25 months depending on programme requirements       | not implemented                                  |
| `AdvertisementEvent` (planned) | 90 days raw, aggregates kept                           | not implemented                                  |
| Deleted accounts (planned)     | purge user-owned docs within 30 days                   | not implemented                                  |

The raw window is deliberately shorter than the longest history window (90 days): days between 30
and 90 days old are served as daily rollups, so compaction removes storage without hiding history.
Widening `RETENTION_RAW_DAYS` past 90 would make archived days unreachable through the API.

Unimplemented rows still need confirmation against affiliate programme terms and privacy law before
launch. Compaction itself is implemented; there is deliberately **no scheduler** (see §11).

### Deletion safety

A day's raw observations are deleted only after:

1. its daily rollup was generated from the persisted rows and written successfully;
2. the **persisted** rollups were re-read and verified to cover every group (count and min/max) of
   the remaining raw rows;
3. deletion runs in bounded batches (`RETENTION_BATCH_SIZE`).

A day that fails verification or errors is skipped and reported in `failedDays`; nothing is deleted
for it. `retention_runs` records every attempt, and the job defaults to a **dry run**.

## 9. Duplicate-product risk

The same physical product will appear under different titles, bundles and identifiers across
marketplaces. Risks:

1. **False merge** — two different products treated as one, showing a wrong "cheapest" price.
2. **Duplicate split** — the same product stored twice, splitting price history and hurting UX.

Mitigation plan: match on exact `gtin` first, then `mpn` + brand, then normalised title similarity as
a _review candidate_ only. An ambiguous match must never silently redirect a shopper to the wrong
item; a confidence threshold plus an admin review path is required before real ingestion.

## 10. Money handling

`{ amountMinor: integer, currency: ISO-4217 }` everywhere. No floats, no strings-with-symbols.
Currency conversion is out of scope; comparisons only happen within one currency, and history
excludes prices in another currency instead of converting them.

## 11. Explicit non-goals for Sprint 4

- No product/listing/user collections: identity is still the shared demo catalogue.
- No scheduler, queue or distributed job runner: compaction is a manual CLI run.
- No rollup below daily granularity, and no rollup for a day with no observations.
- No marketplace identifiers invented; no real provider writes to these collections.
