import { describe, expect, test } from "bun:test";
import { flattenMediaPages, getNextCursor } from "../src/lib/cursor-pages";

describe("cursor pagination", () => {
  test("stops when a backend repeats a cursor", () => {
    const pages = [{ cursor: "next" }, { cursor: "next" }];
    expect(getNextCursor(pages[1]!, pages)).toBeUndefined();
  });

  test("deduplicates media while keeping first-seen order", () => {
    expect(
      flattenMediaPages({
        pages: [
          { items: [{ id: "a", type: "media_input" }], cursor: "next" },
          { items: [{ id: "a", type: "media_input", url: "https://cdn/a.png" }] },
        ],
      }),
    ).toEqual([{ id: "a", type: "media_input", url: "https://cdn/a.png" }]);
  });
});
