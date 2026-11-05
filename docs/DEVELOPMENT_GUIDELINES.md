# Development Guidelines

## 1. Workspace workflow

- Install once at the root: `npm install`. Never add an app-local lockfile.
- Add dependencies with a workspace flag so they land in the right `package.json`:
  `npm install <pkg> -w @smart-shopping/web`
- `packages/shared` must be built (`npm run build:shared`) before the apps typecheck or test;
  the root scripts already do this.
- Shared code changes require rebuilding shared; use `npm run dev -w @smart-shopping/shared` for a
  watch build during long sessions.

## 2. TypeScript rules

- `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals/Parameters` are on. Keep them on.
- `any` is an ESLint **error**. Use `unknown` at boundaries and narrow with a schema or type guard.
- Use `import type` for type-only imports (`@typescript-eslint/consistent-type-imports`).
- Relative imports inside Node-side packages (`apps/api`, `packages/shared`) use explicit `.js`
  extensions — required by Node's ESM resolver, even in TypeScript source.
- Web/mobile code may use extensionless imports (bundler resolution).
- Public functions get an explicit return type when inference would be non-obvious.
- No non-null assertions (`!`) to silence the compiler; handle the null case.

## 3. Layering rules (API)

`routes → controllers → services → repositories → models`

- Controllers: parse/validate input, call a service, shape the response. No business rules.
- Services: business rules, provider adapters, orchestration. No `express` types.
- Repositories: the only place Mongoose is used (from Sprint 1).
- Every response goes through `sendSuccess`/`sendError` so the envelope stays consistent.
- Expected failures throw `AppError`; unexpected ones bubble to the error middleware.

## 4. Frontend rules

- The web app never imports Mongoose, `dotenv`, Node built-ins or the API's `src/`.
  Cross-boundary sharing happens through `@smart-shopping/shared` only.
- All HTTP calls go through `src/services/*` → `src/lib/apiClient.ts`. Components never call
  `fetch` directly.
- Validate API payloads with the shared Zod schema before rendering.
- Loading, error and empty states are part of the component, not an afterthought.
- Accessibility: semantic landmarks, labels, `aria-*` where needed, visible focus (`:focus-visible`
  is styled globally). Test keyboard navigation for interactive elements.
- Mobile: styling uses React Native `StyleSheet` with tokens from `packages/shared`; no Tailwind
  classes in the RN app (NativeWind is not installed). Every screen must work on a 320 pt wide
  device.

## 5. Testing expectations

- Every bug fix gets a test that fails before the fix.
- Pure logic (contracts, adapters, mappers) → unit tests.
- API endpoints → `supertest` against `createApp()` (no listener, no real port needed).
- Web → Vitest + Testing Library, asserting behaviour, not implementation details.
- Mobile → jest-expo. Sprint 0 covers the API client; component tests need navigation mocks.
- Do not assert on snapshots alone; assert on user-visible outcomes.
- A test that only verifies a mock was called is not evidence the feature works.

## 6. Code style

- Prettier is authoritative for formatting (`npm run format`); do not hand-format.
- ESLint (`npm run lint`) must pass with no errors before a commit.
- Naming: `camelCase` for values/functions, `PascalCase` for types/components, `UPPER_SNAKE` for
  module-level constants that are truly constant.
- Files: one primary export per file, named after it. React components use `.tsx`.
- Comments explain _why_, not _what_. If a workaround exists, name the reason and the condition
  under which it can be removed.
- Avoid premature abstraction: no generic "utils" grab bag. Three similar lines beat a speculative
  helper.

## 7. Data and honesty rules (non-negotiable)

- Never invent marketplace availability, API shapes, credentials, product ids or prices.
- Never present an unverified value as verified; every future price carries a `source`.
- Never claim a command passed unless it was executed and its output inspected.
- If a provider's capability is unknown, record it as an open question in
  `docs/MARKETPLACE_INTEGRATIONS.md`.

## 8. Secrets

- Secrets only in `apps/api/.env` (or the deployment secret store) and validated by
  `src/config/env.ts`.
- Never prefix a secret with `VITE_` or `EXPO_PUBLIC_`.
- Logs must not contain tokens; `pino` redaction covers `authorization`, `cookie`, `set-cookie`.
- If a secret is ever committed, treat it as compromised: rotate it, then remove it from history.

## 9. Git conventions

Branching: `main` is always releasable. Work in `feat/<topic>`, `fix/<topic>`, `chore/<topic>`,
`docs/<topic>`; open a pull request into `main`.

Commit messages use Conventional Commits, imperative mood:

```
feat(api): add product search endpoint
fix(web): stop health card flashing on retry
docs: document marketplace access constraints
chore(deps): bump vite
```

Keep commits scoped to one concern. Do not commit `.env` files, build output, `node_modules` or
editor state. Do not rewrite shared history or force-push without explicit agreement.

## 10. Adding an API endpoint (checklist for later sprints)

1. Define the request/response types in `packages/shared` if a client consumes them.
2. Add a Zod validator and use `validateBody` (or the query equivalent) — never trust raw input.
3. Implement the rule in a service; put persistence behind a repository.
4. Map the result to the `sendSuccess` envelope; throw `AppError` for expected failures.
5. Add `supertest` coverage for happy path, validation failure and an authorisation failure.
6. Document the endpoint in `docs/API_CONTRACTS.md`.

## 11. Known tooling limitations in Sprint 0

- ESLint runs without type information (fast, but cannot catch some type-aware issues).
  `npm run typecheck` is the gate for type correctness.
- No CI pipeline yet: verification is local via `npm run verify`.
- No coverage threshold; thresholds become meaningful only once features exist.
- The mobile app is not connected to a native test/emulator pipeline in this sprint.
