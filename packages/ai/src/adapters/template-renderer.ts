import type { PropertyFacts } from "@listingboost/domain";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import satori, { init as initSatori } from "satori/standalone";
import type { ImageOutput, ProviderInfo, RenderRequest, TemplateRenderer } from "../ports";

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
  fonts: { serif: ArrayBuffer; serifBold: ArrayBuffer; sans: ArrayBuffer; sansBold: ArrayBuffer };
};

type Node = { type: string; props: Record<string, unknown> & { children?: Array<Node | string> | Node | string; style?: Record<string, unknown> } };

type GraphicConfig = {
  canvas: { width: number; height: number };
  colours?: { fallback?: { primary?: string; secondary?: string } };
};

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

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Pure layout: which text and image go where. Exported so tests can check its truthfulness. */
export function graphicLayout(input: RenderRequest): Node {
  const config = input.template.config as GraphicConfig;
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

export class SvgTemplateRenderer implements TemplateRenderer {
  readonly info: ProviderInfo = { provider: "listingboost-render", model: "satori-resvg-1", promptVersion: "layout-v1" };

  constructor(private readonly assets: RendererAssets) {}

  private init(): Promise<void> {
    // Both wasm runtimes are process-global and may only be initialised once.
    ready ??= Promise.all([initWasm(this.assets.resvgWasm), initSatori(this.assets.yogaWasm)]).then(() => undefined);
    return ready;
  }

  async render(input: RenderRequest): Promise<ImageOutput> {
    await this.init();
    const { width, height } = (input.template.config as GraphicConfig).canvas;
    const { fonts } = this.assets;
    const svg = await satori(graphicLayout(input) as never, {
      width,
      height,
      fonts: [
        { name: "Playfair Display", data: fonts.serif, weight: 400, style: "normal" },
        { name: "Playfair Display", data: fonts.serifBold, weight: 700, style: "normal" },
        { name: "Inter", data: fonts.sans, weight: 400, style: "normal" },
        { name: "Inter", data: fonts.sansBold, weight: 600, style: "normal" },
      ],
    });
    const png = new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();
    return { bytes: png, contentType: "image/png", width, height };
  }
}
