---
id: "001"
stage: verify
status: ready-for-review   # draft | ready-for-review
---

# Verify: R10 brand settings and templates

## Verify command
```
$ scripts/sdlc verify        (2026-10-02, HEAD of sdlc/001-brand-settings)
$ bun run verify
$ bun run typecheck && bun run lint && bun run test && bun run build
$ tsc --noEmit
$ eslint .
$ bun test tests/unit tests/integration tests/security tests/ui
 732 pass
 0 fail
 7078 expect() calls
Ran 732 tests across 50 files. [71.36s]
$ vite build && wrangler deploy --dry-run --outdir dist/worker
✓ built in 299ms
Total Upload: 4792.86 KiB / gzip: 1584.48 KiB
sdlc verify: PASSED
```

End-to-end, on workerd (`wrangler dev`) with local D1, R2 and Queues, in Chromium:
```
$ bun run test:e2e
  ✓  1 tests/e2e/journey.spec.ts:20:1 › AT-13 full journey: sign in → property → photos → campaign → generate → review → approve → download pack (11.9s)
  ✓  2 tests/e2e/journey.spec.ts:132:1 › AT-22 brand settings: SVG and WebP logos, a WOFF2 font and the Full photo layout render on workerd (6.9s)
  2 passed (24.4s)
```

One existing test is intermittent and unrelated to this change: `tests/ui/auth.test.tsx`
"signing out ends the session" timed out in 2 of 6 runs of the UI suite before any code in this work
item was written, and in four of the full runs during the build; a re-run passed each time. The
run pasted above is a clean one. It is not fixed here.

Not verified: a deployed Cloudflare Worker. Everything "on workerd" above is local `wrangler dev`.
WOFF2 decode time, SVG rasterise time and memory use with large fonts are to be read from Workers
logs after the first preview deploy (spec open question).

## Acceptance criteria and TDD evidence

Times are UTC on 2026-10-02, from `tdd.log`. "By mutation" means the test passed on first run
because the behaviour had been written in an earlier step, so RED was taken by removing the check
and GREEN by restoring it. Where a criterion has several tests, the times are for the first one.

