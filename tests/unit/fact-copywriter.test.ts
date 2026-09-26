import { describe, expect, test } from "bun:test";
import { FactCopywriter, type BrandVoice } from "@listingboost/ai";
import { PRICE_QUALIFIERS, PROPERTY_TYPES, TENURES, validateCopyClaims, type PropertyFacts } from "@listingboost/domain";
import { COPY_SLOTS, DEFAULT_TEMPLATES } from "@listingboost/templates";

const writer = new FactCopywriter();

const brand: BrandVoice = {
  agencyName: "Orchard Estates",
  toneOfVoice: null,
  contactPhone: "01582 000000",
  contactEmail: null,
  website: null,
  primaryColour: null,
  secondaryColour: null,
  headingFont: null,
  bodyFont: null,
  logo: null,
};
const noBrand: BrandVoice = { ...brand, agencyName: null, contactPhone: null };

const full: PropertyFacts = {
  title: "12 Orchard Way, Harpenden",
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
  description: "",
};

const minimal: PropertyFacts = {
  ...full,
  title: "Flat 4, River House",
  addressLine1: "Flat 4, River House",
  town: null,
  county: null,
  postcode: "SW1A 1AA",
  propertyType: "flat",
  bedrooms: null,
  bathrooms: null,
  receptionRooms: null,
  floorArea: null,
  price: null,
  tenure: null,
  parking: null,
  garden: null,
  keyFeatures: [],
};

const limits = Object.fromEntries(
  DEFAULT_TEMPLATES.filter((t) => t.assetType === "copy").map((t) => [t.config.slot as string, t.config as { maxLength: number; description: string }]),
);

async function write(slot: string, facts: PropertyFacts, b: BrandVoice = brand) {
  return (await writer.generateCopy({ slot, facts, brand: b, ...limits[slot]! })).text;
}

describe("R7a fact-only copywriter", () => {
  test("identifies itself as a non-AI adapter", () => {
    expect(writer.info).toEqual({ provider: "listingboost-facts", model: "fact-template-1", promptVersion: "facts-v1" });
  });

  for (const slot of COPY_SLOTS) {
    test(`${slot}: within length and passes the copy-truth validator for full and minimal facts`, async () => {
      for (const facts of [full, minimal]) {
        for (const b of [brand, noBrand]) {
          const text = await write(slot, facts, b);
          expect(text.trim().length).toBeGreaterThan(0);
          expect(text.length).toBeLessThanOrEqual(limits[slot]!.maxLength);
          expect(validateCopyClaims(text, facts)).toEqual({ ok: true, violations: [] });
        }
      }
    });
  }

  test("uses recorded facts where relevant", async () => {
    expect(await write("headline", full)).toBe("3 bedroom semi-detached house in Harpenden");
    const supporting = await write("supporting_copy", full);
    for (const fact of ["3 bedroom", "Harpenden", "Guide price £650,000", "freehold", "1,150 sq ft", "Open-plan kitchen"]) {
      expect(supporting).toContain(fact);
    }
  });

  test("never mentions facts that are not recorded", async () => {
    for (const slot of COPY_SLOTS) {
      const text = (await write(slot, minimal, noBrand)).toLowerCase();
      for (const word of ["bedroom", "bathroom", "reception", "£", "sq ft", "freehold", "leasehold", "parking", "garden", "harpenden"]) {
        expect(text).not.toContain(word);
      }
    }
  });

  test("the call to action uses the agency's recorded contact details", async () => {
    expect(await write("cta", full)).toBe("Call Orchard Estates on 01582 000000 to arrange a viewing.");
    expect(await write("cta", full, noBrand)).toBe("Contact us to arrange a viewing.");
  });

  test("is deterministic", async () => {
    for (const slot of COPY_SLOTS) expect(await write(slot, full)).toBe(await write(slot, full));
  });

  test("any combination of recorded facts passes the validator (generated cases)", async () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
    const maybe = <T,>(value: T) => (rand() < 0.5 ? value : null);
    for (let i = 0; i < 300; i++) {
      const facts: PropertyFacts = {
        ...full,
        town: maybe(pick(["Harpenden", "St Albans", "Luton", "Bury St Edmunds"])),
        propertyType: pick(PROPERTY_TYPES),
        bedrooms: maybe(Math.floor(rand() * 7)),
        bathrooms: maybe(Math.floor(rand() * 4)),
        receptionRooms: maybe(Math.floor(rand() * 3)),
        floorArea: maybe({ value: Math.round(300 + rand() * 4000), unit: pick(["sq_ft", "sq_m"] as const) }),
        price: maybe({ amount: Math.round(50 + rand() * 3000) * 1000, qualifier: pick(PRICE_QUALIFIERS) }),
        tenure: maybe(pick(TENURES)),
        parking: maybe(pick(["Garage", "Allocated space", "On-street parking"])),
        garden: maybe(pick(["South-facing garden", "Communal gardens", "Courtyard"])),
        keyFeatures: rand() < 0.5 ? [] : [pick(["Utility room", "Log burner", "Newly fitted kitchen", "Close to the station"])],
      };
      for (const slot of COPY_SLOTS) {
        const text = await write(slot, facts, rand() < 0.5 ? brand : noBrand);
        const result = validateCopyClaims(text, facts);
        if (!result.ok) throw new Error(`${slot} for case ${i}: ${text}\n${JSON.stringify(result.violations)}`);
        expect(text.length).toBeLessThanOrEqual(limits[slot]!.maxLength);
      }
    }
  });
});
