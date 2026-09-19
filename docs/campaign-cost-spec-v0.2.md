# ListingBoost Campaign Cost Specification

**Version:** 0.2  
**Status:** Evidence baseline — provider API USD economics still incomplete  
**Date:** 2026-09-19  
**Scope:** £49 launch campaign; no production behaviour changed.

## 1. Current campaign baseline

Verified against the current repository:

- up to 6 source property photos
- Hero — Nano Banana 2, 4:5
- Square — Nano Banana 2, 1:1
- Story — Nano Banana 2, 9:16
- Just Listed — Nano Banana 2, 4:5
- Property Reel — Seedance 2.5, 5 seconds, 720p, 9:16, generated audio enabled
- 1 launch caption
- 1 marketing plan

The current UI defaults image quality to High, which maps to 2K.

The current implementation passes the property photographs as image references. The four image requests use model ID \`nano_banana_2\`; the reel uses \`seedance_2_5\`.

## 2. Important correction from v0.1

The v0.1 specification incorrectly stated that the current Higgsfield model catalogue identified \`nano_banana_2\` as Nano Banana Pro.

That is **incorrect and has been corrected here**.

The current official Higgsfield model catalogue accessed through the provider integration identifies:

- \`nano_banana_2\` → **Nano Banana 2**, Google
- \`nano_banana_pro\` → **Nano Banana Pro**, Google
- \`nano_banana_2_lite\` → **Nano Banana 2 Lite**

The current repository therefore has the correct Nano Banana 2 model identifier. No model change is justified by the previous finding.

Higgsfield's current public help content independently describes Nano Banana 2 as its fast production model and distinguishes it from Nano Banana Pro.

## 3. Current provider request contracts

### Nano Banana 2

Current provider catalogue:

- model: \`nano_banana_2\`
- provider: Google
- output: image
- resolutions: 1K, 2K, 4K
- supported ratios include 4:5, 1:1 and 9:16
- image references supported
- up to 14 reference objects/inputs according to current Higgsfield product documentation

The current ListingBoost request shape is therefore structurally compatible with the provider catalogue.

A provider-side read-only estimate for the exact current 2K requests returned **2 Higgsfield credits per image** for each of the four campaign ratios.

This is useful as a regression check against the current prototype, but **must not be treated as the commercial API cost**. Higgsfield states that website credits and API USD billing are separate products.

### Seedance 2.5

Current provider catalogue:

- model: \`seedance_2_5\`
- mode: omni-reference for the intended image-reference workflow
- duration: 5 seconds
- resolution: 720p
- aspect ratio: 9:16
- generate_audio: true
- bitrate_mode: high
- image references supported

A provider-side read-only estimate for the exact request returned **35 Higgsfield credits**.

Again, this is a prototype credit estimate, not the commercial API USD cost.

The current official API reference also exposes the underlying USD token-metering formula for Seedance 2.5 Reference to Video: at 480p/720p, 1,000 video tokens cost **$0.01284 when video input is present** (0.6× the standard $0.0214 rate), while image references do not count as video input. For the ListingBoost request, the supplied references are photographs rather than a reference video, so the documented formula gives 108,000 billable video tokens for a 5-second 720p 9:16 output (720 × 1280 × 24 fps), or **$1.38672** at the documented reference-to-video rate, before any applicable customer discount.

This calculation is now a verified API pricing calculation, but it is still subject to confirming that the production request uses the same Reference to Video configuration and that generate_audio and bitrate_mode=high do not introduce an additional charge. The public reference page does not state an additional audio/bitrate surcharge.

## 4. API versus website billing

This distinction is now directly verified from current official Higgsfield material:

- Higgsfield website plans use subscriptions/credits.
- Higgsfield API is a separate product.
- API usage is paid from a **US-dollar prepaid balance**.
- API generation does not require a Higgsfield website subscription.
- The API has a public model catalogue and an estimate mechanism.

Therefore the ListingBoost commercial architecture can use a server-side Higgsfield API account without requiring customers to have Higgsfield accounts or credits.

This directly supports the intended £49 commercial model.

## 5. API USD pricing status

The current official Higgsfield API documentation states that image models are priced per image and video models per second, with configuration-specific rates published in the API catalogue. It also states that an estimate endpoint exists for preflight costing.

However, the accessible provider integration in this environment exposes **credit estimates for the Higgsfield application workspace**, not the external API's USD estimate endpoint.

The Seedance 2.5 reel now has a documented API USD calculation of **$1.38672** for the current 5s/720p/9:16 reference-to-video configuration, subject to the audio/bitrate confirmation above. The four Nano Banana 2 image prices remain **UNVERIFIED** from a live API USD estimate/pricing response in this environment.

No website-credit-to-USD conversion will be assumed.

## 6. Copy generation

The current implementation makes two separate LLM calls:

1. launch caption
2. marketing plan

The model is selected dynamically from \`fnf.internal/llm\`.

The repository does not expose:

- the actual production LLM model ID
- input/output token accounting
- USD price
- failure/refund billing semantics

Copy cost therefore remains **UNVERIFIED**.

## 7. Known payment cost

Current Stripe UK standard card pricing is 1.5% + £0.20 per successful payment.

For £49:

- percentage component: £0.735
- fixed component: £0.20
- payment cost: £0.935
- proceeds before provider generation, infrastructure and tax: £48.065

International-card and FX cases require separate modelling.

## 8. Provider failure and retry economics

The current prototype retains completed campaign assets and resumes from the remaining step after a failure.

It does **not yet enforce a ListingBoost-owned provider-spend budget**.

Final commercial specification must therefore define:

- one bounded retry allowance
- billable versus non-billable provider failures
- provider refund treatment
- permitted customer regeneration
- hard campaign spend ceiling

This belongs in #55 after #48 has a verified USD cost basis.

## 9. Infrastructure

The intended production architecture remains Cloudflare Workers + D1 + R2 + Queues, with no unnecessary additional infrastructure.

The current deployed Higgsfield prototype has D1 enabled and R2 disabled. This is acceptable for the prototype but does not satisfy the intended production media lifecycle.

Infrastructure cost per campaign remains TBD until the standalone production runtime exists and real usage can be measured.

## 10. FX and tax

Provider API costs are USD while the customer price is GBP.

Still requiring explicit commercial decisions:

- FX source/rate
- FX safety margin
- VAT treatment of the £49 price
- ListingBoost VAT position
- treatment of provider taxes

These must remain separate from provider generation cost.

## 11. Current commercial conclusion

The £49 price **cannot yet be declared economically viable or non-viable** because exact API USD costs for the four images, reel and copy are still unresolved.

What is now established:

1. The repository's Nano Banana 2 model identifier is correct.
2. The current image and video request shapes are supported by the provider catalogue.
3. The current prototype consumes 2 website credits per 2K image and 35 credits for the configured 5-second reel, but these numbers are not commercial API costs.
4. Higgsfield API billing is independently denominated in USD and does not require the customer's Higgsfield account or credits.
5. Stripe processing on £49 is currently £0.935 for a UK standard card.

The remaining evidence blocker is specifically the **Nano Banana 2 API USD price** and the **copy-generation model/cost**; the Seedance reel now has a documented USD basis.

## 12. Downstream implications

- #41: keep £49 unchanged; no pricing decision yet.
- #55: do not derive a hard spend budget from website credits.
- #49: retain the provider adapter boundary; the commercial runtime should call the API, not the Higgsfield website/FNF credit system.
- #56: remains a P0 blocker because the current deployed app is still Higgsfield-hosted and exposes provider-dependent customer generation.
- #8/#9: current campaign baseline remains four images + one reel + copy; no model change is justified by the corrected evidence.

No production product behaviour was changed by this iteration.
