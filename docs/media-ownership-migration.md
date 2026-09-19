# Media ownership migration

ListingBoost production media is owned by ListingBoost. R2 is the canonical retained store; provider URLs are transient ingestion inputs only.

## Boundary

- Domain records refer to ListingBoost media IDs/object keys.
- Provider media IDs and URLs are provenance/ingestion details, never customer-facing storage identifiers.
- Source uploads must be written to R2 before campaign persistence treats them as authoritative.
- Completed provider outputs must be copied to R2 before delivery.
- Customer download routes read ListingBoost media, never provider raw URLs.
- Preview and production R2 buckets must be separate.

## Migration state

The current prototype still uses the FNF adapter for source upload and provider output retrieval. Migration must be additive: introduce ListingBoost media records and R2 writes first, backfill/dual-read where required, then remove FNF media dependencies. Do not perform destructive production migration until the standalone Cloudflare resources are provisioned and verified.
