/**
 * One-time reset of a D1 database that still holds the pre-rebuild prototype
 * schema (docs/DECISIONS.md D-014/D-015). It only acts when the applied
 * migration history consists solely of known prototype migrations; any other
 * state aborts without changes. A full SQL export is written before dropping.
 *
 * CLI: bun scripts/deploy/legacy-d1.ts --config <wrangler.json> (--remote | --local) [--backup <file.sql>] [--apply | --fail-on-legacy]
 * Without --apply it only reports what it would do; --fail-on-legacy exits 1
 * instead (used for production, which is never reset automatically).
 */
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const LEGACY_MIGRATIONS = [
  "0001_init.sql",
  "0002_campaigns.sql",
  "0003_campaign_media.sql",
  "0004_owned_media_ownership.sql",
  "0005_listingboost_identity.sql",
  "0006_better_auth.sql",
  "0006_generation_jobs.sql",
  "0007_generation_request.sql",
] as const;

export type HistoryClass = "legacy" | "current" | "empty" | "unknown";

/** `known` is the list of migration files in this repository's migrations/ directory. */
export function classifyMigrationHistory(input: { migrationsTable: boolean; applied: string[]; otherTables: number; known: readonly string[] }): HistoryClass {
  if (!input.migrationsTable || input.applied.length === 0) return input.otherTables === 0 ? "empty" : "unknown";
  const legacy = new Set<string>(LEGACY_MIGRATIONS);
  if (input.applied.every((name) => legacy.has(name))) return "legacy";
  const known = new Set(input.known);
  return input.applied.every((name) => known.has(name)) ? "current" : "unknown";
}

export type SchemaObject = { name: string; type: string; sql?: string | null };

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
const isInternal = (name: string) => name.startsWith("sqlite_") || name.startsWith("_cf_");

function referencedTables(sql: string | null | undefined): Set<string> {
  const names = new Set<string>();
  for (const m of (sql ?? "").matchAll(/REFERENCES\s+(?:"((?:[^"]|"")+)"|`([^`]+)`|\[([^\]]+)\]|([A-Za-z_][A-Za-z0-9_]*))/gi)) {
    names.add((m[1]?.replace(/""/g, '"') ?? m[2] ?? m[3] ?? m[4])!);
  }
  return names;
}

/**
 * Dropping a table runs an implicit DELETE whose foreign-key handling needs
 * every table it (or its children) references to still exist. Tables are
 * grouped into strongly connected components (reference cycles) and a group
 * is dropped only once no other remaining group references it.
 */
function childrenFirst(tables: readonly SchemaObject[]): SchemaObject[] {
  const names = new Set(tables.map((t) => t.name));
  const edges = new Map(tables.map((t) => [t.name, [...referencedTables(t.sql)].filter((r) => names.has(r) && r !== t.name)]));

  // Tarjan's algorithm.
  let counter = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const componentOf = new Map<string, number>();
  const components: string[][] = [];
  const visit = (v: string) => {
    index.set(v, counter);
    low.set(v, counter++);
    stack.push(v);
    onStack.add(v);
    for (const w of edges.get(v)!) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, index.get(w)!));
      }
    }
    if (low.get(v) === index.get(v)) {
      const component: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        componentOf.set(w, components.length);
        component.push(w);
      } while (w !== v);
      components.push(component);
    }
  };
  for (const t of tables) if (!index.has(t.name)) visit(t.name);

  const remaining = new Set(components.map((_, i) => i));
  const referencedBy = (c: number) =>
    [...remaining].some((other) => other !== c && components[other]!.some((n) => edges.get(n)!.some((r) => componentOf.get(r) === c)));
  const byName = new Map(tables.map((t) => [t.name, t]));
  const ordered: SchemaObject[] = [];
  while (remaining.size > 0) {
    const next = [...remaining].find((c) => !referencedBy(c))!;
    remaining.delete(next);
    const members = new Set(components[next]);
    ordered.push(...tables.filter((t) => members.has(t.name)).map((t) => byName.get(t.name)!));
  }
  return ordered;
}

