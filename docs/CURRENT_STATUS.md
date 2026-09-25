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
- **Agent-agnostic cloud development:** `scripts/setup.sh`, `bun run verify`,
  AGENTS.md + pointer files, devcontainer, Copilot setup steps, Claude Code
  SessionStart hook (docs/CLOUD_AGENTS.md).
- Worker entry fails closed on missing/weak configuration; Vite client shell;
  `bun run build` produces the client and a Worker dry-run bundle.

## Current requirement

R6 Campaigns and generation jobs (AT-06, AT-07 service level, AT-08,
AT-17, AT-20).

## Tests

| Suite | Passing | Failing |
| --- | --- | --- |
| unit | 157 | 0 |
| integration | 107 | 0 |
| security | 34 | 0 |
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
- R3: `Cannot find module '../../apps/web/server/app'`, and
  `Cannot find module '../../apps/web/server/index'` for the Worker entry.

## Known blockers

- Tag `legacy/prototype-final` exists locally only (session cannot push tags).
- 78 stale remote branches from the prototype. The session cannot delete them;
  the owner needs to delete them (command in the session summary).
- OD-1..OD-4 (Alex-Farley/listingboost#146–#149): providers, credentials,
  Cloudflare account.

## Next recommended task

R6 Campaigns + generation service with provider ports (test doubles only
for failure handling) → R8 review/approval API → R9 marketing pack → R11 web
app and E2E. R7 real providers are blocked on OD-1/OD-2.

## Outstanding decisions

See DECISIONS.md "Open decisions" and the decision issues.
