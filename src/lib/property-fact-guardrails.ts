export type VerifiedPropertyBrief = {
  facts: string;
  listingUrl?: string;
  eventType?: string;
  brandName?: string;
  cta?: string;
};

export type PropertyCreativeInstructions = {
  role: string;
  creativeDirection: string;
  lighting?: string;
  refinement?: string;
};

const FACT_GUARDRAILS = [
  "Treat the verified property facts as the only authoritative source for factual property claims.",
  "Do not invent, infer, embellish or alter rooms, dimensions, architecture, materials, amenities, views, prices, addresses or other property facts.",
  "Do not add logos, agency branding, prices, addresses or other text unless explicitly requested and supported by the verified facts.",
  "Preserve the real property's architecture, layout, materials, proportions and visible features.",
  "Creative direction may change presentation, composition, lighting or camera treatment, but must not change factual property content.",
] as const;

export function buildVerifiedPropertyGenerationInstruction(
  brief: VerifiedPropertyBrief,
  creative: PropertyCreativeInstructions,
): string {
  const facts = brief.facts.trim();
  if (facts.length < 20) {
    throw new Error("Verified property facts must contain at least 20 characters.");
  }

  const sections = [
    "VERIFIED PROPERTY FACTS (AUTHORITATIVE)",
    facts,
    "",
    "CREATIVE INSTRUCTIONS (NON-FACTUAL)",
    `Campaign role: ${creative.role}`,
    `Creative direction: ${creative.creativeDirection.trim()}`,
    creative.lighting?.trim() ? `Lighting: ${creative.lighting.trim()}` : "",
    creative.refinement?.trim() ? `Requested refinement: ${creative.refinement.trim()}` : "",
    brief.eventType?.trim() ? `Campaign event: ${brief.eventType.trim()}` : "",
    brief.brandName?.trim() ? `Agency brand context: ${brief.brandName.trim()}` : "",
    brief.cta?.trim() ? `CTA context: ${brief.cta.trim()}` : "",
    "",
    "FACT-INTEGRITY RULES",
    ...FACT_GUARDRAILS.map((rule) => `- ${rule}`),
  ];

  return sections.filter(Boolean).join("\n");
}
