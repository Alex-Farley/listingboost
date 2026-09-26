import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { classifyMigrationHistory, dropAllSql, LEGACY_MIGRATIONS } from "../../scripts/deploy/legacy-d1";

const known = readdirSync(join(import.meta.dir, "../../migrations")).filter((f) => f.endsWith(".sql"));

describe("legacy preview D1 reset safety", () => {
  test("knows the prototype's migrations", () => {
    expect(LEGACY_MIGRATIONS).toContain("0001_init.sql");
    expect(LEGACY_MIGRATIONS).toContain("0007_generation_request.sql");
    expect(LEGACY_MIGRATIONS).not.toContain("0001_initial.sql");
  });

  test("only a pure prototype history is classified as legacy", () => {
    expect(classifyMigrationHistory({ migrationsTable: true, applied: ["0001_init.sql", "0002_campaigns.sql"], otherTables: 5, known })).toBe("legacy");
    expect(classifyMigrationHistory({ migrationsTable: true, applied: ["0001_initial.sql", "0002_default_templates.sql"], otherTables: 15, known })).toBe("current");
    expect(classifyMigrationHistory({ migrationsTable: false, applied: [], otherTables: 0, known })).toBe("empty");
    expect(classifyMigrationHistory({ migrationsTable: true, applied: [], otherTables: 0, known })).toBe("empty");
  });

  test("anything unexpected is refused", () => {
    expect(classifyMigrationHistory({ migrationsTable: true, applied: ["0001_init.sql", "0001_initial.sql"], otherTables: 9, known })).toBe("unknown");
    expect(classifyMigrationHistory({ migrationsTable: true, applied: ["0099_mystery.sql"], otherTables: 1, known })).toBe("unknown");
    expect(classifyMigrationHistory({ migrationsTable: false, applied: [], otherTables: 3, known })).toBe("unknown");
  });

  test("drop SQL removes views and tables but never SQLite or Cloudflare internals", () => {
    const sql = dropAllSql([
      { name: "campaigns", type: "table" },
      { name: "user", type: "table" },
      { name: "d1_migrations", type: "table" },
      { name: "recent", type: "view" },
      { name: "sqlite_sequence", type: "table" },
      { name: "_cf_KV", type: "table" },
    ]);
    expect(sql).toBe(
      [
        "PRAGMA defer_foreign_keys = true;",
        'DROP VIEW IF EXISTS "recent";',
        'DROP TABLE IF EXISTS "campaigns";',
        'DROP TABLE IF EXISTS "user";',
        'DROP TABLE IF EXISTS "d1_migrations";',
        "",
      ].join("\n"),
    );
  });

  test("tables are dropped children-first so foreign keys never point at a dropped parent", () => {
    const sql = dropAllSql([
      { name: "campaigns", type: "table", sql: "CREATE TABLE campaigns (id TEXT PRIMARY KEY)" },
      { name: "campaign_media", type: "table", sql: "CREATE TABLE campaign_media (campaign_id TEXT, FOREIGN KEY (campaign_id) REFERENCES campaigns(id))" },
      { name: "user", type: "table", sql: "CREATE TABLE user (id TEXT)" },
      { name: "session", type: "table", sql: 'CREATE TABLE session (userId TEXT NOT NULL REFERENCES "user"(id))' },
      { name: "campaign_assets", type: "table", sql: "CREATE TABLE campaign_assets (campaign_id TEXT REFERENCES campaigns (id))" },
    ]);
    const order = [...sql.matchAll(/DROP TABLE IF EXISTS "([^"]+)"/g)].map((m) => m[1]!);
    expect(order.indexOf("campaign_media")).toBeLessThan(order.indexOf("campaigns"));
    expect(order.indexOf("campaign_assets")).toBeLessThan(order.indexOf("campaigns"));
    expect(order.indexOf("session")).toBeLessThan(order.indexOf("user"));
    expect(order).toHaveLength(5);
  });

  test("tables in a reference cycle are dropped before the tables the cycle references", () => {
    // The prototype schema: campaign_assets <-> generation_jobs, both -> campaigns.
    const sql = dropAllSql([
      { name: "campaigns", type: "table", sql: "CREATE TABLE campaigns (id TEXT PRIMARY KEY)" },
      { name: "campaign_assets", type: "table", sql: "CREATE TABLE campaign_assets (c TEXT REFERENCES campaigns(id), j TEXT REFERENCES generation_jobs(id))" },
      { name: "generation_jobs", type: "table", sql: "CREATE TABLE generation_jobs (c TEXT REFERENCES campaigns(id), a TEXT REFERENCES campaign_assets(id))" },
    ]);
    const order = [...sql.matchAll(/DROP TABLE IF EXISTS "([^"]+)"/g)].map((m) => m[1]!);
    expect(order[2]).toBe("campaigns");
    expect(order.slice(0, 2).sort()).toEqual(["campaign_assets", "generation_jobs"]);
  });

  test("object names are quoted safely", () => {
    expect(dropAllSql([{ name: 'we"ird', type: "table" }])).toContain('DROP TABLE IF EXISTS "we""ird";');
  });
});
