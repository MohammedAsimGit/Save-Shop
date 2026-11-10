# Administrator Setup

Catalogue administration is staff-only. This document covers how an administrator is created, how
authentication and authorisation work, how to operate the review and merge tools, and what the
security model does **not** protect against.

## 1. What an administrator can do

An administrator holds the `catalogue_admin` role and can:

- read the review queue and any listing's full identity detail;
- accept, reject, reassign, defer (leave unresolved) or reopen a listing match;
- merge one canonical product into another;
- read the append-only audit trail.

There is no API route that creates, promotes or deletes an administrator. Accounts exist only in
`admin_users`, created by the local provisioning CLI.

## 2. Prerequisites

- MongoDB. Administration refuses to provision into the in-memory development store because the
  account would vanish with the process; the CLI exits with a usage error instead.
- `MONGODB_URI` set in `apps/api/.env` (or the environment).
- In production, a real `ADMIN_JWT_SECRET` (at least 32 characters). Outside production the API
  generates a random per-process secret, which logs administrators out on every restart.

| Variable                     | Default | Notes                                                        |
| ---------------------------- | ------- | ------------------------------------------------------------ |
| `ADMIN_JWT_SECRET`           | none    | **Required in production.** HS256 signing key, never logged. |
| `ADMIN_SESSION_TTL_SECONDS`  | `3600`  | 5 minutes to 12 hours; verified on every request.            |
| `ADMIN_LOGIN_MAX_ATTEMPTS`   | `5`     | Failed attempts per email, per process, before throttling.   |
| `ADMIN_LOGIN_WINDOW_SECONDS` | `900`   | Throttle window.                                             |

Generate a secret without putting it in shell history:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Store it in the deployment's secret manager and in `apps/api/.env` locally. Do not commit it.

## 3. Provisioning an administrator

```bash
npm run admin -- provision --email=ops@example.com --name="Operations"
```

The password is prompted twice with echo disabled. It can instead be piped
(`--stdin`) or supplied through `ADMIN_PROVISION_PASSWORD` for automation; it is deliberately
**not** accepted as a command-line flag, which would leak it into shell history and process lists.

Password policy: at least 12 characters, containing a letter and a digit, and not containing the
account's email address. Length is the dominant factor; there is no composition theatre beyond
those checks.

Provisioning is idempotent in the safe direction: a duplicate email (case-insensitive) is refused
rather than silently reset. The new account is recorded in the audit trail as `admin.provisioned`.

### Related commands

```bash
npm run admin -- list
npm run admin -- disable --email=ops@example.com --reason="left the team"
npm run admin -- reset-password --email=ops@example.com
npm run admin -- audit --limit=50
npm run admin -- repair-merges
```

`disable` and `reset-password` bump the account's `tokenVersion`, which invalidates every session
issued before the change on its next request. Disabling does not delete the account or its audit
history.

There is no default administrator, no seeded password, and no bootstrap endpoint. If `admin_users`
is empty, every admin request returns `401` — the failure mode is closed.

## 4. Authentication

`POST /api/v1/admin/auth/login` accepts `{ email, password }` and returns a signed HS256 JWT plus
the credential-free profile.

- Passwords are hashed with Node's `scrypt` (random 16-byte salt, parameters stored with the hash)
  and compared in constant time. Plaintext passwords are never stored, logged or returned.
- An unknown email, a wrong password and a disabled account all return the same
  `401 Invalid email or password`, and all run a real password derivation so timing does not reveal
  whether the account exists.
- Repeated failures are throttled per email, per process (`429 RATE_LIMITED`). **Limitation:** this
  is not a distributed rate limiter; each API instance counts independently.
- The token carries the administrator id, email, role and `tokenVersion`. It is returned in the JSON
  body, not a cookie, so the browser client sends it as `Authorization: Bearer …`; there is no
  ambient credential for a cross-site request to ride on.

## 5. Authorisation

Every admin route except login is mounted behind one middleware that:

1. requires a well-formed `Authorization: Bearer <token>` header;
2. verifies signature, issuer, audience and expiry with `jose`;
3. **reloads the account from MongoDB** and requires `status: "active"`, the expected
   `catalogue_admin` role, and a matching `tokenVersion`.

Step 3 is what makes revocation immediate: a token is proof of a session, not permanent authority.
A role supplied by a request body, query or header is ignored. There is one role in this sprint;
the schema is an enum so customer accounts can share the authentication foundation later without
gaining admin privileges.

The web app hides the admin surface behind a sign-in gate, but that gate is **not** a security
boundary. All enforcement happens in the API.

## 6. Running a review

1. Open `/admin` in the web app and sign in.
2. The queue defaults to `scope=pending`: listings with verdict `possible`, `conflict`, `unmatched`,
   or `requiresReview: true`, until an administrator settles them.
