import { describe, expect, test } from "bun:test";
import { normalizePropertyBrief, propertyBriefSchema } from "../src/lib/property-brief";

describe("property brief", () => {
  test("normalizes explicitly supplied facts once", () => {
    const brief = normalizePropertyBrief({
      propertyType: "  Semi-Detached House ",
      bedrooms: 3,
      bathrooms: 2,
      floorArea: { value: 1425, unit: "sqft" },
      price: { amount: 625000, currency: " gbp " },
      tenure: " Freehold ",
      address: "  1 Example Street, Hertford  ",
      description: "  A well presented family home.  ",
      explicitFeatures: ["Garden", " Garden ", "  Double garage  "],
    });

    expect(brief).toEqual({
      propertyType: "Semi-Detached House",
      bedrooms: 3,
      bathrooms: 2,
      floorArea: { value: 1425, unit: "sqft" },
      price: { amount: 625000, currency: "GBP" },
      tenure: "Freehold",
      address: "1 Example Street, Hertford",
      description: "A well presented family home.",
      explicitFeatures: ["Garden", "Double garage"],
    });
  });

  test("keeps absent facts explicit as null", () => {
    const brief = normalizePropertyBrief({
      propertyType: "Flat",
    });

    expect(brief.bedrooms).toBeNull();
    expect(brief.bathrooms).toBeNull();
    expect(brief.floorArea).toBeNull();
    expect(brief.price).toBeNull();
    expect(brief.tenure).toBeNull();
    expect(brief.address).toBeNull();
    expect(brief.description).toBeNull();
    expect(brief.explicitFeatures).toEqual([]);
  });

  test("rejects invalid numeric facts", () => {
    expect(() =>
      propertyBriefSchema.parse({
        propertyType: "House",
        bedrooms: -1,
        bathrooms: null,
        floorArea: null,
        price: null,
        tenure: null,
        address: null,
        description: null,
        explicitFeatures: [],
      }),
    ).toThrow();
  });
});
