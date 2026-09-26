import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, renderApp, fireEvent, screen, waitFor, within } from "./harness";
import { createProperty, createTestApp, signUp, type TestApp } from "../support/app";
import { fixture } from "../support/fixtures";

afterEach(cleanup);

let app: TestApp;
let account: Awaited<ReturnType<typeof signUp>>;
let propertyId: string;

beforeEach(async () => {
  app = createTestApp();
  account = await signUp(app);
  propertyId = await createProperty(app, account.cookie, { title: "Photo House" });
});

async function openImages() {
  const ui = renderApp("/signin", app);
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: account.email } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: account.password } });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
  await waitFor(() => expect(ui.router.state.location.pathname).toBe("/app/listings"));
  await ui.router.navigate(`/app/listings/${propertyId}/images`);
  // Navigation and the property load render asynchronously.
  await screen.findByLabelText(/add photos/i);
  return ui;
}

function choose(files: File[]) {
  const input = screen.getByLabelText(/add photos/i) as HTMLInputElement;
  Object.defineProperty(input, "files", { value: files, configurable: true });
  fireEvent.change(input);
}

const photo = (name: string, file = "photo-800x600.jpg", type = "image/jpeg") => new File([fixture(file)], name, { type });
const tiles = () => screen.getAllByRole("listitem").filter((li) => li.getAttribute("data-media-id"));

describe("AT-05 photo management through the UI", () => {
  test("uploads photos; the first is primary", async () => {
    await openImages();
    choose([photo("lounge.jpg"), photo("kitchen.png", "photo-800x600.png", "image/png")]);
    await waitFor(() => expect(tiles()).toHaveLength(2));
    expect(within(tiles()[0]!).getByText(/primary/i)).toBeTruthy();
    expect(within(tiles()[1]!).queryByText(/^primary$/i)).toBeNull();
    expect(app.store.objects.size).toBe(2);
  });

  test("rejected files show the server's reason and are not added", async () => {
    await openImages();
    choose([photo("tiny.jpg", "too-small-300x200.jpg")]);
    expect(await screen.findByText(/tiny\.jpg: photos must be at least 400 pixels/i)).toBeTruthy();
    expect(tiles()).toHaveLength(0);
  });

  test("reorder, choose primary and delete", async () => {
    await openImages();
    choose([photo("a.jpg")]);
    await waitFor(() => expect(tiles()).toHaveLength(1));
    choose([photo("b.png", "photo-800x600.png", "image/png")]);
    await waitFor(() => expect(tiles()).toHaveLength(2));
    const [first, second] = tiles();
    const secondId = second!.getAttribute("data-media-id");

    fireEvent.click(within(second!).getByRole("button", { name: /move earlier/i }));
    await waitFor(() => expect(tiles()[0]!.getAttribute("data-media-id")).toBe(secondId));

    fireEvent.click(within(tiles()[0]!).getByRole("button", { name: /make primary/i }));
    await waitFor(() => expect(within(tiles()[0]!).getByText(/^primary$/i)).toBeTruthy());

    globalThis.confirm = () => true;
    fireEvent.click(within(tiles()[1]!).getByRole("button", { name: /delete/i }));
    await waitFor(() => expect(tiles()).toHaveLength(1));
    expect(tiles()[0]!.getAttribute("data-media-id")).toBe(secondId);
    expect(first).toBeTruthy();
    expect((app.db.raw.query("SELECT COUNT(*) AS n FROM property_media").get() as { n: number }).n).toBe(1);
  });
});