3. Filter by verdict, source or marketplace; search title, brand, model or external id; paginate.
4. Select a listing to see its identity facts, provenance, sample flag, deterministic strength
   score (never a probability), candidates, conflicts and why review is required.
5. Choose an action. Every action opens a confirmation dialog requiring a reason (3–240 characters)
   and optional notes.

| Action           | Effect                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Accept           | Resolves the listing to the selected product. Contradicting facts require an explicit acknowledgement.                          |
| Assign           | Same validation, recorded as `reassigned` when the product differs from the current one.                                        |
| Reject           | Keeps the listing, leaves it unresolved and remembers the refused candidate so the matcher cannot silently propose it again.    |
| Leave unresolved | Keeps it in the queue with a note; ambiguity is never forced into a match.                                                      |
| Reopen           | Explicitly returns the listing to the automatic matcher and clears previous refusals. This is the only way to undo a rejection. |

Decision requests include `expectedRevision`. A stale revision returns `409 CONFLICT` with the
current revision; the client must reload. Two administrators cannot silently overwrite each other.

Re-ingestion refreshes marketplace facts but never overwrites an existing human decision. A listing
stays as the human left it until an administrator reopens it. Every decision is also appended to
`catalogue_review_decisions` and mirrored in the audit trail.

## 7. Canonical product merge

Merges are currently performed through the API (and exercised by tests); the web review screen does
not include a merge tool in this sprint.

1. Preview: `GET /api/v1/admin/catalogue/merge-preview?sourceProductId=…&targetProductId=…`
   returns `compatible`, blocking reasons, confirmable conflicts and the affected counts.
2. Merge: `POST /api/v1/admin/catalogue/products/merge` with
   `{ sourceProductId, targetProductId, reason, confirmConflicts?, notes? }`.

Blockers cannot be overridden: self-merge, an unknown product, an already-merged source, an
archived target, different brand or category, or a target that is a variant of the source. Conflicts
must be acknowledged: differing GTIN/MPN/model/colour/capacity, generation mismatch, differing
variant attributes, or a sample/verified or provenance mismatch.

Execution:

1. The run is written first (`catalogue_merge_runs`, `pending`) with planned counts.
2. The source product is atomically claimed for that run (`mergeRunId` compare-and-set). A second
   merge of the same source — including one into a different target — is refused with 409, so one
   source can never be split across two survivors.
3. Listings and variant links move; price snapshots are re-keyed and duplicate observations dropped;
   daily rollups are re-keyed and same-group rollups combined arithmetically.
4. The source is archived with `mergedInto` and `mergedAt` — never deleted — so old links redirect,
   and the archive is conditional on the run still owning the claim.
5. The run is marked `completed` with the applied counts. The claim link is retained on the source
   as the audit connection to the run.

MongoDB transactions are used when the deployment supports them (`transactionUsed: true`). A
standalone server cannot run multi-document transactions; the service detects that, retries the
same idempotent steps without a session, and records `transactionUsed: false`. Transactions are not
retried inside the request: a failed run is recovered by the repair command below, which re-claims
with the same run id and re-applies only the idempotent steps.

### Recovery

If a step fails, the run is marked `failed` (or stays `pending` if the process died) and the API
returns a 500 explaining that the source was not deleted. Re-run:

```bash
npm run admin -- repair-merges
```

This re-applies the idempotent migration for every unfinished run and marks it completed, or marks
it failed with a reason if the source/target no longer exists. A run that cannot re-claim the source
because another run owns it, or because the source was already merged into a _different_ target, is
reported as failed and stays open for an operator; it never redirects the source. Repeated merges
are refused because the source already has `mergedInto` set.

### Rollback

There is no automatic un-merge. The merge is reversible by an operator if needed: the source
document is intact and archived rather than deleted, but listings, snapshots and rollups have moved
and combined rows cannot be split. Take a database backup before a bulk merge and treat merging as
a forward-only, audited operation.

### Replica-set integration tests

`npm run test:integration:merge` proves the merge against a real MongoDB replica set (real sessions,
transactions, rollback, concurrency and recovery). It is a separate command on purpose: `npm test`
stays fast, uses in-memory stores, and must never depend on a local MongoDB.

By default the command starts a throwaway single-node replica set with `mongodb-memory-server` (a
development dependency; the `mongod` binary is downloaded once on the first run). No Docker,
credentials or running database is required:

```bash
npm run test:integration:merge
```

To use an existing transactional deployment instead (for example a Docker replica set in CI), pass
`MONGODB_TEST_URI`:

```bash
MONGODB_TEST_URI="mongodb://127.0.0.1:27017/saveshop_merge_integration_test?replicaSet=rs0" \
  npm run test:integration:merge
```

Safety guards (the suite fails, it never skips or falls back to a non-transactional path):

- only `MONGODB_TEST_URI` is read; the development/production `MONGODB_URI` is never used;
- `NODE_ENV=production` is refused;
- the database name must contain `test`, and the suite deletes documents from that database before
  each test;
