---
id: "007"
title: "Independent check that an enhanced photo has not changed the property"
stage: intent
status: draft          # draft | approved  (only a human changes this, via scripts/sdlc approve)
source: human          # human | maintain
caused_by: ""          # maintain items: NNN of the change that caused this, if known
owner: ""              # product owner or service owner who approves
created: "2026-10-05"
---

# Intent: Independent check that an enhanced photo has not changed the property

## Problem
ListingBoost's first principle is "make the photograph better, do not make the property
different" (Master Spec §13). Today that is enforced only on the way in: an enhancement request is
built from an allow-list of photographic operations and always carries the list of protected
characteristics (walls, windows, doors, fixtures, layout and so on), and free-text requests for
structural change are refused. Nothing checks the photo that comes back.

An image model can still alter a property while being asked not to: remove a radiator, straighten
a wall, change a window. If that happens, an "enhanced" photo could misrepresent a property in
published marketing, which is the harm the product exists to prevent.

The idea of an independent check came from pull request #128 (24 September 2026, the pre-rebuild
prototype). It proposed a verifier interface, separate from the generation provider, that compares
the source and output photos, and a fail-closed fallback that never approves an enhancement when no
real verifier is configured. The PR was closed on 2026-10-05 because it targeted the prototype's
code (DECISIONS D-001); the idea is captured here for the current code.

No enhancement provider is chosen yet (OD-1), so no enhanced photo is produced today, and there is
no evidence of the problem occurring in ListingBoost.

## Users affected
Estate agents who publish enhanced photos, and the people who view those listings. Agents carry the
legal and reputational risk of a misleading photo.

## Proposed outcome
Every enhanced photo is checked, by something independent of the model that produced it, for
changes to the property itself. A photo that may have changed the property is not presented as a
faithful enhancement: it is held for a person to compare with the original, or refused. When no
check is available, enhanced photos are never treated as verified.

## In scope
- A way to compare an enhanced photo with its source and report whether the property may have been
  changed, independent of the enhancement provider.
- What happens to the photo on each result: passed, needs a person to look, failed.
- What the agent sees: a clear indication on the asset, and a side-by-side comparison when a
  person must decide.
- A fail-closed default for when no checker is configured.
- Recording the check's result with the version (provenance), so it can be audited later.

## Out of scope
- Choosing the enhancement provider (OD-1).
- Virtual staging and other labelled visualisations, which are allowed to change the property
  because they are labelled (Master Spec §13). They may need their own checks later.
- Checking social posts and stories, which embed the original photo unchanged (D-018).
- Paid services or credentials, unless the owner approves them separately.

## Affected systems and teams
- The generation pipeline for enhanced photos (`packages/generation`, `packages/ai`).
- Review: how an enhanced photo is approved.
- Possibly a new provider decision (an image-comparison or computer-vision service).
- Product owner and engineering.

## Constraints
- The checker must be independent of the enhancement provider: the model that made a change cannot
  be the one that confirms there is none.
- Never invent facts or approve by default: when the check cannot run, the result is "needs a
  person", never "passed".
- Approved versions are immutable; checks apply to new versions.
- Provider-specific code lives only in `packages/ai` (AGENTS.md).
- Workers' memory and CPU limits apply to any comparison done in the Worker.
- No credentials or paid services without a separate owner decision.

## Success measures
- An enhanced photo whose output differs structurally from its source (for example a removed
  window, in a test fixture) is not shown as a verified enhancement: yes/no.
- With no checker configured, no enhanced photo is ever marked as verified: yes/no.
- Each enhanced version records which check ran, its version and its result: yes/no.

## Open questions
- What can do the comparison, and how well? A computer-vision service, an open model, or simple
  image measures (structural similarity, edge maps). This is a feasibility question; a spike is
  likely needed before a spec.
- Should this wait until an enhancement provider is chosen (OD-1)? Without one there are no
  enhanced photos to check, but the fail-closed rule could be built in first so that turning on a
  provider can never skip it.
- Who decides when the check says "needs a person": the agent who generated it, or an owner?
- What does it cost per photo, and who pays?

## Triage (maintain-sourced items only)
<!-- decision: fix-now | schedule | dismiss ; reason: ; decided_by: -->
