import { z } from "zod";

const nonEmptyText = (max: number) => z.string().trim().min(1).max(max);

/**
 * Product-level shape for generated campaign copy. Provider response formats
 * must be adapted into this contract before copy is persisted or shown as ready.
 */
export const campaignCopySchema = z.object({
  headline: nonEmptyText(120),
  primaryText: nonEmptyText(2_000),
  shortCaption: nonEmptyText(500),
  cta: nonEmptyText(120),
  hashtags: z.array(z.string().trim().regex(/^#[A-Za-z0-9_]+$/)).max(15),
  factualClaims: z.array(nonEmptyText(240)).max(20),
});

export type CampaignCopy = z.infer<typeof campaignCopySchema>;

export type CampaignCopyValidationResult =
  | { ok: true; value: CampaignCopy }
  | { ok: false; errors: string[] };

function normalizeFactText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9£$%]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Parse and validate model output, then reject factual claims that cannot be
 * found in the verified property brief. This intentionally prefers false
 * negatives over allowing an unsupported property claim through.
 */
export function validateCampaignCopy(
  candidate: unknown,
  verifiedFacts: string,
): CampaignCopyValidationResult {
  const parsed = campaignCopySchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".") || "copy"}: ${issue.message}`),
    };
  }

  const facts = normalizeFactText(verifiedFacts);
  if (facts.length < 20) {
    return { ok: false, errors: ["Verified property facts must contain at least 20 characters."] };
  }

  const unsupported = parsed.data.factualClaims.filter((claim) => {
    const normalizedClaim = normalizeFactText(claim);
    return normalizedClaim.length === 0 || !facts.includes(normalizedClaim);
  });

  if (unsupported.length > 0) {
    return {
      ok: false,
      errors: unsupported.map((claim) => `Unsupported factual claim: ${claim}`),
    };
  }

  return { ok: true, value: parsed.data };
}
