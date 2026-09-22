export type GenerationApprovalRequest = {
  jobSetType: string;
  params: Record<string, unknown>;
};

export type GenerationApproval = (
  request: GenerationApprovalRequest,
) => Promise<string>;

export class GenerationApprovalError extends Error {
  constructor(
    public readonly code: "approval_unavailable" | "confirmation_rejected",
    message: string,
  ) {
    super(message);
    this.name = "GenerationApprovalError";
  }
}

export interface GenerationApprovalPlatform {
  requestGeneration(model: string, params: Record<string, unknown>): Promise<string>;
}

/**
 * Provider-neutral approval boundary. Provider adapters inject the concrete
 * host implementation; generation code never reads provider globals.
 */
export function requestGenerationApprovalWith(
  { jobSetType, params }: GenerationApprovalRequest,
  platform?: GenerationApprovalPlatform,
): Promise<string> {
  if (!platform?.requestGeneration) {
    return Promise.reject(
      new GenerationApprovalError(
        "approval_unavailable",
        "Generation approval is unavailable. The configured provider adapter did not supply an approval implementation.",
      ),
    );
  }

  return platform.requestGeneration(jobSetType, params).catch((error: unknown) => {
    if (error instanceof Error && error.name === "AbortError") {
      throw new GenerationApprovalError(
        "confirmation_rejected",
        "Generation approval was rejected.",
      );
    }
    if (error instanceof GenerationApprovalError) throw error;
    throw new GenerationApprovalError(
      "approval_unavailable",
      error instanceof Error ? error.message : "Generation approval failed.",
    );
  });
}
