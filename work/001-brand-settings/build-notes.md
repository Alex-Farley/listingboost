# Build notes for verify.md (work item 001)

Running list kept during the build. It moves into verify.md at the verify stage.

## Deviations from the plan

1. **`brand_settings` is rebuilt in migration 0003**, not altered as the plan
   said. The end-to-end test on workerd showed that saving any brand colour
   failed on D1: the colour check in the original schema (0001) used a 61-byte
   GLOB pattern and D1 rejects patterns over 50 bytes. SQLite has no such
   limit, so no other test could see it. The rebuild shortens the check, gives
   the current logo a real composite foreign key in place of triggers, changes
   the `preferred_templates_json` default to `{}`. The unused `logo_media_key`
   column is kept so the previous Worker version still runs against the new
   schema if a deploy is rolled back. A schema test now fails if any LIKE or GLOB pattern
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
