import { beforeEach, describe, expect, test } from "bun:test";
import { PROTECTED_CHARACTERISTICS } from "@listingboost/domain";
import { createProperty, createTestApp, drainQueue, signUp, uploadPhoto, type TestApp } from "../support/app";
import { fakeProviders, permanent, transient } from "../support/providers";

type VersionView = {
  id: string;
  versionNumber: number;
  state: string;
  treatment: string | null;
  text: string | null;
  media: { url: string; contentType: string; width: number | null; height: number | null } | null;
  errorCode: string | null;
  errorMessage: string | null;
};
type AssetView = { id: string; slotKey: string; assetType: string; available: boolean; versions: VersionView[]; finalVersionId: string | null };
type CampaignView = { id: string; status: string; assets: AssetView[]; progress: Array<{ key: string; status: string }> };

let app: TestApp;
let fakes: ReturnType<typeof fakeProviders>;
let account: Awaited<ReturnType<typeof signUp>>;
let propertyId: string;
let campaignId: string;

async function view(): Promise<CampaignView> {
  return (await (await app.request(`/api/campaigns/${campaignId}`, { cookie: account.cookie })).json()) as CampaignView;
}
const asset = async (slot: string) => (await view()).assets.find((a) => a.slotKey === slot)!;
const generate = () => app.request(`/api/campaigns/${campaignId}/generate`, { method: "POST", cookie: account.cookie });
const regenerate = (assetId: string) => app.request(`/api/campaigns/${campaignId}/assets/${assetId}/regenerate`, { method: "POST", cookie: account.cookie });

async function setup(registry = fakes.registry) {
  app = createTestApp({ providers: registry });
  account = await signUp(app);
  propertyId = await createProperty(app, account.cookie, {
    title: "12 Orchard Way",
    bedrooms: 3,
    price: { amount: 650000, qualifier: "guide_price" },
    tenure: "freehold",
  });
  await uploadPhoto(app, account.cookie, propertyId);
  const response = await app.request(`/api/properties/${propertyId}/campaigns`, { method: "POST", cookie: account.cookie, body: "{}" });
  campaignId = ((await response.json()) as { id: string }).id;
}

beforeEach(async () => {
  fakes = fakeProviders();
  await setup();
});

describe("AT-07 generation lifecycle through the service", () => {
  test("generate queues one version and one job per asset and reports progress", async () => {
    const response = await generate();
    expect(response.status).toBe(202);
    const body = (await response.json()) as CampaignView & { queued: number; unavailable: string[] };
    expect(body.queued).toBe(12);
    expect(body.unavailable).toEqual([]);
    expect(app.queue.messages).toHaveLength(12);
    expect(body.status).toBe("generating");
    expect(body.assets.every((a) => a.versions.length === 1 && a.versions[0]!.state === "queued")).toBe(true);
    expect(body.progress.find((g) => g.key === "photography")?.status).toBe("in_progress");
  });

  test("generating twice does not duplicate work", async () => {
    await generate();
    const again = (await (await generate()).json()) as { queued: number };
    expect(again.queued).toBe(0);
    expect(app.queue.messages).toHaveLength(12);
  });

  test("processed jobs end in needs_review with persisted output and provenance", async () => {
    await generate();
    await drainQueue(app);
    const campaign = await view();
    expect(campaign.assets.every((a) => a.versions[0]!.state === "needs_review")).toBe(true);
    expect(campaign.status).toBe("in_review");
    expect(campaign.progress.find((g) => g.key === "photography")?.status).toBe("needs_review");

    const photo = campaign.assets.find((a) => a.assetType === "enhanced_photo")!.versions[0]!;
    expect(photo.treatment).toBe("enhancement");
    expect(photo.media).toMatchObject({ contentType: "image/png", width: 800, height: 600 });
    const download = await app.request(photo.media!.url);
    expect(download.status).toBe(200);
    expect(download.headers.get("Content-Type")).toBe("image/png");

    const row = app.db.raw
      .query("SELECT provider, model, prompt_version, template_version, parameters_json, reference_media_ids_json, output_object_key FROM asset_versions WHERE id = ?")
      .get(photo.id) as Record<string, string | number>;
    expect(row).toMatchObject({ provider: "fake-enhancer", model: "enhance-test-1", prompt_version: "enhance-v1", template_version: 1 });
    expect(JSON.parse(row.reference_media_ids_json as string)).toHaveLength(1);
    expect(row.output_object_key).toBe(`org/${account.organisation.id}/output/${photo.id}`);
    const output = app.db.raw.query("SELECT provider, model, provider_request_id, kind FROM generation_outputs").all();
    expect(output).toContainEqual({ provider: "fake-enhancer", model: "enhance-test-1", provider_request_id: "enh-1", kind: "media" });

    const copy = campaign.assets.find((a) => a.slotKey === "copy:headline")!.versions[0]!;
    expect(copy.text).toBe("Book a viewing of 12 Orchard Way.");
    expect(copy.media).toBeNull();
  });

  test("the client view never exposes provider names", async () => {
    await generate();
    await drainQueue(app);
    const text = JSON.stringify(await view());
    for (const name of ["fake-enhancer", "fake-writer", "fake-renderer", "fake-video", "enhance-test-1"]) expect(text).not.toContain(name);
  });

  test("duplicate queue deliveries run a job once", async () => {
    await generate();
    const messages = app.queue.take();
    const photoJob = messages[0]!;
    await app.generation.runJob(photoJob.jobId);
    await app.generation.runJob(photoJob.jobId);
    expect(fakes.enhancer.calls).toHaveLength(1);
  });

  test("unknown job ids are ignored", async () => {
    expect(await app.generation.runJob("no-such-job")).toBe("missing");
  });
});

