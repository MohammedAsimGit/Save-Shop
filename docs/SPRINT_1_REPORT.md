# Sprint 1 — Premium UI/UX & Responsive Frontend

**Status:** complete, verified locally.
**Scope:** visual foundation and frontend interactions only. No marketplace integration, no real
prices, no accounts, no advertising, no billing.

---

## 1. What was built

Sprint 1 replaces the Sprint 0 placeholder with a premium, responsive SaveShop interface on both
clients. The design language comes from the supplied reference image (light background, subtle
geometric texture, pill search, soft-shadow cards, horizontal rails, bottom navigation on mobile),
re-skinned for price intelligence rather than groceries.

Two decisions govern the whole sprint:

1. **One design system, two renderers.** Colour, spacing, radius and catalogue data live in
   `packages/shared`; the web expresses them as CSS custom properties (Tailwind v4 `@theme`) and
   mobile as a typed StyleSheet theme. The same role names exist on both sides, so a change lands in
   both clients at once.
2. **No invented facts.** Every product, offer, marketplace and price is sample data, labelled as
   such in the UI (`SAMPLE DATA` badge, demo notice, footer). Deal buttons are disabled because no
   outbound affiliate link exists yet.

---

## 2. Screens

### Web (`apps/web`, React + TypeScript + Vite + Tailwind v4 + React Router)

