# Database Design (planned)

Status: **design only.** No Mongoose schema, collection or index exists yet, and no data has been
inserted. Sprint 0 configures the connection only.

## 1. Core distinction: product vs variant vs listing

| Concept            | Meaning                                                                                                                      | Owned by                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **Product**        | The abstract thing a shopper searches for ("Sony WH-1000XM5"). Independent of any shop.                                      | Platform                          |
| **ProductVariant** | A concrete purchasable variation of a product (colour, size, capacity). Carries the identifiers that make matching possible. | Platform                          |
| **ProductListing** | A product/variant _as offered on one marketplace_, identified by that marketplace's own id and URL.                          | Marketplace (referenced by us)    |
| **PriceSnapshot**  | An immutable observation of a listing's price at a moment in time.                                                           | Platform (captured from a source) |

Prices live on **listings**, never on products. A product has no single price; it has one price per
listing per moment. Fabricating a "product price" would be misleading and is explicitly avoided.

## 2. Planned entities

| Entity               | Key fields                                                                                                      | Notes                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `User`               | `email` (unique), `displayName`, `authProviderId`, `createdAt`                                                  | `authProviderId` is the Firebase UID; no password is ever stored here    |
| `Product`            | `title`, `brand`, `category`, `imageUrls[]`, `identifiers{gtin?,mpn?}`                                          | canonical record                                                         |
| `ProductVariant`     | `productId`, `title`, `attributes{}`, `identifiers{gtin?,mpn?}`                                                 | unique per `productId + attribute hash`                                  |
| `Marketplace`        | `slug` (unique), `displayName`, `isActive`                                                                      | seeded manually once access is approved; slugs must be real, not guessed |
| `ProductListing`     | `productId`, `variantId?`, `marketplaceId`, `externalId`, `url`, `sellerName?`, `availability`, `lastCheckedAt` | unique on `marketplaceId + externalId`                                   |
| `PriceSnapshot`      | `listingId`, `price{amountMinor,currency}`, `availability`, `capturedAt`, `source`                              | append-only, time-series                                                 |
| `Wishlist`           | `userId`, `productId`, `variantId?`, `targetPrice?`                                                             | unique on `userId + productId + variantId`                               |
| `Subscription`       | `userId`, `tier`, `status`, `currentPeriodEnd`                                                                  | one active per user                                                      |
| `AffiliateClick`     | `userId?`, `listingId`, `marketplaceId`, `occurredAt`, `campaignId?`                                            | for commission attribution                                               |
| `AdvertisementEvent` | `slot`, `campaignId`, `eventType` (`impression`/`click`), `occurredAt`                                          | no personal data beyond a pseudonymous id                                |

## 3. Proposed indexes (to be created with the schemas)

- `User.email` — unique.
- `Marketplace.slug` — unique.
- `ProductListing`: compound unique `(marketplaceId, externalId)`; `(productId, marketplaceId)` for
  comparison queries.
- `PriceSnapshot`: `(listingId, capturedAt desc)` for "latest price" and history charts;
  TTL/archival policy TBD (see retention).
- `Wishlist`: unique `(userId, productId, variantId)`; `(userId)` for listing a user's wishlist.
- `Product`: text index on `title` (search), plus `identifiers.gtin` when present.
- `AffiliateClick`: `(listingId, occurredAt)` and `(userId, occurredAt)`.

Indexes are only added once the query they serve is written; guessing indexes costs write
throughput for no benefit.

## 4. Data ownership and access

- Every client request is scoped to the authenticated user; user-owned documents
  (`Wishlist`, `Subscription`) are filtered by `userId` from the verified token, never from a
  client-supplied id.
- Catalogue, listings and snapshots are platform-owned read-mostly data, written only by server
  jobs.
- `AffiliateClick` and `AdvertisementEvent` are written by the server; users can never edit them.

## 5. Data retention

| Data                 | Proposed retention                                        | Reason                        |
| -------------------- | --------------------------------------------------------- | ----------------------------- |
| `PriceSnapshot`      | keep raw for ~12 months, then downsample to daily min/max | storage cost vs history value |
| `AffiliateClick`     | 13–25 months depending on programme requirements          | commission audit windows      |
| `AdvertisementEvent` | 90 days raw, aggregates kept                              | analytics sufficient          |
| Deleted accounts     | purge user-owned docs within 30 days                      | privacy expectations          |

Exact windows must be confirmed against the affiliate programmes' terms and applicable privacy
law before launch (open question).

## 6. Duplicate-product risk

The same physical product will appear under different titles, bundles and identifiers across
marketplaces. Risks:

1. **False merge** — two different products treated as one, showing a wrong "cheapest" price.
2. **Duplicate split** — the same product stored twice, splitting price history and hurting UX.

Mitigation plan: match on exact `gtin` first, then `mpn` + brand, then normalised title similarity
as a _review candidate_ only. An ambiguous match must never silently redirect a shopper to the
wrong item; Sprint 1+ will require a confidence threshold plus an admin review path.

## 7. Money handling

`{ amountMinor: integer, currency: ISO-4217 }` everywhere. No floats, no strings-with-symbols.
Currency conversion is out of scope; comparisons only happen within one currency.

## 8. Explicit non-goals for Sprint 0

- No collections created, no seed data, no fake prices.
- No marketplace identifiers invented; `externalId` values arrive only from an authorised
  integration.
- No schema migrations tooling decision yet (`migrate-mongo` vs a Mongoose-based migration runner).
