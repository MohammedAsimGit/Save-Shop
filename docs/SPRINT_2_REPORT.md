# Sprint 2 — Price Comparison Engine Foundation

**Status: complete.** The comparison engine, its contracts, the source-adapter architecture, one
deterministic demo adapter, two API endpoints and both client screens have shipped.

**No marketplace is integrated.** The only enabled source is a sample adapter, so every price the
product shows today is invented and labelled `DEMO`. Amazon India and Flipkart exist only as
disabled descriptors that report "pending permission". Nothing in this sprint scrapes, calls a
marketplace API, or uses an affiliate/creators API.

- Sprint 1 checkpoint: `b24d769` (premium UI), `c369d60` (ingestion feasibility spike).
- Sprint 2 checkpoint: the commit that adds this report (`git log -1 --stat`).

## 1. Files

### Created

| File                                                  | Purpose                                                                      |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| `packages/shared/src/contracts/comparison.ts`         | Zod contracts: source, snapshot, compared offer, exclusion, coverage, result |
| `packages/shared/src/comparison/engine.ts`            | Pure ranking engine + `withProduct` join                                     |
| `packages/shared/src/comparison/engine.test.ts`       | 12 engine tests                                                              |
| `apps/api/src/services/sources/sourceAdapter.ts`      | `MarketSourceAdapter` interface, fetch context/result types                  |
| `apps/api/src/services/sources/demoSource.ts`         | Deterministic, always-sample demo adapter                                    |
| `apps/api/src/services/sources/pendingSources.ts`     | Amazon/Flipkart descriptors; adapters throw if queried                       |
| `apps/api/src/services/sources/registry.ts`           | Adapter registry + coverage response                                         |
| `apps/api/src/services/comparison.service.ts`         | Orchestration: adapters → engine → response                                  |
| `apps/api/src/controllers/comparison.controller.ts`   | Two read-only handlers                                                       |
| `apps/api/src/routes/comparison.routes.ts`            | `/products/:productId/comparison`, `/sources`                                |
| `apps/api/tests/comparison.test.ts`                   | 9 API tests (schema, ranking, demo labelling, 404, 400, request id)          |
| `apps/api/tests/demoSource.test.ts`                   | 8 tests (determinism, TTL, stock mapping, disabled adapters refuse to run)   |
| `apps/web/src/services/comparison.service.ts`         | Contract-validated fetch helpers                                             |
| `apps/web/src/hooks/useProductComparison.ts`          | Loading/ready/error state with abort + retry                                 |
| `apps/mobile/src/services/comparison.service.ts`      | Same helpers for React Native                                                |
| `apps/mobile/src/hooks/useProductComparison.ts`       | Same state machine for mobile                                                |
| `apps/mobile/src/services/comparison.service.test.ts` | 3 contract-rejection tests                                                   |
| `docs/SPRINT_2_REPORT.md`                             | This report                                                                  |

### Modified

| File                                                 | Change                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| `packages/shared/src/index.ts`                       | Re-exports comparison contracts, engine, demo catalogue                   |
| `apps/api/src/middlewares/validate.ts`               | Added `validateParams`; body/param parsing now documented as in use       |
| `apps/api/src/routes/index.ts`                       | Mounts `/products` and `/sources`                                         |
| `apps/web/src/pages/ProductPage.tsx`                 | Prices come from the API; lowest, offers, freshness, coverage, exclusions |
| `apps/web/src/components/ui/PriceComparisonCard.tsx` | Renders a `ComparedOffer` (Demo/Verified/Lowest badges, inert CTA)        |
| `apps/web/src/app/App.test.tsx`                      | 4 new tests (API comparison, offline message, contract rejection)         |
| `apps/web/src/layouts/RootLayout.tsx`                | Footer states the Sprint 2 provenance rules                               |
| `apps/mobile/src/screens/ProductScreen.tsx`          | Same wiring as web, mobile styling                                        |
| `docs/API_CONTRACTS.md`                              | Documents both endpoints, field rules, exclusions, client parsing         |
| `README.md`                                          | Status, quick-start smoke test, docs table, constraints                   |

## 2. Architecture

```
adapter (demo | <authorised future provider>)
        │  OfferSnapshot[]  (price, currency, capturedAt, TTL, attribution, availability)
        ▼
createComparisonService  ── catches per-adapter failure, keeps the rest
        │  unknown[]  (untrusted)
        ▼
compareOffers (shared, pure)  ── validate → currency → freshness → stock → sort
        │  ComparisonResult (lowest, lowestVerified, offers, excluded, status, notices)
        ▼
withProduct  →  { data: ProductComparisonResponse }  →  web / mobile (schema-parsed)
```

Decisions worth naming:

- **One engine, three consumers.** Ranking lives in `packages/shared`, so the API, web and mobile
  cannot disagree about which offer is lowest. The clients re-parse the payload against the same
  schema the API produced.
- **Marketplace code stays in adapters.** The engine and service import no provider module. Adding an
  authorised provider is one adapter plus a registry entry — no contract, ranking or UI change.
- **"Verified" belongs to the source, not the number.** `isVerified` is derived from
  `source.verification`; a sample source can never promote a price by being cheapest.
- **Exclusions are data, not silence.** Every dropped observation carries a reason (`invalid`,
  `unknown_source`, `stale`, `unavailable`, `currency_mismatch`, `future_timestamp`), so the UI can
  say "1 out of stock" instead of quietly showing fewer marketplaces.
