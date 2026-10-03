import { BrandAssetRejectedError } from "@listingboost/ai";
import {
  addFont,
  addLogo,
  getBrandProfile,
  getLogo,
  isSelectableFont,
  listLogos,
  listSelectableFonts,
  MAX_SELECTABLE_FONTS,
  removeFont,
  restoreLogo,
  updateBrandProfile,
  type LogoRecord,
  type OrganisationScope,
} from "@listingboost/database";
import {
  BRAND_TEMPLATE_SLOTS,
  brandContrastWarnings,
  findFontPreset,
  FONT_PRESETS,
  parseBrandSettingsInput,
  parseFontRef,
  type BrandSettingsInput,
} from "@listingboost/domain";
import {
  checkSvgSafety,
  FontRejectedError,
  inspectFontUpload,
  inspectSfnt,
  MAX_FONT_BYTES,
  MAX_LOGO_BYTES,
  MAX_WEBP_LOGO_PIXELS,
  objectKeys,
  UnsafeSvgError,
  UploadRejectedError,
  validateLogoUpload,
  type StoredFontFormat,
} from "@listingboost/storage";
import { GRAPHIC_SLOTS, selectableTemplates } from "@listingboost/templates";
import { requireOwner, requireSession, type AuthenticatedSession } from "../auth/session";
import type { AppContext } from "../context";
import { HttpError, json, notFound, readJson, validationError } from "../http";
import { signFileUrl } from "../media/signed-urls";
import type { Router } from "../router";
import { scopeOf } from "./properties";

const OWNER_ONLY = "Only an owner of your organisation can change brand settings.";

const MULTIPART_OVERHEAD = 64 * 1024;

async function presentLogo(ctx: AppContext, logo: LogoRecord) {
  // Signed only after the scoped lookup that produced this record.
  const { url } = await signFileUrl(ctx.config.mediaSigningSecret, { kind: "logo", id: logo.id, disposition: "inline" }, ctx.now());
  return { id: logo.id, url, width: logo.width, height: logo.height, contentType: logo.contentType, originalFormat: logo.originalFormat, createdAt: logo.createdAt };
}

async function presentBrandSettings(ctx: AppContext, session: AuthenticatedSession) {
  const scope = scopeOf(session);
  const { logoId, ...settings } = await getBrandProfile(ctx.db, scope);
  const logos = await listLogos(ctx.db, scope);
  const current = logos.find((l) => l.id === logoId) ?? null;
  return {
    canEdit: session.role === "owner",
    settings,
    logo: current ? await presentLogo(ctx, current) : null,
    // Previous logos exist only so an owner can restore one; members are not sent them.
    previousLogos: session.role === "owner" ? await Promise.all(logos.filter((l) => l.id !== logoId).map((l) => presentLogo(ctx, l))) : [],
    fonts: {
      heading: FONT_PRESETS.filter((p) => p.group === "heading").map((p) => ({ ref: `preset:${p.id}`, label: p.label })),
      body: FONT_PRESETS.filter((p) => p.group === "body").map((p) => ({ ref: `preset:${p.id}`, label: p.label })),
      // Font files are used by the renderer only; they are never offered for download.
      custom: (await listSelectableFonts(ctx.db, scope)).map((f) => ({ ref: `custom:${f.id}`, id: f.id, label: f.label, originalFormat: f.originalFormat, createdAt: f.createdAt })),
    },
    templates: BRAND_TEMPLATE_SLOTS.map((slot) => {
      const options = selectableTemplates(slot);
      const preferred = settings.preferredTemplates[slot] ?? null;
      return {
        slot,
        label: GRAPHIC_SLOTS[slot].label,
        options: options.map((t) => ({ id: t.id, label: String(t.config.layoutLabel ?? t.name) })),
        preferred,
        // False when a saved preference can no longer be chosen; the owner is asked to pick another.
        preferredAvailable: preferred === null || options.some((t) => t.id === preferred),
      };
    }),
    warnings: brandContrastWarnings(settings),
  };
}

async function uploadedForm(request: Request, maxBytes: number, tooLarge: string, missing: string): Promise<{ file: File; form: FormData }> {
  if (Number(request.headers.get("Content-Length") ?? "0") > maxBytes + MULTIPART_OVERHEAD) throw new HttpError(413, "file_too_large", tooLarge, { file: tooLarge });
  if (!(request.headers.get("Content-Type") ?? "").toLowerCase().startsWith("multipart/form-data")) {
    throw new HttpError(415, "unsupported_media_type", "Upload the file as multipart/form-data.");
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, "invalid_upload", "The upload could not be read.");
  }
  const file = form.get("file");
  if (!file || typeof file === "string") throw new HttpError(400, "invalid_upload", missing, { file: missing });
  return { file, form };
}

