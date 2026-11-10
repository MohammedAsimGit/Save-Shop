# Sprint 8 Report — CI Pipeline

## Objective

Create a reliable, automated CI pipeline that validates the complete Save-Shop monorepo on every pull request and push to the primary branch. Both the standard test suite and the real MongoDB replica-set integration suite must pass for a successful result.

## Hosting Provider and CI Platform

- **Hosting**: GitHub (repository hosted on GitHub, confirmed by `git remote` and `git log`).
- **CI platform**: GitHub Actions, used because the repository is on GitHub and the project uses Node.js/npm workflows natively.

## Workflow Files Created or Modified

- `.github/workflows/ci.yml` — new GitHub Actions workflow defining the CI pipeline.

## Node.js Version and Runtime Environment

- Node.js 20 LTS (`actions/setup-node@v4` with `node-version: '20'`).
- `npm ci` for reproducible dependency installation (lockfile-based).
- The repository engines field requires `">=20.19.0"`.

## Commands Executed by CI

| Gate                          | Command                          |
| ----------------------------- | -------------------------------- |
| Dependency installation       | `npm ci`                         |
| Standard test suite           | `npm test`                       |
| Replica-set integration tests | `npm run test:integration:merge` |
| Typecheck                     | `npm run typecheck`              |
| Lint                          | `npm run lint`                   |
| Format validation             | `npm run format:check`           |
| Production build              | `npm run build`                  |

## Replica-Set Initialization Approach

The integration suite uses `mongodb-memory-server` (`MongoMemoryReplSet`, cached mongod 8.2.6) to start a single-node replica set in a dedicated test database `saveshop_merge_integration_test`. Two modes are supported:

- **Default (no `MONGODB_TEST_URI`)**: `mongodb-memory-server` starts a throwaway single-node replica set; no external service, no credentials.
- **CI override (`MONGODB_TEST_URI`)**: an existing transactional deployment (e.g. a Docker replica set in CI clouds) may be used, subject to safety guards.

Safety guards (from `apps/api/tests/integration/helpers/replicaSet.ts`):

- `NODE_ENV=production` is refused.
- The database name must contain `test`; refuses to touch development or production data.
- Non-loopback hosts require `MONGODB_TEST_ALLOW_REMOTE=1`; the URI must name a replica set (`?replicaSet=...`).
- If the connected server does not report `hello.setName`, the suite fails loudly (transactions would be silently skipped).

The CI workflow does not set `MONGODB_TEST_URI`, so the default `mongodb-memory-server` path is used. The runner downloads the cached MongoDB binary on first run; subsequent runs reuse the cache.

## Security and Permissions Decisions

- Workflow permissions: default `read-read` (no `actions:permissions` needed; the workflow uses `actions/checkout@v4` and `actions/setup-node@v4` which require no privileged secrets).
- No secrets are placed in the workflow file.
- The only environment variables set in the workflow are `NODE_ENV`, `LOG_LEVEL`, `PORT`, and `CORS_ALLOWED_ORIGINS` — all harmless constants.
- `npm ci` uses the lockfile; no runtime credentials are installed.
- The integration tests never read `MONGODB_URI` (development/production) and use a dedicated test database.

## Local Verification Results

All quality gates verified locally on the Windows/Git Bash host (Node 20, npm):

| Gate                             | Result                                                    |
| -------------------------------- | --------------------------------------------------------- |
| `npm test`                       | 298 tests passing (API 226, web 19, mobile 19, shared 34) |
| `npm run test:integration:merge` | 15 tests passing (2 integration test files)               |
| `npm run typecheck`              | passing                                                   |
| `npm run lint`                   | 0 errors, 0 warnings                                      |
| `npm run format:check`           | passing                                                   |
| `npm run build`                  | passing (pre-existing >500 kB chunk warning)              |

## Actual CI Run Result

The workflow file `.github/workflows/ci.yml` has been committed to the repository. An actual CI run on GitHub Actions has not been executed from this environment (the host is a Windows desktop, not a CI runner). The workflow is structured to run on:

- `push` to the `master` branch
- `pull_request` targeting the `master` branch

Both events will trigger the full pipeline as defined.

## Remaining Limitations

- An actual CI run on GitHub Actions has not been performed from this environment; the workflow file is structurally correct and all local gates pass, but the user must push to GitHub to confirm the remote CI result.
- The `mongodb-memory-server` binary download may add time on a cold CI cache; subsequent runs are fast.
- The 500 kB chunk warning from the web build is pre-existing and not escalated to a failure.

## Commit History

- `2f557a5` — Verify catalogue merges against a real MongoDB replica set
- `af697ad` — Records implementation hash in the report
- `4710eca` — Add GitHub Actions CI pipeline for Save-Shop Sprint 8
- `d02962e` — Record Sprint 7 commit hashes in the report

## Working-Tree Status

Clean. All changes are committed.
