# Delivery workflow

ListingBoost adopts the core artifact-driven workflow from
[Alex-Farley/ai-native-sdlc](https://github.com/Alex-Farley/ai-native-sdlc),
adapted for this repository. The installed skills and helper are under
`.agents/skills/`, `.claude/skills/`, `.sdlc/` and `scripts/sdlc`.

## Sources of truth

The workflow artifacts help define and review individual changes. They do not
replace ListingBoost's product and engineering documentation:

- `docs/MASTER_SPEC.md` defines product and engineering requirements.
- `docs/ARCHITECTURE.md` defines system structure and invariants.
- `docs/AGENT_RULES.md` defines implementation and TDD rules.
- `docs/ACCEPTANCE_TESTS.md` and `docs/CURRENT_STATUS.md` define acceptance
  progress and the current product task.

When a generic workflow template disagrees with these documents, follow the
ListingBoost documents and record any material plan deviation in `verify.md`.

## Working a change

From the default branch, create a full work item with:

```sh
scripts/sdlc new <slug> "<short title>"
```

For routine, low-risk work that meets the qualification criteria in the
`sdlc-small` skill, use `scripts/sdlc new <slug> "<short title>" --small`.
The helper creates a numbered work folder and a work branch. Follow the stages
in `.agents/skills/sdlc-loop/SKILL.md`: intent, design/specification, plan,
test-first build, verification evidence, PR review and maintenance feedback.

Human approval is required at intent, spec, plan/change and review gates. The
agent drafts the artifact and waits at the gate. A human records an approval
from a terminal with `scripts/sdlc approve work/NNN-slug <artifact>`. The helper
does not enforce that approval unless its commands are used; Git hooks and CI
guardrails from the upstream pack are not installed.

Build each behavior test-first and record RED/GREEN evidence with
`scripts/sdlc red` and `scripts/sdlc green` after the plan or change is
approved. Keep tests and implementation together in the task commit, as
required by `docs/AGENT_RULES.md`. Run `bun run verify` before requesting PR
review. Update `docs/CURRENT_STATUS.md` and `docs/ACCEPTANCE_TESTS.md` when a
product requirement is completed.

Push the work branch and open a reviewable PR following the repository's
existing GitHub workflow. The author does not approve or merge their own PR.
After a human approves the review artifact, run
`scripts/sdlc check --merge-ready main` (or the configured default branch) to
confirm the approved review still covers the PR's code. `scripts/sdlc status`
reports artifact gates but does not detect later code changes against the
reviewed commit. Run the explicit check again after any later change. This
integration does not alter branch protection or deployment configuration.

## Deliberately inactive

The integration does not enable upstream optional policy packs, AI review,
external review credentials, Git hooks, test locking, GitHub Actions workflows,
branch protection changes, scheduled evals, or production monitoring jobs.
Enable those only through a separate, repository-specific decision and review.