| AC | Test | RED seen (tdd.log time) | GREEN seen | Result |
|----|------|-------------------------|------------|--------|
| AC1 | tests/integration/brand-settings.test.ts: returns only the signed-in organisation's values; tests/security/brand-isolation.test.ts | 11:26:47 | 11:27:42 | pass |
| AC2 | tests/security/brand-isolation.test.ts: another organisation's logo cannot be restored; font cannot be removed or selected; signed logo links | 11:35:41 (by mutation) | 11:35:45 | pass |
| AC3 | tests/integration/brand-settings.test.ts: a member reads and is told they cannot edit; tests/ui/brand-settings.test.tsx: member read-only view | 11:26:47 | 11:27:42 | pass |
| AC4 | tests/security/brand-isolation.test.ts: member save, logo and font writes are 403 and change nothing | 11:27:53 (by mutation) | 11:27:54 | pass |
| AC5 | tests/integration/brand-settings.test.ts: saved values reload unchanged; tests/ui/brand-settings.test.tsx: saves and sees them on return | 11:26:47 | 11:27:42 | pass |
| AC6 | tests/integration/brand-settings.test.ts: every other value is null; tests/ui/brand-settings.test.tsx: unset values read as not set | 11:26:47 | 11:27:42 | pass |
| AC7 | tests/unit/brand.test.ts: one case per invalid value per field; tests/integration/brand-settings.test.ts: invalid save stores nothing | 11:22:05 | 11:22:35 | pass |
| AC8 | tests/integration/brand-settings.test.ts: database write fails; tests/ui/brand-settings.test.tsx: error announced, values kept | 11:26:47 | 11:27:42 | pass |
| AC9 | tests/integration/brand-logo.test.ts: PNG, JPEG and WebP accepted with preview; tests/ui/brand-settings.test.tsx: upload shows a preview | 11:33:08 | 11:35:11 | pass |
| AC10 | tests/unit/logo-validation.test.ts; tests/integration/brand-logo.test.ts: rejected file says why; undecodable PNG refused | 11:29:43 | 11:31:01 | pass |
| AC11 | tests/unit/svg-safety.test.ts: one case per forbidden construct; tests/integration/brand-logo.test.ts: unsafe SVG stores nothing | 11:31:01 | 11:31:48 | pass |
| AC11a | tests/integration/brand-logo.test.ts: safe SVG stored as PNG only; tests/e2e/journey.spec.ts (AT-22): PNG served on workerd | 11:33:08 | 11:35:11 | pass |
| AC12 | tests/integration/brand-logo.test.ts: second upload keeps the first as previous | 11:33:08 | 11:35:11 | pass |
| AC13 | tests/integration/brand-logo.test.ts: restoring swaps and deletes nothing; tests/ui/brand-settings.test.tsx: restore is announced | 11:33:08 | 11:35:11 | pass |
| AC14 | tests/integration/brand-fonts.test.ts: TTF, OTF, WOFF, WOFF2 stored and selectable, confirmation recorded | 11:42:40 | 11:43:50 | pass |
| AC14a | tests/unit/woff2-decoder.test.ts: byte-identical to the reference; tests/integration/template-renderer.test.ts: decoded WOFF2 changes the render; tests/e2e/journey.spec.ts (AT-22) | 11:40:19 | 11:41:38 | pass |
| AC14b | tests/unit/font-validation.test.ts: variable fonts in TTF, OTF, WOFF; tests/integration/brand-fonts.test.ts | 11:39:17 | 11:39:59 | pass |
| AC14c | tests/unit/font-validation.test.ts: declared size over 8 MiB; tests/integration/brand-fonts.test.ts: corrupt and oversized WOFF2 | 11:39:17 | 11:39:59 | pass |
| AC15 | tests/integration/brand-fonts.test.ts: no confirmation stores nothing; tests/ui/brand-settings.test.tsx: tick required | 11:42:40 | 11:43:50 | pass |
| AC16 | tests/unit/font-validation.test.ts; tests/integration/brand-fonts.test.ts: rejected font says why, including an unrenderable one | 11:39:17 | 11:39:59 | pass |
| AC17 | tests/integration/brand-settings.test.ts: presets in two groups; tests/ui/brand-settings.test.tsx: fonts grouped by use | 11:45:03 | 11:45:40 | pass |
| AC18 | tests/unit/font-presets.test.ts: every preset has its OFL 1.1 file; nothing unlisted is shipped | 11:45:03 | 11:45:40 | pass |
| AC18a | tests/integration/brand-fonts.test.ts: removed font keeps its file; tests/integration/brand-snapshot.test.ts: still renders in a campaign that captured it | 11:42:40 | 11:43:50 | pass |
| AC18b | tests/integration/brand-fonts.test.ts: the eleventh font is refused until one is removed | 11:42:40 | 11:43:50 | pass |
| AC19 | tests/integration/brand-snapshot.test.ts: tone never reaches a provider; copy identical with and without tone | 11:51:52 | 11:55:42 | pass |
| AC20 | tests/integration/brand-snapshot.test.ts: jobs run after a change still use captured values | 11:51:52 | 11:55:42 | pass |
| AC21 | tests/integration/schema.test.ts: backfill; tests/integration/brand-snapshot.test.ts: backfilled campaign renders with its snapshot | 11:23:59 | 11:24:24 | pass |
| AC22 | tests/integration/template-renderer.test.ts: logo position, fonts, real renders differ with and without logo; tests/e2e/journey.spec.ts (AT-22) | 11:58:58 | 12:02:33 | pass |
| AC23 | tests/integration/template-renderer.test.ts: no logo, colours or fonts gives fallbacks and no empty box | 11:58:58 | 12:02:33 | pass |
| AC24 | tests/integration/template-renderer.test.ts: only declared, set brand fields are shown | 11:58:58 | 12:02:33 | pass |
| AC25 | tests/integration/brand-snapshot.test.ts: copy uses captured details and passes copy-truth | 11:51:52 | 11:55:42 | pass |
| AC26 | tests/unit/templates.test.ts; tests/integration/brand-snapshot.test.ts: preference recorded with newest version | 11:47:31 | 11:49:20 | pass |
| AC26a | tests/unit/templates.test.ts: each slot offers two layouts; tests/ui/brand-settings.test.tsx: each graphic offers its two layouts | 11:47:31 | 11:49:20 | pass |
| AC26b | tests/integration/template-renderer.test.ts: Full photo layout, three sizes; every word from copy, facts or brand | 11:58:58 | 12:02:33 | pass |
| AC26c | tests/integration/template-renderer.test.ts: story keeps logo and text out of top and bottom 250 px | 11:58:58 | 12:02:33 | pass |
| AC27 | tests/unit/templates.test.ts: no preference uses the default; tests/integration/brand-snapshot.test.ts | 11:47:31 | 11:49:20 | pass |
| AC28 | tests/integration/brand-snapshot.test.ts: unavailable preference reported, nothing substituted, the rest proceed | 11:51:52 | 11:55:42 | pass |
| AC29 | tests/integration/brand-snapshot.test.ts: settings mark the preference unavailable; tests/ui/brand-settings.test.tsx: explained on the page | 11:51:52 | 11:55:42 | pass |
| AC30 | tests/integration/brand-settings.test.ts: a template that does not match the slot is a field error | 11:26:47 | 11:27:42 | pass |
| AC31 | tests/integration/brand-snapshot.test.ts: every kind of brand change leaves approved rows and bytes identical | never seen failing | 12:08:31 | pass |
| AC32 | tests/integration/brand-snapshot.test.ts: regeneration adds a version, approved one stays final | never seen failing | 12:08:31 | pass |
| AC33 | tests/ui/brand-settings.test.tsx: errors tied to fields, focus to the first, values kept; every control labelled; axe scan (below) | 12:14:44 | 12:17:02 | pass |
| AC34 | tests/ui/brand-settings.test.tsx: save, upload, restore, font upload and removal are announced in a status region | 12:14:44 | 12:17:02 | pass |
| AC35 | tests/e2e/journey.spec.ts (AT-22): no sideways overflow and Save reachable at 390 px and 1280 px; screenshots checked by eye | 12:18:08 to 12:22 (on workerd) | 12:22:44 | pass |
| AC36 | tests/ui/brand-settings.test.tsx: member sees values as text with their names and no controls | 12:14:44 | 12:17:02 | pass |
| AC37 | tests/unit/brand.test.ts; tests/integration/brand-settings.test.ts; tests/ui/brand-settings.test.tsx: saved with a warning | 11:22:46 | 11:22:54 | pass |
| AC38 | tests/unit/brand.test.ts: 3:1 or better does not warn; tests/ui/brand-settings.test.tsx: a readable colour clears it | 11:22:46 | 11:22:54 | pass |

