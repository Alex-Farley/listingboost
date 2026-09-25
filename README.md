# ListingBoost

AI-powered property marketing for UK estate agents.

> One property. Every piece of marketing you need.

Property → Photography → AI processing → Marketing assets → Review → Download.

**Status:** clean rebuild in progress (see [docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md)).
Not yet deployable as a product.

## Principles

- *We enhance the photograph. We never change the property.* Staging or
  redesign is only produced as a labelled visualisation.
- Marketing copy may only state facts the agent has recorded.
- Every organisation's data is isolated server-side and in the database.
- Built test-first.

## Development

```bash
bash scripts/setup.sh   # pinned Bun, dependencies, local secret, local D1 schema
bun run verify          # typecheck + lint + tests + build
bun run dev:worker      # http://localhost:8787
```

Any coding agent (Claude Code, Codex, Jules, Copilot, Cursor, Gemini) or a
Codespace can develop this repository: see [AGENTS.md](AGENTS.md) and
[docs/CLOUD_AGENTS.md](docs/CLOUD_AGENTS.md).

## Documentation

| Document | Purpose |
| --- | --- |
| [MASTER_SPEC](docs/MASTER_SPEC.md) | Product and engineering specification |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | Structure, tenancy, state machines, truth rules |
| [DECISIONS](docs/DECISIONS.md) | Decision log and open product decisions |
| [TEST_PLAN](docs/TEST_PLAN.md) | Test layers, infrastructure, commands |
| [ACCEPTANCE_TESTS](docs/ACCEPTANCE_TESTS.md) | Acceptance backlog and criteria |
| [AGENT_RULES](docs/AGENT_RULES.md) | Engineering loop and rules |
| [CURRENT_STATUS](docs/CURRENT_STATUS.md) | Progress, blockers, next task |
| [CLOUD_AGENTS](docs/CLOUD_AGENTS.md) | Running development with cloud coding agents |
