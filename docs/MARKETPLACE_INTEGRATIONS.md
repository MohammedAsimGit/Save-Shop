# Marketplace Integrations — status and constraints

**Nothing in this document describes an existing integration. No marketplace integration is
implemented. No marketplace credentials exist. No marketplace has been contacted or has approved
access to this project.**

Sprint 0 deliberately stops before any external commerce integration. This file records the
constraints that must be satisfied before Sprint 1 work on ingestion can begin.

## 1. Current state

| Item                                    | Status                                                      |
| --------------------------------------- | ----------------------------------------------------------- |
| Marketplace integration code            | Not implemented                                             |
| Marketplace API access / approval       | Not requested, not granted                                  |
| API keys, tokens, affiliate ids         | Not obtained (`.env.example` contains placeholders only)    |
| Marketplaces registered in the database | None (no `Marketplace` documents exist)                     |
| Product data / prices in the system     | None. No sample prices, no fixtures, no fabricated listings |
| Terms-of-service review                 | Not done                                                    |
| Server-side price ingestion job         | Not implemented                                             |

## 2. Why prices are never invented

A price comparison product is only useful if every number is sourced and attributable. A fabricated
or stale price can cause a shopper to make a purchase decision on false information and, where
affiliate commissions are involved, amounts to a misrepresentation of the merchant's offer.

Therefore:

- No fixture, seed script, mock API or UI placeholder may contain a "real looking" product price.
- Every price must eventually carry a `source` (`marketplace_api` | `affiliate_feed` |
  `manual_entry`) and a `capturedAt` timestamp (`packages/shared/src/types/catalog.ts`).
- UI must show the observation time next to a price once real data exists.
- If a marketplace cannot be accessed legitimately, its listings are simply absent from the
  comparison — not estimated.

## 3. Access channels that must be investigated (per marketplace)

For each marketplace, in this order:

1. **Official API / seller API** — is a product + price endpoint available, in which countries,
   with which rate limits and commercial terms?
2. **Official affiliate/partner feed** — do the terms permit displaying prices and caching them,
   and for how long may a cached price be shown?
3. **Licensed data provider** — a third-party aggregator, if direct access is unavailable.
4. **Manual entry / editorial curation** — allowed but must be labelled as such.

Explicitly **not** acceptable: scraping a marketplace in violation of its terms, reusing another
company's data without a licence, or bypassing authentication/robots restrictions.

## 4. Questions that must be answered before implementation

- Which marketplaces and which countries are in scope for the first release?
- Does each provider expose product identifiers (GTIN/EAN/ASIN-style ids) that permit matching?
- What are the rate limits, quota costs and caching/attribution requirements?
- Do terms permit showing a price on a comparison page? For how long?
- Are affiliate links permitted, and what disclosure is legally required in the target markets?
- Is a written agreement required before production traffic?
- What is the required refresh cadence, and what staleness is acceptable to users?
- Which party is liable for incorrect prices shown to users?

Until these are answered, the integration layer stays empty. `apps/api/src/services/` is the
designated home for adapters, and the shared marketplace types already exist as a target shape
(they are types only, not a claim about any provider's actual API).

## 5. Hardening rules for the future integration layer

- Credentials only in server-side environment variables, validated at boot; never in a client
  bundle and never with a `VITE_`/`EXPO_PUBLIC_` prefix.
- One adapter per marketplace behind a common interface, so a provider change cannot ripple through
  the domain layer.
- Timeouts, bounded retries with backoff, and circuit breaking around each provider call.
- Store raw provider responses (or a hash + timestamp) for dispute resolution and debugging.
- Every stored price records its source and observation time; "unknown" is a valid state.
- Attribution and disclosure requirements are part of the UI contract, not an afterthought.

## 6. What Sprint 0 does provide

- A REST API surface and shared contracts to hang integrations off.
- A server-side configuration/validation layer ready to receive new provider variables.
- A database connection plus a documented data model for listings and price snapshots.
- A documented, explicit statement that no integration exists — so no one mistakes the foundation
  for a working comparison product.
