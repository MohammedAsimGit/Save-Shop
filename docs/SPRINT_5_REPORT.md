# Sprint 5 — Product Catalogue & Product Identity Engine

**Status: complete.** Product identity now lives in a canonical catalogue rather than in marketplace
titles. `canonical_products` holds one authoritative record per product, `marketplace_listings` holds
what a source claims its item is, and a deterministic matcher decides whether the two are the same
thing before anything is compared. Only `exact` and `strong` verdicts resolve a listing; `possible`,
`unmatched` and `conflict` listings are stored, reported and left unresolved for a human.

**Still no marketplace integration.** The only sources are the shared sample catalogue and a local
JSON file. No marketplace catalogue feed is connected, so every record in a running app has
`provenance: "demo"` or `"manual"`, and no sample or demo listing can ever be reported as verified
marketplace data. Amazon and Flipkart remain disabled descriptors awaiting written permission.

- Sprint 4 checkpoint: `eb20f71`.
- Sprint 5 checkpoint: the commit that adds this report (`git log -1 --stat`).

## 1. Files

### Created

| File                                                         | Purpose                                                                          |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `packages/shared/src/contracts/catalogue.ts`                 | Canonical product, listing, match verdict, search and detail Zod contracts       |
| `packages/shared/src/catalogue/normalize.ts`                 | GTIN/MPN/colour/capacity/brand normalisation, similarity, accessory detection    |
| `packages/shared/src/catalogue/catalogue.test.ts`            | 11 tests for normalisation, check digits and similarity bounds                   |
| `apps/api/src/models/canonicalProduct.ts`                    | `canonical_products` model: unique `id`, partial unique `gtin`, search keys      |
| `apps/api/src/models/marketplaceListing.ts`                  | `marketplace_listings` model with unique `(sourceId, marketplaceId, externalId)` |
| `apps/api/src/models/catalogueIngestionRun.ts`               | `catalogue_ingestion_runs` audit model                                           |
| `apps/api/src/services/catalogue/catalogueSource.ts`         | `CatalogueSource` contract, demo source, validated JSON file source              |
| `apps/api/src/services/catalogue/matching.service.ts`        | Deterministic identity matcher (rules, conflicts, confidence table)              |
| `apps/api/src/services/catalogue/ingestion.service.ts`       | read → validate → normalize → dedupe → match → persist → report pipeline         |
| `apps/api/src/services/catalogue/catalogueStore.ts`          | Store abstraction, `listingKey`, `listingContentHash`, store-level types         |
| `apps/api/src/services/catalogue/mongoCatalogueStore.ts`     | MongoDB store (insert-only products, hash-aware listing upserts)                 |
| `apps/api/src/services/catalogue/memoryCatalogueStore.ts`    | In-memory store for tests and the no-database development mode                   |
| `apps/api/src/services/catalogue/catalogue.service.ts`       | Search relevance, product detail, listing summary and notices                    |
| `apps/api/src/services/catalogue/productIdentity.ts`         | Catalogue → comparison/history identity resolution with demo fallback            |
| `apps/api/src/services/catalogue/index.ts`                   | Store/matcher/service wiring plus idempotent first-run seeding                   |
| `apps/api/src/controllers/catalogue.controller.ts`           | Search, detail and listings handlers                                             |
| `apps/api/src/routes/catalogue.routes.ts`                    | `GET /products`, `/products/:id`, `/products/:id/listings` (read-only)           |
| `apps/api/src/scripts/catalogue.ts`                          | Ingestion CLI: `seed-demo` / `ingest --file=… [--dry-run]`                       |
| `apps/api/tests/catalogueMatching.test.ts`                   | 12 matcher tests: tiers, conflicts, ambiguity, accessories, generations          |
| `apps/api/tests/catalogueIngestion.test.ts`                  | 7 ingestion tests: migration, idempotency, rejection, no silent resolution       |
| `apps/api/tests/catalogueApi.test.ts`                        | 13 API tests: search, filters, paging, detail, listings, error codes             |
| `apps/api/tests/mongoCatalogue.test.ts`                      | 10 tests against a real MongoDB binary: indexes, dedupe, upserts, seeding        |
| `apps/api/tests/helpers/catalogue.ts`                        | Shared test fixtures (`createTestCatalogue`, `makeProduct`, `syntheticGtin`)     |
| `apps/web/src/services/catalogue.service.ts`                 | Validated catalogue client (search, detail, listings)                            |
| `apps/web/src/hooks/useCatalogueSearch.ts`                   | Catalogue-driven search with explicit fallback + retry                           |
| `apps/web/src/hooks/useProductIdentity.ts`                   | Product identity loader with network-aware error state                           |
| `apps/web/src/components/ui/ProductIdentitySection.tsx`      | Identity panel: ids, resolved/unresolved listings, match verdicts                |
| `apps/web/src/components/ui/CatalogueOnlyCard.tsx`           | Search result with no stored sample price (says so instead of borrowing one)     |
| `apps/mobile/src/services/catalogue.service.ts`              | Mobile catalogue client, parsed against the shared contracts                     |
| `apps/mobile/src/hooks/useCatalogueSearch.ts`                | Mobile search hook with the same fallback rules                                  |
| `apps/mobile/src/hooks/useProductIdentity.ts`                | Mobile identity hook                                                             |
| `apps/mobile/src/components/ProductIdentitySection.tsx`      | Mobile identity block                                                            |
| `apps/mobile/src/services/catalogue.service.test.ts`         | 4 contract-drift tests (rejects malformed catalogue responses)                   |
| `apps/mobile/src/components/ProductIdentitySection.test.tsx` | 2 tests: identity + unresolved copy, and the identity-unavailable fallback       |
| `docs/SPRINT_5_REPORT.md`                                    | This report                                                                      |

