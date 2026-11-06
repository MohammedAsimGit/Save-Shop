# Ingestion Feasibility Spike — Amazon India, Flipkart and third-party price data

**Date:** 6 November 2026
**Status:** desk research only. No marketplace was contacted, no API key exists, no scraper was
written, no integration code was added, and the Sprint 1 UI was not modified. Every claim below
cites the page it came from; anything unverified is marked as such. The load-bearing clauses (§2.2,
§3.2) were re-read directly from the marketplaces' own pages while writing this, not taken from
secondary reporting.

**Verdict: CONDITIONAL GO** — build the ingestion layer, but only on sources that grant permission in
writing, starting with Flipkart's affiliate feed plus a licensed Amazon-data decision. Do **not**
build on scraping, and do not ship price alerts for Amazon until Amazon's policy question is settled.

---

## 0. Executive summary

| Channel                                                               | Verdict                                                     | One-line reason                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Amazon India — Associates **Creators API** (PA-API 5 is retired)      | **NO-GO** for a comparison product without written approval | amazon.in participation rules bar "price tracking and/or price alerting" sites, cap cached content at 24 h, and the IP licence forbids aggregating/repurposing Product Advertising Content without express written approval. Access also needs 10 qualifying sales in a rolling 30 days.  |
| Amazon India — **Keepa** licensed price database                      | **CONDITIONAL GO** (Amazon coverage only)                   | Keepa's terms expressly licence re-display of its data — including price histories, charts and alerts — to your own end users. It is Amazon-only, has no accuracy warranty, and costs €49+/mo.                                                                                            |
| Flipkart — **official Affiliate API**                                 | **CONDITIONAL GO**                                          | An official product feed exists and the FAQ names comparison shopping as a use, but the API Terms bar use in a "similar or competitive platform" and the Affiliate Agreement says prices may only be shown "when we serve the link". Written clarification is required before production. |
| Flipkart — Seller API                                                 | **NO-GO**                                                   | Seller/partner API for managing authorised sellers' own listings; no documented route to competitors' prices.                                                                                                                                                                             |
| Scraping amazon.in / flipkart.com (directly or via a scraping vendor) | **NO-GO**                                                   | Both marketplaces' terms prohibit automated extraction; vendors shift operational risk, not legal risk.                                                                                                                                                                                   |
| Other Indian retailers (Croma, Reliance Digital, Myntra)              | **UNKNOWN — pursue partnership**                            | No public buyer-side product/price API was verified in this spike.                                                                                                                                                                                                                        |

**What that means for Sprint 2:** build the adapter/snapshot architecture and one _authorised_ source,
not a broad comparison grid. The defining constraint is not engineering — it is permission.

---

## 1. Method and scope

- Desk research on official documentation, terms and public pricing pages (URLs throughout).
- Focus marketplaces: **amazon.in** and **flipkart.com**; currency INR.
- Questions answered: eligibility and registration, pricing, limitations, freshness, caching/caching
  rights, and what a comparison site is allowed to display.
- Out of scope: contacting providers, legal advice, credential procurement, code.

The existing constraints in [MARKETPLACE_INTEGRATIONS.md](MARKETPLACE_INTEGRATIONS.md) still hold:
every price must carry a `source` and `capturedAt`, and no fabricated price may ever enter the system.

---

## 2. Amazon India

### 2.1 Which API, and is it open?

