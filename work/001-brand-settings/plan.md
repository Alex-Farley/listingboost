---
id: "001"
stage: plan
status: draft
spec: spec.md
risk: higher          # routine (engineer approves) | higher (tech lead approves)
branch: "sdlc/001-brand-settings"
---

# Plan: R10 brand settings and templates

Risk is **higher**: a migration that backfills existing campaigns, a role check,
file uploads of untrusted SVG and font files, and personal data in contact
fields.

The work is six slices. Each slice leaves `bun run verify` green and is one or
more commits, so the single PR can be read slice by slice.

## Files changing

| Path | Change | Requirement |
|------|--------|-------------|
| `migrations/0003_brand_settings.sql` (new) | Tables `brand_logos` and `brand_fonts` with composite organisation keys; `brand_settings.logo_id`; `campaigns.brand_snapshot_json`; backfill of every existing campaign from its organisation's current settings; `preferred_templates_json` default becomes `{}`. | R5, R6, R8, R10 |
| `migrations/0004_brand_templates.sql` (new, generated) | Version 2 of `social-square`, `social-portrait`, `story`; version 1 of `social-square-full`, `social-portrait-full`, `story-full`. | R9, R10 |
| `packages/domain/src/brand.ts` (new), `index.ts` | Pure field validation (spec "Field validation" table), `BrandSnapshot` type, font reference parsing (`preset:<id>` / `custom:<id>`), WCAG contrast ratio and the 3:1 warning rule. | R3, R4, R13 |
| `packages/storage/src/image-validation.ts` | Take the size and dimension limits as a policy argument so photos keep D-009 limits and logos get their own. No behaviour change for photos. | R5 |
| `packages/storage/src/logo-validation.ts`, `svg-safety.ts`, `font-validation.ts` (new), `object-store.ts`, `index.ts` | Logo policy (2 MiB, PNG/JPEG/WebP); strict SVG allowlist check with its own small tokenizer; font size, extension, signature, `fvar` (variable) detection and decoded-size cap; `objectKeys.logo` and `objectKeys.font`. | R5, R6 |
| `packages/ai/vendor/woff2/` (new, generated), `scripts/build-woff2-decoder.ts` (new) | Script takes the pinned `woff2-encoder@2.0.0` dev dependency, extracts its WebAssembly and applies the two loader changes from spike 002, failing if either anchor is missing. Output and the MIT notices are committed. | R6 |
| `packages/ai/src/adapters/brand-assets.ts` (new), `ports.ts`, `index.ts` | `BrandAssetProcessor` port and adapter: rasterise a checked SVG to PNG (resvg), decode WOFF2 (vendored decoder), test-render a font (satori). Kept in `packages/ai` because the renderer libraries live there. | R5, R6 |
| `packages/ai/src/ports.ts`, `adapters/fact-copywriter.ts` | `BrandVoice` loses `toneOfVoice`; gains `officeAddress` and `fonts: { heading, body }` as bytes or null. | R7, R9 |
| `packages/ai/src/adapters/template-renderer.ts` | Layout chosen by template config (`split` or `full-photo`); draws the logo; registers captured fonts with bundled fallback; shows only the brand fields the template declares. Version 1 rendering path is left intact. | R9, R10 |
| `packages/templates/src/templates.ts`, `plan.ts` | Catalogue holds all versions, each tagged with the migration that seeds it; `templateSeedSql(migration)`; new versions and Full photo templates; `selectableTemplates(slot)`; `planCampaignAssets(photos, preferences)` resolves the newest version and marks an unavailable preference. | R10 |
| `packages/database/src/brand.ts` (new), `jobs.ts`, `campaigns.ts`, `index.ts` | Scoped read/update of settings, logo and font records, restore, hide; `createCampaign` writes the snapshot; `getCampaignBrandSnapshot`. `getBrandSettings` moves here from `jobs.ts`. | R1, R3, R5, R6, R8 |
| `packages/generation/src/service.ts` | `context()` reads the campaign snapshot and loads logo and font bytes by reference; tone no longer in the copy request or `parametersJson`; a retired preferred template is reported unavailable. | R7, R8, R9, R10, R11 |
| `apps/web/server/routes/brand.ts` (new), `app.ts`, `context.ts`, `auth/session.ts`, `media/signed-urls.ts`, `routes/files.ts` | `GET`/`PUT /api/brand-settings`; `POST .../logo`; `POST .../logos/:id/restore`; `POST .../fonts`; `DELETE .../fonts/:id`. `requireOwner` helper returns 403 for members. New signed-URL kind `logo`. Preset font source added to the context. | R1 to R6, R10, R13 |
| `apps/web/server/routes/campaigns.ts`, `routes/review.ts` | Campaign creation captures the snapshot and preferences; manual-edit warnings use the snapshot's brand strings. | R8, R9, R10 |
| `apps/web/client/public/fonts/` (new), `wrangler.jsonc`, `apps/web/server/index.ts` | Preset font files and their licence files as static assets; `ASSETS` binding so the Worker can fetch them. | R6 |
| `apps/web/client/src/pages/BrandSettings.tsx` (new), `AppShell.tsx`, `routes.tsx`, `api.ts`, `types.ts`, stylesheet | The settings page and its sidebar link. | R2 to R6, R10, R12, R13 |
| `tests/**` | New and extended tests named in "Order of work". `tests/support` gains a seeded-member helper and font and logo fixtures. | all |
| `docs/DECISIONS.md`, `ARCHITECTURE.md`, `ACCEPTANCE_TESTS.md`, `CURRENT_STATUS.md` | D-020 to D-022; brand capture and upload rules; AT-22 ticked as criteria pass. | all |

