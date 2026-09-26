import { describe, expect, test } from "bun:test";
import { parsePropertyInput, normaliseUkPostcode } from "@listingboost/domain";

const minimal = { addressLine1: "12 Orchard Way", town: "Harpenden", postcode: "al52ab", propertyType: "semi_detached" };

describe("AT-03 property input", () => {
  test("accepts minimal manual entry and never invents missing facts", () => {
    const result = parsePropertyInput(minimal);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.postcode).toBe("AL5 2AB");
    expect(result.value.bedrooms).toBeNull();
    expect(result.value.bathrooms).toBeNull();
    expect(result.value.receptionRooms).toBeNull();
    expect(result.value.floorArea).toBeNull();
    expect(result.value.price).toBeNull();
    expect(result.value.tenure).toBeNull();
    expect(result.value.parking).toBeNull();
    expect(result.value.garden).toBeNull();
    expect(result.value.keyFeatures).toEqual([]);
    expect(result.value.title).toBe("12 Orchard Way, Harpenden");
  });

  test("accepts full facts", () => {
    const result = parsePropertyInput({
      ...minimal,
      title: "Family home",
      county: "Hertfordshire",
      bedrooms: 3,
      bathrooms: 2,
      receptionRooms: 1,
      floorArea: { value: 1150, unit: "sq_ft" },
      price: { amount: 650000, qualifier: "guide_price" },
      tenure: "freehold",
      parking: "Driveway",
      garden: "Rear garden",
      keyFeatures: ["Open-plan kitchen"],
      description: "Bright home",
      sourceUrl: "https://www.rightmove.co.uk/properties/123",
      agent: { name: "Jane Agent", phone: "01582 000000", email: "jane@agency.co.uk" },
    });
    expect(result.ok).toBe(true);
  });

  const invalid: Array<[string, Record<string, unknown>]> = [
    ["missing postcode", { ...minimal, postcode: undefined }],
    ["bad postcode", { ...minimal, postcode: "12345" }],
    ["missing address and title", { ...minimal, addressLine1: undefined }],
    ["unknown property type", { ...minimal, propertyType: "castle" }],
    ["negative bedrooms", { ...minimal, bedrooms: -1 }],
    ["fractional bedrooms", { ...minimal, bedrooms: 2.5 }],
    ["zero price", { ...minimal, price: { amount: 0, qualifier: "guide_price" } }],
    ["unknown tenure", { ...minimal, tenure: "rental" }],
    ["non-http source url", { ...minimal, sourceUrl: "javascript:alert(1)" }],
    ["too many key features", { ...minimal, keyFeatures: Array.from({ length: 31 }, (_, i) => `f${i}`) }],
  ];
  for (const [name, input] of invalid) {
    test(`rejects ${name} with field errors`, () => {
      const result = parsePropertyInput(input);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(Object.keys(result.errors).length).toBeGreaterThan(0);
    });
  }

  test("postcode normalisation", () => {
    expect(normaliseUkPostcode(" sw1a1aa ")).toBe("SW1A 1AA");
    expect(normaliseUkPostcode("EC1A 1BB")).toBe("EC1A 1BB");
    expect(normaliseUkPostcode("W1A0AX")).toBe("W1A 0AX");
    expect(normaliseUkPostcode("not a postcode")).toBeNull();
  });
});
