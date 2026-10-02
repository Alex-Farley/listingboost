import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { allowedTransitions, ASSET_VERSION_STATES, VISUALISATION_LABEL } from "@listingboost/domain";
import { createTestDatabase, migrationFiles, SqliteD1 } from "../support/sqlite-d1";
import {
  insertAsset,
  insertCampaign,
  insertMedia,
  insertProperty,
  insertTenant,
  insertVersion,
  type Tenant,
} from "../support/db-fixtures";

let db: SqliteD1;
let a: Tenant;
let b: Tenant;

beforeEach(() => {
  db = createTestDatabase();
  a = insertTenant(db, "Agency A");
  b = insertTenant(db, "Agency B");
});

describe("schema", () => {
  test("contains every spec entity", () => {
    const tables = db.raw.query("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    for (const table of [
      "users", "organisations", "organisation_members", "brand_settings", "properties", "property_media", "campaigns",
      "campaign_assets", "asset_versions", "generation_jobs", "generation_outputs", "templates", "audit_events", "sessions", "rate_limits",
    ]) {
      expect(names).toContain(table);
    }
  });

  test("user emails are unique case-insensitively", () => {
    const email = (db.raw.query("SELECT email FROM users WHERE id = ?").get(a.userId) as { email: string }).email;
    expect(() =>
      db.raw.run("INSERT INTO users (id, email, name, password_hash, created_at, updated_at) VALUES ('x', ?, 'n', 'h', 'now', 'now')", [email.toUpperCase()]),
    ).toThrow();
  });

  test("only one primary photo per property", () => {
    const p = insertProperty(db, a);
    const m1 = insertMedia(db, a, p, 0);
    const m2 = insertMedia(db, a, p, 1);
    db.raw.run("UPDATE property_media SET is_primary = 1 WHERE id = ?", [m1]);
    expect(() => db.raw.run("UPDATE property_media SET is_primary = 1 WHERE id = ?", [m2])).toThrow();
  });
});

describe("AT-02/AT-09 organisation and campaign integrity enforced by the database", () => {
  test("campaign cannot reference another organisation's property", () => {
    const pb = insertProperty(db, b);
    expect(() => insertCampaign(db, a, pb)).toThrow(/FOREIGN KEY/);
  });

  test("media cannot be attached to another organisation's property", () => {
    const pb = insertProperty(db, b);
    expect(() => insertMedia(db, a, pb)).toThrow(/FOREIGN KEY/);
  });

  test("asset cannot reference another organisation's campaign", () => {
    const pb = insertProperty(db, b);
    const cb = insertCampaign(db, b, pb);
    expect(() => insertAsset(db, a, cb, pb)).toThrow(/FOREIGN KEY/);
  });

  test("asset cannot claim a different property than its campaign", () => {
    const p1 = insertProperty(db, a);
    const p2 = insertProperty(db, a);
    const c1 = insertCampaign(db, a, p1);
    expect(() => insertAsset(db, a, c1, p2)).toThrow(/FOREIGN KEY/);
  });

  test("asset source media must belong to the campaign's property", () => {
    const p1 = insertProperty(db, a);
    const p2 = insertProperty(db, a);
    const c1 = insertCampaign(db, a, p1);
    const foreignMedia = insertMedia(db, a, p2);
    expect(() => insertAsset(db, a, c1, p1, { sourceMediaId: foreignMedia })).toThrow(/FOREIGN KEY/);
    const ownMedia = insertMedia(db, a, p1);
    expect(() => insertAsset(db, a, c1, p1, { sourceMediaId: ownMedia })).not.toThrow();
  });

  test("version cannot reference an asset from a different campaign", () => {
    const p = insertProperty(db, a);
    const c1 = insertCampaign(db, a, p);
    const c2 = insertCampaign(db, a, p);
    const assetInC1 = insertAsset(db, a, c1, p);
    expect(() => insertVersion(db, a, c2, assetInC1)).toThrow(/FOREIGN KEY/);
  });

  test("version cannot be created in another organisation for an asset", () => {
    const p = insertProperty(db, a);
    const c = insertCampaign(db, a, p);
    const asset = insertAsset(db, a, c, p);
    expect(() => insertVersion(db, b, c, asset)).toThrow(/FOREIGN KEY/);
  });

  test("version numbers are unique per asset", () => {
    const p = insertProperty(db, a);
    const c = insertCampaign(db, a, p);
    const asset = insertAsset(db, a, c, p);
    insertVersion(db, a, c, asset, { versionNumber: 1 });
    expect(() => insertVersion(db, a, c, asset, { versionNumber: 1 })).toThrow(/UNIQUE/);
  });
});