## Test strategy

- **Unit (most):** field validation with input variants per field, contrast,
  SVG safety, logo and font validation, template catalogue and planning, layout
  functions (`graphicLayout` returns a node tree, so text and placement are
  asserted without rendering), decoder build script, font licence files.
- **Integration:** real SQLite and the in-process Worker (`createTestApp`):
  routes, snapshot, generation, migration backfill, real satori/resvg renders.
- **Security:** cross-tenant and member-role denial for every new route.
- **UI:** the real React page against the real in-process API (`tests/ui`),
  covering labels, error association, focus, announcements, read-only view.
- **E2E (one extension to the existing journey):** on workerd, upload an SVG
  logo and a WOFF2 font, create a campaign, generate, and assert a rendered
  post exists. This is the only proof that SVG rasterising and WOFF2 decoding
  work on the real runtime, as the E2E does for satori (D-018).
- **Manual, recorded in verify.md:** Chromium at 390 px and desktop for AC35;
  a screen-reader pass of the page (not automatable here); visual check of
  both layouts in all three ratios.
- No contract tests: nothing external is called.

## Order of work (test-driven: red, green, refactor for every step)

**Slice A: data and validation**

| Step | Behaviour (AC) | Test first: name, file, type | Code change |
|------|----------------|------------------------------|-------------|
| 1 | AC7 | "rejects each invalid value and accepts each valid variant" per field, `tests/unit/brand.test.ts`, unit | `packages/domain/src/brand.ts` validators. |
| 2 | AC37, AC38 | "contrast below 3:1 against white text warns; 3:1 or above does not", `tests/unit/brand.test.ts`, unit | Contrast ratio and warning rule. |
| 3 | AC21 (schema part) | "0003 adds brand tables, rejects cross-organisation rows, backfills a snapshot for an existing campaign", `tests/integration/schema.test.ts`, integration | `0003_brand_settings.sql`. |
| 4 | AC1, AC5, AC6 | "returns only this organisation's settings; unset fields are null; saved values reload", `tests/integration/brand-settings.test.ts`, integration | `packages/database/src/brand.ts`; `GET`/`PUT` routes. |
| 5 | AC7, AC8, AC30 | "invalid save names the field and stores nothing"; "a failing write returns a recoverable error and stores nothing"; "template not matching the slot is a field error", same file, integration | Route validation and error mapping. |
| 6 | AC3, AC4, AC2 | "member reads but every write is 403"; "another organisation's logo or font id is 404 and unchanged", `tests/security/brand-isolation.test.ts`, security | `requireOwner`; scoped lookups. |

**Slice B: logos**

| Step | Behaviour (AC) | Test first | Code change |
|------|----------------|------------|-------------|
| 7 | AC10 | "rejects over 2 MiB, other types, mismatched signature, corrupt image; accepts a 64 px PNG", `tests/unit/logo-validation.test.ts`, unit | Policy argument in `image-validation.ts`; `logo-validation.ts`. Existing photo tests must stay green unchanged. |
| 8 | AC11 | one case per forbidden construct (script, event attribute, `foreignObject`, external reference, embedded image, DOCTYPE, entity) plus accepted plain shapes, `tests/unit/svg-safety.test.ts`, unit | `svg-safety.ts`. |
| 9 | AC9, AC11, AC11a | "valid raster becomes current with a preview URL"; "unsafe SVG stores nothing"; "safe SVG is stored as PNG and no response has an SVG content type", `tests/integration/brand-logo.test.ts`, integration | Logo route; SVG rasteriser in `brand-assets.ts`; signed-URL kind `logo`. |
| 10 | AC12, AC13 | "second upload keeps the first as previous"; "restore swaps current and previous and deletes nothing", same file | Logo records and restore route. |

