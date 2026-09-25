/**
 * The subset of Cloudflare D1 that ListingBoost uses. D1Database satisfies it
 * structurally; tests provide a bun:sqlite implementation of the same port.
 */
export type SqlValue = string | number | null;

export interface SqlRunResult {
  meta: { changes: number };
}

export interface SqlStatement {
  bind(...values: SqlValue[]): SqlStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<SqlRunResult>;
}

export interface SqlDatabase {
  prepare(sql: string): SqlStatement;
  /** Executes all statements atomically (D1 batch semantics). */
  batch(statements: SqlStatement[]): Promise<unknown[]>;
}
