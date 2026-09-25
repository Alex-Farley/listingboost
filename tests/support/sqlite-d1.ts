import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqlDatabase, SqlStatement, SqlValue } from "@listingboost/database";

const MIGRATIONS_DIR = join(import.meta.dir, "../../migrations");

class SqliteStatement implements SqlStatement {
  constructor(
    private readonly db: Database,
    private readonly sql: string,
    private readonly params: SqlValue[] = [],
  ) {}

  bind(...values: SqlValue[]): SqlStatement {
    for (const value of values) {
      // D1 rejects undefined; mirror that so bugs surface in tests.
      if (value === undefined) throw new TypeError("D1_TYPE_ERROR: undefined cannot be bound");
    }
    return new SqliteStatement(this.db, this.sql, values);
  }

  async first<T>(): Promise<T | null> {
    return (this.db.query(this.sql).get(...this.params) as T | null) ?? null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.db.query(this.sql).all(...this.params) as T[] };
  }

  async run() {
    return { meta: { changes: this.runSync() } };
  }

  runSync(): number {
    return this.db.query(this.sql).run(...this.params).changes;
  }
}

export class SqliteD1 implements SqlDatabase {
  constructor(readonly raw: Database) {}

  prepare(sql: string): SqlStatement {
    return new SqliteStatement(this.raw, sql);
  }

  async batch(statements: SqlStatement[]): Promise<unknown[]> {
    const run = this.raw.transaction(() => statements.map((s) => (s as SqliteStatement).runSync()));
    return run().map((changes) => ({ meta: { changes } }));
  }
}

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/** Fresh in-memory database with every migration applied, foreign keys on (as in D1). */
export function createTestDatabase(): SqliteD1 {
  const raw = new Database(":memory:", { strict: true });
  raw.exec("PRAGMA foreign_keys = ON;");
  for (const file of migrationFiles()) raw.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  return new SqliteD1(raw);
}
