# Property image truthfulness

ListingBoost must make a clear distinction between improving a property photograph and changing the appearance of the property.

## Two customer-visible modes

### Enhance — show the property as photographed

`mode: "enhance"` means the output is a photographic improvement with property fidelity preserved.

Permitted processing includes photographic corrections such as:

- exposure and dynamic-range correction
- white balance and colour correction
- noise reduction and sharpening
- lens/perspective correction
- consistent cropping and export treatment

The output must not add, remove or move property features or materially change what a viewer would understand to be present. In particular, it must not invent or alter walls, windows, doors, room dimensions, fixtures, fittings, furniture, flooring, views, gardens or other material property characteristics.

The output carries no potential-visualisation disclosure because the property itself is not being represented as changed.

### Show potential — potential visualisation

`mode: "potential-visualisation"` means the image is transformed to illustrate a possible future state, such as furnishing, staging, renovation or garden design.

Every such output must carry the explicit disclosure:

> POTENTIAL VISUALISATION — Digitally generated — illustrative only. Not a photograph of the property.

The disclosure belongs in the delivered image treatment, not only in surrounding UI copy, so the image remains clearly identified when downloaded, shared or embedded elsewhere.

## Architecture

The treatment is a ListingBoost-owned semantic contract. Providers are not exposed through it:

```text
Property image
  ├── Enhance
  │     ├── propertyFidelity: preserved
  │     └── disclosure: none
  │
  └── Show potential
        ├── propertyFidelity: transformed
        └── disclosure: potential-visualisation
```

Provider adapters may implement either workflow, but they must return an output that satisfies the selected ListingBoost treatment. Provider/model identity remains provenance and never becomes the customer-facing product abstraction.

## UX direction

The landing and campaign-builder UX should present these as two distinct choices rather than leading with AI terminology:

- **Enhance photograph** — “Make the photograph better. Keep the property the same.”
- **Show potential** — “Illustrate what the space could become. Clearly labelled.”

The first should be the default property-photo workflow. The second should always make the transformed/illustrative nature obvious before generation and on the resulting asset.
