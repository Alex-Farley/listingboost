---
id: "{{ID}}"
title: "{{TITLE}}"
stage: spike
route: spike
status: exploring      # exploring | done   (spike code never merges; only this file does)
timebox: "1 day"       # agree this before starting; stop when it runs out
branch: "spike/{{ID}}-{{SLUG}}"
created: "{{DATE}}"
---

# Spike: {{TITLE}}

<!-- A spike answers one question fast. The code is throwaway: it stays on the spike branch and is
     never merged. Only this file, with its findings, is merged (via a PR you review). -->

## The question
<!-- One question. e.g. "Can we read the DfE schools API fast enough to show results as users type?" -->

## Why it matters
<!-- What decision this unblocks. -->

## Timebox
<!-- e.g. 1 day. When it runs out, stop and write up what you know. -->

## Approach
<!-- What you will try, in order. -->

## Not doing
<!-- Production quality, tests, accessibility polish: none of these are the point of a spike. -->

## Findings
<!-- What you learned, with evidence (numbers, links to the spike branch commits, screenshots). -->

## Recommendation
<!-- One of: full route (scripts/sdlc new <slug>), small change, or drop it - and why.
     Significant design choices found here should become an ADR (scripts/sdlc adr "<title>"). -->
