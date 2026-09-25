const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "text/plain": "txt" };

export function slugify(value: string, fallback = "property"): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || fallback;
}

export function extensionFor(contentType: string): string {
  return EXTENSIONS[contentType] ?? "bin";
}

export function sourcePhotoFilename(propertyTitle: string, position: number, contentType: string): string {
  return `${slugify(propertyTitle)}-photo-${position + 1}.${extensionFor(contentType)}`;
}

/** Filenames are generated from slugs only, so they are always safe inside a quoted header value. */
export function contentDisposition(disposition: "inline" | "attachment", filename: string): string {
  return `${disposition}; filename="${filename}"`;
}
