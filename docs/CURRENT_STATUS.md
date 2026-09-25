# Current status

_Last updated: 2026-09-25_

## Phase

Phase 0 (test & architecture foundation) complete → Phase 1 (foundation) in
progress.

## Completed

- Legacy prototype removed from the rebuild branch; preserved at `073c83e`
  on `main` (D-001).
- Docs: MASTER_SPEC, ARCHITECTURE, DECISIONS, TEST_PLAN, ACCEPTANCE_TESTS,
  AGENT_RULES, CURRENT_STATUS.
- Toolchain: Bun, TypeScript 6 (strict), ESLint, CI workflow.
- **R1 Domain rules** (unit level): AT-07 lifecycle, AT-10 final selection,
  AT-15 copy truth, AT-16 property truth (request level), AT-17 version
  numbering, AT-18 immutability guard, AT-03 property input validation.

## Current requirement

R2 Database foundation: schema, migrations, SQLite test harness,
tenant-scoped repositories (AT-02, AT-09, AT-16/AT-18 DB enforcement).

## Tests

| Suite | Written | Passing | Failing |
| --- | --- | --- | --- |
| unit | 132 | 132 | 0 |
| integration | 0 | – | – |
| security | 0 | – | – |
| e2e | 0 | – | – |

RED evidence for R1: all 5 unit files failed with
`Export named '…' not found in module packages/domain/src/index.ts` before
the domain was implemented.

## Known blockers

- Tag `legacy/prototype-final` exists locally only (session cannot push tags).
- OD-1..OD-4 in DECISIONS.md (providers, credentials, Cloudflare account).

## Next recommended task

R2 Database → R3 Auth → R4 Properties API → R5 Media.

## Outstanding decisions

See DECISIONS.md "Open decisions".
