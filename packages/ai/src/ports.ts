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

export type BrandVoice = {
  agencyName: string | null;
  toneOfVoice: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  website: string | null;
  primaryColour: string | null;
  secondaryColour: string | null;
  headingFont: string | null;
  bodyFont: string | null;
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
