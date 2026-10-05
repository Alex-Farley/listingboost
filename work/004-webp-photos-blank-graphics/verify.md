---
id: "004"
stage: verify
status: ready-for-review   # draft | ready-for-review
---

# Verify: WebP property photos render as graphics with no photo

## Verify command
```
$ scripts/sdlc verify        (2026-10-05, sdlc/004-webp-photos-blank-graphics, main merged in)
$ bun test --timeout 30000 tests/unit tests/integration tests/security tests/ui
 757 pass
 0 fail
 7285 expect() calls
Ran 757 tests across 51 files. [114.52s]
Total Upload: 4794.04 KiB / gzip: 1584.87 KiB
sdlc verify: PASSED

$ bun run test:e2e           (workerd via wrangler dev, Chromium)
  3 passed (26.3s)           AT-13 full journey; AT-22 brand settings; AT-05 WebP decode in the browser
```

## Acceptance criteria and TDD evidence

Times are UTC on 2026-10-05, from `tdd.log`.

| AC | Test | RED | GREEN | Result |
|----|------|-----|-------|--------|
| AC1 (drawn) | `template-renderer.test.ts` "a … photo appears in every graphic template": JPEG, progressive JPEG and PNG, six templates each, output must differ from a blank-photo render | 11:31:16 (by mutation: photo layer made undecodable) | 11:31:57 | pass |
| AC1 (refused) | `template-renderer.test.ts` "a WebP photo is refused, never drawn blank" | 11:32:15 | 11:33:26 | pass |
| AC2, AC3 | `generation.test.ts` "a stored WebP primary photo never becomes a blank graphic" | 11:33:58 | 11:34:09 | pass |
| AC6, AC7 | `image-validation.test.ts`, `logo-validation.test.ts` | 11:34:33 | 11:34:52 | pass |
| AC4 (API), AC5, AC6 | `media.test.ts` "WebP photos are refused at the API" | 11:35:22 (by mutation: WebP re-allowed) | 11:35:22 | pass |
| AC4 (page), AC8, AC9 | `images.test.tsx` "WebP photos on the Images tab" | 11:35:39 | 11:35:53 | pass |
| AC10 | `journey.spec.ts` "the Reel's in-browser decode step reads a WebP photo at full size" | never seen failing (browser behaviour, not our code) | 11:36:30 | pass |

Weaker evidence:
- **AC10** checks the decode step the Reel uses (`createImageBitmap` in Chromium), not a whole Reel
  made from a stored WebP photo, because new WebP photos can no longer be uploaded. It was never
  seen failing.
- **AC4 on the page**: "a WebP is refused by name while the other files upload" passed before the
  page changed, because the server's message already reached the page; its RED came from the
  other two tests in that block.

## UX checks

| Page | Method | Flags | Fixed / accepted (reason) |
|------|--------|-------|---------------------------|
| Images tab | Automated UI tests (refusal message by file name, picker formats, notice tied to the tile) | None | n/a |
| Campaign, graphics | Automated: the failure message is the safe message from the spec | None | n/a |

Not covered: a visual check of the notice on a tile, and a screen-reader pass.

## Refactoring done
None needed.

## Deviations from the plan
- **Three existing tests changed**, because the approved spec changes the behaviour:
  - `tests/unit/image-validation.test.ts`: the two WebP photo fixtures moved from "accepted" to
    "refused"; "truncated WebP" moved to `logo-validation.test.ts`, where WebP is still accepted.
  - `tests/integration/media.test.ts`: "first photo is primary; later photos are appended in
    order" used a WebP as its third photo; it now uses a progressive JPEG. The assertions are
    unchanged.
  - `tests/integration/template-renderer.test.ts`: "renders PNG and WebP source photos too" only
    checked the output width, which is how the bug went unnoticed. It now covers PNG; drawing is
    proven by the new tests.
- **`apps/web/client/src/styles.css`** (not listed): one rule for the tile notice.
- **The test run is about 40 s longer** (114 s against 70 s), from rendering every template twice
  per photo format. Recorded in review.md.

## Evals added
None. The drawing tests guard this class of problem for every accepted format.

## Manual checks for the reviewer
1. On the Images tab, add a `.webp` file with a `.jpg`: the WebP is refused by name; the JPEG uploads.
2. The file picker offers JPEG and PNG only.
