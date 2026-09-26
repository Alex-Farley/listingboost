/**
 * Regenerates the small, real MP4 files used by Reel upload validation tests.
 * Encodes in Chromium with WebCodecs + Mediabunny, exactly as the app does.
 * Open-source Chromium has no H.264 encoder, so fixtures are VP9 in MP4.
 *
 * Run: LB_CHROMIUM_PATH=/opt/pw-browsers/chromium bun scripts/generate-video-fixtures.ts
 */
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const OUT = join(ROOT, "tests/support/fixtures/videos");
const bundle = readFileSync(join(ROOT, "node_modules/mediabunny/dist/bundles/mediabunny.mjs"), "utf8");

type Spec = { name: string; width: number; height: number; seconds: number; audio?: boolean };
const SPECS: Spec[] = [
  { name: "reel-1080x1920-2photos.mp4", width: 1080, height: 1920, seconds: 6 },
  { name: "reel-1080x1080-2photos.mp4", width: 1080, height: 1080, seconds: 6 },
  { name: "reel-1080x1920-with-audio.mp4", width: 1080, height: 1920, seconds: 6, audio: true },
];

const server = Bun.serve({
  port: 0,
  fetch(request) {
    if (new URL(request.url).pathname === "/mediabunny.mjs") return new Response(bundle, { headers: { "content-type": "text/javascript" } });
    return new Response("<!doctype html><title>fixtures</title>", { headers: { "content-type": "text/html" } });
  },
});

const browser = await chromium.launch({ executablePath: process.env.LB_CHROMIUM_PATH || undefined });
const page = await browser.newPage();
await page.goto(`http://localhost:${server.port}/`);
mkdirSync(OUT, { recursive: true });
for (const spec of SPECS) {
  const base64 = await page.evaluate(async (s: Spec) => {
    const mb = await import("/mediabunny.mjs" as string);
    const canvas = new OffscreenCanvas(s.width, s.height);
    const ctx = canvas.getContext("2d")!;
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
    const video = new mb.CanvasSource(canvas, { codec: "vp9", bitrate: 200_000 });
    output.addVideoTrack(video, { frameRate: 30 });
    const audio = s.audio ? new mb.AudioBufferSource({ codec: "opus", bitrate: 32_000 }) : null;
    if (audio) output.addAudioTrack(audio);
    await output.start();
    const frames = s.seconds * 30;
    for (let i = 0; i < frames; i++) {
      ctx.fillStyle = i < frames / 2 ? "#c8bca8" : "#786050";
      ctx.fillRect(0, 0, s.width, s.height);
      await video.add(i / 30, 1 / 30);
    }
    if (audio) await audio.add(new AudioBuffer({ length: 48_000 * s.seconds, sampleRate: 48_000, numberOfChannels: 1 }));
    await output.finalize();
    const bytes = new Uint8Array(output.target.buffer);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  }, spec);
  const bytes = Buffer.from(base64, "base64");
  writeFileSync(join(OUT, spec.name), bytes);
  console.log(`${spec.name}: ${bytes.length} bytes`);
}
await browser.close();
server.stop();
