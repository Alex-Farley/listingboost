/**
 * UI tests render the real client against the real in-process API and SQLite
 * database. Only the network hop is replaced: browser fetch() is routed into
 * the Worker's fetch handler with a cookie jar, as a same-origin browser would.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { expect } from "bun:test";
import { APP_ORIGIN, createTestApp, type TestApp } from "../support/app";

const bun = {
  Request,
  Response,
  Headers,
  FormData,
  File,
  Blob,
  ReadableStream,
  URL,
  URLSearchParams,
  AbortController,
  TextEncoder,
  TextDecoder,
};

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: `${APP_ORIGIN}/` });
// Keep Bun's fetch primitives so server code under test runs exactly as in production.
Object.assign(globalThis, bun);

const { render, cleanup, act, configure, fireEvent, screen, waitFor, within } = await import("@testing-library/react");
// CI runners are slower than workstations; route changes plus API round-trips can exceed the 1s default.
configure({ asyncUtilTimeout: 5000 });
const { createMemoryRouter, RouterProvider } = await import("react-router");
const { routes } = await import("../../apps/web/client/src/routes");
const { SessionProvider } = await import("../../apps/web/client/src/session");

export function browserFetchFor(app: TestApp): typeof fetch {
  const jar = new Map<string, string>();
  const browserFetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url, `${APP_ORIGIN}/`);
    const headers = new Headers(init.headers);
    if (jar.size) headers.set("Cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
    const method = (init.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") headers.set("Origin", APP_ORIGIN);
    const response = await app.fetch(new Request(url, { ...init, headers }));
    const setCookie = response.headers.get("Set-Cookie");
    if (setCookie) {
      const [pair] = setCookie.split(";");
      const [name, value] = pair!.split("=");
      if (/Max-Age=0/i.test(setCookie) || !value) jar.delete(name!.trim());
      else jar.set(name!.trim(), value);
    }
    return response;
  };
  return browserFetch as typeof fetch;
}

export type Ui = { app: TestApp; router: ReturnType<typeof createMemoryRouter> };

export function renderApp(path: string, app: TestApp = createTestApp()): Ui {
  globalThis.fetch = browserFetchFor(app);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>,
  );
  return { app, router };
}

/** Signs in through the real sign-in page, then navigates and waits for the app shell. */
export async function signInAndOpen(app: TestApp, credentials: { email: string; password: string }, path: string): Promise<Ui> {
  const ui = renderApp("/signin", app);
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: credentials.email } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: credentials.password } });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
  await waitFor(() => expect(ui.router.state.location.pathname).toBe("/app/listings"));
  await ui.router.navigate(path);
  // Wait for the target route itself, not just the shell that the previous page also rendered.
  await waitFor(() => {
    expect(ui.router.state.location.pathname).toBe(path);
    expect(ui.router.state.navigation.state).toBe("idle");
  });
  await screen.findByRole("navigation", { name: "Main" });
  return ui;
}

export { act, cleanup, fireEvent, screen, waitFor, within };
