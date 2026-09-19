# ListingBoost Campaign Cost Specification

**Version:** 0.1  
**Status:** Evidence baseline — not yet commercially final  
**Date:** 2026-09-19  
**Scope:** Launch campaign sold at £49; no production behaviour changed.

## 1. Campaign baseline verified in current repository/deployment

The current ListingBoost implementation creates five paid generation assets:

1. Hero — image, 4:5
2. Square — image, 1:1
3. Story — image, 9:16
4. Just Listed — image, 4:5
5. Property Reel — video, 5 seconds, 720p, 9:16, generated audio enabled

The image implementation currently uses 'nano_banana_2', with up to six supplied property photographs passed as image references and resolution selected as 1k / 2k / 4k from the UI quality setting. The current default UI quality is High, which maps to 2k.

The reel implementation currently uses 'seedance_2_5', model=default, 5 seconds, 720p, 9:16, generate_audio=true, bitrate_mode=high, with property photography supplied as image references.

The current copy path makes two LLM calls: one launch caption and one marketing plan. The model is selected dynamically from the FNF internal LLM catalogue, so its actual production model and price are not currently exposed in the ListingBoost repository.

## 2. Provider/API verification

### Seedance 2.5

Official Higgsfield API documentation currently identifies the reference-to-video model as:

bytedance/seedance-2.5/reference-to-video

The documented request shape supports:

- duration: 4–30 seconds
- resolution: 480p or 720p
- aspect ratio: 16:9, 4:3, 1:1, 3:4, 9:16, 21:9
- output format: mp4 or mov
- generate_audio: boolean
- image_urls, video_urls and audio_urls
- server-side API-key authentication

The current ListingBoost request shape is therefore supported by the current API contract.

Official pricing is token-metered. For 480p/720p reference-to-video without video input, the current console documentation states $0.0214 per 1,000 video tokens, with a 0.6x rate ($0.01284 / 1,000) where the reference-to-video discount applies. Image and audio references do not count as video input.

For the current 5-second 720p 16:9 output, using the documented token formula:

ceil((input_video_seconds + generated_seconds) × output_width × output_height × 24 / 1024)

and with no input video:

- output dimensions: 1280 × 720
- generated duration: 5 seconds
- billable tokens: 108,000
- at $0.01284 / 1,000 tokens: $1.38672
- at $0.0214 / 1,000 tokens: $2.31120

These figures are provider/API economics, not Higgsfield website credits.

Important: the console also displays a per-second headline range for Seedance 2.5. Because the displayed range and token formula do not reconcile exactly for this request shape, the exact commercial rate should be confirmed against a live API cost estimate or billing response before the launch budget is finalised.

### Nano Banana 2

The current repository calls 'nano_banana_2'. The current official Higgsfield CLI catalogue identifies 'nano_banana_2' as Nano Banana Pro, not Nano Banana 2. It separately identifies 'nano_banana_flash' as Nano Banana 2 and 'nano_banana_2_lite' as Nano Banana 2 Lite.

The current repository's model naming therefore requires explicit reconciliation before the campaign cost specification can be considered final.

The repository's current 'nano_banana_2' contract supports:

- 1k / 2k / 4k
- 4:5, 1:1 and 9:16 among supported ratios
- up to 14 image references
- one output per campaign asset

The repository contains a FNF-internal credit calculation of 2 credits per image at 1k/2k and 4 credits at 4k. These are Higgsfield website/FNF credits and are not acceptable as the commercial API cost.

A current official public USD API price for the exact 'nano_banana_2' request shape was not located in the accessible official API documentation during this iteration. This remains UNVERIFIED.

## 3. Copy generation

The current implementation performs two separate LLM completions:

- launch caption
- marketing plan

The production model is selected from fnf.internal/llm at runtime. The repository does not contain the actual model identifier or USD token pricing.

Therefore:

- copy input/output token volume: UNVERIFIED
- copy model: UNVERIFIED
- copy USD cost: UNVERIFIED

No assumption of zero cost is permitted.

## 4. Known provider-cost floor

Only the reel currently has a defensible USD API calculation.

Using the lower Seedance reference-to-video rate above:

- reel: $1.38672

Using the higher documented token rate:

- reel: $2.31120

The four image generations plus copy remain unpriced in USD.

Therefore the total campaign provider cost is currently:

$1.38672–$2.31120 + 4 × image API cost + 2 × copy-completion cost

This is a formula, not a final launch cost.

## 5. Retry and failure policy — required assumptions for finalisation

No commercial retry allowance is currently enforced by the application.

For the launch specification, the final version must explicitly choose and document:

- maximum attempts per asset
- treatment of provider-reported non-billable failures
- treatment of billable failed/retried generations
- whether one customer regeneration is included
- hard campaign provider-spend ceiling

Until that is implemented and verified, the conservative provider cost must include a bounded retry allowance rather than assuming zero retries.

## 6. Payment processing

For UK standard cards, current Stripe UK pricing is:

- 1.5% + £0.20 per successful payment

At a £49 customer payment this is:

- percentage fee: £0.735
- fixed fee: £0.20
- total: £0.935
- gross after Stripe fee, before generation/infrastructure/tax: £48.065

EU and international cards have higher rates and currency-conversion fees may apply, so the launch specification should model these separately.

## 7. Infrastructure

Current target architecture uses Cloudflare Workers + D1, with R2/Queues to be added as the production architecture is completed.

Current Cloudflare documentation states:

- Workers Free: 100,000 requests/day
- D1 Free: 5m rows read/day, 100k rows written/day, 5 GB storage
- R2 Free: 10 GB-month storage, 1m Class A operations/month, 10m Class B operations/month, free egress

The current deployed Higgsfield app manifest has D1 enabled but R2 disabled.

At low initial volume, infrastructure allowance can therefore be modelled separately from provider generation cost. Exact per-campaign infrastructure allocation remains TBD until the standalone production runtime is implemented and observed.

## 8. FX and tax

Provider API prices are currently denominated in USD while the customer price is £49.

The final specification must state:

- FX conversion source/rate
- FX safety margin
- whether £49 is VAT-inclusive
- ListingBoost VAT treatment
- whether provider prices are treated as tax-inclusive or tax-exclusive

These are currently UNVERIFIED / TBD.

## 9. Current commercial conclusion

£49 cannot yet be declared economically viable or non-viable from verified evidence.

The known Stripe fee is modest relative to the £49 price, and the known reel cost is materially below the customer price. However, the four image costs and two copy-generation costs are required to establish total provider spend, and the current repository's 'nano_banana_2' naming conflicts with the current official model catalogue naming.

The immediate blocker is therefore not implementation of checkout. It is completion of the provider-cost evidence:

1. reconcile 'nano_banana_2' versus current official Nano Banana model IDs;
2. obtain the exact USD API cost for the four image requests;
3. identify the production copy model and cost;
4. reconcile the Seedance token calculation with the current displayed pricing for the exact request;
5. set a bounded retry allowance and hard campaign provider budget.

No production product behaviour was changed by this specification.

## 10. Inputs to downstream issues

- #41: launch offer remains £49 pending completion of this specification.
- #55: campaign budget must be derived from the final version of this specification.
- #8 / #9: asset strategy should preserve provider-neutral requirements and not encode website-credit economics.
- #49: current provider naming mismatch reinforces the need for the provider adapter boundary.
- #56: the deployed app is still a Higgsfield-hosted prototype, not the final paid runtime.
