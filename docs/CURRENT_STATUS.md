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
- Worker entry fails closed on missing/weak configuration; Vite client shell;
  `bun run build` produces the client and a Worker dry-run bundle.

## Current requirement

R4 Properties API (AT-02 API level, AT-03), then R5 Media.

## Tests

| Suite | Passing | Failing |
| --- | --- | --- |
| unit | 132 | 0 |
| integration | 82 | 0 |
| security | 15 | 0 |
| e2e | – | – |

RED evidence:
- R1: `Export named '…' not found in module packages/domain/src/index.ts`.
- R2: `SQLiteError: no such table: organisations` (73 failing). The first
  GREEN run then caught a real defect: `disclosure_label = …` let NULL through
  the CHECK; fixed with `IS`.
- R3: `Cannot find module '../../apps/web/server/app'`, and
  `Cannot find module '../../apps/web/server/index'` for the Worker entry.

## Known blockers

- Tag `legacy/prototype-final` exists locally only (session cannot push tags).
- 78 stale remote branches from the prototype. The session cannot delete them;
  the owner needs to delete them (command in the session summary).
- OD-1..OD-4 (Alex-Farley/listingboost#146–#149): providers, credentials,
  Cloudflare account.

## Next recommended task

R4 Properties → R5 Media (upload validation, R2 storage port, signed URLs) →
R6 Campaigns and generation jobs.

## Outstanding decisions

See DECISIONS.md "Open decisions" and the decision issues.
