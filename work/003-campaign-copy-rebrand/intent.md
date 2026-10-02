---
id: "003"
title: "Copy a campaign with current branding"
stage: intent
status: draft          # draft | approved  (only a human changes this, via scripts/sdlc approve)
source: human          # human | maintain
caused_by: ""          # maintain items: NNN of the change that caused this, if known
owner: ""              # product owner or service owner who approves
created: "2026-10-01"
---

# Intent: Copy a campaign with current branding

## Problem
Work item `work/001-brand-settings` (branch `sdlc/001-brand-settings`) makes
each campaign keep the branding that was current when it was created, including
when an asset in it is regenerated. That keeps every asset in a campaign
consistent, but it leaves an agency that changes its logo, colours, fonts or
contact details with no way to bring an existing campaign up to date. Today the
only route would be to create a new campaign from nothing and redo any edits
made to the wording.

The product owner raised this on 2026-10-01 while deciding how a rebrand should
treat existing campaigns, and chose a copy action over letting regeneration
pick up new branding. There is no evidence yet from agencies about how often
they rebrand or how many campaigns they would want to update.

## Users affected
Estate agency owners and team members who have campaigns created before a
change to their brand settings. How many organisations this affects, and how
often, is not known. The action must be usable by keyboard and with assistive
technology.

## Proposed outcome
From an existing campaign, a user can create a copy that uses the
organisation's current brand settings and preferred templates throughout. The
copy starts with the original's final wording so edits are not lost, and the
original campaign is left exactly as it was.

## In scope
- A copy action on a single campaign, producing a new campaign for the same
  listing.
- The copy captures the organisation's brand settings and preferred templates
  as they are when the copy is made, in the same way a new campaign does.
- The copy uses the listing's photos and recorded facts as they are when the
  copy is made, not as they were for the original.
- The original's final wording for each piece of copy is brought into the new
  campaign as its starting text.
- Every asset in the copy, including the carried-over wording, needs review
  and approval again before it counts as approved.
- The original campaign, its approved assets and its marketing pack are left
  unchanged and remain available.
- Telling the user plainly what the copy will and will not bring across before
  they confirm.

## Out of scope
- Copying several campaigns at once, or an "apply new branding to all
  campaigns" action. This may follow as a later item if agencies ask for it.
- Archiving or otherwise changing the original campaign as part of the copy.
  The user can archive it themselves.
- Carrying approvals across. Nothing in the copy starts as approved.
- Reproducing the original's photos or facts where the listing has since
  changed.
- Changing branding on an existing campaign in place, or making regeneration
  pick up new branding. Decided against in `work/001-brand-settings`.
- Copying a campaign to a different listing or a different organisation.

## Affected systems and teams
- Campaign creation and planning, and the brand capture introduced by
  `work/001-brand-settings`.
- Generation of graphics and copy for the new campaign.
- Review, where carried-over wording appears for re-approval.
- The listing workspace in the web application, where the action is offered.
- Product owner and engineering.

## Constraints
- Depends on `work/001-brand-settings` being built first; without the brand
  capture there is nothing for a copy to refresh.
- Every read and write uses the organisation scope from the signed-in session.
  A campaign in another organisation cannot be copied and is reported as not
  found.
- Approved asset versions are immutable. The copy must not change any version,
  stored file or approval in the original campaign.
- Property-truth rules apply to the copy as to any campaign. Carried-over
  wording may state something the listing no longer records (an old price, for
  example); the existing copy-truth check must flag that for the reviewer and
  the product must not present such wording as approved or checked.
- Unavailable capabilities or preferred templates are reported honestly in the
  copy, as in any new campaign.
- No provider credentials are needed or authorised by this work.
- Follow the existing architecture and accessible design direction in the
  repository docs.

## Success measures
- A user can copy a campaign and the copy's graphics use the organisation's
  current logo, colours, fonts and contact details: yes/no.
- After a copy, every asset version, stored file and approval in the original
  campaign is identical to before: yes/no.
- Wording that was final in the original appears as the starting text in the
  copy, and none of it is approved until a user approves it: yes/no.
- A user with wording edits in the original reaches a reviewable copy without
  retyping any of them: yes/no.

## Open questions
- Who may copy a campaign: any member of the organisation, as with creating a
  campaign today, or owners only? Assumed any member; not yet confirmed.
- What counts as the "final wording" when a piece of copy in the original was
  never approved: its latest version, or nothing, so that it is generated
  afresh?
- Should the copy and the original show a link to each other, so a user can
  tell which campaign replaced which?
- What should the copy be named by default, and can the user change the name
  when copying?
- If the listing now has no photos, a new campaign cannot be created today.
  Should the copy be refused with that explanation, as campaign creation is?

## Triage (maintain-sourced items only)
<!-- decision: fix-now | schedule | dismiss ; reason: ; decided_by: -->