describe("AT-16 visualisation disclosure enforced by the database", () => {
  let c: string;
  let asset: string;
  beforeEach(() => {
    const p = insertProperty(db, a);
    c = insertCampaign(db, a, p);
    asset = insertAsset(db, a, c, p);
  });

  test("visualisation without label is rejected", () => {
    expect(() => insertVersion(db, a, c, asset, { treatment: "visualisation", disclosureLabel: null })).toThrow(/CHECK/);
    expect(() => insertVersion(db, a, c, asset, { treatment: "visualisation", disclosureLabel: "Illustrative" })).toThrow(/CHECK/);
  });

  test("enhancement carrying a visualisation label is rejected", () => {
    expect(() => insertVersion(db, a, c, asset, { treatment: "enhancement", disclosureLabel: VISUALISATION_LABEL })).toThrow(/CHECK/);
  });

  test("labelled visualisation is accepted", () => {
    expect(() => insertVersion(db, a, c, asset, { treatment: "visualisation", disclosureLabel: VISUALISATION_LABEL })).not.toThrow();
  });
});

describe("AT-07 lifecycle mirrored by the database", () => {
  const allowed = new Set(allowedTransitions().map(([f, t]) => `${f}->${t}`));

  for (const from of ASSET_VERSION_STATES) {
    for (const to of ASSET_VERSION_STATES) {
      if (from === to) continue;
      const ok = allowed.has(`${from}->${to}`);
      test(`${ok ? "allows" : "rejects"} ${from} -> ${to}`, () => {
        const p = insertProperty(db, a);
        const c = insertCampaign(db, a, p);
        const asset = insertAsset(db, a, c, p);
        const approvedAt = from === "approved" ? new Date().toISOString() : null;
        const v = insertVersion(db, a, c, asset, { state: from, approvedAt });
        const update = () =>
          db.raw.run("UPDATE asset_versions SET state = ?, approved_at = COALESCE(approved_at, ?) WHERE id = ?", [to, new Date().toISOString(), v]);
        if (ok) expect(update).not.toThrow();
        else expect(update).toThrow();
      });
    }
  }

  test("approved requires an approval timestamp", () => {
    const p = insertProperty(db, a);
    const c = insertCampaign(db, a, p);
    const asset = insertAsset(db, a, c, p);
    const v = insertVersion(db, a, c, asset, { state: "needs_review" });
    expect(() => db.raw.run("UPDATE asset_versions SET state = 'approved' WHERE id = ?", [v])).toThrow(/CHECK/);
  });
});

describe("AT-18 approved versions are immutable in the database", () => {
  test("no column of an approved version can be updated", () => {
    const p = insertProperty(db, a);
    const c = insertCampaign(db, a, p);
    const asset = insertAsset(db, a, c, p);
    const v = insertVersion(db, a, c, asset, { state: "approved", approvedAt: new Date().toISOString() });
    expect(() => db.raw.run("UPDATE asset_versions SET text_content = 'changed' WHERE id = ?", [v])).toThrow(/version_immutable/);
    expect(() => db.raw.run("UPDATE asset_versions SET output_object_key = 'x' WHERE id = ?", [v])).toThrow(/version_immutable/);
  });

  test("versions awaiting review can be edited by the system", () => {
    const p = insertProperty(db, a);
    const c = insertCampaign(db, a, p);
    const asset = insertAsset(db, a, c, p);
    const v = insertVersion(db, a, c, asset, { state: "processing" });
    expect(() => db.raw.run("UPDATE asset_versions SET text_content = 'draft' WHERE id = ?", [v])).not.toThrow();
  });
});

