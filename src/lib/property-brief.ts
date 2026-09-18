import { z } from "zod";

const nonEmptyText = (max: number) => z.string().trim().min(1).max(max);

export const propertyTypeSchema = nonEmptyText(100);

export const propertyBriefSchema = z.object({
  propertyType: propertyTypeSchema,
  bedrooms: z.number().int().nonnegative().nullable(),
  bathrooms: z.number().nonnegative().nullable(),
  floorArea: z
    .object({
      value: z.number().positive(),
      unit: z.enum(["sqft", "sqm"]),
    })
    .nullable(),
  price: z
    .object({
      amount: z.number().nonnegative(),
      currency: z.string().trim().length(3).toUpperCase(),
    })
    .nullable(),
  tenure: nonEmptyText(100).nullable(),
  address: nonEmptyText(500).nullable(),
  description: nonEmptyText(5000).nullable(),
  explicitFeatures: z.array(nonEmptyText(200)).max(50),
});

export type VerifiedPropertyBrief = z.infer<typeof propertyBriefSchema>;

/**
 * The brief is the canonical set of property facts supplied by the user.
 * "Verified" means explicitly supplied/confirmed by the user; it does not
 * imply independent verification by ListingBoost.
 */
export type PropertyBriefInput = {
  propertyType: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  floorArea?: { value: number; unit: "sqft" | "sqm" } | null;
  price?: { amount: number; currency: string } | null;
  tenure?: string | null;
  address?: string | null;
  description?: string | null;
  explicitFeatures?: string[];
};

function normalizeOptionalText(value: string | null | undefined, max: number) {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized.slice(0, max) : null;
}

function normalizeFeature(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizePropertyBrief(input: PropertyBriefInput): VerifiedPropertyBrief {
  const features = Array.from(
    new Set(
      (input.explicitFeatures ?? [])
        .map(normalizeFeature)
        .filter(Boolean),
    ),
  );

  return propertyBriefSchema.parse({
    propertyType: input.propertyType.trim().replace(/\s+/g, " "),
    bedrooms: input.bedrooms ?? null,
    bathrooms: input.bathrooms ?? null,
    floorArea: input.floorArea
      ? {
          value: input.floorArea.value,
          unit: input.floorArea.unit,
        }
      : null,
    price: input.price
      ? {
          amount: input.price.amount,
          currency: input.price.currency.trim().toUpperCase(),
        }
      : null,
    tenure: normalizeOptionalText(input.tenure, 100),
    address: normalizeOptionalText(input.address, 500),
    description: normalizeOptionalText(input.description, 5000),
    explicitFeatures: features,
  });
}
