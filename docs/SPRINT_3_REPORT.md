# Sprint 3 — Snapshot Persistence, Price History & Caching

**Status: complete.** Price observations are persisted in MongoDB, a validated history endpoint
serves them, both clients chart them, and comparison responses are cached with source-aware TTLs.

**Still no marketplace integration.** The only enabled source is the deterministic sample adapter,
so every stored observation and every chart point is invented demo data, marked `isSample: true`,
summarised separately from verified data, and labelled `DEMO` in both clients. Amazon India and
Flipkart remain disabled descriptors awaiting written permission.

- Sprint 2 checkpoint: `b974213`.
- Sprint 3 checkpoint: the commit that adds this report (`git log -1 --stat`).

## 1. Files

### Created

| File                                                     | Purpose                                                                       |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `packages/shared/src/contracts/history.ts`               | History query/observation/summary/response Zod contracts                      |
| `packages/shared/src/contracts/history.test.ts`          | 8 contract tests (defaults, coercion, provenance separation, float rejection) |
| `apps/api/src/models/priceSnapshot.ts`                   | Mongoose `price_snapshots` model + indexes                                    |
| `apps/api/src/models/comparisonCache.ts`                 | Mongoose `comparison_cache` model + unique/TTL indexes                        |
| `apps/api/src/models/index.ts`                           | `ensureModelIndexes()` run at boot                                            |
| `apps/api/src/services/snapshots/snapshotStore.ts`       | Store interface, observation key, validation, history selection               |
| `apps/api/src/services/snapshots/memorySnapshotStore.ts` | In-memory store for tests and DB-less development                             |
| `apps/api/src/services/snapshots/mongoSnapshotStore.ts`  | MongoDB store (idempotent `bulkWrite` upserts)                                |
| `apps/api/src/services/snapshots/index.ts`               | Store selection + process-wide instance                                       |
| `apps/api/src/services/cache/comparisonCache.ts`         | Cache interface + cache key                                                   |
| `apps/api/src/services/cache/memoryComparisonCache.ts`   | In-memory cache                                                               |
| `apps/api/src/services/cache/mongoComparisonCache.ts`    | MongoDB cache (read-time expiry)                                              |
| `apps/api/src/services/cache/index.ts`                   | Cache selection + process-wide instance                                       |
| `apps/api/src/services/history.service.ts`               | History assembly, provenance summaries, notices                               |
| `apps/api/src/controllers/history.controller.ts`         | `GET /products/:productId/history` handler                                    |
| `apps/api/tests/snapshotStore.test.ts`                   | 13 tests: preparation, validation, idempotency, filters, limits               |
| `apps/api/tests/comparisonCache.test.ts`                 | 12 tests: hits/misses, TTL, staleness guard, invalidation, failures           |
| `apps/api/tests/history.test.ts`                         | 10 HTTP tests: ordering, periods, filters, empty history, 400/404             |
| `apps/api/tests/mongoSnapshotStore.test.ts`              | 10 tests against a real MongoDB binary (indexes, upserts, queries)            |
| `apps/api/tests/helpers/snapshots.ts`                    | Test fixtures: sources, snapshots, adapter doubles                            |
| `apps/web/src/services/history.service.ts`               | Contract-validated history fetch                                              |
| `apps/web/src/hooks/useProductHistory.ts`                | Loading/ready/error + period refetch                                          |
| `apps/web/src/components/ui/PriceHistoryChart.tsx`       | Dependency-free SVG line chart                                                |
| `apps/web/src/components/ui/PriceHistorySection.tsx`     | Period filters, lowest/latest, provenance handling, notices                   |
| `apps/mobile/src/services/history.service.ts`            | Same client for React Native                                                  |
| `apps/mobile/src/hooks/useProductHistory.ts`             | Same state machine, ignores superseded responses                              |
| `apps/mobile/src/components/PriceHistorySection.tsx`     | Mobile history card + `react-native-svg` chart                                |
| `apps/mobile/src/services/history.service.test.ts`       | 3 contract tests                                                              |
| `docs/SPRINT_3_REPORT.md`                                | This report                                                                   |

