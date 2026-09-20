import { describe, expect, test } from "bun:test";
import { generationJobFromRow } from "../src/lib/generation-job-store.server";

describe("D1 generation job mapping", () => {
  test("maps persisted provider-neutral lifecycle data", () => {
    expect(generationJobFromRow({
      id: "job-1",
      campaign_id: "campaign-1",
      campaign_asset_id: "asset-1",
      asset_key: "hero",
      state: "queued",
      attempt: 0,
      idempotency_key: "campaign-1:hero:0",
      provider_key: "higgsfield-api",
      provider_model: "seedance-2.5",
      provider_job_id: "provider-job-1",
      provider_request_id: "request-1",
      prompt_version: "v1",
      estimated_cost_usd: 0.2,
      actual_cost_usd: null,
      failure_code: null,
      failure_message: null,
      failure_retryable: null,
      created_at: "2026-09-20T10:00:00.000Z",
      updated_at: "2026-09-20T10:01:00.000Z",
      started_at: null,
      completed_at: null,
    })).toEqual({
      id: "job-1",
      campaignId: "campaign-1",
      campaignAssetId: "asset-1",
      assetKey: "hero",
      state: "queued",
      attempt: 0,
      idempotencyKey: "campaign-1:hero:0",
      providerKey: "higgsfield-api",
      providerModel: "seedance-2.5",
      providerJobId: "provider-job-1",
      providerRequestId: "request-1",
      promptVersion: "v1",
      estimatedCostUsd: 0.2,
      actualCostUsd: undefined,
      failure: undefined,
      createdAt: "2026-09-20T10:00:00.000Z",
      updatedAt: "2026-09-20T10:01:00.000Z",
      startedAt: undefined,
      completedAt: undefined,
    });
  });

  test("rejects malformed authoritative rows", () => {
    expect(() => generationJobFromRow({
      id: "job-1",
      campaign_id: "campaign-1",
      state: "queued",
    })).toThrow("Invalid persisted generation job.");
  });

  test("preserves retryable failure details", () => {
    const job = generationJobFromRow({
      id: "job-1",
      campaign_id: "campaign-1",
      campaign_asset_id: "asset-1",
      asset_key: "hero",
      state: "failed",
      attempt: 1,
      idempotency_key: "campaign-1:hero:1",
      failure_code: "timeout",
      failure_message: "Provider timed out",
      failure_retryable: 1,
      created_at: "2026-09-20T10:00:00.000Z",
      updated_at: "2026-09-20T10:01:00.000Z",
    });
    expect(job.failure).toEqual({
      code: "timeout",
      message: "Provider timed out",
      retryable: true,
    });
  });
});
