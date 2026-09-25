# Current status

_Last updated: 2026-09-25_

## Phase

Phase 1 (foundation) in progress.

## Completed

- **Phase 0:** legacy prototype removed from the rebuild branch (preserved at
  `073c83e` on `main`, D-001); docs set; Bun + strict TypeScript + ESLint;
  CI workflow; 30 legacy GitHub issues closed, new backlog opened
  (epic Alex-Farley/listingboost#134).
- **R1 Domain rules** (Alex-Farley/listingboost#135): lifecycle, final-version
  selection, versioning, immutability guard, property truth, copy truth,
  property input validation.
- **R2 Database schema** (Alex-Farley/listingboost#136): all spec entities; composite
  organisation foreign keys; lifecycle trigger mirroring the domain;
  approved-version immutability trigger; visualisation label CHECK. Tested on
  real SQLite and applied successfully to local D1 through Wrangler.
- **R3 Auth** (Alex-Farley/listingboost#137): sign-up/sign-in/sign-out/session, PBKDF2,
  hashed session tokens in `__Host-` cookies, CSRF, D1 rate limits, security
  headers, safe errors. Smoke-tested on `wrangler dev` (workerd + local D1).
- **R4 Properties** (Alex-Farley/listingboost#138): scoped CRUD/archive, per-fact
  provenance, history list with search/filter/cursor pagination.
- **R5 Media** (Alex-Farley/listingboost#139): upload validation on real image fixtures,
  R2 storage port, reorder/primary/replace/delete, HMAC-signed file URLs.
  Verified on `wrangler dev` with local R2.
- **R6 Campaigns & generation** (Alex-Farley/listingboost#140): versioned data-driven
  templates (seeded by generated migration 0002), campaign asset plan,
  generation service (CAS job claim, leases, backoff retries, copy-truth
  and output checks, provenance, R2 outputs), queue consumer + Cron sweeper,
  progress view, regeneration as new versions, honest `unavailable`
  reporting. Verified on `wrangler dev`.
- **Deploy pipeline** (`.github/workflows/deploy.yml`, docs/DEPLOYMENT.md):
  preview on push to `main`, production manual; config generated from GitHub
  Environment variables; queue created if missing; signing secret generated
  once; guarded preview reset of the prototype D1 with backup (rehearsed on
  local D1 including restore); smoke test.
- **Agent-agnostic cloud development:** `scripts/setup.sh`, `bun run verify`,
  AGENTS.md + pointer files, devcontainer, Copilot setup steps, Claude Code
  SessionStart hook (docs/CLOUD_AGENTS.md).
- Worker entry fails closed on missing/weak configuration; Vite client shell;
  `bun run build` produces the client and a Worker dry-run bundle.

## Current requirement

R8 Review API: approve, reject, edit text (new version), discard, version
history (AT-10, AT-17, AT-18 at API level).

## Tests

| Suite | Passing | Failing |
| --- | --- | --- |
| unit | 179 | 0 |
| integration | 132 | 0 |
| security | 43 | 0 |
| e2e | – | – |

RED evidence:
- R1: `Export named '…' not found in module packages/domain/src/index.ts`.
- R2: `SQLiteError: no such table: organisations` (73 failing). The first
  GREEN run then caught a real defect: `disclosure_label = …` let NULL through
  the CHECK; fixed with `IS`.
- R4: 15 of 16 property tests failed (routes absent).
- R5: validator tests failed with `Cannot find module '@listingboost/storage'`;
  25 of 28 media tests failed. GREEN then exposed the API header wrapper
  overwriting the download sandbox CSP (fixed).
- R6: `Cannot find module '@listingboost/templates' / '@listingboost/generation' /
  '@listingboost/ai'`; worker `queue`/`scheduled` handlers "is not a function".
- Deploy scripts: `Cannot find module` for both; the local D1 rehearsal then
  exposed D1's stricter DROP TABLE behaviour and the prototype's FK cycle (D-015).
- R3: `Cannot find module '../../apps/web/server/app'`, and
  `Cannot find module '../../apps/web/server/index'` for the Worker entry.

## Known blockers

- Tag `legacy/prototype-final` exists locally only (session cannot push tags).
- 78 stale remote branches from the prototype. The session cannot delete them;
  the owner needs to delete them (command in the session summary).
- OD-1..OD-3 (Alex-Farley/listingboost#146–#148): provider choices and keys. Until then
  production generation reports every capability as unavailable.
- The rebuild is on branch `claude/sleepy-albattani-ppkz75`; nothing deploys until it is
  merged to `main`. The first preview deploy after merge performs the approved reset.

## Next recommended task

R8 review/approval API → R9 marketing pack → R11 web app, E2E and deploy
workflow. R7: template renderer and slideshow reel can be built without
external providers; enhancement and copy adapters are blocked on OD-1/OD-2.

## Outstanding decisions

See DECISIONS.md "Open decisions" and the decision issues.
