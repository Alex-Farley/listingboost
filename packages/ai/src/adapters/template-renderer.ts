import type { PropertyFacts } from "@listingboost/domain";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import satori, { init as initSatori } from "satori/standalone";
import { ProviderError, type ImageOutput, type ProviderInfo, type RenderRequest, type TemplateRenderer } from "../ports";

/**
 * Renders social posts and Stories from versioned template config: the
 * unaltered photograph plus text taken only from copy, recorded facts and
 * brand details. No generative model is involved.
 */

type WasmInput = WebAssembly.Module | ArrayBuffer;

export type RendererAssets = {
  /** Workers only accept precompiled modules; tests pass raw bytes. */
  resvgWasm: WasmInput;
  yogaWasm: WasmInput;
  /** Google's woff2 decoder; see scripts/build-woff2-decoder.ts. */
  woff2Wasm: WasmInput;
  /** libwebp's decoder (@jsquash/webp): resvg cannot decode WebP, so WebP logos are converted to PNG at upload. */
  webpWasm: WasmInput;
  fonts: { serif: ArrayBuffer; serifBold: ArrayBuffer; sans: ArrayBuffer; sansBold: ArrayBuffer };
};

type Node = { type: string; props: Record<string, unknown> & { children?: Array<Node | string> | Node | string; style?: Record<string, unknown> } };

type BrandField = "agencyName" | "contactPhone" | "contactEmail" | "website" | "officeAddress";

type GraphicConfig = {
  canvas: { width: number; height: number };
  colours?: { fallback?: { primary?: string; secondary?: string } };
  /** Absent on version 1 templates, which keep their original rendering. */
  layout?: "split" | "full-photo";
  logo?: { position?: string; maxWidthRatio?: number; maxHeightRatio?: number; badge?: boolean };
  /** The agency and contact fields this template shows. Unset fields are omitted. */
  brandFields?: BrandField[];
  overlay?: { kind: "gradient"; coverage: number };
  safeArea?: { top: number; bottom: number };
};

/** Family names the captured brand fonts are registered under for one render. */
const BRAND_HEADING = "Brand Heading";
const BRAND_BODY = "Brand Body";
const TEXT_COLOUR = "#ffffff";

const PRICE_LABELS: Record<string, string> = {
  asking_price: "Asking price",
  guide_price: "Guide price",
  offers_over: "Offers over",
  offers_in_excess_of: "Offers in excess of",
  offers_in_region_of: "Offers in the region of",
  fixed_price: "Fixed price",
};

