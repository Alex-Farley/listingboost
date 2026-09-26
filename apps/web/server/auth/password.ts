import { base64url, fromBase64url, timingSafeEqual } from "./crypto";

// 100 000 is the maximum PBKDF2 iteration count Cloudflare Workers allows.
const ITERATIONS = 100_000;
const PREFIX = "pbkdf2-sha256";

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `${PREFIX}$${ITERATIONS}$${base64url(salt)}$${base64url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [prefix, iterationsText, saltText, hashText] = stored.split("$");
  const iterations = Number(iterationsText);
  const salt = fromBase64url(saltText ?? "");
  const expected = fromBase64url(hashText ?? "");
  if (prefix !== PREFIX || !Number.isInteger(iterations) || iterations < 1 || iterations > ITERATIONS || !salt || !expected) return false;
  return timingSafeEqual(await derive(password, salt, iterations), expected);
}

// Used when the email is unknown so both failure paths cost the same.
let dummyHash: Promise<string> | null = null;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("listingboost-timing-equaliser");
  await verifyPassword(password, await dummyHash);
}
