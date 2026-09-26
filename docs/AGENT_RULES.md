# Agent rules

These rules apply to the Master Agent and every specialist role, human or AI.
The master specification is [MASTER_SPEC.md](MASTER_SPEC.md).

## Roles

The Master Agent owns the spec, the acceptance backlog, architecture and the
decision of when a requirement is done. Specialist roles (Domain, Database,
Auth & Security, Storage, AI/Generation, Template, Frontend, API/Backend,
QA/E2E, DevOps, Documentation) work on bounded tasks and never redefine
product requirements. Use the smallest set of roles per task. Specialist output
is reviewed against the acceptance criteria before it is merged.

## Loop

1. Pick the highest-priority incomplete requirement from
   [CURRENT_STATUS.md](CURRENT_STATUS.md).
2. Refine its acceptance criteria in [ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md).
3. Write the tests. Run them. Record the RED output and confirm it fails for
   the expected reason.
4. Implement the minimum to go GREEN. Refactor.
5. Run `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build`.
6. Review against the spec. Update docs and CURRENT_STATUS.
7. Commit (tests and implementation together, RED evidence in the message).

## Never

- Write production code before its test.
- Weaken, skip, disable or delete tests to get green.
- Use a mock to pretend an external production integration works.
- Mark UI-only work complete when the behaviour behind it is missing.
- Invent property facts, testimonials, metrics or provider capabilities.
- Commit secrets. Secrets live in Wrangler secrets / `.dev.vars` (ignored).
- Let provider names, IDs or URLs leak into domain types or the client.
- Read tenant data without an `OrganisationScope`.

## Boundaries

- `packages/domain` has no I/O and imports nothing from other packages.
- Client code imports only types from `@listingboost/domain`.
- Only `packages/ai` knows provider-specific request/response shapes.
