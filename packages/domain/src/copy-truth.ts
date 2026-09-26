import type { PropertyFacts } from "./property";

export type ClaimCategory =
  | "bedrooms"
  | "bathrooms"
  | "reception_rooms"
  | "floor_area"
  | "price"
  | "tenure"
  | "parking"
  | "garden"
  | "views"
  | "transport"
  | "schools"
  | "renovation"
  | "history"
  | "architectural_feature";

export type CopyViolation = { category: ClaimCategory; claim: string; reason: string };
export type CopyValidation = { ok: boolean; violations: CopyViolation[] };

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const NUM = `(\\d+|${Object.keys(NUMBER_WORDS).join("|")})`;

function toNumber(token: string): number {
  return NUMBER_WORDS[token.toLowerCase()] ?? Number(token);
}

const COUNT_CLAIMS: Array<{ category: ClaimCategory; pattern: RegExp; fact: (f: PropertyFacts) => number | null }> = [
  { category: "bedrooms", pattern: new RegExp(`\\b${NUM}[\\s-]*(?:double\\s+|single\\s+)?bed(?:room)?s?\\b`, "gi"), fact: (f) => f.bedrooms },
  { category: "bathrooms", pattern: new RegExp(`\\b${NUM}[\\s-]*bath(?:room)?s?\\b`, "gi"), fact: (f) => f.bathrooms },
  { category: "reception_rooms", pattern: new RegExp(`\\b${NUM}[\\s-]*reception(?:\\s+rooms?)?\\b`, "gi"), fact: (f) => f.receptionRooms },
];

const AREA = /(\d[\d,]*(?:\.\d+)?)\s*(sq\.?\s*ft|sq\.?\s*feet|square\s+f(?:ee|oo)t|ft²|sq\.?\s*m\b|sqm|square\s+met(?:re|er)s?|m²)/gi;
const PRICE = /£\s?(\d[\d,]*(?:\.\d+)?)\s*(k|m|million)?\b/gi;
const TENURE = /\b(share\s+of\s+(?:the\s+)?freehold|freehold|leasehold|commonhold)\b/gi;

// Claims that are only allowed when the same idea appears in recorded facts.
const KEYWORD_CLAIMS: Array<{ category: ClaimCategory; pattern: RegExp; requires?: (f: PropertyFacts) => boolean; generic?: RegExp }> = [
  {
    category: "parking",
    pattern: /\b(off[- ]street|parking|garag(?:e|es|ing)|driveway|car\s?port|allocated\s+space)\b/gi,
    requires: (f) => f.parking !== null,
    generic: /^(parking|off[- ]street)$/i,
  },
  {
    category: "garden",
    // "end-of-terrace" / "end of terrace" is a property type, not an outdoor terrace.
    pattern: /\b(gardens?|patio|(?<!\bof[\s-])terrace|lawns?|courtyard|decking|balcony)\b/gi,
    requires: (f) => f.garden !== null,
    generic: /^gardens?$/i,
  },
  { category: "views", pattern: /\b(views?|overlooking|panoramic|vistas?)\b/gi },
  {
    category: "transport",
    pattern: /\b(\d+|a few|few)[\s-]*(?:min(?:ute)?s?)'?(?:\s+(?:walk|drive|stroll))?|\b(stations?|tube|underground|railway|motorway|bus\s+routes?|commut\w*|airport)\b/gi,
  },
  { category: "schools", pattern: /\b(schools?|catchment|ofsted|nursery|academy)\b/gi },
  {
    category: "renovation",
    pattern: /\b(renovat\w*|refurbish\w*|moderni[sz]\w*|newly|brand[\s-]new|new\s+(?:kitchen|bathroom|boiler|roof|windows)|extended|extension|loft\s+conversion|converted|upgraded|rewired|restored)\b/gi,
  },
  {
    category: "history",
    pattern: /\b(built\s+in\s+\d{4}|circa\s+\d{4}|\d{4}s|victorian|georgian|edwardian|regency|tudor|period|listed|grade\s+ii\*?|historic\w*|heritage|centur(?:y|ies))\b/gi,
  },
  {
    category: "architectural_feature",
    pattern: /\b(fireplaces?|beams?|bay\s+windows?|sash\s+windows?|high\s+ceilings?|vaulted|cornic\w*|original\s+features?|log\s+burners?|wood\s?burn\w*|bi-?folds?|skylights?|en[\s-]?suites?|conservatory|orangery|cellar|basement|annexe|walk-in\s+wardrobes?)\b/gi,
  },
];

