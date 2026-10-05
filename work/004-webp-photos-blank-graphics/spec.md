---
id: "004"
stage: spec
status: draft
intent: intent.md
policies_applied: []
---

# Spec: WebP property photos render as graphics with no photo

## Summary

The renderer cannot decode WebP, so a WebP primary photo produces social posts and stories with no
photograph and no error. Stop that in three places: new WebP photos are converted to JPEG in the
agent's browser before upload, so the Worker never receives WebP; any WebP photo already stored is
refused by the renderer with a plain message instead of a blank graphic; and the Images tab marks
existing WebP photos and says how to fix them. A render test per accepted format proves the photo
is actually drawn.

## Requirements

| ID | Requirement | Serves (intent section) |
|----|-------------|-------------------------|
| R1 | No graphic is ever produced without its photograph. If a source photo cannot be drawn, the job fails with a message saying why and what to do; it does not complete. | Proposed outcome; Success measures |
| R2 | When an agent adds or replaces a photo with a WebP file in the web app, it is converted to JPEG in their browser before upload, at the same pixel size, and stored as JPEG. The agent does nothing extra. | Proposed outcome; In scope; Constraints (Worker memory) |
| R3 | The server no longer accepts WebP for property photos. A WebP sent straight to the API is refused with a message to use JPEG or PNG. | Proposed outcome; In scope; Constraints |
| R4 | A WebP photo already stored is marked on the Images tab, with what it affects and how to fix it. | In scope (existing campaigns: how the agent finds and remakes them) |
| R5 | For each accepted photo format, a test fails if the photograph is missing from a rendered graphic. | In scope (a check that would have caught this); Success measures |
| R6 | The slideshow Reel is checked with WebP photos, since it draws photos in the browser rather than the Worker. | Open questions (Reel) |

## User journeys

1. **New WebP photo.** An agent drops `kitchen.webp` on the Images tab. The browser converts it to
   JPEG and uploads that. The tile shows the photo as usual, and the file is named `kitchen.jpg`.
   If conversion fails (a corrupt file, or a browser that cannot decode WebP), the agent is told
   that file could not be added and why; other files in the same drop still upload.
2. **Existing WebP photo.** An agent opens the Images tab of a listing that already has a WebP
   photo. That tile carries a notice: "WebP photos can't be used on social posts or stories. Upload
   a JPEG or PNG version of this photo." Nothing else changes.
3. **Generating with an old WebP primary photo.** The square post, portrait post and story fail
   with: "This photo is in WebP format, which can't be used on graphics. Add a JPEG or PNG version,
   make it the primary photo, and create a new campaign." No blank graphic is made.
4. **The Reel** is made from WebP photos as from any other photo.

Why a new campaign: a campaign keeps the photos it was planned with, and a photo used by a
campaign cannot be replaced or deleted (D-010). So the old campaign cannot be pointed at a new
photo; a new campaign picks up the new primary photo.

## Design decisions

| Decision | Alternatives considered | Why this one | Decision record |
|----------|-------------------------|--------------|-----------------|
| Convert WebP to JPEG in the browser before upload, at quality 0.92 and the original pixel size, and stop the server accepting WebP photos. | Convert in the Worker; refuse WebP and ask the agent to convert; use the Cloudflare Images binding. | A 40-megapixel photo needs about 160 MB to decode, more than a Worker has. Every supported browser decodes WebP already. Cloudflare Images depends on OD-4. Pending owner decision (flagged concern 1). | Amends D-009; proposed D-023. |
| JPEG, not PNG, for converted photos. | PNG (lossless). | A large photo as PNG would often exceed the 25 MB upload limit. JPEG at 0.92 re-encodes the pixels without changing what the photo shows. | Proposed D-023. |
| The renderer refuses a WebP source photo by its stored content type, before drawing. | Draw it once to check, as logos are (D-020). | Decoding a large photo to check it costs the same memory problem. The content type is known and exact. | Proposed D-023. |
| The refusal is permanent for that job (not retried) and uses a new safe error code, `photo_format_unsupported`. | Retry. | Retrying cannot succeed; the existing retry policy treats non-transient errors this way. | Existing D-013. |
| Old WebP photos are flagged, not converted automatically. | Convert stored WebP in the Worker or with a migration. | Same memory limit; and changing stored originals would break D-010's rule that assets trace back to the exact bytes they were made from. | Proposed D-023. |
| Graphics already made without their photo are left as they are. | Mark them on the asset cards. | Approved versions are immutable, and there is no production deployment yet, so only preview test data can be affected. Pending owner decision (flagged concern 2). | n/a |

