import { describe, expect, it } from "bun:test";
import { requestGenerationApprovalWith } from "../src/lib/generation-approval";

const request = {
  jobSetType: "nano_banana_2",
  params: { prompt: "Person with a deer", aspect_ratio: "1:1" },
};

describe("generation approval", () => {
  it("forwards the exact FNF request and returns the host token", async () => {
    const calls: unknown[][] = [];
    const token = await requestGenerationApprovalWith(request, {
      requestGeneration: async (...args) => {
        calls.push(args);
        return "intent-token";
      },
    });
    expect(token).toBe("intent-token");
    expect(calls).toEqual([[request.jobSetType, request.params]]);
  });

  it("fails visibly without the injected host SDK", async () => {
    await expect(requestGenerationApprovalWith(request)).rejects.toMatchObject({
      code: "approval_unavailable",
    });
  });

  it("maps a dismissed host modal to a quiet rejection", async () => {
    await expect(
      requestGenerationApprovalWith(request, {
        requestGeneration: async () => {
          throw new DOMException("Cancelled", "AbortError");
        },
      }),
    ).rejects.toMatchObject({ code: "confirmation_rejected" });
  });
});