- **Product Advertising API 5.0 is deprecated.** Amazon's Creators documentation states PA-API 5 calls
  now fail with HTTP 403 `AccessDeniedException`; the EU PA-API FAQ lists **15 May 2026** as retirement.
  ([deprecation notice](https://affiliate-program.amazon.in/creatorsapi/docs/en-us/paapiv5-deprecation),
  [EU FAQ](https://webservices.amazon.eu/paapi5/documentation/faq.html))
- **Creators API** is the successor and does cover amazon.in (locale reference: `www.amazon.in`, INR).
  ([India locale](https://affiliate-program.amazon.in/creatorsapi/docs/en-us/locale-reference/india))
- **Eligibility ladder:**
  1. Amazon Associates account, finally accepted. Amazon India reviews an application after **3
     qualifying sales in the first 180 days**; personal orders do not count, and a failed application
     can mean the Associates ID is never reinstated
     ([application review](https://affiliate-program.amazon.in/help/node/topic/G8TW5AE9XL2VX9VM)).
  2. API access needs **10 qualifying sales in the trailing 30 days** and credentials from Associates
     Central ([registration](https://affiliate-program.amazon.in/creatorsapi/docs/en-us/onboarding/register-for-creators-api),
     [API rates](https://affiliate-program.amazon.in/creatorsapi/docs/en-us/concepts/api-rates)).
  3. Access **lapses** after 30 consecutive days without a referring sale — a quiet month can break a
     production integration ([account dormancy](https://affiliate-program.amazon.in/help/node/topic/G7MJTPEP9NC3YKMG)).
- **Rate limits:** first 30 days up to 1 req/s and 8,640 requests/day, then revenue-based.

### 2.2 The policy problem (decisive for SaveShop)

- amazon.in **participation requirement #31**, read directly from Amazon's page: "Unless otherwise
  agreed by Amazon, your site must not have price tracking and/or price alerting functionality"
  ([policies](https://affiliate-program.amazon.in/help/operating/policies)). That single sentence
  collides with the planned tracking feature.
- **Caching:** non-image Product Advertising Content may be cached for **at most 24 hours**; images may
  not be cached at all (only a URL for 24 h). Creators API guidance recommends a **1-hour Offers TTL**,
  and requires a visible date/time stamp when data is stale or refreshed less than hourly
  ([agreement/IP licence](https://affiliate-program.amazon.in/help/operating/agreement),
  [best practices](https://affiliate-program.amazon.in/creatorsapi/docs/en-us/concepts/best-programming-practices)).
- **Comparison display rules:** when Amazon prices appear beside comparable products from other sites,
  Amazon's **lowest new price** (and lowest used price, if supplied) must be shown, plus a date/time
  stamp and the prescribed "prices and availability are accurate as of…" disclaimer
  ([linking requirements](https://affiliate-program.amazon.in/help/operating/linking), Operating
  Agreement §11).
- **Aggregation restriction**, verbatim from the Associates Program IP Licence: you will not, "without
  our express prior written approval, access or use the Product Advertising API or Data Feed for the
  purpose of aggregating, analyzing, extracting, or repurposing any Product Advertising Content"
  ([Operating Agreement §11](https://affiliate-program.amazon.in/help/operating/agreement)). The same
  section adds that the API may not be used with any site "that does not have the principal purpose of
  advertising and marketing the Amazon Site and driving sales". A multi-retailer comparison database is
  precisely the case this language is pointing at.
- In short: the Associate API is designed to send buyers to Amazon, not to feed a cross-retailer price
  database. **A comparison product needs Amazon's written approval — this is the single highest-risk
  dependency in the whole roadmap.**

### 2.3 Selling Partner API (SP-API)

- It is a **seller/vendor** API: apps act for an authorising selling partner. Public developer
  registration does _not_ require a Professional seller account, but the app must be registered, roles
  approved, and sellers must OAuth-authorise it; Appstore listing and security review apply for public
  apps ([registration](https://developer-docs.amazon.com/sp-api/docs/sp-api-registration-overview),
  [public developer](https://developer-docs.amazon.com/sp-api/docs/register-as-a-public-developer)).
- The AUP forbids aggregating an authorised seller's data to give it to third parties
  ([policies](https://developer-docs.amazon.com/sp-api/docs/policies-and-agreements)). Pricing data is
  exposed inside a seller-authorised pricing workflow, not as a public competitor-price feed.
- **Verdict: not a route to a consumer comparison catalogue.**

### 2.4 Other Amazon routes

- **Ads API** — advertiser campaign management; product metadata only for the advertiser's own catalogue.
- **AWS Data Exchange** — third-party datasets; the listings reviewed were US-scoped and carry their own
  licences. No verified amazon.in price dataset found. An AWS listing is not Amazon approval.
- **Amazon Data Feed** — requires Amazon's express prior written approval per the Operating Agreement.

---

## 3. Flipkart

### 3.1 Official Affiliate API — the most plausible route

- An official programme and API exist, with product/category feeds, delta feeds, search and feed
  downloads. Fields include MRP, selling price and availability
  ([overview](https://affiliate.flipkart.com/api-docs/af_overview.html),
  [product reference](https://affiliate.flipkart.com/api-docs/af_prod_ref.html)).
- Registration: become a Flipkart affiliate, generate an Affiliate API token, send tracking id + token in
  headers ([registration](https://affiliate.flipkart.com/api-docs/af_register.html)).
- **Operational limits:** **20 API calls/s per affiliate**; feed URLs expire after **10 hours**;
  standard feed responses hold **500 products per request** ([FAQ](https://affiliate.flipkart.com/api-docs/af_faq.html)).
- The FAQ explicitly presents comparison shopping as the point of the API: "APIs are a better
  alternative than Web crawling… it can be used by e-Commerce Websites to enable their users to do
  comparison shopping by providing comparitive product features, prices, etc."
  ([FAQ](https://affiliate.flipkart.com/api-docs/af_faq.html)).

### 3.2 The terms conflict that must be resolved in writing

- **API Terms of Use**, verbatim: you agree not to "Use it in a similar or competitive platform"
  ([ToU](https://affiliate.flipkart.com/api-docs/af_tou.html)).
- **Affiliate Operating Agreement:** "your site may only show prices when we serve the link in which
  those prices are displayed", and content must be deleted promptly when no longer displayed or
  authorised ([agreement](https://affiliate.flipkart.com/terms-and-conditions)).
- No published "cache prices for N hours" permission exists; the 10-hour figure is feed-URL expiry, not
  a display licence.
- **Implication:** an independent multi-retailer comparison page is exactly the ambiguous case. Do not
  build a price database and price-history feature on the FAQ sentence alone.

### 3.3 Seller API and scraping

- Seller API serves a seller's own listings/orders, or approved partners acting for authorising sellers;
  no documented access to competitors' prices
  ([seller API docs](https://seller.flipkart.com/api-docs/FMSAPI.html)).
- Flipkart's Platform Terms prohibit "deep-link, page-scrape, robot, spider or other automatic device"
  access to obtain content "not purposely made available", and copying content for a commercial
  enterprise without prior written consent ([terms](https://www.flipkart.com/pages/terms)).

### 3.4 Affiliate networks (Cuelinks, INRDeals, EarnKaro, Admitad, vCommission, Optimise, iCubesWire)

None of these was verified as a general live product-price feed covering both Amazon India and
Flipkart:

| Network         | Verified position                                                                                                                                                                                                                                                                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cuelinks**    | Explicitly states its API **does not provide merchant product feeds** — campaigns, links, transactions, offers only ([help](https://cuelinks.zohodesk.com/portal/en/kb/articles/what-are-cuelinks-apis)).                                                                                                                                                        |
| **INRDeals**    | Advertises Store/Deal APIs and merchant API for "Super Affiliates"; a complete live product-price catalogue for both retailers was **not** verifiable. Requires a publisher's own Amazon Associates account for Amazon earnings ([publisher](https://inrdeals.com/publisher), [Amazon campaign](https://inrdeals.com/campaigns/amazon-india-affiliate-program)). |
| **EarnKaro**    | Publisher-facing deals/profit links; no documented developer price API ([FAQ](https://earnkaro.com/faq)).                                                                                                                                                                                                                                                        |
| **Admitad**     | Product feeds exist per programme with ~6 h refresh, and comparison services are a stated use — but no verified current Amazon India or Flipkart feed (their Amazon listing is inactive) ([publisher](https://www.admitad.com/affiliates/), [Amazon listing](https://www.admitad.com/store/offers/amazon-associates-affiliate)).                                 |
| **vCommission** | Amazon campaigns and Flipkart-owned **Shopsy** verified; no verified full Flipkart/Amazon price feed ([FAQ](https://www.vcommission.com/faq/)).                                                                                                                                                                                                                  |
| **Optimise**    | Product feeds with price fields documented, daily catalogue import — availability for these two retailers unverified ([feeds](https://docs.optimisemedia.com/docs/advertisers/getting-started/publisher-content/advertiserproductfeeds/)).                                                                                                                       |
| **iCubesWire**  | Product-feed feature and Affiliate API exist; no public price-feed schema verified ([API collection](https://documenter.getpostman.com/view/14103332/TzeRpq22)).                                                                                                                                                                                                 |

Networks are useful for **link conversion and attribution**, not as a price source.

---

## 4. Third-party price-data providers

Two categories, and the distinction is the whole legal argument:

- **Licensed data** — the vendor owns a collected database and licenses re-display to you.
- **Managed scraping** — the vendor runs crawlers on your behalf; you remain the party extracting from
  a site whose terms forbid it.

| Provider                  | amazon.in                            | Flipkart                                    | Public entry price / quota                                | ≈300k lookups/mo                                  | Freshness                                                                   | Type                                        | Indemnity                                                  |
| ------------------------- | ------------------------------------ | ------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| **Keepa**                 | yes (11 marketplaces incl. IN)       | no                                          | €49/mo = 20 tokens/min (~892k tokens/mo)                  | €49 tier covers ~300k products                    | Continuous Amazon DB, history back to 2011; explicitly no currency warranty | **Licensed**                                | none; accuracy disclaimed                                  |
| **Bright Data**           | yes                                  | yes (dedicated Flipkart scrapers + dataset) | free 5k records/mo; $1.50/1k PAYG; **$499/mo** incl. 384k | $499                                              | real-time (API) or scheduled (datasets)                                     | Managed scraping (+ pre-collected datasets) | customer indemnifies vendor; cap = 1 month fees            |
| **Oxylabs**               | yes                                  | yes (`flipkart_product/search`)             | $15/mo credit; $0.50/1k → $0.35/1k at $500                | ≈$135 at $0.45/1k                                 | real-time, per successful result                                            | Managed scraping                            | customer indemnifies vendor                                |
| **Apify**                 | yes (IN actors)                      | yes (community actors)                      | free $5/mo; $19/mo starter; ~$1–5/1k results              | ≈$300 (Flipkart) + ≈$720 (Amazon) at listed rates | per-run, `scrapedAt` per record                                             | Managed scraping                            | none; actors say respect ToS                               |
| **SerpApi**               | yes (`amazon_domain=amazon.in`)      | **no**                                      | free 250/mo; $25/mo = 1k; $75/5k; $150/15k                | $2,750 (500k)                                     | live per call, 1 h response cache                                           | Managed scraping                            | **US Legal Shield up to $2M** from $150/mo, US courts only |
| **DataForSEO (Merchant)** | yes (location 2356)                  | **no**                                      | PAYG $0.0015/product standard                             | $450 standard / $1,500 live                       | standard queue up to 45 min; priority/live ≤1 min                           | Managed scraping                            | none published                                             |
| **Unwrangle**             | yes (`country_code=in`, 2.5 credits) | **no**                                      | $99/mo = 100k credits                                     | $499                                              | real-time                                                                   | Managed scraping                            | none published                                             |
| **PriceAPI**              | yes                                  | **no**                                      | €99/mo = 5k credits                                       | €1,499 (Pro, 500k)                                | real-time, up to 4×/hour per product                                        | Managed scraping                            | none published                                             |
| **Zenserp**               | no product engine                    | no                                          | $49.99/mo = 25k searches                                  | Google Shopping only                              | <500 ms claimed                                                             | Managed scraping                            | none                                                       |

**Reading of the table**

1. **No licensed feed covers both marketplaces.** Only Keepa is licensed, and it is Amazon-only.
2. **Everything else is managed scraping**, and Amazon.in's Conditions of Use plus Flipkart's Platform
   Terms prohibit exactly that extraction. Vendors re-route operations, not liability: Bright Data and
   Oxylabs indemnities run _from customer to vendor_; only SerpApi offers a financial shield, limited to
   US courts.
3. **Keepa is the one defensible Amazon path.** Its terms (§18(7)) expressly allow retrieving, storing,
   caching and displaying data — including price histories, charts and **alerts** — in your own product,
   free or paid, while prohibiting a substitute data service or removing attribution
   ([T&C](https://keepa.com/cdn/terms/2026-08-27-terms.txt), [API pricing](https://keepa.com/api/pricing)).
   It is business-only and disclaims accuracy/currency, so the UI must timestamp every price.
4. **Costs are not the blocker.** A pilot costs €49/mo (Keepa) plus roughly $15–135/mo (Oxylabs) or $499
   (Bright Data) — small against the legal exposure of scraping two marketplaces whose terms forbid it.

---

## 5. What this means technically

If the CONDITIONAL GO holds, the ingestion layer should be built so that permission changes are cheap:

- **Adapter per source** behind one interface (`SourceAdapter`), with `source`, `capturedAt`, `ttlSeconds`
  and `attribution` on every record — the shared types already anticipate this shape.
- **Snapshot store**, not a scraped history. Keep every observation with its timestamp; never backfill
  history from an unauthorised source.
- **Freshness contract in the API**, so the UI can say "observed 12 min ago" and grey out anything past
  its TTL. Amazon's 24 h ceiling / 1 h guidance and Flipkart's permitted display window both become
  per-source TTL config, not hard-coded UI text.
- **A "coverage" endpoint** so the site can honestly show which marketplaces are live, rather than
  pretending five are.
- **Feature gating:** price alerts and price history are separate capabilities. Amazon's participation
  rules make alerts a policy question; Flipkart's terms make retention a policy question. Ship neither
  until the written answers exist.

---

## 6. Decisions required before Sprint 2

| #   | Decision                                                                                                                                                                                                                                             | Owner         | Blocks                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------- |
| D1  | Send Flipkart (affiliate + partnerships) a written question: may an independent multi-retailer comparison site cache and display Flipkart prices, with what refresh and retention, and does the "similar or competitive platform" clause exclude us? | founder       | Flipkart ingestion               |
| D2  | Decide Amazon strategy: (a) request written approval for the comparison use, (b) license Keepa for Amazon display, or (c) launch without Amazon                                                                                                      | founder       | Amazon column, alerts            |
| D3  | If (b): confirm Keepa plan tier and that our display model satisfies §18(7) attribution rules                                                                                                                                                        | founder + eng | Amazon prices                    |
| D4  | Confirm the launch marketplace set and whether "no Amazon" is an acceptable v1                                                                                                                                                                       | founder       | product scope, premium messaging |
| D5  | Decide alert/tracking policy per source (Amazon excludes alerts until approved)                                                                                                                                                                      | founder       | Sprint 2 feature list            |

### Questions to put in writing

- **Flipkart:** May a third-party comparison site display Flipkart prices next to other retailers?
  Maximum cache/retention per price? Is a visible "as of" timestamp sufficient? Are price-history charts
  and price-drop alerts permitted? What attribution/disclosure is required?
- **Amazon:** Is a price-comparison use case permitted under the Associates IP licence, and if so under
  what written terms? Can alerts be excluded from Amazon items to satisfy participation rule #31?
- **Keepa:** confirm commercial-tier entitlement for a consumer-facing comparison service and the
  attribution requirements.

---

## 7. Recommendation

**CONDITIONAL GO.** Proceed to Sprint 2 with a deliberately narrow, permission-first scope:

1. **Start with Flipkart**, contingent on D1. Its affiliate API is the only official, documented,
   product-and-price feed among the two, with an FAQ that names comparison shopping as a use — the
   closest thing to a green light without a signature.
2. **Do not scrape**, and do not buy managed-scraping output for amazon.in or flipkart.com. The
   contracts are explicit, and a comparison product is the most visible possible target.
3. **For Amazon, either get written approval or license Keepa** (D2). Keepa is the only provider whose
   terms actually license re-display of Amazon prices, and it costs €49/mo at pilot volume.
4. **Ship alerts only where permitted.** Amazon's rules and Flipkart's retention ambiguity both point at
   the same engineering choice: keep tracking a gated capability with per-source policy flags.
5. **Keep the UI honest** — a coverage panel listing which marketplaces are authorised, and a per-price
   observation timestamp. Both already fit the Sprint 1 component set; no redesign is needed.

Revisit this verdict the moment either marketplace answers. If both say no, the honest options are
(a) launch with retailers that do grant permission, (b) launch as an editorial "verified price" product
with manual, attributed observations, or (c) stop — but not scrape.

---

## 8. Sources read

Amazon India

- https://affiliate-program.amazon.in/help/node/topic/G8TW5AE9XL2VX9VM
- https://affiliate-program.amazon.in/help/node/topic/G7MJTPEP9NC3YKMG
- https://affiliate-program.amazon.in/help/node/topic/GVJ2BJP35457CLML
- https://affiliate-program.amazon.in/creatorsapi/docs/en-us/introduction
- https://affiliate-program.amazon.in/creatorsapi/docs/en-us/onboarding/register-for-creators-api
- https://affiliate-program.amazon.in/creatorsapi/docs/en-us/concepts/api-rates
- https://affiliate-program.amazon.in/creatorsapi/docs/en-us/concepts/best-programming-practices
- https://affiliate-program.amazon.in/creatorsapi/docs/en-us/locale-reference/india
- https://affiliate-program.amazon.in/creatorsapi/docs/en-us/paapiv5-deprecation
- https://affiliate-program.amazon.in/help/operating/agreement
- https://affiliate-program.amazon.in/help/operating/linking
- https://affiliate-program.amazon.in/help/operating/policies
- https://developer-docs.amazon.com/sp-api/docs/sp-api-registration-overview
- https://developer-docs.amazon.com/sp-api/docs/register-as-a-public-developer
- https://developer-docs.amazon.com/sp-api/docs/product-pricing-api
- https://developer-docs.amazon.com/sp-api/docs/policies-and-agreements
- https://developer-docs.amazon.com/sp-api/docs/store-identifiers
- https://advertising.amazon.com/about-api
- https://aws.amazon.com/data-exchange/faqs/

Flipkart and Indian affiliate networks

- https://affiliate.flipkart.com/api-docs/af_overview.html
- https://affiliate.flipkart.com/api-docs/af_prod_ref.html
- https://affiliate.flipkart.com/api-docs/af_faq.html
- https://affiliate.flipkart.com/api-docs/af_register.html
- https://affiliate.flipkart.com/api-docs/af_tou.html
- https://affiliate.flipkart.com/terms-and-conditions
- https://affiliate.flipkart.com/faqs
- https://www.flipkart.com/pages/terms
- https://seller.flipkart.com/api-docs/FMSAPI.html
- https://cuelinks.zohodesk.com/portal/en/kb/articles/what-are-cuelinks-apis
- https://inrdeals.com/publisher
- https://inrdeals.com/campaigns/amazon-india-affiliate-program
- https://earnkaro.com/faq
- https://www.admitad.com/affiliates/
- https://www.vcommission.com/faq/
- https://docs.optimisemedia.com/docs/advertisers/getting-started/publisher-content/advertiserproductfeeds/
- https://partners.icubeswire.co/auth/termsAndConditions

Third-party providers

- https://keepa.com/api-docs
- https://keepa.com/api/pricing
- https://keepa.com/cdn/terms/2026-08-27-terms.txt
- https://brightdata.com/products/web-scraper/flipkart
- https://brightdata.com/license
- https://oxylabs.io/products/web-api/scrape/pricing
- https://oxylabs.io/legal/oxylabs-general-conditions
- https://apify.com/pricing
- https://serpapi.com/pricing
- https://serpapi.com/us-legal-shield
- https://dataforseo.com/pricing/merchant/amazon-api
- https://www.unwrangle.com/platforms/
- https://www.priceapi.com/pricing
- https://zenserp.com/pricing-plans/
