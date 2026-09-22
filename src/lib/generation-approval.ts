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

interface GenerationApprovalPlatform {
  requestGeneration(model: string, params: Record<string, unknown>): Promise<string>;
}

/**
 * Provider-neutral approval boundary. A provider adapter may inject its host
 * approval implementation, but the generation domain never reads provider
 * globals or imports provider SDK types.
 */
export const requestGenerationApproval: GenerationApproval = (request) =>
  requestGenerationApprovalWith(
    request,
    typeof window === "undefined" ? undefined : window.hf,
  );

export async function requestGenerationApprovalWith(
  { jobSetType, params }: GenerationApprovalRequest,
  platform?: GenerationApprovalPlatform,
): Promise<string> {
  if (!platform?.requestGeneration) {
    throw new GenerationApprovalError(
      "approval_unavailable",
      "Generation approval is unavailable. The configured provider adapter did not supply an approval implementation.",
    );
  }

  try {
    return await platform.requestGeneration(jobSetType, params);
  } catch (error) {
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
  }
}
