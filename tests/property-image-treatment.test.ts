import { describe, expect, test } from "bun:test";
import {
  assertValidPropertyImageTreatment,
  getPropertyImageDisclosure,
  POTENTIAL_VISUALISATION_DISCLOSURE,
} from "../src/lib/property-image-treatment";

describe("property image treatment", () => {
  test("allows faithful photographic enhancement without a visualisation disclosure", () => {
    const treatment = {
      mode: "enhance" as const,
      propertyFidelity: "preserved" as const,
      disclosure: "none" as const,
    };

    expect(assertValidPropertyImageTreatment(treatment)).toEqual(treatment);
    expect(getPropertyImageDisclosure(treatment)).toBeNull();
  });

  test("requires explicit disclosure for potential visualisations", () => {
    const treatment = {
      mode: "potential-visualisation" as const,
      propertyFidelity: "transformed" as const,
      disclosure: "potential-visualisation" as const,
    };

    expect(assertValidPropertyImageTreatment(treatment)).toEqual(treatment);
    expect(getPropertyImageDisclosure(treatment)).toBe(POTENTIAL_VISUALISATION_DISCLOSURE);
  });

  test("rejects a treatment that tries to call a transformed image an enhancement", () => {
    expect(() =>
      assertValidPropertyImageTreatment({
        mode: "enhance",
        propertyFidelity: "transformed",
        disclosure: "none",
      } as never),
    ).toThrow("preserve property fidelity");
  });

  test("rejects a potential visualisation without the required disclosure", () => {
    expect(() =>
      assertValidPropertyImageTreatment({
        mode: "potential-visualisation",
        propertyFidelity: "transformed",
        disclosure: "none",
      } as never),
    ).toThrow("must be marked as transformed and disclosed");
  });
});
