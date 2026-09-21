import { describe, expect, test } from "bun:test";
import { buildGenerationJobIdempotencyKey, campaignAssetStatusFromGenerationState } from "../src/lib/campaign-generation";

describe("campaign generation persistence helpers", () => {
  test("builds a stable idempotency key from asset identity and attempt", () => {
    expect(buildGenerationJobIdempotencyKey("asset-1", "hero")).toBe("asset-1:hero:0");
    expect(buildGenerationJobIdempotencyKey("asset-1", "hero", 2)).toBe("asset-1:hero:2");
  });

  test("rejects invalid generation attempts", () => {
    expect(() => buildGenerationJobIdempotencyKey("asset-1", "hero", -1)).toThrow();
    expect(() => buildGenerationJobIdempotencyKey("asset-1", "hero", 1.5)).toThrow();
  });

  test("maps durable generation states to campaign asset states", () => {
    expect(campaignAssetStatusFromGenerationState("pending")).toBe("pending");
    expect(campaignAssetStatusFromGenerationState("queued")).toBe("generating");
    expect(campaignAssetStatusFromGenerationState("running")).toBe("generating");
    expect(campaignAssetStatusFromGenerationState("succeeded")).toBe("ready");
    expect(campaignAssetStatusFromGenerationState("failed")).toBe("failed");
    expect(campaignAssetStatusFromGenerationState("cancelled")).toBe("failed");
  });
});