describe("AT-16 enhancement requests carry the property-truth constraints", () => {
  test("the provider receives only allow-listed operations and the protected characteristics", async () => {
    await generate();
    await drainQueue(app);
    const request = fakes.enhancer.calls[0]!.request;
    expect(request.treatment).toBe("enhancement");
    expect(request.protectedCharacteristics).toEqual([...PROTECTED_CHARACTERISTICS]);
    expect(request.instructions).toContain("Do not add, remove, move or alter");
    expect(fakes.enhancer.calls[0]!.image.contentType).toBe("image/jpeg");
  });
});

describe("AT-15 copy truth enforced on generated copy", () => {
  test("copy writers receive only recorded facts", async () => {
    await generate();
    await drainQueue(app);
    const facts = fakes.writer.calls[0]!.facts;
    expect(facts.bedrooms).toBe(3);
    expect(facts.bathrooms).toBeNull();
    expect(facts.garden).toBeNull();
  });

  test("copy with unsupported claims is retried and finally fails without being shown as usable", async () => {
    fakes.writer.texts.headline = "Stunning four bedroom home with sea views";
    await generate();
    await drainQueue(app);
    const headline = await asset("copy:headline");
    expect(headline.versions[0]!.state).toBe("failed");
    expect(headline.versions[0]!.errorCode).toBe("retries_exhausted");
    expect(headline.versions[0]!.text).toBeNull();
    const job = app.db.raw.query("SELECT attempts, last_error_code FROM generation_jobs WHERE version_id = ?").get(headline.versions[0]!.id);
    expect(job).toEqual({ attempts: 3, last_error_code: "copy_truth_violation" });
  });

  test("copy that only restates facts is accepted", async () => {
    fakes.writer.texts.headline = "Three bedroom freehold home, guide price £650,000";
    await generate();
    await drainQueue(app);
    expect((await asset("copy:headline")).versions[0]!.state).toBe("needs_review");
  });
});

describe("AT-08 provider failure handling", () => {
  test("permanent errors fail the version with a safe message and no provider details", async () => {
    fakes.enhancer.script = [permanent()];
    await generate();
    await drainQueue(app);
    const photo = (await view()).assets.find((a) => a.assetType === "enhanced_photo")!;
    expect(photo.versions[0]).toMatchObject({ state: "failed", errorCode: "provider_rejected" });
    expect(photo.versions[0]!.errorMessage).toBe("We couldn't generate this asset. You can try again.");
    const text = JSON.stringify(await view());
    expect(text).not.toContain("sk-live-secret");
    expect(text).not.toContain("upstream");
    expect(fakes.enhancer.calls).toHaveLength(1);
    const campaign = await view();
    expect(campaign.progress.find((g) => g.key === "photography")?.status).toBe("failed");
  });

  test("unexpected adapter exceptions are treated as transient infrastructure failures", async () => {
    fakes.enhancer.script = [new TypeError("fetch failed"), "ok"];
    await generate();
    await drainQueue(app);
    expect((await view()).assets.find((a) => a.assetType === "enhanced_photo")!.versions[0]!.state).toBe("needs_review");
  });

  test("the user can regenerate after a failure", async () => {
    fakes.enhancer.script = [permanent()];
    await generate();
    await drainQueue(app);
    const photo = (await view()).assets.find((a) => a.assetType === "enhanced_photo")!;
    expect((await regenerate(photo.id)).status).toBe(202);
    await drainQueue(app);
    const after = (await view()).assets.find((a) => a.id === photo.id)!;
    expect(after.versions.map((v) => [v.versionNumber, v.state])).toEqual([
      [2, "needs_review"],
      [1, "failed"],
    ]);
  });
});

