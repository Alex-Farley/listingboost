import { z } from "zod";
import { zodErrors, type ParseResult } from "./property";

/** Campaign slots whose graphic template an organisation may choose. */
export const BRAND_TEMPLATE_SLOTS = ["social:square", "social:portrait", "story:primary"] as const;
export type BrandTemplateSlot = (typeof BRAND_TEMPLATE_SLOTS)[number];
export type PreferredTemplates = Partial<Record<BrandTemplateSlot, string>>;

/** A bundled preset (`preset:<id>`) or one of the organisation's uploads (`custom:<uuid>`). */
export type FontRef = { kind: "preset" | "custom"; id: string };

const PRESET_REF = /^preset:([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const CUSTOM_REF = /^custom:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export function parseFontRef(value: string | null | undefined): FontRef | null {
  if (!value) return null;
  const preset = value.match(PRESET_REF);
  if (preset) return { kind: "preset", id: preset[1]! };
  const custom = value.match(CUSTOM_REF);
  return custom ? { kind: "custom", id: custom[1]! } : null;
}

/** What an owner can save. `null` means not set — never shown as a configured value. */
export type BrandSettingsInput = {
  agencyName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  website: string | null;
  officeAddress: string | null;
  primaryColour: string | null;
  secondaryColour: string | null;
  headingFont: string | null;
  bodyFont: string | null;
  toneOfVoice: string | null;
  preferredTemplates: PreferredTemplates;
};

/** Brand values a campaign captures at creation. Tone is deliberately absent (D-017, OD-2). */
export type BrandSnapshot = Omit<BrandSettingsInput, "toneOfVoice"> & { logoId: string | null };

// Control characters, including line breaks: not allowed in single-line values.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
// eslint-disable-next-line no-control-regex
const CONTROL_EXCEPT_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f]/;

/** Optional text: trimmed, blank clears it. Checks run only on a non-blank value. */
function optional(check: (value: string, fail: (message: string) => void) => void) {
  return z
    .string()
    .nullish()
    .transform((raw, ctx) => {
      const value = (raw ?? "").replace(/\r\n?/g, "\n").trim();
      if (!value) return null;
      check(value, (message) => ctx.addIssue({ code: "custom", message }));
      return value;
    });
}

const singleLine = (label: string, max: number) =>
  optional((v, fail) => {
    if (CONTROL.test(v)) fail(`${label} must be on one line.`);
    else if (v.length > max) fail(`${label} can be up to ${max} characters.`);
  });

const colour = optional((v, fail) => {
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) fail("Enter a colour as #RRGGBB, for example #1d2433.");
}).transform((v) => (v ? v.toLowerCase() : null));

const font = optional((v, fail) => {
  if (!parseFontRef(v)) fail("Choose a font from the list.");
});

const EMAIL = z.string().email();

const schema = z.object({
  agencyName: singleLine("Agency name", 100),
  contactPhone: optional((v, fail) => {
    if (v.length > 30) fail("Phone number can be up to 30 characters.");
    else if (!/^[0-9 +()-]+$/.test(v) || !/[0-9]/.test(v)) fail("Use digits, spaces and + ( ) - only.");
  }),
  contactEmail: optional((v, fail) => {
    if (v.length > 254) fail("Email address can be up to 254 characters.");
    else if (!EMAIL.safeParse(v).success) fail("Enter an email address, for example hello@agency.co.uk.");
  }),
  website: optional((v, fail) => {
    const protocol = URL.canParse(v) ? new URL(v).protocol : null;
    if (protocol !== "http:" && protocol !== "https:") fail("Enter a web address starting with http:// or https://.");
    else if (v.length > 200) fail("Web address can be up to 200 characters.");
  }),
  officeAddress: optional((v, fail) => {
    if (CONTROL_EXCEPT_NEWLINE.test(v)) fail("Office address contains characters that cannot be used.");
    else if (v.length > 300) fail("Office address can be up to 300 characters.");
    else if (v.split("\n").length > 4) fail("Office address can be up to 4 lines.");
  }),
  primaryColour: colour,
  secondaryColour: colour,
  headingFont: font,
  bodyFont: font,
  toneOfVoice: singleLine("Tone preference", 200),
  preferredTemplates: z
    .record(z.string(), z.string())
    .nullish()
    .transform((raw, ctx) => {
      const out: PreferredTemplates = {};
      for (const [slot, templateId] of Object.entries(raw ?? {})) {
        if (!(BRAND_TEMPLATE_SLOTS as readonly string[]).includes(slot)) {
          ctx.addIssue({ code: "custom", path: [slot], message: "This asset has no template choice." });
        } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(templateId) || templateId.length > 100) {
          ctx.addIssue({ code: "custom", path: [slot], message: "Choose a template from the list." });
        } else {
          out[slot as BrandTemplateSlot] = templateId;
        }
      }
      return out;
    }),
});

export function parseBrandSettingsInput(input: unknown): ParseResult<BrandSettingsInput> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  return { ok: true, value: parsed.data };
}

function relativeLuminance(hex: string): number {
  const channel = (offset: number) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG 2 contrast ratio between two `#RRGGBB` colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** Graphics draw white text on the primary colour; large text needs 3:1 (WCAG AA). */
export const GRAPHIC_TEXT_COLOUR = "#ffffff";
export const MIN_GRAPHIC_CONTRAST = 3;

/** Warnings, not errors: the owner keeps control of their brand colours. */
export function brandContrastWarnings(brand: { primaryColour: string | null }): Record<string, string> {
  if (!brand.primaryColour || contrastRatio(brand.primaryColour, GRAPHIC_TEXT_COLOUR) >= MIN_GRAPHIC_CONTRAST) return {};
  return { primaryColour: "White text on this colour may be hard to read on your graphics. A darker colour will read better." };
}
