---
name: sdlc-setup
description: Explains the ListingBoost adaptation of the AI-native delivery workflow and checks its local setup. Use when onboarding to the workflow or checking its commands and boundaries.
---

# SDLC setup for ListingBoost

This repository already has its product requirements, architecture, agent rules,
test plan and acceptance backlog. Those documents are authoritative; do not
replace or regenerate them from generic workflow templates.

## Repository-specific setup

- Full verification is `bun run verify` (`.sdlc/config` also exposes it through
  `scripts/sdlc verify`).
- Start a full work item from the default branch with
  `scripts/sdlc new <slug> "<title>"`. For eligible routine work, use
  `scripts/sdlc new <slug> "<title>" --small`.
- The command creates a numbered `work/NNN-slug/` record and a corresponding
  `sdlc/NNN-slug` branch. Deliver through a reviewable PR. Do not merge it.
- Humans own approval gates. Agents can draft artifacts and report which human
  approval is needed; they do not run `scripts/sdlc approve`.
- Follow `docs/AGENT_RULES.md` for test-first work, tenancy and product
  boundaries. Follow `docs/ARCHITECTURE.md` and `docs/MASTER_SPEC.md` for design.
- No optional policy pack, provider credential, AI review job, Git hook,
  branch-protection change or scheduled maintenance job is enabled here.

## Check the installation

Run `scripts/sdlc status` to inspect work items and `scripts/sdlc verify` to
run the full verification command. The SDLC helper's other features do not
replace the repository's GitHub workflow, `bun run verify`, or PR rules.
