# Sprint 7 Report — MongoDB Replica Set Integration Testing & Transactional Merge Reliability

Status: **complete**. The merge implementation was verified against a real MongoDB replica set, the
concurrency and redirect gaps found during inspection were fixed, and all existing behaviour and
tests are preserved.

## 1. Sprint objective

Prove the existing catalogue merge against a real MongoDB replica set: actual sessions and
transactions, rollback on failure, idempotent retry and recovery, concurrency safety, and
merged-product comparison/history redirects. Add a dedicated integration-test command without
making the default suite depend on a local MongoDB.

## 2. Repository inspection findings

Architecture found (no rebuild was needed):

- `apps/api/src/services/admin/merge.service.ts` orchestrates a merge: a `pending` run is written
  first, listings/variants move and the source is archived (catalogue store), snapshots are re-keyed
  and deduplicated, rollups are re-keyed and combined, then the run is marked `completed`. Recovery
  is `repairPendingMerges` / `npm run admin -- repair-merges`.
- Transactions use a Mongoose `ClientSession` passed as an opaque `StoreSession` through
  `catalogue.mergeProductReferences`, `snapshots.mergeProduct` and `rollups.mergeProduct`.
- Transaction availability is decided by `mongoose.connection.readyState === 1` plus
  `isTransactionUnsupported` (driver code 20 or the "replica set member or mongos" message). A
  standalone server falls back to the same idempotent steps and reports `transactionUsed: false`.
- Merge runs and audit events are deliberately written outside the transaction (the run is the
  recovery handle; the audit records the outcome).
- Collections modified by a merge: `canonical_products`, `marketplace_listings`,
  `price_snapshots`, `price_daily_rollups`; `catalogue_merge_runs` and `catalogue_audit_events` are
  written separately.
- Relevant unique keys: canonical `id`, partial unique `gtin`, listing `id`, snapshot
  `observationKey`, rollup `rollupKey`.
- Existing Mongo tests used `MongoMemoryServer` (standalone) and never ran a transaction. No CI
  configuration exists in the repository.

Verified gaps fixed in this sprint:

1. **No concurrency guard.** Two merges of the same source could both pass assessment and split its
   listings/snapshots/rollups across survivors. Added an atomic `claimMerge` compare-and-set on the
   source product (`mergeRunId`), taken before any work, and a conditional archive.
2. **Reads outside the transaction.** `mongoSnapshotStore.mergeProduct` and
   `mongoRollupStore.mergeProduct` read the source rows without the session, so they were not
   snapshot-isolated from concurrent writes. Both reads now use the session.
3. **History rollups ignored the redirect.** The raw-observation query used the surviving id, but the
   rollup query used the requested (possibly archived) id, so compacted history disappeared after a
   merge. Both now use the resolved survivor.
4. **Identity resolution was only the process-wide singleton.** Comparison/history now accept an
   optional `resolveProduct`, and `productIdentity.ts` exposes `createProductIdentityResolver`, so
   the integration suite can run the real redirect logic against its own Mongo store.

## 3. Test infrastructure selected and why

`mongodb-memory-server`'s `MongoMemoryReplSet` (already a dependency, binary cached locally) starts a
throwaway single-node replica set with wiredTiger. It needs no Docker or credentials, is
deterministic, and genuinely supports transactions (the suite asserts the server reports
`setName`). `MONGODB_TEST_URI` is supported for a Docker/CI replica set.

Safety properties of the harness (`apps/api/tests/integration/helpers/replicaSet.ts`):

- Never reads the development/production `MONGODB_URI`; only `MONGODB_TEST_URI`.
- Refuses `NODE_ENV=production`.
- Requires the database name to contain `test` before connecting or deleting data.
- Refuses a non-loopback host unless `MONGODB_TEST_ALLOW_REMOTE=1`.
- Requires the URI to name a replica set, and verifies the connected server is a replica set;
  otherwise it fails instead of silently skipping transactions.
- Resets data by deleting documents (indexes preserved) so repeated runs are isolated.
- Runs in a separate Vitest config; the default `vitest.config.ts` excludes `tests/integration/**`.

## 4. Files changed

Created:

- `apps/api/tests/integration/helpers/replicaSet.ts`
- `apps/api/tests/integration/mergeReplicaSet.test.ts`
- `apps/api/tests/integration/mergeRedirects.test.ts`
- `apps/api/vitest.integration.config.ts`
- `docs/SPRINT_7_REPORT.md`

Modified:

- `apps/api/src/models/canonicalProduct.ts` — `mergeRunId` claim field.
- `apps/api/src/services/catalogue/catalogueStore.ts` — `claimMerge`, `runId` on reference moves.
- `apps/api/src/services/catalogue/memoryCatalogueStore.ts` — claim map, conditional archive.
- `apps/api/src/services/catalogue/mongoCatalogueStore.ts` — atomic claim and conditional archive.
- `apps/api/src/services/admin/merge.service.ts` — claim before execution, claim in recovery,
  conflict response, `runId` through every step.
