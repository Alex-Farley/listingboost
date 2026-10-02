# Build notes for verify.md (work item 001)

Running list kept during the build. It moves into verify.md at the verify stage.

## Deviations from the plan

1. **`preferred_templates_json` default.** SQLite cannot change a column default
   with `ALTER TABLE`. Migration 0003 rewrites existing `[]` values to `{}` and
   the code reads anything that is not an object as "no preferences".
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