- a non-loopback host is refused unless `MONGODB_TEST_ALLOW_REMOTE=1` is set for a dedicated CI
  cluster;
- the URI must name a replica set (`?replicaSet=…`) and the connected server is checked for
  `setName`; otherwise the command exits non-zero.

Docker replica set (example, `mongosh` included in the image):

```bash
docker run -d --name saveshop-mongo-rs -p 27017:27017 mongo:8 --replSet rs0 --bind_ip_all
docker exec saveshop-mongo-rs mongosh --eval \
  "rs.initiate({_id:'rs0',members:[{_id:0,host:'127.0.0.1:27017'}]})"
```

Shut it down with `docker stop saveshop-mongo-rs && docker rm saveshop-mongo-rs`.

Troubleshooting:

- **Binary download blocked / offline:** use the Docker replica set above; the first
  `mongodb-memory-server` run needs to download `mongod` if it is not cached.
- **`not a replica set` error:** the server is standalone or the URI omits the replica set name.
  Re-initiate it (`rs.initiate(...)`) and include `?replicaSet=rs0`.
- **`Refusing to use database …`:** the database name did not contain `test`. Never point this
  command at a development or production database.
- **`Refusing to use non-loopback MongoDB host …`:** export `MONGODB_TEST_ALLOW_REMOTE=1` only for a
  dedicated CI test cluster.
- **`Transaction numbers are only allowed …`:** the target is not transactional; the suite fails
  rather than skipping.
- **Port already in use:** stop the conflicting `mongod` or use a different `MONGODB_TEST_URI`.
- On this Windows workspace, npm lifecycle scripts needed the Node installation directory
  (`C:\\Program Files\\nodejs`) on `PATH`.

Transaction tests vs standalone fallback tests:

- `npm test` → `adminMerge.test.ts` uses in-memory stores and asserts `transactionUsed: false`; it
  covers validation, idempotency and recovery logic, not MongoDB transactions.
- `npm run test:integration:merge` → the replica-set suite asserts `transactionUsed: true`, reads the
  committed/rolled-back documents directly, and would fail rather than skip if transactions were
  unavailable.

## 8. Audit trail

`catalogue_audit_events` is append-only (no update or delete API). Each event records actor id and
email, action, target type/id, previous and new state, reason, request id and timestamp. Covered
actions: login, failed login, provisioning, disable, password reset, stale/revoked session,
accept, reject, reassign, defer, reopen, and merge.

`previousState`/`newState` are built from an explicit allowlist of fields. Passwords, hashes, tokens
and secrets are never written. Failed sign-ins are recorded without an email in `actorEmail`, so the
trail does not become an account-existence oracle.

Read it with:

```bash
npm run admin -- audit --limit=50
# or, authenticated: GET /api/v1/admin/catalogue/audit?action=match.accepted&page=1&pageSize=50
```

## 9. Security limitations (explicit)

- **No multi-factor authentication.** A stolen password is sufficient until the account is disabled.
- **No refresh tokens or idle timeout** beyond the fixed TTL; there is no session list or remote
  "sign out everywhere" control other than disable/password reset, which revoke all sessions.
- **Per-process login throttle.** Horizontal scaling multiplies the allowed attempt rate.
- **No customer authentication yet.** "Ordinary user cannot reach admin routes" is enforced by
  requiring a live `catalogue_admin` account; a future customer token type must be rejected by the
  same verifier (a non-admin role is already refused, and there is a test for it).
- **Session token in `sessionStorage`.** It dies with the tab, and the app has no third-party
  scripts on the admin route, but a successful XSS on the origin would expose it. The API's
  authorisation is the real control.
- **No database-level immutability** on audit or decision collections. The application exposes no
  update/delete path; a database operator can still modify them. Use MongoDB role permissions and
  backups if that matters.
- **No distributed idempotency keys.** Duplicate review actions are prevented by the listing
  revision, not by a request-key store.
- **Review history is written after the listing update.** If the decision/audit append fails, the
  request returns 500; the listing then has a `review` block whose decision record is missing. This
  is detectable (`review.decidedAt` with no matching decision) but not automatically repaired.
- **No merge UI**; merges are API/CLI operations in this sprint.
- **Ingestion remains a CLI**, not an HTTP endpoint; review decisions are respected by ingestion but
  ingestion itself is still operator-run.

## 10. Incident checklist

1. `npm run admin -- disable --email=<account> --reason="suspected compromise"` — this revokes all
   sessions on the next request.
2. Rotate `ADMIN_JWT_SECRET` and restart the API to invalidate every outstanding token immediately.
3. Review `npm run admin -- audit --limit=200` for `admin.login`, `match.*` and `product.merged`
   events, including request ids to correlate with API logs.
4. If a merge was wrong, restore from the pre-merge backup; do not attempt to reverse references by
   hand without a snapshot.