| Route          | Screen           | Highlights                                                                                                                                    |
| -------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`            | `HomePage`       | Hero with savings framing, search, promotional banner, category rail, marketplace rail, featured comparisons, sample-data disclosure          |
| `/search`      | `SearchPage`     | Query + category + marketplace + in-stock filters, four sort orders, result count, card grid, empty state                                     |
| `/product/:id` | `ProductPage`    | Product summary, lowest-price callout, per-marketplace comparison list with "Lowest" badge and savings, price history placeholder, cross-sell |
| `/tracking`    | `TrackingPage`   | Sample watchlist with current vs. target price and status badges, API health check, "what tracking will do"                                   |
| `/premium`     | `PremiumPage`    | Plan comparison, ad-free value proposition, disabled "not available yet" CTAs                                                                 |
| `/profile`     | `ProfilePage`    | Guest account summary, theme preference (light / dark / system), subscription / notifications / privacy rows, disabled sign-out               |
| `/signin`      | `SignInPage`     | Sign-in form that states clearly that authentication is not implemented                                                                       |
| `*`            | `NotFoundPage`   | 404 with a route back to the overview                                                                                                         |
| route error    | `RouteErrorPage` | Router-level error boundary                                                                                                                   |

### Mobile (`apps/mobile`, Expo + React Native + React Navigation)

Bottom tabs: **Home, Search, Tracking, Profile**; native stack pushes **Product**, **Premium**,
**Sign in** and **Diagnostics**.

| Screen              | Highlights                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `HomeScreen`        | Greeting header, avatar, search, promotional banner, category rail, marketplace rail, two-column product grid |
| `SearchScreen`      | Search, category chips, sort chips, result count, empty state                                                 |
| `ProductScreen`     | Product header, lowest price, per-marketplace offer rows, comparison CTA                                      |
| `TrackingScreen`    | Sample watchlist with current vs. target price, status pills, API health card                                 |
| `ProfileScreen`     | Theme selector, account rows, plan status                                                                     |
| `PremiumScreen`     | Plan cards and feature list                                                                                   |
| `SignInScreen`      | Sign-in UI with the same "not implemented" honesty as the web                                                 |
| `DiagnosticsScreen` | API base URL inspection (carried over from Sprint 0)                                                          |

Navigation stays on the existing React Navigation setup — Expo Router was not introduced.

---

## 3. Components and design system

### Web — `apps/web/src/components/ui` (19 files)

`Button.tsx` + `buttonStyles.ts`, `IconButton.tsx`, `SearchBar.tsx`, `ProductCard.tsx`,
`MarketplaceCard.tsx`, `PriceComparisonCard.tsx`, `PriceLabel.tsx`, `SectionHeader.tsx`,
`CategoryChip.tsx`, `Badge.tsx`, `PromotionalBanner.tsx`, `BottomNavigation.tsx`,
`DesktopNavigation.tsx`, `PageContainer.tsx`, `LoadingSkeleton.tsx`, `EmptyState.tsx`,
`DemoNotice.tsx`, `icons.ts`.

`LoadingSkeleton` is built but deliberately not wired into a screen yet: every surface renders local
sample data synchronously, so a skeleton would be theatre. It is there for the first genuinely
async catalogue fetch.

### Mobile — `apps/mobile/src/components` (9 files)

`Button.tsx`, `SearchBar.tsx`, `ProductCard.tsx`, `CategoryChip.tsx`, `SectionHeader.tsx`,
`PromotionalBanner.tsx`, `Card.tsx`, `StatusPill.tsx`, `DemoNotice.tsx`.

### Shared — `packages/shared`

- `src/theme/tokens.ts` — brand/ink/surface/line/status colours, spacing, radii, shadows, font scale.
- `src/demo/catalog.ts` — 7 categories, 5 marketplaces and 8 demo products with per-marketplace
  offers, plus `lowestOffer`, `rankedOffers`, `savingsAgainstList`, `searchProducts`,
  `filterProducts`, `DEMO_DATA_NOTICE`.
- `src/theme/` values are re-exported through `packages/shared/src/index.ts` so both clients import
  the same tokens.

Web tokens are mirrored as CSS custom properties in `apps/web/src/styles/index.css` (Tailwind v4
reads CSS, not TypeScript); the mirrored role names are documented in that file.

Typography is Inter, loaded from Google Fonts in `apps/web/index.html` with `display=swap` and a
`ui-sans-serif`/system fallback, so an offline or CSP-restricted environment still renders. No font
binaries are committed.

---

## 4. Files

### Created — web

```
apps/web/src/app/routes.tsx
apps/web/src/app/App.tsx                     (rewritten)
apps/web/src/theme/ThemeProvider.tsx
apps/web/src/theme/themeContext.ts
apps/web/src/layouts/RootLayout.tsx          (rewritten)
apps/web/src/components/ui/*.tsx|ts          (19 files, listed above)
apps/web/src/data/demoCatalog.ts
apps/web/src/lib/format.ts
apps/web/src/pages/HomePage.tsx              (rewritten)
apps/web/src/pages/SearchPage.tsx
apps/web/src/pages/ProductPage.tsx
apps/web/src/pages/TrackingPage.tsx
apps/web/src/pages/PremiumPage.tsx
apps/web/src/pages/ProfilePage.tsx
apps/web/src/pages/SignInPage.tsx
apps/web/src/pages/NotFoundPage.tsx          (rewritten)
apps/web/src/pages/RouteErrorPage.tsx
apps/web/src/styles/index.css                (rewritten)
apps/web/src/app/App.test.tsx                (rewritten)
```

### Created — mobile

```
apps/mobile/src/theme/index.ts               (rewritten)
apps/mobile/src/theme/ThemeProvider.tsx
apps/mobile/src/theme/useStyles.ts
apps/mobile/src/lib/format.ts
apps/mobile/src/components/*.tsx             (9 files, listed above)
apps/mobile/src/components/catalogueComponents.test.tsx
apps/mobile/src/screens/HomeScreen.tsx       (rewritten)
apps/mobile/src/screens/SearchScreen.tsx
apps/mobile/src/screens/ProductScreen.tsx
apps/mobile/src/screens/TrackingScreen.tsx
apps/mobile/src/screens/ProfileScreen.tsx
apps/mobile/src/screens/PremiumScreen.tsx
apps/mobile/src/screens/SignInScreen.tsx
apps/mobile/src/navigation/TabsNavigator.tsx
apps/mobile/src/navigation/RootNavigator.tsx (rewritten)
apps/mobile/src/navigation/types.ts          (rewritten)
apps/mobile/App.tsx                          (rewritten)
```

### Created — shared

```
packages/shared/src/demo/catalog.ts
```

### Modified

```
packages/shared/src/index.ts
packages/shared/src/theme/tokens.ts
apps/web/package.json          (+ lucide-react)
apps/mobile/package.json       (+ @react-navigation/bottom-tabs, lucide-react-native, react-native-svg)
package-lock.json
```

---

## 5. Dependencies installed

| Package                         | Workspace | Why                                                     |
| ------------------------------- | --------- | ------------------------------------------------------- |
| `lucide-react`                  | web       | Icon set used by navigation, cards and CTAs             |
| `@react-navigation/bottom-tabs` | mobile    | Bottom tab navigation for the four primary destinations |
| `lucide-react-native`           | mobile    | Same icon language as the web                           |
| `react-native-svg`              | mobile    | Peer dependency of `lucide-react-native`                |

Jest needed one config addition: `moduleNameMapper` points `lucide-react-native` at its CJS build,
because the package ships ESM-only for the `react-native` export condition that jest-expo resolves.

---

## 6. Interactions implemented

- Header search (web, `lg+`) submits to `/search?q=…`; the results page keeps the header field in
  sync with the URL, including back/forward navigation.
- Search page: free-text query, category filter, marketplace filter, in-stock toggle and four
  sort orders — all reflected in the URL (`q`, `category`, `marketplace`, `sort`, `inStock`) so
  results are linkable and reload-safe.
- Price comparison: cheapest in-stock offer is marked "Lowest", out-of-stock marketplaces stay
  visible but are never presented as the actionable price, savings are computed against list price.
- Theme switch (light / dark / system) on the web writes `data-theme` on `<html>`, persists to
  `localStorage` and follows the OS when set to system; exposed on the profile page and a header
  toggle. Mobile has the same three-way preference through React context (session-only).
- Product cards and rows navigate to `/product/:id`; category and marketplace tiles deep-link into
  filtered results.
- Navigation: desktop header links with active state, mobile bottom bar with active colour/weight,
  skip-to-content link, and a nav entry for every destination including Profile.
- Price tracking shows a sample watchlist (current lowest price vs. target, status badge) whose
  rows deep-link into the product page — labelled as a preview, not a saved watchlist.
- Empty states everywhere a filter can return nothing, with a "clear filters" escape hatch.
- Reduced-motion support: all animation collapses under `prefers-reduced-motion`.

---

## 7. Responsive verification

Measured in the live dev server through the DOM (screenshots could not be composited in this
environment — see known issues).

| Width      | Result                                                                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 360 × 800  | Single column, bottom bar visible, header brand + controls fit with no overlap (327 px of 343 px used), no horizontal scroll on `/`, `/search`, `/product` |
| 390 × 844  | One visible primary nav (bottom bar), no horizontal scroll on all 9 routes                                                                                 |
| 768 × 900  | Desktop nav appears with 5 links, ends at 579 px; sign-in ends at 727 px; no overlap, no scroll                                                            |
| 1024 × 900 | Header search visible and shrinks to 240 px, nav + controls end at 975 px of 1007 px                                                                       |
| 1280 × 900 | Content capped at 1180 px, product page intact                                                                                                             |
| 1440 × 950 | Bottom bar hidden, header search visible, content capped at 1180 px, no overflow                                                                           |

Dark theme verified live: `data-theme="dark"` sets body background to `#020617`, headings to
`#f8fafc`, and the preference survives a reload.

Live route smoke test: `/`, `/search?q=nike`, `/search?q=zzzz`, `/product/boat-airdopes-141`,
`/tracking`, `/premium`, `/profile`, `/signin`, `/nope` all render their own heading with no
horizontal overflow, no console errors and no failed requests. The empty-search state was also
driven through the header field (typing "noise cancelling" + Enter) and rendered the empty state
with a "Clear filters" escape hatch while the URL kept `q=noise%20cancelling`.

### Fixed during verification

- **`/profile` had no desktop entry point.** The bottom bar carries Profile on mobile, but the
  desktop header nav stopped at Premium, so the page was reachable only by typing the URL. Profile
  was added to `DesktopNavigation`, giving desktop the same four destinations plus Premium as
  mobile's bottom bar plus Premium.
- **In-stock "View deal" buttons were enabled but inert.** They are now disabled and explained
  (`DealLinkNote`), because no affiliate link exists to send anyone to.
- **Inter was declared but never loaded.** The type stack started with `Inter` while no stylesheet
  supplied it, so every browser silently rendered `system-ui`. The font is now linked in
  `index.html` with the fallback intact, and the page `theme-color` was corrected from a leftover
  teal to the brand green (`color-scheme` widened to `light dark` for form controls in dark mode).
- **Tracking was an empty state.** `/tracking` and the mobile `TrackingScreen` now show a labelled
  three-row sample watchlist (current lowest price vs. invented target, status badge) that links
  into the product screens, instead of only documenting the plan.

---

## 8. Build and quality gates

Run at the repository root on 2026-11-06:

| Command                | Result                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `npm run typecheck`    | Pass — shared, api, mobile, web (both web tsconfigs)                                           |
| `npm run lint`         | Pass — `eslint .` clean                                                                        |
| `npm run format:check` | Pass — Prettier clean                                                                          |
| `npm run test`         | Pass — 35 tests: api 21, mobile 6, web 5, shared 3                                             |
| `npm run build`        | Pass — shared + api + web; web bundle `index.js` 479 kB (146 kB gzip), CSS 44 kB (8.4 kB gzip) |

Mobile jest had to gain a component suite; it now covers `ProductCard` (cheapest offer is the
headline price, tile is screen-reader labelled, press emits the product id) and `SearchBar`
(submit emits the query, clear emits an empty string). RNTL 14 renders asynchronously, so the tests
await `render` and `fireEvent`.

---

## 9. Acceptance criteria

- [x] All Sprint 1 screens implemented (web 8 + error route, mobile 8).
- [x] Design tokens shared between web and mobile via `packages/shared`.
- [x] Reusable component library established on both clients.
- [x] Promotional banner, category rail, marketplace rail, product cards.
- [x] Search interactions work (query, category, marketplace, stock, sort, URL state).
- [x] Sorting and filtering operate on the shared mock catalogue.
- [x] Product navigation works on web and mobile.
- [x] Desktop navigation works.
- [x] Mobile bottom navigation works.
- [x] Profile UI implemented.
- [x] Premium UI implemented (no real subscription).
- [x] Sign-in UI implemented (no real authentication).
- [x] Price tracking UI implemented (no real price feed).
- [x] Responsive layouts verified at 360/390/768/1024/1280/1440.
- [x] Light theme implemented.
- [x] Dark theme foundation implemented and verified live.
- [x] No real marketplace integrations.
- [x] No fake live prices — all catalogue data is labelled sample data.
- [x] No real authentication.
- [x] No real billing.
- [x] TypeScript checks pass.
- [x] Linting, formatting and tests pass.
- [ ] Known issues documented — see below (documented, not open work).

---

## 10. Known issues and limitations

1. **Marketplace price ingestion is unresolved.** The catalogue is hand-written sample data. Any
   real comparison depends on authorised feeds or affiliate APIs; that decision should land before
   backend comparison work starts.
2. **Deal buttons are disabled.** There is no affiliate link to send a user to, so the CTA is inert
   and explains itself (`DealLinkNote`). This is deliberate honesty, not a broken button.
3. **Mobile was verified by typecheck and component render tests, not on a device or simulator.**
   No Android/iOS runtime was available in this environment. Layout was reviewed through the shared
   design tokens and the component test tree only — worth a manual pass in Expo Go before Sprint 2.
4. **Screenshots were unavailable** in this environment (the preview webview produced no frames), so
   visual review was done through the live DOM, computed styles and accessibility snapshots.
5. **Mobile theme preference is session-only** — no AsyncStorage dependency yet, stated in the UI.
6. **Product imagery is icon-based**, not photography: sample data has no image URLs, and shipping
   placeholder photographs would imply real products.
7. **`/tracking` and `/premium` are presentation-only.** The watchlist is three fixed sample rows
   with invented target prices, and plan pricing is static; nothing is persisted, monitored or
   charged. The rows link to real product pages, so the flow itself is exercised.
8. **The web bundle is a single 479 kB chunk** (146 kB gzip). Fine for review; route-level code
   splitting is a natural follow-up once the API surface grows.

---

## 11. Suggested next steps (not started)

- Investigate authorised marketplace price sources (affiliate APIs vs. permitted scraping) and
  document the ingestion decision.
- Add route-level code splitting and image handling for real product assets.
- Manual Expo Go pass on a physical device, then wire the mobile app to the live API client.
- Persist theme preference on mobile (AsyncStorage) and add an ESLint rule for the shared token
  import boundary.
