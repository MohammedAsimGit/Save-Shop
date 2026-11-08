# Database Design

Status: **partially implemented.** Sprint 0 configured the connection only. Sprint 3 added
`price_snapshots` (durable price observations) and `comparison_cache` (short-lived response cache).
Sprint 4 added `price_daily_rollups` (daily aggregates for compacted days) and `retention_runs` (an
audit trail for every compaction run). Sprint 5 adds the catalogue: `canonical_products` (product
identity), `marketplace_listings` (what a marketplace says its item is) and
`catalogue_ingestion_runs` (an audit trail for ingestion). Accounts, wishlists and billing are still
designs, not schemas.

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

## 6. Implemented: `canonical_products`

One document = one product the platform says it knows. **This collection is the authority for
product identity**: prices, history and comparisons reference `id` here, and a marketplace listing may
only point at it through a recorded match verdict.

| Field                | Type                          | Notes                                                                  |
| -------------------- | ----------------------------- | ---------------------------------------------------------------------- |
| `id`                 | string (slug, unique)         | Human-readable and stable; the id price/history rows reference          |
| `name`               | string                        | Canonical display name                                                 |
| `brand`              | string                        | Brand as recorded, normalized into `search.brandKey`                   |
| `category`           | string (slug)                 | e.g. `audio`, `phones`; drives category filtering                       |
| `model`              | string?                       | Manufacturer model number, uppercase                                  |
| `mpn`                | string?                       | Manufacturer part number, normalized (uppercase alphanumeric)          |
| `gtin`               | string? (`^\d{14}$`)          | Normalized GTIN-8/12/13/14; GS1 check digit validated before storage    |
| `description`        | string?                       | Only when supplied; never generated                                   |
| `specifications`     | object                        | Free-form key/value facts that were actually supplied                  |
| `color`              | string?                       | Variant attribute when known                                          |
| `storageCapacity`    | string?                       | Normalized (`128gb`, `1tb`); part of variant identity                  |
| `variantOf`          | string \| null                | Base product id for a variant record, so variants stay distinct        |
| `variantAttributes`  | object                        | e.g. `{ color: 'blue', storage: '128gb' }`                             |
| `imageUrls`          | string[]                      | Only real URLs; elements must be http(s)                              |
| `status`             | enum                          | `active` \| `draft` \| `archived` (archived is not searchable)          |
| `provenance`         | enum                          | `demo` \| `manual` \| `authorized_source`                              |
| `isSample`           | boolean                       | True for sample-catalogue records; can never be reported as verified    |
| `search.text`        | string                        | Denormalized normalized name+brand+model                              |
| `search.tokens`      | string[]                      | Denormalized name tokens, indexed for candidate lookup                 |
| `search.brandKey`    | string                        | `normalizeKey(brand)`                                                 |
| `search.modelKey`    | string \| null                | `normalizeKey(model)`                                                 |
| `createdAt`/`updatedAt` | Date                       | Timestamps                                                            |

### Indexes

| Index                                                 | Serves                                                     |
| ----------------------------------------------------- | ---------------------------------------------------------- |
| `{ id: 1 }` **unique**                                | Product lookup and duplicate prevention                     |
| `{ gtin: 1 }` **unique, partial** (`gtin` is a string) | A GTIN identifies exactly one product; absent GTINs never collide |
| `{ 'search.brandKey': 1, 'search.modelKey': 1 }`      | Brand + model matching                                      |
| `{ 'search.tokens': 1 }`                              | Candidate selection for search and weak matching            |
| `{ category: 1, status: 1 }`                          | Category-filtered search                                    |
| `{ variantOf: 1 }`                                    | Listing a base product's variants                           |
| `{ mpn: 1 }`                                          | MPN lookup (not unique: manufacturers reuse part numbers)   |

### Writing rules

- Ingestion is **insert-only** for products (`$setOnInsert`): a rerun never overwrites a curated
  record. Correcting a product is an explicit operation, not a side effect of ingestion.
- Identifiers are optional and stored only when supplied. An invalid GTIN (bad check digit) is
  rejected, never repaired.
- `gtin` is normalized to 14 digits (leading zero padding) so EAN-13 and GTIN-14 forms of the same
  code compare equal.

