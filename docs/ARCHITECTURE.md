# Architecture

Status: Sprint 0 (foundation only). No feature is implemented yet.

## 1. System overview

```
┌──────────────────┐        ┌──────────────────┐
│  apps/web        │        │  apps/mobile     │
│  React + Vite    │        │  Expo + RN       │
│  Tailwind CSS    │        │  StyleSheet      │
└────────┬─────────┘        └────────┬─────────┘
         │  HTTPS / JSON (REST)      │
         └────────────┬──────────────┘
                      ▼
            ┌───────────────────────┐
            │  apps/api             │
            │  Express + TypeScript │
            │  routes → controllers │
            │  → services → repos   │
            └──────────┬────────────┘
                       │ Mongoose (server-side only)
                       ▼
              ┌─────────────────┐
              │    MongoDB      │
              └─────────────────┘

        packages/shared  ← types, contracts, design tokens
        (imported by all three apps; contains no runtime
         dependencies on Node, browsers or React Native APIs)
```

The future marketplace integration layer sits **inside the API** (`services/` +
`repositories/`), never in a client. Clients never hold marketplace credentials.

## 2. Responsibilities by component

| Component         | Owns                                                                                                        | Must never do                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `apps/web`        | Rendering, routing, browser UX, calling the REST API                                                        | Connect to MongoDB, hold secrets, call marketplaces directly              |
| `apps/mobile`     | Rendering, native navigation, calling the REST API                                                          | Connect to MongoDB, hold secrets, duplicate business rules                |
| `apps/api`        | HTTP boundary, validation, business rules, persistence, future marketplace integration, affiliate/ads logic | Contain UI concerns                                                       |
| `packages/shared` | Types, API envelopes and error codes, health contract, design tokens                                        | Contain application logic, drivers, React components, or circular imports |
| MongoDB           | Durable storage                                                                                             | Be reachable from any client                                              |

## 3. Communication rules

1. All client/server traffic is JSON over REST, versioned under `API_PREFIX` (default `/api/v1`).
2. Successful responses use `{ "data": ... }`; failures use `{ "error": { code, message } }`.
   Both are defined once in `packages/shared/src/contracts/api.ts`.
3. Clients branch on `error.code`, never on `error.message`.
4. Every response carries `x-request-id`, echoed in error bodies, so a user report can be traced
   to a server log line.
5. Clients validate payloads against the shared Zod schemas before rendering them, so contract
   drift fails loudly rather than silently.
6. The API is the only component allowed to talk to third parties.

## 4. Backend layering

```
src/
├── routes/        URL → controller mapping, per version
├── controllers/   HTTP in/out only; no business rules
├── services/      Business rules; the only place marketplace logic will live
├── repositories/  (Sprint 1+) data access; the only layer that touches Mongoose models
├── models/        (Sprint 1+) Mongoose schemas
├── validators/    (Sprint 1+) Zod input schemas
├── domain/        (Sprint 1+) pure domain logic: matching, price ranking
├── middlewares/   request id, validation, error handling, 404
├── config/        env parsing, logger, database lifecycle
└── utils/         AppError, response helpers
```

Dependencies point inwards: `routes → controllers → services → repositories → models`.
A controller never imports a Mongoose model. A service never imports `express`.

Empty future-facing directories are intentionally not created; they are added with the code
that needs them (see `docs/FOLDER_STRUCTURE.md`).

## 5. Shared package

`@smart-shopping/shared` compiles to `dist/` with `tsc` and is consumed through its `exports`
map, so Vite, Metro and Node all resolve the same artefact:

- **types**: `Money`, `Product`, `ProductVariant`, `Marketplace`, `ProductListing`,
  `PriceSnapshot`, user/subscription/wishlist shapes.
- **contracts**: response envelopes, error codes, health schema (Zod).
- **theme**: colour/spacing/radius/type tokens used by React Native; the web mirrors the palette
  in `apps/web/src/styles/index.css` because Tailwind v4 reads CSS.

It must stay dependency-light (currently only `zod`). Cycles are impossible because the package
imports nothing from the apps.

## 6. Database communication

Only the API opens a Mongoose connection. The lifecycle is owned by
`apps/api/src/config/database.ts`:

- connect on boot when `MONGODB_URI` is present;
- log connect / disconnect / reconnect / error events;
- expose a real `ping` used by the health endpoint;
- disconnect on `SIGINT`/`SIGTERM` after the HTTP server stops accepting work.

In development a missing `MONGODB_URI` is tolerated so the API can be exercised without
infrastructure; in production it is a boot failure. See `docs/DATABASE_DESIGN.md`.

## 7. Error handling

- Expected failures throw `AppError` (status + stable code + safe message).
- Zod errors become `400 VALIDATION_ERROR` with field-level details.
- Anything else becomes `500 INTERNAL_ERROR`; stack traces and driver messages are never sent to
  clients and only appear in logs.
- The web app wraps the tree in an `ErrorBoundary` and uses a router `errorElement`; the mobile
  app surfaces API failures inline.

## 8. Security posture (Sprint 0)

Implemented: helmet headers, explicit CORS allowlist (wildcard rejected in production),
`x-powered-by` disabled, 100 kB JSON body limit, env validation at boot, request-id
correlation, log redaction of `authorization` / `cookie`, secrets only server-side.

Not implemented, deliberately: authentication, authorization, rate limiting, CSRF protection
(no cookie sessions yet), audit logging, dependency scanning in CI.

## 9. Future: marketplace integration approach

1. Each marketplace gets an adapter implementing a shared interface
   (`fetchListing`, `fetchPrice`, `normalise`) behind `apps/api/src/services`.
2. Adapters are fed only by **authorised** access (official API, affiliate feed, or a licensed
   data provider) — see `docs/MARKETPLACE_INTEGRATIONS.md`.
3. Raw provider payloads are normalised into `ProductListing` + `PriceSnapshot` with an explicit
   `source`, so unverified data is never presented as verified.
4. Provider credentials live in server-side environment variables, validated at boot, never in a
   client bundle.
5. Ingestion is asynchronous (scheduled job/queue) rather than user-request-time scraping, which
   keeps latency and rate limits under control. The job runner is not chosen yet (open question).

## 10. Known architectural open questions

- Monorepo build caching (Nx/Turborepo) — not needed at this size; revisit if CI slows down.
- Where price-ingestion workers will run (inside the API process vs a separate worker service).
- Whether a cache/CDN layer is required between API and marketplace calls.
- Authentication strategy details (Firebase is planned, but token verification flow is undecided).
