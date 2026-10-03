# Acceptance-test backlog

Priority: P0 = MVP-blocking correctness/security, P1 = MVP-required
behaviour, P2 = later. Status: ⬜ not started · 🟥 RED (tests written, failing)
· 🟨 partially GREEN (some layers done) · 🟩 GREEN (all layers passing) · ⛔ blocked.

| ID | Requirement | Pri | Layer | Status |
| --- | --- | --- | --- | --- |
| AT-01 | User can sign up and sign in | P0 | integration, security | 🟩 |
| AT-02 | User cannot access another organisation's data | P0 | security | 🟨 |
| AT-03 | User can create a property | P0 | integration | 🟨 |
| AT-04 | Invalid photo upload is rejected | P0 | unit, security | 🟩 |
| AT-05 | Secure photo upload works | P0 | integration | 🟩 |
| AT-06 | Campaign can be created | P0 | integration | 🟩 |
| AT-07 | Generation lifecycle is enforced | P0 | unit, integration | 🟩 |
| AT-08 | Provider failure is handled correctly | P0 | integration | 🟩 |
| AT-09 | Asset belongs to the correct campaign | P0 | integration (DB) | 🟨 |
| AT-10 | Only approved assets are treated as final | P0 | unit, integration | 🟩 |
| AT-11 | User can download their own assets | P0 | integration | 🟩 |
| AT-12 | User cannot download another organisation's assets | P0 | security | 🟩 |
| AT-13 | Full property → campaign workflow works | P1 | e2e | 🟨 |
| AT-14 | Marketing pack can be generated and downloaded | P1 | integration | 🟩 |
| AT-15 | Generated copy cannot introduce unsupported facts | P0 | unit | 🟩 |
| AT-16 | Enhancement respects protected property characteristics | P0 | unit, integration (DB) | 🟨 |
| AT-17 | Regeneration creates a new asset version | P0 | unit, integration | 🟩 |
| AT-18 | Approved asset versions remain immutable | P0 | unit, integration (DB) | 🟩 |
| AT-19 | Unauthorised users cannot obtain signed media URLs | P0 | security | 🟩 |
| AT-20 | Transient generation failures are retried appropriately | P0 | unit, integration | 🟩 |
| AT-21 | Delivery workflow records gated work and verifies with the repository command | P1 | manual | 🟩 |
| AT-22 | Organisation brand settings are managed and applied to new marketing assets | P1 | unit, integration, security, UI, E2E | 🟩 |

## Acceptance criteria

### AT-01 Sign up / sign in
- Sign-up with valid email + password (≥ 12 chars) creates a user, an
  organisation and an `owner` membership, and returns a session cookie
  (`HttpOnly`, `Secure`, `SameSite=Lax`, `__Host-` prefix).
- Duplicate email → 409 without revealing more.
- Sign-in with correct credentials → session; wrong password or unknown email
  → identical 401 response.
- Password is never stored in plain text; stored hash verifies.
- `GET /api/session` with a valid cookie returns the user and organisation;
  with no/expired/unknown cookie → 401.
- Sign-out invalidates the session server-side.
- Repeated failed sign-ins from one key are rate limited (429).

### AT-02 Tenant isolation
- For every tenant resource route (property, media, campaign, asset,
  version, job, download, pack), user A requesting B's ID receives 404 and B's
  data is unchanged.
- Listing endpoints never include other organisations' rows.
- DB rejects child rows whose `organisation_id` differs from the parent's.

### AT-03 Create property
- Required: title *or* address line 1, postcode (UK format), property type.
- Optional facts are stored as `null` when absent — never defaulted.
- Each fact records provenance (`manual`, `import:<source>`), and verified
  state.
- Invalid input → 400 with field errors; nothing persisted.

### AT-04 Invalid upload rejected
- Rejected: disallowed MIME, extension mismatch, magic bytes mismatch,
  > 25 MB, zero bytes, truncated/corrupt structure, dimensions < 400 px on
  the short edge or > 40 MP, unsupported formats (GIF, SVG, HEIC for now).
- Rejection writes nothing to storage or DB.

### AT-05 Secure upload
- Valid JPEG/PNG/WebP is stored under a server-generated key in the caller's
  organisation prefix; metadata (mime, bytes, width, height, sha256, position)
  persisted; first photo becomes primary; reorder, delete and primary
  selection work and are tenant-scoped.

### AT-06 Campaign creation
- Campaign requires a property in the same organisation with ≥ 1 photo.
- Creation plans asset slots from the default template set (enhanced photo
  per source photo, social 1:1, social 4:5, story 9:16, reel 9:16, copy set).

### AT-07 Lifecycle
- Every valid transition in ARCHITECTURE §6.1 is accepted; every other pair
  is rejected by the domain and by the repository (409).

