import { beforeEach, describe, expect, test } from "bun:test";
import { allowedTransitions, ASSET_VERSION_STATES, VISUALISATION_LABEL } from "@listingboost/domain";
import { createTestDatabase, type SqliteD1 } from "../support/sqlite-d1";
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
