import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, screen, signInAndOpen, waitFor, within } from "./harness";
import { createProperty, createTestApp, drainQueue, signUp, uploadPhoto, type TestApp } from "../support/app";
import { fakeProviders, permanent } from "../support/providers";

afterEach(cleanup);

let app: TestApp;
let fakes: ReturnType<typeof fakeProviders>;
let account: Awaited<ReturnType<typeof signUp>>;
let propertyId: string;

const POLL = { timeout: 8000 };

beforeEach(async () => {
  fakes = fakeProviders();
  app = createTestApp({ providers: fakes.registry });
  account = await signUp(app);
  propertyId = await createProperty(app, account.cookie, { title: "12 Orchard Way", bedrooms: 3 });
});

const open = (path = "") => signInAndOpen(app, account, `/app/listings/${propertyId}${path}`);

async function createAndGenerate() {
  await uploadPhoto(app, account.cookie, propertyId);
  await open();
  fireEvent.click(await screen.findByRole("button", { name: /create campaign/i }));
  fireEvent.click(await screen.findByRole("button", { name: /generate marketing/i }));
  // Each in-progress group shows "Generating".
  await screen.findAllByText(/generating/i);
  await drainQueue(app);
  // The page learns about finished jobs by polling, as it would in production.
  await waitFor(() => expect(screen.queryAllByText(/^Generating$/)).toHaveLength(0), POLL);
}

const card = (name: RegExp) => screen.getByRole("article", { name });