## 7. Implemented: `marketplace_listings`

One document = one item as a source reported it, on one marketplace. A listing **never becomes a
canonical product on its own**; it carries a match verdict and may resolve only to an existing id.

| Field                                                 | Type                | Notes                                                              |
| ----------------------------------------------------- | ------------------- | ------------------------------------------------------------------ |
| `id`                                                  | string (sha256/40)  | `sha256(sourceId\|marketplaceId\|externalId)`, deterministic        |
| `canonicalProductId`                                  | string \| null      | Set only for `exact`/`strong` matches                              |
| `sourceId`                                            | string              | Registered catalogue source                                        |
| `marketplaceId`                                       | string              | Marketplace the item is on                                         |
| `externalId`                                          | string              | The marketplace's own identifier, as supplied                      |
| `title`                                               | string              | Source title, preserved verbatim for audit/review                  |
| `url`                                                 | string (http(s))    | As supplied; never fabricated                                     |
| `brand`, `model`, `mpn`, `gtin`                       | strings?            | Normalized copies of what the source supplied                      |
| `specifications`                                      | object              | As supplied                                                       |
| `imageUrl`                                            | string?             | As supplied                                                       |
| `color`, `storageCapacity`                            | string?             | Variant hints used by the matcher                                 |
| `provenance` / `isSample`                             | enum / boolean      | Copied from the source                                            |
| `match.status`                                        | enum                | `exact` \| `strong` \| `possible` \| `unmatched` \| `conflict`     |
| `match.method`                                        | enum                | `canonical_id` \| `gtin` \| `mpn` \| `brand_model` \| `brand_model_specs` \| `title_similarity` \| `none` |
| `match.confidence`                                    | number (0–100)      | Deterministic strength score, **not** a probability                |
| `match.requiresReview`                                | boolean             | True for `possible` and `conflict`                                |
| `match.reasons`                                       | string[]            | Why the verdict was reached                                       |
| `lastObservedAt`                                      | Date                | When the source reported the item                                |
| `contentHash`                                         | string              | Hash of mutable content; makes "unchanged" measurable             |
| `createdAt` / `updatedAt`                             | Date                | Timestamps                                                        |

### Indexes

| Index                                                        | Serves                                          |
| ------------------------------------------------------------ | ----------------------------------------------- |
| `{ sourceId: 1, marketplaceId: 1, externalId: 1 }` **unique** | Dedupe; one row per item per source per marketplace |
| `{ canonicalProductId: 1 }`                                   | A product's listings                            |
| `{ 'match.status': 1 }`                                       | Review queue (possible/conflict)                |
| `{ gtin: 1 }`                                                 | Identifier-based listing lookup                 |

### Writing rules

- Normal writes upsert by `id`. Unchanged content only advances `lastObservedAt`; changed content
  updates the record and `updatedAt`. Re-ingesting the same source is idempotent.
- An unresolved listing (`possible`, `conflict`, or `unmatched`) keeps `canonicalProductId: null`, so
  it cannot appear in a product's comparison.

## 8. Implemented: `catalogue_ingestion_runs`

One document per ingestion run: `startedAt`, `finishedAt`, `dryRun`, `status`, `sources[]`,
`recordsRead`, `accepted`, `rejected`, `created`, `updated`, `unchanged`,
`canonicalProductsInserted`, `matches` (per verdict), `rejectedRecords[]` (source, index, externalId,
reason) and `warnings[]`. Index: `{ startedAt: -1 }`.

## 9. Identity matching rules

Matching is deterministic and lives in one service (`apps/api/src/services/catalogue/matching.service.ts`).
Priority order:

| Tier | Rule                                             | Verdict   | Confidence |
| ---- | ------------------------------------------------ | --------- | ---------- |
| 0    | Canonical id supplied by a trusted catalogue source | `exact`   | 100        |
| 1    | GTIN/EAN/UPC equal (both normalized)             | `exact`   | 100        |
| 2    | Manufacturer part number equal                   | `strong`  | 95         |
| 3    | Brand + model equal                              | `strong`  | 90         |
| 4    | Brand + model + variant attributes equal         | `strong`  | 92         |
| 5    | Same brand + title similarity ≥ 0.5              | `possible`| 65–75      |
| 5    | Title similarity ≥ 0.75 without a brand match    | `possible`| 55–64      |

