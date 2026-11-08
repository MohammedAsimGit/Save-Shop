# Sprint 4 — Historical Retention, Compaction & Daily Rollups

**Status: complete.** Days older than a configurable raw window are compacted into daily rollups; a
day's raw observations are deleted **only after** its rollup has been persisted and re-verified
against the raw data. Recent days stay at full resolution. The history endpoint serves archived days
as a separate, explicitly aggregated list.

**Still no marketplace integration.** The only enabled source is the deterministic sample adapter, so
every compacted observation in this sprint is invented demo data. Verified and sample series are
never merged, and a sample rollup can never stand in for a verified marketplace price.

- Sprint 3 checkpoint: `fb397d8`.
- Sprint 4 checkpoint: the commit that adds this report (`git log -1 --stat`).

## 1. Files

### Created

| File                                                 | Purpose                                                                    |
| ---------------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/shared/src/contracts/rollups.ts`           | Daily rollup + archived-history Zod contracts (`aggregated: true` literal) |
| `apps/api/src/models/priceDailyRollup.ts`            | `price_daily_rollups` Mongoose model and indexes                           |
| `apps/api/src/models/retentionRun.ts`                | `retention_runs` audit model                                               |
| `apps/api/src/services/rollups/rollupService.ts`     | Pure daily aggregation, persistence orchestration and verification         |
| `apps/api/src/services/rollups/rollupStore.ts`       | `RollupStore` abstraction, record type and `rollupKey()` identity          |
| `apps/api/src/services/rollups/mongoRollupStore.ts`  | MongoDB rollup store (insert-only upserts, explicit `replaceDay`)          |
| `apps/api/src/services/rollups/memoryRollupStore.ts` | In-memory rollup store for unit tests                                      |
| `apps/api/src/services/rollups/index.ts`             | Store selection (MongoDB when connected, memory otherwise)                 |
| `apps/api/src/services/retention/retentionJob.ts`    | Rollup → verify → delete safety pipeline, batching, abort, audit hook      |
| `apps/api/src/utils/abort.ts`                        | Shared `AbortSignal` helpers (`throwIfAborted`, `OperationAbortedError`)   |
| `apps/api/src/scripts/retention.ts`                  | Manual CLI: `npm run retention [--apply] [--dry-run] [--days…]`            |
| `apps/api/tests/rollups.test.ts`                     | 15 aggregation / idempotency / reprocessing / verification tests           |
| `apps/api/tests/retentionJob.test.ts`                | 10 job tests: dry-run, deletion safety, batching, abort, idempotency       |
| `apps/api/tests/historyRollups.test.ts`              | 7 history API compatibility tests for archived days                        |
| `apps/api/tests/mongoRollups.test.ts`                | 11 tests against a real MongoDB binary (model, store, job)                 |
| `docs/SPRINT_4_REPORT.md`                            | This report                                                                |

### Modified

| File                                                                                                                                                        | Change                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `packages/shared/src/contracts/history.ts`                                                                                                                  | `rollups` added to the history response (defaults to `[]`)                      |
| `packages/shared/src/index.ts`                                                                                                                              | Re-exports the rollup contracts                                                 |
| `apps/api/src/config/env.ts`                                                                                                                                | Validated retention policy (`RETENTION_*`) and its cross-field check            |
| `apps/api/src/models/index.ts`                                                                                                                              | Creates rollup and retention-run indexes at boot                                |
| `apps/api/src/services/history.service.ts`                                                                                                                  | Reads archived days, separates them from observations, extends notices          |
| `apps/api/src/services/snapshots/snapshotStore.ts`                                                                                                          | `listRange`, `listDaysBefore`, `countRange`, `deleteRange`; keyed paging        |
| `apps/api/src/services/snapshots/mongoSnapshotStore.ts`                                                                                                     | MongoDB implementations of the above                                            |
| `apps/api/src/services/snapshots/memorySnapshotStore.ts`                                                                                                    | In-memory equivalents, kept behaviourally identical                             |
| `apps/api/src/scripts/retention.ts` → `apps/api/package.json`                                                                                               | `retention` script added to the workspace and to the root `retention` alias     |
| `apps/api/.env.example`, `docs/ENVIRONMENT_SETUP.md`                                                                                                        | Documented the retention variables and their defaults                           |
| `apps/web/src/components/ui/PriceHistorySection.tsx`                                                                                                        | Renders archived daily summaries; never charts them                             |
| `apps/web/src/components/ui/PriceHistoryChart.tsx`                                                                                                          | Deduplicated grid-line keys                                                     |
| `apps/web/src/components/ui/priceHistoryGeometry.ts`                                                                                                        | Collapses identical tick positions on a flat series                             |
| `apps/mobile/src/components/PriceHistorySection.tsx`                                                                                                        | Same archived-days treatment in the React Native client                         |
| `apps/web/src/app/App.test.tsx`, `apps/mobile/src/services/history.service.test.ts`, `apps/api/tests/env.test.ts`, `apps/api/tests/comparisonCache.test.ts` | 2 web, 1 mobile and 4 env tests added; index expectations updated               |
| `docs/DATABASE_DESIGN.md`, `docs/API_CONTRACTS.md`, `README.md`                                                                                             | Retention policy, rollup schema, job usage, response contract                   |
| `apps/api/tsconfig.test.json`, `apps/web/tsconfig.node.json`                                                                                                | Pre-existing TypeScript 7 `include` resolution failure, fixed deterministically |

## 2. Rollup architecture

```
price_snapshots ──listRange(day)──▶ aggregateDay() ──▶ RollupStore.insertMany()
                                          │                     │
                                          │                     ▼
                                          │            price_daily_rollups
                                          ▼                     │
                                   verifyDay() ◀──── listForDay()┘
                                          │
                              only if ok ─▼
                        snapshotStore.deleteRange(day, batch)
