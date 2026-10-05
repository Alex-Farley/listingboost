# Decision log

Format: ID · date · decision · reason · consequences.

## D-001 · 2026-09-25 · Clean rebuild; legacy preserved in history

The Higgsfield/FNF-hosted prototype (TanStack Start, vendored `@higgsfield/*`
packages, 8 D1 migrations, 40 test files) was removed from the rebuild branch.
Its final state is commit `073c83e` on `main` (local tag
`legacy/prototype-final`; the session could not push tags — push it with
`git push origin legacy/prototype-final` or create it on GitHub).

Reason: master spec §1/§40. The prototype's identity, credits, media and
runtime boundaries belonged to the host platform.

Nothing was carried forward verbatim. Ideas re-implemented cleanly (with new
tests): image signature parsing, copy-claim guardrails, security headers.

## D-002 · 2026-09-25 · Stack

TypeScript, React 19 + Vite SPA, one Cloudflare Worker (API + static assets +
queue consumer), D1, R2, Cloudflare Queues, Bun as package manager and unit/
integration test runner, Playwright for E2E.

Reason: matches spec §34; one deployable; no server framework needed for a
small JSON API. SPA rather than SSR because the product is behind sign-in.

## D-003 · 2026-09-25 · Packages as directories, not workspaces

`packages/*` are resolved via tsconfig `paths`. No per-package `package.json`.

Reason: spec §33 "do not create packages simply for architectural purity".
Boundaries are enforced by review and by an import-boundary test, not by
publishing.

## D-004 · 2026-09-25 · Own authentication instead of an auth framework

PBKDF2 password hashing + opaque DB sessions implemented with WebCrypto.

Reason: small surface, fully testable against the real schema, no ORM/adapter
layer, runs unchanged in Workers and Bun. OAuth/SSO can be added later behind
the same session model.

## D-005 · 2026-09-25 · Database tests run on real SQLite

Integration tests run the real migrations against `bun:sqlite` through a
D1-compatible adapter implementing the `SqlDatabase` port.

Reason: D1 is SQLite, so constraints, composite foreign keys and triggers are
tested for real. The adapter is test isolation, not a fake integration.
A Miniflare/workerd smoke test will cover the actual D1 binding (Phase 1).

## D-006 · 2026-09-25 · Unified asset-version state machine

States: queued, processing, completed, failed, cancelled, needs_review,
approved, rejected (see ARCHITECTURE §6.1). One machine per asset *version*;
an asset is a slot holding versions.

## D-007 · 2026-09-25 · Uploads proxied through the Worker for MVP

Worker validates bytes before writing to R2 (Workers accept bodies up to
100 MB on paid plans; per-file limit is 25 MB). Presigned direct-to-R2 uploads
would need post-upload validation and quarantine; deferred until needed.

## D-008 · 2026-09-25 · Signed media URLs are Worker-issued HMAC tokens

Private R2 bucket; the Worker streams objects after verifying an HMAC-signed,
short-lived URL issued only after a tenant-scoped lookup.

## D-009 · 2026-09-25 · Upload validation depth

The Worker validates size, declared type, extension, magic bytes, dimensions
(min 400 px short edge, max 40 MP) and container integrity: a full JPEG segment
walk to EOI (only padding or an embedded MPF JPEG may follow), PNG chunk CRCs
through IEND, and WebP RIFF/chunk sizes. Animated formats, GIF, SVG and HEIC
are rejected. Full pixel decoding is **not** done in the Worker (a 40 MP decode
exceeds Worker memory). It will come from the Cloudflare Images binding
(`info()`) once the account exists (OD-4). Until then AT-04's "decoding"
criterion is met structurally, not by pixel decode.

## D-010 · 2026-09-25 · Photo replacement creates a new media ID

Replacing a photo inserts a new row in the same position (keeping primary
status) and deletes the old one, unless a campaign asset references it (409).
Media rows are never mutated in place, so generated assets always trace back
to the exact bytes they were made from.

## D-011 · 2026-09-25 · R2 adapter verification

The in-memory `ObjectStore` is used for API tests. The R2 adapter is verified
against real local R2 on `wrangler dev` (upload → signed download, bytes
identical, tampered link 403). Automated coverage arrives with the E2E suite.
Miniflare 5's programmatic API is alpha and was not adopted.

## D-012 · 2026-09-25 · Unconfigured capabilities are reported, never faked

