import { describe, expect, test } from "bun:test";
import { manualReviewPropertyImageVerifier } from "@/lib/property-image-verifier-adapter";

describe("property image verifier adapter", () => {
  test("manual-review fallback never approves enhancement", async () => {
    const report = await manualReviewPropertyImageVerifier.verify({
      source: { bytes: new Uint8Array([1]), width: 1200, height: 900 },
      output: { bytes: new Uint8Array([2]), width: 1200, height: 900 },
      treatment: "enhance",
      sourceSha256: "source-hash",
      outputSha256: "output-hash",
    });

    expect(report.status).toBe("manual-review");
    expect(report.verifier.independentOfGenerationProvider).toBe(true);
    expect(report.reasons[0]).toContain("fail-closed");
  });

  test("fallback preserves potential-visualisation as a separate declared treatment", async () => {
    const report = await manualReviewPropertyImageVerifier.verify({
      source: { bytes: new Uint8Array([1]), width: 1200, height: 900 },
      output: { bytes: new Uint8Array([2]), width: 1200, height: 900 },
      treatment: "potential-visualisation",
      sourceSha256: "source-hash",
      outputSha256: "output-hash",
    });

    expect(report.treatment).toBe("potential-visualisation");
    expect(report.status).toBe("manual-review");
  });
});
