import { PropertyTruthViolation } from "./errors";

// "Make the photograph better. Do not make the property different." (spec §13)
export const ENHANCEMENT_OPERATIONS = [
  "exposure",
  "white_balance",
  "colour",
  "contrast",
  "sharpness",
  "noise_reduction",
  "perspective",
  "lens_correction",
  "lighting_balance",
] as const;
export type EnhancementOperation = (typeof ENHANCEMENT_OPERATIONS)[number];

export const PROTECTED_CHARACTERISTICS = [
  "walls",
  "windows",
  "doors",
  "dimensions",
  "fireplaces",
  "fixtures",
  "fittings",
  "architecture",
  "room layout",
  "garden boundaries",
  "structural characteristics",
] as const;

export const VISUALISATION_LABEL = "POTENTIAL VISUALISATION — Digitally generated • Illustrative only";

export type ImageTreatment = "enhancement" | "visualisation";

export type EnhancementRequest = {
  treatment: "enhancement";
  operations: EnhancementOperation[];
  protectedCharacteristics: string[];
  instructions: string;
  disclosureLabel: null;
};

export type VisualisationRequest = {
  treatment: "visualisation";
  brief: string;
  disclosureLabel: typeof VISUALISATION_LABEL;
};

// Words that ask for scene content to change rather than photographic correction.
const CONTENT_CHANGE =
  /\b(remov\w*|eras\w*|delet\w*|add\w*|insert\w*|replac\w*|swap\w*|mov(e|ed|ing)|relocat\w*|extend\w*|enlarg\w*|bigger|larger|smaller|shrink\w*|widen\w*|demolish\w*|knock\w*|install\w*|build\w*|(re)?paint\w*|declutter\w*|stag(e|ed|ing)|furnish\w*|furniture|clone\w*|hid(e|ing)|cover\w*|renovat\w*|redesign\w*)\b/i;

const MAX_NOTE_LENGTH = 300;

function isEnhancementOperation(value: string): value is EnhancementOperation {
  return (ENHANCEMENT_OPERATIONS as readonly string[]).includes(value);
}

export function buildEnhancementRequest(input: { operations: readonly string[]; note?: string | null }): EnhancementRequest {
  if (input.operations.length === 0) throw new PropertyTruthViolation("At least one enhancement operation is required");
  const operations: EnhancementOperation[] = [];
  for (const op of input.operations) {
    if (!isEnhancementOperation(op)) throw new PropertyTruthViolation(`"${op}" is not a photographic enhancement`);
    if (!operations.includes(op)) operations.push(op);
  }
  const note = input.note?.trim() ?? "";
  if (note.length > MAX_NOTE_LENGTH) throw new PropertyTruthViolation("Enhancement note is too long");
  const change = note.match(CONTENT_CHANGE);
  if (change) {
    throw new PropertyTruthViolation(
      `Enhancement cannot change what is in the photograph ("${change[0]}"). Use a labelled visualisation instead.`,
    );
  }
  const protectedList = PROTECTED_CHARACTERISTICS.join(", ");
  const instructions = [
    `Improve the photograph only: ${operations.map((op) => op.replace(/_/g, " ")).join(", ")}.`,
    `Do not add, remove, move or alter any content of the scene, including ${protectedList}.`,
    "Keep the property exactly as photographed.",
    note ? `Photographer's note: ${note}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    treatment: "enhancement",
    operations,
    protectedCharacteristics: [...PROTECTED_CHARACTERISTICS],
    instructions,
    disclosureLabel: null,
  };
}

export function buildVisualisationRequest(input: { brief: string }): VisualisationRequest {
  const brief = input.brief.trim();
  if (!brief) throw new PropertyTruthViolation("A visualisation brief is required");
  return { treatment: "visualisation", brief, disclosureLabel: VISUALISATION_LABEL };
}

export function assertTreatmentDisclosure(input: { treatment: ImageTreatment; disclosureLabel: string | null }): void {
  if (input.treatment === "visualisation" && input.disclosureLabel !== VISUALISATION_LABEL) {
    throw new PropertyTruthViolation("Visualisations must carry the POTENTIAL VISUALISATION disclosure label");
  }
  if (input.treatment === "enhancement" && input.disclosureLabel !== null) {
    throw new PropertyTruthViolation("Enhanced photographs must not be labelled as visualisations");
  }
}