### Modified

| File                                          | Change                                                                 |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| `packages/shared/src/contracts/comparison.ts` | Exported `isoDateTimeSchema` / `httpUrlSchema` for reuse               |
| `packages/shared/src/index.ts`                | Re-exports history contracts                                           |
| `apps/api/src/config/env.ts`                  | `COMPARISON_CACHE_TTL_SECONDS`, `PERSIST_DEMO_SNAPSHOTS`               |
| `apps/api/src/middlewares/validate.ts`        | `validateQuery` / `validatedQuery` (Express 5 `req.query` is a getter) |
| `apps/api/src/routes/comparison.routes.ts`    | Mounts `:productId/history` with param + query validation              |
| `apps/api/src/services/comparison.service.ts` | Cache read/write, snapshot ingestion, invalidation                     |
| `apps/api/src/server.ts`                      | Ensures indexes after a successful connection                          |
| `apps/api/tests/env.test.ts`                  | 3 tests for the new configuration                                      |
| `apps/api/.env.example`                       | Documents the two new variables                                        |
| `apps/web/src/pages/ProductPage.tsx`          | Replaces the "history not available" placeholder                       |
| `apps/web/src/lib/format.ts`                  | `formatShortDate` for axis labels                                      |
| `apps/web/src/app/App.test.tsx`               | Fetch router + 4 history tests                                         |
| `apps/mobile/src/screens/ProductScreen.tsx`   | Replaces the placeholder card with the history section                 |
| `apps/mobile/src/lib/format.ts`               | `formatShortDate`                                                      |
| `apps/api/package.json` + lockfile            | Dev-only `mongodb-memory-server` for real-database tests               |
| `docs/API_CONTRACTS.md`                       | §6 history endpoint, caching rules in §4                               |
| `docs/DATABASE_DESIGN.md`                     | Implemented schemas, indexes, retention, demo policy                   |
| `docs/ENVIRONMENT_SETUP.md`                   | New variables and their defaults                                       |
| `README.md`                                   | Sprint 3 status, history endpoints, docs table, constraints            |

## 2. MongoDB schema and indexes

`price_snapshots` (Mongoose `PriceSnapshotModel`), one document per observation:

`observationKey` (unique sha256), `productId`, `marketplaceId`, `sourceId`, `productUrl`,
`price{amountMinor:int, currency}`, `availability`, `capturedAt`, `ttlSeconds`, `expiresAt`,
`attribution{label,url?}`, `sourceVerification`, `isSample`, `ingestedAt`.

| Index                                               | Purpose                             |
| --------------------------------------------------- | ----------------------------------- |
| `{ observationKey: 1 }` unique                      | Idempotent ingestion                |
| `{ productId: 1, capturedAt: 1 }`                   | History window, chronological       |
| `{ productId: 1, sourceId: 1, capturedAt: 1 }`      | Source-filtered history             |
| `{ productId: 1, marketplaceId: 1, capturedAt: 1 }` | Marketplace-filtered history        |
| `{ sourceId: 1, capturedAt: 1 }`                    | Cross-product source diagnostics    |
| `{ expiresAt: 1 }`                                  | Freshness lookups (not a TTL index) |

`comparison_cache`: `{ key }` unique plus `{ expiresAt: 1 }` with `expireAfterSeconds: 0`
(eviction only; reads enforce expiry themselves).

Indexes are created on boot via `ensureModelIndexes()`, so the unique key exists before the first
write. **No TTL index exists on `price_snapshots`** - an expiring index would silently delete
history; retention is documented as a future job (raw ~12 months, then daily min/max).

## 3. Snapshot store architecture

