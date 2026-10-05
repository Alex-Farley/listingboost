import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BrandAssetRejectedError, RenderBrandAssetProcessor } from "@listingboost/ai";
// The unmodified package works in Bun (it cannot run in Workers); it is the reference for byte-for-byte comparison.
import reference from "woff2-encoder/decompress";
import { buildWoff2Decoder, readWoff2Source } from "../../scripts/build-woff2-decoder";
import { fontFixtures } from "../support/fixtures";
import { renderAssetsFromDisk } from "../support/render-assets";

const VENDOR = join(import.meta.dir, "../../packages/ai/vendor/woff2");
const processor = new RenderBrandAssetProcessor(renderAssetsFromDisk());

describe("vendored WOFF2 decoder build (D-022)", () => {
  test("the committed decoder is exactly what the build script produces from the pinned package", () => {
    const built = buildWoff2Decoder(readWoff2Source());
    expect(readFileSync(join(VENDOR, "woff2-decompress.js"), "utf8")).toBe(built.js);
    expect(Buffer.compare(readFileSync(join(VENDOR, "woff2-decompress.wasm")), built.wasm)).toBe(0);
  });

  test("the build fails loudly when the package no longer matches what the patches expect", () => {
    const source = readWoff2Source();
    expect(() => buildWoff2Decoder(source.replace("(Function,m).apply(null,h)", "(Function,m).apply(void 0,h)"))).toThrow(/anchor/i);
    expect(() => buildWoff2Decoder(source.replace("onRuntimeInitialized(){A(this)}", "onRuntimeInitialized(){B(this)}"))).toThrow(/anchor/i);
    expect(() => buildWoff2Decoder(source.replace("data:application/octet-stream;base64,AGFzbQ", "data:application/wasm;base64,AGFzbQ"))).toThrow(/anchor/i);
    expect(() => buildWoff2Decoder("export default function(){}")).toThrow(/anchor/i);
  });

  test("the vendored decoder has nothing Workers forbid: no code built from strings, no embedded wasm", () => {
    const js = readFileSync(join(VENDOR, "woff2-decompress.js"), "utf8");
    expect(js).not.toContain("(Function,");
    expect(js).not.toMatch(/new Function|\beval\(/);
    expect(js).not.toContain("base64,AGFzbQ");
    // The package's own runtime-compile fallback remains as dead code: the loader always supplies the module.
    expect(js).toContain("instantiateWasm(imports,done)");
    expect(js.length).toBeLessThan(40_000);
  });

  test("ships the licence notices for the decoder and the libraries inside it", () => {
    const notices = readFileSync(join(VENDOR, "NOTICES.md"), "utf8");
    for (const name of ["woff2-encoder", "google/woff2", "Brotli", "MIT"]) expect(notices).toContain(name);
  });
});

describe("AT-22 WOFF2 decoding (AC14a)", () => {
  test("decodes a TrueType WOFF2 to the same bytes as the reference decoder", async () => {
    const decoded = await processor.decodeWoff2(fontFixtures.woff2());
    expect(decoded).toEqual(await reference(fontFixtures.woff2()));
    expect([...decoded.subarray(0, 4)]).toEqual([0x00, 0x01, 0x00, 0x00]);
  });

  test("decodes an OpenType (CFF) WOFF2 to the same bytes as the reference decoder", async () => {
    const decoded = await processor.decodeWoff2(fontFixtures.otfWoff2());
    expect(decoded).toEqual(await reference(fontFixtures.otfWoff2()));
    expect(new TextDecoder().decode(decoded.subarray(0, 4))).toBe("OTTO");
  });

  test("a corrupt or truncated WOFF2 is rejected with a reason, and a good font decodes afterwards", async () => {
    const good = fontFixtures.woff2();
    const corrupt = good.slice();
    for (let i = 100; i < corrupt.length; i += 97) corrupt[i] = corrupt[i]! ^ 0xff;
    for (const bad of [corrupt, good.slice(0, 5000), fontFixtures.woff()]) {
      const error = await processor.decodeWoff2(bad).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(BrandAssetRejectedError);
      expect((error as BrandAssetRejectedError).code).toBe("corrupt_font");
      expect((error as BrandAssetRejectedError).message).toMatch(/damaged/);
    }
    expect((await processor.decodeWoff2(good)).length).toBeGreaterThan(good.length);
  });

  test("decoding twice gives independent results", async () => {
    const [a, b] = await Promise.all([processor.decodeWoff2(fontFixtures.woff2()), processor.decodeWoff2(fontFixtures.otfWoff2())]);
    expect(a).toEqual(await reference(fontFixtures.woff2()));
    expect(b).toEqual(await reference(fontFixtures.otfWoff2()));
  });
});
