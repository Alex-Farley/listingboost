---
id: "004"
stage: plan
status: approved
spec: spec.md
risk: routine          # routine (engineer approves) | higher (tech lead approves)
branch: "sdlc/004-webp-photos-blank-graphics"
approved_by: "Alex Farley <37551336+Alex-Farley@users.noreply.github.com>"
approved_on: "2026-10-05T11:29:54Z"
upstream_sha256: 975e33f8d6df6bfbe1ace3f10b02164a9064efcea5eb4875df4feac2289b8d8a
approved_sha256: 6c3e7259b582db8195cc130f2493a6a0b2b17c75c8ca94da676d864363ce6d6b
---

# Plan: WebP property photos render as graphics with no photo

Risk is **routine**: no migration, no auth, no personal data, no new dependency. It narrows which
photo formats are accepted and adds a guard in generation.

## Files changing

| Path | Change | Requirement |
|------|--------|-------------|
| `packages/storage/src/image-validation.ts` | `ImageUploadPolicy` gains the formats it accepts. `PHOTO_POLICY` accepts JPEG and PNG; a WebP photo is refused with its own code, `photo_format_unsupported`, and the message from spec journey 1. | R2 |
| `packages/storage/src/logo-validation.ts` | `LOGO_POLICY` keeps accepting WebP (logos are converted, D-020). | R2 (no change for logos) |
| `packages/ai/src/adapters/template-renderer.ts` | `render()` refuses a WebP photo with a non-retryable `ProviderError("photo_format_unsupported")` before drawing. | R1 |
| `packages/generation/src/service.ts` | Before calling any graphics provider, a WebP source photo fails the job with `photo_format_unsupported` (not retried); the safe message from spec journey 3 is added to `SAFE_MESSAGES`. Provider-independent, so it holds for test doubles and any future renderer. | R1 |
| `apps/web/client/src/pages/Images.tsx` | File picker accepts JPEG and PNG; hint updated; a stored WebP photo's tile shows the notice from journey 2, tied to the tile with `aria-describedby`. | R3, R4 |
| `tests/unit/image-validation.test.ts` | WebP photo cases move from "accepted" to "refused". JPEG and PNG cases unchanged. | R2 |
| `tests/integration/media.test.ts` | The WebP upload case expects 400; a disguised WebP is refused; replacement with WebP is refused. | R2 |
| `tests/integration/template-renderer.test.ts` | "renders PNG and WebP source photos too" becomes: JPEG and PNG photos are drawn (output differs from a blank-photo render), WebP is refused. | R1, R5 |
| `tests/integration/generation.test.ts` | A stored WebP primary photo fails the three graphics with the safe message, no output, no retry; copy unaffected. | R1 |
| `tests/ui/images.test.tsx` | Refused WebP named in the error; other files upload; notice on a stored WebP tile only; picker offers JPEG and PNG. | R2, R3, R4 |
| `tests/support/` | A helper to insert a stored WebP photo directly (the API now refuses one), for the generation and UI tests. | R1, R4 |
| `tests/e2e/journey.spec.ts` | Checks in Chromium that the slideshow's decode path (`createImageBitmap`) reads a WebP photo at full size. | R6 |
| `docs/DECISIONS.md`, `ACCEPTANCE_TESTS.md`, `CURRENT_STATUS.md` | D-023 (amends D-009); AT-05 photo formats; status. | all |

## Test strategy

- **Unit:** photo and logo validation per format.
- **Integration:** upload and replace through the API; the real renderer for drawing proof; the
  generation service with a stored WebP photo.
- **UI:** the real Images page against the real API.
- **E2E:** one browser check for the Reel's decode path (R6). Limitation: the E2E cannot add a WebP
  photo any more, so it checks the decode step the Reel uses rather than a whole Reel made from a
  stored WebP. A stored WebP photo can only come from before this change, on preview.
- **Changed existing tests:** the WebP-accepted cases in `image-validation.test.ts`,
  `media.test.ts` and `template-renderer.test.ts` change because the approved spec changes the
  behaviour. Each is listed in verify.md with the reason; no other assertion changes.

## Order of work (test-driven: red, green, refactor for every step)

| Step | Behaviour (AC) | Test first: name, file, type | Code change |
|------|----------------|------------------------------|-------------|
| 1 | AC1 (drawing proof) | "JPEG and PNG source photos are really drawn in every graphic template", `tests/integration/template-renderer.test.ts`, integration. Expected to pass at once: it proves the guard has not broken drawing. RED by mutation (blank the photo layer). | None. |
| 2 | AC1 (refusal) | "a WebP source photo is refused before drawing", same file. | Renderer guard. |
| 3 | AC2, AC3 | "a stored WebP primary photo fails each graphic with the safe message, stores nothing and is not retried; copy is unaffected", `tests/integration/generation.test.ts`. | Service guard and safe message; test helper. |
| 4 | AC6, AC7 | WebP photo refused (named type, disguised as `.jpg`); JPEG and PNG unchanged; WebP logo still accepted, `tests/unit/image-validation.test.ts`, `tests/unit/logo-validation.test.ts`, unit. | Policy formats; `PHOTO_POLICY`; `LOGO_POLICY`. |
| 5 | AC4, AC5, AC6 | API upload and replacement with WebP refused, nothing stored, original unchanged, `tests/integration/media.test.ts`. | None beyond step 4 expected. |
| 6 | AC4, AC8, AC9 | Images tab: WebP refused by name while the other files upload; picker and hint name JPEG and PNG; notice only on a stored WebP tile, `tests/ui/images.test.tsx`. | `Images.tsx`. |
| 7 | AC10 | Chromium decodes a WebP photo at 800×600 through `createImageBitmap`, `tests/e2e/journey.spec.ts`. Expected to pass at once (browser behaviour, not our code); recorded as such. | None. |
| 8 | all | Docs only. | D-023, AT-05, status. |

## Release strategy

- Strategy: direct. Small and reversible.
- Rollback: revert the merge commit. No data changes.

## Risks and alternatives

- **An agent with a WebP photo is now refused** where before it was accepted (and then drawn
  blank). The message says what to do. This is the owner's decision.
- **Guard by content type only.** A WebP mislabelled as JPEG cannot be stored: upload validation
  checks magic bytes against the declared type (D-009).
- **The Reel check is indirect** (step 7); see Test strategy.

## Can run in parallel

Steps 1 to 3 (rendering and generation) and steps 4 to 6 (upload and page) are independent.

## Questions a reviewer should ask

1. Is checking the content type enough, or should the renderer also refuse other formats it cannot
   decode? (JPEG and PNG are the only others accepted, and both are drawn.)
2. Is the indirect Reel check acceptable, given no new WebP photo can be uploaded?

<!-- Deviations during build are logged in verify.md, not here: this file is fixed once approved. -->