```

- **Aggregation lives in the service.** `aggregateDay()` is a pure function over
  `StoredSnapshot[]`; no controller and no Mongoose model contains aggregation logic.
- **Grouping** is `(productId, sourceId, marketplaceId, currency, sourceVerification, UTC day)`.
  Currency and provenance are part of the identity, so a rollup can never mix currencies or blend
  sample into verified data.
- **Identity** is `rollupKey = sha256(product|source|marketplace|currency|verification|date)`, the
  unique index on `price_daily_rollups`, which is what makes repeated runs idempotent.
- **First/last** are chosen by capture time (ties broken by observation key), so two runs over the
  same rows produce the same first and last price.
- **Empty days produce nothing.** No rollup is written for a day with no observation; there is no
  invented zero-price row.
- **Writes are insert-only** (`$setOnInsert` upserts). Only an explicit `rollupDay(date, { refresh:
true })` / `replaceDay()` can rewrite a day, and the CLI never calls it — reprocessing is a service
  capability, not something the nightly path can trigger by accident.
- **Range processing** (`rollupRange`) walks UTC days inclusively and reports per-day statistics;
  it is the entry point for reprocessing a backfill window.

## 3. Retention policy

| Variable                | Default | Meaning                                                       |
| ----------------------- | ------- | ------------------------------------------------------------- |
| `RETENTION_RAW_DAYS`    | `30`    | Full-resolution window; days older than this are compacted    |
| `RETENTION_ROLLUP_DAYS` | `730`   | Daily rollups are kept this long, then pruned                 |
| `RETENTION_BATCH_SIZE`  | `500`   | Documents per read/delete batch                               |
| `RETENTION_DRY_RUN`     | `true`  | Default mode of a manual run; `--apply` is required to delete |

Rules the implementation enforces:

- **Reasonable, not invented.** These are product decisions expressed as configurable defaults. The
  project has no regulatory retention mandate, and none is claimed anywhere in the docs or code.
- **Full resolution first.** Nothing inside `RETENTION_RAW_DAYS` is touched. `30` was chosen so the
  existing 90-day view has a recent half at full resolution and an older half served from rollups,
  rather than compacting data no endpoint can request.
- **Rollups outlive raw rows.** `RETENTION_ROLLUP_DAYS < RETENTION_RAW_DAYS` is a validation error
  (env schema **and** job config), because that would delete history twice over.
- **Dry run is the default**, both in the env and in the CLI (`--apply` overrides).
- **No TTL index on either collection.** Deleting history is always an explicit, audited job.

## 4. Database schema and indexes

`price_daily_rollups` — one document per `(product, source, marketplace, currency, provenance, day)`:

| Field                                             | Notes                                              |
| ------------------------------------------------- | -------------------------------------------------- |
| `rollupKey`                                       | sha256 identity, unique                            |
| `productId`, `sourceId`, `marketplaceId`          | Provenance of the aggregate                        |
| `currency`                                        | `^[A-Z]{3}$`; never converted                      |
| `dateKey` / `date`                                | `YYYY-MM-DD` (queryable) and UTC day start (audit) |
| `minPrice`, `maxPrice`, `firstPrice`, `lastPrice` | `{ amountMinor, currency }`, integers only         |
| `observationCount`                                | ≥ 1; sum of rows in the aggregate                  |
| `availabilityCounts`                              | `inStock` / `outOfStock` / `preorder` / `unknown`  |
| `sourceVerification`, `isSample`                  | Provenance, copied at generation time              |
| `generatedAt`                                     | When the rollup was produced                       |
| `windowStart`, `windowEnd`                        | Half-open day window the aggregate covers          |

Indexes: unique `{ rollupKey: 1 }`, `{ productId: 1, dateKey: 1 }`,
`{ productId: 1, sourceId: 1, dateKey: 1 }`, `{ productId: 1, marketplaceId: 1, dateKey: 1 }`,
`{ dateKey: 1 }` (pruning). Verified live: `rollupKey_1, productId_1_dateKey_1,
productId_1_sourceId_1_dateKey_1, productId_1_marketplaceId_1_dateKey_1, dateKey_1`.

`retention_runs` — one document per run (dry-run included): `startedAt`, `finishedAt`, `dryRun`,
`status` (`completed` | `aborted`), the policy used, `rawCutoff`, `rollupCutoff`, `dateRange`, the
full `stats` report and `failedDays`. Index: `{ startedAt: -1 }`.

`price_snapshots` is unchanged: no new fields, no TTL index, no destructive schema change. The new
store methods use the existing `{ capturedAt }`-prefixed ordering through
`{ productId: 1, capturedAt: 1 }` / `{ sourceId: 1, capturedAt: 1 }`; the per-day aggregation groups
by `$dateToString` on `capturedAt`.

## 5. History API integration

`GET /api/v1/products/:productId/history?period=7d|30d|90d` is **backward compatible**, plus one
additive field:

- `observations` — unchanged: raw, chronological, point-in-time, still capped by `limit`.
- `rollups` — new: archived days in the requested window, oldest first, each with `aggregated: true`.
  Defaults to `[]`, so older payloads and older clients stay valid.
- `summary` — still only about observations; rollups are never counted in it, so "lowest" never
  silently becomes a daily minimum.
- `status` — derived from archived provenance when a window has no raw rows left (`verified`,
  `sample_only`, `mixed`), never `no_history`.
- `notices` — say when a window was compacted, that the entries are aggregates and not
  point-in-time prices, and count excluded currencies / unregistered sources.

The 7/30/90-day filters, source and marketplace filters, ordering and `limit` semantics are
unchanged. A rollup is filtered exactly like an observation (source, marketplace, currency,
registered source) and excluded with a notice otherwise.

## 6. UI

Both clients render archived days as a **list**, never as chart points:

- "Archived daily summaries" block with a `Daily aggregate` badge, per-day min/max/first/last,
  observation count and a `DEMO` badge for sample provenance.
- When a window has no full-resolution observations left, the chart is replaced by an explanation
  instead of a flat line.
- The Sprint 1 design tokens and the Sprint 3 chart behaviour are untouched; the chart still plots
  real observations only.

## 7. Job execution, safety and recovery

```
npm run retention                                  # dry run (rollup only, no deletes)
npm run retention -- --apply                       # compact eligible days
npm run retention -- --apply --raw-days=30 --rollup-days=365 --batch-size=200
```

Order per day: **roll up → re-read persisted rollups and verify → count → delete in batches**. A day
that fails verification is skipped, reported in `failedDays`, and its rows stay untouched. Rollup
pruning happens after the compaction loop and only for days older than `RETENTION_ROLLUP_DAYS`.

- **Single-process guard**: `runRetentionJob` throws `RetentionJobBusyError` if a run is active;
  no distributed lock, no scheduler, no new infrastructure.
- **Graceful shutdown**: `SIGINT`/`SIGTERM` abort after the current batch; the run is still recorded
  with `status: "aborted"` and exit code `3`.
- **Verification is against persisted data**: `verifyDay()` recomputes the expected aggregates from
  the raw day and requires a stored rollup with `observationCount >=` expected and
  `minPrice <=` expected min / `maxPrice >=` expected max. A rollup that covers _more_ than what
  remains is safe (a crashed delete); one that covers _less_ blocks deletion.
- **Recovery strategy**: rerun the job. Rollups are insert-only, so a rerun cannot shrink a
  committed aggregate; deletion is day-scoped and idempotent, so the remaining rows are simply
  removed. There is no "undo delete" and none is claimed — the rollup is the recovery artifact, and
  it exists before any row is removed.
- **Audit**: every run is persisted to `retention_runs`; a failure to record is logged and does not
  fail the job (the data work already happened).
- **Refuses to run without MongoDB** instead of compacting an in-memory store that would evaporate.

## 8. Tests, typecheck, lint, format, build

| Gate                                | Result                                                          |
| ----------------------------------- | --------------------------------------------------------------- |
| `packages/shared` Vitest            | 23 passed (3 files)                                             |
| `apps/api` Vitest                   | 133 passed (13 files, incl. 21 against a real MongoDB binary)   |
| `apps/web` Vitest + Testing Library | 13 passed (1 file)                                              |
| `apps/mobile` jest-expo             | 13 passed / 4 suites                                            |
| `npm run typecheck`                 | clean                                                           |
| `npm run lint`                      | clean                                                           |
| `npm run format:check`              | clean                                                           |
| `npm run build`                     | clean (shared → api → web; 502 kB web bundle, existing warning) |

Sprint 4 tests cover: daily aggregation, min/max/first/last, observation counts, availability counts,
currency separation, verified-vs-sample separation, marketplace splitting, idempotency, explicit
reprocessing, verification failures, dry-run, deletion safety, batching, overlap refusal, abort,
rollup pruning, empty datasets, MongoDB model/indexes, and history API compatibility (including a
payload with no `rollups` field).

Notes on the run itself:

- Two pre-existing tsconfig problems surfaced under the repository's TypeScript 7 preview compiler
  (`include` of root-level files in `apps/web/tsconfig.node.json`, and the ambient Express
  augmentation being dropped from `apps/api/tsconfig.test.json`'s program once a test file was
  added). Both configs now list those inputs explicitly; TypeScript 6 and 7 both pass.
- The mobile suites initially collapsed to one file because three tracked test files were
  OneDrive placeholder symlinks that Jest skips. Rehydrating the working copies restored all four
  suites; no repository content changed.

## 9. Was MongoDB genuinely tested?

Yes, on a local `mongodb://127.0.0.1:27017`:

