import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resetReelEncoder, setReelEncoder, type SlideshowPlan } from "../../apps/web/client/src/reel/encoder";
import { cleanup, fireEvent, screen, signInAndOpen, waitFor, within } from "./harness";
import { createProperty, createTestApp, signUp, uploadPhoto, type TestApp } from "../support/app";
import { videoFixture } from "../support/fixtures";

let app: TestApp;
let account: Awaited<ReturnType<typeof signUp>>;
let propertyId: string;
let photoIds: string[];

afterEach(() => {
  cleanup();
  resetReelEncoder();
});

beforeEach(async () => {
  // No server-side generation at all: the Reel is made in the browser.
  app = createTestApp();
  account = await signUp(app);
  propertyId = await createProperty(app, account.cookie, { title: "12 Orchard Way" });
  photoIds = [await uploadPhoto(app, account.cookie, propertyId), await uploadPhoto(app, account.cookie, propertyId, "photo-1080x1350.jpg")];
});

async function openReels() {
  await signInAndOpen(app, account, `/app/listings/${propertyId}`);
  fireEvent.click(await screen.findByRole("button", { name: /create campaign/i }));
  await screen.findByRole("list", { name: /campaign progress/i });
  fireEvent.click(within(screen.getByRole("navigation", { name: "Listing" })).getByRole("link", { name: "Reels" }));
  return screen.findByRole("article", { name: "Reel 9:16" });
}

describe("R7c slideshow Reel in the browser", () => {
  test("the progress checklist offers the Reel rather than calling it unavailable", async () => {
    await signInAndOpen(app, account, `/app/listings/${propertyId}`);
    fireEvent.click(await screen.findByRole("button", { name: /create campaign/i }));
    const progress = await screen.findByRole("list", { name: /campaign progress/i });
    expect(within(progress).getByText("Reel").parentElement?.textContent).not.toContain("Not available yet");
  });

  test("a browser that can't encode video says so, with no dead button", async () => {
    setReelEncoder({ supported: () => false, encode: () => Promise.reject(new Error("unreachable")) });
    const reel = await openReels();
    expect(within(reel).getByText(/this browser can't make video/i)).toBeTruthy();
    expect(within(reel).queryByRole("button", { name: /create slideshow reel/i })).toBeNull();
  });

  test("makes the Reel from the listing's photos, uploads it and puts it up for review", async () => {
    let received: SlideshowPlan | null = null;
    setReelEncoder({
      supported: () => true,
      encode: async (plan, onProgress) => {
        received = plan;
        onProgress(0.5);
        return { bytes: videoFixture("reel-1080x1920-2photos.mp4"), photoIds: plan.photos.map((p) => p.id) };
      },
    });
    const reel = await openReels();
    expect(within(reel).getByText("Not made yet.")).toBeTruthy();
    fireEvent.click(within(reel).getByRole("button", { name: /create slideshow reel/i }));

    await waitFor(() => expect(within(screen.getByRole("article", { name: "Reel 9:16" })).getByText("Ready for review")).toBeTruthy());
    const card = screen.getByRole("article", { name: "Reel 9:16" });
    expect(within(card).getByText("Version 1")).toBeTruthy();
    expect(card.querySelector("video")?.getAttribute("src")).toContain("/api/files/output/");
    expect(received!.spec).toEqual({ width: 1080, height: 1920, fps: 30, secondsPerPhoto: 3, crossfadeSeconds: 0.5 });
    expect(received!.photos.map((p) => p.id)).toEqual(photoIds);

    fireEvent.click(within(card).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(within(screen.getByRole("article", { name: "Reel 9:16" })).getByText("Approved")).toBeTruthy());
    expect(within(screen.getByRole("article", { name: "Reel 9:16" })).getByRole("button", { name: /make a new reel/i })).toBeTruthy();
  });

  test("an encoding failure is reported and nothing is uploaded", async () => {
    setReelEncoder({ supported: () => true, encode: () => Promise.reject(new Error("GPU lost")) });
    const reel = await openReels();
    fireEvent.click(within(reel).getByRole("button", { name: /create slideshow reel/i }));
    expect(await within(reel).findByRole("alert")).toBeTruthy();
    expect(within(reel).getByRole("alert").textContent).toMatch(/couldn't make the reel/i);
    expect((app.db.raw.query("SELECT COUNT(*) AS n FROM asset_versions").get() as { n: number }).n).toBe(0);
  });

  test("a video the server rejects shows the server's reason", async () => {
    setReelEncoder({
      supported: () => true,
      encode: async (plan) => ({ bytes: videoFixture("reel-1080x1080-2photos.mp4"), photoIds: plan.photos.map((p) => p.id) }),
    });
    const reel = await openReels();
    fireEvent.click(within(reel).getByRole("button", { name: /create slideshow reel/i }));
    expect((await within(reel).findByRole("alert")).textContent).toMatch(/not the size this reel template needs/i);
  });
});
