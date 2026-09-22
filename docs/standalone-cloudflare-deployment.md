# Standalone Cloudflare deployment

This is the operational boundary for the ListingBoost-owned runtime. The
Higgsfield-hosted app remains the prototype/demo surface and is not deployed by
this workflow.

## Deployment model

GitHub Actions generates an ephemeral Wrangler configuration from GitHub
Environment variables and deploys the existing Worker build with the official
Cloudflare Wrangler action.

The repository never stores:

- Cloudflare account IDs or API tokens;
- D1 database IDs;
- R2 bucket names;
- Queue names;
- production domain/route identifiers;
- authentication secrets.

Preview and production use separate GitHub Environments:

- `listingboost-preview`
- `listingboost-production`

The production workflow is **manual only**. It does not run on pushes to
`main`, so merging code cannot silently deploy production.

## Cloudflare resources

Each environment should eventually have its own:

- Worker;
- D1 database;
- R2 bucket;
- generation Queue;
- secrets;
- optional custom-domain route.

The current workflow supports D1 and optional R2/Queue bindings. Queue consumer
wiring belongs to the durable generation work in issue #54 and must not be
pretended to be complete by merely creating a producer binding.

## GitHub Environment configuration

Create the two GitHub Environments named above. For each environment configure
these **Variables**:

- `LB_WORKER_NAME`
- `LB_D1_DATABASE_ID`
- `LB_D1_DATABASE_NAME`
- `LB_BETTER_AUTH_URL`
- `LB_R2_BUCKET_NAME` (optional until R2 is provisioned)
- `LB_QUEUE_NAME` (optional until issue #54 provisions the queue)
- `LB_ROUTE` (optional)
- `LB_ZONE_NAME` (required only when `LB_ROUTE` is set)

Configure these **Secrets**:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

The Better Auth secret is deliberately not committed or interpolated into the
generated config. It must be configured separately on the target Worker before
the standalone runtime is used for customers.

## Cloudflare token scope

Use a dedicated API token for ListingBoost CI/CD and scope it to the Cloudflare
account that owns the ListingBoost resources. Grant only the permissions needed
to deploy the Worker and manage the resources actually used by the deployment.

Do not paste the token into GitHub issues, source files or chat.

## Domain

A custom domain is not required for the first infrastructure validation. A
Workers `workers.dev` address can be used while the runtime is being verified.
Choose and register the final ListingBoost domain separately once the product
name/domain decision is made.

## Current limitations

This workflow intentionally does **not**:

- provision Cloudflare resources automatically;
- apply production D1 migrations automatically;
- upload production secrets;
- enable a custom domain automatically;
- claim commercial readiness.

Those are separate, explicitly authorized operational steps.

## Verification target

The standalone runtime is not considered production-ready merely because this
workflow succeeds. Before #56 can close, verify:

1. preview and production use distinct Cloudflare resources;
2. Better Auth is ListingBoost-owned and works without Higgsfield host identity;
3. provider credentials remain server-side;
4. generation does not require `window.hf`, Higgsfield login/workspace or customer credits;
5. ListingBoost-owned R2 retains source and generated media;
6. durable Queue-backed generation is implemented and verified;
7. the first paying-customer path works outside the Higgsfield host.