Each asset's capability comes from its template. `generate` queues only
assets whose capability has a registered provider adapter, and returns the
rest as `unavailable`; if none are available it returns 409
`generation_unavailable` and creates nothing. The progress view shows
`unavailable` groups. Production currently registers no adapters (OD-1..OD-3),
so generation is honestly unavailable until real adapters land.

## D-013 · 2026-09-25 · Queue is transport; database + sweeper are truth

Jobs are claimed by compare-and-set (`queued → processing`) with a 10-minute
lease. Transient failures (provider-transient, unexpected adapter exceptions,
and ListingBoost content checks such as copy truth) are retried with
30/60/120 s backoff up to 3 attempts. A 5-minute Cron sweep re-dispatches due
jobs whose message was lost and reclaims expired leases.

## D-014 · 2026-09-25 · Existing Cloudflare deployment found

The legacy workflow deployed successfully to Cloudflare via GitHub
Environments `listingboost-preview` (and `listingboost-production`), with
`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets and
`LB_WORKER_NAME`, `LB_D1_DATABASE_ID/NAME`, `LB_R2_BUCKET_NAME`,
`LB_QUEUE_NAME`, `LB_ROUTE`, `LB_ZONE_NAME` variables. The rebuild will reuse
these environments for deploys (R11). **Caveat:** the existing preview D1
database holds the prototype schema (e.g. an incompatible `campaigns` table),
so the rebuild needs a fresh D1 database per environment, or the owner's
explicit approval to wipe preview. A decision is needed before the first
deploy.

## D-015 · 2026-09-25 · Owner decisions for the first deploy

The product owner approved: (1) wiping the preview D1's prototype schema,
(2) creating a generation Queue per environment, (3) a `MEDIA_SIGNING_SECRET`
per environment. Implemented in `.github/workflows/deploy.yml`:
- the preview reset is guarded (only an exact prototype migration history),
  backs up first (artifact, 90 days) and was rehearsed on local D1 including
  restore. The rehearsal found that D1, unlike plain SQLite, fails a
  `DROP TABLE` whose foreign keys (or its children's) point at an
  already-dropped table, and that the prototype has a reference cycle
  (`campaign_assets` ↔ `generation_jobs`). Drops are therefore ordered by
  strongly connected components.
- queues are created if missing; the signing secret is generated once and
  never rotated by deploys.
- production is never reset automatically and refuses a prototype schema.

## D-016 · 2026-09-26 · Manual text edits warn, AI copy blocks

AI-generated copy that states unsupported facts is rejected and retried
(D-013). Text typed by the agent is their own statement: it is saved as a new
`manual_edit` version in review, and unsupported claims are returned as
warnings rather than blocking the edit. First preview deploy: the preview D1
was already empty, so the D-015 reset found nothing to do.

## D-017 · 2026-09-26 · Fact-only copywriter is the production text adapter

`FactCopywriter` (packages/ai) composes every copy slot from recorded facts
and brand contact details only: no AI, deterministic, and it passes the
copy-truth validator for any fact combination (property-tested over 300
generated cases). It is registered as `text_generation` in deployed Workers
until an LLM provider is chosen (OD-2); an LLM adapter will then replace it
or sit alongside it. Tone of voice is not applied by this adapter.

The validator gained two precision fixes found while building it:
"end-of-terrace" is a property type, not a garden terrace; and exact brand
strings (agency name, phone, email, website) are excluded before claims
are checked, for AI copy and for manual-edit warnings alike.

## D-018 · 2026-09-26 · Social posts and Stories are rendered in the Worker

`SvgTemplateRenderer` (packages/ai) is the production `template_render`
adapter: satori lays out the template (unaltered photo, headline/CTA copy,
recorded facts, agency name, brand colour) as SVG and resvg rasterises it to
a PNG at the template's canvas size. No generative model touches the photo,
and text comes only from reviewed copy, facts and brand settings. Fonts
(Playfair Display, Inter; SIL OFL) are bundled as data modules; both wasm
runtimes are bundled as precompiled modules because Workers cannot compile
wasm from bytes. Worker bundle: about 1.4 MB gzip.

satori is pinned to exactly **0.32.0**. From 0.33.0 it always loads HarfBuzz
through an Emscripten loader that reads `self.location.href`, which is
undefined in Workers, so every render failed on workerd while passing in Bun.
The E2E journey now asserts a rendered 1080×1080 post in the pack and caught
this (RED on 0.33.5, GREEN on 0.32.0). Upgrade only after that E2E passes.

## D-019 · 2026-09-26 · The slideshow Reel is made in the agent's browser

Product owner decision (R7c). A Worker cannot encode video cheaply or
cleanly: the in-Worker options are GPL (x264) or patent-encumbered, and CPU
limits make 1080×1920 encoding impractical. Cloudflare Stream or a video API
would add per-render billing (OD-3 stays open for AI video).

So the Reel is rendered in the browser:
- `GET …/assets/:assetId/slideshow` returns the template spec (1080×1920,
  30 fps, 3 s per photo, 0.5 s cross-fade) and signed links to the listing's
  own photos (up to 10, in listing order).
- The client draws each photo centre-cropped to 9:16 (never stretched or
  altered) with cross-fades (`packages/domain/src/slideshow.ts`), encodes it
  with WebCodecs, and muxes MP4 with Mediabunny (MPL-2.0, unmodified,
  lazy-loaded). It prefers H.264; if the browser has no H.264 encoder it falls
  back to VP9, then AV1.
- `POST …/slideshow` accepts the MP4 only if it is exactly that Reel: every
  byte is inside a box, the file is not fragmented, it has one video track
  (avc1, vp09 or av01), the template dimensions, and the length implied by
  the photos it names, and those photos belong to the listing. It is
  stored as a new `generation` version in `needs_review`, with provenance
  `listingboost-slideshow` / `browser-<codec>` / `slideshow-v1`, the photo
  IDs as references, and an audit event.
- The campaign view marks the asset `renderer: "browser"`. `available` still
  means server generation, so the Generate button is unaffected.

Open-source Chromium (the Playwright browser) has no H.264 encoder, so the E2E
and the committed fixtures (`scripts/generate-video-fixtures.ts`) use VP9.
Chrome, Edge, Safari and Firefox encode H.264. Browsers without WebCodecs are
told so and shown no button.

## D-020 · 2026-10-02 · Logos: own upload policy, SVG and WebP stored as PNG

Work item 001 (R10). Logos are small and drawn on every graphic, so they have
their own limits, separate from property photos (D-009 is unchanged for
photos): 2 MiB, no minimum size, at most 4096 px on the longest side and 8
megapixels.

- **SVG** is accepted for logos only. Workers have no DOM, so
  `packages/storage/src/svg-safety.ts` is a strict reader of its own that
  never repairs a file: scripts, event attributes, `foreignObject`, external
  or non-fragment references, embedded images, DOCTYPE, entities, animation,
  live text and anything it does not recognise are rejected. An SVG that
  passes is rasterised by resvg to a PNG 2048 px on its longer side. Only the
  PNG is stored and served, so a mistake in the checker cannot reach a
  browser. Live text is refused because the rasteriser has no fonts.
- **WebP** is converted to PNG at upload with libwebp (`@jsquash/webp`,
  Apache-2.0). resvg cannot decode WebP and skips an image it cannot decode
  without an error, so a WebP logo would otherwise be accepted and never
  drawn. WebP logos are capped at 4 megapixels because they are decoded in
  Worker memory.
- Every raster logo is drawn once at upload and refused if nothing visible
  comes out, because upload checks are structural (D-009) and a well-formed
  file can still be undecodable.
- Each upload is a row in `brand_logos`; the profile points at the current
  one. Replaced logos are kept while the organisation exists and an owner can
  restore one. Logo files are served through signed URLs of kind `logo`.

The same decoding gap affects WebP **property photos**: a WebP primary photo
renders as a graphic with no photo. That is an existing defect, tracked as a
separate work item, and is not fixed by this decision.

## D-021 · 2026-10-02 · A campaign captures its brand at creation

Work item 001 (R10). `campaigns.brand_snapshot_json` holds agency and contact
details, colours, font references, the logo reference and preferred templates
as they were when the campaign was created. Every job in the campaign,
including regeneration and manual-edit warnings, reads the snapshot and never
the live profile, so queued work cannot change branding part-way through.
A rebrand therefore shows only in campaigns created afterwards.

- Tone of voice is not captured, not passed to any provider and not recorded
  in generation parameters. It is stored on the profile only (D-017, OD-2).
- Campaigns that existed before migration 0003 were given their
  organisation's settings as of the migration.
- A captured logo or font that cannot be loaded fails the job with a plain
  message; a default is never drawn in its place.
- A preferred template that cannot be honoured leaves that asset unavailable
  with a reason; another template is never used instead (D-012). This is
  derived from the snapshot and the template the asset was planned with, with
  no extra column.
- Migration 0003 rebuilds `brand_settings`. The colour checks in 0001 used a
  61-byte GLOB pattern, and Cloudflare D1 rejects LIKE and GLOB patterns over
  50 bytes, so saving any colour failed on D1 while passing on SQLite. Only
  the E2E on workerd showed it. A schema test now fails on any pattern over
  50 bytes.

## D-022 · 2026-10-02 · Custom fonts, WOFF2 conversion and preset fonts

Work item 001 (R10), spike 002. Owners upload TTF, OTF, WOFF or WOFF2 fonts of
up to 2 MiB after confirming usage rights on each upload; who confirmed and
when is stored on the font. A font is accepted only after satori has drawn
with it once.

- satori 0.32.0 cannot read WOFF2, and Workers can neither compile WebAssembly
  from bytes nor build functions from strings. WOFF2 is therefore converted to
  the TTF or OTF it contains at upload, by Google's woff2 as a precompiled
  WebAssembly module, and only the converted file is stored.
  `scripts/build-woff2-decoder.ts` produces the vendored decoder from the
  pinned `woff2-encoder` 2.0.0 package (MIT) by extracting its WebAssembly and
  replacing one string-built function. Each change is anchored on exact text
  and the build fails if the package differs; a unit test keeps the committed
  files identical to the script's output.
- Variable fonts are rejected in every format because satori cannot render
  them. A font larger than 8 MiB once unpacked is rejected.
- A custom font is one file and serves every weight. Removing a font hides it
  from selection and clears it from the live profile; the file stays, so
  campaigns that captured it keep rendering. Ten selectable custom fonts per
  organisation. Font files are never offered for download.
- Eight preset families (Playfair Display, Cormorant Garamond, DM Serif
  Display, Montserrat; Inter, Source Sans 3, Lato, Open Sans) ship as static
  files under `apps/web/client/public/fonts`, each with its upstream SIL OFL
  1.1 licence, and are read by the Worker through the `ASSETS` binding. They
  are not in the Worker bundle. Playfair Display and Inter also remain bundled
  as the template fallback.
- Worker bundle after this work: about 1.58 MB gzip (was 1.41 MB).

## D-023 · 2026-10-05 · WebP photos are refused; a WebP photo is never drawn blank

Work item 004. Amends D-009 for property photos. The graphics renderer (resvg, D-018) cannot
decode WebP and leaves an undecodable image out without an error, so a listing whose primary photo
was WebP produced social posts and stories with no photograph. The old test checked only the
output's width.

- Property photos are JPEG or PNG. A WebP photo is refused at upload and on replacement with
  "WebP photos can't be used on social posts or stories. Upload a JPEG or PNG." (code
  `photo_format_unsupported`). WebP is a minority case for listing photos, mostly images saved
  from websites; refusing is the least code. Browser-side conversion can be added later if agents
  ask. Owner decision.
- WebP photos stored before this change are flagged on the Images tab. Generating a graphic from
  one fails, not retried, with a message saying to add a JPEG or PNG version, make it primary and
  create a new campaign (a photo used by a campaign cannot be replaced, D-010). The check is in
  the generation service, before any renderer, and in the renderer itself.
- Graphics already made without their photo are left as they are: approved versions are
  immutable and only preview data can be affected (production has not been deployed). Owner
  decision.
- Tests now prove the photo is drawn: each graphic template rendered from a JPEG or PNG photo
  must differ from the same render with a blank photo.
- Logos still accept WebP; they are converted to PNG (D-020). HEIC photos are work item 006.

## Open decisions (need product owner)

- **OD-1 Image enhancement provider/model.** Must support faithful
  photographic correction without structural changes. Needs selection and API
  credentials.
- **OD-2 Text generation provider.** Copy works today via the fact-only
  copywriter (D-017). An LLM (proposed: Anthropic Claude via the Messages API,
  needs an API key) would add tone of voice and richer phrasing, still gated
  by the validator.
- **OD-3 Video provider for Reels.** The slideshow fallback ships (D-019). An AI
  video provider remains optional and undecided.
- **OD-4 Cloudflare resources.** Resolved for preview (D-015). Production:
  unknown whether its D1 holds the prototype schema; the deploy will stop
  and ask if it does.