```
comparison service (adapters) ── raw snapshots (untrusted) ──► SnapshotStore.saveMany
                                                              ├── MongoDB (bulkWrite upsert, $setOnInsert)
                                                              └── in-memory (Map, same rules)
history service ── SnapshotHistoryQuery ──────────────────────► SnapshotStore.listHistory
```

- `prepareSnapshotRecords` validates every observation against `offerSnapshotSchema`, rejects an
  unknown **or disabled** source, and applies the sample-persistence policy. Both implementations
  share it, so MongoDB and memory cannot drift.
- `observationKey = sha256(sourceId|productId|marketplaceId|amountMinor|currency|availability|capturedAt)`.
  `ingestedAt` is excluded: replaying a provider response is a no-op, not a second point.
- The comparison engine still imports no Mongoose model; only the Mongo store does.
- Store selection is logged at boot: MongoDB when `MONGODB_URI` is set, memory otherwise.

## 4. History API

`GET /api/v1/products/:productId/history?period=7d|30d|90d&sourceId=&marketplaceId=&limit=`

- `period` defaults to `30d`, `limit` to `200` (max 500); both are Zod-validated, unknown values are
  `400 VALIDATION_ERROR` with field details, malformed product ids `400`, unknown products `404`.
- Observations are chronological, oldest first, and contain price, currency, availability,
  `capturedAt`, TTL, attribution, full source identity, `isSample` and recomputed `freshness`.
- `summary.verified` and `summary.sample` are computed **separately**; there is no merged "lowest
  ever" figure. `status` is `no_history | sample_only | verified | mixed`.
- Rows that fail validation, name an unregistered source, or use another currency are excluded and
  reported in `notices` (no conversion is performed).
- A product with nothing stored returns `200` with `status: "no_history"`, an empty list, and a
  notice. One stored observation returns exactly one observation - no interpolated trend.

## 5. Cache implementation and TTL behaviour

- Key: `comparison:v1:<productId>:<currency>:<enabledSourceIds sorted>`; enabling a source cannot
  serve a payload built without it, and bumping `v1` invalidates a shape change.
- Effective TTL = `min(COMPARISON_CACHE_TTL_SECONDS, smallest remaining source freshness)`, and an
  entry is only written when every offer is still fresh. Default cap 300 s; `0` disables caching.
- On a hit the payload is re-parsed against `productComparisonResponseSchema` **and** every offer is
  re-checked against `capturedAt + ttlSeconds`; anything aged out is discarded and recomputed, so a
  cached offer can never be presented as fresh after its own TTL.
- A run with any adapter failure is never cached; a cache read/write error is logged and degrades to
  a normal recomputation. `invalidate(productId?)` drops one product or the whole cache.
- Disabled adapters are never in `enabledAdapters`, so they cannot be queried or cached.
- Redis was not introduced: MongoDB was already required, and one extra collection avoids a second
  datastore, connection and secret. `comparison_cache` is the only TTL-indexed collection.

## 6. Web and mobile UI

**Web** ([PriceHistorySection.tsx](../apps/web/src/components/ui/PriceHistorySection.tsx)): period
buttons (7/30/90 days), lowest and latest observed price with time, observation count, source name,
hand-rolled SVG chart (no new dependency), axis labels tied to _observed_ extremes, demo badge,
explicit notices, empty state, error + retry. Demo points are excluded when verified points exist,
and the exclusion is stated.

**Mobile** ([PriceHistorySection.tsx](../apps/mobile/src/components/PriceHistorySection.tsx)): same
rules in a themed card using the existing `react-native-svg` dependency, with period chips sized for
touch, responsive width from `useWindowDimensions`, and the same demo/verified separation.

Both chart a single observation as a dot with the caption "one point is a fact, not a trend"; an
empty window renders no chart at all.

## 7. Tests, typecheck, lint, format, build

