import { describe, expect, test } from "bun:test";
import { coverCrop, slideshowDurationSeconds, slideshowFrame, slideshowFrameCount, slideshowSpec } from "@listingboost/domain";
import { DEFAULT_TEMPLATES } from "@listingboost/templates";

const reelConfig = DEFAULT_TEMPLATES.find((t) => t.id === "reel-slideshow")!.config;
const spec = slideshowSpec(reelConfig);

describe("R7c slideshow Reel timing", () => {
  test("spec comes from the versioned reel template", () => {
    expect(spec).toEqual({ width: 1080, height: 1920, fps: 30, secondsPerPhoto: 3, crossfadeSeconds: 0.5, maxPhotos: 10 });
  });

  test("a hard-cut template has no crossfade", () => {
    expect(slideshowSpec({ ...reelConfig, transition: "cut" }).crossfadeSeconds).toBe(0);
  });

  test("duration and frame count follow the photo count", () => {
    expect(slideshowDurationSeconds(4, spec)).toBe(12);
    expect(slideshowFrameCount(4, spec)).toBe(360);
    expect(slideshowFrameCount(1, spec)).toBe(90);
  });

  test("each photo holds, then crossfades into the next", () => {
    expect(slideshowFrame(0, 3, spec)).toEqual({ photo: 0, next: null, mix: 0 });
    expect(slideshowFrame(74, 3, spec)).toEqual({ photo: 0, next: null, mix: 0 });
    expect(slideshowFrame(75, 3, spec)).toEqual({ photo: 0, next: 1, mix: 0 });
    expect(slideshowFrame(82, 3, spec).mix).toBeCloseTo(7 / 15, 5);
    expect(slideshowFrame(90, 3, spec)).toEqual({ photo: 1, next: null, mix: 0 });
  });

  test("the last photo never fades into nothing", () => {
    for (let i = 180; i < 270; i++) expect(slideshowFrame(i, 3, spec)).toEqual({ photo: 2, next: null, mix: 0 });
  });

  test("every frame shows a real photo index", () => {
    const n = 5;
    for (let i = 0; i < slideshowFrameCount(n, spec); i++) {
      const f = slideshowFrame(i, n, spec);
      expect(f.photo).toBeGreaterThanOrEqual(0);
      expect(f.photo).toBeLessThan(n);
      expect(f.mix).toBeGreaterThanOrEqual(0);
      expect(f.mix).toBeLessThan(1);
    }
  });
});

describe("R7c photos are cropped, never stretched", () => {
  test("landscape photo into a 9:16 frame crops the sides, centred", () => {
    expect(coverCrop(1600, 1200, 1080, 1920)).toEqual({ sx: 462.5, sy: 0, sw: 675, sh: 1200 });
  });

  test("a very tall photo crops top and bottom, centred", () => {
    const c = coverCrop(1000, 4000, 1080, 1920);
    expect(c.sw).toBe(1000);
    expect(c.sh / c.sw).toBeCloseTo(1920 / 1080, 5);
    expect(c.sy).toBeCloseTo((4000 - c.sh) / 2, 5);
  });

  test("matching aspect ratio uses the whole photo", () => {
    expect(coverCrop(540, 960, 1080, 1920)).toEqual({ sx: 0, sy: 0, sw: 540, sh: 960 });
  });
});