describe("campaign creation and generation progress", () => {
  test("a listing without photos explains what is needed", async () => {
    await open();
    expect(await screen.findByText(/add at least one photo/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /create campaign/i })).toBeNull();
  });

  test("creating a campaign shows the progress checklist", async () => {
    await uploadPhoto(app, account.cookie, propertyId);
    await open();
    fireEvent.click(await screen.findByRole("button", { name: /create campaign/i }));
    const progress = await screen.findByRole("list", { name: /campaign progress/i });
    expect(within(progress).getByText("Property information").parentElement?.textContent).toContain("✓");
    expect(within(progress).getByText("Enhanced images").parentElement?.textContent).toContain("○");
    expect(within(progress).getByText("Marketing pack").parentElement?.textContent).toContain("○");
  });

  test("generation progress updates until assets are ready for review", async () => {
    await createAndGenerate();
    const progress = await screen.findByRole("list", { name: /campaign progress/i });
    await waitFor(() => expect(within(progress).getByText("Enhanced images").parentElement?.textContent).toContain("Ready for review"), POLL);
  });

  test("unavailable generation is reported honestly, without a button that cannot work", async () => {
    app = createTestApp({ providers: {} });
    account = await signUp(app);
    propertyId = await createProperty(app, account.cookie, { title: "12 Orchard Way" });
    await uploadPhoto(app, account.cookie, propertyId);
    await open();
    fireEvent.click(await screen.findByRole("button", { name: /create campaign/i }));
    expect(await screen.findByText(/automatic generation isn't available yet/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /generate marketing/i })).toBeNull();
    expect(within(screen.getByRole("list", { name: /campaign progress/i })).getAllByText("Not available yet").length).toBeGreaterThan(0);
  });

  test("copy can be written by hand even when generation is unavailable", async () => {
    app = createTestApp({ providers: {} });
    account = await signUp(app);
    propertyId = await createProperty(app, account.cookie, { title: "12 Orchard Way" });
    await uploadPhoto(app, account.cookie, propertyId);
    await open();
    fireEvent.click(await screen.findByRole("button", { name: /create campaign/i }));
    await screen.findByRole("list", { name: /campaign progress/i });
    fireEvent.click(within(screen.getByRole("navigation", { name: "Listing" })).getByRole("link", { name: "Social Posts" }));
    const headline = await screen.findByRole("article", { name: /headline/i });
    fireEvent.click(within(headline).getByRole("button", { name: /edit text/i }));
    fireEvent.change(within(card(/headline/i)).getByRole("textbox"), { target: { value: "A home to fall in love with" } });
    fireEvent.click(within(card(/headline/i)).getByRole("button", { name: /save as new version/i }));
    await waitFor(() => expect(within(card(/headline/i)).getByText("A home to fall in love with")).toBeTruthy());
    expect(within(card(/headline/i)).getByText(/ready for review/i)).toBeTruthy();
  });
});

describe("asset review", () => {
  test("enhanced photos appear on the Images tab and can be approved", async () => {
    await createAndGenerate();
    fireEvent.click(await screen.findByRole("link", { name: "Images" }));
    const photo = await screen.findByRole("article", { name: /enhanced photo 1/i });
    expect(within(photo).getByRole("img")).toBeTruthy();
    expect(within(photo).getByText(/ready for review/i)).toBeTruthy();
    fireEvent.click(within(photo).getByRole("button", { name: /approve/i }));
    await waitFor(() => expect(within(card(/enhanced photo 1/i)).getByText(/^approved$/i)).toBeTruthy());
    expect(within(card(/enhanced photo 1/i)).queryByRole("button", { name: /approve/i })).toBeNull();
  });

  test("copy can be edited as a new version, with warnings for unsupported claims", async () => {
    await createAndGenerate();
    fireEvent.click(await screen.findByRole("link", { name: "Social Posts" }));
    const headline = await screen.findByRole("article", { name: /headline/i });
    fireEvent.click(within(headline).getByRole("button", { name: /edit text/i }));
    fireEvent.change(within(card(/headline/i)).getByRole("textbox"), { target: { value: "Four bedroom home with sea views" } });
    fireEvent.click(within(card(/headline/i)).getByRole("button", { name: /save as new version/i }));
    expect(await screen.findByText(/not supported by the recorded facts/i)).toBeTruthy();
    await waitFor(() => expect(within(card(/headline/i)).getByText("Four bedroom home with sea views")).toBeTruthy());
    expect(within(card(/headline/i)).getByText(/version 2/i)).toBeTruthy();
  });

  test("regenerating keeps the earlier version in the history", async () => {
    await createAndGenerate();
    fireEvent.click(await screen.findByRole("link", { name: "Social Posts" }));
    const cta = await screen.findByRole("article", { name: /call to action/i });
    fireEvent.click(within(cta).getByRole("button", { name: /regenerate/i }));
    await waitFor(() => expect(within(card(/call to action/i)).getByText(/generating/i)).toBeTruthy());
    await drainQueue(app);
    await waitFor(() => expect(within(card(/call to action/i)).getByText(/version 2/i)).toBeTruthy(), POLL);
    fireEvent.click(within(card(/call to action/i)).getByText(/version history/i));
    expect(within(card(/call to action/i)).getByText(/version 1/i)).toBeTruthy();
  });

  test("failed assets show a plain explanation and can be retried", async () => {
    fakes.renderer.script = [permanent(), permanent(), permanent()];
    await createAndGenerate();
    fireEvent.click(await screen.findByRole("link", { name: "Stories" }));
    const story = await screen.findByRole("article", { name: /story/i });
    await waitFor(() => expect(within(story).getByText(/couldn't generate this asset/i)).toBeTruthy(), POLL);
    expect(within(story).queryByText(/sk-live-secret/)).toBeNull();
    expect(within(story).getByRole("button", { name: /regenerate/i })).toBeTruthy();
  });
});

describe("marketing pack tab", () => {
  test("download becomes available once something is approved", async () => {
    await createAndGenerate();
    fireEvent.click(await screen.findByRole("link", { name: "Marketing Pack" }));
    expect(await screen.findByText(/approve at least one asset/i)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /download marketing pack/i })).toBeNull();

    fireEvent.click(screen.getByRole("link", { name: "Reels" }));
    const reel = await screen.findByRole("article", { name: /reel/i });
    fireEvent.click(within(reel).getByRole("button", { name: /approve/i }));
    await waitFor(() => expect(within(card(/reel/i)).getByText(/^approved$/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("link", { name: "Marketing Pack" }));
    const link = (await screen.findByRole("link", { name: /download marketing pack/i })) as HTMLAnchorElement;
    const campaignId = (app.db.raw.query("SELECT id FROM campaigns").get() as { id: string }).id;
    expect(link.getAttribute("href")).toBe(`/api/campaigns/${campaignId}/pack`);
    expect(screen.getByText(/1 approved asset/i)).toBeTruthy();
  });
});