Weaker evidence, stated plainly:
- **AC31, AC32** were never seen failing. As the plan expected, they pin behaviour that already
  held (the database's immutability trigger and versioning) against the new write paths.
- **AC2, AC4** have RED by mutation only, as described above.
- **The first E2E RED (12:18:08) is not a real RED**: the test server could not start because this
  machine's Bun install has no `bunx`. The real failures on workerd followed it: the page's
  save failed with `D1_ERROR: LIKE or GLOB pattern too complex` until migration 0003 was changed.

## UX checks (only if the change touches UI; see sdlc-ux-review)

| Page | Method | Flags | Fixed / accepted (reason) |
|------|--------|-------|---------------------------|
| Brand Settings, owner | Automated: `tests/ui/brand-settings.test.tsx` (20 tests, real client against the real API) | None open | n/a |
| Brand Settings, owner | Automated: axe-core 4.13.0, WCAG 2.1 A and AA, run inside the E2E on the saved page | 1 serious: hint text contrast 3.9:1 | Fixed: hints on this page use the soft ink colour (7.9:1). Re-run reports 0 violations. |
| Brand Settings, owner | Automated: E2E at 390 px and 1280 px, no sideways overflow, Save reachable | None | n/a |
| Brand Settings, owner | Visual: full-page screenshots at 390 px and 1280 px | Heading and note squeezed side by side; a row misaligned when one field had a hint; unset colour shown as a black swatch | All three fixed. |
| Brand Settings, member | Automated: UI test of the read-only view | None | n/a |
| Graphics, both layouts, three sizes | Visual: renders from the integration tests and from workerd | Logo missing from first renders | Fixed: caused by an undecodable test image; led to drawing each logo once at upload (deviation 13). |

Effort, decisions, memory, grouping, familiarity, progress and forgiveness were checked against the
spec's Cognitive load table: one page from the sidebar; every field optional; help text beside the
field it explains; five labelled groups and one Save; existing form controls; saved, uploaded and
failed states announced; typed values kept on every failure; a replaced logo can be restored.

Not covered:
- A screen-reader pass with a real screen reader. Labels, descriptions, the status region and focus
  movement are asserted in tests, which is not the same thing.
- axe on the member (read-only) view.
- Research with estate agents.
- The shared hint colour (`--muted`, 3.9:1) is still below WCAG AA on the other pages of the app.
  Only this page was changed.

## Refactoring done
- `validateImageUpload` takes a policy so photos and logos share one validator.
- The renderer's wasm start-up moved into `ensureRenderRuntime`, shared by the renderer and the
  brand asset processor.
- `templateSeedSql` split into a shared `seedSql` used for migrations 0002 and 0004.
- `getBrandSettings` in `packages/database/src/jobs.ts` removed; the service reads the campaign
  snapshot and the routes read `getBrandProfile`.
- The brand snapshot and brand details are built by named helpers (`brandSnapshotOf`,
  `brandAllowedText`) in place of repeated inline lists.

## Deviations from the plan

Files changed that the plan did not list: `eslint.config.js`, `apps/web/server/render-assets.ts`,
`tests/support/fixtures/fonts/` and `tests/support/fixtures/logos/`, and the new runtime dependency
`@jsquash/webp`. `packages/ai/src/adapters/fact-copywriter.ts` was listed but needed no change.
`work/001-brand-settings/build-notes.md` is the running list this section was written from.

1. **`brand_settings` is rebuilt in migration 0003**, not altered as the plan
   said. The end-to-end test on workerd showed that saving any brand colour
   failed on D1: the colour check in the original schema (0001) used a 61-byte
   GLOB pattern and D1 rejects patterns over 50 bytes. SQLite has no such
   limit, so no other test could see it. The rebuild shortens the check, gives
   the current logo a real composite foreign key in place of triggers, changes
   the `preferred_templates_json` default to `{}`, and drops the never-used
   `logo_media_key` column. A schema test now fails if any LIKE or GLOB pattern
   exceeds 50 bytes.
2. **Logo pixel limit.** Not in the spec. Logos are capped at 4096 px on the
   longest side and 8 megapixels, because the renderer decodes the logo in
   Worker memory on every graphic.
3. **SVG logos with live text are refused.** The Worker's rasteriser has no
   fonts, so `<text>` would be drawn in the wrong typeface or not at all. The
   rejection tells the owner to convert text to outlines.
4. **`eslint.config.js`** (not in the plan's file list): `packages/ai/vendor`
   is ignored because it holds generated third-party code.
5. **Removing a font also clears it from the live profile** if it was the
   selected heading or body font, so the profile never points at a font that
   cannot be chosen. Campaign snapshots are unaffected.
6. **RED by mutation.** Where a security test passed on first run because the
   route had been written scoped in an earlier step (step 6 owner check; logo
   and font isolation), RED was taken by removing the check and GREEN by
   restoring it. Each pair is in tdd.log.
7. **Test fixtures.** Source Sans 3 (OTF outlines) in WOFF and WOFF2 is
   committed under `tests/support/fixtures/fonts` with its OFL licence, because
   no OpenType-flavoured font was available locally.

8. **One existing assertion updated, not weakened.** `tests/unit/templates.test.ts`
   ("falls back to the first photo...") checked that every planned asset's
   template is in `DEFAULT_TEMPLATES`. New campaigns now use version 2 of the
   graphic templates, so the same check runs against `TEMPLATE_CATALOGUE`, which
   contains `DEFAULT_TEMPLATES` unchanged plus the new versions.
9. **How an unavailable preference is recorded.** No new column. An asset is
   unavailable when its campaign's captured preference for the slot is not a
   selectable template, or differs from the template the asset was planned
   with. A preference whose template has left the catalogue is planned against
   the slot default so the row has a valid template reference, but it is never
   rendered.

10. **A second existing test's setup updated.** `tests/integration/review.test.ts`
    ("a brand name containing claim words is not flagged") renamed the agency on
    the live profile after its campaign existed. The approved spec makes edit
    warnings use the campaign's captured brand, so the test now also sets the
    name on the campaign's snapshot. Its assertion is unchanged.
11. **A captured logo or font that cannot be loaded fails the job** with a
    plain message; the renderer never falls back to a default in its place.
12. **`brandSnapshot` is not returned in the campaign list response.**

13. **Logos are drawn once at upload.** While checking renders by eye, a logo
    that passed every structural check was missing from the graphic: the file's
    pixel data could not be decoded, and the renderer skips such an image
    without an error. (The file was a faulty test fixture, since corrected.)
    Uploads now draw the logo once and refuse one that cannot be decoded or has
    nothing visible, and the render tests assert the logo changes the image.

14. **WebP logos are converted to PNG at upload** (owner decision 2026-10-02,
    during the build). The renderer (resvg) cannot decode WebP, so a WebP logo
    would have been accepted and never drawn. The spec's data table says logos
    are stored "as PNG, JPEG or WebP"; they are now stored as PNG or JPEG only.
    Adds the runtime dependency `@jsquash/webp` 1.5.0 (Apache-2.0, libwebp
    decoder, about 50 KB gzip) and a small PNG encoder using the existing
    `fflate`. WebP logos are capped at 4 megapixels because they are decoded in
    Worker memory. Not yet proven on the Worker runtime; step 28 (E2E) does that.
15. **Step 23 tests were never seen failing.** As the plan expected, the
    immutability tests passed on first run; they pin existing behaviour against
    the new write paths.

16. **One RED entry in tdd.log is not a real RED.** The first run of the E2E
    step (2026-10-02T12:18Z) failed because this machine's Bun install has no
    `bunx`, so the test server never started. The real failures on workerd came
    in the runs after it.
17. **AC35 is partly automated**, not only manual as planned: the E2E checks
    at 390 px and 1280 px that nothing overflows sideways and Save is
    reachable. Screenshots at both widths were also checked by eye.
18. **Unset colour swatch.** A colour input always shows a colour, so an unset
    colour is drawn as a crossed-out swatch, not as black.

## Evals added
None. This is a feature, not a bug fix. The two defects found on the way are guarded by tests:
the D1 pattern limit by a schema test, and undrawable logos by the upload check and the render tests.

## Manual checks for the reviewer
1. `bash scripts/setup.sh`, then `bun run dev:worker` and open http://localhost:8787. Sign up, open
   **Brand Settings** from the sidebar. Expect five groups and "Not set" beside every empty field.
2. Upload `tests/support/fixtures/logos/logo.svg`. Expect a preview and the message that it was
   converted to PNG. Upload any PNG; expect the first under "Previous logos" with Restore.
3. Upload `node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2` as a font without
   ticking the box; expect a refusal. Tick it and upload; choose it as the heading font.
4. Set primary colour `#f6f1e8` and Save. Expect it saved with a "hard to read" warning.
5. Choose "Full photo" for the square post, Save, then create a listing with one photo, create a
   campaign and Generate. Expect the square post with the photo filling the image, the logo top-left
   and white text over a gradient; the portrait post keeps the brand panel.
6. Change the agency name in Brand Settings, then regenerate an asset in that campaign. Expect the
   old name: the campaign keeps the branding it was created with.
7. With a screen reader, tab through the page, submit an invalid email and confirm the error is read
   and focus lands on the Email field. This is the check that could not be automated.

## For the owner

- **Reserved Font Names.** Playfair Display, DM Serif Display, Source Sans 3 and
  Lato declare a Reserved Font Name in their OFL. The preset files are the
  latin subsets as distributed by Google Fonts and Fontsource, under the
  original names. This is common practice, but whether a subset counts as a
  "modified version" under the OFL is a legal question I cannot settle.
- **Existing intermittent test.** `tests/ui/auth.test.tsx` "signing out ends the
  session" timed out in 2 of 6 runs of `bun test tests/ui` before any code in
  this work item was written, and occasionally since. A re-run passes. It is
  not caused by this change and is not fixed here.
- **WebP property photos render blank (existing bug, not from this work).** A
  listing whose primary photo is WebP gets social posts and stories with no
  photo, because the renderer cannot decode WebP. Confirmed on the version 1
  template. The existing test only checked the output width. To be captured as
  a separate work item (owner decision 2026-10-02).
- **Brand panel Story.** The version 2 brand panel Story keeps the original
  design's footer (call to action and logo) near the bottom edge, inside the
  area Instagram covers with its own controls. Only the Full photo Story has
  the 250 px safe area the spec asked for.