function normalise(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9£]+/g, " ").replace(/\s+/g, " ")} `;
}

function stem(word: string): string {
  return word.replace(/(ies)$/, "y").replace(/(?<!s)s$/, "");
}

function supportedCorpus(facts: PropertyFacts): string {
  return normalise([facts.title, facts.parking, facts.garden, ...facts.keyFeatures, facts.description].filter(Boolean).join(" "));
}

function corpusSupports(corpus: string, claim: string): boolean {
  const words = normalise(claim).trim().split(" ").filter(Boolean).map(stem);
  return words.every((w) => corpus.includes(` ${w}`));
}

const SQ_FT_PER_SQ_M = 10.7639;

function sqFt(value: number, unit: string): number {
  return /sq\.?\s*m\b|sqm|met(?:re|er)|m²/i.test(unit) ? value * SQ_FT_PER_SQ_M : value;
}

export type CopyValidationOptions = {
  /** Exact strings that are not property claims (agency name, phone, website). Removed before checking. */
  allowedText?: readonly string[];
};

export function validateCopyClaims(input: string, facts: PropertyFacts, options: CopyValidationOptions = {}): CopyValidation {
  let text = input;
  for (const allowed of options.allowedText ?? []) {
    if (allowed.trim()) text = text.split(allowed).join(" ");
  }
  const violations: CopyViolation[] = [];
  const add = (category: ClaimCategory, claim: string, reason: string) => violations.push({ category, claim: claim.trim(), reason });

  for (const { category, pattern, fact } of COUNT_CLAIMS) {
    for (const m of text.matchAll(pattern)) {
      const claimed = toNumber(m[1]!);
      const known = fact(facts);
      if (known === null) add(category, m[0], `No ${category.replace("_", " ")} count is recorded`);
      else if (known !== claimed) add(category, m[0], `Recorded ${category.replace("_", " ")}: ${known}`);
    }
  }

  for (const m of text.matchAll(AREA)) {
    const claimed = sqFt(Number(m[1]!.replace(/,/g, "")), m[2]!);
    if (!facts.floorArea) add("floor_area", m[0], "No floor area is recorded");
    else {
      const known = facts.floorArea.unit === "sq_m" ? facts.floorArea.value * SQ_FT_PER_SQ_M : facts.floorArea.value;
      if (Math.abs(known - claimed) / known > 0.02) add("floor_area", m[0], "Floor area differs from the recorded value");
    }
  }

  for (const m of text.matchAll(PRICE)) {
    const multiplier = m[2] ? (m[2].toLowerCase() === "k" ? 1_000 : 1_000_000) : 1;
    const claimed = Math.round(Number(m[1]!.replace(/,/g, "")) * multiplier);
    if (!facts.price) add("price", m[0], "No price is recorded");
    else if (facts.price.amount !== claimed) add("price", m[0], "Price differs from the recorded price");
  }

  for (const m of text.matchAll(TENURE)) {
    const claimed = /share/i.test(m[1]!) ? "share_of_freehold" : m[1]!.toLowerCase();
    if (!facts.tenure) add("tenure", m[0], "No tenure is recorded");
    else if (facts.tenure !== claimed) add("tenure", m[0], "Tenure differs from the recorded tenure");
  }

  const corpus = supportedCorpus(facts);
  for (const { category, pattern, requires, generic } of KEYWORD_CLAIMS) {
    for (const m of text.matchAll(pattern)) {
      const claim = m[0];
      if (requires && !requires(facts)) {
        add(category, claim, `No ${category.replace("_", " ")} information is recorded`);
        continue;
      }
      if (generic?.test(claim.trim())) continue;
      if (!corpusSupports(corpus, claim)) add(category, claim, "Not supported by the recorded property information");
    }
  }

  return { ok: violations.length === 0, violations };
}