### Modified

| File                                          | Change                                                                                               |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `packages/shared/src/index.ts`                | Exports catalogue contracts and normalisation helpers                                                |
| `apps/api/src/models/index.ts`                | Exports the three new models; `ensureModelIndexes` builds their indexes                              |
| `apps/api/src/routes/index.ts`                | Mounts the catalogue router before comparison/history (single-segment `/:productId`)                 |
| `apps/api/src/server.ts`                      | Seeds the sample catalogue into an empty catalogue on first start; never blocks startup              |
| `apps/api/src/services/comparison.service.ts` | Identity comes from the catalogue (demo fallback documented); unresolved listings are noted          |
| `apps/api/src/services/history.service.ts`    | Same identity resolution for history, so history can never attach to a wrong product                 |
| `apps/api/package.json`, `package.json`       | `catalogue` script: `npm run catalogue -- seed-demo \| ingest --file=…`                              |
| `apps/web/src/pages/SearchPage.tsx`           | Searches the canonical catalogue first, falls back to sample data with a visible notice              |
| `apps/web/src/pages/ProductPage.tsx`          | Renders the identity section under the comparison                                                    |
| `apps/web/src/app/App.test.tsx`               | 3 new tests: catalogue search, catalogue-only result, and the explicit sample fallback               |
| `apps/mobile/src/screens/SearchScreen.tsx`    | Catalogue-first search with fallback notice and catalogue-only results                               |
| `apps/mobile/src/screens/ProductScreen.tsx`   | Renders the identity block                                                                           |
| `docs/API_CONTRACTS.md`                       | Catalogue endpoints (§7–9), ingestion-not-an-endpoint rationale (§10), renumbered sections           |
| `docs/DATABASE_DESIGN.md`                     | Implemented `canonical_products`, `marketplace_listings`, `catalogue_ingestion_runs`, matching rules |
| `README.md`                                   | Sprint 5 status, catalogue CLI, matching order, honest limitations                                   |

## 2. Canonical product model

`CanonicalProduct` (`packages/shared/src/contracts/catalogue.ts`) is the authoritative description of
_what a thing is_, independent of any shop:

| Field                            | Rule                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| `id`                             | Lowercase slug, 1–120 chars; unique in MongoDB; it is the id prices/history reference     |
| `name`, `brand`, `category`      | Required; `category` is a lowercase slug                                                  |
| `model`, `mpn`, `gtin`           | Optional and **only stored when actually supplied**                                       |
| `gtin`                           | Must have a valid GS1 check digit, normalised to 14 digits, **partial-unique**            |
| `mpn`                            | Uppercase part number, indexed but deliberately **not** unique (manufacturers reuse them) |
| `description`, `specifications`  | Optional description; up to 40 short spec pairs                                           |
| `color`, `storageCapacity`       | Variant facts that block false merges (black ≠ blue, 128 GB ≠ 256 GB)                     |
| `variantOf`, `variantAttributes` | Variants stay distinct but connected to their base product                                |
| `imageUrls`                      | Up to 8 absolute http(s) URLs                                                             |
| `status`                         | `active` / `draft` / `archived`; search defaults to `active`                              |
| `provenance`                     | `demo` / `manual` / `authorized_source` — a demo record can never claim verification      |
| `isSample`                       | True for sample data                                                                      |
| `createdAt`, `updatedAt`         | Server-assigned ISO timestamps                                                            |