Hard rules (verdict `conflict`, never attached automatically): different GTINs, different MPNs,
different explicit models, different product generations inferred from titles (`XM4` vs `XM5`),
different storage capacities or colours for the same model, an accessory (`case`, `cover`, `cable`,
`screen protector`, …), and a canonical id that contradicts the listing brand.

Ambiguity rules: two candidate products that match equally strongly produce `possible` with
`requiresReview: true` and no canonical id; two products claiming the same identifier produce
`conflict`. Confidence is a **strength score from this table**, not a calibrated probability.

## 10. Planned entities (not implemented)

| Entity               | Key fields                                                                                                      | Notes                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `User`               | `email` (unique), `displayName`, `authProviderId`, `createdAt`                                                  | `authProviderId` is the Firebase UID; no password is ever stored here    |
| `Marketplace`        | `slug` (unique), `displayName`, `isActive`                                                                      | seeded manually once access is approved; slugs must be real, not guessed |
| `Wishlist`           | `userId`, `productId`, `variantId?`, `targetPrice?`                                                             | unique on `userId + productId + variantId`                               |
| `Subscription`       | `userId`, `tier`, `status`, `currentPeriodEnd`                                                                  | one active per user                                                      |
| `AffiliateClick`     | `userId?`, `listingId`, `marketplaceId`, `occurredAt`, `campaignId?`                                            | for commission attribution                                               |
| `AdvertisementEvent` | `slot`, `campaignId`, `eventType` (`impression`/`click`), `occurredAt`                                          | no personal data beyond a pseudonymous id                                |

Canonical products and marketplace listings are no longer planned: they are implemented in §6 and
§7. Product variants are represented by `variantOf` + `variantAttributes` on the canonical record
rather than a separate collection.

Planned indexes: `User.email` unique, `Marketplace.slug` unique, `Wishlist` unique
`(userId, productId, variantId)`, `AffiliateClick` `(listingId, occurredAt)` and
`(userId, occurredAt)`.

## 11. Data ownership and access

- Every client request will be scoped to the authenticated user; user-owned documents
  (`Wishlist`, `Subscription`) filtered by `userId` from the verified token, never from a
  client-supplied id.
- Catalogue, listings and snapshots are platform-owned read-mostly data, written only by the server.
  In Sprint 3 the only writer is the comparison service, and the only caller of the history endpoint
  is a read.
- `AffiliateClick` and `AdvertisementEvent` will be written by the server; users can never edit them.

## 12. Data retention

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

## 13. Duplicate-product risk

The same physical product will appear under different titles, bundles and identifiers across
marketplaces. Risks:

1. **False merge** — two different products treated as one, showing a wrong "cheapest" price.
2. **Duplicate split** — the same product stored twice, splitting price history and hurting UX.

Mitigation (Sprint 5): the identity engine matches on exact GTIN, then MPN, then brand + model, then
brand + model + variant, and uses normalized title similarity **only** as a `possible` match that
stays unresolved. Conflicting identifiers, different generations and accessories are rejected
(`conflict`). An ambiguous match never redirects a shopper: it has no canonical id, so it cannot be
compared. What is still missing is a human review workflow for the `possible`/`conflict` queue.

## 14. Money handling

`{ amountMinor: integer, currency: ISO-4217 }` everywhere. No floats, no strings-with-symbols.
Currency conversion is out of scope; comparisons only happen within one currency, and history
excludes prices in another currency instead of converting them.

## 15. Explicit non-goals for Sprint 5

- No user, account or wishlist collections.
- No marketplace catalogue feed: the only sources are the sample catalogue and a local operator
  file. Amazon India and Flipkart remain permission-gated.
- No review UI or admin authorisation: unresolved listings are recorded and reported, not resolved
  by a person yet.
- No scheduler, queue or distributed job runner: compaction and ingestion are manual CLI runs.
- No rollup below daily granularity, and no rollup for a day with no observations.
- No marketplace identifiers invented; no real provider writes to these collections.
