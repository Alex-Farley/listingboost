/**
 * Slideshow Reel timing and framing. The Reel shows the agent's own photos,
 * cropped (never stretched or altered) and cross-faded; it adds nothing else.
 */

export type SlideshowSpec = {
  width: number;
  height: number;
  fps: number;
  secondsPerPhoto: number;
  crossfadeSeconds: number;
  maxPhotos: number;
};

const FPS = 30;
const CROSSFADE_SECONDS = 0.5;

export function slideshowSpec(config: Record<string, unknown>): SlideshowSpec {
  const canvas = config.canvas as { width: number; height: number };
  return {
    width: canvas.width,
    height: canvas.height,
    fps: FPS,
    secondsPerPhoto: config.secondsPerPhoto as number,
    crossfadeSeconds: config.transition === "crossfade" ? CROSSFADE_SECONDS : 0,
    maxPhotos: config.maxPhotos as number,
  };
}

export function slideshowDurationSeconds(photoCount: number, spec: SlideshowSpec): number {
  return photoCount * spec.secondsPerPhoto;
}

export function slideshowFrameCount(photoCount: number, spec: SlideshowSpec): number {
  return photoCount * Math.round(spec.secondsPerPhoto * spec.fps);
}

/** Which photo a frame shows, and how far it has faded into the next one. */
export function slideshowFrame(index: number, photoCount: number, spec: SlideshowSpec): { photo: number; next: number | null; mix: number } {
  const framesPerPhoto = Math.round(spec.secondsPerPhoto * spec.fps);
  const fadeFrames = Math.round(spec.crossfadeSeconds * spec.fps);
  const photo = Math.min(Math.floor(index / framesPerPhoto), photoCount - 1);
  const local = index - photo * framesPerPhoto;
  const fadeStart = framesPerPhoto - fadeFrames;
  if (fadeFrames === 0 || photo >= photoCount - 1 || local < fadeStart) return { photo, next: null, mix: 0 };
  return { photo, next: photo + 1, mix: (local - fadeStart) / fadeFrames };
}

/** Centred source rectangle that fills the destination without distortion. */
export function coverCrop(srcW: number, srcH: number, dstW: number, dstH: number): { sx: number; sy: number; sw: number; sh: number } {
  const scale = Math.min(srcW / dstW, srcH / dstH);
  const sw = dstW * scale;
  const sh = dstH * scale;
  return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}
