import { describe, expect, test } from "bun:test";
import {
  buildEnhancementRequest,
  buildVisualisationRequest,
  assertTreatmentDisclosure,
  ENHANCEMENT_OPERATIONS,
  PROTECTED_CHARACTERISTICS,
  PropertyTruthViolation,
  VISUALISATION_LABEL,
} from "@listingboost/domain";

describe("AT-16 property truth", () => {
  test("allow-list covers photographic corrections only", () => {
    expect<string[]>([...ENHANCEMENT_OPERATIONS].sort()).toEqual(
      ["colour", "contrast", "exposure", "lens_correction", "lighting_balance", "noise_reduction", "perspective", "sharpness", "white_balance"].sort(),
    );
  });

  test("protected characteristics include every spec item", () => {
    for (const item of ["walls", "windows", "doors", "dimensions", "fireplaces", "fixtures", "fittings", "architecture", "room layout", "garden boundaries", "structural characteristics"]) {
      expect<readonly string[]>(PROTECTED_CHARACTERISTICS).toContain(item);
    }
  });

  test("enhancement request always carries protected characteristics and preservation instruction", () => {
    const request = buildEnhancementRequest({ operations: ["exposure", "white_balance"] });
    expect(request.treatment).toBe("enhancement");
    expect(request.protectedCharacteristics).toEqual([...PROTECTED_CHARACTERISTICS]);
    expect(request.instructions).toContain("Do not add, remove, move or alter");
    for (const item of PROTECTED_CHARACTERISTICS) expect(request.instructions).toContain(item);
    expect(request.disclosureLabel).toBeNull();
  });

  test("rejects operations outside the allow-list", () => {
    expect(() => buildEnhancementRequest({ operations: ["exposure", "sky_replacement" as never] })).toThrow(PropertyTruthViolation);
    expect(() => buildEnhancementRequest({ operations: [] })).toThrow(PropertyTruthViolation);
  });

  for (const note of [
    "remove the wall between kitchen and lounge",
    "add a fireplace",
    "make the garden bigger",
    "replace the windows with bifolds",
    "knock through to the dining room",
    "extend the patio",
    "paint the walls white",
    "remove the pylon in the background",
    "declutter and add furniture",
  ]) {
    test(`rejects structural/content change note: "${note}"`, () => {
      expect(() => buildEnhancementRequest({ operations: ["exposure"], note })).toThrow(PropertyTruthViolation);
    });
  }

  for (const note of ["slightly brighter please", "warmer tones", "straighten verticals", "reduce noise in the shadows"]) {
    test(`accepts photographic note: "${note}"`, () => {
      expect(buildEnhancementRequest({ operations: ["exposure"], note }).instructions).toContain(note);
    });
  }

  test("visualisation always carries the disclosure label", () => {
    const request = buildVisualisationRequest({ brief: "Show the lounge with modern furniture" });
    expect(request.treatment).toBe("visualisation");
    expect(request.disclosureLabel).toBe(VISUALISATION_LABEL);
    expect(VISUALISATION_LABEL).toBe("POTENTIAL VISUALISATION — Digitally generated • Illustrative only");
  });

  test("a visualisation without the label is rejected; enhancement with a label is rejected", () => {
    expect(() => assertTreatmentDisclosure({ treatment: "visualisation", disclosureLabel: null })).toThrow(PropertyTruthViolation);
    expect(() => assertTreatmentDisclosure({ treatment: "visualisation", disclosureLabel: "Illustrative" })).toThrow(PropertyTruthViolation);
    expect(() => assertTreatmentDisclosure({ treatment: "enhancement", disclosureLabel: VISUALISATION_LABEL })).toThrow(PropertyTruthViolation);
    expect(() => assertTreatmentDisclosure({ treatment: "visualisation", disclosureLabel: VISUALISATION_LABEL })).not.toThrow();
    expect(() => assertTreatmentDisclosure({ treatment: "enhancement", disclosureLabel: null })).not.toThrow();
  });
});
