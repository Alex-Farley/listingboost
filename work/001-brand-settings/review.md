---
id: "001"
stage: review
status: approved
pr: "https://github.com/Alex-Farley/listingboost/pull/161"
approved_by: "Alex Farley <37551336+Alex-Farley@users.noreply.github.com>"
approved_on: "2026-10-05T07:33:30Z"
upstream_sha256: f9012c23173aebf25d4cd7495499e59a9472614d7938d9b82cfd7bdebcd0b68f
reviewed_commit: 06bd9ffde3a932e06a34455edf388ebf16ecd7a1
approved_sha256: d3d5d96475f1110238ab370d03f7a69b291b144766d136771023591606165b8d
---

# Review: R10 brand settings and templates

Reviewed by the same agent that wrote the change, in a separate read-only pass over the diff
against `docs/AGENT_RULES.md`, `docs/ARCHITECTURE.md`, AT-22 and the approved intent, spec and plan.
That is a weaker review than one by a different reviewer; the person's review is the real gate.
No instructions were found in the diff, commit messages or fixtures.

## Findings
| Severity | File:line | Finding | Why it matters | Suggested fix | Status |
|----------|-----------|---------|----------------|---------------|--------|
| blocker | `scripts/deploy/wrangler-config.ts:57` | The deploy-time config had no `ASSETS` binding; only `wrangler.jsonc` did. | Preset fonts would load locally and fail on preview and production with "a logo or font could not be loaded". | Add the binding; test that both configs agree. | Fixed, with a test (`tests/unit/deploy-config.test.ts`). |
| important | `apps/web/client/src/components/AssetCard.tsx:139` | An asset left unavailable by a preferred template showed only "Not available yet". | AC28 says the reason is reported; the user had no way to know what to do. | Show the API's message. | Fixed, with a UI test. |
| important | `apps/web/server/index.ts:51` | The preset font loader accepted any HTTP 200. The site answers unknown paths with the app's HTML. | A missing font file would be passed to the renderer as a font and fail the job with a confusing error. | Check the WOFF signature. | Fixed, with tests. |
| important | `migrations/0003_brand_settings.sql:57` | The rebuild dropped `logo_media_key`, which the previous Worker version selects. | Rolling the code back after this migration would break generation. | Keep the unused column. | Fixed, with a test of the old query. |
| important | deployment | Nothing here has run on a deployed Worker. Decode, rasterise and render times and memory with an 8 MiB font, an 8-megapixel logo and a photo together are unknown. | Workers have CPU and 128 MB memory limits; a job that exceeds them fails and retries. | Check Workers logs after the first preview deploy; lower the decoded-font cap if needed. | Open. Needs the preview deploy. |
| important | `work/001-brand-settings/tdd.log` | AC31 and AC32 were never seen failing. AC2 and AC4 have RED by mutation, not before the code. One E2E RED entry is an environment failure. | Weaker evidence than a test that failed first. | Accept (they pin existing guarantees), or ask for a mutation run on AC31/AC32. | Fixed for AC31/AC32: owner asked for a mutation run (2026-10-03); both fail when a brand change or regeneration touches approved data, and pass when restored (tdd.log). The rest accepted as stated. |
| important | `tests/unit/templates.test.ts`, `tests/integration/review.test.ts` | Two existing tests were edited: one assertion now checks the full catalogue, one test's setup also writes the campaign snapshot. | AGENT_RULES forbids weakening tests. Both follow the approved spec and keep their assertions, but a reviewer should confirm that reading. | Read the two hunks. | Accepted by the owner, 2026-10-03. |
| important | `apps/web/client/public/fonts/` | Four preset families declare a Reserved Font Name; the files are Google Fonts' latin subsets under the original names. | Whether a subset is a "modified version" under the OFL is a legal question. | Owner decides; the families can be removed without code changes beyond the preset list. | Accepted by the owner, 2026-10-03: keep all eight. |
| nit | `apps/web/client/src/pages/BrandSettings.tsx:349` | Pressing Enter in "Font name" submits the main form (Save) instead of uploading the font. | Surprising, though nothing is lost. | Handle Enter on that input. | Fixed, with a UI test (owner asked, 2026-10-03). |
| nit | `packages/ai/src/adapters/template-renderer.ts:107` | The version 2 brand panel Story keeps its footer near the bottom edge, inside the area Instagram covers. | Call to action and logo may be hidden on Stories. Only the Full photo Story has the safe area the spec asked for. | A version 3 with a safe area, as its own item. | Open. |
| nit | `apps/web/server/routes/brand.ts:90` | Upload size is checked from `Content-Length` before the body is read; the real size is checked after. | Same pattern as photo uploads. A request without a truthful length is still read into memory up to the platform limit. | Stream with a byte cap, for all upload routes together. | Open. |
| nit | `packages/storage/src/svg-safety.ts:23` | Blur and other filter elements are allowed in SVG logos. | A very large blur costs CPU at upload. Output is capped at 2048 px and the Worker CPU limit applies. | Drop filters from the allowlist if it proves slow. | Open. |
| nit | `apps/web/server/routes/brand.ts:67` | Members receive `previousLogos` in the API response; the page does not show them to members. | Not a leak (same organisation, read access), but more than the read-only view needs. | Omit for members. | Fixed, with a security test (owner asked, 2026-10-03). |
| nit | whole PR | 102 files, about 7,900 added lines, of which about 3,000 are tests and 480 KB are font files. | Large to review in one sitting. | Review by commit: seven commits follow the plan's slices. | Open. Owner chose one PR. |

