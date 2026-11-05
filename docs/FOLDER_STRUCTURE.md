# Folder Structure

## 1. Actual tree (Sprint 0)

```
smart-shopping-platform/
├── apps/
│   ├── api/                       Express + TypeScript backend
│   │   ├── src/
│   │   │   ├── config/            env validation, logger, Mongoose lifecycle
│   │   │   ├── controllers/       HTTP in/out only
│   │   │   ├── middlewares/       request id, error handler, 404, validation
│   │   │   ├── routes/            versioned route registration
│   │   │   ├── services/          business rules (marketplace adapters land here)
│   │   │   ├── types/             Express request augmentation
│   │   │   ├── utils/             AppError, response helpers
│   │   │   ├── app.ts             application factory (no listener)
│   │   │   └── server.ts          bootstrap + graceful shutdown
│   │   ├── tests/                 Vitest + Supertest suites
│   │   ├── .env.example
│   │   ├── tsconfig.json          build config
│   │   ├── tsconfig.test.json     typecheck config including tests
│   │   └── vitest.config.ts
│   ├── web/                       React + Vite + Tailwind
│   │   ├── src/
│   │   │   ├── app/               App + route table (+ tests)
│   │   │   ├── components/        ErrorBoundary, StatusBadge
│   │   │   ├── hooks/             useApiHealth
│   │   │   ├── layouts/           RootLayout (shell)
│   │   │   ├── lib/               env validation, API client
│   │   │   ├── pages/             HomePage, NotFoundPage, RouteErrorPage
│   │   │   ├── services/          endpoint wrappers
│   │   │   ├── styles/            Tailwind entry + theme tokens
│   │   │   ├── test/              Vitest setup
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   ├── .env.example
│   │   ├── vite.config.ts
│   │   ├── vitest.config.ts
│   │   ├── tsconfig.json
│   │   └── tsconfig.node.json
│   └── mobile/                    Expo + React Native
│       ├── src/
│       │   ├── components/        Card, StatusPill
│       │   ├── config/            EXPO_PUBLIC env validation
│       │   ├── hooks/             useApiHealth
│       │   ├── navigation/        typed stack + param list
│       │   ├── screens/           HomeScreen, DiagnosticsScreen
│       │   ├── services/          API client + health service
│       │   └── theme/             shared tokens → RN styles
│       ├── assets/                app icons (Expo template assets)
│       ├── App.tsx                providers (safe area, navigation)
│       ├── index.ts               registerRootComponent
│       ├── app.json               Expo config
│       ├── .env.example
│       ├── jest.setup.ts
│       └── tsconfig.json
├── packages/
│   └── shared/                    @smart-shopping/shared
│       ├── src/
│       │   ├── contracts/         envelopes, error codes, health schema
│       │   ├── theme/             design tokens
│       │   ├── types/             catalog, money, user
│       │   └── index.ts
│       ├── tsconfig.json
│       └── vitest.config.ts
├── docs/                          this documentation set
├── eslint.config.mjs              one shared flat config
├── package.json                   workspaces + root scripts
├── tsconfig.base.json             strict TS baseline
├── .env.example                   all variables, placeholders only
├── .prettierrc.json
├── .prettierignore
├── .editorconfig
├── .gitignore
└── README.md
```

## 2. Directories intentionally NOT created

The original proposal listed `repositories/`, `models/`, `validators/`, `domain/` for the API, and
`features/`, `types/`, `utils/` for the clients. Creating empty folders that only exist "for later"
adds no value and hides intent, so they are added with the first code that needs them:

| Folder                                       | Added when                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `apps/api/src/models`, `repositories`        | the first schema/repository is implemented                                           |
| `apps/api/src/domain`                        | price-matching logic exists                                                          |
| `apps/api/src/validators`                    | the first write endpoint exists (a generic `validateBody` middleware already exists) |
| `apps/web/src/features`, `types`, `utils`    | the first feature slice is built                                                     |
| `apps/mobile/src/features`, `types`, `utils` | the first feature slice is built                                                     |

## 3. Structural deviations from the proposed layout

1. **No `apps/api/tests` mirror of `src`** — tests stay flat in `tests/` with one file per concern;
   there are only three files.
2. **`packages/shared` compiles to `dist`** instead of being consumed as raw TypeScript. Metro
   (React Native) has stricter module-resolution behaviour than Vite, so a single compiled artefact
   guarantees identical resolution across all three apps. Cost: `npm run build:shared` must run
   before typechecking/testing the apps — wired into the root scripts.
3. **Web app splits `tsconfig.json` (browser) and `tsconfig.node.json` (tooling)** so browser code
   cannot accidentally use Node globals.
4. **Design tokens live in the shared package** rather than duplicated per app; the web mirrors the
   palette in CSS because Tailwind v4 reads CSS rather than TypeScript.
