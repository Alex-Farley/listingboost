---
name: sdlc-small
description: Small-change route of the delivery loop - one short change.md (why, what, acceptance criteria, plan) and one human approval instead of separate intent, spec and plan. Use for routine fixes and tweaks of about a day or less, or when someone says "small change", "quick fix" or "just a typo".
---

# Small-change route

Same audit trail, less ceremony. One file, one approval, then build, verify and review as normal.

## Does it qualify? All must be true
- Routine risk, about a day's work or less
- No new or changed personal data
- No auth, payments, infrastructure, migrations or protected paths
- No concern under any installed `policy-*` skill (e.g. nothing user-facing that affects accessibility
  in a way that needs new testing, nothing clinical, nothing touching money movement)

If any is false, or you are unsure, use the full route (`scripts/sdlc new <slug>`) and say why.

## Steps
1. `scripts/sdlc new <slug> --small` creates `work/NNN-slug/change.md` on branch `sdlc/NNN-slug`.
2. Ask only the questions you need, then fill in change.md: why (with evidence), what changes and
   what does not, Given / When / Then acceptance criteria, a short test-first plan, and tick the
   four qualification checks honestly. If the change alters a page's actions, questions or
   validation, add the relevant `sdlc-ux-review` acceptance criteria and plan the UX check.
3. **Stop at the gate.** Leave `status: draft`. The person approves:
   `scripts/sdlc approve work/NNN-slug change`.
4. Then follow `sdlc-build` (still red, green, refactor), `sdlc-verify` and `sdlc-review` as usual. The review is pinned to the
   approved change.md.

## If it grows
If during build it stops qualifying (it touches personal data, auth, a protected path, or is taking
much longer), stop, say so, and suggest moving to the full route. Do not quietly carry on.
