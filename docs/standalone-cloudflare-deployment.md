# Standalone Cloudflare deployment

ListingBoost's standalone runtime is deployed independently of the Higgsfield-hosted prototype. The repository keeps production resource identifiers out of source control; the manual deployment workflow reads environment-scoped GitHub variables and secrets and generates a temporary Wrangler configuration.

## GitHub environments

Create two GitHub environments:

- `preview`
- `production`

Each environment must point at its own Cloudflare resources. Do not reuse production D1 or R2 resources in preview.

### Environment variables

Set these non-secret variables in each GitHub environment:

- `LISTINGBOOST_WORKER_NAME` — unique Worker name for that environment.
- `LISTINGBOOST_D1_DATABASE_ID` — D1 database UUID for that environment.
- `LISTINGBOOST_D1_DATABASE_NAME` — D1 database name for that environment.
- `LISTINGBOOST_R2_BUCKET_NAME` — R2 bucket name for that environment.

### Environment secrets

Set these secrets in each GitHub environment:

- `CLOUDFLARE_API_TOKEN` — a narrowly scoped Cloudflare API token that can deploy the Worker and access only the required account resources.
- `CLOUDFLARE_ACCOUNT_ID` — the Cloudflare account identifier. It is kept as an environment secret so account details are not committed to the repository.

The deployment workflow never writes these values to the repository or generated source files.

## First setup

The domain is intentionally not part of the initial deployment contract. A Worker can be deployed and verified before a custom domain is selected. Domain/route binding is a later production configuration step.

Before the first deployment, the D1 databases and R2 buckets must already exist and be verified as environment-specific. Database migrations are deliberately **not** run automatically by this workflow: applying migrations to a production database is a separate controlled operation.

The workflow is manual (`workflow_dispatch`) and accepts `preview` or `production`. It does not run on pushes or pull requests, so adding the deployment path cannot itself change a production environment.

## Resource isolation

Preview and production must use different:

- Worker names
- D1 databases
- R2 buckets
- provider/API secrets
- payment secrets

The Higgsfield-hosted `listing-boost.higgsfield.app` deployment remains a prototype/demo surface and is not the authoritative paid runtime.

## Remaining runtime work

This deployment contract establishes the standalone Worker + D1 + R2 path. It does not by itself complete:

- ListingBoost-owned media migration from the legacy FNF path.
- Cloudflare Queue consumer/dispatch wiring.
- Provider API credential configuration.
- Domain binding.
- Production database migration.
- End-to-end first-paying-customer verification.
