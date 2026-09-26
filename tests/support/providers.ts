import {
  ProviderError,
  type CopyRequest,
  type ImageEnhancementProvider,
  type ImageInput,
  type ImageOutput,
  type ProviderRegistry,
  type ReelRequest,
  type RenderRequest,
  type TemplateRenderer,
  type TextGenerationProvider,
  type VideoGenerationProvider,
  type VideoOutput,
} from "@listingboost/ai";
import type { EnhancementRequest } from "@listingboost/domain";
import { fixture } from "./fixtures";

/**
 * Test doubles for provider adapters. They exist to test ListingBoost's own
 * orchestration (lifecycle, retries, persistence, truth checks). They are never
 * evidence that a real provider integration works.
 */
type Script = Array<Error | "ok">;

function nextOutcome(script: Script): Error | null {
  const outcome = script.shift();
  return outcome && outcome !== "ok" ? outcome : null;
}

export const transient = (code = "provider_timeout") => new ProviderError(code, "upstream said: internal-host-42 timed out", true);
export const permanent = (code = "provider_rejected") => new ProviderError(code, "upstream said: api key sk-live-secret invalid", false);

export class FakeEnhancer implements ImageEnhancementProvider {
  readonly info = { provider: "fake-enhancer", model: "enhance-test-1", promptVersion: "enhance-v1" };
  readonly calls: Array<{ image: ImageInput; request: EnhancementRequest }> = [];
  script: Script = [];
  async enhance(input: { image: ImageInput; request: EnhancementRequest }): Promise<ImageOutput> {
    this.calls.push(input);
    const error = nextOutcome(this.script);
    if (error) throw error;
    return { bytes: fixture("photo-800x600.png"), contentType: "image/png", width: 800, height: 600, providerRequestId: `enh-${this.calls.length}` };
  }
}

export class FakeWriter implements TextGenerationProvider {
  readonly info = { provider: "fake-writer", model: "writer-test-1", promptVersion: "copy-v1" };
  readonly calls: CopyRequest[] = [];
  script: Script = [];
  texts: Record<string, string> = {};
  async generateCopy(input: CopyRequest): Promise<{ text: string; providerRequestId?: string }> {
    this.calls.push(input);
    const error = nextOutcome(this.script);
    if (error) throw error;
    return { text: this.texts[input.slot] ?? `Book a viewing of ${input.facts.title}.`, providerRequestId: `txt-${this.calls.length}` };
  }
}

export class FakeRenderer implements TemplateRenderer {
  readonly info = { provider: "fake-renderer", model: "render-test-1", promptVersion: "render-v1" };
  readonly calls: RenderRequest[] = [];
  script: Script = [];
  async render(input: RenderRequest): Promise<ImageOutput> {
    this.calls.push(input);
    const error = nextOutcome(this.script);
    if (error) throw error;
    return { bytes: fixture("photo-1080x1350.jpg"), contentType: "image/jpeg", width: 1080, height: 1350 };
  }
}

export class FakeVideo implements VideoGenerationProvider {
  readonly info = { provider: "fake-video", model: "slideshow-test-1", promptVersion: "reel-v1" };
  readonly calls: ReelRequest[] = [];
  script: Script = [];
  async createReel(input: ReelRequest): Promise<VideoOutput> {
    this.calls.push(input);
    const error = nextOutcome(this.script);
    if (error) throw error;
    return { bytes: new TextEncoder().encode("test-video-bytes"), contentType: "video/mp4", width: 1080, height: 1920 };
  }
}

export function fakeProviders() {
  const enhancer = new FakeEnhancer();
  const writer = new FakeWriter();
  const renderer = new FakeRenderer();
  const video = new FakeVideo();
  const registry: ProviderRegistry = {
    image_enhancement: enhancer,
    text_generation: writer,
    template_render: renderer,
    video_generation: video,
  };
  return { enhancer, writer, renderer, video, registry };
}
