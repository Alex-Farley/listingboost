---
id: "004"
title: "WebP property photos render as graphics with no photo"
stage: intent
status: approved
source: human          # human | maintain
caused_by: ""          # maintain items: NNN of the change that caused this, if known
owner: ""              # product owner or service owner who approves
created: "2026-10-02"
approved_by: "Alex Farley <37551336+Alex-Farley@users.noreply.github.com>"
approved_on: "2026-10-05T10:48:16Z"
approved_sha256: 20b310129cfbeeda41d026b3aea2f77ff2ae02cf378fdeed8782217596ca07e7
---

# Intent: WebP property photos render as graphics with no photo

## Problem
ListingBoost accepts JPEG, PNG and WebP property photos (DECISIONS D-009). When
a listing's primary photo is a WebP file, the social posts and stories made
from it contain no photograph: only the coloured panel and the text. Nothing
reports an error, so the asset reaches review looking like a finished graphic.

The renderer (resvg, DECISIONS D-018) cannot decode WebP, and it skips an image
it cannot decode without raising an error.

Evidence, from work item `work/001-brand-settings` on 2026-10-02:
- Rendering the existing version 1 square post from
  `tests/support/fixtures/images/photo-800x600.webp` and from the lossless WebP
  fixture produced a 14,621-byte PNG with no photo. The same render from the
  JPEG fixture was 48,181 bytes with the photo. The images were checked by eye.
- The existing test "renders PNG and WebP source photos too"
  (`tests/integration/template-renderer.test.ts`) checks only the output width,
  so it passes.
- The same gap was found and fixed for WebP logos in work item 001, by
  converting them to PNG at upload (DECISIONS D-020).

This was observed in tests and local renders. It has not been observed on the
preview deployment, and how many listings have a WebP primary photo is not
known.

## Users affected
Estate agents whose listing's primary photo was uploaded as WebP. They get
social posts and stories without the property in them. How many is not known.

## Proposed outcome
A listing with a WebP primary photo produces graphics that show the photo, or
the agent is told plainly at the right moment that it cannot be used. A graphic
is never produced with its photograph silently missing.

## In scope
- Social posts and stories made from a WebP photo, in every template version.
- Whatever else draws property photos through the same renderer.
- A check that would have caught this: a test that the photo is actually drawn,
  for each accepted photo format.
- Campaigns that already contain a photo-less graphic: how the agent finds and
  remakes them.

## Out of scope
- WebP logos, already handled in work item 001.
- The image-enhancement provider (OD-1).
- Changing which photo formats can be uploaded, unless that is the chosen fix.

## Affected systems and teams
- The template renderer in `packages/ai` and the generation service.
- Photo upload validation in `packages/storage`, if the fix is made at upload.
- Product owner and engineering.

## Constraints
- A photo may be up to 40 megapixels (D-009). Decoding that in a Worker needs
  about 160 MB, more than a Worker's memory, so the approach used for logos
  (decode and re-encode in the Worker) does not carry over as it stands.
- Enhancement never changes the property: any conversion must not alter what
  the photo shows.
- Approved asset versions are immutable; a fix applies to new versions.
- No provider credentials are authorised by this item. The Cloudflare Images
  binding mentioned in D-009 depends on OD-4.

## Success measures
- A square post, portrait post and story made from a WebP primary photo each
  contain the photo: yes/no, by a test that fails today.
- No accepted photo format can produce a graphic without its photo and without
  an error: yes/no.

## Open questions
- Which fix: convert WebP photos somewhere that has the memory for it, limit
  the size of WebP photos, stop accepting WebP for photos, or refuse to render
  and say why?
- Are there photo-less graphics already approved or downloaded on preview, and
  should agents be told?
- Does the browser-made slideshow Reel handle WebP photos correctly? It draws
  in the browser, which can decode WebP, but this has not been checked.

## Triage (maintain-sourced items only)
<!-- decision: fix-now | schedule | dismiss ; reason: ; decided_by: -->