const el = (type: string, style: Record<string, unknown>, children?: Node["props"]["children"], extra: Record<string, unknown> = {}): Node => ({
  type,
  props: { style, ...(children === undefined ? {} : { children }), ...extra },
});

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function summary(facts: PropertyFacts): string | null {
  const parts = [facts.bedrooms ? plural(facts.bedrooms, "bedroom") : null, facts.bathrooms ? plural(facts.bathrooms, "bathroom") : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function price(facts: PropertyFacts): string | null {
  return facts.price ? `${PRICE_LABELS[facts.price.qualifier]} £${facts.price.amount.toLocaleString("en-GB")}` : null;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

const photoSrc = (input: RenderRequest) => `data:${input.photo.contentType};base64,${toBase64(input.photo.bytes)}`;

/** The logo scaled to fit the template's logo box, or null when there is no logo to draw. */
function logoImage(input: RenderRequest, config: GraphicConfig): Node | null {
  const logo = input.brand.logo;
  if (!logo || !logo.width || !logo.height) return null;
  const maxWidth = config.canvas.width * (config.logo?.maxWidthRatio ?? 0.22);
  const maxHeight = config.canvas.height * (config.logo?.maxHeightRatio ?? 0.09);
  const scale = Math.min(maxWidth / logo.width, maxHeight / logo.height);
  const width = Math.max(1, Math.round(logo.width * scale));
  const height = Math.max(1, Math.round(logo.height * scale));
  return el("img", { width, height }, undefined, { src: `data:${logo.contentType};base64,${toBase64(logo.bytes)}`, width, height });
}

/** Values of the brand fields the template declares, in declared order, skipping unset ones. */
function declaredBrand(input: RenderRequest, config: GraphicConfig): { agencyName: string | null; details: string[] } {
  const fields = config.brandFields ?? [];
  const value = (field: BrandField) => (fields.includes(field) ? (input.brand[field]?.replace(/\s*\n\s*/g, ", ") ?? null) : null);
  return {
    agencyName: value("agencyName"),
    details: fields.filter((f) => f !== "agencyName").map(value).filter((v): v is string => Boolean(v)),
  };
}

const families = (input: RenderRequest) => ({
  heading: input.brand.headingFont ? BRAND_HEADING : "Playfair Display",
  body: input.brand.bodyFont ? BRAND_BODY : "Inter",
});

/** Version 2 of the original design: the photo above a panel in the brand colour, now with logo and brand fonts. */
function splitLayout(input: RenderRequest, config: GraphicConfig): Node {
  const { width, height } = config.canvas;
  const primary = input.brand.primaryColour ?? config.colours?.fallback?.primary ?? "#1d2433";
  const tall = height / width > 1.5;
  const photoHeight = Math.round(height * (tall ? 0.62 : 0.6));
  const scale = width / 1080;
  const font = families(input);
  const headline = input.texts.headline ?? input.facts.title;
  const lines = [summary(input.facts), price(input.facts)].filter((l): l is string => Boolean(l));
  const brand = declaredBrand(input, config);
  const logo = logoImage(input, config);
  // The logo stands in for the agency name; with neither, nothing is drawn in its place.
  const mark = logo ?? (brand.agencyName ? el("div", { display: "flex", fontWeight: 600, letterSpacing: 1 }, brand.agencyName) : null);
  const cta = input.texts.cta ? el("div", { display: "flex", maxWidth: "70%", opacity: 0.9 }, input.texts.cta) : null;
  const footer = [cta, mark].filter((n): n is Node => n !== null);

  return el("div", { width, height, display: "flex", flexDirection: "column", backgroundColor: primary, fontFamily: font.body }, [
    el("img", { width, height: photoHeight, objectFit: "cover" }, undefined, { src: photoSrc(input), width, height: photoHeight }),
    el(
      "div",
      { display: "flex", flexDirection: "column", flexGrow: 1, padding: `${56 * scale}px ${64 * scale}px`, color: TEXT_COLOUR, justifyContent: "space-between" },
      [
        el("div", { display: "flex", flexDirection: "column" }, [
          el("div", { fontFamily: font.heading, fontSize: (tall ? 72 : 60) * scale, lineHeight: 1.12, fontWeight: 400 }, headline),
          ...lines.map((line) => el("div", { fontSize: 32 * scale, marginTop: 18 * scale, opacity: 0.9 }, line)),
          ...(brand.details.length ? [el("div", { fontSize: 24 * scale, marginTop: 18 * scale, opacity: 0.8 }, brand.details.join(" · "))] : []),
        ]),
        ...(footer.length
          ? [el("div", { display: "flex", justifyContent: cta ? "space-between" : "flex-end", alignItems: "flex-end", fontSize: 26 * scale }, footer)]
          : []),
      ],
    ),
  ]);
}

/**
 * "Full photo": the photograph fills the canvas and text sits over a dark
 * gradient across the bottom third. The gradient is a design overlay, like the
 * crop; the photograph itself is embedded unaltered.
 */
function fullPhotoLayout(input: RenderRequest, config: GraphicConfig): Node {
  const { width, height } = config.canvas;
  const primary = input.brand.primaryColour ?? config.colours?.fallback?.primary ?? "#1d2433";
  const scale = width / 1080;
  const pad = Math.round(56 * scale);
  const safe = config.safeArea ?? { top: 0, bottom: 0 };
  const font = families(input);
  const headline = input.texts.headline ?? input.facts.title;
  const factLine = [summary(input.facts), price(input.facts)].filter(Boolean).join(" · ");
  const brand = declaredBrand(input, config);
  const logo = logoImage(input, config);
  const tall = height / width > 1.5;
  // Deep enough to sit behind the text even where the safe area lifts it off the bottom edge.
  const gradientHeight = Math.round(height * (config.overlay?.coverage ?? 1 / 3)) + safe.bottom;

  const text: Node[] = [
    el("div", { display: "flex", width: Math.round(96 * scale), height: Math.round(8 * scale), backgroundColor: primary, marginBottom: Math.round(24 * scale) }),
    el("div", { fontFamily: font.heading, fontSize: (tall ? 72 : 60) * scale, lineHeight: 1.12, fontWeight: 400, lineClamp: 2, display: "block" }, headline),
    ...(factLine ? [el("div", { fontSize: 32 * scale, marginTop: Math.round(18 * scale), opacity: 0.95 }, factLine)] : []),
    ...(brand.details.length ? [el("div", { fontSize: 24 * scale, marginTop: Math.round(14 * scale), opacity: 0.85 }, brand.details.join(" · "))] : []),
    ...(input.texts.cta
      ? [
          el(
            "div",
            {
              display: "flex",
              alignSelf: "flex-start",
              marginTop: Math.round(28 * scale),
              padding: `${Math.round(14 * scale)}px ${Math.round(22 * scale)}px`,
              borderRadius: Math.round(6 * scale),
              backgroundColor: primary,
              fontSize: 26 * scale,
              fontWeight: 600,
              maxWidth: "100%",
            },
            input.texts.cta,
          ),
        ]
      : []),
  ];
  // With a logo the agency name is not repeated; without one it sits bottom-right, clear of the text block.
  const nameWidth = !logo && brand.agencyName ? Math.round(width * 0.32) : 0;

  return el("div", { width, height, display: "flex", position: "relative", backgroundColor: "#000000", fontFamily: font.body }, [
    el("img", { position: "absolute", top: 0, left: 0, width, height, objectFit: "cover" }, undefined, { src: photoSrc(input), width, height }),
    el("div", { display: "flex", position: "absolute", left: 0, bottom: 0, width, height: gradientHeight, backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.82))" }),
    el(
      "div",
      { display: "flex", flexDirection: "column", position: "absolute", left: pad, bottom: pad + safe.bottom, width: width - pad * 2 - nameWidth, color: TEXT_COLOUR },
      text,
    ),
    ...(logo
      ? [
          el(
            "div",
            { display: "flex", position: "absolute", left: pad, top: pad + safe.top, padding: Math.round(16 * scale), borderRadius: Math.round(12 * scale), backgroundColor: "#ffffff" },
            [logo],
          ),
        ]
      : brand.agencyName
        ? [
            el(
              "div",
              { display: "flex", position: "absolute", right: pad, bottom: pad + safe.bottom, maxWidth: nameWidth - pad / 2, color: TEXT_COLOUR, fontSize: 26 * scale, fontWeight: 600, letterSpacing: 1, textAlign: "right" },
              brand.agencyName,
            ),
          ]
        : []),
  ]);
}

/** Pure layout: which text and image go where. Exported so tests can check its truthfulness. */
export function graphicLayout(input: RenderRequest): Node {
  const config = input.template.config as GraphicConfig;
  if (config.layout === "split") return splitLayout(input, config);
  if (config.layout === "full-photo") return fullPhotoLayout(input, config);
  // Version 1 templates: rendered exactly as when they were approved (Master Spec §21).
  const { width, height } = config.canvas;
  const primary = input.brand.primaryColour ?? config.colours?.fallback?.primary ?? "#1d2433";
  const tall = height / width > 1.5;
  const photoHeight = Math.round(height * (tall ? 0.62 : 0.6));
  const scale = width / 1080;
  const headline = input.texts.headline ?? input.facts.title;
  const lines = [summary(input.facts), price(input.facts)].filter((l): l is string => Boolean(l));

  return el("div", { width, height, display: "flex", flexDirection: "column", backgroundColor: primary, fontFamily: "Inter" }, [
    el("img", { width, height: photoHeight, objectFit: "cover" }, undefined, {
      src: `data:${input.photo.contentType};base64,${toBase64(input.photo.bytes)}`,
      width,
      height: photoHeight,
    }),
    el(
      "div",
      { display: "flex", flexDirection: "column", flexGrow: 1, padding: `${56 * scale}px ${64 * scale}px`, color: "#ffffff", justifyContent: "space-between" },
      [
        el("div", { display: "flex", flexDirection: "column" }, [
          el("div", { fontFamily: "Playfair Display", fontSize: (tall ? 72 : 60) * scale, lineHeight: 1.12, fontWeight: 400 }, headline),
          ...lines.map((line) => el("div", { fontSize: 32 * scale, marginTop: 18 * scale, opacity: 0.9 }, line)),
        ]),
        el("div", { display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 26 * scale }, [
          el("div", { display: "flex", maxWidth: "70%", opacity: 0.9 }, input.texts.cta ?? ""),
          el("div", { display: "flex", fontWeight: 600, letterSpacing: 1 }, input.brand.agencyName ?? ""),
        ]),
      ],
    ),
  ]);
}

/** All visible text in a layout, for tests and audits. */
export function textOf(node: Node | string): string {
  if (typeof node === "string") return node;
  const children = node.props.children;
  if (children === undefined) return "";
  return (Array.isArray(children) ? children : [children]).map(textOf).filter(Boolean).join("\n");
}

let ready: Promise<void> | null = null;

/** Both wasm runtimes are process-global and may only be initialised once, whoever asks first. */
export function ensureRenderRuntime(assets: Pick<RendererAssets, "resvgWasm" | "yogaWasm">): Promise<void> {
  ready ??= Promise.all([initWasm(assets.resvgWasm), initSatori(assets.yogaWasm)]).then(() => undefined);
  return ready;
}

export class SvgTemplateRenderer implements TemplateRenderer {
  readonly info: ProviderInfo = { provider: "listingboost-render", model: "satori-resvg-1", promptVersion: "layout-v1" };

  constructor(private readonly assets: RendererAssets) {}

  private init(): Promise<void> {
    return ensureRenderRuntime(this.assets);
  }

  async render(input: RenderRequest): Promise<ImageOutput> {
    // resvg cannot decode WebP and would skip the photo without an error, leaving a graphic with
    // no photograph (work item 004). Refuse instead; retrying cannot help.
    if (input.photo.contentType === "image/webp") {
      throw new ProviderError("photo_format_unsupported", "WebP photos cannot be drawn by the renderer", false);
    }
    await this.init();
    const { width, height } = (input.template.config as GraphicConfig).canvas;
    const { fonts } = this.assets;
    const { headingFont, bodyFont } = input.brand;
    const svg = await satori(graphicLayout(input) as never, {
      width,
      height,
      fonts: [
        { name: "Playfair Display", data: fonts.serif, weight: 400, style: "normal" },
        { name: "Playfair Display", data: fonts.serifBold, weight: 700, style: "normal" },
        { name: "Inter", data: fonts.sans, weight: 400, style: "normal" },
        { name: "Inter", data: fonts.sansBold, weight: 600, style: "normal" },
        // Captured brand fonts. A single-file font serves every weight; version 1 layouts never name these.
        ...(headingFont ? [{ name: BRAND_HEADING, data: headingFont.regular, weight: 400 as const, style: "normal" as const }] : []),
        ...(headingFont?.bold ? [{ name: BRAND_HEADING, data: headingFont.bold, weight: 700 as const, style: "normal" as const }] : []),
        ...(bodyFont ? [{ name: BRAND_BODY, data: bodyFont.regular, weight: 400 as const, style: "normal" as const }] : []),
        ...(bodyFont?.bold ? [{ name: BRAND_BODY, data: bodyFont.bold, weight: 600 as const, style: "normal" as const }] : []),
      ],
    });
    const png = new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();
    return { bytes: png, contentType: "image/png", width, height };
  }
}
