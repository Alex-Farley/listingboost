import { getBrandProfile, isSelectableFont, updateBrandProfile, type BrandProfile, type OrganisationScope } from "@listingboost/database";
import {
  BRAND_TEMPLATE_SLOTS,
  brandContrastWarnings,
  parseBrandSettingsInput,
  parseFontRef,
  type BrandSettingsInput,
} from "@listingboost/domain";
import { selectableTemplates } from "@listingboost/templates";
import { requireOwner, requireSession, type AuthenticatedSession } from "../auth/session";
import type { AppContext } from "../context";
import { json, readJson, validationError } from "../http";
import type { Router } from "../router";
import { scopeOf } from "./properties";

const OWNER_ONLY = "Only an owner of your organisation can change brand settings.";

async function presentBrandSettings(ctx: AppContext, session: AuthenticatedSession, profile: BrandProfile) {
  const settings: Partial<BrandProfile> = { ...profile };
  delete settings.logoId;
  return {
    canEdit: session.role === "owner",
    settings,
    warnings: brandContrastWarnings(profile),
  };
}

/** Checks that depend on the organisation's own data, reported as field errors like the rest. */
async function referenceErrors(ctx: AppContext, scope: OrganisationScope, input: BrandSettingsInput): Promise<Record<string, string>> {
  const errors: Record<string, string> = {};
  for (const field of ["headingFont", "bodyFont"] as const) {
    const ref = parseFontRef(input[field]);
    if (ref?.kind === "custom" && !(await isSelectableFont(ctx.db, scope, ref.id))) errors[field] = "Choose a font from the list.";
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
    return json(await presentBrandSettings(ctx, session, await getBrandProfile(ctx.db, scopeOf(session))));
  });

  router.on("PUT", "/api/brand-settings", async (request, _params, ctx) => {
    const session = await requireOwner(request, ctx, OWNER_ONLY);
    const scope = scopeOf(session);
    const parsed = parseBrandSettingsInput(await readJson(request));
    if (!parsed.ok) throw validationError(parsed.errors);
    const errors = await referenceErrors(ctx, scope, parsed.value);
    if (Object.keys(errors).length > 0) throw validationError(errors);
    await updateBrandProfile(ctx.db, scope, parsed.value, ctx.now().toISOString());
    return json(await presentBrandSettings(ctx, session, await getBrandProfile(ctx.db, scope)));
  });
}
