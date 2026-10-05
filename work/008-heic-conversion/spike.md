---
id: "008"
title: "Spike: where HEIC photos can be converted"
stage: spike
route: spike
status: exploring      # exploring | done   (spike code never merges; only this file does)
timebox: "1 day"       # agree this before starting; stop when it runs out
branch: "spike/008-heic-conversion"
created: "2026-10-05"
---

# Spike: where HEIC photos can be converted

<!-- A spike answers one question fast. The code is throwaway: it stays on the spike branch and is
     never merged. Only this file, with its findings, is merged (via a PR you review). -->

## The question
Where can an iPhone HEIC photo (12 and 48 megapixels) be turned into a JPEG that ListingBoost
can use: in the agent's browser, in the Worker, or through a service, and what does each cost in
size, memory, speed and licensing?

## Why it matters
Work item `work/006-heic-photos` (intent approved 2026-10-05) asks for HEIC photos to be
accepted. Nothing in ListingBoost can read HEIC today: the renderer (resvg) cannot, and only Safari
among the major browsers can. The spec cannot choose a design until it is known which of these
options works at all, and at what cost.

## Timebox
1 day, started 2026-10-05 at the owner's instruction ("start the HEIC spike").

## Approach
1. Get real HEIC test images, 12 MP and 48 MP, with a licence that allows testing.
2. **Browser:** decode HEIC with a WebAssembly decoder (libheif compiled for the browser) in
   Chromium, convert to JPEG with a canvas, and measure time, memory and download size.
3. **Worker:** the same decoder on workerd (`wrangler dev`): does it load (precompiled module,
   no runtime code generation), and does a 12 MP and a 48 MP photo fit in Worker memory?
4. **Service:** what Cloudflare Images (the binding named in D-009, pending OD-4) accepts as
   input, from its documentation.
5. **Licensing:** what licences and patent terms apply to each option, from public sources.

## Not doing
Production code, tests, UI. Any paid service sign-up or credentials. Legal advice: the licensing
findings are facts gathered for the owner, not a conclusion. Live Photos, depth data, RAW formats.

## Findings
<!-- What you learned, with evidence (numbers, links to the spike branch commits, screenshots). -->

## Recommendation
<!-- One of: full route (scripts/sdlc new <slug>), small change, or drop it - and why.
     For significant design choices, propose an entry in docs/DECISIONS.md using its existing
     format and approval process; do not create a separate ADR file. -->
