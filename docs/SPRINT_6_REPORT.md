# Sprint 6 Report — Secure Catalogue Review & Administration

Status: **complete**. All existing Sprint 0–5 behaviour is preserved; the previous working tree was
clean and no prior work was reset.

## 1. Files

### Created — API

- `apps/api/src/models/adminUser.ts`
- `apps/api/src/models/catalogueReviewDecision.ts`
- `apps/api/src/models/catalogueAuditEvent.ts`
- `apps/api/src/models/catalogueMergeRun.ts`
- `apps/api/src/services/storeSession.ts` (opaque transaction handle shared by store contracts)
- `apps/api/src/services/admin/password.ts` (`scrypt` hashing, policy, dummy hash)
- `apps/api/src/services/admin/token.ts` (`jose` HS256 admin session tokens)
- `apps/api/src/services/admin/adminStore.ts` (contract + in-memory store)
- `apps/api/src/services/admin/mongoAdminStore.ts`
- `apps/api/src/services/admin/audit.ts`
- `apps/api/src/services/admin/auth.service.ts`
- `apps/api/src/services/admin/review.service.ts`
- `apps/api/src/services/admin/merge.service.ts`
- `apps/api/src/services/admin/index.ts` (store/service wiring)
- `apps/api/src/middlewares/adminAuth.ts`
- `apps/api/src/controllers/adminAuth.controller.ts`
- `apps/api/src/controllers/adminCatalogue.controller.ts`
- `apps/api/src/routes/admin.routes.ts`
- `apps/api/src/scripts/admin.ts` (`npm run admin`)
- `apps/api/tests/adminAuth.test.ts`
- `apps/api/tests/adminReview.test.ts`
- `apps/api/tests/adminMerge.test.ts`

### Created — shared, web, docs

- `packages/shared/src/contracts/admin.ts` (Zod contracts for sessions, queue, decisions, merge, audit)
- `apps/web/src/services/admin.service.ts`
- `apps/web/src/pages/AdminPage.tsx`, `apps/web/src/pages/AdminPage.test.tsx`
- `apps/web/src/components/admin/AdminLoginForm.tsx`
- `apps/web/src/components/admin/ReviewQueueList.tsx`
- `apps/web/src/components/admin/ReviewDetailPanel.tsx`
- `apps/web/src/components/admin/adminPresentation.ts`
- `docs/ADMIN_SETUP.md`, `docs/SPRINT_6_REPORT.md`

### Modified

- Shared contracts: `catalogue.ts` (review block, revision, merge redirect, matcher version),
  `index.ts`.
- Models: `canonicalProduct.ts` (`mergedInto`/`mergedAt`), `marketplaceListing.ts` (revision,
  review), `index.ts` (new indexes).
- Catalogue: `catalogueStore.ts` (review queue, compare-and-set review, merge reference moves,
  shared `isPendingReview`), `memoryCatalogueStore.ts`, `mongoCatalogueStore.ts`,
  `matching.service.ts` (candidate assessment for review, refusal exclusions), `ingestion.service.ts`
  (human-decision precedence, merge fields), `catalogue.service.ts` (merge redirects),
  `catalogueSource.ts` (sources cannot declare merge state).
- Snapshots/rollups: store contracts + memory/Mongo implementations gained `mergeProduct`; Mongo
  `mergeProduct` loops, `combineRollups` already existed.
- API wiring: `env.ts` (admin secret/TTL/throttle), `routes/index.ts`, `types/express.d.ts`,
  `app.ts` unchanged, `controllers`/`routes` added.
- Web: `app/routes.tsx` (`/admin`), `lib/apiClient.ts` (Authorization header support).
- Tests updated: `env.test.ts` (production now requires `ADMIN_JWT_SECRET`), `helpers/catalogue.ts`,
  `mongoCatalogue.test.ts` (new listing fields; store result omits an empty
  `respectedHumanDecisions`).
- Root: `package.json` + `apps/api/package.json` (`npm run admin`), `package-lock.json`
  (`jose` added), `apps/api/tsconfig.json` explicitly includes `src/types/express.d.ts` (TypeScript 7
  no longer matches `.d.ts` through `src/**/*.ts`).
