import type { AgentContact, PropertyFacts, PropertyInput, PropertyType } from "@listingboost/domain";
import { auditStatement } from "./audit";
import type { OrganisationScope } from "./scope";
import type { SqlDatabase, SqlValue } from "./sql";

export type FactProvenance = { source: "manual" | "import"; verified: boolean; sourceUrl?: string };

export type PropertyRecord = {
  id: string;
  facts: PropertyFacts;
  agent: AgentContact | null;
  sourceUrl: string | null;
  provenance: Record<string, FactProvenance>;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

type PropertyRow = {
  id: string;
  title: string;
  address_line1: string | null;
  address_line2: string | null;
  town: string | null;
  county: string | null;
  postcode: string;
  property_type: PropertyType;
  bedrooms: number | null;
  bathrooms: number | null;
  reception_rooms: number | null;
  floor_area_value: number | null;
  floor_area_unit: "sq_ft" | "sq_m" | null;
  price_amount: number | null;
  price_qualifier: NonNullable<PropertyFacts["price"]>["qualifier"] | null;
  tenure: PropertyFacts["tenure"];
  parking: string | null;
  garden: string | null;
  key_features_json: string;
  description: string;
  agent_name: string | null;
  agent_phone: string | null;
  agent_email: string | null;
  source_url: string | null;
  fact_provenance_json: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  rowid: number;
};

const COLUMNS = `rowid, id, title, address_line1, address_line2, town, county, postcode, property_type, bedrooms, bathrooms,
  reception_rooms, floor_area_value, floor_area_unit, price_amount, price_qualifier, tenure, parking, garden,
  key_features_json, description, agent_name, agent_phone, agent_email, source_url, fact_provenance_json,
  created_at, updated_at, archived_at`;

function toRecord(row: PropertyRow): PropertyRecord {
  const agent =
    row.agent_name || row.agent_phone || row.agent_email ? { name: row.agent_name, phone: row.agent_phone, email: row.agent_email } : null;
  return {
    id: row.id,
    facts: {
      title: row.title,
      addressLine1: row.address_line1,
      addressLine2: row.address_line2,
      town: row.town,
      county: row.county,
      postcode: row.postcode,
      propertyType: row.property_type,
      bedrooms: row.bedrooms,
      bathrooms: row.bathrooms,
      receptionRooms: row.reception_rooms,
      floorArea: row.floor_area_value !== null && row.floor_area_unit ? { value: row.floor_area_value, unit: row.floor_area_unit } : null,
      price: row.price_amount !== null && row.price_qualifier ? { amount: row.price_amount, qualifier: row.price_qualifier } : null,
      tenure: row.tenure,
      parking: row.parking,
      garden: row.garden,
      keyFeatures: JSON.parse(row.key_features_json) as string[],
      description: row.description,
    },
    agent,
    sourceUrl: row.source_url,
    provenance: JSON.parse(row.fact_provenance_json) as Record<string, FactProvenance>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

const FACT_KEYS: ReadonlyArray<keyof PropertyFacts> = [
  "title", "addressLine1", "addressLine2", "town", "county", "postcode", "propertyType", "bedrooms", "bathrooms",
  "receptionRooms", "floorArea", "price", "tenure", "parking", "garden", "keyFeatures", "description",
];

/** Facts typed or confirmed by the agent are manual and verified. Unknown facts get no provenance. */
export function manualProvenance(input: PropertyFacts): Record<string, FactProvenance> {
  const provenance: Record<string, FactProvenance> = {};
  for (const key of FACT_KEYS) {
    const value = input[key];
    if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) continue;
    provenance[key] = { source: "manual", verified: true };
  }
  return provenance;
}

function factValues(input: PropertyInput): SqlValue[] {
  return [
    input.title,
    input.addressLine1,
    input.addressLine2,
    input.town,
    input.county,
    input.postcode,
    input.propertyType,
    input.bedrooms,
    input.bathrooms,
    input.receptionRooms,
    input.floorArea?.value ?? null,
    input.floorArea?.unit ?? null,
    input.price?.amount ?? null,
    input.price?.qualifier ?? null,
    input.tenure,
    input.parking,
    input.garden,
    JSON.stringify(input.keyFeatures),
    input.description,
    input.agent?.name ?? null,
    input.agent?.phone ?? null,
    input.agent?.email ?? null,
    input.sourceUrl,
  ];
}

export async function createProperty(
  db: SqlDatabase,
  scope: OrganisationScope,
  input: PropertyInput,
  provenance: Record<string, FactProvenance>,
  now: string,
): Promise<PropertyRecord> {
  const id = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        `INSERT INTO properties (id, organisation_id, title, address_line1, address_line2, town, county, postcode, property_type,
           bedrooms, bathrooms, reception_rooms, floor_area_value, floor_area_unit, price_amount, price_qualifier, tenure, parking,
           garden, key_features_json, description, agent_name, agent_phone, agent_email, source_url, fact_provenance_json,
           created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, scope.organisationId, ...factValues(input), JSON.stringify(provenance), scope.userId, now, now),
    auditStatement(db, scope, { action: "property.created", subjectType: "property", subjectId: id, now }),
  ]);
  return (await getProperty(db, scope, id))!;
}

export async function getProperty(db: SqlDatabase, scope: OrganisationScope, id: string): Promise<PropertyRecord | null> {
  const row = await db
    .prepare(`SELECT ${COLUMNS} FROM properties WHERE id = ? AND organisation_id = ?`)
    .bind(id, scope.organisationId)
    .first<PropertyRow>();
  return row ? toRecord(row) : null;
}

export async function updateProperty(
  db: SqlDatabase,
  scope: OrganisationScope,
  id: string,
  input: PropertyInput,
  provenance: Record<string, FactProvenance>,
  now: string,
): Promise<PropertyRecord | null> {
  const [result] = (await db.batch([
    db
      .prepare(
        `UPDATE properties SET title = ?, address_line1 = ?, address_line2 = ?, town = ?, county = ?, postcode = ?, property_type = ?,
           bedrooms = ?, bathrooms = ?, reception_rooms = ?, floor_area_value = ?, floor_area_unit = ?, price_amount = ?,
           price_qualifier = ?, tenure = ?, parking = ?, garden = ?, key_features_json = ?, description = ?, agent_name = ?,
           agent_phone = ?, agent_email = ?, source_url = ?, fact_provenance_json = ?, updated_at = ?
         WHERE id = ? AND organisation_id = ?`,
      )
      .bind(...factValues(input), JSON.stringify(provenance), now, id, scope.organisationId),
    db
      .prepare(
        `INSERT INTO audit_events (id, organisation_id, actor_user_id, action, subject_type, subject_id, metadata_json, created_at)
         SELECT ?, ?, ?, 'property.updated', 'property', id, '{}', ? FROM properties WHERE id = ? AND organisation_id = ?`,
      )
      .bind(crypto.randomUUID(), scope.organisationId, scope.userId, now, id, scope.organisationId),
  ])) as Array<{ meta: { changes: number } }>;
  if (!result || result.meta.changes === 0) return null;
  return getProperty(db, scope, id);
}

export async function archiveProperty(db: SqlDatabase, scope: OrganisationScope, id: string, now: string): Promise<boolean> {
  const result = await db
    .prepare("UPDATE properties SET archived_at = COALESCE(archived_at, ?), updated_at = ? WHERE id = ? AND organisation_id = ?")
    .bind(now, now, id, scope.organisationId)
    .run();
  return result.meta.changes > 0;
}

export type PropertyListQuery = { q?: string; propertyType?: PropertyType; limit: number; cursor?: { updatedAt: string; rowid: number } };

export type Page<T> = { items: T[]; next: { updatedAt: string; rowid: number } | null };

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listProperties(db: SqlDatabase, scope: OrganisationScope, query: PropertyListQuery): Promise<Page<PropertyRecord>> {
  const where = ["organisation_id = ?", "archived_at IS NULL"];
  const params: SqlValue[] = [scope.organisationId];
  if (query.q) {
    const like = `%${escapeLike(query.q.toLowerCase())}%`;
    where.push(
      `(lower(title) LIKE ? ESCAPE '\\' OR lower(COALESCE(address_line1, '')) LIKE ? ESCAPE '\\'
        OR lower(COALESCE(town, '')) LIKE ? ESCAPE '\\' OR lower(postcode) LIKE ? ESCAPE '\\')`,
    );
    params.push(like, like, like, like);
  }
  if (query.propertyType) {
    where.push("property_type = ?");
    params.push(query.propertyType);
  }
  if (query.cursor) {
    where.push("(updated_at < ? OR (updated_at = ? AND rowid < ?))");
    params.push(query.cursor.updatedAt, query.cursor.updatedAt, query.cursor.rowid);
  }
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM properties WHERE ${where.join(" AND ")} ORDER BY updated_at DESC, rowid DESC LIMIT ?`)
    .bind(...params, query.limit + 1)
    .all<PropertyRow>();
  const page = results.slice(0, query.limit);
  const last = page[page.length - 1];
  return {
    items: page.map(toRecord),
    next: results.length > query.limit && last ? { updatedAt: last.updated_at, rowid: last.rowid } : null,
  };
}
