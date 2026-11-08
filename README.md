# Smart Shopping Platform

Price intelligence for shoppers who compare the same product across competing marketplaces: search
once, see every marketplace's price side by side, and follow the cheapest **verified** offer.

> **Status: Sprint 4 (historical retention, compaction and daily rollups).**
> Observations are stored in MongoDB (`price_snapshots`), served through a validated history
> endpoint, and charted on the product page of both clients. Sprint 4 adds a manual retention job
> that compacts days older than the raw window into daily aggregates (`price_daily_rollups`) — but
> only after the rollup has been persisted **and verified** — plus an audit trail of every run
> (`retention_runs`). Recent days stay at full resolution; archived days are shown as daily
> summaries, never as point-in-time prices. The only enabled source is still a deterministic sample
> adapter, so every price and every history point you see is invented demo data and labelled as
> such; Amazon and Flipkart remain disabled descriptors awaiting written permission. There is no
> scraper, no marketplace integration, no authentication, no advertising, no billing, and deal
> buttons stay disabled because no outbound link is authorised.
>
> What shipped: [Sprint 4 report](docs/SPRINT_4_REPORT.md) ·
> [Sprint 3 report](docs/SPRINT_3_REPORT.md) · [Sprint 2 report](docs/SPRINT_2_REPORT.md) ·
> [Sprint 1 report](docs/SPRINT_1_REPORT.md).

## Repository layout

```
apps/
  api/      Express + TypeScript REST API (MongoDB via Mongoose, optional in dev)
  web/      React + TypeScript + Vite + Tailwind web client
  mobile/   Expo + React Native + TypeScript mobile client
packages/
  shared/   Types, API/health contracts (Zod) and design tokens, consumed by all three apps
docs/       Architecture, API contracts, database design, marketplace constraints, setup
```

Details: [folder structure](docs/FOLDER_STRUCTURE.md) · [architecture](docs/ARCHITECTURE.md).

## Prerequisites

| Tool    | Requirement                                          |
| ------- | ---------------------------------------------------- |
| Node.js | >= 20.19 (22.x used for verification)                |
| npm     | >= 10 (workspaces; one root lockfile)                |
| MongoDB | optional — the API runs without it and says so       |
| Expo Go | only for running the mobile app; no native toolchain |

No Docker, cloud account, marketplace credential or API key is required.

## Quick start

```bash
npm install          # installs every workspace, creates one package-lock.json
npm run build:shared # the apps import this package's compiled output
```

Create the environment files (only `*.example` files are committed):

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

Then, in separate terminals:

```bash
npm run dev:api    # http://localhost:4000/api/v1/health
npm run dev:web    # http://localhost:5173
npm run dev:mobile # Expo / Metro
```

The web page shows the live API health state, so it doubles as a smoke test of the whole stack.
`MONGODB_URI` may stay empty; health then reports `database.status = "not_configured"` instead of
pretending the database is up.

A product page then exercises the engine end to end:

```bash
curl -s localhost:4000/api/v1/products/sony-wh1000xm5/comparison   # ranked offers + exclusions
curl -s localhost:4000/api/v1/products/sony-wh1000xm5/history      # stored observations, 30d default
curl -s "localhost:4000/api/v1/products/sony-wh1000xm5/history?period=7d&limit=50"
curl -s localhost:4000/api/v1/sources                              # which sources exist, and why not
```

All of them carry `status: "sample_only"` and a demo notice, because the demo adapter is the only
enabled source. With `MONGODB_URI` empty the API keeps history in memory for the life of the process
and logs that choice; point it at a real MongoDB (e.g. `mongodb://127.0.0.1:27017/saveshop`) to keep
history across restarts. Web keeps the API base URL in `apps/web/.env.local`
(`VITE_API_BASE_URL=http://localhost:4100/api/v1` for the current local setup).

Full environment guide: [docs/ENVIRONMENT_SETUP.md](docs/ENVIRONMENT_SETUP.md).

## Commands

Run from the repository root.

| Command                | Purpose                                            |
| ---------------------- | -------------------------------------------------- |
| `npm run dev:api`      | API with hot reload on port 4000                   |
| `npm run dev:web`      | Vite dev server on port 5173                       |
| `npm run dev:mobile`   | Expo dev server                                    |
| `npm run build:shared` | Compile `packages/shared` to `dist/`               |
| `npm run build`        | Build shared → API → web                           |
| `npm run typecheck`    | Build shared, then typecheck every workspace       |
| `npm run lint`         | ESLint (flat config) across the monorepo           |
| `npm run format`       | Prettier write (`format:check` to verify only)     |
| `npm run test`         | Build shared, then run every workspace's tests     |
| `npm run verify`       | typecheck + lint + test — the pre-push gate        |
| `npm run retention`    | Compaction job (dry run by default; needs MongoDB) |

Tests: Vitest for `shared`, `api` and `web`; `jest-expo` for `mobile`.

### Historical retention (Sprint 4)

The job is deliberately manual and dry-run first:

```bash
npm run retention                              # dry run: report only
npm run retention -- --apply                   # compact eligible days
npm run retention -- --apply --raw-days=30 --rollup-days=365 --batch-size=200
```

