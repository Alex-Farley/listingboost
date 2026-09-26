import type { PropertyFacts, PropertyType, Tenure } from "@listingboost/domain";
import type { BrandVoice, CopyRequest, ProviderInfo, TextGenerationProvider } from "../ports";

/**
 * Deterministic, non-AI copywriter. Every sentence is built from a recorded
 * fact (or brand contact detail), so it cannot introduce unsupported claims.
 * It is the production text adapter until an LLM provider is chosen
 * (docs/DECISIONS.md D-017); tone of voice is not applied.
 */

const TYPE_WORDS: Record<PropertyType, string> = {
  detached: "detached house",
  semi_detached: "semi-detached house",
  terraced: "terraced house",
  end_of_terrace: "end-of-terrace house",
  flat: "flat",
  maisonette: "maisonette",
  bungalow: "bungalow",
  cottage: "cottage",
  land: "plot of land",
  other: "property",
};

const TYPE_TAGS: Record<PropertyType, string> = {
  detached: "DetachedHouse",
  semi_detached: "SemiDetached",
  terraced: "TerracedHouse",
  end_of_terrace: "EndOfTerrace",
  flat: "Flat",
  maisonette: "Maisonette",
  bungalow: "Bungalow",
  cottage: "Cottage",
  land: "Land",
  other: "Property",
};

const QUALIFIERS: Record<string, string> = {
  asking_price: "Asking price",
  guide_price: "Guide price",
  offers_over: "Offers over",
  offers_in_excess_of: "Offers in excess of",
  offers_in_region_of: "Offers in the region of",
  fixed_price: "Fixed price",
};

const TENURE_WORDS: Record<Tenure, string> = {
  freehold: "freehold",
  leasehold: "leasehold",
  share_of_freehold: "share of freehold",
  commonhold: "commonhold",
};

const number = (n: number) => n.toLocaleString("en-GB");
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

function place(f: PropertyFacts): string | null {
  return f.town ?? f.postcode.split(" ")[0] ?? null;
}

function describe(f: PropertyFacts, withPlace = true): string {
  const count = f.bedrooms ? `${f.bedrooms} bedroom ` : "";
  const where = withPlace && place(f) ? ` in ${place(f)}` : "";
  return `${count}${TYPE_WORDS[f.propertyType]}${where}`;
}

/** Joins sentences in order, dropping trailing ones that do not fit. Never cuts mid-sentence. */
function fit(parts: Array<string | null>, maxLength: number, separator = " "): string {
  let out = "";
  for (const part of parts) {
    if (!part) continue;
    const next = out ? `${out}${separator}${part}` : part;
    if (next.length > maxLength) break;
    out = next;
  }
  return out;
}

function headline(f: PropertyFacts, maxLength: number): string {
  const full = capitalise(describe(f));
  return full.length <= maxLength ? full : capitalise(describe(f, false)).slice(0, maxLength);
}

function factSentences(f: PropertyFacts): string[] {
  const rooms = [
    f.bathrooms ? plural(f.bathrooms, "bathroom") : null,
    f.receptionRooms ? plural(f.receptionRooms, "reception room") : null,
  ].filter(Boolean);
  return [
    `This ${describe(f)}${f.keyFeatures.length ? ` features ${f.keyFeatures.join("; ")}` : ""}.`,
    rooms.length ? `It has ${rooms.join(" and ")}.` : null,
    f.floorArea ? `Approximately ${number(f.floorArea.value)} ${f.floorArea.unit === "sq_ft" ? "sq ft" : "sq m"}.` : null,
    f.price ? `${QUALIFIERS[f.price.qualifier]} £${number(f.price.amount)}.` : null,
    f.tenure ? `Tenure: ${TENURE_WORDS[f.tenure]}.` : null,
    f.parking ? `Parking: ${sentence(f.parking)}` : null,
    f.garden ? `Outside: ${sentence(f.garden)}` : null,
  ].filter((s): s is string => Boolean(s));
}

function callToAction(brand: BrandVoice, maxLength: number): string {
  const { agencyName: agency, contactPhone: phone } = brand;
  const options = [
    agency && phone ? `Call ${agency} on ${phone} to arrange a viewing.` : null,
    agency ? `Contact ${agency} to arrange a viewing.` : null,
    phone ? `Call ${phone} to arrange a viewing.` : null,
    "Contact us to arrange a viewing.",
  ];
  return options.find((o): o is string => Boolean(o) && o!.length <= maxLength)!;
}

const tag = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "");

function hashtags(f: PropertyFacts, maxLength: number): string {
  const town = f.town ? tag(f.town) : null;
  const tags = [
    "#ForSale",
    "#PropertyForSale",
    town ? `#${town}Property` : null,
    town ? `#${town}Homes` : null,
    `#${TYPE_TAGS[f.propertyType]}`,
    "#EstateAgent",
  ];
  return fit(tags, maxLength);
}

export class FactCopywriter implements TextGenerationProvider {
  readonly info: ProviderInfo = { provider: "listingboost-facts", model: "fact-template-1", promptVersion: "facts-v1" };

  async generateCopy(input: CopyRequest): Promise<{ text: string }> {
    const f = input.facts;
    const max = input.maxLength;
    const head = headline(f, 80);
    const cta = callToAction(input.brand, 80);
    const facts = factSentences(f);
    const intro = input.brand.agencyName ? `${input.brand.agencyName} is pleased to present` : "Presenting";
    const texts: Record<string, () => string> = {
      headline: () => headline(f, max),
      supporting_copy: () => fit(facts, max),
      instagram_caption: () => fit([`${head}.`, fit(facts, max - head.length - cta.length - 4), cta], max, "\n\n"),
      facebook_copy: () => fit([`Introducing: ${head}.`, fit(facts, max - head.length - cta.length - 20), cta], max, "\n\n"),
      linkedin_copy: () => fit([`${intro} this ${describe(f)}.`, fit(facts.slice(1), max - cta.length - 120), cta], max, "\n\n"),
      hashtags: () => hashtags(f, max),
      cta: () => callToAction(input.brand, max),
    };
    const build = texts[input.slot];
    if (!build) throw new Error(`Unknown copy slot ${input.slot}`);
    return { text: build() };
  }
}