const FONT_CONTENT_TYPES: Record<StoredFontFormat, string> = { ttf: "font/ttf", otf: "font/otf", woff: "font/woff" };

/**
 * Checks one uploaded font and returns the bytes to store. WOFF2 is converted
 * to the TTF or OTF it contains, because the renderer cannot read WOFF2 (D-022).
 * A font is only accepted once the renderer has drawn with it.
 */
async function prepareFont(ctx: AppContext, file: File): Promise<{ bytes: Uint8Array; format: StoredFontFormat; originalFormat: "ttf" | "otf" | "woff" | "woff2" }> {
  const uploaded = new Uint8Array(await file.arrayBuffer());
  try {
    const inspected = inspectFontUpload({ bytes: uploaded, filename: file.name });
    let bytes: Uint8Array = uploaded;
    let format: StoredFontFormat;
    if (inspected.format === "woff2") {
      bytes = await ctx.brandAssets.decodeWoff2(uploaded);
      format = inspectSfnt(bytes).format;
    } else {
      format = inspected.format;
    }
    await ctx.brandAssets.probeFont(bytes);
    return { bytes, format, originalFormat: inspected.format };
  } catch (error) {
    if (error instanceof FontRejectedError || error instanceof BrandAssetRejectedError) throw new HttpError(400, error.code, error.message, { file: error.message });
    throw error;
  }
}

function fontLabel(form: FormData, file: File): string {
  const given = form.get("label");
  const label = (typeof given === "string" ? given : "").replace(/\s+/g, " ").trim() || file.name.replace(/\.[^.]+$/, "").trim() || "Custom font";
  return label.slice(0, 60).trim();
}

const looksLikeSvg = (file: File, bytes: Uint8Array) =>
  file.type.split(";")[0]!.trim().toLowerCase() === "image/svg+xml" ||
  file.name.toLowerCase().endsWith(".svg") ||
  /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<(?:svg|!doctype)/i.test(new TextDecoder().decode(bytes.subarray(0, 1024)).replace(/^\uFEFF/, ""));

/** Checks one uploaded logo and returns the bytes to store. An SVG is stored as a PNG only (D-020). */
async function prepareLogo(ctx: AppContext, file: File): Promise<Pick<LogoRecord, "contentType" | "width" | "height" | "originalFormat"> & { bytes: Uint8Array }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const rejected = (code: string, message: string) => new HttpError(400, code, message, { file: message });
  if (looksLikeSvg(file, bytes)) {
    try {
      checkSvgSafety(bytes);
      const png = await ctx.brandAssets.rasteriseSvg(bytes);
      return { bytes: png.bytes, contentType: "image/png", width: png.width, height: png.height, originalFormat: "svg" };
    } catch (error) {
      if (error instanceof UnsafeSvgError) throw rejected("unsafe_svg", error.message);
      if (error instanceof BrandAssetRejectedError) throw rejected(error.code, error.message);
      throw error;
    }
  }
  try {
    const image = validateLogoUpload({ bytes, filename: file.name, declaredType: file.type });
    if (image.contentType === "image/webp") {
      // The renderer cannot decode WebP, so the logo is stored as a PNG it can draw (owner decision 2026-10-02).
      if (image.width * image.height > MAX_WEBP_LOGO_PIXELS) {
        throw rejected("image_too_large", "WebP logos can be up to 4 megapixels. Upload a smaller WebP, or a PNG instead.");
      }
      const png = await ctx.brandAssets.webpToPng(bytes);
      await ctx.brandAssets.probeImage(png);
      return { bytes: png.bytes, contentType: "image/png", width: png.width, height: png.height, originalFormat: "webp" };
    }
    await ctx.brandAssets.probeImage({ bytes, ...image });
    return { bytes, ...image, originalFormat: image.contentType === "image/jpeg" ? "jpeg" : "png" };
  } catch (error) {
    if (error instanceof UploadRejectedError || error instanceof BrandAssetRejectedError) throw rejected(error.code, error.message);
    throw error;
  }
}

/** Checks that depend on the organisation's own data, reported as field errors like the rest. */
async function referenceErrors(ctx: AppContext, scope: OrganisationScope, input: BrandSettingsInput): Promise<Record<string, string>> {
  const errors: Record<string, string> = {};
  for (const field of ["headingFont", "bodyFont"] as const) {
    const ref = parseFontRef(input[field]);
    const known = !ref || (ref.kind === "preset" ? findFontPreset(ref.id) !== null : await isSelectableFont(ctx.db, scope, ref.id));
    if (!known) errors[field] = "Choose a font from the list.";
  }
  for (const slot of BRAND_TEMPLATE_SLOTS) {
    const templateId = input.preferredTemplates[slot];
    if (templateId && !selectableTemplates(slot).some((t) => t.id === templateId)) {
      errors[`preferredTemplates.${slot}`] = "Choose a template from the list for this asset.";
    }
  }
  return errors;
}