1. **Automated**: `tests/mongoRollups.test.ts` and `tests/mongoSnapshotStore.test.ts` run against a
   real MongoDB binary via `mongodb-memory-server` (21 tests), covering the unique key, duplicate
   rejection, insert-only upserts, `replaceDay`, range listing, batched pruning, paged day loads,
   the retention job end-to-end, and "do not delete a day whose rollup write failed".
2. **Manual, fresh database** (`saveshop-sprint4-report`), one product with three observations 35
   days old and one 2 days old, `RETENTION_RAW_DAYS=30`:

   | Run             | Result                                                                                              |
   | --------------- | --------------------------------------------------------------------------------------------------- |
   | `--dry-run`     | `completed`, `rollupsInserted: 1`, `observationsEligibleForDeletion: 3`, `observationsDeleted: 0`   |
   | `--apply`       | `completed`, `rollupsExisting: 1` (nothing rewritten), `observationsDeleted: 3`, `daysCompacted: 1` |
   | `--apply` again | `completed`, `observationsScanned: 0`, `observationsDeleted: 0` (idempotent)                        |

   The recent day was left alone, and the rollup kept `min 2 800 000, max 3 100 000, first 3 000 000,
last 3 100 000, count 3`, availability `{ inStock: 2, outOfStock: 1 }`, `isSample: true`.

