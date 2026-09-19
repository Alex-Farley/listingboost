# App Detail scaffold contract

This is a working scaffold, not a finished product. Preserve the shipped
App Detail layout and adapt its copy, fields, model, examples, and metadata in
place.

## Production architecture rule

The Higgsfield/FNF integration is **prototype-only**. It must not become the
authoritative production boundary for ListingBoost.

For standalone production:
- ListingBoost owns customer identity, campaign persistence, billing,
  generation orchestration, media retention, and delivery.
- Campaign/domain code must use ListingBoost-owned interfaces and normalized
  types, not Higgsfield/FNF types, IDs, credits, workspaces, host auth, or
  media URLs.
- Provider-specific SDKs and APIs belong behind server-side provider adapters.
  Higgsfield may be one adapter, but replacing it must not require rewriting
  campaign, billing, identity, persistence, or delivery code.
- Do not introduce new production dependencies on fnf.internal, window.hf,
  Higgsfield customer/workspace identity, or website credits.
- The existing FNF bridge may remain while the prototype is migrated, but new
  production architecture must move away from it rather than deepen the
  dependency.

See docs/provider-architecture.md and issue #56 for the migration boundary.

## Read before editing

1. Read src/layouts/AGENTS.md before changing the screen structure.
2. Read src/components/AGENTS.md before composing UI or media interactions.
3. Read packages/fnf/ai/AGENTS.md and packages/fnf-react/ai/AGENTS.md only
   when working on the legacy prototype integration.
4. Read packages/quanta/ai/AGENTS.md for component APIs. Never patch the
   vendored packages to work around an app-level issue.

## Legacy prototype boundaries

The following remain valid only for the Higgsfield-hosted prototype while its
migration is in progress:
- src/lib/fnf.browser.ts is browser-safe and calls validated server functions.
- src/lib/fnf.functions.ts is the serialization boundary.
- src/lib/fnf.server.ts constructs the legacy Workflow Platform adapter.
- src/lib/generation-approval.ts uses the legacy host approval mechanism.
- FNF query keys and scope isolation retain the current prototype behaviour.

Do not treat these legacy boundaries as production architecture.

## Adaptation definition of done

- Replace Animal App copy, presets, prompt construction, model/settings, and
  metadata with the user's product.
- Build src/landing-content.ts from the same product brief as the generator.
  It must contain exactly three visual steps, exactly three honest feature
  cards, at least one showcase item, and one final CTA. Keep the live generator
  hero as the page's app preview; do not add a second fake app mockup.
- Keep the enforced Preset-style step previews: step 1 is a product-specific
  instruction UI, step 2 is the real primary action, and step 3 is result
  media. Generate dedicated owned media for the result and every showcase item
  under public/assets/landing/. Never reuse the marketplace cover, hero
  preview, another section's asset, or duplicate the same file under a new
  name. check:adapted verifies paths, repeated references, and duplicate file
  contents. Content may describe only capabilities the adapted app actually
  implements; never invent testimonials, customer logos, adoption numbers, or
  performance claims.
- Replace every product-representing /presets/* image with user-supplied or
  newly generated owned media at the displayed aspect ratio, then remove
  public/presets/.
- Keep real upload, approval, submit, cost, polling, success, terminal failure,
  retry, history pagination, download, and empty states in the legacy prototype
  until their production equivalents exist.
- Do not add timeout-based fake generations, fabricated history, placeholder
  hosts, stock hotlinks, CSS/emoji mock artwork, any, or type suppressions.
- Run bun run check:adapted, bun test, bun run typecheck, bun run lint,
  and bun run build. check:adapted intentionally fails until the scaffold's
  product copy/assets have actually been replaced.

## Asset policy

Use user-provided assets first. Otherwise generate bespoke product media with
the available image-generation tool and save it under a meaningful
public/assets/... path. If no suitable input or generation tool is available,
state the missing requirement instead of inventing stand-ins.

Comments should explain a security boundary, cache invariant, or integration
contract. Do not narrate obvious JSX.
