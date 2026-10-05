import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RenderBrandAssetProcessor } from "@listingboost/ai";
import { FONT_PRESETS, findFontPreset, presetFontPath } from "@listingboost/domain";
import { inspectFontUpload } from "@listingboost/storage";
import { renderAssetsFromDisk } from "../support/render-assets";

const PUBLIC = join(import.meta.dir, "../../apps/web/client/public");
const processor = new RenderBrandAssetProcessor(renderAssetsFromDisk());

describe("AT-22 preset fonts", () => {
  test("presets are grouped by use: four for headings, four for body text", () => {
    expect(FONT_PRESETS.filter((p) => p.group === "heading").map((p) => p.id)).toEqual(["playfair-display", "cormorant-garamond", "dm-serif-display", "montserrat"]);
    expect(FONT_PRESETS.filter((p) => p.group === "body").map((p) => p.id)).toEqual(["inter", "source-sans-3", "lato", "open-sans"]);
    expect(new Set(FONT_PRESETS.map((p) => p.id)).size).toBe(FONT_PRESETS.length);
    expect(findFontPreset("lato")?.label).toBe("Lato");
    expect(findFontPreset("comic-sans")).toBeNull();
  });

  for (const preset of FONT_PRESETS) {
    test(`${preset.label}: ships its SIL OFL 1.1 licence beside the font files (AC18)`, () => {
      const licence = readFileSync(join(PUBLIC, "fonts", preset.id, "OFL.txt"), "utf8");
      expect(licence).toContain("SIL OPEN FONT LICENSE Version 1.1");
      expect(licence).toMatch(/^Copyright/);
      expect(licence).toContain("PERMISSION & CONDITIONS");
    });

    test(`${preset.label}: every declared weight is a static WOFF the renderer can draw with`, async () => {
      for (const weight of ["regular", "bold"] as const) {
        const path = presetFontPath(preset, weight);
        if (weight === "bold" && !preset.hasBold) {
          expect(path).toBeNull();
          continue;
        }
        expect(path).toBe(`/fonts/${preset.id}/${preset.id}-${weight}.woff`);
        const bytes = new Uint8Array(readFileSync(join(PUBLIC, path!)));
        expect(inspectFontUpload({ bytes, filename: "font.woff" })).toEqual({ format: "woff", needsDecoding: false });
        await processor.probeFont(bytes);
      }
    });
  }

  test("nothing is shipped in the fonts folder that is not a listed preset with a licence", () => {
    const folders = readdirSync(join(PUBLIC, "fonts")).sort();
    expect(folders).toEqual(FONT_PRESETS.map((p) => p.id).sort());
    for (const folder of folders) {
      const files = readdirSync(join(PUBLIC, "fonts", folder)).sort();
      const preset = findFontPreset(folder)!;
      expect(files).toEqual(["OFL.txt", ...(preset.hasBold ? [`${folder}-bold.woff`] : []), `${folder}-regular.woff`].sort());
      expect(existsSync(join(PUBLIC, "fonts", folder, "OFL.txt"))).toBe(true);
    }
  });
});
