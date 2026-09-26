import {
  archiveProperty,
  createProperty,
  getProperty,
  listProperties,
  manualProvenance,
  updateProperty,
  type OrganisationScope,
} from "@listingboost/database";
import { parsePropertyInput, PROPERTY_TYPES, type PropertyInput, type PropertyType } from "@listingboost/domain";
import { requireSession, type AuthenticatedSession } from "../auth/session";
import type { AppContext } from "../context";
import { HttpError, json, notFound, readJson, validationError } from "../http";
import { decodeCursor, encodeCursor, parseLimit } from "../pagination";
import type { Router } from "../router";

export function scopeOf(session: AuthenticatedSession): OrganisationScope {
  return { organisationId: session.organisation.id, userId: session.user.id };
}

async function readPropertyInput(request: Request): Promise<PropertyInput> {
  const result = parsePropertyInput(await readJson(request));
  if (!result.ok) throw validationError(result.errors);
  return result.value;
}

function parsePropertyType(value: string | null): PropertyType | undefined {
  if (value === null) return undefined;
  if (!(PROPERTY_TYPES as readonly string[]).includes(value)) {
    throw new HttpError(400, "validation_error", "Unknown property type.", { propertyType: "Unknown property type" });
  }
  return value as PropertyType;
}

export function registerPropertyRoutes(router: Router<AppContext>): void {
  router.on("POST", "/api/properties", async (request, _params, ctx) => {
    const scope = scopeOf(await requireSession(request, ctx));
    const input = await readPropertyInput(request);
    const property = await createProperty(ctx.db, scope, input, manualProvenance(input), ctx.now().toISOString());
    return json(property, 201);
  });

  router.on("GET", "/api/properties", async (request, _params, ctx) => {
    const scope = scopeOf(await requireSession(request, ctx));
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim().slice(0, 100) || undefined;
    const page = await listProperties(ctx.db, scope, {
      q,
      propertyType: parsePropertyType(url.searchParams.get("propertyType")),
      limit: parseLimit(url.searchParams.get("limit")),
      cursor: decodeCursor(url.searchParams.get("cursor")),
    });
    return json({ items: page.items, nextCursor: encodeCursor(page.next) });
  });

  router.on("GET", "/api/properties/:id", async (request, params, ctx) => {
    const scope = scopeOf(await requireSession(request, ctx));
    const property = await getProperty(ctx.db, scope, params.id!);
    if (!property) throw notFound();
    return json(property);
  });

  router.on("PUT", "/api/properties/:id", async (request, params, ctx) => {
    const scope = scopeOf(await requireSession(request, ctx));
    const input = await readPropertyInput(request);
    const property = await updateProperty(ctx.db, scope, params.id!, input, manualProvenance(input), ctx.now().toISOString());
    if (!property) throw notFound();
    return json(property);
  });

  router.on("POST", "/api/properties/:id/archive", async (request, params, ctx) => {
    const scope = scopeOf(await requireSession(request, ctx));
    if (!(await archiveProperty(ctx.db, scope, params.id!, ctx.now().toISOString()))) throw notFound();
    return json(await getProperty(ctx.db, scope, params.id!));
  });
}
