import { describe, expect, test } from "bun:test";
import {
  evaluatePropertyImageVerification,
  requirePropertyImageVerification,
  PROPERTY_IMAGE_VERIFICATION_POLICY,
  type PropertyImageVerificationReport,
} from "../src/lib/property-image-verification";

const baseReport = (): PropertyImageVerificationReport => ({
  policyVersion: PROPERTY_IMAGE_VERIFICATION_POLICY.version,
  treatment: "enhance",
  verifier: {
    engine: "independent-layout-verifier",
    version: "0.1.0",
    independentOfGenerationProvider: true,
  },
  sourceSha256: "source",
  outputSha256: "output",
  sourceDimensions: { width: 1600, height: 1200 },
  outputDimensions: { width: 1600, height: 1200 },
  sourceFeatures: [
    { id: "fireplace-1", kind: "fireplace", box: { x: 0.2, y: 0.3, width: 0.2, height: 0.25 }, confidence: 0.99 },
    { id: "window-1", kind: "window", box: { x: 0.65, y: 0.2, width: 0.2, height: 0.4 }, confidence: 0.98 },
  ],
  outputFeatures: [
    { id: "fireplace-1", kind: "fireplace", box: { x: 0.21, y: 0.3, width: 0.2, height: 0.25 }, confidence: 0.99 },
    { id: "window-1", kind: "window", box: { x: 0.65, y: 0.21, width: 0.2, height: 0.4 }, confidence: 0.98 },
  ],
  structuralSimilarity: 0.995,
  status: "pass",
  reasons: [],
});

describe("property image verification", () => {
  test("passes an independently verified enhancement with unchanged material features", () => {
    expect(evaluatePropertyImageVerification(baseReport(), {
      treatment: "enhance", sourceSha256: "source", outputSha256: "output",
    })).toMatchObject({ allowed: true });
  });

  test("fails closed when a permanent feature disappears", () => {
    const report = baseReport();
    report.outputFeatures = [report.outputFeatures[0]];
    expect(evaluatePropertyImageVerification(report, {
      treatment: "enhance", sourceSha256: "source", outputSha256: "output",
    })).toMatchObject({ allowed: false });
  });

  test("fails closed when a fireplace moves materially", () => {
    const report = baseReport();
    report.outputFeatures = report.outputFeatures.map((feature) =>
      feature.kind === "fireplace" ? { ...feature, box: { ...feature.box, x: 0.5 } } : feature,
    );
    expect(evaluatePropertyImageVerification(report, {
      treatment: "enhance", sourceSha256: "source", outputSha256: "output",
    })).toMatchObject({ allowed: false });
  });

  test("fails closed when the verifier is not independent", () => {
    const report = baseReport();
    report.verifier = { ...report.verifier, independentOfGenerationProvider: false as true };
    expect(evaluatePropertyImageVerification(report, {
      treatment: "enhance", sourceSha256: "source", outputSha256: "output",
    })).toMatchObject({ allowed: false });
  });

  test("fails closed when hashes do not match the actual media", () => {
    expect(evaluatePropertyImageVerification(baseReport(), {
      treatment: "enhance", sourceSha256: "wrong", outputSha256: "output",
    })).toMatchObject({ allowed: false });
  });

  test("requires a verification report before publication", () => {
    expect(() => requirePropertyImageVerification(undefined, {
      treatment: "enhance", sourceSha256: "source", outputSha256: "output",
    })).toThrow("verification is required");
  });

  test("allows potential visualisations only as the separately declared transformed mode", () => {
    const report = baseReport();
    report.treatment = "potential-visualisation";
    expect(evaluatePropertyImageVerification(report, {
      treatment: "potential-visualisation", sourceSha256: "source", outputSha256: "output",
    })).toMatchObject({ allowed: true });
  });
});
