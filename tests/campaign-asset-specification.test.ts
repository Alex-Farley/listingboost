import { describe, expect, test } from "bun:test";
import {
  buildCampaignAssetSpecifications,
  toGenerationAssetSpecification,
} from "../src/lib/campaign-asset-specification";

const sourceImages = ["photo-1", "photo-2", "photo-3"];

describe("campaign asset specification", () => {
  test("builds five stable product asset keys without provider model choices", () => {
    const specifications = buildCampaignAssetSpecifications(sourceImages);

    expect(specifications.map((item) => item.assetKey)).toEqual([
      "hero",
      "square",
      "story",
      "just-listed",
      "property-reel",
    ]);
    expect(specifications.every((item) => !Object.hasOwn(item, "providerKey"))).toBe(true);
    expect(specifications.every((item) => !Object.hasOwn(item, "modelKey"))).toBe(true);
  });

  test("keeps the launch asset constraints explicit", () => {
    const specifications = buildCampaignAssetSpecifications(sourceImages);
    const reel = specifications.find((item) => item.assetKey === "property-reel");
    const hero = specifications.find((item) => item.assetKey === "hero");

    expect(hero).toMatchObject({ kind: "image", aspectRatio: "4:5", resolution: "2k" });
    expect(reel).toMatchObject({
      kind: "video",
      aspectRatio: "9:16",
      resolution: "720p",
      durationSeconds: 5,
      audio: { enabled: true },
    });
  });

  test("uses all supplied source photos as references for every asset", () => {
    const specifications = buildCampaignAssetSpecifications(sourceImages);

    for (const specification of specifications) {
      expect(specification.references.map((reference) => reference.id)).toEqual(sourceImages);
      expect(specification.references.every((reference) => reference.role === "reference")).toBe(true);
    }
  });

  test("maps to the provider-neutral execution contract without provider identity", () => {
    const [hero] = buildCampaignAssetSpecifications(sourceImages);
    const mapped = toGenerationAssetSpecification(hero);

    expect(mapped).toEqual({
      id: "hero",
      kind: "image",
      aspectRatio: "4:5",
      resolution: "2k",
      references: hero.references,
      outputCount: 1,
    });
    expect(mapped).not.toHaveProperty("providerKey");
    expect(mapped).not.toHaveProperty("modelKey");
  });

  test("rejects an empty or oversized source-photo set", () => {
    expect(() => buildCampaignAssetSpecifications([])).toThrow("between 1 and 6");
    expect(() => buildCampaignAssetSpecifications(Array.from({ length: 7 }, (_, index) => `photo-${index}`))).toThrow(
      "between 1 and 6",
    );
  });
});
