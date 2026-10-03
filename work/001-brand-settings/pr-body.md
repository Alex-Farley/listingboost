## R10 brand settings and templates (001)

**Intent:** work/001-brand-settings/intent.md
**Spec:** work/001-brand-settings/spec.md
**Plan:** work/001-brand-settings/plan.md
**Verify:** work/001-brand-settings/verify.md
**Review:** work/001-brand-settings/review.md

### What changed
- A Brand Settings page: owners edit agency and contact details, logo, colours, fonts, a stored tone preference and a preferred layout per graphic; members can view.
- Logos (PNG, JPEG, WebP, SVG; SVG and WebP stored as PNG) with history and restore. Custom fonts (TTF, OTF, WOFF, WOFF2 converted at upload) and eight preset fonts.
- A campaign captures its brand at creation; every job and regeneration reads that snapshot. Tone is stored only and no longer reaches providers.
- Graphics get version 2 of the brand panel (logo, brand fonts) and a new Full photo layout. A preferred template that cannot be used leaves the asset unavailable with a reason.
- Migration 0003 rebuilds `brand_settings`: the original colour check could not run on D1.

### How it was verified
```
$ scripts/sdlc verify
 738 pass
 0 fail
 7099 expect() calls
Ran 738 tests across 50 files. [70.91s]
Total Upload: 4793.04 KiB / gzip: 1584.53 KiB
sdlc verify: PASSED

$ bun run test:e2e        (workerd via wrangler dev, local D1/R2/Queues, Chromium)
  ✓ AT-13 full journey
  ✓ AT-22 brand settings: SVG and WebP logos, a WOFF2 font and the Full photo layout render on workerd
  2 passed (23.9s)
```
All 47 acceptance criteria have a test; RED and GREEN times are in verify.md. axe (WCAG 2.1 A/AA) reports no violations on the page. Migrations were rehearsed on local D1 with existing data.

Not verified: a deployed Worker (timings and memory), and a pass with a real screen reader.
`tests/ui/auth.test.tsx` "signing out ends the session" is intermittently failing on `main` too; a re-run passes.

### Manual checks for the reviewer
1. `bun run dev:worker`, sign up, open **Brand Settings**: five groups, "Not set" beside empty fields.
2. Upload `tests/support/fixtures/logos/logo.svg`: preview appears and the page says it was converted to PNG. Upload a PNG: the first appears under "Previous logos" with Restore.
3. Upload a `.woff2` font without ticking the rights box (refused), then with it; choose it as the heading font.
4. Choose "Full photo" for the square post, Save, create a listing with a photo, create a campaign, Generate: the square post is full-bleed with the logo top-left.
5. Change the agency name, regenerate an asset in that campaign: it keeps the old name.
6. With a screen reader: submit an invalid email; the error is read and focus lands on Email.

### Risk
higher - a migration that rebuilds a table and backfills campaigns, an owner-only role check, uploads of untrusted SVG and font files, and personal contact data. Three WebAssembly decoders now run in the Worker (resvg, woff2, libwebp).

Follow-ups, not in this PR: WebP property photos render with no photo (existing bug); `work/003-campaign-copy-rebrand`.

> Agent-assisted: written with Claude Code (Claude Opus 5.5). A person reviews and merges; the agent cannot approve or merge.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
