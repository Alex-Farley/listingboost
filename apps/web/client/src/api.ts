export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

type Options = { method?: string; json?: unknown; form?: FormData };

/** Same-origin JSON API client. Adds the CSRF header the server requires for writes. */
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const method = options.method ?? (options.json !== undefined || options.form ? "POST" : "GET");
  const headers: Record<string, string> = {};
  if (method !== "GET") headers["X-ListingBoost-CSRF"] = "1";
  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  } else if (options.form) {
    body = options.form;
  }
  const response = await fetch(path, { method, headers, body, credentials: "same-origin" });
  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (data as { error?: { code?: string; message?: string; fields?: Record<string, string> } } | null)?.error;
    throw new ApiError(response.status, error?.code ?? "unknown_error", error?.message ?? "Something went wrong.", error?.fields ?? {});
  }
  return data as T;
}