## Cognitive load

The service carries the work: conversion happens on drop with nothing to choose; the failure on
an old photo says exactly what to do next.

| Theme / law | Decision | Alternative rejected |
|-------------|----------|----------------------|
| Effort | WebP files upload as they do today; conversion is silent. | Asking the agent to convert files themselves. |
| Decisions | None added. | A "convert this file?" prompt. |
| Memory | The notice sits on the affected photo's tile, and the failure message names the fix. | A general help page. |
| Progress and endings | A graphic that cannot be made shows as failed with a reason, never as finished. | A blank graphic in review. |
| Forgiveness | A file that cannot be converted is reported by name and the rest of the drop still uploads. | Failing the whole drop. |
| Familiarity | Existing upload control, tile and error styles. | New controls. |

## Data

| Data item | Personal? | Classification | Stored where | Retention | Shared with |
|-----------|-----------|----------------|--------------|-----------|-------------|
| Converted photo (JPEG) | Possibly, as any property photo can show people or details | Confidential organisation media, as today | Private R2, `property_media` row with `content_type` image/jpeg | As existing photos | As existing photos |

No new data is collected. The original WebP file never leaves the browser. Browser conversion
drops embedded metadata (EXIF, location); that is no worse than today, and arguably better.

## Acceptance criteria

| ID | Requirement | Given | When | Then |
|----|-------------|-------|------|------|
| AC1 | R1, R5 | A square post, portrait post and story template, and a JPEG, a PNG and a WebP source photo | Each is rendered | For JPEG and PNG the output differs from a render with a blank photo, proving the photo is drawn; for WebP the renderer refuses |
| AC2 | R1 | A campaign whose primary photo is a stored WebP | Its graphics are generated | Each graphic version ends `failed` with code `photo_format_unsupported` and the message from journey 3; no output file is stored; the job is not retried |
| AC3 | R1 | The same campaign | Copy and the Reel are generated | They are unaffected |
| AC4 | R2 | An agent on the Images tab | They add a WebP file | The uploaded file is JPEG with the same width and height, its name ends `.jpg`, and the tile shows it |
| AC5 | R2 | An agent replaces a photo with a WebP file | The replacement uploads | It is stored as JPEG, as in AC4 |
| AC6 | R2 | A WebP file that cannot be decoded | The agent adds it with two good files | The bad file is reported by name with a reason; the two good files upload |
| AC7 | R3 | A WebP sent directly to the photo upload API | The request is handled | It is refused with 400 and a message naming JPEG and PNG; nothing is stored |
| AC8 | R3 | The Images tab | The agent opens the file picker | JPEG, PNG and WebP are still offered |
| AC9 | R4 | A listing with a stored WebP photo and a JPEG photo | The Images tab is opened | Only the WebP tile carries the notice from journey 2, linked to the tile for assistive technology |
| AC10 | R6 | A listing with WebP photos already stored | The slideshow Reel is made in the browser (E2E, Chromium) | Each frame contains its photo |
| AC11 | R2 | A JPEG produced by conversion | It is validated by the server | It passes the existing D-009 checks unchanged |

## Service levels

No change.

## Flagged concerns

No `policy-*` skills are installed.

| Policy | Conflict | Options | Owner | Resolution |
|--------|----------|---------|-------|------------|
| Product decision | How new WebP photos are handled. | (a) Convert in the browser to JPEG (this spec). (b) Refuse WebP and ask the agent to convert. (c) Convert in the Worker with a pixel cap (WebP photos over about 12 megapixels refused). | Product owner | Open. Recommended (a). |
| Product decision | Graphics already made without their photo. | (a) Leave them; preview holds only test data (this spec). (b) Mark them on the asset cards as "made without its photo". | Product owner | Open. Recommended (a). |
| Decision record | D-009 accepts WebP photos; this stops the server accepting them. | Record D-023 amending D-009 when the spec is approved. | Engineering | Proposed. |

## Open questions

- Very large photos: the renderer already decodes the full photo for every graphic. A 40-megapixel
  JPEG may itself exceed Worker memory. That is separate from WebP and not in this intent; it should
  be checked on preview and, if real, captured as its own item.
- Should a JPEG produced by conversion be named `.jpg` or keep the original name? This spec renames
  it, so the name matches the format.