| Gate                                | Result                                              |
| ----------------------------------- | --------------------------------------------------- |
| `packages/shared` Vitest            | 23 passed (12 engine, 8 history contract, 3 health) |
| `apps/api` Vitest                   | 86 passed (incl. 10 against a real MongoDB binary)  |
| `apps/web` Vitest + Testing Library | 11 passed                                           |
| `apps/mobile` jest-expo             | 12 passed / 4 suites                                |
| `npm run typecheck`                 | clean                                               |
| `npm run lint`                      | clean                                               |
| `npm run format:check`              | clean                                               |
| `npm run build`                     | clean                                               |

Sprint 2 behaviour is covered unchanged: all nine ranking/API tests still pass. New API coverage:
snapshot validation and idempotency, duplicate handling, ordering, period and source filtering,
invalid query parameters, empty history, cache hit/miss, TTL expiry, stale-cache rejection,
invalidation, provider failure not cached, disabled adapter never queried, demo/verified separation,
persistence failure degradation.

## 8. Was MongoDB genuinely tested?

**Yes, in two ways.**

1. Automated: `apps/api/tests/mongoSnapshotStore.test.ts` starts a real `mongod` via
   `mongodb-memory-server` (dev dependency), then asserts the actual indexes (including that no TTL
   index exists on history), `bulkWrite` upsert idempotency, provenance fields, date ordering,
   product/window/source/marketplace filtering and rejection of unauthorised sources.
2. Manually against a running server: the built API was started with
   `MONGODB_URI=mongodb://127.0.0.1:27099/saveshop`, indexes were logged as ensured, a comparison run
   wrote three demo observations plus one cache entry, `GET .../history` returned them, the API was
   **restarted**, and history still returned the same three observations from MongoDB. Collection
   indexes were inspected directly: `observationKey_1 (unique)`, the three compound history indexes,
   `expiresAt_1`, and `comparison_cache` with `key_1 (unique)` and `expiresAt_1 (ttl 0)`.

No external MongoDB or credential was required. The first `npm test` run downloads the MongoDB
binary for `mongodb-memory-server`; a machine without network access to that download cannot run
that file.

## 9. Remaining limitations

- **History is demo history.** Only the sample adapter produces observations, so charts show invented
  prices (labelled `DEMO`), not marketplace trends. Sample persistence is off by default in
  production.
- **Product identity is still catalogue-owned.** Snapshots reference demo catalogue slugs; there is
  no catalogue/listing collection yet.
- **No retention/compaction job.** `expiresAt` is indexed but nothing prunes or downsamples; the
  12-month policy is documented, not implemented.
- **Cache invalidation is manual.** There is no admin endpoint; `invalidate()` is exported for future
  callers and used by tests.
- **No per-source concurrency control.** One process is assumed; multi-instance deployments would
  multiply adapter calls (the cache would help but not dedupe in-flight requests).
- **Mobile was verified by tests and typecheck, not in a simulator.** No Expo/emulator run here.
- **Demo ingestion is time-based.** Because the demo adapter derives `capturedAt` from the clock, each
  cache miss adds new demo points; that is dev-only behaviour and never counted as verified data.
- Price history is INR-only; prices in another currency are excluded, not converted.

## 10. Git

- Branch `main`, local commits only, nothing pushed.
- Sprint 3 is one checkpoint commit containing the files above; `git log -1 --stat` shows it.
- Working tree is clean afterwards; `apps/api/.env` remains untracked.

## 11. Recommended next sprint

1. **Retention and compaction job** (daily min/max rollups, 12-month raw window) so history storage
   stays bounded before real ingestion begins.
2. **Catalogue ingestion** so snapshots reference real products/listings rather than demo slugs -
   still gated on the same marketplace permissions.
3. **First authorised adapter** behind the existing interface (one adapter, one registry flag,
   recorded-fixture tests, no live calls in CI) plus per-provider rate limiting.
4. **Price-drop alerts** - deliberately out of scope here: it needs accounts, per-source alert
   permission (`permitsPriceAlerts` is already modelled and false everywhere) and a delivery channel.
