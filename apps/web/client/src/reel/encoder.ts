import { coverCrop, slideshowFrame, slideshowFrameCount, type SlideshowSpec } from "@listingboost/domain";

/**
 * Makes the slideshow Reel in the browser (D-019): the listing's own photos,
 * cropped to 9:16 and cross-faded, encoded with WebCodecs into an MP4.
 * H.264 is preferred (what social networks expect); VP9/AV1 are fallbacks.
 */

export type SlideshowPlan = {
  spec: { width: number; height: number; fps: number; secondsPerPhoto: number; crossfadeSeconds: number };
  photos: Array<{ id: string; url: string; width: number; height: number }>;
};

export type EncodedReel = { bytes: Uint8Array<ArrayBuffer>; photoIds: string[] };

export type ReelEncoder = {
  supported(): boolean;
  encode(plan: SlideshowPlan, onProgress: (fraction: number) => void): Promise<EncodedReel>;
};

const BITRATE = 8_000_000;

export const webCodecsEncoder: ReelEncoder = {
  supported: () => typeof VideoEncoder !== "undefined" && typeof OffscreenCanvas !== "undefined",

  async encode(plan, onProgress) {
    const mb = await import("mediabunny");
    const { width, height, fps } = plan.spec;
    const codec = await mb.getFirstEncodableVideoCodec(["avc", "vp9", "av1"], { width, height, bitrate: BITRATE });
    if (!codec) throw new Error("no_encodable_codec");

    const images = await Promise.all(
      plan.photos.map(async (p) => {
        const response = await fetch(p.url);
        if (!response.ok) throw new Error("photo_unavailable");
        return createImageBitmap(await response.blob());
      }),
    );
    try {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("no_canvas");
      const draw = (image: ImageBitmap, alpha: number) => {
        const crop = coverCrop(image.width, image.height, width, height);
        context.globalAlpha = alpha;
        context.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
      };

      const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
      const source = new mb.CanvasSource(canvas, { codec, bitrate: BITRATE, keyFrameInterval: 2 });
      output.addVideoTrack(source, { frameRate: fps });
      await output.start();

      const spec: SlideshowSpec = { ...plan.spec, maxPhotos: plan.photos.length };
      const total = slideshowFrameCount(images.length, spec);
      for (let i = 0; i < total; i++) {
        const frame = slideshowFrame(i, images.length, spec);
        draw(images[frame.photo]!, 1);
        if (frame.next !== null) draw(images[frame.next]!, frame.mix);
        await source.add(i / fps, 1 / fps);
        onProgress((i + 1) / total);
      }
      await output.finalize();
      const buffer = output.target.buffer;
      if (!buffer) throw new Error("no_output");
      return { bytes: new Uint8Array(buffer), photoIds: plan.photos.map((p) => p.id) };
    } finally {
      for (const image of images) image.close();
    }
  },
};

let current: ReelEncoder = webCodecsEncoder;

export const reelEncoder = (): ReelEncoder => current;

/** Test seam: browsers under test (happy-dom) have no WebCodecs. */
export function setReelEncoder(encoder: ReelEncoder): void {
  current = encoder;
}

export function resetReelEncoder(): void {
  current = webCodecsEncoder;
}
