import { describe, expect, test } from "bun:test";
import { buildVerifiedPropertyGenerationInstruction } from "../src/lib/property-fact-guardrails";

describe("verified property generation guardrails", () => {
  const facts = "Three-bedroom detached house with a south-facing garden and original oak flooring.";

  test("separates authoritative facts from creative instructions", () => {
    const prompt = buildVerifiedPropertyGenerationInstruction(
      { facts, eventType: "New listing", cta: "Arrange a viewing" },
      { role: "Hero", creativeDirection: "Premium editorial presentation", lighting: "Natural" },
    );

    expect(prompt).toContain("VERIFIED PROPERTY FACTS (AUTHORITATIVE)");
    expect(prompt).toContain(facts);
    expect(prompt).toContain("CREATIVE INSTRUCTIONS (NON-FACTUAL)");
    expect(prompt).toContain("Campaign role: Hero");
    expect(prompt).toContain("FACT-INTEGRITY RULES");
    expect(prompt).toContain("Do not invent, infer, embellish or alter rooms");
  });

  test("rejects an empty or unusably short fact brief", () => {
    expect(() =>
      buildVerifiedPropertyGenerationInstruction(
        { facts: "too short" },
        { role: "Hero", creativeDirection: "Premium" },
      ),
    ).toThrow("Verified property facts must contain at least 20 characters.");
  });

  test("keeps optional marketing context outside the authoritative facts", () => {
    const prompt = buildVerifiedPropertyGenerationInstruction(
      { facts, brandName: "Example Estates", cta: "Book a viewing" },
      { role: "Just Listed", creativeDirection: "Restrained announcement" },
    );

    expect(prompt.indexOf("VERIFIED PROPERTY FACTS (AUTHORITATIVE)")).toBeLessThan(
      prompt.indexOf("CREATIVE INSTRUCTIONS (NON-FACTUAL)"),
    );
    expect(prompt).toContain("Agency brand context: Example Estates");
    expect(prompt).toContain("CTA context: Book a viewing");
  });
});
