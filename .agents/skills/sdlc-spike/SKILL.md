---
name: sdlc-spike
description: Spike route of the delivery loop - a time-boxed, throwaway experiment to answer one question (feasibility, performance, an unfamiliar API or library) before anything is specified. Only the findings are merged. Use when someone says "spike", "prototype", "can we even do X", "try it out first", or when a spec would be guesswork.
---

# Spike route

For when you cannot write a sensible spec yet. Answer one question, fast, then decide.

## Steps
1. `scripts/sdlc new <slug> --spike` creates `work/NNN-slug/spike.md` on branch `spike/NNN-slug`.
2. With the person, fill in: **the question** (one), why it matters, the **timebox** (agree it,
   usually hours to two days), the approach, and what you are deliberately not doing.
3. Explore. Code quality, tests and polish are not the point: learning is. Commit as you go on the
   spike branch so the evidence is there. Protected paths, secrets and data rules still apply,
   and still no real personal or production data.
4. **Stop when the timebox runs out**, even if unfinished. Write the findings with evidence
   (numbers, commit links, screenshots) and a recommendation: full route, small change, or drop it.
   For a significant design choice, propose an entry in `docs/DECISIONS.md` using its existing
   format and approval process. Do not create a separate ADR file or use an unavailable helper
   command.
5. Set `status: done` in spike.md. The person opens a PR containing **only the work folder** (the
   findings). Treat spike code as throwaway; only reviewed findings and a recommendation belong in
   a follow-up work item. This repository does not install an automated spike-only CI guard.
6. If the recommendation is to build it, start a new work item and link the spike in its intent.

## Rules
- One question per spike. If a second question appears, note it as a follow-up spike.
- Never merge spike code, even if it works. Rebuild it test-first through the normal route.
