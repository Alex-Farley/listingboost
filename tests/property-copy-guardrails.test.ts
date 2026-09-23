import { describe, expect, test } from "vitest";
import { campaignCopySchema, validateCampaignCopy } from "../src/lib/property-copy-guardrails";

const verifiedFacts = "Four-bedroom home with a kitchen extension and south-facing garden.";

const validCopy = {
  headline: "A four-bedroom home with a south-facing garden",
  primaryText: "A bright four-bedroom home with a kitchen extension and south-facing garden.",
  shortCaption: "Four bedrooms · kitchen extension · south-facing garden",
  cta: "Arrange a viewing",
  hashtags: ["#property", "#forsale"],
  factualClaims: ["Four-bedroom home", "kitchen extension", "south-facing garden"],
};

describe("structured property copy guardrails", () => {
  test("accepts the expected product shape", () => {
    expect(campaignCopySchema.safeParse(validCopy).success).toBe(true);
  });

  test("accepts factual claims that are grounded in the verified brief", () => {
    const result = validateCampaignCopy(validCopy, verifiedFacts);
    expect(result.ok).toBe(true);
  });

  test("rejects a factual claim that is absent from the verified brief", () => {
    const result = validateCampaignCopy(
      { ...validCopy, factualClaims: [...validCopy.factualClaims, "Sea view"] },
      verifiedFacts,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain("Sea view");
  });

  test("rejects malformed model output", () => {
    const result = validateCampaignCopy(
      { ...validCopy, hashtags: ["not-a-hashtag"] },
      verifiedFacts,
    );
    expect(result.ok).toBe(false);
  });

  test("rejects an underspecified verified brief", () => {
    const result = validateCampaignCopy(validCopy, "home");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain("20 characters");
  });
});
