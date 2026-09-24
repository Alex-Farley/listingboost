import { createHash } from "node:crypto";

export type PropertyImageTreatment = "enhance" | "potential-visualisation";
export type MaterialFeatureKind = "fireplace" | "window" | "door" | "wall-opening" | "permanent-fixture";
export type NormalizedBox = { x: number; y: number; width: number; height: number };
export type MaterialFeature = { id: string; kind: MaterialFeatureKind; box: NormalizedBox; confidence: number };

export type PropertyImageVerificationReport = {
  policyVersion: "2026-09-24";
  treatment: PropertyImageTreatment;
  verifier: { engine: "independent-layout-verifier"; version: string; independentOfGenerationProvider: true };
  sourceSha256: string; outputSha256: string;
  sourceDimensions: { width: number; height: number };
  outputDimensions: { width: number; height: number };
  sourceFeatures: MaterialFeature[]; outputFeatures: MaterialFeature[];
  structuralSimilarity: number;
  status: "pass" | "fail" | "manual-review";
  reasons: string[];
};

export type PropertyImageVerificationDecision =
  | { allowed: true; report: PropertyImageVerificationReport }
  | { allowed: false; report?: PropertyImageVerificationReport; reason: string };

export const PROPERTY_IMAGE_VERIFICATION_POLICY = {
  version: "2026-09-24" as const,
  minimumStructuralSimilarity: 0.98,
  minimumFeatureConfidence: 0.9,
  maxFeatureCenterDelta: 0.03,
  maxFeatureSizeDelta: 0.05,
};

function finiteUnit(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(name + " must be a finite number between 0 and 1.");
}
function validateBox(box: NormalizedBox) {
  finiteUnit(box.x, "box.x"); finiteUnit(box.y, "box.y"); finiteUnit(box.width, "box.width"); finiteUnit(box.height, "box.height");
  if (box.x + box.width > 1 || box.y + box.height > 1) throw new Error("Feature box must remain inside the normalized image bounds.");
}
function validateFeatures(features: MaterialFeature[]) {
  const ids = new Set<string>();
  for (const feature of features) {
    if (!feature.id || ids.has(feature.id)) throw new Error("Feature IDs must be unique and non-empty.");
    ids.add(feature.id); validateBox(feature.box);
    if (!Number.isFinite(feature.confidence) || feature.confidence < 0 || feature.confidence > 1) throw new Error("Feature " + feature.id + " has an invalid confidence.");
  }
}
function delta(a: number, b: number) { return Math.abs(a - b); }
function comparableFeature(source: MaterialFeature, output: MaterialFeature) {
  return source.kind === output.kind &&
    delta(source.box.x + source.box.width / 2, output.box.x + output.box.width / 2) <= PROPERTY_IMAGE_VERIFICATION_POLICY.maxFeatureCenterDelta &&
    delta(source.box.y + source.box.height / 2, output.box.y + output.box.height / 2) <= PROPERTY_IMAGE_VERIFICATION_POLICY.maxFeatureCenterDelta &&
    delta(source.box.width, output.box.width) <= PROPERTY_IMAGE_VERIFICATION_POLICY.maxFeatureSizeDelta &&
    delta(source.box.height, output.box.height) <= PROPERTY_IMAGE_VERIFICATION_POLICY.maxFeatureSizeDelta;
}
export function sha256(bytes: Uint8Array | ArrayBuffer): string {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return createHash("sha256").update(input).digest("hex");
}

export function evaluatePropertyImageVerification(report: PropertyImageVerificationReport, expected: { treatment: PropertyImageTreatment; sourceSha256: string; outputSha256: string }): PropertyImageVerificationDecision {
  if (report.policyVersion !== PROPERTY_IMAGE_VERIFICATION_POLICY.version) return { allowed: false, report, reason: "Verification policy version is not accepted." };
  if (report.verifier.independentOfGenerationProvider !== true) return { allowed: false, report, reason: "Verification must be independent of the generation provider." };
  if (report.treatment !== expected.treatment) return { allowed: false, report, reason: "Verification treatment does not match the requested treatment." };
  if (report.sourceSha256 !== expected.sourceSha256 || report.outputSha256 !== expected.outputSha256) return { allowed: false, report, reason: "Verification report hashes do not match the source/output media." };
  if (report.status !== "pass") return { allowed: false, report, reason: "Verification status is " + report.status + "; publication is fail-closed." };
  validateFeatures(report.sourceFeatures); validateFeatures(report.outputFeatures);
  if (report.treatment === "potential-visualisation") return { allowed: true, report };
  if (report.structuralSimilarity < PROPERTY_IMAGE_VERIFICATION_POLICY.minimumStructuralSimilarity) return { allowed: false, report, reason: "Structural similarity is below the enhancement publication threshold." };
  const sourceMaterial = report.sourceFeatures.filter(f => f.confidence >= PROPERTY_IMAGE_VERIFICATION_POLICY.minimumFeatureConfidence);
  const outputMaterial = report.outputFeatures.filter(f => f.confidence >= PROPERTY_IMAGE_VERIFICATION_POLICY.minimumFeatureConfidence);
  if (sourceMaterial.length !== outputMaterial.length) return { allowed: false, report, reason: "Material property-feature count changed." };
  for (const source of sourceMaterial) {
    if (!outputMaterial.some(output => comparableFeature(source, output))) return { allowed: false, report, reason: "Material property feature " + source.kind + " could not be independently matched in the output." };
  }
  return { allowed: true, report };
}
export function requirePropertyImageVerification(report: PropertyImageVerificationReport | undefined, expected: { treatment: PropertyImageTreatment; sourceSha256: string; outputSha256: string }): PropertyImageVerificationReport {
  if (!report) throw new Error("Property image verification is required before this image can be published.");
  const decision = evaluatePropertyImageVerification(report, expected);
  if (!decision.allowed) throw new Error(decision.reason);
  return decision.report;
}