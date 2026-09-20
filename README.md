# ListingBoost

ListingBoost is a property-marketing campaign product that turns a verified property brief and source photography into a coordinated set of marketing assets.

> **Current status:** active development. The repository contains a working Higgsfield-hosted prototype while the production architecture is being migrated toward a standalone ListingBoost runtime. It is **not yet a production-ready paid service**.

## Product goal

The target customer journey is:

1. Create a property campaign from verified property information and source photography.
2. Generate the campaign's independent creative assets.
3. Pay ListingBoost directly.
4. Receive and later retrieve the finished campaign without needing a Higgsfield account, subscription or credits.

The intended production architecture is provider-neutral:

`Campaign → Asset Plan → Generation Orchestrator → Asset Specification → Generation Strategy → Provider Adapter → Provider API`

ListingBoost owns customer identity, campaign state, billing, generation economics, retained media and delivery. Generation providers are infrastructure dependencies behind server-side adapters.

## Current architecture

The repository is in a staged migration.

- **Application:** TanStack Start + React + TypeScript
- **Runtime target:** Cloudflare Workers
- **Authoritative application state:** Cloudflare D1
- **Retained production media:** Cloudflare R2 (migration in progress)
- **Async generation:** Cloudflare Queues/workers (migration in progress)
- **Generation boundary:** `src/lib/generation-provider.ts`
- **Legacy prototype integration:** Higgsfield/FNF

Higgsfield/FNF remains in the prototype so the existing hosted application can continue to work during migration. It is not the intended production domain boundary. New production code should use ListingBoost-owned interfaces and normalized types rather than Higgsfield identities, credits, workspaces, SDK types or provider URLs.

See [AGENTS.md](AGENTS.md) for the repository-level engineering contract and [docs/provider-architecture.md](docs/provider-architecture.md) for the provider boundary.

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/` | Application routes, UI and server/domain code |
| `tests/` | Unit and contract tests |
| `migrations/` | D1 schema migrations |
| `docs/` | Architecture, migration and commercial design documents |
| `scripts/` | Build/adaptation verification scripts |
| `packages/` | Vendored/workspace packages, including the legacy FNF integration |
| `public/` | Public application and owned landing assets |
| `.github/workflows/` | CI and merge lifecycle automation |
| `wrangler.jsonc` | Cloudflare Worker configuration |
| `app.manifest.json` | Current application capability manifest |

## Development

### Prerequisites

- [Bun](https://bun.sh/)
- Node-compatible development environment
- Access to the repository's required prototype/runtime services when working on those paths

Install dependencies:

```bash
bun install
```

Start the development server:

```bash
bun run dev
```

### Verification

Run the same core checks used by the repository:

```bash
bun test
bun run typecheck
bun run lint
bun run build
bun run verify:build
bun run verify:landing-artwork
```

The adaptation gate can also be run with:

```bash
bun run check:adapted
```

Some checks intentionally describe the current scaffold/prototype migration state; do not weaken a check simply to make CI green.

## Documentation

- [Provider architecture](docs/provider-architecture.md)
- [Media ownership migration](docs/media-ownership-migration.md)
- [Campaign cost specification v0.3](docs/campaign-cost-spec-v0.3.md)
- [Repository engineering contract](AGENTS.md)

Older design documents are retained where they provide migration history. When a newer version supersedes an older document, use the newer document as the current source of truth.

## Engineering principles

- Keep customer identity ListingBoost-owned.
- Keep campaign and asset state in ListingBoost-owned persistence.
- Keep provider-specific APIs behind server-side adapters.
- Store retained customer media in ListingBoost-controlled storage.
- Treat queues as transport, not the source of truth.
- Make asynchronous generation idempotent and independently retryable.
- Record provider provenance and cost data without leaking provider concepts into the customer experience.
- Never present unverified generation costs or provider availability as facts.
- Do not make production resource, billing or secret changes without explicit authorization.

## Commercial boundary

The initial commercial model is intended to be a one-off **£49 campaign**, subject to final verified unit economics and launch approval. Customers should not have to buy provider credits separately.

The repository's cost specification deliberately records unverified provider/API economics rather than inventing numbers. See [docs/campaign-cost-spec-v0.3.md](docs/campaign-cost-spec-v0.3.md).

## Contributing

Use small, focused branches and pull requests. Every change should leave the repository in a testable state and should explain any migration or architectural implications.

Before opening a PR:

```bash
bun test
bun run typecheck
bun run lint
bun run build
```

For architecture or production-boundary changes, update the relevant documentation and GitHub issue as part of the same change.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the repository workflow.