Denormalised `search.text`, `search.tokens`, `search.brandKey` and `search.modelKey` are derived at
write time so matching and relevance are index-supported without a text-search engine. An identifier
is never generated, never repaired and never inferred from a title: an empty `gtin` means "not known",
and a duplicate GTIN is treated as a data error (unique index) rather than a second product.

## 3. Marketplace listing model

`MarketplaceListing` is one item _as a source reported it_, on one marketplace:

- `id` — deterministic sha256 of `sourceId|marketplaceId|externalId` (`listingKey`), so the same
  record always has the same id;
- `canonicalProductId` — set **only** for `exact`/`strong` matches; `null` otherwise;
- `sourceId`, `marketplaceId`, `externalId` — unique together in MongoDB, which is what makes
  repeated ingestion idempotent even if two runs overlap;
- `title`, `url`, `brand`, `model`, `mpn`, `gtin`, `specifications`, `imageUrl`, `color`,
  `storageCapacity`, `lastObservedAt` — exactly what the source said, title preserved verbatim for
  review;
- `provenance`, `isSample` — carried from the source, never upgraded;
- `match` — the verdict: `status`, `method`, `confidence`, `requiresReview`, `reasons`;
- `contentHash` — storage-only; unchanged content is reported as `unchanged`, not `updated`, and it
  is never returned by the API.

A listing never becomes a canonical product on its own, which is what stops a marketplace title from
silently defining identity.

## 4. Identity matching algorithm

Deterministic, in documented priority order (`matching.service.ts`), evaluated against at most 25
candidates from `store.findCandidates` (GTIN, MPN, brand, name tokens):

1. **canonical id** supplied by a source trusted to own the catalogue → `exact`;
2. **GTIN** equal → `exact`;
3. **MPN** equal → `strong`;
4. **brand + model** (+ variant attributes) → `strong`;
5. **brand + title similarity** ≥ 0.5, or unbranded similarity ≥ 0.75 → `possible` (never resolved).

Hard rules that produce `conflict` instead of a match:

- two different GTINs, MPNs or explicit models for the same candidate;
- a different generation inferred from the titles (`XM4` vs `XM5`);
- an accessory ("case for…", "screen protector") — never the product;
- a stated capacity or colour contradicting the canonical variant;
- more than one product carrying the same exact identifier.

Ambiguity is never resolved: two equally strong candidates become `possible` + `requiresReview`, and
`possible`/`conflict` verdicts always store `canonicalProductId: null`. The demo migration is the one
place canonical ids are trusted, because the sample catalogue _is_ the seed of the canonical
catalogue; a marketplace feed that is not trusted has its id claim ignored, not guessed at.

## 5. Matching confidence methodology

`confidence` is a deterministic **strength score** from 0 to 100, produced by one documented table:

| Rule                               | Status      | Score                       |
| ---------------------------------- | ----------- | --------------------------- |
| canonical id (trusted source)      | `exact`     | 100                         |
| GTIN equal                         | `exact`     | 100                         |
| MPN equal                          | `strong`    | 95                          |
| brand + model + variant attributes | `strong`    | 92                          |
| brand + model                      | `strong`    | 90                          |
| brand + title similarity           | `possible`  | 65 + round(similarity × 10) |
| title similarity only              | `possible`  | 55 + round(similarity × 10) |
| any contradiction                  | `conflict`  | 10                          |
| no rule matched                    | `unmatched` | 0                           |

It is **not** a probability: no calibration set exists, so no client may present it as a percentage
chance of being correct. It exists to rank verdicts and to explain a decision; the resolution gate is
the status, not the number. Both clients label it as a strength score, and the reasons array carries
the human-readable rule that fired.

## 6. Catalogue ingestion architecture

Pipeline: **read → validate → normalise → dedupe → match → persist → report**, all in
`ingestion.service.ts`. A source only reports what a marketplace listed; it never declares identity.

- **Sources** implement `CatalogueSource` (`read()`, `provenance`, `isSample`, `trustsCanonicalIds`).
  Two exist: the demo catalogue and a local JSON file (`{ products: [...], listings: [...] }`). Adding
  an authorised provider later means writing one adapter, exactly like price sources.
- **Validation** is per record. A record that fails Zod is reported in `rejectedRecords` with its
  index and reason and is **never stored**; one bad listing does not fail the run.
- **Normalisation** happens before storage: GTIN → 14 digits with check-digit validation, MPN and
  model uppercased, colour and capacity canonicalised. Values that cannot be real identifiers are
  dropped rather than stored in a shape the matcher would trust.
