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

## Open decisions (need product owner)

- **OD-1 Image enhancement provider/model.** Must support faithful
  photographic correction without structural changes. Needs selection and API
  credentials.
- **OD-2 Text generation provider.** Proposed: Anthropic Claude via the
  Messages API. Needs API key.
- **OD-3 Video provider for Reels.** Spec allows a slideshow fallback; the
  fallback will be implemented first.
- **OD-4 Cloudflare resources.** Account and GitHub Environments exist
  (D-014). Needed: fresh D1 databases (or approval to wipe preview), a Queue
  and consumer per environment, `MEDIA_SIGNING_SECRET` Worker secrets.
