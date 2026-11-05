# Requirements

Two kinds of requirements are recorded here: the **Sprint 0 foundation requirements** that are
actually satisfied by this repository, and the **product requirements** that are planned but not
implemented. Nothing in the second section should be read as delivered functionality.

## 1. Sprint 0 foundation requirements (delivered)

### Repository and tooling

| ID   | Requirement                                                             | Status |
| ---- | ----------------------------------------------------------------------- | ------ |
| F-01 | Monorepo with `apps/web`, `apps/mobile`, `apps/api`, `packages/shared`  | done   |
| F-02 | npm workspaces; one lockfile at the root; no duplicated tooling configs | done   |
| F-03 | Shared strict TypeScript baseline (`tsconfig.base.json`)                | done   |
| F-04 | ESLint (flat config) + Prettier for all workspaces                      | done   |
| F-05 | Root scripts for dev/build/typecheck/lint/format/test                   | done   |
| F-06 | `.gitignore` covering env files, build output, Expo artefacts           | done   |

### Applications

| ID   | Requirement                                                        | Status |
| ---- | ------------------------------------------------------------------ | ------ |
| F-07 | Web app: React + TS + Vite + Tailwind, routing, error boundary     | done   |
| F-08 | Mobile app: Expo + TS, typed navigation stack, StyleSheet tokens   | done   |
| F-09 | API: Express + TS, layered structure, JSON/error envelopes         | done   |
| F-10 | API health endpoint checking the database for real                 | done   |
| F-11 | MongoDB/Mongoose connection lifecycle + graceful shutdown          | done   |
| F-12 | Zod-validated environment configuration (fail fast)                | done   |
| F-13 | Security baseline: helmet, CORS allowlist, body limit, safe errors | done   |
| F-14 | Test infrastructure: Vitest (web/api/shared), jest-expo (mobile)   | done   |

### Documentation

| ID   | Requirement                                                                | Status |
| ---- | -------------------------------------------------------------------------- | ------ |
| F-15 | README with install/run/test/build instructions                            | done   |
| F-16 | Architecture, API contracts, database design, marketplace constraints docs | done   |
| F-17 | Environment setup guide; example env files with placeholders only          | done   |

## 2. Product requirements (planned, NOT implemented)

### Search and comparison

- **P-01** A user can search by product name, brand or identifier and get relevant results.
- **P-02** Results show the same product across every marketplace for which we have authorised
  access; missing marketplaces are simply absent, never estimated.
- **P-03** Each price displays its marketplace, currency and observation time.
- **P-04** The cheapest verified in-stock offer is visually emphasised.
- **P-05** Selecting an offer redirects to the marketplace, with affiliate attribution where
  permitted and required disclosure.
- **P-06** Unverified or stale prices are labelled as such, or hidden.

### Product data

- **P-07** Products, variants and listings are stored separately (see `DATABASE_DESIGN.md`).
- **P-08** Matching the same product across providers uses standard identifiers first, with a
  human review path for ambiguous cases.
- **P-09** Price snapshots are append-only and drive history/trend views.

### Accounts and monetisation

- **P-10** Sign-in via Firebase Authentication (planned; not integrated).
- **P-11** Per-user data (wishlist, alerts) is scoped to the verified user id on the server.
- **P-12** Premium subscription tier with clearly defined entitlements (undecided).
- **P-13** Advertising slots are visually distinct from organic results.
- **P-14** Affiliate clicks are recorded server-side with no client-trusted commission data.

### Notifications

- **P-15** A user can be notified when a watched product drops below a target price.
- **P-16** Notification delivery channel(s) are undecided (email/push) and not implemented.

## 3. Non-functional requirements

- **N-01** Type safety: `any` is a lint error. No silent type escapes.
- **N-02** Secrets never appear in client bundles or the repository.
- **N-03** API error responses never leak stack traces or driver internals.
- **N-04** The API starts and reports health honestly even when MongoDB is unavailable in
  development.
- **N-05** Responsive web UI from 320 px upwards; mobile-first layouts.
- **N-06** All monetary values are integer minor units with an explicit currency.
- **N-07** Commands documented in the README must be the commands actually used to verify the
  build.

## 4. Explicit exclusions for Sprint 0

Authentication, product APIs, marketplace integration, price ingestion, payments, ads, affiliate
tracking, notifications, admin tooling, Docker, CI/CD and cloud deployment. No mock product data.