- `README.md`, `docs/DATABASE_DESIGN.md`, `docs/API_CONTRACTS.md`.

## 2. Authentication architecture

- One role: `catalogue_admin` (enum, room to grow). Authority lives in `admin_users`; every request
  reloads the account and checks `status === "active"`, the role, and `tokenVersion`.
- Passwords: Node `scrypt` (N=16384, r=8, p=1, 16-byte random salt, 64-byte key), constant-time
  comparison, parameters stored with the hash. Plaintext is never persisted, logged or returned.
- Sessions: `jose` HS256 JWT with issuer/audience/expiry, 1 h default, `cache-control: no-store`.
  `Authorization: Bearer` only — no cookies, so there is no ambient credential for CSRF.
- Login is the only public admin route. Unknown email / wrong password / disabled account all return
  the same `401` and all run a real derivation (unknown emails use a dummy hash). Failures are
  throttled per email per process (`429`, 5 attempts / 15 min default).
- Disable and password reset bump `tokenVersion`, revoking existing sessions on their next request;
  both actions are audited. There is no default account and no account-creation endpoint.
- `ADMIN_JWT_SECRET` is required in production (≥32 chars); outside production a random per-process
  secret is generated, so restarts invalidate sessions instead of shipping a known key.

## 3. Administrator provisioning

`npm run admin -- provision --email=… --name="…"` uses a masked prompt (or stdin /
`ADMIN_PROVISION_PASSWORD` for automation); the password is never a CLI flag. Policy: ≥12 chars,
a letter, a digit, and not containing the email. Requires MongoDB and refuses otherwise. `list`,
`disable`, `reset-password`, `audit` and `repair-merges` are also provided. See
[ADMIN_SETUP.md](ADMIN_SETUP.md).

## 4. Review queue and API

- `GET /admin/catalogue/review-queue`: scope (`pending`/`decided`/`all`), verdict, source,
  marketplace, canonical product, free-text search (title/brand/model/external id), four sorts,
  pagination (≤50/page), plus unfiltered counts. Candidates are re-scored with the same rules as the
  matcher; conflicts and the review reason are computed, not stored prose.
- `GET /admin/catalogue/listings/:id`: item + append-only decisions + listing audit events.
- Decision routes: `accept`, `reassign`, `reject`, `defer`, `reopen`, all Zod-validated with
  `expectedRevision`, required reason, optional notes.
- `GET /admin/catalogue/merge-preview`, `POST /admin/catalogue/products/merge`,
  `GET /admin/catalogue/audit`.
- Existing envelope, `AppError` codes, request-id logging and no-store caching are reused. There is
  no public admin route other than login.

## 5. Human decision persistence

`catalogue_review_decisions` is append-only (no update/delete path). Each record stores listing,
source, marketplace, previous verdict/product, new product, rejected candidate, decision type, admin
id/email, timestamp, reason, notes, identity facts, matcher version, request id and the resulting
listing revision. The listing embeds the current decision for fast ingestion checks.

Ingestion reads existing rows first; a non-reopened human decision is never re-matched, only
marketplace facts refresh. Rejections are excluded from candidate lookup until an explicit reopen.
The ingestion report exposes `respectedHumanDecisions` when it is non-zero.

Concurrency: listings carry `revision`; `applyReview` is a compare-and-set and increments it. Stale
writes get `409 CONFLICT` with the current revision; duplicate actions cannot apply silently.

## 6. Merge workflow

Preview reports blockers (refusals), confirmable conflicts and affected counts. Merge writes a
`pending` run first, moves listings and variant links, re-keys snapshots (dropping duplicate
observations), re-keys/combines rollups arithmetically, then archives the source with
`mergedInto`/`mergedAt`. The source is never deleted and reads follow the redirect.

Repeated/circular merges are refused by the source's merge state and target checks. MongoDB
transactions are attempted when available and `transactionUsed` reports the truth; on a standalone
server the idempotent steps run without one. Failures leave a recovery run; `npm run admin --
repair-merges` re-applies and completes it or marks it failed with a reason. Rollback is
backup-based; see the limitations.

