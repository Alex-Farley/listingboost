import { z } from "zod";
import { base64url, fromBase64url } from "./auth/crypto";
import { HttpError } from "./http";

export type Cursor = { updatedAt: string; rowid: number };

const cursorSchema = z.object({ u: z.string().datetime(), r: z.number().int().positive() });

export function encodeCursor(cursor: Cursor | null): string | null {
  return cursor ? base64url(new TextEncoder().encode(JSON.stringify({ u: cursor.updatedAt, r: cursor.rowid }))) : null;
}

export function decodeCursor(value: string | null): Cursor | undefined {
  if (!value) return undefined;
  const bytes = fromBase64url(value);
  try {
    const parsed = cursorSchema.parse(JSON.parse(new TextDecoder().decode(bytes ?? new Uint8Array())));
    return { updatedAt: parsed.u, rowid: parsed.r };
  } catch {
    throw new HttpError(400, "invalid_cursor", "The page cursor is invalid.");
  }
}

export function parseLimit(value: string | null, fallback = 20, max = 50): number {
  if (value === null) return fallback;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > max) {
    throw new HttpError(400, "validation_error", `limit must be between 1 and ${max}.`, { limit: `Must be between 1 and ${max}` });
  }
  return limit;
}
