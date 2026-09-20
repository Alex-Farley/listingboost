# Contributing to ListingBoost

ListingBoost is being developed as a staged migration from a Higgsfield-hosted prototype to a standalone production product. Repository hygiene is therefore part of the engineering work: changes should make the migration easier to understand, review and safely continue.

## Workflow

1. Start from an up-to-date `main`.
2. Create a focused branch using a descriptive name such as `feat/...`, `fix/...`, `refactor/...` or `chore/...`.
3. Keep commits focused and explain the reason for non-obvious architectural changes.
4. Add or update tests with behaviour changes.
5. Update the relevant documentation and GitHub issue when a change alters an architecture boundary, migration state or operational procedure.
6. Open a pull request against `main`.
7. Do not merge while required CI checks are failing.
8. After merge, verify that the resulting `main` commit is the intended source for any deployment.

## Before a pull request

Run:

```bash
bun test
bun run typecheck
bun run lint
bun run build
```

Run the adaptation and verification checks when relevant:

```bash
bun run check:adapted
bun run verify:build
bun run verify:landing-artwork
```

Do not bypass a failing check by weakening the test, suppressing a type error or adding an unrelated exception. Fix the underlying issue or document a deliberate, reviewed exception.

## Architecture boundaries

Production domain code must not introduce new dependencies on:

- `fnf.internal`
- `window.hf`
- Higgsfield customer/workspace identity
- Higgsfield website credits
- provider-specific IDs or URLs as customer/domain identity

Provider SDKs and credentials belong behind server-side adapters. Customer-facing campaign state, billing, identity, persistence and retained media belong to ListingBoost.

The legacy FNF integration may remain where it is required by the hosted prototype during migration. New production code should not deepen that dependency.

## Database and media changes

- Add additive migrations for schema changes.
- Preserve backwards compatibility during the migration unless a destructive change has been explicitly reviewed and authorized.
- Keep ownership checks server-side.
- Treat D1 as authoritative application state.
- Treat ListingBoost-owned R2 as the canonical retained media store once provisioned.
- Do not make a provider-hosted URL the permanent customer download dependency.
- Record provenance and cost information separately from customer-facing product abstractions.

## Security and production safety

Never commit secrets, API keys, customer data or local environment files.

Do not make production changes involving real money, payment configuration, secrets, destructive migrations or customer data deletion as part of an ordinary code PR without explicit authorization.

## Documentation hygiene

When a document is superseded:

- retain the old document only when it provides useful historical context;
- clearly identify the current source of truth;
- update links from README and other documentation;
- do not leave conflicting current instructions in multiple places.

When a feature is not production-ready, say so explicitly rather than describing the intended architecture as if it were already deployed.