<!-- Severity: blocker | important | nit. Check AGENT_RULES, ARCHITECTURE, ACCEPTANCE_TESTS and the approved work artifacts. -->

Checked and found sound:
- **Tenancy.** Every brand query takes an `OrganisationScope`. The two unscoped lookups
  (`getLogoForSignedDownload`, and job loading) follow the existing signed-URL and queue patterns.
  Cross-organisation logo and font ids are 404; member writes are 403.
- **Truth rules.** Tone is not captured, sent or recorded. Unset brand values stay unset. Graphics
  text comes only from reviewed copy, facts and declared brand fields. The photograph is embedded
  unaltered; the gradient is a separate layer.
- **Boundaries.** `packages/domain` still imports only zod. Renderer and decoder code is in
  `packages/ai`. No secrets, no provider credentials.
- **Decisions.** D-020, D-021 and D-022 are recorded in `docs/DECISIONS.md`.

## Comment log
<!-- Reviewer comment -> agent response -> commit -->
- 2026-10-03, owner (in session): accept the two edited tests; keep all eight preset fonts; prove
  AC31/AC32 by mutation; fix the Enter-key and member previous-logos nits. -> Done in the next
  commit; `scripts/sdlc verify` 739 pass, E2E 2 passed.

## Release
- Environment tier: staging (the preview environment deploys on every push to `main`, per
  `docs/DEPLOYMENT.md`). Production is a separate manual run.
- Feature flag: none. The repository has no flag mechanism; the owner approved a direct release.
- Rollback steps (code): redeploy the previous Worker version from the Cloudflare dashboard, or
  revert the merge commit on `main` so the deploy workflow redeploys it. The previous version runs
  against the new schema (tested: its brand query still works).
- Rollback steps (database and data - migrations, backfills; "n/a" only if nothing changes):
  migrations 0003 and 0004 are not reversed on rollback. 0003 rebuilds `brand_settings` (keeping
  every saved value), adds `brand_logos`, `brand_fonts` and `campaigns.brand_snapshot_json`, and
  backfills the snapshot. 0004 adds template rows. All are additive for the previous code. Logos
  and fonts uploaded after the release stay in R2 and D1 and are simply unused by the old code. A
  D1 export before the production migration is the way back to the old table if ever needed.
- Rollback rehearsed: no. The forward migration was rehearsed on local D1 with existing data
  (output in verify.md); a rollback was not.
- Production release approved by: product owner (Alex Farley).
- Deployment record: to be added when the PR is merged and the preview deploy runs.