**Slice C: fonts**

| Step | Behaviour (AC) | Test first | Code change |
|------|----------------|------------|-------------|
| 11 | AC16, AC14b, AC14c (size) | "rejects wrong signature, over 2 MiB, variable font (`fvar`), decoded size over 8 MiB", `tests/unit/font-validation.test.ts`, unit | `font-validation.ts`. |
| 12 | AC14a (decoder) | "build script output equals the committed files and fails when an anchor is missing"; "decodes Inter WOFF2 to the same bytes as the reference package", `tests/unit/woff2-decoder.test.ts`, unit | `scripts/build-woff2-decoder.ts`; vendored output; decoder in `brand-assets.ts`. |
| 13 | AC14, AC15, AC14c, AC16 | "TTF, OTF, WOFF and WOFF2 are stored and selectable with the confirmation recorded"; "no confirmation stores nothing"; "corrupt WOFF2 and unrenderable font are rejected with the reason", `tests/integration/brand-fonts.test.ts`, integration | Font route; test render. |
| 14 | AC18a (hide), AC18b | "removed font leaves the list and keeps its file"; "eleventh font is refused", same file | Hide route; cap. |
| 15 | AC18, AC17 (data) | "every preset family has a licence file beside it and appears in the preset list under its group", `tests/unit/font-presets.test.ts`, unit | Preset files, licence files, preset list. Each licence is first read from the upstream source; a family that is not OFL is left out. |

**Slice D: templates and campaign capture**

| Step | Behaviour (AC) | Test first | Code change |
|------|----------------|------------|-------------|
| 16 | AC26a, AC27, AC26 | "each graphic slot offers two layouts"; "no preference uses the default"; "a preference records that template's newest version"; "0002 and 0004 equal their generated SQL", `tests/unit/templates.test.ts`, unit | Catalogue, `selectableTemplates`, `planCampaignAssets`, `0004`. |
| 17 | AC28, AC29 | "a retired preferred template yields an unavailable asset with a reason and no substitute, and the rest proceed"; "settings response marks the preference unavailable", `tests/integration/campaigns.test.ts` and `brand-settings.test.ts`, integration | Planning marker; service and presenter report it. Starts by confirming how `presentCampaign` and `progress.ts` carry `unavailable`, which I have read only in outline. |
| 18 | AC20, AC21, AC18a (regenerate) | "queued jobs use the values captured at creation after settings change"; "a backfilled campaign regenerates with its snapshot"; "a removed font still renders in its campaign", `tests/integration/brand-snapshot.test.ts`, integration | Snapshot written in `createCampaign`; `context()` reads it. |
| 19 | AC19, AC25 | "copy with a tone set equals copy without; tone is in neither the request nor `parametersJson`"; "copy uses only captured contact details and passes copy-truth", `tests/integration/generation.test.ts`, integration | `BrandVoice` change; copywriter; review route uses snapshot. |

**Slice E: rendering**

| Step | Behaviour (AC) | Test first | Code change |
|------|----------------|------------|-------------|
| 20 | AC22, AC23, AC24 | "v2 layout places the logo and names the captured fonts"; "no logo leaves no image node or gap"; "only declared, set brand fields appear", `tests/integration/template-renderer.test.ts`, integration | v2 split layout. |
| 21 | AC26b, AC26c | "Full photo: photo fills the canvas, text over the lower gradient, logo top-left, all text from copy, facts and brand"; "story keeps text and logo out of the top and bottom 250 px", same file | Full photo layout. |
| 22 | AC14a (render), AC22 | "a PNG renders with a custom TTF and with a decoded WOFF2; dimensions match the canvas", same file | Font registration in the renderer. |
| 23 | AC31, AC32 | "approved version row and stored bytes are identical after every kind of settings change"; "regeneration adds a version and leaves the approved one", `tests/integration/brand-snapshot.test.ts`, integration | None expected; this pins existing immutability against the new write paths. |

**Slice F: the page**