Policy defaults come from `apps/api/.env`: `RETENTION_RAW_DAYS=30` (full-resolution window, shorter
than the 90-day history view so its older half is served from rollups), `RETENTION_ROLLUP_DAYS=730`
(daily-rollup window, must be ≥ raw), `RETENTION_BATCH_SIZE=500` and `RETENTION_DRY_RUN=true`. These are product decisions, not legal requirements. A day is deleted
only after its daily rollup is persisted **and** verified against the raw rows; a day that fails
that check is skipped and listed in the run report. The job needs MongoDB (an in-memory store has no
durable data to compact) and refuses to start while another run is active in the process.

Exit codes: `0` completed (including a dry run), `1` failure, `2` usage/environment error, `3`
completed after an interrupt. Each run is recorded in `retention_runs`.

### If `npm run` hangs on Windows

Some restricted shells (sandboxed or heavily locked-down terminals) cannot spawn `cmd.exe`, which
npm needs to run scripts; every `npm run <script>` then hangs with no output. That is a shell
restriction, not a repository defect. Verify through the underlying binaries instead:

```bash
node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json --noEmit
node node_modules/vitest/vitest.mjs run          # inside packages/shared, apps/api or apps/web
node node_modules/jest/bin/jest.js               # inside apps/mobile
```

Install with `npm install --ignore-scripts` if lifecycle scripts fail for the same reason.

## Conventions

- **Money is integer minor units plus a currency** (`{ amountMinor: 129900, currency: "INR" }`).
  Never floats, never a bare number.
- **Every price carries its source and observation time.** Unverifiable prices are labelled or
  omitted.
- **Secrets never cross the client boundary.** `VITE_*`/`EXPO_PUBLIC_*` values are public by
  definition; server secrets live only in `apps/api/.env`.
- **No `any`** — it is a lint error. Strict TypeScript is shared via `tsconfig.base.json`.
- **Errors are typed and safe**: clients branch on `error.code`, never on message text;
  stack traces never reach a response.

See [docs/DEVELOPMENT_GUIDELINES.md](docs/DEVELOPMENT_GUIDELINES.md).

## Documentation

| Document                                                        | Contents                                                |
| --------------------------------------------------------------- | ------------------------------------------------------- |
| [PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md)                 | Problem, objective, scope, honest status                |
| [REQUIREMENTS.md](docs/REQUIREMENTS.md)                         | Delivered foundation vs. planned product requirements   |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)                         | Layer boundaries, request lifecycle, decisions          |
| [FOLDER_STRUCTURE.md](docs/FOLDER_STRUCTURE.md)                 | Where every kind of file belongs                        |
| [API_CONTRACTS.md](docs/API_CONTRACTS.md)                       | Envelope, errors, health, comparison, history, sources  |
| [DATABASE_DESIGN.md](docs/DATABASE_DESIGN.md)                   | Snapshot, cache, rollup and retention schemas + indexes |
| [MARKETPLACE_INTEGRATIONS.md](docs/MARKETPLACE_INTEGRATIONS.md) | Access status per provider, legal/technical constraints |
| [ENVIRONMENT_SETUP.md](docs/ENVIRONMENT_SETUP.md)               | Install, env files, MongoDB, mobile device setup        |
| [DEVELOPMENT_GUIDELINES.md](docs/DEVELOPMENT_GUIDELINES.md)     | Coding, testing and review standards                    |
| [SPRINT_4_REPORT.md](docs/SPRINT_4_REPORT.md)                   | Sprint 4 retention policy, rollups, job, gates, limits  |
| [SPRINT_3_REPORT.md](docs/SPRINT_3_REPORT.md)                   | Sprint 3 persistence, history API, cache, gates, limits |
| [SPRINT_2_REPORT.md](docs/SPRINT_2_REPORT.md)                   | Sprint 2 engine, adapters, endpoints, gates, limits     |
| [SPRINT_1_REPORT.md](docs/SPRINT_1_REPORT.md)                   | Sprint 1 screens, components, gates, known issues       |
| [INGESTION_FEASIBILITY.md](docs/INGESTION_FEASIBILITY.md)       | Amazon/Flipkart data access, provider costs, GO / NO-GO |

## Known constraints

- **Marketplace access is unresolved.** Ingestion depends on authorised APIs or written permission
  per provider; until that exists there is no scraper and no mock data standing in for it. The
  comparison engine is therefore exercised by a clearly labelled demo adapter. See
  [MARKETPLACE_INTEGRATIONS.md](docs/MARKETPLACE_INTEGRATIONS.md).
- **Product identity is still catalogue-owned.** Offers and history come from adapters, but the
  product list is the shared demo catalogue; there is no catalogue ingestion yet.
- **History contains demo observations, not marketplace history.** Sample rows are stored only
  outside production, always marked `isSample`, and summarised separately from verified data.
- **Compaction is a manual job, not a scheduler.** Nothing runs automatically; the policy windows
  are configurable defaults, and archived days are only ever aggregates of observations that were
  actually stored.
- **Authentication is not implemented.** Firebase is the intended provider; no credentials exist.
- **No CI/CD, Docker or deployment** in this sprint.
