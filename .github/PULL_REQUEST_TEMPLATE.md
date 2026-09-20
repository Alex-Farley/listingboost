## Summary

- [ ] Change is scoped to one coherent purpose
- [ ] Tests cover behaviour changes
- [ ] Documentation reflects any architecture or operational changes
- [ ] Related GitHub issue is updated where appropriate
- [ ] No secrets, customer data or generated local files are committed

## Verification

- [ ] `bun test`
- [ ] `bun run typecheck`
- [ ] `bun run lint`
- [ ] `bun run build`
- [ ] Relevant verification scripts run

## Production safety

- [ ] No production billing/payment configuration changed
- [ ] No production secrets changed
- [ ] No destructive production migration performed
- [ ] No customer data deleted

## Architecture

- [ ] New production code does not introduce a new Higgsfield/FNF architectural dependency
- [ ] Provider-specific details remain behind the provider boundary
- [ ] Media ownership and customer download paths remain ListingBoost-controlled