- **No repair, no invention.** No currency conversion, no shipping estimate, no discount inference.
  TTL is per snapshot because a licensed feed and an affiliate API age differently.
- **Deterministic demo data.** `capturedAt` is derived from an injected clock, so tests and
  screenshots reproduce; every offset stays inside the TTL so the demo path is always fresh.

## 3. API endpoints

| Endpoint                                     | Behaviour                                                                                       |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `GET /api/v1/products/:productId/comparison` | Ranked offers for one product. `400` for a malformed slug, `404` for an unknown product.        |
| `GET /api/v1/sources`                        | Every known source, its verification and permission status, and why disabled ones are disabled. |

Both use the existing envelope, `x-request-id`, `validateParams`, `AppError` and the central error
handler. Sample input/output: [API_CONTRACTS.md](API_CONTRACTS.md) §4–5.

Live check against the running API (demo adapter only):

```
status sample_only | currency INR | lowest amazon { amountMinor: 2699000 } | verified false
offers [ amazon:2699000/fresh/lowest=true, flipkart:2749900/fresh/lowest=false ]
excluded [ unavailable ]
notices [ Demo source: prices are generated sample values…, Every eligible offer comes from a sample source… ]
```

## 4. Tests, typecheck, lint, build

| Gate                                 | Result                                                             |
| ------------------------------------ | ------------------------------------------------------------------ |
| `packages/shared` Vitest             | 15 passed (12 engine, 3 health)                                    |
| `apps/api` Vitest                    | 38 passed (9 comparison, 8 demo source, 4 health, 8 errors, 9 env) |
| `apps/web` Vitest + Testing Library  | 7 passed                                                           |
| `apps/mobile` jest-expo              | 9 passed / 3 suites                                                |
| `npm run typecheck` (all workspaces) | clean                                                              |
| `npm run lint`                       | clean                                                              |
| `npm run build` (shared → API → web) | clean; web bundle 487 kB (148 kB gzip)                             |

Engine coverage: sorting, single lowest, sample-never-verified, lowestVerified selection, currency
mismatch, stale, unavailable, all-stale → `no_offers`, invalid snapshot, unknown source, future
timestamp, determinism, cross-product rejection.

Browser check: product page rendered from the live API — `Lowest sample price ₹26,990`, `DEMO` badge,
`Observed 2 min ago`, attribution line, "Within source freshness limit", "Not ranked: 1 out of
stock", and a source-coverage list showing Amazon/Flipkart as `PENDING`. Web tests also assert the
offline path shows an unavailable message instead of falling back to catalogue prices.

## 5. Bugs, limitations, known gaps

- **Product identity is still catalogue-owned.** The service looks products up in the shared demo
  catalogue; only offers come from adapters. `product.catalog` is hard-coded to `demo-catalog`.
- **No persistence.** Snapshots are fetched per request and discarded; there is no history store, so
  no trend chart. Product page says so explicitly.
- **No cache.** Every request re-runs the adapters; fine for one sample adapter, not for metered
  provider APIs (needs a snapshot cache before a real provider lands).
- **Single comparison currency (INR).** A different-currency offer is excluded, not converted; there
  is no FX source and none was invented.
- **Freshness is binary** (`fresh`/`stale`). No "aging" band, because no source needed one yet.
- **Mobile was verified by tests and typecheck, not in a simulator.** No Expo/emulator run in this
  environment; the mobile screen reuses the same hooks and tests the contract path.
- **Deal buttons remain disabled** on both clients — there is no authorised outbound link, and a
  sample price must not be presented as a live offer.
- **Local-only quirk:** the API must be started with a valid `PORT`. A `PORT=0` inherited from the
  shell fails env validation by design (`min(1)`), not a defect in the engine.

## 6. Git

- Branch `main` (local commits only; nothing pushed).
- Sprint 2 is one checkpoint commit containing the files above; `git log -1 --stat` shows it.
- No existing work was discarded, reset or overwritten. The `.env` files remain untracked.

## 7. Blocked by marketplace permissions

| Provider                  | Status        | Why it cannot be integrated yet                                                                    |
| ------------------------- | ------------- | -------------------------------------------------------------------------------------------------- |
| Amazon India              | pending       | Associates/Creators terms bar price tracking and restrict comparison use without written approval. |
| Flipkart                  | pending       | Affiliate API terms prohibit use in a similar or competitive platform; clarification required.     |
| Croma / Reliance / Myntra | not requested | No public price API identified; terms unanswered.                                                  |

Unchanged from the feasibility spike: **no scraping, no scraping vendors, no invented credentials or
endpoints.** The disabled adapters make that visible in the API instead of hiding it.

## 8. Recommended next sprint

1. **Snapshot persistence + price history** (MongoDB): store validated snapshots, which unlocks the
   trend chart, `GET /products/:id/history`, and a cache in front of metered provider calls.
2. **Catalogue ingestion with a licensed source** so product identity stops being demo-owned — the
   only path to a real comparison, and it is gated on the same permissions.
3. **Permission-gated provider adapter** the moment written approval exists: one adapter, one
   registry flag, plus adapter-level tests against recorded fixtures (never live calls in CI).
4. **Track the permission status as data** (`docs/MARKETPLACE_INTEGRATIONS.md` → `/sources`) so
   enabling a provider is a reviewed config change rather than a code edit.
