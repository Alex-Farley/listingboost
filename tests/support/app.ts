import { createApp, type AppContext } from "../../apps/web/server/app";
import { MemoryObjectStore } from "./memory-store";
import { createTestDatabase, type SqliteD1 } from "./sqlite-d1";

export const APP_ORIGIN = "https://app.listingboost.test";

export type TestApp = {
  db: SqliteD1;
  store: MemoryObjectStore;
  ctx: AppContext;
  clock: { offsetMs: number };
  request(path: string, init?: RequestInit & { cookie?: string; csrf?: boolean; origin?: string | null }): Promise<Response>;
};

export function createTestApp(overrides: Partial<AppContext> = {}): TestApp {
  const db = createTestDatabase();
  const store = new MemoryObjectStore();
  const clock = { offsetMs: 0 };
  const ctx: AppContext = {
    db,
    storage: store,
    config: { appOrigin: APP_ORIGIN, mediaSigningSecret: "test-signing-secret-please-change-0123456789" },
    now: () => new Date(Date.now() + clock.offsetMs),
    ...overrides,
  };
  const app = createApp(ctx);
  return {
    db,
    store,
    ctx,
    clock,
    async request(path, init = {}) {
      const { cookie, csrf = true, origin = APP_ORIGIN, ...rest } = init;
      const headers = new Headers(rest.headers);
      if (cookie) headers.set("Cookie", cookie);
      const method = (rest.method ?? "GET").toUpperCase();
      if (method !== "GET" && method !== "HEAD") {
        if (csrf) headers.set("X-ListingBoost-CSRF", "1");
        if (origin) headers.set("Origin", origin);
      }
      if (typeof rest.body === "string" && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
      const url = path.startsWith("http") ? path : `${APP_ORIGIN}${path}`;
      return app.fetch(new Request(url, { ...rest, headers }));
    },
  };
}

export function sessionCookie(response: Response): string {
  const header = response.headers.get("Set-Cookie") ?? "";
  const match = header.match(/(__Host-lb_session=[^;]*)/);
  if (!match) throw new Error(`No session cookie in response: ${header}`);
  return match[1]!;
}

let counter = 0;
export async function signUp(app: TestApp, overrides: Record<string, string> = {}) {
  const email = overrides.email ?? `agent${++counter}-${crypto.randomUUID().slice(0, 6)}@agency.test`;
  const body = { email, password: "correct horse battery staple", name: "Alex Agent", agencyName: "Orchard Estates", ...overrides };
  const response = await app.request("/api/auth/signup", { method: "POST", body: JSON.stringify(body) });
  if (response.status !== 201) throw new Error(`signup failed: ${response.status} ${await response.text()}`);
  const json = (await response.json()) as { user: { id: string; email: string }; organisation: { id: string; name: string } };
  return { ...json, cookie: sessionCookie(response), password: body.password, email };
}

export async function createProperty(app: TestApp, cookie: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const response = await app.request("/api/properties", {
    method: "POST",
    cookie,
    body: JSON.stringify({ title: "12 Orchard Way", addressLine1: "12 Orchard Way", postcode: "AL5 2AB", propertyType: "detached", ...overrides }),
  });
  if (response.status !== 201) throw new Error(`property create failed: ${response.status}`);
  return ((await response.json()) as { id: string }).id;
}

export function photoForm(bytes: Uint8Array<ArrayBuffer>, filename: string, type: string): FormData {
  const form = new FormData();
  form.append("file", new File([bytes], filename, { type }));
  return form;
}
