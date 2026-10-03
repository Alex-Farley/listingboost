import { validateImageUpload, type ImageUploadPolicy, type ValidatedImage } from "./image-validation";

/**
 * Logos are small and drawn onto every graphic, so they have their own limits
 * (DECISIONS D-020): 2 MiB, no minimum size, and a pixel cap that keeps the
 * decoded image well inside Worker memory. SVG is handled separately: it is
 * safety-checked and converted to PNG before this policy applies.
 */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const MAX_LOGO_EDGE = 4096;
export const MAX_LOGO_PIXELS = 8_000_000;
/** A WebP logo is decoded in Worker memory to convert it to PNG, so its pixel cap is lower. */
export const MAX_WEBP_LOGO_PIXELS = 4_000_000;

export const LOGO_POLICY: ImageUploadPolicy = {
  maxBytes: MAX_LOGO_BYTES,
  minShortEdge: 1,
  maxPixels: MAX_LOGO_PIXELS,
  maxLongEdge: MAX_LOGO_EDGE,
  messages: {
    file_too_large: "Logos must be 2 MB or smaller.",
    unsupported_format: "Upload a PNG, JPEG, WebP or SVG logo.",
    corrupt_image: "The logo file appears to be damaged or incomplete.",
    image_too_large: `Logos can be up to ${MAX_LOGO_EDGE} pixels on the longest side and 8 megapixels in total.`,
  },
};

export function validateLogoUpload(input: { bytes: Uint8Array; filename: string; declaredType: string }): ValidatedImage {
  return validateImageUpload(input, LOGO_POLICY);
}
