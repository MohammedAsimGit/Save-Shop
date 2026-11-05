# Smart Shopping Platform

Price intelligence for shoppers who compare the same product across competing marketplaces: search
once, see every marketplace's price side by side, and follow the cheapest **verified** offer.

> **Status: Sprint 0 (foundation only).** Three applications boot, a real health endpoint reports
> dependency state honestly, shared contracts and documentation exist. There is **no** product
> search, price comparison, authentication, marketplace integration or sample catalogue data yet.
> Nothing here fabricates prices or claims an integration we do not have authorised access to.

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

Full environment guide: [docs/ENVIRONMENT_SETUP.md](docs/ENVIRONMENT_SETUP.md).

## Commands

Run from the repository root.

| Command                | Purpose                                        |
| ---------------------- | ---------------------------------------------- |
| `npm run dev:api`      | API with hot reload on port 4000               |
| `npm run dev:web`      | Vite dev server on port 5173                   |
| `npm run dev:mobile`   | Expo dev server                                |
| `npm run build:shared` | Compile `packages/shared` to `dist/`           |
| `npm run build`        | Build shared → API → web                       |
| `npm run typecheck`    | Build shared, then typecheck every workspace   |
| `npm run lint`         | ESLint (flat config) across the monorepo       |
| `npm run format`       | Prettier write (`format:check` to verify only) |
| `npm run test`         | Build shared, then run every workspace's tests |
| `npm run verify`       | typecheck + lint + test — the pre-push gate    |

Tests: Vitest for `shared`, `api` and `web`; `jest-expo` for `mobile`.

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
| [API_CONTRACTS.md](docs/API_CONTRACTS.md)                       | Envelope, error codes, health endpoint                  |
| [DATABASE_DESIGN.md](docs/DATABASE_DESIGN.md)                   | Planned collections, indexing, price snapshots          |
| [MARKETPLACE_INTEGRATIONS.md](docs/MARKETPLACE_INTEGRATIONS.md) | Access status per provider, legal/technical constraints |
| [ENVIRONMENT_SETUP.md](docs/ENVIRONMENT_SETUP.md)               | Install, env files, MongoDB, mobile device setup        |
| [DEVELOPMENT_GUIDELINES.md](docs/DEVELOPMENT_GUIDELINES.md)     | Coding, testing and review standards                    |

## Known constraints

- **Marketplace access is unresolved.** Ingestion depends on authorised APIs or written permission
  per provider; until that exists there is no scraper and no mock data standing in for it. See
  [MARKETPLACE_INTEGRATIONS.md](docs/MARKETPLACE_INTEGRATIONS.md).
- **Authentication is not implemented.** Firebase is the intended provider; no credentials exist.
- **No CI/CD, Docker or deployment** in this sprint.
