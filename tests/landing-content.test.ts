import { describe, expect, test } from "bun:test";
import { landingContentSchema } from "@higgsfield/app-landing";
import { landingContent } from "../src/landing-content";

describe("simple app landing content", () => {
  test("matches the shared landing contract", () => {
    expect(() => landingContentSchema.parse(landingContent)).not.toThrow();
    expect(landingContent.preview.kind).toBe("inline");
    expect(landingContent.steps.items).toHaveLength(3);
    expect(landingContent.steps.items.map((item) => item.preview.kind)).toEqual([
      "instruction",
      "action",
      "result",
    ]);
    expect(landingContent.features.items).toHaveLength(3);
    expect(landingContent.showcase.items.length).toBeGreaterThan(0);
  });
});
