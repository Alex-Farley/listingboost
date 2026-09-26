import { describe, expect, test } from "bun:test";
import { buildDeployConfig } from "../../scripts/deploy/wrangler-config";

const base = {
  LB_WORKER_NAME: "listingboost-preview",
  LB_D1_DATABASE_ID: "11111111-2222-3333-4444-555555555555",
  LB_D1_DATABASE_NAME: "listingboost-preview-db",
  LB_R2_BUCKET_NAME: "listingboost-preview-media",
  LB_BETTER_AUTH_URL: "https://preview.listingboost.co.uk/some/path",
};

describe("deploy Wrangler config", () => {
  test("maps GitHub Environment variables to bindings", () => {
    const config = buildDeployConfig(base, "/repo/.cloudflare");
    expect(config.name).toBe("listingboost-preview");
    expect(config.main).toBe("../apps/web/server/index.ts");
    expect(config.assets).toEqual({
      directory: "../dist/client",
      not_found_handling: "single-page-application",
      run_worker_first: ["/api/*"],
    });
    expect(config.d1_databases).toEqual([
      { binding: "DB", database_name: "listingboost-preview-db", database_id: base.LB_D1_DATABASE_ID, migrations_dir: "../migrations" },
    ]);
    expect(config.r2_buckets).toEqual([{ binding: "MEDIA", bucket_name: "listingboost-preview-media" }]);
    expect(config.vars).toEqual({ APP_ORIGIN: "https://preview.listingboost.co.uk" });
    expect(config.triggers).toEqual({ crons: ["*/5 * * * *"] });
  });

  test("R7b bundles the renderer fonts as data modules (wasm uses Wrangler's default CompiledWasm rule)", () => {
    expect(buildDeployConfig(base, "/repo/.cloudflare").rules).toEqual([{ type: "Data", globs: ["**/*.woff"], fallthrough: true }]);
  });

  test("queue defaults to <worker>-jobs and is both produced and consumed", () => {
    const config = buildDeployConfig(base, "/repo/.cloudflare");
    expect(config.queues).toEqual({
      producers: [{ binding: "JOBS", queue: "listingboost-preview-jobs" }],
      consumers: [{ queue: "listingboost-preview-jobs", max_batch_size: 5, max_retries: 5 }],
    });
    expect(buildDeployConfig({ ...base, LB_QUEUE_NAME: "custom-q" }, "/repo/.cloudflare").queues?.producers[0]?.queue).toBe("custom-q");
  });

  test("explicit LB_APP_ORIGIN wins; route adds a custom domain", () => {
    const config = buildDeployConfig(
      { ...base, LB_APP_ORIGIN: "https://app.listingboost.co.uk", LB_ROUTE: "app.listingboost.co.uk/*", LB_ZONE_NAME: "listingboost.co.uk" },
      "/repo/.cloudflare",
    );
    expect(config.vars.APP_ORIGIN).toBe("https://app.listingboost.co.uk");
    expect(config.routes).toEqual([{ pattern: "app.listingboost.co.uk/*", zone_name: "listingboost.co.uk" }]);
  });

  test("missing required variables fail with their names", () => {
    for (const key of ["LB_WORKER_NAME", "LB_D1_DATABASE_ID", "LB_D1_DATABASE_NAME", "LB_R2_BUCKET_NAME"] as const) {
      expect(() => buildDeployConfig({ ...base, [key]: "" }, "/repo/.cloudflare")).toThrow(key);
    }
    expect(() => buildDeployConfig({ ...base, LB_BETTER_AUTH_URL: undefined }, "/repo/.cloudflare")).toThrow("LB_APP_ORIGIN");
    expect(() => buildDeployConfig({ ...base, LB_ROUTE: "x/*" }, "/repo/.cloudflare")).toThrow("LB_ZONE_NAME");
  });
});
