import { describe, expect, test } from "bun:test";
import { MAX_VIDEO_BYTES, validateReelVideo, VideoRejectedError, type VideoRejectionCode } from "@listingboost/storage";
import { fixture, videoFixture } from "../support/fixtures";

const expected = { width: 1080, height: 1920, durationSeconds: 6 };

function rejects(code: VideoRejectionCode, bytes: Uint8Array, exp = expected) {
  try {
    validateReelVideo(bytes, exp);
  } catch (error) {
    expect(error).toBeInstanceOf(VideoRejectedError);
    expect((error as VideoRejectedError).code).toBe(code);
    return;
  }
  throw new Error(`expected rejection ${code}`);
}

/** Replaces the first occurrence of a 4-character box/sample-entry type. */
function patchType(bytes: Uint8Array, from: string, to: string): Uint8Array {
  const copy = bytes.slice();
  const needle = new TextEncoder().encode(from);
  for (let i = 0; i < copy.length - 4; i++) {
    if (needle.every((b, j) => copy[i + j] === b)) {
      copy.set(new TextEncoder().encode(to), i);
      return copy;
    }
  }
  throw new Error(`${from} not found`);
}

describe("R7c accepts a real slideshow Reel", () => {
  test("VP9 in MP4 at the template size and expected length", () => {
    expect(validateReelVideo(videoFixture("reel-1080x1920-2photos.mp4"), expected)).toEqual({
      contentType: "video/mp4",
      codec: "vp09",
      width: 1080,
      height: 1920,
      durationSeconds: 6,
    });
  });

  test("an H.264 sample entry is accepted as avc1", () => {
    const bytes = patchType(videoFixture("reel-1080x1920-2photos.mp4"), "vp09", "avc1");
    expect(validateReelVideo(bytes, expected).codec).toBe("avc1");
  });
});

describe("R7c rejects anything that isn't exactly the Reel we asked for", () => {
  const reel = () => videoFixture("reel-1080x1920-2photos.mp4");

  test("empty", () => rejects("empty_file", new Uint8Array(0)));
  test("too large", () => rejects("file_too_large", new Uint8Array(MAX_VIDEO_BYTES + 1)));
  test("not an MP4 (a JPEG)", () => rejects("not_mp4", fixture("photo-800x600.jpg")));
  test("truncated", () => rejects("corrupt_video", reel().slice(0, reel().length - 100)));
  test("trailing bytes after the last box", () => {
    const bytes = new Uint8Array(reel().length + 16);
    bytes.set(reel());
    rejects("corrupt_video", bytes);
  });
  test("a box that claims to run past the end", () => {
    const bytes = reel();
    const view = new DataView(bytes.buffer);
    view.setUint32(24, view.getUint32(24) + 1_000_000); // moov follows the 24-byte ftyp
    rejects("corrupt_video", bytes);
  });
  test("fragmented MP4 is not a file we produce", () => rejects("corrupt_video", patchType(reel(), "moov", "moof")));
  test("unsupported codec", () => rejects("unsupported_codec", patchType(reel(), "vp09", "mp4v")));
  test("extra tracks (audio)", () => rejects("unexpected_tracks", videoFixture("reel-1080x1920-with-audio.mp4")));
  test("wrong dimensions", () => rejects("wrong_dimensions", videoFixture("reel-1080x1080-2photos.mp4")));
  test("wrong length for the photos it claims to show", () => rejects("wrong_duration", reel(), { ...expected, durationSeconds: 9 }));
});
