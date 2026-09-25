import type { z } from "zod";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
  }
}

export const notFound = () => new HttpError(404, "not_found", "Not found.");
export const unauthenticated = () => new HttpError(401, "unauthenticated", "Please sign in.");

export function validationError(fields: Record<string, string>): HttpError {
  return new HttpError(400, "validation_error", "Please check the highlighted fields.", fields);
}

export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const h = new Headers(headers);
  h.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers: h });
}

export function noContent(headers: HeadersInit = {}): Response {
  return new Response(null, { status: 204, headers });
}

export function errorResponse(error: HttpError): Response {
  const body: { code: string; message: string; fields?: Record<string, string> } = { code: error.code, message: error.message };
  if (error.fields) body.fields = error.fields;
  return json({ error: body }, error.status, error.headers);
}

export function internalErrorResponse(): Response {
  return json({ error: { code: "internal_error", message: "Something went wrong. Please try again." } }, 500);
}

const MAX_JSON_BYTES = 1_000_000;

export async function readJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("Content-Length") ?? "0");
  if (length > MAX_JSON_BYTES) throw new HttpError(413, "payload_too_large", "Request body is too large.");
  const type = request.headers.get("Content-Type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "unsupported_media_type", "Expected application/json.");
  }
  const text = await request.text();
  if (text.length > MAX_JSON_BYTES) throw new HttpError(413, "payload_too_large", "Request body is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_json", "Request body is not valid JSON.");
  }
}

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) fields[issue.path.join(".") || "_"] ??= issue.message;
  return fields;
}

export async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) throw validationError(fieldErrors(parsed.error));
  return parsed.data;
}

export function withApiHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  if (!headers.has("Content-Security-Policy")) {
    headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  }
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}
