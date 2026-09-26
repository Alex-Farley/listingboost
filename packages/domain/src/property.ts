import { z } from "zod";

// Neither the strict CSP in the browser nor Cloudflare Workers allow eval, so
// zod must not probe for or use generated code.
z.config({ jitless: true });

export const PROPERTY_TYPES = [
  "detached",
  "semi_detached",
  "terraced",
  "end_of_terrace",
  "flat",
  "maisonette",
  "bungalow",
  "cottage",
  "land",
  "other",
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const TENURES = ["freehold", "leasehold", "share_of_freehold", "commonhold"] as const;
export type Tenure = (typeof TENURES)[number];

export const PRICE_QUALIFIERS = [
  "asking_price",
  "guide_price",
  "offers_over",
  "offers_in_excess_of",
  "offers_in_region_of",
  "fixed_price",
] as const;
export type PriceQualifier = (typeof PRICE_QUALIFIERS)[number];

export type FloorArea = { value: number; unit: "sq_ft" | "sq_m" };
export type Price = { amount: number; qualifier: PriceQualifier };

/** Facts that marketing output may rely on. `null` means unknown — never guess. */
export type PropertyFacts = {
  title: string;
  addressLine1: string | null;
  addressLine2: string | null;
  town: string | null;
  county: string | null;
  postcode: string;
  propertyType: PropertyType;
  bedrooms: number | null;
  bathrooms: number | null;
  receptionRooms: number | null;
  floorArea: FloorArea | null;
  price: Price | null;
  tenure: Tenure | null;
  parking: string | null;
  garden: string | null;
  keyFeatures: string[];
  description: string;
};

export type AgentContact = { name: string | null; phone: string | null; email: string | null };

export type PropertyInput = PropertyFacts & {
  agent: AgentContact | null;
  sourceUrl: string | null;
};

const POSTCODE = /^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/;

export function normaliseUkPostcode(raw: string): string | null {
  const compact = raw.replace(/\s+/g, "").toUpperCase();
  if (compact === "GIR0AA") return "GIR 0AA";
  const match = compact.match(POSTCODE);
  return match ? `${match[1]} ${match[2]}` : null;
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const count = z.number().int().min(0).max(50).nullish().transform((v) => v ?? null);

const httpUrl = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((v) => /^https?:\/\//i.test(v), "Must be an http(s) URL");

const schema = z
  .object({
    title: optionalText(200),
    addressLine1: optionalText(200),
    addressLine2: optionalText(200),
    town: optionalText(100),
    county: optionalText(100),
    postcode: z.string().transform((v, ctx) => {
      const normalised = normaliseUkPostcode(v);
      if (!normalised) {
        ctx.addIssue({ code: "custom", message: "Enter a valid UK postcode" });
        return z.NEVER;
      }
      return normalised;
    }),
    propertyType: z.enum(PROPERTY_TYPES),
    bedrooms: count,
    bathrooms: count,
    receptionRooms: count,
    floorArea: z
      .object({ value: z.number().positive().max(1_000_000), unit: z.enum(["sq_ft", "sq_m"]) })
      .nullish()
      .transform((v) => v ?? null),
    price: z
      .object({ amount: z.number().int().positive().max(1_000_000_000), qualifier: z.enum(PRICE_QUALIFIERS) })
      .nullish()
      .transform((v) => v ?? null),
    tenure: z.enum(TENURES).nullish().transform((v) => v ?? null),
    parking: optionalText(300),
    garden: optionalText(300),
    keyFeatures: z.array(z.string().trim().min(1).max(200)).max(30).nullish().transform((v) => v ?? []),
    description: z.string().trim().max(10_000).nullish().transform((v) => v ?? ""),
    sourceUrl: httpUrl.nullish().transform((v) => v ?? null),
    agent: z
      .object({ name: optionalText(200), phone: optionalText(50), email: z.string().trim().email().max(254).nullish().transform((v) => v ?? null) })
      .nullish()
      .transform((v) => v ?? null),
  })
  .superRefine((v, ctx) => {
    if (!v.title && !v.addressLine1) {
      ctx.addIssue({ code: "custom", path: ["addressLine1"], message: "Enter a property title or the first line of the address" });
    }
  });

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

export function zodErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    errors[key] ??= issue.message;
  }
  return errors;
}

export function parsePropertyInput(input: unknown): ParseResult<PropertyInput> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const v = parsed.data;
  const title = v.title ?? [v.addressLine1, v.town].filter(Boolean).join(", ");
  return { ok: true, value: { ...v, title } };
}
