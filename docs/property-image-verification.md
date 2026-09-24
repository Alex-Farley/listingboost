# Independent property-image verification

ListingBoost must not rely on an image-generation provider to certify its own output.

For property-photographic enhancement, publication is gated by an independent verification step that receives the original source image and proposed output and knows nothing about the provider prompt or provider claims.

## Verification gate

The policy records:

1. SHA-256 hashes of the exact source and output bytes.
2. Structural similarity between source and output.
3. Independently detected material features including fireplaces, windows, doors, wall openings and permanent fixtures.
4. Feature confidence and normalized geometry so material features must remain present and materially positioned and sized.
5. An explicit verifier engine/version and an assertion that it is independent of the generation provider.

The gate is fail-closed. Missing, stale, mismatched, non-independent or non-passing reports cannot be treated as a verified enhanced photograph.

## Important limitation

This is an engineering safety control, not a legal guarantee. Computer vision cannot prove that every architectural or property detail is correct. Enhanced property photography should therefore retain human review, particularly when the verifier returns manual-review, low confidence or detects a material change.

The computer-vision implementation is intentionally a replaceable adapter. The provider that generates the image must not be the authority that verifies the image.

## Property treatment

- enhance = photographic improvement with property fidelity preserved; independent verification required before publication.
- potential-visualisation = transformed illustration; it must carry a clear, prominent disclosure that it is digitally generated and illustrative only.

At minimum, verification should consider fireplaces and chimney breasts, windows, doors, wall openings and room boundaries, fitted kitchens and bathrooms, permanent fixtures and fittings, flooring and other fixed built-in elements, significant garden structures, and other material features identified from the source property.

## Product rule

No enhanced property photograph should enter customer-facing delivery solely because a generation provider returned success. ListingBoost should require the independent verification evidence and, where automated verification cannot establish fidelity, route the asset to human review instead.