describe("AT-22 brand settings schema (migration 0003)", () => {
  const setBrand = (t: Tenant, columns: Record<string, string | null> = {}) => {
    const names = ["organisation_id", "updated_at", ...Object.keys(columns)];
    db.raw.run(`INSERT INTO brand_settings (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`, [t.orgId, "now", ...Object.values(columns)]);
  };
  const insertLogo = (t: Tenant, logoId: string) =>
    db.raw.run(
      `INSERT INTO brand_logos (id, organisation_id, object_key, content_type, byte_size, width, height, original_filename, original_format, uploaded_by, created_at)
       VALUES (?, ?, ?, 'image/png', 10, 64, 64, 'logo.png', 'png', ?, 'now')`,
      [logoId, t.orgId, `org/${t.orgId}/logo/${logoId}`, t.userId],
    );

  test("adds logo and font tables, the current-logo pointer and the campaign snapshot", () => {
    const tables = (db.raw.query("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((t) => t.name);
    expect(tables).toContain("brand_logos");
    expect(tables).toContain("brand_fonts");
    const columns = (table: string) => (db.raw.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name);
    expect(columns("brand_settings")).toContain("logo_id");
    expect(columns("campaigns")).toContain("brand_snapshot_json");
  });

  test("an organisation's current logo must be one of its own logos", () => {
    setBrand(a);
    setBrand(b);
    insertLogo(a, "logo_a");
    insertLogo(b, "logo_b");
    db.raw.run("UPDATE brand_settings SET logo_id = 'logo_a' WHERE organisation_id = ?", [a.orgId]);
    expect(() => db.raw.run("UPDATE brand_settings SET logo_id = 'logo_b' WHERE organisation_id = ?", [a.orgId])).toThrow(/FOREIGN KEY/);
    expect(() => db.raw.run("UPDATE brand_settings SET logo_id = 'missing' WHERE organisation_id = ?", [a.orgId])).toThrow(/FOREIGN KEY/);
    expect(() => db.raw.run("INSERT INTO brand_settings (organisation_id, logo_id, updated_at) VALUES (?, 'logo_a', 'now') ON CONFLICT (organisation_id) DO UPDATE SET logo_id = excluded.logo_id", [b.orgId])).toThrow(/FOREIGN KEY/);
    expect((db.raw.query("SELECT logo_id FROM brand_settings WHERE organisation_id = ?").get(a.orgId) as { logo_id: string }).logo_id).toBe("logo_a");
  });

  test("a font upload must record who confirmed usage rights and when", () => {
    const insertFont = (confirmedBy: string | null, confirmedAt: string | null) =>
      db.raw.run(
        `INSERT INTO brand_fonts (id, organisation_id, label, object_key, format, original_format, byte_size, original_filename, uploaded_by,
           rights_confirmed_by, rights_confirmed_at, created_at)
         VALUES (?, ?, 'Font', 'k', 'ttf', 'woff2', 10, 'f.woff2', ?, ?, ?, 'now')`,
        [crypto.randomUUID(), a.orgId, a.userId, confirmedBy, confirmedAt],
      );
    expect(() => insertFont(null, "now")).toThrow(/NOT NULL/);
    expect(() => insertFont(a.userId, null)).toThrow(/NOT NULL/);
    insertFont(a.userId, "now");
    expect(() => db.raw.run("UPDATE brand_fonts SET format = 'woff2'")).toThrow(/CHECK/);
  });

  test("backfills every existing campaign with its own organisation's settings, without tone", () => {
    const files = migrationFiles();
    const index = files.indexOf("0003_brand_settings.sql");
    expect(index).toBeGreaterThan(0);
    const raw = new Database(":memory:", { strict: true });
    raw.exec("PRAGMA foreign_keys = ON;");
    for (const file of files.slice(0, index)) raw.exec(readFileSync(join(import.meta.dir, "../../migrations", file), "utf8"));
    const old = new SqliteD1(raw);
    const ta = insertTenant(old, "Agency A");
    const tb = insertTenant(old, "Agency B");
    raw.run(
      `INSERT INTO brand_settings (organisation_id, agency_name, primary_colour, secondary_colour, heading_font, tone_of_voice, contact_phone,
         contact_email, website, office_address, updated_at)
       VALUES (?, 'Orchard', '#112233', '#f6f1e8', 'Some Font', 'Warm', '01582 760000', 'hello@orchard.test', 'https://orchard.test', '1 High St', 'now')`,
      [ta.orgId],
    );
    raw.run("INSERT INTO brand_settings (organisation_id, agency_name, updated_at) VALUES (?, 'Birch', 'now')", [tb.orgId]);
    const ca = insertCampaign(old, ta, insertProperty(old, ta));
    const cb = insertCampaign(old, tb, insertProperty(old, tb));

    raw.exec(readFileSync(join(import.meta.dir, "../../migrations/0003_brand_settings.sql"), "utf8"));

    const snapshot = (id: string) => JSON.parse((raw.query("SELECT brand_snapshot_json AS j FROM campaigns WHERE id = ?").get(id) as { j: string }).j);
    expect(snapshot(ca)).toEqual({
      agencyName: "Orchard",
      contactPhone: "01582 760000",
      contactEmail: "hello@orchard.test",
      website: "https://orchard.test",
      officeAddress: "1 High St",
      primaryColour: "#112233",
      secondaryColour: "#f6f1e8",
      // Free-text font names were never used by the renderer; they are not font references.
      headingFont: null,
      bodyFont: null,
      logoId: null,
      preferredTemplates: {},
    });
    expect(snapshot(cb).agencyName).toBe("Birch");
    expect(snapshot(cb).primaryColour).toBeNull();
    expect(JSON.stringify(snapshot(ca))).not.toContain("Warm");
    expect((raw.query("SELECT preferred_templates_json AS j FROM brand_settings WHERE organisation_id = ?").get(ta.orgId) as { j: string }).j).toBe("{}");
    expect((raw.query("SELECT heading_font AS f FROM brand_settings WHERE organisation_id = ?").get(ta.orgId) as { f: string | null }).f).toBeNull();
    // The rebuilt profile keeps every value an organisation had saved.
    expect(raw.query("SELECT agency_name, primary_colour, secondary_colour, tone_of_voice, contact_phone, contact_email, website, office_address, logo_id FROM brand_settings WHERE organisation_id = ?").get(ta.orgId)).toEqual({
      agency_name: "Orchard",
      primary_colour: "#112233",
      secondary_colour: "#f6f1e8",
      tone_of_voice: "Warm",
      contact_phone: "01582 760000",
      contact_email: "hello@orchard.test",
      website: "https://orchard.test",
      office_address: "1 High St",
      logo_id: null,
    });
    expect(raw.query("SELECT COUNT(*) AS n FROM brand_settings").get()).toEqual({ n: 2 });
    // Rollback safety: the previous Worker version's brand query still runs against the new schema.
    expect(() =>
      raw
        .query("SELECT agency_name, tone_of_voice, contact_phone, contact_email, website, primary_colour, secondary_colour, heading_font, body_font, logo_media_key FROM brand_settings WHERE organisation_id = ?")
        .get(ta.orgId),
    ).not.toThrow();
    // New rows get the new default.
    const tc = insertTenant(old, "Agency C");
    raw.run("INSERT INTO brand_settings (organisation_id, updated_at) VALUES (?, 'now')", [tc.orgId]);
    expect((raw.query("SELECT preferred_templates_json AS j FROM brand_settings WHERE organisation_id = ?").get(tc.orgId) as { j: string }).j).toBe("{}");
  });
});

describe("schema works on Cloudflare D1, not only on SQLite", () => {
  // D1 rejects any LIKE or GLOB pattern longer than 50 bytes ("LIKE or GLOB pattern too complex").
  // bun:sqlite has no such limit, so a too-long pattern passes every other test and fails only when deployed.
  test("no LIKE or GLOB pattern in the schema exceeds D1's 50-byte limit", () => {
    const objects = db.raw.query("SELECT name, sql FROM sqlite_master WHERE sql IS NOT NULL").all() as Array<{ name: string; sql: string }>;
    const tooLong: string[] = [];
    for (const { name, sql } of objects) {
      for (const match of sql.matchAll(/\b(?:NOT\s+)?(?:GLOB|LIKE)\s+'((?:[^']|'')*)'/gi)) {
        if (new TextEncoder().encode(match[1]!).length > 50) tooLong.push(`${name}: ${match[1]}`);
      }
    }
    expect(tooLong).toEqual([]);
  });

  test("brand colours accept #RRGGBB in either case and nothing else", () => {
    const set = (column: string, value: string | null) =>
      db.raw.run(`INSERT INTO brand_settings (organisation_id, ${column}, updated_at) VALUES (?, ?, 'now') ON CONFLICT (organisation_id) DO UPDATE SET ${column} = excluded.${column}`, [a.orgId, value]);
    for (const column of ["primary_colour", "secondary_colour"]) {
      for (const good of ["#1d2433", "#F6F1E8", "#000000", "#aBcDeF", null]) expect(() => set(column, good)).not.toThrow();
      for (const bad of ["1d2433", "#1d243", "#1d24333", "#1d243g", "#1d2 33", "red", "", "##12345", "#12345\n"]) expect(() => set(column, bad)).toThrow(/CHECK/);
    }
  });
});
