# Production provider boundary

ListingBoost is provider-neutral at the product/domain boundary.

## Rules

- Campaign specifications describe the customer deliverable, not a vendor, model ID, account, credits, workspace, or host UI.
- Provider selection belongs in a server-side adapter/strategy layer.
- Provider-specific SDKs, URLs, credentials, job IDs, media URLs, pricing and retry semantics must not leak into campaign, billing, identity, persistence, or customer-facing delivery code.
- A provider adapter may translate ListingBoost's AssetSpecification into provider-specific requests and return normalized results plus provenance/cost metadata.
- Higgsfield is allowed as one adapter implementation, but is not the production application's identity, auth, billing, media-storage, or host-runtime boundary.
- Website/app credits are not ListingBoost commercial cost accounting. Production cost accounting must use the provider's API billing contract.
- Customer downloads must resolve to ListingBoost-owned retained media, not permanent dependence on provider URLs.
- Model IDs are configuration/strategy data, not domain constants. Provider availability must be verified from the provider's current API catalogue.
- Adding or replacing a provider should require changing an adapter/strategy and its tests, not campaign persistence or customer workflow.

## Current migration state

The provider-neutral domain types live in src/lib/generation-provider.ts. The existing Higgsfield/FNF integration remains in the prototype path and is being isolated behind this boundary before standalone production.

Until the migration is complete, the Higgsfield-hosted deployment is a prototype only. It must not be treated as the authoritative paid production runtime.
