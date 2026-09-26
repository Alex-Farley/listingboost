# ListingBoost architecture

Status: Phase 0 baseline. This document is the source of truth for structure,
boundaries and state machines. Significant changes are recorded in
[DECISIONS.md](DECISIONS.md).

## 1. Runtime

```
Browser (React SPA, apps/web/client)
   │  same-origin fetch, session cookie
   ▼
Cloudflare Worker (apps/web/server)
   ├── HTTP API  /api/*        auth, validation, orchestration
   ├── Static assets           built SPA (Workers assets)
   ├── Queue consumer          generation jobs
   ├── D1  (binding DB)        authoritative relational state
   ├── R2  (binding MEDIA)     private media objects
   └── Queue (binding JOBS)    generation job transport (not source of truth)
```

The database is the source of truth. The queue only carries job IDs; a
consumer re-reads the job from D1 and applies transitions through the
central state machine, so duplicate or late messages are harmless.

## 2. Code layout

| Path | Responsibility | May depend on |
| --- | --- | --- |
| `packages/domain` | Pure business rules: property facts, truth rules, campaign/asset model, state machines, permissions. No I/O. | nothing |
| `packages/database` | SQL access (D1-compatible `SqlDatabase` port), tenant-scoped repositories. | domain |
| `packages/storage` | Object storage port, R2 adapter, upload validation, signed media URLs. | domain |
| `packages/ai` | Provider adapter interfaces (enhancement, image, video, text, upscale) and concrete adapters. | domain |
| `packages/generation` | Generation service: job creation, execution, retries, persistence of outputs. | domain, database, storage, ai |
| `packages/templates` | Versioned, data-driven marketing templates. | domain |
| `apps/web/server` | Worker entry, router, auth/session, CSRF, rate limiting, API handlers. | all packages |
| `apps/web/client` | React UI. Talks only to `/api/*`; never imports server packages except `domain` types. | domain (types only) |
| `migrations/` | D1 SQL migrations (applied in order, also by the test harness). | – |
| `tests/` | `unit/`, `integration/`, `security/`, `e2e/`, shared `support/`. | – |

Packages are plain directories resolved through `tsconfig.json` `paths`
(`@listingboost/<name>`). They are not separately published.

## 3. Multi-tenancy

```
organisations ─┬─ organisation_members ── users
               ├─ brand_settings
               ├─ properties ── property_media
               └─ campaigns ── campaign_assets ── asset_versions
                                  └── generation_jobs
```

Rules:

1. Every tenant-owned table carries `organisation_id`.
2. Child rows reference parents through **composite foreign keys**
   `(parent_id, organisation_id)`, so the database rejects a campaign that
   points at another organisation's property, or an asset that points at
   another organisation's campaign.
3. Repositories take an `OrganisationScope` (derived server-side from the
   session) as a required argument and always filter by it. There is no
   repository method that reads tenant data without a scope.
4. Cross-tenant lookups return "not found" (never "forbidden"), so IDs do not
   leak existence.

## 4. Authentication and sessions

- Email + password. Passwords hashed with PBKDF2-SHA-256 (WebCrypto,
  100 000 iterations — the Workers maximum), per-user random salt.
- Sessions: 32 random bytes, sent as `__Host-lb_session` cookie
  (`HttpOnly; Secure; SameSite=Lax; Path=/`). Only the SHA-256 of the token
  is stored. Sliding expiry is not used; sessions expire after 30 days.
- CSRF: all non-GET `/api/*` requests must carry `Origin` matching the app
  origin **and** the `X-ListingBoost-CSRF: 1` header (not settable
  cross-origin without CORS preflight, which the API never grants).
- Rate limiting: fixed-window counters in D1 for sign-in, sign-up and
  generation requests.

## 5. Media

- All media objects are private in R2. Object keys are server-generated:
  `org/<orgId>/<kind>/<mediaId>` — never derived from user input.
- Uploads go through the Worker, which validates size, declared MIME type,
  extension, magic bytes, parsed dimensions and structural integrity before
  writing to R2. (Direct-to-R2 presigned uploads are a later optimisation; see
  DECISIONS D-007.)
- Downloads use short-lived signed URLs: `/api/media/<mediaId>?exp=…&sig=…`
  where `sig = HMAC-SHA-256(MEDIA_SIGNING_SECRET, mediaId|exp|disposition)`.
  A signed URL is only issued after a tenant-scoped lookup succeeds.

## 6. Generation

```
API request ─► GenerationService.request()  ─► asset_versions row (queued)
                                             ─► generation_jobs row (queued)
                                             ─► queue message {jobId}
Queue consumer ─► GenerationService.run(jobId)
                    ├─ transition processing
                    ├─ ProviderAdapter.<capability>(normalised request)
                    ├─ store output media in R2 / text in DB
                    ├─ transition completed → needs_review
                    └─ on error: transient → back to queued with backoff
                                  permanent → failed
```

The consumer (`queue()` handler) acks unknown/malformed messages and asks the
queue to retry only on unexpected infrastructure errors. A Cron `scheduled()`
handler runs `GenerationService.sweep()` every 5 minutes (D-013).

Assets map to capabilities through their template: enhanced photo →
`image_enhancement`; social post / story → `template_render`; reel →
`video_generation`; copy → `text_generation`. Capabilities without a
registered adapter are reported as unavailable (D-012). The exception is the
slideshow Reel template: without a server video adapter it is rendered in the
agent's browser and uploaded through a strict MP4 check (`renderer:
"browser"`, D-019).

Provider adapters are selected per capability by configuration. Adapters
receive ListingBoost-normalised requests and return normalised results plus
provenance (`provider`, `model`, provider request ID). Provider names never
appear in the client.

### 6.1 Asset version state machine (central: `packages/domain/src/asset-state.ts`)

```
queued ──► processing ──► completed ──► needs_review ──► approved
  │            │  │                          │
  │            │  └──► failed                └──► rejected
  │            └─────► cancelled
  │            └─────► queued   (transient failure, attempts remain)
  └──► cancelled
```

- Terminal: `failed`, `cancelled`, `approved`, `rejected`.
- Text edits create a new version that starts in `needs_review`.
- Regeneration always creates a new version; it never mutates an existing one.
- `approved` versions are immutable (enforced in domain **and** by a D1
  trigger).
- The *final* version of an asset is the most recently approved one. Only
  final versions are included in the marketing pack.

## 7. Truth rules

- **Property truth.** Every image version has a `treatment`:
  `enhancement` (photographic corrections only) or `visualisation`
  (staging/redesign). A `visualisation` must carry the disclosure label
  `POTENTIAL VISUALISATION — Digitally generated • Illustrative only`; the
  database rejects a visualisation row without it. Enhancement requests are
  built from an allow-list of operations and always carry the protected
  characteristics list; free-text instructions requesting structural change
  are rejected for `enhancement`.
- **Copy truth.** Copy generation receives only verified facts. Output is
  checked by a claim validator that rejects numbers of rooms, measurements,
  tenure, parking, garden, views, transport times, schools, renovation or
  history claims that are not supported by recorded facts.

## 8. Error taxonomy

`ValidationError`, `AuthenticationError`, `AuthorisationError` (surfaced as
not-found for tenant data), `NotFoundError`, `ConflictError`,
`ProviderError { transient: boolean }`, `InfrastructureError`. The API maps
them to 400/401/404/404/409/502/503 with a stable `code` and never returns
stack traces or provider payloads.