## 7. Audit architecture

`catalogue_audit_events` is append-only: actor, action, target type/id, previous/new state, reason,
request id, timestamp. States are built from explicit field allowlists; passwords, hashes and tokens
are never written. Actions cover login, failed login, provisioning, disable, reset, revoked session,
accept, reject, reassign, defer, reopen and merge. Failed sign-ins carry no email in `actorEmail`.

## 8. Security verification (what tests actually ran)

`apps/api/tests/adminAuth.test.ts` (20 tests) exercised:

- unauthenticated and non-bearer requests → `401`; valid admin token → `200`;
- forged signature, expired token, wrong issuer/audience path, non-admin (`customer`) role claim →
  `401`;
- disabled account and password reset revoke previously valid tokens;
- unknown email vs wrong password are indistinguishable; throttling returns `429`;
- provisioning rejects weak passwords, duplicate emails (case-insensitive) and stores a scrypt hash;
- audit events exist for provisioning/login/failure/disable/revoked-session, and the serialized trail
  contains neither the password nor the hash nor the token.

Not verified: MFA (not implemented), distributed throttling (not implemented). The web gate is a
UI convenience only; no test claims otherwise.

## 9. MongoDB integration results

- The existing MongoDB suites passed in the full run: `mongoCatalogue`, `mongoSnapshotStore`,
  `mongoRollups` and the API-level catalogue/comparison/history tests (20 API test files, 225 tests).
- Mongo-specific admin integration (the Mongo admin store, real transactions, concurrent writers)
  is **not** covered by a dedicated test. Review and merge tests use the in-memory stores; merge
  tests explicitly assert `transactionUsed: false` because no MongoDB connection is present.
  Transaction behaviour on a replica set therefore remains **unverified** and is documented as such.
- The earlier MongoDB driver probe for replica-set support was removed; no temporary files remain.

## 10. Verification results

| Gate                   | Result                                                              |
| ---------------------- | ------------------------------------------------------------------- |
| `npm test`             | pass — 297 tests: API 225, web 19, mobile 19, shared 34             |
| `npm run typecheck`    | pass (shared, API incl. tests, mobile, web)                         |
| `npm run lint`         | pass, 0 errors, 0 warnings                                          |
| `npm run format:check` | pass                                                                |
| `npm run build`        | pass (shared → API → web; Vite warns the main chunk exceeds 500 kB) |

## 11. Limitations

- No MFA, refresh tokens, idle timeout, session listing or distributed login throttling.
- No customer authentication; admin auth is a separate foundation, deliberately not a shopper
  session.
- The admin token lives in `sessionStorage`; the API authorisation is the real control.
- No database-level immutability for audit/decision collections (application-level append-only).
- Review history is appended after the listing CAS. If that append fails the request returns 500;
  the listing then has a review without its decision record. It is detectable but not auto-repaired.
- Merge has no UI and no automatic un-merge; rollback is backup-based.
- Mongo transactions are unverified (see §9); the fallback path is idempotent and tested.
- Ingestion remains a CLI; rate limits and pagination are bounded but no global write quota exists.
- The web build emits a >500 kB chunk warning (pre-existing app size, not a correctness issue).

## 12. Git

All changes are in one commit created after this report; see `git log -1`. The working tree is clean
afterwards.

## 13. Recommended next sprint (Sprint 7)

1. **Customer authentication and role-aware sessions** — reuse the token/verifier foundation, add
   refresh tokens, and prove shopper tokens cannot reach `/admin`.
2. **MongoDB-backed admin integration tests** — run review/merge against a real replica set to verify
   `transactionUsed: true`, rollback on failure, and two-administrator concurrency.
3. **Merge UI and scheduled reconciliation** — preview/confirm in the admin screen plus an alert when
   a merge run stays open.
4. **Price-drop alerts** — now that identity is human-reviewable, notification delivery becomes safe
   enough to build, with consent and per-user preferences.
