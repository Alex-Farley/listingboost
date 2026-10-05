import { describe, expect, test } from "bun:test";
import { brandContrastWarnings, contrastRatio, parseBrandSettingsInput, parseFontRef } from "@listingboost/domain";

const errorsFor = (input: Record<string, unknown>) => {
  const result = parseBrandSettingsInput(input);
  return result.ok ? {} : result.errors;
};
const valueFor = (input: Record<string, unknown>) => {
  const result = parseBrandSettingsInput(input);
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.errors)}`);
  return result.value;
};

describe("AT-22 brand settings input", () => {
  test("every field is optional and unset values stay null, never defaulted", () => {
    expect(valueFor({})).toEqual({
      agencyName: null,
      contactPhone: null,
      contactEmail: null,
      website: null,
      officeAddress: null,
      primaryColour: null,
      secondaryColour: null,
      headingFont: null,
      bodyFont: null,
      toneOfVoice: null,
      preferredTemplates: {},
    });
  });

  test("blank strings clear a value", () => {
    const value = valueFor({ agencyName: "  ", toneOfVoice: "", contactPhone: " ", website: "", contactEmail: "", officeAddress: "\n", primaryColour: "" });
    expect(value.agencyName).toBeNull();
    expect(value.toneOfVoice).toBeNull();
    expect(value.contactPhone).toBeNull();
    expect(value.website).toBeNull();
    expect(value.contactEmail).toBeNull();
    expect(value.officeAddress).toBeNull();
    expect(value.primaryColour).toBeNull();
  });

  test("accepts each valid variant and trims it", () => {
    const value = valueFor({
      agencyName: "  Orchard & Co  ",
      contactPhone: "+44 (0)1582 760-000",
      contactEmail: "hello@orchard.test",
      website: "https://orchard.test/sales",
      officeAddress: "1 High Street\nHarpenden\nAL5 2AB",
      primaryColour: "#1D2433",
      secondaryColour: "#f6f1e8",
      headingFont: "preset:playfair-display",
      bodyFont: "custom:7b0c2f7e-58a1-4a53-9f0e-2f1f6f6f0a11",
      toneOfVoice: " Warm and plain-spoken ",
      preferredTemplates: { "social:square": "social-square-full", "story:primary": "story" },
    });
    expect(value.agencyName).toBe("Orchard & Co");
    expect(value.contactPhone).toBe("+44 (0)1582 760-000");
    expect(value.website).toBe("https://orchard.test/sales");
    expect(value.officeAddress).toBe("1 High Street\nHarpenden\nAL5 2AB");
    expect(value.primaryColour).toBe("#1d2433");
    expect(value.toneOfVoice).toBe("Warm and plain-spoken");
    expect(value.preferredTemplates).toEqual({ "social:square": "social-square-full", "story:primary": "story" });
  });

  const invalid: Array<[field: string, value: unknown, fix: RegExp]> = [
    ["agencyName", "x".repeat(101), /100 characters/],
    ["agencyName", "Orchard\nEstates", /one line/],
    ["contactPhone", "call us on 01582", /digits/],
    ["contactPhone", "0".repeat(31), /30 characters/],
    ["contactEmail", "hello@", /email address/],
    ["contactEmail", `${"a".repeat(250)}@x.test`, /254 characters/],
    ["website", "orchard.test", /http/],
    ["website", "ftp://orchard.test", /http/],
    ["website", "javascript:alert(1)", /http/],
    ["website", `https://orchard.test/${"a".repeat(200)}`, /200 characters/],
    ["officeAddress", "x".repeat(301), /300 characters/],
    ["officeAddress", "a\nb\nc\nd\ne", /4 lines/],
    ["primaryColour", "#12345", /#RRGGBB/],
    ["primaryColour", "red", /#RRGGBB/],
    ["secondaryColour", "#gggggg", /#RRGGBB/],
    ["headingFont", "Comic Sans", /Choose a font/],
    ["bodyFont", "custom:not-a-uuid", /Choose a font/],
    ["toneOfVoice", "x".repeat(201), /200 characters/],
    ["toneOfVoice", "Warm\nand friendly", /one line/],
    ["toneOfVoice", "Warm\u0007", /one line/],
  ];
  for (const [field, value, fix] of invalid) {
    test(`rejects ${field} = ${JSON.stringify(String(value).slice(0, 24))} and says how to fix it`, () => {
      const errors = errorsFor({ [field]: value });
      expect(Object.keys(errors)).toEqual([field]);
      expect(errors[field]).toMatch(fix);
    });
  }

  test("rejects a preferred template for an unknown slot or with an empty id", () => {
    // Keys contain a dot, so they are compared as keys, not as a nested path.
    expect(Object.keys(errorsFor({ preferredTemplates: { "reel:slideshow": "story" } }))).toEqual(["preferredTemplates.reel:slideshow"]);
    expect(Object.keys(errorsFor({ preferredTemplates: { "social:square": "" } }))).toEqual(["preferredTemplates.social:square"]);
  });

  test("reports every invalid field at once", () => {
    expect(Object.keys(errorsFor({ contactEmail: "nope", primaryColour: "blue", toneOfVoice: "a\nb" })).sort()).toEqual(["contactEmail", "primaryColour", "toneOfVoice"]);
  });

  test("parses font references", () => {
    expect(parseFontRef("preset:inter")).toEqual({ kind: "preset", id: "inter" });
    expect(parseFontRef("custom:7b0c2f7e-58a1-4a53-9f0e-2f1f6f6f0a11")).toEqual({ kind: "custom", id: "7b0c2f7e-58a1-4a53-9f0e-2f1f6f6f0a11" });
    expect(parseFontRef("Inter")).toBeNull();
    expect(parseFontRef(null)).toBeNull();
  });
});

describe("AT-22 brand colour contrast", () => {
  test("contrast ratio follows WCAG relative luminance", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
    // #767676 on white is the well-known 4.54:1 boundary grey.
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });

  test("a primary colour below 3:1 against white text warns and says why", () => {
    const warnings = brandContrastWarnings({ primaryColour: "#f6f1e8" });
    expect(Object.keys(warnings)).toEqual(["primaryColour"]);
    expect(warnings.primaryColour).toMatch(/hard to read/);
  });

  test("3:1 or better, or no colour set, does not warn", () => {
    expect(brandContrastWarnings({ primaryColour: "#1d2433" })).toEqual({});
    // #949494 is 3.03:1 against white: just above the threshold.
    expect(brandContrastWarnings({ primaryColour: "#949494" })).toEqual({});
    // #959595 is 2.99:1: just below.
    expect(Object.keys(brandContrastWarnings({ primaryColour: "#959595" }))).toEqual(["primaryColour"]);
    expect(brandContrastWarnings({ primaryColour: null })).toEqual({});
  });
});
