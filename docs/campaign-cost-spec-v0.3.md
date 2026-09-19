# ListingBoost Campaign Cost Specification v0.3

**Status:** evidence baseline — not commercial approval  
**Date:** 2026-09-19  
**Campaign price under evaluation:** £49

## Executive correction

This supersedes v0.2 where the Seedance 2.5 cost calculation was overstated.

The current official Higgsfield API model page confirms token-metered Seedance 2.5 pricing and says image/audio references do not count as video input. It shows a 480p/720p rate of $0.0214 per 1,000 video tokens before discount. The same page currently exposes a configuration price range of $0.144–$0.3236/sec, while the public Explore surface shows $0.144/sec discounted and $0.2057/sec standard. These representations do not reconcile cleanly for the exact ListingBoost request.

Therefore the previously recorded **$1.38672** calculation must not be used, and neither should the alternative $2.31120 calculation. The exact production cost must come from the Higgsfield API estimate endpoint for the exact request.

## Campaign baseline

Images:
- Hero: 4:5, Nano Banana 2, 2K
- Square: 1:1, Nano Banana 2, 2K
- Story: 9:16, Nano Banana 2, 2K
- Just Listed: 4:5, Nano Banana 2, 2K

Video:
- Property Reel: 5s, 720p, 9:16, Seedance 2.5, property photographs as image references, native audio requested, high bitrate requested

Copy:
- 1 launch caption
- 1 marketing plan

## Provider availability

The Higgsfield application catalogue currently exposes `nano_banana_2` as Nano Banana 2 and `seedance_2_5` as Seedance 2.5.

Read-only application-side estimates for the prototype are 2 website credits per image and 35 website credits for the reel. These are **website credits, not API USD costs**, and must never be converted into the commercial budget.

The official Higgsfield API is a separate USD-billed product and its curated catalogue may differ from the website catalogue. The public API Explore surface currently lists Seedance 2.5 but does **not visibly list Nano Banana 2**. Therefore production must not assume that the website model ID `nano_banana_2` is API-available until an authenticated API catalogue/estimate response confirms it.

## Seedance 2.5 evidence

The official model page documents:
- token-metered pricing
- image/audio references do not count as video input
- 480p/720p: $0.0214 per 1,000 video tokens before discount
- configuration-dependent pricing

Because the public model-page formula and displayed configuration price ranges do not reconcile for the exact ListingBoost configuration, exact API estimation remains **UNVERIFIED**.

## Image API cost

Nano Banana 2 exact API availability and exact 2K/reference-image USD cost remain **UNVERIFIED**.

## Copy cost

The repository currently calls `https://fnf.internal/llm`, lists models and selects the first returned model. Production model, token volumes and USD cost remain **UNVERIFIED**.

## Failure/retry

Official Higgsfield API documentation states failed generations are not charged and their cost is returned automatically. ListingBoost must still enforce its own campaign attempt budget, idempotency and refund reconciliation.

## Payment

Working UK standard-card assumption: 1.5% + £0.20, giving £0.935 on £49 and £48.065 before generation/infra/tax. Recheck immediately before launch.

## Commercial model status

| Component | Status |
|---|---|
| 4 image API costs | UNVERIFIED |
| Reel exact API cost | UNVERIFIED |
| Copy cost | UNVERIFIED |
| Retry allowance | TBD |
| Infrastructure | TBD after standalone runtime |
| Hard provider budget | NOT SET |
| Expected cost | NOT SET |
| Conservative cost | NOT SET |
| Gross contribution at £49 | NOT YET CALCULABLE |

## Decision

Do not change the £49 price yet. Do not switch model solely for economics. Obtain authenticated API catalogue/estimate evidence for the exact image and video requests.

#48 remains open. #49 now has the provider-neutral boundary merged. #55 must wait for the verified cost specification. #56 remains the dominant P0 production-runtime blocker.