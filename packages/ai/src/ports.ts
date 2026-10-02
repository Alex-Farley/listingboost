import type { EnhancementRequest, PropertyFacts } from "@listingboost/domain";

/**
 * Capability ports. Adapters translate these ListingBoost-normalised requests
 * into provider APIs. Nothing provider-specific crosses this boundary except
 * the provenance in `info` and optional provider request IDs, which are stored
 * server-side and never sent to the client.
 */

export class ProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly transient: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export type ProviderInfo = { provider: string; model: string; promptVersion: string };

export type ImageInput = { bytes: Uint8Array; contentType: string };
export type ImageOutput = { bytes: Uint8Array; contentType: string; width: number; height: number; providerRequestId?: string };
export type VideoOutput = { bytes: Uint8Array; contentType: "video/mp4"; width: number; height: number; providerRequestId?: string };

/** A brand font as bytes the renderer can read (TTF, OTF or WOFF). A single-file font has no separate bold. */
export type BrandFont = { regular: ArrayBuffer; bold: ArrayBuffer | null };

/**
 * The brand values a campaign captured at creation, as providers receive them.
 * Tone of voice is deliberately absent: it is stored on the profile only and
 * is not applied to copy (DECISIONS D-017, OD-2).
 */
export type BrandVoice = {
  agencyName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  website: string | null;
  officeAddress: string | null;
  primaryColour: string | null;
  secondaryColour: string | null;
  headingFont: BrandFont | null;
  bodyFont: BrandFont | null;
  logo: ImageInput | null;
};

export type TemplateRef = { id: string; version: number; config: Record<string, unknown> };

export interface ImageEnhancementProvider {
  readonly info: ProviderInfo;
  enhance(input: { image: ImageInput; request: EnhancementRequest }): Promise<ImageOutput>;
}

export type CopyRequest = {
  slot: string;
  description: string;
  maxLength: number;
  /** Only recorded facts; unknown facts are null and must not be guessed. */
  facts: PropertyFacts;
  brand: BrandVoice;
};

export interface TextGenerationProvider {
  readonly info: ProviderInfo;
  generateCopy(input: CopyRequest): Promise<{ text: string; providerRequestId?: string }>;
}

export type RenderRequest = {
  template: TemplateRef;
  photo: ImageInput;
  facts: PropertyFacts;
  brand: BrandVoice;
  texts: { headline: string | null; cta: string | null };
};

export interface TemplateRenderer {
  readonly info: ProviderInfo;
  render(input: RenderRequest): Promise<ImageOutput>;
}

export type ReelRequest = { template: TemplateRef; photos: ImageInput[]; facts: PropertyFacts; brand: BrandVoice };

export interface VideoGenerationProvider {
  readonly info: ProviderInfo;
  createReel(input: ReelRequest): Promise<VideoOutput>;
}

export type ProviderRegistry = {
  image_enhancement?: ImageEnhancementProvider;
  text_generation?: TextGenerationProvider;
  template_render?: TemplateRenderer;
  video_generation?: VideoGenerationProvider;
};

/** A logo or font that the renderer cannot use, with a reason fit to show the owner. */
export class BrandAssetRejectedError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BrandAssetRejectedError";
  }
}

/**
 * Prepares uploaded brand files with the same libraries the renderer draws
 * with, so what is accepted at upload is what can be rendered later.
 */
export interface BrandAssetProcessor {
  /** Converts an SVG that has already passed the safety check to a PNG. */
  rasteriseSvg(svg: Uint8Array): Promise<ImageOutput>;
  /** Unpacks a WOFF2 font into the TTF or OTF it contains, which the renderer can read. */
  decodeWoff2(woff2: Uint8Array): Promise<Uint8Array>;
  /** Draws a line of text with a TTF, OTF or WOFF font; rejects a font the renderer cannot use. */
  probeFont(font: Uint8Array): Promise<void>;
}
