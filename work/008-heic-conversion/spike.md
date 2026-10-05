---
id: "008"
title: "Spike: where HEIC photos can be converted"
stage: spike
route: spike
status: done           # exploring | done   (spike code never merges; only this file does)
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
**Answer:** not in the Worker. Either through the Cloudflare Images binding (recommended) or in
the agent's browser with libheif. Both handle a 48-megapixel photo; each has a cost to accept.
About half the one-day timebox was used. Spike code is in `spike/heic/` on this branch.

### Test images
- `autumn_1440x960.heic`, Nokia's public HEIF sample (293 KB). Used locally only; its licence is
  Nokia's HEIF licence, so it is not committed.
- Synthetic `iphone-12mp.heic` (4032×3024, 5.5 MB) and `iphone-48mp.heic` (8064×6048, 22.7 MB),
  made with pillow-heif (libheif 1.23.4, x265) from a noisy synthetic picture. The noise makes them
  larger than real iPhone files, and they are single images, whereas iPhones save HEIC as a grid
  of tiles. **Not tested with a real iPhone photo.**

### 1. In the Worker: not viable
libheif-js 1.23.5 (libheif and libde265 compiled to WebAssembly; 1.46 MB, 484 KB gzip; no runtime
code generation found) decodes all three in Bun (`bench.mjs`):

| File | Decode time | Peak memory of the process |
|------|-------------|---------------------------|
| 1440×960 | 0.25 s | 147 MB |
| 12 MP | 1.5 s | 252 MB |
| 48 MP | 5.8 s | 729 MB |

A Worker has 128 MB in total. The decoded pixels alone are 48 MB for 12 MP and 194 MB for 48 MP,
before the decoder's own buffers, so even a 12 MP photo does not fit with room to spare, and 48 MP
cannot fit. libheif cannot decode at a reduced size. It was not run on workerd, because the memory
figures already decide it.

### 2. In the agent's browser: works, with three costs
`browser.mjs`, Chromium (Playwright), libheif-js decode, then `OffscreenCanvas` to JPEG at 0.92:

| File | Decode | Decode and JPEG | JPEG size |
|------|--------|-----------------|-----------|
| 1440×960 | 0.2 s | 0.2 s | 0.6 MB |
| 12 MP | 1.4 to 1.5 s | 1.6 s | 2.0 MB |
| 48 MP | 5.9 to 6.0 s | 6.6 to 6.8 s | 7.4 MB |

Costs:
- **Security policy.** With the site's policy (`default-src 'self'`), Chromium refuses to compile
  any WebAssembly: "Compiling or instantiating WebAssembly module violates the following Content
  Security policy directive because 'unsafe-eval' is not an allowed source". Adding
  `'wasm-unsafe-eval'` to `script-src` makes it work, and allows WebAssembly only, not JavaScript
  `eval`.
- **Licence.** libheif and libde265 are LGPL-3.0. Shipping them to browsers brings LGPL
  obligations (offering the source, allowing the library to be replaced). HEVC is patent-encumbered
  (pools such as Access Advance and Via LA); whether a free software decoder shipped to users needs
  a licence is a legal question this spike cannot answer.
- **Devices.** Not measured on phones or low-memory laptops. A 48 MP decode needs several hundred
  MB in the tab. Safari decodes HEIC natively and iOS usually hands websites a JPEG already, so the
  decoder matters most on Chrome, Edge and Firefox on computers. Firefox and Safari were not tested.

### 3. Cloudflare Images binding: fits, from the documentation (not run)
From Cloudflare's documentation, read 2026-10-05:
- Input formats include HEIC ([limits and formats](https://developers.cloudflare.com/images/get-started/limits/)).
- Limits: 100 MP image area, 12,000 px per side; **the binding's `.input()` takes at most 20 MB.**
  A 48 MP photo is 8064×6048, within the area and side limits.
- In a Worker: `env.IMAGES.input(stream).output({ format: "image/jpeg" }).response()`, with an
  `images` binding in the Wrangler config ([binding](https://developers.cloudflare.com/images/optimization/binding/)).
- Price: 5,000 unique transformations a month free, then $0.50 per 1,000, on an Images paid plan;
  over the free allowance without one, new transformations fail with error 9422
  ([pricing](https://developers.cloudflare.com/images/pricing/)). One conversion per uploaded
  photo, so about $0.0005 a photo beyond the free allowance.
- Local development: plain `wrangler dev` uses a low-fidelity offline version that supports only
  resize, rotate and format; the documentation recommends `wrangler dev --remote` for features
  "including HEIC support". So automated tests cannot prove HEIC conversion offline; a contract
  check against the real service would be needed.

Costs: an account setting and possibly a paid plan (OD-4); the 20 MB input limit (real iPhone 48 MP
files are usually well under it, not verified); and a dependency on a Cloudflare service for every
HEIC upload. Cloudflare, not ListingBoost, ships the decoder, so the licence and patent questions
move to them.

### Not tested
A real iPhone HEIC (grid tiles); Firefox and Safari; phones; the Images binding itself (needs the
Cloudflare account); libheif on workerd.

## Recommendation
**Owner decision, 2026-10-05: Cloudflare Images.**

**Full route, in work item 006**, choosing the Cloudflare Images binding, subject to one check
first: convert a real iPhone HEIC (12 MP and 48 MP) through the binding on the preview account.
That needs the owner to enable Images on the Cloudflare account (OD-4) and takes minutes once it
is on.

Why the binding over the browser:
- The server stays the one place that decides what a stored photo is, as for every other format.
- No change to the site's security policy and no LGPL or HEVC decoder shipped by ListingBoost.
- It works the same on every browser and device.

If the owner prefers no Cloudflare dependency or cost, the browser route is proven to work in
Chromium and is the fallback, with the security-policy change, the LGPL obligations and the patent
question accepted explicitly.

Converting in the Worker is ruled out by memory.

Proposed for `docs/DECISIONS.md` when 006's spec is approved: "D-0xx · HEIC photos are converted
to JPEG by the Cloudflare Images binding at upload; the original HEIC is not stored. Converting in
the Worker does not fit its memory; converting in the browser needs `'wasm-unsafe-eval'` and ships
an LGPL, patent-encumbered decoder."

Spike code on this branch is throwaway and must not be merged.
