import { FactCopywriter, SvgTemplateRenderer, type ProviderRegistry, type RendererAssets } from "@listingboost/ai";

/**
 * Provider adapters registered in deployed Workers. Only real implementations
 * belong here; unregistered capabilities are reported as unavailable (D-012).
 * Image enhancement and video await OD-1 / R7c.
 */
export function createProductionProviders(renderAssets: RendererAssets): ProviderRegistry {
  return {
    text_generation: new FactCopywriter(),
    template_render: new SvgTemplateRenderer(renderAssets),
  };
}
