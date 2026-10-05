---
id: "006"
title: "Accept HEIC (iPhone) photos"
stage: intent
status: approved
source: human          # human | maintain
caused_by: ""          # maintain items: NNN of the change that caused this, if known
owner: ""              # product owner or service owner who approves
created: "2026-10-05"
approved_by: "Alex Farley <37551336+Alex-Farley@users.noreply.github.com>"
approved_on: "2026-10-05T11:01:27Z"
approved_sha256: 3b5b031d42a9369f65152f2b0d31c9565407febbc306f4a9001d3f0f92f41972
---

# Intent: Accept HEIC (iPhone) photos

## Problem
iPhones save photos as HEIC by default. ListingBoost refuses HEIC property photos (DECISIONS D-009:
"Animated formats, GIF, SVG and HEIC are rejected"), so an agent who copies photos from an iPhone
to a computer and uploads them is told the format is not supported.

The product owner decided on 2026-10-05 that HEIC photos should be accepted. This came up while
work item 004 (WebP photos rendering blank) compared photo formats.

What is known, and what is not:
- When a photo is chosen in a browser on the iPhone itself, iOS usually hands the site a JPEG, so
  this mostly affects photos moved to a computer first (AirDrop, iCloud Photos download, cable).
  This is general knowledge, not measured on ListingBoost.
- There is no data on how many agents hit this. Production has not been deployed.
- Nothing in ListingBoost can read HEIC today: the graphics renderer (resvg) cannot, and of the
  major browsers only Safari can. So accepting HEIC means converting it somewhere, and HEIC
  photos are usually 12 to 48 megapixels.

## Users affected
Estate agents who take listing photos on an iPhone and upload them from a computer. How many is
not known.

## Proposed outcome
An agent can add an iPhone HEIC photo to a listing and it works everywhere a JPEG does: preview,
social posts, stories, the Reel and the marketing pack. Nothing is produced with the photo
silently missing.

## In scope
- Adding and replacing property photos supplied as HEIC (`.heic`, `.heif`).
- Converting HEIC to a format every part of ListingBoost can use, without changing what the photo
  shows.
- Clear messages when a HEIC file cannot be used (for example, too large or damaged).

## Out of scope
- WebP photos: handled by work item 004, which refuses them.
- HEIC logos (logos are covered by D-020).
- Live Photos' video component, depth data and other HEIC extras beyond the still image.
- RAW formats (DNG, ProRAW).

## Affected systems and teams
- Photo upload validation (`packages/storage`) and the Images tab.
- Wherever conversion happens: the agent's browser, the Worker, or an external service.
- Product owner and engineering.

## Constraints
- Workers have about 128 MB of memory. Decoding a 48-megapixel image needs about 190 MB, so
  converting large HEIC photos inside the Worker as it stands is not possible without limits.
- HEIC uses HEVC compression, which carries patent licensing. Any decoder ListingBoost ships, or
  any service it uses, has licence and patent terms the owner must accept. Not yet assessed.
- Of the major browsers only Safari decodes HEIC, so browser-side conversion would need a decoder
  shipped to the browser (several megabytes, same licensing question).
- Enhancement and conversion never change what the property looks like (property truth).
- Stored photos stay traceable to the exact bytes graphics were made from (D-010).
- The Cloudflare Images binding (mentioned in D-009) depends on OD-4. No new provider credentials
  are authorised by this intent.

## Success measures
- An iPhone HEIC photo (12 megapixels, and the largest size iPhones produce) can be added, appears
  on the Images tab, and produces a social post, a story and a Reel frame containing the photo:
  yes/no.
- A HEIC file that cannot be used is refused with a message that says why: yes/no.
- No asset is ever produced without its photo: yes/no.

## Open questions
- Where should conversion happen: in the browser with a shipped decoder, in the Worker with a
  size cap, or through a service such as Cloudflare Images? This is a feasibility question;
  a spike (`sdlc-spike`) is likely needed before a spec.
- Is the HEVC licensing position acceptable for each option?
- Convert to JPEG (smaller, re-encoded) or PNG (lossless, often over the 25 MB upload limit)?
- How large a HEIC must be supported? Recent iPhones can save 48-megapixel photos.

## Triage (maintain-sourced items only)
<!-- decision: fix-now | schedule | dismiss ; reason: ; decided_by: -->
