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

## Open decisions (need product owner)

- **OD-1 Image enhancement provider/model.** Must support faithful
  photographic correction without structural changes. Needs selection and API
  credentials.
- **OD-2 Text generation provider.** Proposed: Anthropic Claude via the
  Messages API. Needs API key.
- **OD-3 Video provider for Reels.** Spec allows a slideshow fallback; the
  fallback will be implemented first.
- **OD-4 Cloudflare account, D1/R2/Queue resources and secrets** for staging
  and production.