- `apps/api/src/services/snapshots/mongoSnapshotStore.ts` — session on the source read.
- `apps/api/src/services/rollups/mongoRollupStore.ts` — session on the source read.
- `apps/api/src/services/history.service.ts` — rollup query follows the redirect; injectable
  identity resolver.
- `apps/api/src/services/comparison.service.ts` — injectable identity resolver.
- `apps/api/src/services/catalogue/productIdentity.ts` — resolver factory.
- `apps/api/vitest.config.ts` — exclude the integration directory.
- `apps/api/package.json`, `package.json` — `test:integration:merge` scripts.
- `.prettierignore` — exclude tool-created chat attachments.
- `docs/ADMIN_SETUP.md` — replica-set test setup, commands, troubleshooting.

## 5. Integration tests added

`mergeReplicaSet.test.ts` (11 tests): successful transactional merge; rollback after a step fails
inside the transaction; repeated merge; repeated recovery; same source into different targets; same
source into the same target; two sources into one target; concurrent observation write; pending-run
recovery; recovery after archive; stale run pointing at a different destination.

`mergeRedirects.test.ts` (4 tests): archived id resolves and history serves the survivor; comparison
resolves, caches and persists under the survivor; multi-hop redirects; malformed circular redirect
terminates and a circular merge is refused.

## 6. Transaction scenarios tested

- Successful merge commits a real transaction and reports `transactionUsed: true` on both the
  response and the merge-run record.
- A failure injected **after real listing, variant, snapshot writes** aborts the whole transaction:
  listings, variant links, snapshots, rollups and the source archival are all unchanged, and the run
  is recorded failed.
- The repair command then completes the same run without duplicating any row.
- Standalone fallback remains untouched: the existing memory-store suite still asserts
  `transactionUsed: false`.

## 7. Concurrency scenarios tested

- Same source → different targets: exactly one merge succeeds; the other returns 409; the source has
  one final destination and all references are on the winner; the losing target receives nothing.
- Same source → same target: exactly one succeeds, one gets 409; no duplicate snapshots or rollups.
- Two sources → one target concurrently: both are merged (or one is retried by recovery); every
  source is archived into the target, listings/snapshots/rollups land on the target, and no
  `observationKey`/`rollupKey` duplicates exist.
- A new observation for the target written during a merge: the merge still commits and the final
  target history has no duplicate observation key.

## 8. Recovery scenarios tested

- A `pending` run with no work applied is detected and completed; a second repair changes nothing.
- A run whose process died after archiving the source (source archived, listings moved) is completed
  with the remaining idempotent steps.
- A stale run whose source was already merged into a **different** target is marked failed and stays
  open for an operator; the real destination and its references are untouched.
- A transaction that rolled back leaves no partial catalogue and is recovered by the run.

## 9. Commands executed

```bash
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run test:integration:merge
```

On this Windows machine the bundled `node` directory had to be prepended to `PATH` for npm
lifecycle scripts.

## 10. Exact test results

| Command                          | Result                                                                |
| -------------------------------- | --------------------------------------------------------------------- |
| `npm test`                       | pass — 298 tests: API 226 (21 files), web 19, mobile 19, shared 34    |
| `npm run test:integration:merge` | pass — 2 files, 15 tests (11 merge replica-set + 4 redirects), exit 0 |
| `npm run typecheck`              | pass (shared, API incl. tests, mobile, web)                           |
| `npm run lint`                   | pass, 0 errors, 0 warnings                                            |
| `npm run format:check`           | pass                                                                  |
| `npm run build`                  | pass (shared → API → web; pre-existing >500 kB chunk warning)         |

The replica-set suite ran against `mongodb-memory-server` 11.3.0 with its mongod 8.2.6 binary, a
single-node replica set, database `saveshop_merge_integration_test`.

## 11. Remaining limitations

- No CI is configured in the repository; the job is CI-ready but must be added by the owner (the
  command and environment variables are documented in `ADMIN_SETUP.md`).
- The suite uses a single-node replica set; stepdowns, network partitions and multi-node failover are
  not exercised.
- Transactions are not retried automatically on transient errors. A failed run is recovered by the
  idempotent repair command, which is deliberate: the merge steps are retry-safe, but a blind
  in-request retry could duplicate audit entries.
- In the non-transactional fallback a listing created by another process between the listing move and
  the archive could still point at the archived source. The claim prevents concurrent merges (the
  primary risk) but not concurrent ingestion; identity resolution follows the redirect for new
  writes.
- A source claim is retained after a merge as the audit link to the run (`mergeRunId`). A failed run
  pointing at a conflicting destination stays open and keeps being reported by the repair command
  until an operator resolves it.
- Concurrency behaviour was verified with deterministic async interleaving, not with a multi-process
  load test.

## 12. Commit hashes

- `2f557a5` — Verify catalogue merges against a real MongoDB replica set (implementation, tests,
  `ADMIN_SETUP.md`, this report).
- A documentation follow-up records this hash in the report; its own hash is visible in `git log`.

The working tree is clean after the follow-up commit.