### AT-08 Provider failure
- Permanent provider error → version `failed` with safe error code/message;
  campaign progress reflects it; the user can regenerate.
- No provider payload or secret reaches the API response.

### AT-09 Asset/campaign integrity
- Asset and version rows cannot reference a campaign/property/media of a
  different campaign or organisation (DB composite FKs + service checks).

### AT-10 Final = approved
- Marketing pack and "final" views include only the most recently approved
  version of each asset; `needs_review`/`rejected`/`failed` versions are never
  included.

### AT-11 / AT-12 Downloads
- A member can obtain a signed URL for their organisation's media/version and
  download it before expiry with correct `Content-Disposition`.
- Another organisation's member gets 404 when asking for a signed URL.
- Tampered signature, altered media ID, or expired URL → 403.

### AT-13 Full workflow (E2E)
Status note: the journey passes end to end with copy from the fact-only
copywriter, social posts/Stories from the template renderer and the Reel made
in the browser (all approved and checked in the pack). Enhanced images join
it once OD-1 is decided.
- Sign in → create property → upload photos → create campaign → generation
  progresses → review → approve → download marketing pack ZIP.

### AT-14 Marketing pack
- ZIP contains only final approved versions, structured
  `<Property-slug>/{Photography,Social,Stories,Reels,Copy}/` with sensible
  filenames; requesting it requires membership; empty-approval pack → 409.

### AT-15 Copy truth
- The claim validator rejects copy that states bedroom/bathroom/reception
  counts, floor area, price, tenure, parking, garden, views, transport times,
  schools, renovations or history not supported by the property's facts; it
  accepts copy that only restates supported facts.

### AT-16 Property truth
- Enhancement requests accept only allow-listed photographic operations and
  reject instructions implying structural change.
- Every enhancement provider request includes the protected characteristics.
- A `visualisation` version cannot be persisted without its disclosure label
  (domain + DB CHECK).

### AT-17 Regeneration
- Regenerating an asset creates version n+1 with a new job; version n is
  unchanged.

### AT-18 Immutability
- An approved version's content/state cannot be changed via domain, service or
  direct SQL UPDATE (trigger aborts).

### AT-19 Signed URL issuance
- Unauthenticated → 401; other organisation → 404; no signed URL is ever
  returned for media the caller cannot read.

### AT-20 Transient retries
- Transient provider/infrastructure errors return the version to `queued`
  with incremented attempt and exponential backoff delay, up to 3 attempts;
  the 3rd transient failure → `failed` (`retries_exhausted`).

### AT-21 Delivery workflow
- New work follows the staged intent → spec → plan → build → verify → review
  workflow, or the documented small-change route when eligible.
- Work artifacts and approvals are recorded under `work/`; agents leave
  approval gates to a human and do not merge their PR.
- After review approval, `scripts/sdlc check --merge-ready <base>` confirms
  that the approved review still covers the PR code; run it again after later
  changes because `scripts/sdlc status` checks artifact gates only.
- The full verification command is `bun run verify`.
- Existing ListingBoost product, architecture, acceptance, status and agent
  rules remain authoritative over generic workflow templates.
- Optional AI review, credentials, policy packs and Git hooks remain disabled
  unless separately configured.

### AT-22 Brand settings and templates
- Each organisation can manage agency identity, contact details, logo,
  colours, typography, a stored (not applied) tone preference and preferred
  templates; unset values are clear and are not presented as configured facts.
- Organisation members can view settings, owners can edit them, and one
  organisation cannot read or change another's settings.
- Settings are validated, saved and reloaded with recoverable field-level
  errors. Logo files are private and organisation-scoped; replaced logos remain
  available for owner restore while the organisation exists. An SVG logo is
  safety-checked and kept only as a PNG; a WebP logo is also kept as a PNG. A
  logo the renderer cannot draw is refused. Poor colour contrast warns on save.
- New generated graphics use applicable saved visual brand values and each
  template controls which agency/contact fields it displays. Tone is stored
  only; applying it to copy is out of scope pending a separate decision. No
  unsupported property claims are added.
- A campaign snapshots brand settings and preferred templates at creation.
  Each asset keeps its template version, and an unavailable preference is
  reported rather than silently substituted.
- Custom fonts can be uploaded in WOFF, WOFF2, TTF or OTF format, up to 2 MiB
  each, after the uploader confirms usage rights. A curated preset list is
  grouped by body-text and heading use and does not limit custom uploads.
  Removing a custom font hides it and keeps the file. Each graphic slot offers
  two layouts to choose a preference from.
- Changing brand settings or preferred templates does not alter previously
  approved assets or their stored bytes; regeneration creates a new version.
- Settings are operable by keyboard and assistive technology and at narrow
  mobile widths.
- On the Worker runtime (E2E): SVG and WebP logos, a WOFF2 font, a preset font
  and both layouts produce full-size graphics, and saving a colour works on D1.
