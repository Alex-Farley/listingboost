import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, renderApp, type Ui, fireEvent, screen, waitFor, within } from "./harness";
import { createProperty, createTestApp, signUp, type TestApp } from "../support/app";

afterEach(cleanup);

let app: TestApp;
let account: Awaited<ReturnType<typeof signUp>>;

async function signedIn(path: string): Promise<Ui> {
  const ui = renderApp("/signin", app);
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: account.email } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: account.password } });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
  await waitFor(() => expect(ui.router.state.location.pathname).toBe("/app/listings"));
  await ui.router.navigate(path);
  // Navigation renders asynchronously; wait for the app shell before interacting.
  await screen.findByRole("navigation", { name: "Main" });
  return ui;
}

const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(async () => {
  app = createTestApp();
  account = await signUp(app, { agencyName: "Orchard Estates" });
});

describe("AT-03 new listing through the UI", () => {
  test("creates a property from manual entry and opens its workspace", async () => {
    const { router } = await signedIn("/app/listings/new");
    await screen.findByLabelText(/first line of address/i);
    type(/first line of address/i, "12 Orchard Way");
    type(/town/i, "Harpenden");
    type(/postcode/i, "al5 2ab");
    fireEvent.change(screen.getByLabelText(/property type/i), { target: { value: "semi_detached" } });
    type(/bedrooms/i, "3");
    type(/key features/i, "Open-plan kitchen\nSouth-facing garden");
    fireEvent.click(screen.getByRole("button", { name: /create listing/i }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/app\/listings\/[0-9a-f-]{36}$/));
    expect(await screen.findByRole("heading", { name: "12 Orchard Way, Harpenden" })).toBeTruthy();
    const row = app.db.raw.query("SELECT postcode, bedrooms, bathrooms, key_features_json FROM properties").get();
    expect(row).toEqual({ postcode: "AL5 2AB", bedrooms: 3, bathrooms: null, key_features_json: '["Open-plan kitchen","South-facing garden"]' });
  });

  test("server validation errors appear next to the fields", async () => {
    await signedIn("/app/listings/new");
    await screen.findByLabelText(/first line of address/i);
    type(/first line of address/i, "12 Orchard Way");
    type(/postcode/i, "nope");
    fireEvent.click(screen.getByRole("button", { name: /create listing/i }));
    expect(await screen.findByText(/valid uk postcode/i)).toBeTruthy();
    expect((app.db.raw.query("SELECT COUNT(*) AS n FROM properties").get() as { n: number }).n).toBe(0);
  });
});

describe("My Listings", () => {
  test("lists the organisation's properties and searches them", async () => {
    await createProperty(app, account.cookie, { title: "Riverside Cottage", postcode: "RG9 1AA" });
    await createProperty(app, account.cookie, { title: "Town Flat", postcode: "LU1 1AA" });
    await signedIn("/app/listings");
    expect(await screen.findByText("Riverside Cottage")).toBeTruthy();
    expect(screen.getByText("Town Flat")).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: /search listings/i }), { target: { value: "riverside" } });
    await waitFor(() => expect(screen.queryByText("Town Flat")).toBeNull());
    expect(screen.getByText("Riverside Cottage")).toBeTruthy();
  });

  test("shows a helpful empty state", async () => {
    await signedIn("/app/listings");
    expect(await screen.findByText(/no listings yet/i)).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /new listing/i }).length).toBeGreaterThan(0);
  });
});

describe("listing overview", () => {
  test("unknown facts are shown as not recorded, never guessed", async () => {
    const id = await createProperty(app, account.cookie, { title: "Plain House" });
    await signedIn(`/app/listings/${id}`);
    const facts = await screen.findByRole("region", { name: /property facts/i });
    expect(within(facts).getByText("Bedrooms").nextSibling?.textContent).toBe("Not recorded");
    expect(within(facts).getByText("Tenure").nextSibling?.textContent).toBe("Not recorded");
  });

  test("editing facts saves them", async () => {
    const id = await createProperty(app, account.cookie, { title: "Plain House" });
    await signedIn(`/app/listings/${id}`);
    fireEvent.click(await screen.findByRole("button", { name: /edit facts/i }));
    type(/bedrooms/i, "4");
    fireEvent.change(screen.getByLabelText(/tenure/i), { target: { value: "freehold" } });
    fireEvent.click(screen.getByRole("button", { name: /save facts/i }));
    const facts = await screen.findByRole("region", { name: /property facts/i });
    await waitFor(() => expect(within(facts).getByText("Bedrooms").nextSibling?.textContent).toBe("4"));
    expect(app.db.raw.query("SELECT bedrooms, tenure FROM properties WHERE id = ?").get(id)).toEqual({ bedrooms: 4, tenure: "freehold" });
  });

  test("another organisation's listing shows not found", async () => {
    const other = await signUp(app);
    const id = await createProperty(app, other.cookie, { title: "Secret House" });
    await signedIn(`/app/listings/${id}`);
    expect(await screen.findByText(/listing not found/i)).toBeTruthy();
    expect(screen.queryByText("Secret House")).toBeNull();
  });
});
