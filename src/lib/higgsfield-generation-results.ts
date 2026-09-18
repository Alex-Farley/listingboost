import type { Generation, JobPhase, OutputType } from "@higgsfield/fnf/client";
import type { MediaRef } from "@higgsfield/fnf/media";
import type { AssetLibraryItem } from "@/components/asset-library";
import type { GalleryItem } from "@/components/gallery";
import {
  getJobPhase,
  getMediaType,
  getPreviewUrl,
  getRawUrl,
  hasResult,
  isTerminalJobStatus,
} from "@higgsfield/fnf/client";

export type GenerationMediaPreview =
  | { kind: "image"; phase: JobPhase; previewUrl: string; rawUrl: string }
  | {
      kind: "video";
      phase: JobPhase;
      rawUrl: string;
      posterUrl?: string;
      previewUrl?: string;
    }
  | {
      kind: "empty";
      phase: JobPhase;
      outputType: OutputType;
      terminal: boolean;
      reason: "pending" | "preview_unavailable" | "failed";
    };

export function selectGenerationMedia(generation: Generation): GenerationMediaPreview {
  const phase = getJobPhase(generation);
  const outputType = getMediaType(generation) ?? generation.type;

  if (!hasResult(generation)) {
    return {
      kind: "empty",
      phase,
      outputType,
      terminal: isTerminalJobStatus(generation.status),
      reason:
        phase === "failed"
          ? "failed"
          : generation.status === "completed"
            ? "preview_unavailable"
            : "pending",
    };
  }

  const rawUrl = getRawUrl(generation);
  const previewUrl = getPreviewUrl(generation);
  if (!rawUrl) {
    return {
      kind: "empty",
      phase,
      outputType,
      terminal: isTerminalJobStatus(generation.status),
      reason: generation.status === "completed" ? "preview_unavailable" : "pending",
    };
  }

  if (outputType === "video") {
    const posterUrl =
      generation.results.thumbnailUrl ??
      (previewUrl && getMediaType(previewUrl) === "image" ? previewUrl : undefined);
    return {
      kind: "video",
      phase,
      rawUrl,
      ...(previewUrl ? { previewUrl } : {}),
      ...(posterUrl ? { posterUrl } : {}),
    };
  }

  return { kind: "image", phase, rawUrl, previewUrl: previewUrl ?? rawUrl };
}

export function getGenerationPrompt(generation: Generation): string | undefined {
  const prompt = generation.input.prompt?.instruction?.trim();
  return prompt && prompt.length > 0 ? prompt : undefined;
}

export function getGenerationFailureLabel(generation: Generation): string | undefined {
  return (
    generation.failReason?.trim() ||
    (getJobPhase(generation) === "failed" ? generation.status.replaceAll("_", " ") : undefined)
  );
}

export function generationToGalleryItem(generation: Generation): GalleryItem {
  const media = selectGenerationMedia(generation);
  const [width, height] = generationDimensions(generation);
  const prompt = getGenerationPrompt(generation) ?? "Generated media";
  const failed = media.kind === "empty" && media.terminal;
  const ready = media.kind !== "empty";
  return {
    id: generation.id,
    kind: ready ? media.kind : generation.type,
    status: failed ? "failed" : ready ? "ready" : "generating",
    src:
      media.kind === "image"
        ? media.previewUrl
        : media.kind === "video"
          ? (media.posterUrl ?? "")
          : "",
    ...(media.kind === "video" ? { videoSrc: media.rawUrl } : {}),
    ...(failed
      ? {
          failureLabel:
            getGenerationFailureLabel(generation) ??
            (media.reason === "preview_unavailable"
              ? "The job completed without previewable media."
              : "The generation failed."),
        }
      : {}),
    width,
    height,
    prompt,
    alt: prompt,
    groupId: "history",
    groupLabel: "History",
  };
}

export function generationToAssetItem(generation: Generation): AssetLibraryItem | null {
  const media = selectGenerationMedia(generation);
  if (media.kind === "empty") return null;
  const url = media.rawUrl;
  return {
    name: getGenerationPrompt(generation) ?? "Generated media",
    type: media.kind === "video" ? "Video generation" : "Image generation",
    src: media.kind === "video" ? (media.posterUrl ?? media.previewUrl ?? url) : media.previewUrl,
    ref: {
      id: generation.id,
      type: media.kind === "video" ? "video_job" : "image_job",
      url,
    },
    kind: media.kind,
    personal: true,
  };
}

export function mediaRefToAssetItem(ref: MediaRef): AssetLibraryItem | null {
  if (!ref.url) return null;
  return {
    name: `Upload ${ref.id.slice(0, 8)}`,
    type: "Uploaded image",
    src: ref.url,
    ref: { ...ref, type: "media_input" },
    kind: "upload",
    personal: true,
  };
}

function generationDimensions(generation: Generation): [number, number] {
  const settings = generation.input.settings as Record<string, unknown>;
  const ratio = typeof settings.aspectRatio === "string" ? settings.aspectRatio : "1:1";
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(ratio);
  if (!match) return [1, 1];
  return [Number(match[1]), Number(match[2])];
}
