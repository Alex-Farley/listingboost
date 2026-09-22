# Infrastructure isolation boundary

ListingBoost's repository configuration is intentionally environment-neutral.

- `app.manifest.json` declares which resource types the application needs.
- `wrangler.jsonc` is a local/build placeholder configuration and must not contain production D1, R2, KV or Worker identifiers.
- The deployment system is responsible for injecting environment-specific resources and secrets.
- Preview and production must therefore be provisioned with different D1 databases, R2 buckets, KV namespaces and secrets; `HF_ENV` alone is not an isolation mechanism.
- The CI guard `check:infra-boundary` prevents production resource identifiers from being committed to the repository configuration.

This is a repository-side guard, not proof that the external deployment platform has provisioned isolated resources. Production isolation still requires verification of the actual preview and production bindings before launch.