- **Dedupe and idempotency**: deterministic listing ids plus the unique `(sourceId, marketplaceId,
externalId)` index; unchanged `contentHash` counts as `unchanged`. Re-running the same file creates
  nothing (verified below). Canonical products are insert-only — an existing `id` is kept, so
  ingestion can never overwrite curated identity.
- **Matching** calls the shared matcher; only `exact`/`strong` set `canonicalProductId`.
- **Reporting**: every run returns counts (records read/accepted/rejected, created/updated/unchanged,
  products inserted/existing, matches by status) and is recorded in `catalogue_ingestion_runs`
  (`status`, `sources`, counts, duration, notes); a failure to write the audit row never fails the
  ingestion itself.
- **Interface**: `npm run catalogue -- seed-demo [--dry-run]` and
  `npm run catalogue -- ingest --file=catalogue.json [--dry-run]`. There is deliberately **no HTTP
  ingestion endpoint**: the project has no admin authentication, and an unauthenticated endpoint that
  creates product identity would be a security hole.
- **First-run seeding**: on start, an empty catalogue is seeded from the sample catalogue
  (idempotent); a failure to seed is logged and never stops the API.

## 7. API endpoints

| Endpoint                                   | Behaviour                                                                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/products`                     | Canonical search: `q`, `brand`, `category`, `model`, `status`, `page`, `pageSize`. Deterministic additive relevance, stable tie-break, `meta` pagination, empty result is `200` |
| `GET /api/v1/products/:productId`          | Canonical product + `listingSummary` (`total`, `resolved`, `unresolved`, `requiresReview`, `byStatus`) + notices. `404` unknown, `400` malformed                                |
| `GET /api/v1/products/:productId/listings` | Up to 50 resolved listings with source title, URL, provenance and the full match verdict                                                                                        |

Comparison and history now resolve identity through `resolveProductIdentity`, so a price can only be
attached to a product the catalogue knows; the documented demo fallback keeps every existing screen
working when the catalogue has no record. Comparison adds a notice when identity came from the sample
fallback and when listings are unresolved, and unresolved listings are excluded from the offer set.
Unknown query values are `400 VALIDATION_ERROR`; unknown products are `404 NOT_FOUND`.

## 8. Web and mobile integration

- **Search** queries the canonical catalogue first (`useCatalogueSearch` on both clients). Results are
  canonical products: products that exist in the sample catalogue render with their sample prices;
  catalogue-only products render a "no stored sample price yet" card instead of borrowing a price
  from a similar item. If the API is unreachable, both clients fall back to the local sample
  catalogue and **say so** — silently searching a different catalogue would be misleading.
- **Product page** gains an identity section: catalogue id, GTIN/MPN/model (or "none recorded"),
  resolved vs unresolved listing counts, per-listing match verdict with reason, the statement that
  unresolved listings are not compared until reviewed, and the "strength score, not a probability"
  disclaimer. A catalogue that cannot be reached degrades to one honest sentence and leaves the
  comparison and history above it untouched.
- Both clients parse every catalogue payload against the shared Zod schemas before rendering, so a
  drifted API surfaces as a contract error rather than a wrong identity or a wrong price.

## 9. Test and build results

Run from the repository root on 2026-11-08 (`npm run verify`, then `npm run build`):

| Suite     | Files  | Tests   | Result   |
| --------- | ------ | ------- | -------- |
| API       | 17     | 175     | pass     |
| Shared    | 4      | 34      | pass     |
| Web       | 1      | 16      | pass     |
| Mobile    | 6      | 19      | pass     |
| **Total** | **28** | **244** | **pass** |

New coverage in this sprint: 12 matcher tests, 7 ingestion tests, 13 catalogue API tests, 10 MongoDB
catalogue tests, 11 shared normalisation tests, 3 web tests, 4 mobile contract-drift tests and 2
mobile identity-component tests. Typecheck (`tsc` for shared/api/web/mobile) and `eslint .` are clean.
`npm run build` produces the API build and the web bundle (521 kB JS / 156 kB gzip; Vite warns about
the single chunk, which predates this sprint). Existing comparison, history, rollup and retention
suites all still pass unchanged, so nothing earlier regressed.

## 10. MongoDB verification

Verified against a real local `mongod` (127.0.0.1:27017) using a throwaway database
`saveshop_sprint5_verify`, with the API on :4301 and the CLI writing through the same store:

| Check                                     | Observed                                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| First start seeds an empty catalogue      | 8 canonical products, 3 listings for the sample Sony product                                                                                     |
| `GET /products?q=sony`                    | `200`, `totalItems: 1`, `ordering: "relevance"`, `meta` pagination present                                                                       |
| Demo migration match method               | `canonical_id` → `exact` (the sample catalogue owns its ids)                                                                                     |
| Notice honesty                            | "Every result is a sample catalogue record; no verified marketplace catalogue feed is connected."                                                |
| `GET /products/sony-wh1000xm5`            | `200`, `listingSummary` 3 total / 3 resolved / 0 unresolved                                                                                      |
| Unknown product / oversized page          | `404 NOT_FOUND` / `400 VALIDATION_ERROR`                                                                                                         |
| CLI ingest of a 1-product, 4-listing file | accepted 3, rejected 1 ("invalid record: url: …"), matches exact 1 / possible 1 / conflict 1                                                     |
| GTIN normalisation in MongoDB             | stored as `04006381333931` (14 digits, valid check digit)                                                                                        |
| Resolution gate                           | only the GTIN listing resolved; the accessory (`conflict`) and similar-title (`possible`) listings stayed unresolved, `canonicalProductId: null` |
| Product detail after ingestion            | `total: 1`, `resolved: 1`, `unresolved: 0`, notice "2 listing(s) … await review"                                                                 |
| Comparison for a catalogue-only product   | `200`, `status: "no_offers"`, 0 offers — no price borrowed from another product                                                                  |
| Re-running the identical ingest           | `created: 0`, `updated: 0`, `unchanged: 3`, `canonicalProductsExisting: 1`                                                                       |
| Cleanup                                   | API stopped, ingestion fixture removed, verification database dropped                                                                            |

The Mongo integration suites (`mongoCatalogue.test.ts`, 10 tests) also run against a real `mongod`
binary via `mongodb-memory-server`, covering the unique product id, the partial unique GTIN, the
listing dedupe key, hash-aware upserts and insert-only product semantics.

## 11. Remaining limitations

1. **No marketplace catalogue feed.** Both sources are local; there is no authorised ingestion, no
   scraper and no scheduled catalogue refresh. Every record is `demo`/`manual`.
2. **No review workflow.** `possible` and `conflict` listings are stored and counted, but a human
   cannot resolve, reject or merge them from the UI or API yet.
3. **No write API.** Ingestion is a local CLI because admin authentication does not exist; the trade-off
   is an operator with database access, documented in `API_CONTRACTS.md` §10.
4. **Matching is rule-based, not learned.** Title similarity is token-based, generation detection
   covers the patterns the tests encode, and there is no calibration set, so confidence stays an
   uncalibrated strength score.
5. **No variant UI.** Variants are modelled (`variantOf`, `variantAttributes`, colour/capacity) and
   protected by conflict rules, but no screen shows or selects them.
6. **No merge/split tooling.** Duplicate products created by a future feed would need manual operator
   work; nothing detects duplicates after insert.
7. **No change history for identity.** Editing a canonical product overwrites it; only ingestion runs
   (not individual product edits) are audited.
8. **Search is not full-text.** Relevance is additive token scoring over indexed keys; there is no
   fuzzy matching, stemming or typo tolerance.
9. **Seed-on-start is single-instance.** Two API instances booting against an empty database race on
   the same seed; the unique indexes make that safe but noisy.

## 12. Git commit and working tree

- Sprint 4 checkpoint: `eb20f71` (clean tree, all checks green at that commit).
- Sprint 5 checkpoint: the commit that adds this report — `git log -1 --stat` on `main`.
- Working tree after the commit is clean; the throwaway verification database and the temporary
  catalogue file used for the end-to-end check were removed, and `apps/api/.env` was never modified.

## 13. Recommended next sprint

**Sprint 6 — Match review, product merge and listing resolution workflow.** The identity engine now
produces verdicts that nothing can act on: `possible` and `conflict` listings accumulate silently, and
`requiresReview` has no owner. The natural next step is a narrow internal review surface (behind real
authentication, not a public endpoint) that:

1. lists unresolved listings grouped by candidate product with their reasons and confidence tier;
2. lets a reviewer accept a match, reject it as a different product, or merge two canonical records
   with a full audit trail (`reviewedBy`, `decidedAt`, `previousProductId`);
3. pins accepted matches so re-ingestion cannot silently undo a human decision;
4. re-runs the matcher over historical unresolved listings after a rule change.

That closes the honest gap between "stored as unresolved" and "resolved correctly", and it is the
prerequisite for connecting any real marketplace catalogue: without a review path, a real feed's
ambiguity would become silent mis-comparison.
