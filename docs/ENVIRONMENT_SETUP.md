# Environment Setup

## 1. Prerequisites

| Tool                        | Requirement                | Notes                                                     |
| --------------------------- | -------------------------- | --------------------------------------------------------- |
| Node.js                     | >= 20.19 (22.x tested)     | `node --version`                                          |
| npm                         | >= 10 (ships with Node)    | npm workspaces are used; no extra workspace tool required |
| Git                         | any recent version         | this repository has its own history                       |
| MongoDB                     | optional for Sprint 0      | see §5; the API runs without it in development            |
| Android Studio / SDK, Xcode | only to run the mobile app | Expo Go on a phone avoids both for now                    |

No Docker, no cloud account and no marketplace credentials are required for Sprint 0.

## 2. Install

```bash
git clone <repository-url> smart-shopping-platform
cd smart-shopping-platform
npm install
```

`npm install` at the root installs every workspace (`apps/*`, `packages/*`) and creates a single
`package-lock.json`. Do not run `npm install` separately inside each app; the root lockfile is the
source of truth.

Then build the shared package once (the apps import its compiled output):

```bash
npm run build:shared
```

## 3. Environment files

Each application reads its own `.env` file. Only example files are committed.

| File                  | Copy from                  | Committed? |
| --------------------- | -------------------------- | ---------- |
| `apps/api/.env`       | `apps/api/.env.example`    | no         |
| `apps/web/.env.local` | `apps/web/.env.example`    | no         |
| `apps/mobile/.env`    | `apps/mobile/.env.example` | no         |

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

Backend minimum for local work:

```dotenv
NODE_ENV=development
PORT=4000
API_PREFIX=/api/v1
MONGODB_URI=            # leave empty to run without MongoDB
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
LOG_LEVEL=info
```

Web:

```dotenv
VITE_API_BASE_URL=http://localhost:4000/api/v1
```

Mobile (host mapping matters — see §6):

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:4000/api/v1
```

### Security rules for environment files

1. Never commit a `.env` file (the `.gitignore` enforces this).
2. Anything prefixed `VITE_` or `EXPO_PUBLIC_` is compiled into a public bundle. No secrets there,
   ever — only public configuration such as an API URL.
3. Backend secrets (`MONGODB_URI`, future Firebase/marketplace credentials) live only in
   `apps/api/.env` and in the deployment platform's secret store.
4. `apps/api/src/config/env.ts` validates every variable at boot and refuses to start with an
   invalid or missing production-critical value.
5. `.env.example` files contain placeholders only. Do not replace them with real values in a file
   that is tracked by Git.
6. A **blank** value is the same as an unset one: `MONGODB_URI=` runs without a database and an
   empty `API_PREFIX=`/`PORT=` falls back to its default. `apps/api/src/config/env.ts` normalises
   blanks before validating, so copying `.env.example` verbatim boots successfully.

## 4. Common commands (run from the repository root)

| Command                                   | Purpose                                        |
| ----------------------------------------- | ---------------------------------------------- |
| `npm run dev:api`                         | API with hot reload on `http://localhost:4000` |
| `npm run dev:web`                         | Vite dev server on `http://localhost:5173`     |
| `npm run dev:mobile`                      | Expo dev server (Metro)                        |
| `npm run build:shared`                    | Compile `packages/shared` to `dist/`           |
| `npm run build`                           | Build shared → API → web                       |
| `npm run typecheck`                       | Build shared, then typecheck every workspace   |
| `npm run lint`                            | ESLint across the monorepo                     |
| `npm run format` / `npm run format:check` | Prettier write / verify                        |
| `npm run test`                            | Build shared, then run every workspace's tests |
| `npm run verify`                          | typecheck + lint + test                        |

Use three terminals (API, web, mobile) for full-stack development.

## 5. MongoDB

The API starts without a database in development. The health endpoint then reports
`checks.database.status = "not_configured"` — it does **not** claim health it cannot verify.

To run with a database:

- install MongoDB Community Server locally, or use a hosted cluster you are authorised to use;
- put the connection string in `apps/api/.env` as `MONGODB_URI`;
- restart the API; `GET /api/v1/health` should then report `"status": "up"` with a `latencyMs`.

`NODE_ENV=production` **requires** `MONGODB_URI`; the process exits otherwise.

Sprint 0 creates no collections and writes no data.

## 6. Running the mobile app

```bash
npm run dev:mobile
```

- **Expo Go on a physical device**: scan the QR code. Point `EXPO_PUBLIC_API_BASE_URL` at your
  computer's LAN IP (e.g. `http://192.168.1.20:4000/api/v1`), not `localhost`.
- **Android emulator**: `10.0.2.2` is the host machine, hence the default example value.
- **iOS simulator**: `localhost` works.
- The API must be reachable from the device; both must be on the same network.

TypeScript is used throughout; Expo's managed workflow was chosen so the app can be developed
without native toolchains. `npx expo prebuild` can generate native projects later if a marketplace
SDK ever requires it.

## 7. Troubleshooting

| Symptom                                                                     | Cause / fix                                                                                                 |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Web page shows "Could not reach the API"                                    | API is not running, or `VITE_API_BASE_URL`/`CORS_ALLOWED_ORIGINS` mismatch                                  |
| API exits with `Invalid environment configuration`                          | Read the printed field list; fix `apps/api/.env`                                                            |
| `Cannot find module '@smart-shopping/shared'`                               | Run `npm run build:shared` (or `npm run typecheck`, which builds it first)                                  |
| Health shows `database: not_configured`                                     | Expected when `MONGODB_URI` is empty                                                                        |
| Mobile app cannot reach API from the emulator                               | Use `10.0.2.2`, not `localhost`                                                                             |
| `npm install` fails while running a package's postinstall script on Windows | The shell cannot resolve `node`; install with `npm install --ignore-scripts` and verify the tools still run |

## 8. Not configured in Sprint 0

Firebase credentials, marketplace API keys, affiliate ids, payments, ad networks, cloud hosting,
CI/CD and Docker. Each is documented as a future step, not as working configuration.
