# ListingBoost: instructions for coding agents

This file is the single source of instructions for every coding agent (Claude
Code, OpenAI Codex, Google Jules/Gemini, GitHub Copilot, Cursor, Devin, …) and
for humans. Tool-specific files (`CLAUDE.md`, `GEMINI.md`,
`.github/copilot-instructions.md`) only point here.

## Read first

1. [docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md): where the project is, the next task, blockers
2. [docs/AGENT_RULES.md](docs/AGENT_RULES.md): TDD loop, the never-list, boundaries
3. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): structure, tenancy, state machines, truth rules
4. [docs/ACCEPTANCE_TESTS.md](docs/ACCEPTANCE_TESTS.md): acceptance backlog and criteria
5. [docs/MASTER_SPEC.md](docs/MASTER_SPEC.md): the full product and engineering specification

## Setup and commands

```bash
bash scripts/setup.sh    # idempotent: Bun (pinned), deps, .dev.vars, local D1 schema
bun run verify           # typecheck + lint + all tests + build: must pass before any commit
bun run test             # unit + integration + security + UI
bun run build && bun run test:e2e   # Playwright full journey on wrangler dev (see docs/TEST_PLAN.md)
bun run dev:worker       # API + built client on http://localhost:8787 (wrangler dev)
bun run dev              # Vite client on :5173, proxies /api to :8787
```

No external credentials are needed to develop or run the test suite.

## Non-negotiables (summary; details in AGENT_RULES.md)

- Test first. Record RED, then implement to GREEN. Never weaken, skip or delete tests.
- Every tenant query takes an `OrganisationScope` from the session. Cross-tenant access is a 404.
- Never invent property facts. Enhancement never changes the property; visualisations are labelled.
- Provider-specific code lives only in `packages/ai`. No secrets in the repo.
- Update `docs/CURRENT_STATUS.md` and `docs/ACCEPTANCE_TESTS.md` with each completed requirement.
- Work on a branch and open a PR; CI must be green.

The pre-rebuild Higgsfield/FNF prototype is history only (commit `073c83e`,
docs/DECISIONS.md D-001). Do not reintroduce its packages or boundaries.
