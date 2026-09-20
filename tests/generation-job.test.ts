import { describe, expect, test } from "bun:test";
import { assertGenerationTransition, generationFailureFromRow, generationProvenanceFromRow } from "../src/lib/generation-job";

describe("generation persistence model", () => {
  test("accepts only forward generation lifecycle transitions", () => {
    expect(() => assertGenerationTransition("pending", "queued")).not.toThrow();
    expect(() => assertGenerationTransition("queued", "running")).not.toThrow();
    expect(() => assertGenerationTransition("running", "succeeded")).not.toThrow();
    expect(() => assertGenerationTransition("succeeded", "running")).toThrow();
    expect(() => assertGenerationTransition("cancelled", "queued")).toThrow();
  });

  test("normalizes persisted failure data", () => {
    expect(generationFailureFromRow({
      failure_code: "provider_timeout",
      failure_message: "Timed out",
      failure_retryable: 1,
    })).toEqual({ code: "provider_timeout", message: "Timed out", retryable: true });
    expect(generationFailureFromRow({ failure_code: "x" })).toBeUndefined();
  });

  test("normalizes provider provenance without making it product identity", () => {
    expect(generationProvenanceFromRow({
      provider_job_id: "job-1",
      provider_request_id: "req-1",
      provider_model: "model-1",
    })).toEqual({
      providerJobId: "job-1",
      providerRequestId: "req-1",
      providerModel: "model-1",
    });
  });
});
