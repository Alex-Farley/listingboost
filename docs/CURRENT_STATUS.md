# Current status

_Last updated: 2026-10-02_

## Phase

Phase 1 (foundation) in progress.

## Completed

- **Phase 0:** legacy prototype removed from the rebuild branch (preserved at
  `073c83e` on `main`, D-001); docs set; Bun + strict TypeScript + ESLint;
  CI workflow; 30 legacy GitHub issues closed, new backlog opened
  (epic Alex-Farley/listingboost#134).
- **R1 Domain rules** (Alex-Farley/listingboost#135): lifecycle, final-version
  selection, versioning, immutability guard, property truth, copy truth,
  property input validation.
- **R2 Database schema** (Alex-Farley/listingboost#136): all spec entities; composite
  organisation foreign keys; lifecycle trigger mirroring the domain;
  approved-version immutability trigger; visualisation label CHECK. Tested on
  real SQLite and applied successfully to local D1 through Wrangler.
- **R3 Auth** (Alex-Farley/listingboost#137): sign-up/sign-in/sign-out/session, PBKDF2,
  hashed session tokens in `__Host-` cookies, CSRF, D1 rate limits, security
  headers, safe errors. Smoke-tested on `wrangler dev` (workerd + local D1).
- **R4 Properties** (Alex-Farley/listingboost#138): scoped CRUD/archive, per-fact
  provenance, history list with search/filter/cursor pagination.
- **R5 Media** (Alex-Farley/listingboost#139): upload validation on real image fixtures,
  R2 storage port, reorder/primary/replace/delete, HMAC-signed file URLs.
  Verified on `wrangler dev` with local R2.
- **R6 Campaigns & generation** (Alex-Farley/listingboost#140): versioned data-driven
  templates (seeded by generated migration 0002), campaign asset plan,
  generation service (CAS job claim, leases, backoff retries, copy-truth
  and output checks, provenance, R2 outputs), queue consumer + Cron sweeper,
  progress view, regeneration as new versions, honest `unavailable`
  reporting. Verified on `wrangler dev`.
- **Deploy pipeline** (`.github/workflows/deploy.yml`, docs/DEPLOYMENT.md):
  preview on push to `main`, production manual; config generated from GitHub
  Environment variables; queue created if missing; signing secret generated
  once; guarded preview reset of the prototype D1 with backup (rehearsed on
  local D1 including restore); smoke test.
- **R8 Review API** (Alex-Farley/listingboost#142): approve/reject (only from
  `needs_review`, audited, campaign completes when every asset is approved),
  text edits as new `manual_edit` versions with copy-truth warnings, asset
  discard; approved versions untouched throughout.
- **R9 Marketing pack** (Alex-Farley/listingboost#143): streamed ZIP of final approved
  versions only (`<property>/{Photography,Social,Stories,Reels,Copy}/` + README
  with the property-truth statement and visualisation labels), session- and
  tenant-checked, audited; signed attachment links for single versions.
- **R11a Web app foundation** (Alex-Farley/listingboost#145): editorial design system;
  landing page; sign-up/sign-in/sign-out; app shell with sidebar; My Listings
  (search, empty state); New Listing form (unknown facts stay blank); listing
  workspace Overview (facts, "Not recorded", edit) and Images (upload,
  reorder, primary, delete). UI tests run the real React app against the real
  in-process API + SQLite (no mocks); verified in Chromium on `wrangler dev`
  at desktop and 390 px widths with no CSP violations.
- **R11b Campaign UI** (Alex-Farley/listingboost#145): create campaign (explains when photos
  are missing), progress checklist (✓ ◌ ● ○), polling while generating, tabs
  Images (enhanced photos) / Social Posts (+ copy) / Stories / Reels /
  Marketing Pack; asset cards with preview, status, approve/reject,
  regenerate, edit copy as a new version (with truth warnings), download,
  version history, visualisation label. When no generation is available the
  panel says so (no dead button) and copy can still be written by hand.
- **R7a Fact-only copywriter** (Alex-Farley/listingboost#141): deterministic, non-AI
  `text_generation` adapter registered in production; every slot built only
  from recorded facts and brand contact details; property-tested over 300
  generated fact sets. Copy generation now works on preview. Validator
  precision fixes (end-of-terrace, brand names).
- **R11c E2E** (Alex-Farley/listingboost#145, AT-13): Playwright journey on real workerd
  (`wrangler dev`, fresh local D1/R2/Queues): sign up → sign out/in → new
  listing → upload photos → create campaign → generate (queue consumer, fact
  copywriter) → edit + approve copy → download pack and assert its exact
  contents → second agency gets "Listing not found". Runs in the required CI
  job. A mutation check (unapproved versions leaking into the pack) made it fail.
- **R7b Social post and Story renderer** (Alex-Farley/listingboost#141): real
  `template_render` adapter (satori + resvg-wasm, D-018) renders 1:1, 4:5 and
  9:16 PNGs from the unaltered primary photo, reviewed copy, recorded facts
  and brand colour. Registered in production; verified on workerd by the E2E
  journey (rendered post approved and checked in the pack).
- **R7c Slideshow Reel** (Alex-Farley/listingboost#141, D-019): made in the agent's
  browser from the listing's own photos (centre-cropped 9:16, 3 s each,
  cross-fades, WebCodecs + Mediabunny, H.264 preferred). The server accepts
  only an MP4 that is exactly that Reel (structure, single video track,
  size, length for the photos named, photos from this listing), then stores
  it as a version for review. Verified end to end in Chromium on workerd, and
  frames checked visually.
- **Preview live** at https://listingboost-preview.alex-farley.workers.dev (deploy run #2,
  2026-09-26). The preview D1 was already empty, so no reset was needed.
- **Agent-agnostic cloud development:** `scripts/setup.sh`, `bun run verify`,
  AGENTS.md + pointer files, devcontainer, Copilot setup steps, Claude Code
  SessionStart hook (docs/CLOUD_AGENTS.md).
- **AI-native SDLC workflow:** adapted stages, agent skills, work-item templates
  and `scripts/sdlc` are installed. ListingBoost docs remain authoritative;
  `VERIFY_CMD` is `bun run verify`. AI review, optional policies, credentials,
  and Git hooks are not enabled. Run `scripts/sdlc check --merge-ready main`
  after review approval and after any later change; `scripts/sdlc status` does
  not detect code changes made after review approval.
- Worker entry fails closed on missing/weak configuration; Vite client shell;
  `bun run build` produces the client and a Worker dry-run bundle.

## Current requirement

R10 Brand settings (work item `work/001-brand-settings`, AT-22) is built and is
going through verify and review. Not yet merged.

Owners manage agency and contact details, logo, colours, fonts, a stored tone
preference and a preferred layout per graphic on a Brand Settings page;
members can view it. Each campaign captures the brand when it is created.
Graphics have a second "Full photo" layout and draw the logo and brand fonts.
Decisions: D-020 (logos), D-021 (campaign brand snapshot), D-022 (fonts).

Follow-on items:
- `work/003-campaign-copy-rebrand` (intent drafted, awaiting approval): copy a
  campaign so the copy takes the current branding.
- WebP property photos render as graphics with no photo. Existing defect found
  during this work, to be captured as its own work item.
- `tests/ui/auth.test.tsx` "signing out ends the session" fails intermittently
  when the UI suite runs together; it predates this work.

## Tests

| Suite | Passing | Failing |
| --- | --- | --- |
| unit | 339 | 0 |
| integration | 278 | 0 |
| security | 65 | 0 |
| ui | 50 | 0 |
| e2e | 2 journeys | 0 |

RED evidence:
- R10: every step's RED and GREEN run is in `work/001-brand-settings/tdd.log`.
  The E2E on workerd then failed where no in-process test could: saving a
  colour raised `D1_ERROR: LIKE or GLOB pattern too complex` (a 61-byte GLOB
  in the original schema; D1's limit is 50). Checking renders by eye found
  that the renderer silently skips images it cannot decode, and cannot decode
  WebP.
- R1: `Export named '…' not found in module packages/domain/src/index.ts`.
- R2: `SQLiteError: no such table: organisations` (73 failing). The first
  GREEN run then caught a real defect: `disclosure_label = …` let NULL through
  the CHECK; fixed with `IS`.
- R4: 15 of 16 property tests failed (routes absent).
- R5: validator tests failed with `Cannot find module '@listingboost/storage'`;
  25 of 28 media tests failed. GREEN then exposed the API header wrapper
  overwriting the download sandbox CSP (fixed).
- R6: `Cannot find module '@listingboost/templates' / '@listingboost/generation' /
  '@listingboost/ai'`; worker `queue`/`scheduled` handlers "is not a function".
- Deploy scripts: `Cannot find module` for both; the local D1 rehearsal then
  exposed D1's stricter DROP TABLE behaviour and the prototype's FK cycle (D-015).
- R7a: copywriter tests failed with "Export named 'FactCopywriter' not found";
  two validator false-positive tests and a brand-name edit-warning test failed
  before their fixes.
- R7c: slideshow math failed on missing exports; video validation with
  "Export named 'validateReelVideo' not found"; 16 of 18 API tests failed
  (routes absent); Reel UI tests failed with "Cannot find module …/reel/encoder".
  Mutation checks (dropping the photo-ownership check, skipping video
  validation) each made 2–3 tests fail.
- R7b: renderer tests failed with "Export named 'SvgTemplateRenderer' not
  found"; production-provider and deploy-config tests failed before wiring.
  The strengthened E2E then failed on workerd with satori 0.33.5 ("Social
  posts … Generating": `self.location.href` in its HarfBuzz loader) and
  passed on 0.32.0 (D-018).
- R11b: 9 campaign UI tests failed (components absent); the manual-copy test
  then caught the editor not opening for assets with no version yet (fixed).
- R11a: UI suites failed with `Cannot find module '../../apps/web/client/src/routes'`.
  A full-suite run also exposed a 1-in-64 flaky tamper test (fixed to always
  change the signature), and the browser check exposed zod's eval probe
  tripping the CSP (zod now runs jitless).
- R8: 11 of 14 review tests failed (routes absent).
- R9: 8 of 10 pack tests failed (routes absent); streamed ZIP also checked with `unzip -t`.
- R3: `Cannot find module '../../apps/web/server/app'`, and
  `Cannot find module '../../apps/web/server/index'` for the Worker entry.

## Known blockers

- Tag `legacy/prototype-final` exists locally only (session cannot push tags).
- 78 stale remote branches from the prototype. The session cannot delete them;
  the owner needs to delete them (command in the session summary).
- OD-1 (Alex-Farley/listingboost#146): the enhancement provider. Until it is chosen, enhanced
  photos report as unavailable. Copy, graphics and the slideshow Reel work
  without external providers.
- Production deploy not yet run: its API token needs D1 permission (as preview
  did) and its database state is unknown; the workflow refuses a prototype schema.

## Next recommended task

Review and merge R10 (work item 001), then the WebP photo defect and
`work/003-campaign-copy-rebrand`
→ Phase 8 polish.
Enhanced photos remain blocked on OD-1 (provider choice). R7: template renderer and slideshow reel can be built without
external providers; enhancement and copy adapters are blocked on OD-1/OD-2.

## Outstanding decisions

See DECISIONS.md "Open decisions" and the decision issues.
