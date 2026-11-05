# Project Overview

## Problem statement

Shoppers in markets with many competing storefronts pay different prices for the same product at
the same moment. Comparing them means opening several apps, handling inconsistent product titles,
and manually judging whether a listing is the same item, the same variant, and still in stock. The
result is time spent, missed savings, and no reliable sense of whether a price is actually good.

## Objective

Build a price intelligence platform that lets a shopper:

1. search once for a product,
2. see the same product across participating marketplaces side by side,
3. identify the lowest **verified** current price,
4. and be redirected to that seller with a clear indication of when the price was observed.

## Target users and surfaces

- Mobile-first shoppers (Android/iOS) who compare while standing in a shop.
- Desktop/tablet users doing research before a purchase.
- One shared backend and one shared contract, so a future native app reuses the same API.

## Planned capability set

| Area                    | Description                                                      | Sprint                 |
| ----------------------- | ---------------------------------------------------------------- | ---------------------- |
| Foundation              | Monorepo, web/mobile/API shells, shared contracts, docs, tooling | **0 (done)**           |
| Product search          | Query the catalogue, ranked results                              | 1+                     |
| Marketplace integration | Authorised price/listing ingestion per provider                  | TBD, blocked on access |
| Product matching        | Deduplicate the same item across providers                       | TBD                    |
| Price comparison        | Lowest verified price, freshness, availability                   | TBD                    |
| Price history           | Snapshots and trends                                             | TBD                    |
| Wishlist + alerts       | Save products, target price notifications                        | TBD                    |
| Accounts                | Firebase Authentication                                          | TBD                    |
| Premium subscription    | Paid tier with extra features                                    | TBD                    |
| Advertising             | Sponsored slots, clearly labelled                                | TBD                    |
| Affiliate tracking      | Click attribution for commissions                                | TBD                    |
| Admin                   | Catalogue/marketplace management, review queue                   | TBD                    |

Sprint numbers beyond 0 are indicative; the order will be re-planned once marketplace access is
known, because ingestion feasibility drives the whole product.

## Business model (planned, not implemented)

- Affiliate commissions on outbound clicks.
- Advertising placements, always visually distinct from organic results.
- Premium subscription for advanced features (alerts, history depth, ad-free).

No pricing, commission rate or ad product has been agreed; nothing in the codebase represents these
as working functionality.

## Non-goals for the first release

- Selling products directly or handling payments for goods.
- Cross-border currency conversion.
- Automated purchasing or checkout.
- Unlicensed scraping of marketplace content.

## Success criteria (to be measurable later)

- A user finds a product and a cheaper verified alternative in under 30 seconds.
- Every displayed price has a source and an observation timestamp.
- No displayed price is older than the provider's terms allow.
- Zero fabricated or estimated prices in any environment, including demos.

## Honest status

The repository currently contains a Sprint 0 foundation: three applications that start, a health
endpoint, shared contracts and documentation. It does **not** contain product search, comparison,
authentication or any marketplace integration.