| Step | Behaviour (AC) | Test first | Code change |
|------|----------------|------------|-------------|
| 24 | AC6, AC5, AC17, AC29 | "shows Not set for unset values"; "saves and shows values on return"; "fonts grouped Headings, Body text, Your fonts"; "unavailable preference is explained", `tests/ui/brand-settings.test.tsx`, UI | `BrandSettings.tsx`; nav link; API client. |
| 25 | AC33, AC34, AC8, AC37 | "labels, error association, focus to first error, values kept"; "save, upload and restore outcomes are announced"; "contrast warning shown and values saved", same file | Form behaviour, live region. |
| 26 | AC9 to AC15 (UI) | "logo preview, previous logos and restore"; "font upload needs the rights checkbox"; "SVG conversion is stated", same file | Logo and font sections. |
| 27 | AC3, AC36 | "member sees values read-only with the owner-only notice and no edit, upload or restore action", same file | Read-only mode from session role. |
| 28 | AC14a, AC11a, AC22 on workerd | extend `tests/e2e/journey.spec.ts`: SVG logo and WOFF2 font, then a rendered post | Whatever workerd shows is missing (bindings, wasm rule). |
| 29 | AC35 | No automated test: layout at 390 px needs a real browser viewport. Manual Chromium check at 390 px and desktop, steps and screenshots in verify.md. | Stylesheet. |
| 30 | all | Docs only: D-020 to D-022, ARCHITECTURE, AT-22, CURRENT_STATUS. Proof is review. | Docs. |

Every AC from AC1 to AC38, including the lettered ones, appears above.

## Release strategy

- Strategy: **direct**, one PR from `sdlc/001-brand-settings`. The repository
  has no feature-flag mechanism and adding one is out of scope. The sidebar
  link is added in step 24, so earlier slices expose nothing in the UI.
- Migration `0003` is additive and backfills in one statement. It runs through
  the existing deploy pipeline on preview first. Rollback is to redeploy the
  previous Worker; the new columns and tables are ignored by old code.
- After the first preview deploy, record WOFF2 decode and SVG rasterise times
  from Workers logs in verify.md (spec open question).

## Risks and alternatives

- **PR size.** About 30 steps in one PR is large. Alternative: split into three
  work items (settings and uploads; capture and rendering; page). Rejected
  because the spec is approved as one item and the slices are not useful to
  users separately, but the reviewer may prefer the split.
- **SVG checker is hand-written.** No DOM exists in the Worker. Mitigation: it
  rejects anything it does not recognise, and only a PNG is ever stored or
  served, so a checker mistake cannot reach a browser. The remaining exposure
  is resvg parsing a hostile SVG inside WebAssembly.
- **Vendored decoder.** The script patches minified code from a pinned package.
  Alternative: build Google's woff2 with Emscripten; rejected because it adds a
  large toolchain to setup and CI for one file. If the package changes, the
  anchor check fails loudly instead of producing a broken decoder.
- **Preset fonts as static assets, not R2.** The spec says "loaded from
  storage, not built into the Worker bundle". I plan static assets fetched
  through an `ASSETS` binding: no bundle growth and no change to the deploy
  pipeline. The files are public, which is acceptable for OFL fonts. R2 would
  need a seeding step at deploy. This is a reading of the spec the approver
  should confirm.
- **Worker CPU and memory.** A graphic may now load a logo, two custom fonts of
  up to 8 MiB decoded and the photo. Spike timings were local only. Step 28
  and the preview deploy are the check; if it is too slow, lower the decoded
  cap.
- **`BrandVoice` change touches every adapter and test that builds one.**
  Mechanical, but wide.
- **Backfill correctness.** Existing campaigns get today's settings, which is
  what they would render with now. Tested on SQLite; the preview D1 is close to
  empty, production state is unknown (OD-4).
- **Licences.** If a proposed family is not OFL on inspection, it is dropped
  and the preset list is shorter than eight. That is recorded in verify.md.

## Can run in parallel

- Steps 7 to 8 (logo and SVG validation), 11 to 12 (font validation and
  decoder) and 1 to 2 (domain) are independent of each other.
- Slice F can start once the route shapes from steps 4, 9 and 13 exist.
- Slices D and E depend on A to C and on each other in order.

## Questions a reviewer should ask

1. Is reading "loaded from storage" as static assets acceptable, or must preset
   fonts live in R2?
2. Is one PR of this size reviewable, or should it be split into three?
3. Is a hand-written SVG allowlist plus PNG-only storage enough, or should SVG
   logos be dropped until a maintained sanitiser runs in Workers?
4. Should the 8 MiB decoded-font cap be lower, given two fonts may load per
   render?

<!-- Deviations during build are logged in verify.md, not here: this file is fixed once approved. -->
