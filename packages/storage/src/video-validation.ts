/**
 * Validates a slideshow Reel uploaded from the browser (R7c, D-019) before it
 * reaches storage. The file must be exactly what our encoder produces: a
 * non-fragmented MP4 whose boxes account for every byte, with one video track
 * (H.264, VP9 or AV1), the template's dimensions and the length implied by the
 * photos it shows. Frames are not decoded.
 */

export const MAX_VIDEO_BYTES = 60 * 1024 * 1024;
const DURATION_TOLERANCE_SECONDS = 0.25;

export type ReelCodec = "avc1" | "vp09" | "av01";
export type ValidatedVideo = { contentType: "video/mp4"; codec: ReelCodec; width: number; height: number; durationSeconds: number };

export type VideoRejectionCode =
  | "empty_file"
  | "file_too_large"
  | "not_mp4"
  | "corrupt_video"
  | "unsupported_codec"
  | "unexpected_tracks"
  | "wrong_dimensions"
  | "wrong_duration";

const MESSAGES: Record<VideoRejectionCode, string> = {
  empty_file: "The video is empty.",
  file_too_large: "The video is too large.",
  not_mp4: "The Reel must be an MP4 video.",
  corrupt_video: "The video appears to be damaged or incomplete.",
  unsupported_codec: "The video uses an unsupported format.",
  unexpected_tracks: "The Reel must contain a single video track.",
  wrong_dimensions: "The video is not the size this Reel template needs.",
  wrong_duration: "The video length doesn't match the photos in the Reel.",
};

export class VideoRejectedError extends Error {
  constructor(readonly code: VideoRejectionCode) {
    super(MESSAGES[code]);
    this.name = "VideoRejectedError";
  }
}

type Box = { type: string; start: number; payload: number; end: number };

const CODECS: Record<string, ReelCodec> = { avc1: "avc1", avc3: "avc1", vp09: "vp09", av01: "av01" };
const TOP_LEVEL = new Set(["ftyp", "moov", "mdat", "free", "skip", "wide"]);

const u32 = (b: Uint8Array, o: number) => ((b[o]! << 24) >>> 0) + (b[o + 1]! << 16) + (b[o + 2]! << 8) + b[o + 3]!;
const u64 = (b: Uint8Array, o: number) => u32(b, o) * 2 ** 32 + u32(b, o + 4);
const ascii = (b: Uint8Array, o: number) => String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);
const corrupt = () => new VideoRejectedError("corrupt_video");

/** Walks sibling boxes in [start, end); every byte must belong to a box. */
function boxes(bytes: Uint8Array, start: number, end: number): Box[] {
  const out: Box[] = [];
  let offset = start;
  while (offset < end) {
    if (end - offset < 8) throw corrupt();
    let size = u32(bytes, offset);
    let header = 8;
    if (size === 1) {
      if (end - offset < 16) throw corrupt();
      size = u64(bytes, offset + 8);
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header || offset + size > end) throw corrupt();
    out.push({ type: ascii(bytes, offset + 4), start: offset, payload: offset + header, end: offset + size });
    offset += size;
  }
  return out;
}

const child = (bytes: Uint8Array, parent: Box, type: string) => boxes(bytes, parent.payload, parent.end).find((b) => b.type === type);

function need<T>(value: T | undefined): T {
  if (value === undefined) throw corrupt();
  return value;
}

function mvhdSeconds(bytes: Uint8Array, mvhd: Box): number {
  const version = bytes[mvhd.payload]!;
  const minLength = version === 1 ? 32 : 20;
  if (mvhd.end - mvhd.payload < minLength) throw corrupt();
  const timescale = u32(bytes, mvhd.payload + (version === 1 ? 20 : 12));
  const duration = version === 1 ? u64(bytes, mvhd.payload + 24) : u32(bytes, mvhd.payload + 16);
  if (timescale === 0) throw corrupt();
  return duration / timescale;
}

function tkhdSize(bytes: Uint8Array, tkhd: Box): { width: number; height: number } {
  const offset = tkhd.payload + (bytes[tkhd.payload] === 1 ? 88 : 76);
  if (offset + 8 > tkhd.end) throw corrupt();
  return { width: u32(bytes, offset) >>> 16, height: u32(bytes, offset + 4) >>> 16 };
}

export function validateReelVideo(bytes: Uint8Array, expected: { width: number; height: number; durationSeconds: number }): ValidatedVideo {
  if (bytes.length === 0) throw new VideoRejectedError("empty_file");
  if (bytes.length > MAX_VIDEO_BYTES) throw new VideoRejectedError("file_too_large");
  if (bytes.length < 8 || ascii(bytes, 4) !== "ftyp") throw new VideoRejectedError("not_mp4");

  const top = boxes(bytes, 0, bytes.length);
  if (top.some((b) => !TOP_LEVEL.has(b.type))) throw corrupt();
  const moovs = top.filter((b) => b.type === "moov");
  const mdats = top.filter((b) => b.type === "mdat");
  if (moovs.length !== 1 || mdats.length === 0 || mdats.every((b) => b.end === b.payload)) throw corrupt();
  const moov = moovs[0]!;

  const traks = boxes(bytes, moov.payload, moov.end).filter((b) => b.type === "trak");
  if (traks.length !== 1) throw new VideoRejectedError(traks.length === 0 ? "corrupt_video" : "unexpected_tracks");
  const trak = traks[0]!;
  const mdia = need(child(bytes, trak, "mdia"));
  const hdlr = need(child(bytes, mdia, "hdlr"));
  if (hdlr.end - hdlr.payload < 12 || ascii(bytes, hdlr.payload + 8) !== "vide") throw new VideoRejectedError("unexpected_tracks");

  const stbl = need(child(bytes, need(child(bytes, mdia, "minf")), "stbl"));
  const stsd = need(child(bytes, stbl, "stsd"));
  if (stsd.end - stsd.payload < 16 || u32(bytes, stsd.payload + 4) !== 1) throw corrupt();
  const entry = boxes(bytes, stsd.payload + 8, stsd.end)[0];
  const codec = entry ? CODECS[entry.type] : undefined;
  if (!codec) throw new VideoRejectedError("unsupported_codec");

  const { width, height } = tkhdSize(bytes, need(child(bytes, trak, "tkhd")));
  if (width !== expected.width || height !== expected.height) throw new VideoRejectedError("wrong_dimensions");

  const durationSeconds = mvhdSeconds(bytes, need(child(bytes, moov, "mvhd")));
  if (Math.abs(durationSeconds - expected.durationSeconds) > DURATION_TOLERANCE_SECONDS) throw new VideoRejectedError("wrong_duration");

  return { contentType: "video/mp4", codec, width, height, durationSeconds };
}