3. **API against that database** (real server, port 4201):

   - `90d` → `observations: 1` (the 2-day-old row) **and** `rollups: [ { date: 2026-10-04, min, max,
first, last, observationCount: 3, aggregated: true, isSample: true, availabilityCounts } ]`,
     plus notices explaining aggregates and demo data.
   - `30d` and `7d` → `observations: 1`, `rollups: 0` — recent windows stay raw, and an out-of-range
     archived day is not smuggled into a shorter period.
   - `retention_runs` held the audit documents and `GET /api/v1/health` returned `200`.

## 10. Known limitations

- **Manual job only.** There is no cron, queue or scheduler; production needs an external trigger
  (a systemd timer, a Cloud scheduler job, or a CI schedule). The single-process guard is a module
  flag, so two _containers_ could still overlap. Day-scoped idempotency limits the damage (the
  worst case is duplicate work, not lost data), but a real distributed lock is future work.
- **No rollback of a deletion.** Recovery is "the rollup you already verified", not a restore. A
  database backup is still the only way to get raw rows back.
- **Compaction is per UTC day.** A day is only compacted once it is fully older than the cutoff, so
  the raw window can be up to ~1 day longer than configured. No timezone-local days are supported.
- **Rollups are generated from raw rows only.** If raw rows for a day were deleted before their
  rollup existed (manual intervention), that day cannot be reconstructed — the job will not invent
  it, and `verifyDay` treats it as nothing to cover.
- **`MAX_DAYS_PER_RUN = 400`.** A larger backlog needs several runs; each is reported separately.
- **Rollup reads are capped** (`HISTORY_MAX_ROLLUP_DAYS * 6` rows) so a pathological day count cannot
  produce an unbounded payload; a truncated list is not currently flagged.
- **Mobile and web were verified by tests, not by hand in a simulator/browser** for this sprint.
- **No UI for the job.** It is a CLI, and its output is JSON on stdout plus the `retention_runs`
  audit collection.

## 11. Git

- Branch: `master`.
- Sprint 3 checkpoint: `fb397d8`.
- Sprint 4 checkpoint: the commit that adds this report; working tree clean afterwards.

## 12. Recommended next sprint

**Sprint 5 — scheduled ingestion health & alerting**, still without scraping: a permission-gated
source scheduler (`/health` visibility into last run, freshness and failures), dead-man's-switch
metrics for the retention job, plus price-drop _detection_ (not delivery) built on the rollups this
sprint creates. The retention job is the natural first caller of a small internal job runner, which
is also what makes a scheduler worth adding rather than speculative infrastructure.
