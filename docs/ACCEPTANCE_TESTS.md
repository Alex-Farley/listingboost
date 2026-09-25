# Acceptance-test backlog

Priority: P0 = MVP-blocking correctness/security, P1 = MVP-required
behaviour, P2 = later. Status: ⬜ not started · 🟥 RED (tests written, failing)
· 🟩 GREEN (implemented, passing) · ⛔ blocked.

| ID | Requirement | Pri | Layer | Status |
| --- | --- | --- | --- | --- |
| AT-01 | User can sign up and sign in | P0 | integration, security | ⬜ |
| AT-02 | User cannot access another organisation's data | P0 | security | ⬜ |
| AT-03 | User can create a property | P0 | integration | ⬜ |
| AT-04 | Invalid photo upload is rejected | P0 | unit, security | ⬜ |
| AT-05 | Secure photo upload works | P0 | integration | ⬜ |
| AT-06 | Campaign can be created | P0 | integration | ⬜ |
| AT-07 | Generation lifecycle is enforced | P0 | unit, integration | ⬜ |
| AT-08 | Provider failure is handled correctly | P0 | integration | ⬜ |
| AT-09 | Asset belongs to the correct campaign | P0 | integration (DB) | ⬜ |
| AT-10 | Only approved assets are treated as final | P0 | unit, integration | ⬜ |
| AT-11 | User can download their own assets | P0 | integration | ⬜ |
| AT-12 | User cannot download another organisation's assets | P0 | security | ⬜ |
| AT-13 | Full property → campaign workflow works | P1 | e2e | ⬜ |
| AT-14 | Marketing pack can be generated and downloaded | P1 | integration | ⬜ |
| AT-15 | Generated copy cannot introduce unsupported facts | P0 | unit | ⬜ |
| AT-16 | Enhancement respects protected property characteristics | P0 | unit, integration (DB) | ⬜ |
| AT-17 | Regeneration creates a new asset version | P0 | unit, integration | ⬜ |
| AT-18 | Approved asset versions remain immutable | P0 | unit, integration (DB) | ⬜ |
| AT-19 | Unauthorised users cannot obtain signed media URLs | P0 | security | ⬜ |
| AT-20 | Transient generation failures are retried appropriately | P0 | unit, integration | ⬜ |

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
