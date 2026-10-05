---
id: "004"
stage: spec
status: approved
intent: intent.md
policies_applied: []
approved_by: "Alex Farley <37551336+Alex-Farley@users.noreply.github.com>"
approved_on: "2026-10-05T11:14:32Z"
upstream_sha256: 20b310129cfbeeda41d026b3aea2f77ff2ae02cf378fdeed8782217596ca07e7
approved_sha256: 975e33f8d6df6bfbe1ace3f10b02164a9064efcea5eb4875df4feac2289b8d8a
---

# Spec: WebP property photos render as graphics with no photo

## Summary

The renderer cannot decode WebP, so a WebP primary photo produces social posts and stories with no
photograph and no error. Stop that in three places: new WebP photos are refused at upload with a
clear message; any WebP photo already stored is refused by the renderer with a plain message
instead of a blank graphic; and the Images tab marks existing WebP photos and says how to fix them.
A render test per accepted format proves the photo is actually drawn.

## Requirements

| ID | Requirement | Serves (intent section) |
|----|-------------|-------------------------|
| R1 | No graphic is ever produced without its photograph. If a source photo cannot be drawn, the job fails with a message saying why and what to do; it does not complete. | Proposed outcome; Success measures |
| R2 | WebP is no longer accepted for property photos. Adding or replacing a photo with a WebP file is refused with a message to use JPEG or PNG, in the web app and at the API. | Proposed outcome ("told plainly at the right moment"); Out of scope (format change, as the chosen fix) |
| R3 | The Images tab offers only the formats that are accepted, and its hint says so. | Proposed outcome |
| R4 | A WebP photo already stored is marked on the Images tab, with what it affects and how to fix it. | In scope (existing campaigns: how the agent finds and remakes them) |
| R5 | For each accepted photo format, a test fails if the photograph is missing from a rendered graphic. | In scope (a check that would have caught this); Success measures |
| R6 | The slideshow Reel is checked with WebP photos, since it draws photos in the browser rather than the Worker. | Open questions (Reel) |

## User journeys

1. **New WebP photo.** An agent drops `kitchen.webp` on the Images tab. It is refused with:
   "kitchen.webp: WebP photos can't be used on social posts or stories. Upload a JPEG or PNG."
   Other files in the same drop still upload. The file picker and hint list JPEG and PNG.
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
| Refuse WebP photos at upload with a clear message. | Convert to JPEG in the browser; convert in the Worker with a pixel cap; the Cloudflare Images binding. | WebP is a minority case for listing photos, mostly images saved from websites. Refusing is the least code and is honest. Browser conversion can be added later if agents ask. Owner decision 2026-10-05. | Amends D-009; proposed D-023. |
| The renderer refuses a WebP source photo by its stored content type, before drawing. | Draw it once to check, as logos are (D-020). | Decoding a large photo to check it hits the Worker memory limit. The content type is known and exact. | Proposed D-023. |
| The refusal is permanent for that job (not retried) and uses a new safe error code, `photo_format_unsupported`. | Retry. | Retrying cannot succeed; the retry policy already treats non-transient errors this way. | Existing D-013. |
| Old WebP photos are flagged, not converted. | Convert stored WebP in the Worker or by migration. | Same memory limit; and changing stored originals would break D-010's rule that assets trace back to the exact bytes they were made from. | Proposed D-023. |
| Graphics already made without their photo are left as they are. | Mark them on the asset cards. | Approved versions are immutable, and there is no production deployment, so only preview test data can be affected. Owner decision 2026-10-05. | n/a |

## Cognitive load

The service says plainly, at the moment it matters, what will not work and what to do instead.

| Theme / law | Decision | Alternative rejected |
|-------------|----------|----------------------|
| Effort | One message per refused file, naming it; the rest of the drop still uploads. | Failing the whole drop. |
| Decisions | None added. | A "convert this file?" prompt. |
| Memory | The notice sits on the affected photo's tile, and the failure message names the fix. | A general help page. |
| Progress and endings | A graphic that cannot be made shows as failed with a reason, never as finished. | A blank graphic in review. |
| Forgiveness | The file picker offers only accepted formats, so most agents never see the refusal. | Offering WebP and then refusing it. |
| Familiarity | Existing upload control, tile and error styles. | New controls. |

## Data

No data is collected, stored or shared differently. Fewer formats are accepted.

## Acceptance criteria

| ID | Requirement | Given | When | Then |
|----|-------------|-------|------|------|
| AC1 | R1, R5 | A square post, portrait post and story template, and a JPEG, a PNG and a WebP source photo | Each is rendered | For JPEG and PNG the output differs from a render with a blank photo, proving the photo is drawn; for WebP the renderer refuses |
| AC2 | R1 | A campaign whose primary photo is a stored WebP | Its graphics are generated | Each graphic version ends `failed` with code `photo_format_unsupported` and the message from journey 3; no output file is stored; the job is not retried |
| AC3 | R1 | The same campaign | Copy and the Reel are generated | They are unaffected |
| AC4 | R2 | An agent on the Images tab | They add a WebP file with two JPEG files | The WebP is reported by name with the message from journey 1; the two JPEGs upload; nothing is stored for the WebP |
| AC5 | R2 | A photo already on a listing and not used by a campaign | The agent replaces it with a WebP file | The replacement is refused with the same message and the original photo is unchanged |
| AC6 | R2 | A WebP sent directly to the photo upload API, with a WebP name and type or disguised as `.jpg` | The request is handled | It is refused with 400 and a message naming JPEG and PNG; nothing is stored |
| AC7 | R2 | JPEG and PNG photos, including the existing fixtures | They are uploaded | They are accepted exactly as before (D-009 checks unchanged) |
| AC8 | R3 | The Images tab | The agent opens the file picker and reads the hint | Only JPEG and PNG are offered and named |
| AC9 | R4 | A listing with a stored WebP photo and a JPEG photo | The Images tab is opened | Only the WebP tile carries the notice from journey 2, linked to the tile for assistive technology |
| AC10 | R6 | A listing with WebP photos already stored | The slideshow Reel is made in the browser (E2E, Chromium) | Each frame contains its photo |

## Service levels

No change.

## Flagged concerns

No `policy-*` skills are installed.

| Policy | Conflict | Options | Owner | Resolution |
|--------|----------|---------|-------|------------|
| Product decision | How new WebP photos are handled. | Convert in the browser; refuse; convert in the Worker. | Product owner | Resolved 2026-10-05: refuse with a clear message. |
| Product decision | Graphics already made without their photo. | Leave them; mark them on asset cards. | Product owner | Resolved 2026-10-05: leave them. |
| Decision record | D-009 accepts WebP photos; this stops accepting them. | Record D-023 amending D-009 when the spec is approved. | Engineering | Proposed. |

## Open questions

- Very large photos: the renderer already decodes the full photo for every graphic. A 40-megapixel
  JPEG may itself exceed Worker memory. That is separate from WebP and not in this intent; it should
  be checked on preview and, if real, captured as its own item.
- HEIC (iPhone) photos are also refused today. The owner has decided they should be accepted; that
  is captured separately as its own work item.