export function dropAllSql(objects: readonly SchemaObject[]): string {
  const keep = objects.filter((o) => !isInternal(o.name));
  const lines = [
    "PRAGMA defer_foreign_keys = true;",
    ...keep.filter((o) => o.type === "view").map((o) => `DROP VIEW IF EXISTS ${quote(o.name)};`),
    ...childrenFirst(keep.filter((o) => o.type === "table")).map((o) => `DROP TABLE IF EXISTS ${quote(o.name)};`),
  ];
  return `${lines.join("\n")}\n`;
}

// ── CLI ───────────────────────────────────────────────────────────────

type Target = "--remote" | "--local";

async function wrangler(args: string[]): Promise<string> {
  const proc = Bun.spawn(["bunx", "wrangler", ...args], { stdout: "pipe", stderr: "pipe", env: { ...process.env, CI: "1" } });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) throw new Error(`wrangler ${args.slice(0, 3).join(" ")} failed (${code}): ${stderr || stdout}`);
  return stdout;
}

async function query<T>(config: string, target: Target, sql: string): Promise<T[]> {
  const out = await wrangler(["d1", "execute", "DB", "--config", config, target, "--json", "--command", sql]);
  const parsed = JSON.parse(out.slice(out.indexOf("["))) as Array<{ results: T[] }>;
  return parsed.flatMap((r) => r.results);
}

async function main() {
  const args = process.argv.slice(2);
  const config = resolve(args[args.indexOf("--config") + 1] ?? "");
  const target: Target = args.includes("--local") ? "--local" : "--remote";
  const apply = args.includes("--apply");
  const backupArg = args.includes("--backup") ? args[args.indexOf("--backup") + 1] : undefined;
  if (!args.includes("--config")) throw new Error("--config is required");

  const objects = await query<SchemaObject>(config, target, "SELECT name, type, sql FROM sqlite_master WHERE type IN ('table', 'view')");
  const migrationsTable = objects.some((o) => o.name === "d1_migrations");
  const applied = migrationsTable ? (await query<{ name: string }>(config, target, "SELECT name FROM d1_migrations ORDER BY id")).map((r) => r.name) : [];
  const otherTables = objects.filter((o) => o.type === "table" && o.name !== "d1_migrations" && !isInternal(o.name)).length;
  const known = readdirSync(resolve(import.meta.dir, "../../migrations")).filter((f) => f.endsWith(".sql"));
  const state = classifyMigrationHistory({ migrationsTable, applied, otherTables, known });
  console.log(`D1 state: ${state} (applied: ${applied.join(", ") || "none"}; tables: ${otherTables})`);

  if (state === "unknown") {
    console.error("Refusing to touch a database whose migration history is neither the prototype's nor this repository's.");
    process.exit(1);
  }
  if (state !== "legacy") return;
  if (args.includes("--fail-on-legacy")) {
    console.error("Prototype schema found. This environment is never reset automatically; an explicit decision is required.");
    process.exit(1);
  }
  if (!apply) {
    console.log("Prototype schema found. Re-run with --apply to back it up and drop it.");
    return;
  }
  const backup = resolve(backupArg ?? join(dirname(config), `legacy-d1-backup-${Date.now()}.sql`));
  await wrangler(["d1", "export", "DB", "--config", config, target, "--output", backup]);
  console.log(`Backup written to ${backup}`);
  const dropFile = join(mkdtempSync(join(tmpdir(), "lb-d1-")), "drop.sql");
  writeFileSync(dropFile, dropAllSql(objects));
  await wrangler(["d1", "execute", "DB", "--config", config, target, "--yes", "--file", dropFile]);
  console.log(`Dropped ${objects.filter((o) => !isInternal(o.name)).length} prototype tables/views.`);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
