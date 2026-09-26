import { base64url, fromBase64url, hmacSha256, timingSafeEqual } from "../auth/crypto";

export type FileKind = "source" | "output";
export type Disposition = "inline" | "attachment";

export const SIGNED_URL_TTL_SECONDS = 15 * 60;

const message = (kind: FileKind, id: string, exp: number, disposition: Disposition) => `v1|${kind}|${id}|${exp}|${disposition}`;

/** Only call after a tenant-scoped lookup has proven the caller may read this file. */
export async function signFileUrl(
  secret: string,
  file: { kind: FileKind; id: string; disposition: Disposition },
  now: Date,
): Promise<{ url: string; expiresAt: string }> {
  const exp = Math.floor(now.getTime() / 1000) + SIGNED_URL_TTL_SECONDS;
  const sig = base64url(await hmacSha256(secret, message(file.kind, file.id, exp, file.disposition)));
  const query = new URLSearchParams({ exp: String(exp), disp: file.disposition, sig });
  return { url: `/api/files/${file.kind}/${file.id}?${query}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export async function verifyFileSignature(
  secret: string,
  kind: FileKind,
  id: string,
  params: URLSearchParams,
  now: Date,
): Promise<Disposition | null> {
  const exp = Number(params.get("exp"));
  const disposition = params.get("disp");
  const sig = fromBase64url(params.get("sig") ?? "");
  if (!Number.isInteger(exp) || (disposition !== "inline" && disposition !== "attachment") || !sig || sig.length !== 32) return null;
  if (exp < Math.floor(now.getTime() / 1000) || exp > Math.floor(now.getTime() / 1000) + SIGNED_URL_TTL_SECONDS) return null;
  const expected = await hmacSha256(secret, message(kind, id, exp, disposition));
  return timingSafeEqual(sig, expected) ? disposition : null;
}
