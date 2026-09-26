import { describe, expect, test } from "bun:test";
import { validateCopyClaims, type PropertyFacts } from "@listingboost/domain";

const facts: PropertyFacts = {
  title: "Three-bedroom semi-detached house",
  addressLine1: "12 Orchard Way",
  addressLine2: null,
  town: "Harpenden",
  county: "Hertfordshire",
  postcode: "AL5 2AB",
  propertyType: "semi_detached",
  bedrooms: 3,
  bathrooms: 2,
  receptionRooms: 1,
  floorArea: { value: 1150, unit: "sq_ft" },
  price: { amount: 650000, qualifier: "guide_price" },
  tenure: "freehold",
  parking: "Driveway parking for two cars",
  garden: "Rear garden with patio",
  keyFeatures: ["Open-plan kitchen", "Victorian fireplace in the lounge"],
  description: "A bright family home close to the town centre.",
};

const noExtras: PropertyFacts = { ...facts, parking: null, garden: null, tenure: null, floorArea: null, price: null, keyFeatures: [], description: "" };

describe("AT-15 generated copy cannot introduce unsupported facts", () => {
  test("accepts copy that restates supported facts", () => {
    const result = validateCopyClaims(
      "Guide price £650,000. A freehold three-bedroom home with 2 bathrooms, 1,150 sq ft, driveway parking, a rear garden with patio and a Victorian fireplace.",
      facts,
    );
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });

  test("accepts neutral marketing language", () => {
    expect(validateCopyClaims("Book your viewing today. A home you will love.", noExtras).ok).toBe(true);
  });

  const cases: Array<[string, string, PropertyFacts]> = [
    ["four bedrooms", "A spacious four bedroom home", facts],
    ["numeric bedrooms", "Stunning 5-bed house", facts],
    ["bathrooms", "Three bathrooms throughout", facts],
    ["reception rooms", "Two reception rooms", facts],
    ["unknown floor area", "Over 2,000 sq ft of space", facts],
    ["floor area when none recorded", "1,150 sq ft", noExtras],
    ["wrong price", "Offers over £700,000", facts],
    ["price when none recorded", "£650,000", noExtras],
    ["wrong tenure", "Leasehold apartment", facts],
    ["tenure when unknown", "Freehold", noExtras],
    ["parking when none recorded", "Off-street parking", noExtras],
    ["garage not recorded", "Double garage", facts],
    ["garden when none recorded", "Landscaped garden", noExtras],
    ["views", "Stunning sea views", facts],
    ["transport time", "Just 5 minutes' walk to the station", facts],
    ["schools", "Within the catchment of outstanding schools", facts],
    ["renovation", "Recently renovated throughout", facts],
    ["history", "Built in 1890", facts],
    ["architectural feature", "Original sash windows and high ceilings", facts],
  ];

  for (const [name, copy, f] of cases) {
    test(`rejects unsupported claim: ${name}`, () => {
      const result = validateCopyClaims(copy, f);
      expect(result.ok).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });
  }

  test("violations name the offending claim", () => {
    const result = validateCopyClaims("A lovely four bedroom home with sea views", facts);
    expect(result.violations.map((v) => v.category).sort()).toEqual(["bedrooms", "views"]);
    expect(result.violations.find((v) => v.category === "bedrooms")?.claim.toLowerCase()).toContain("four bedroom");
  });
});

describe("AT-15 claim normalisation", () => {
  test("metric area is compared after conversion", () => {
    expect(validateCopyClaims("Around 107 sq m of living space", facts).ok).toBe(true);
    expect(validateCopyClaims("Around 150 sq m of living space", facts).ok).toBe(false);
  });
  test("abbreviated prices are compared by value", () => {
    expect(validateCopyClaims("Guide price £650k", facts).ok).toBe(true);
    expect(validateCopyClaims("Guide price £6.5m", facts).ok).toBe(false);
  });
  test("share of freehold is distinct from freehold", () => {
    expect(validateCopyClaims("Share of freehold", facts).ok).toBe(false);
    expect(validateCopyClaims("Share of freehold", { ...facts, tenure: "share_of_freehold" }).ok).toBe(true);
  });
});
