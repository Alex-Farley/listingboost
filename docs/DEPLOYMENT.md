# Deployment

ListingBoost deploys as one Cloudflare Worker (API, static client, queue
consumer, cron sweeper) with D1, R2 and a Queue. `.github/workflows/deploy.yml`
does everything; nothing account-specific is committed.

| Environment | Trigger | GitHub Environment |
| --- | --- | --- |
| Preview | every push to `main` | `listingboost-preview` |
| Production | manual *Run workflow* → `production` | `listingboost-production` |

## GitHub Environment configuration

**Secrets:** `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

**Variables:**

| Variable | Required | Notes |
| --- | --- | --- |
| `LB_WORKER_NAME` | yes | Worker name |
| `LB_D1_DATABASE_ID`, `LB_D1_DATABASE_NAME` | yes | D1 database |
| `LB_R2_BUCKET_NAME` | yes | Private media bucket (created for preview if missing) |
| `LB_APP_ORIGIN` | yes* | e.g. `https://preview.listingboost.co.uk`. *Falls back to the legacy `LB_BETTER_AUTH_URL`. |
| `LB_QUEUE_NAME` | no | Defaults to `<worker>-jobs`; created if missing |
| `LB_ROUTE`, `LB_ZONE_NAME` | no | Custom domain route |

## What a deploy does

1. `bun run verify` (typecheck, lint, all tests, build).
2. Generates the Wrangler config from the variables (`scripts/deploy/wrangler-config.ts`).
3. Ensures the R2 bucket (preview only) and the generation Queue exist.
4. **Preview only:** if D1 still holds the pre-rebuild prototype schema, exports
   a full backup (uploaded as the `legacy-preview-d1-backup` artifact, kept
   90 days) and drops it (`scripts/deploy/legacy-d1.ts`, D-015). It acts only
   when the applied migrations are exactly the prototype's; any other unknown
   state stops the deploy untouched. Once reset, later deploys see `current`
   and do nothing.
   **Production:** a prototype or unknown schema stops the deploy. Production is
   never reset automatically.
5. Applies D1 migrations, deploys the Worker.
6. Generates `MEDIA_SIGNING_SECRET` once if the Worker doesn't have it (never
   rotated by deploys).
7. Smoke test: `/api/session` returns the JSON 401 with security headers, and `/`
   serves the client.

## Restoring the prototype backup

Download the artifact and run `wrangler d1 execute <db> --remote --file legacy-d1-backup.sql`
against an **empty** database. This was rehearsed locally: the restored
database had all 10 tables and 8 migration records.
