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

Requires [Bun](https://bun.sh) (version in `.bun-version`).

```bash
bun install
bun run test         # unit + integration + security
bun run typecheck
bun run lint
```

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