export function registerBrandRoutes(router: Router<AppContext>): void {
  router.on("GET", "/api/brand-settings", async (request, _params, ctx) => {
    const session = await requireSession(request, ctx);
    return json(await presentBrandSettings(ctx, session));
  });

  router.on("PUT", "/api/brand-settings", async (request, _params, ctx) => {
    const session = await requireOwner(request, ctx, OWNER_ONLY);
    const scope = scopeOf(session);
    const parsed = parseBrandSettingsInput(await readJson(request));
    if (!parsed.ok) throw validationError(parsed.errors);
    const errors = await referenceErrors(ctx, scope, parsed.value);
    if (Object.keys(errors).length > 0) throw validationError(errors);
    await updateBrandProfile(ctx.db, scope, parsed.value, ctx.now().toISOString());
    return json(await presentBrandSettings(ctx, session));
  });

  router.on("POST", "/api/brand-settings/logo", async (request, _params, ctx) => {
    const session = await requireOwner(request, ctx, OWNER_ONLY);
    const scope = scopeOf(session);
    const { file } = await uploadedForm(request, MAX_LOGO_BYTES, "Logos must be 2 MB or smaller.", "Choose a logo to upload.");
    const logo = await prepareLogo(ctx, file);
    const id = crypto.randomUUID();
    const objectKey = objectKeys.logo(scope.organisationId, id);
    await ctx.storage.put(objectKey, logo.bytes, { contentType: logo.contentType });
    try {
      await addLogo(
        ctx.db,
        scope,
        { id, objectKey, contentType: logo.contentType, byteSize: logo.bytes.length, width: logo.width, height: logo.height, originalFilename: file.name.slice(0, 255), originalFormat: logo.originalFormat },
        ctx.now().toISOString(),
      );
    } catch (error) {
      // Remove the just-written object if the row that should reference it was not saved.
      await ctx.storage.delete(objectKey).catch(() => undefined);
      throw error;
    }
    return json(await presentBrandSettings(ctx, session), 201);
  });

  router.on("POST", "/api/brand-settings/logos/:id/restore", async (request, params, ctx) => {
    const session = await requireOwner(request, ctx, OWNER_ONLY);
    const scope = scopeOf(session);
    const logo = await getLogo(ctx.db, scope, params.id!);
    if (!logo) throw notFound();
    await restoreLogo(ctx.db, scope, logo.id, ctx.now().toISOString());
    return json(await presentBrandSettings(ctx, session));
  });

  router.on("POST", "/api/brand-settings/fonts", async (request, _params, ctx) => {
    const session = await requireOwner(request, ctx, OWNER_ONLY);
    const scope = scopeOf(session);
    const { file, form } = await uploadedForm(request, MAX_FONT_BYTES, "Fonts must be 2 MB or smaller.", "Choose a font file to upload.");
    // Asked on every upload: the uploader states they may use this font (spec R6).
    if (form.get("rightsConfirmed") !== "true") {
      const message = "Confirm that you have the right to use this font.";
      throw new HttpError(400, "rights_not_confirmed", message, { rightsConfirmed: message });
    }
    if ((await listSelectableFonts(ctx.db, scope)).length >= MAX_SELECTABLE_FONTS) {
      throw new HttpError(409, "font_limit", `You can have up to ${MAX_SELECTABLE_FONTS} fonts. Remove one before uploading another.`);
    }
    const font = await prepareFont(ctx, file);
    const id = crypto.randomUUID();
    const objectKey = objectKeys.font(scope.organisationId, id);
    await ctx.storage.put(objectKey, font.bytes, { contentType: FONT_CONTENT_TYPES[font.format] });
    try {
      await addFont(
        ctx.db,
        scope,
        { id, label: fontLabel(form, file), objectKey, format: font.format, originalFormat: font.originalFormat, byteSize: font.bytes.length, originalFilename: file.name.slice(0, 255) },
        ctx.now().toISOString(),
      );
    } catch (error) {
      await ctx.storage.delete(objectKey).catch(() => undefined);
      throw error;
    }
    return json(await presentBrandSettings(ctx, session), 201);
  });

  router.on("DELETE", "/api/brand-settings/fonts/:id", async (request, params, ctx) => {
    const session = await requireOwner(request, ctx, OWNER_ONLY);
    if (!(await removeFont(ctx.db, scopeOf(session), params.id!, ctx.now().toISOString()))) throw notFound();
    return json(await presentBrandSettings(ctx, session));
  });
}