describe("AT-20 transient failures are retried with backoff", () => {
  test("a transient failure returns the version to the queue with a delay", async () => {
    fakes.enhancer.script = [transient()];
    await generate();
    const photoMessage = app.queue.take().find((m) => m.jobId)!;
    await app.generation.runJob(photoMessage.jobId);
    const version = (await view()).assets.find((a) => a.assetType === "enhanced_photo")!.versions[0]!;
    expect(version.state).toBe("queued");
    const job = app.db.raw.query("SELECT attempts, last_error_code, last_error_transient, next_run_at FROM generation_jobs WHERE version_id = ?").get(version.id) as {
      attempts: number;
      last_error_code: string;
      last_error_transient: number;
      next_run_at: string;
    };
    expect(job).toMatchObject({ attempts: 1, last_error_code: "provider_timeout", last_error_transient: 1 });
    expect(Math.round((Date.parse(job.next_run_at) - Date.now()) / 1000)).toBeWithin(28, 32);
    expect(app.queue.messages).toEqual([{ jobId: photoMessage.jobId, delaySeconds: 30 }]);
  });

  test("recovers on a later attempt", async () => {
    fakes.enhancer.script = [transient(), transient(), "ok"];
    await generate();
    await drainQueue(app);
    expect((await view()).assets.find((a) => a.assetType === "enhanced_photo")!.versions[0]!.state).toBe("needs_review");
    expect(fakes.enhancer.calls).toHaveLength(3);
  });

  test("the third transient failure fails the version", async () => {
    fakes.enhancer.script = [transient(), transient(), transient(), "ok"];
    await generate();
    await drainQueue(app);
    const version = (await view()).assets.find((a) => a.assetType === "enhanced_photo")!.versions[0]!;
    expect(version).toMatchObject({ state: "failed", errorCode: "retries_exhausted" });
    expect(fakes.enhancer.calls).toHaveLength(3);
  });

  test("the sweeper re-dispatches jobs whose queue message was lost and reclaims expired leases", async () => {
    await generate();
    const [lost, stuck] = app.queue.take();
    app.db.raw.run(
      "UPDATE asset_versions SET state = 'processing' WHERE id = (SELECT version_id FROM generation_jobs WHERE id = ?)",
      [stuck!.jobId],
    );
    app.db.raw.run("UPDATE generation_jobs SET attempts = 1, lease_expires_at = ? WHERE id = ?", [new Date(Date.now() - 1000).toISOString(), stuck!.jobId]);
    const result = await app.generation.sweep();
    expect(result.redispatched).toBeGreaterThanOrEqual(1);
    expect(result.reclaimed).toBe(1);
    const sent = app.queue.messages.map((m) => m.jobId);
    expect(sent).toContain(lost!.jobId);
    expect(sent).toContain(stuck!.jobId);
  });
});

describe("AT-17 regeneration creates a new version", () => {
  test("regenerating an approved asset leaves the approved version untouched", async () => {
    await generate();
    await drainQueue(app);
    const headline = await asset("copy:headline");
    const v1 = headline.versions[0]!;
    app.db.raw.run("UPDATE asset_versions SET state = 'approved', approved_at = ?, approved_by = ? WHERE id = ?", [
      new Date().toISOString(),
      account.user.id,
      v1.id,
    ]);
    fakes.writer.texts.headline = "A fresh headline for 12 Orchard Way";
    expect((await regenerate(headline.id)).status).toBe(202);
    await drainQueue(app);
    const after = await asset("copy:headline");
    expect(after.versions.map((v) => [v.versionNumber, v.state, v.text])).toEqual([
      [2, "needs_review", "A fresh headline for 12 Orchard Way"],
      [1, "approved", "Book a viewing of 12 Orchard Way."],
    ]);
    expect(after.finalVersionId).toBe(v1.id);
  });

  test("cannot regenerate while a version is still in progress", async () => {
    await generate();
    const headline = await asset("copy:headline");
    const response = await regenerate(headline.id);
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("generation_in_progress");
  });
});

describe("unavailable capabilities are reported honestly", () => {
  test("with no providers configured nothing is queued", async () => {
    await setup({});
    const response = await generate();
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("generation_unavailable");
    expect(app.queue.messages).toHaveLength(0);
    const campaign = await view();
    expect(campaign.assets.every((a) => !a.available)).toBe(true);
    expect(campaign.progress.find((g) => g.key === "photography")?.status).toBe("unavailable");
  });

  test("only assets with a configured provider are queued", async () => {
    await setup({ text_generation: fakes.writer });
    const body = (await (await generate()).json()) as { queued: number; unavailable: string[] };
    expect(body.queued).toBe(7);
    expect(body.unavailable).toContain("social:square");
  });
});
