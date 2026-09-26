import type { SqlDatabase } from "./sql";

export async function rateLimitCount(db: SqlDatabase, key: string, windowStart: number): Promise<number> {
  const row = await db
    .prepare("SELECT count FROM rate_limits WHERE key = ? AND window_start = ?")
    .bind(key, windowStart)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function incrementRateLimit(db: SqlDatabase, key: string, windowStart: number): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(key, windowStart)
    .first<{ count: number }>();
  return row?.count ?? 1;
}
