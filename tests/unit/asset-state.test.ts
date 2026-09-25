import { describe, expect, test } from "bun:test";
import {
  ASSET_VERSION_STATES,
  assertTransition,
  canTransition,
  isTerminal,
  initialStateFor,
  InvalidTransitionError,
  type AssetVersionState,
} from "@listingboost/domain";

const VALID: ReadonlyArray<[AssetVersionState, AssetVersionState]> = [
  ["queued", "processing"],
  ["queued", "cancelled"],
  ["processing", "completed"],
  ["processing", "failed"],
  ["processing", "cancelled"],
  ["processing", "queued"],
  ["completed", "needs_review"],
  ["needs_review", "approved"],
  ["needs_review", "rejected"],
];

describe("AT-07 asset version lifecycle", () => {
  test("defines exactly the documented states", () => {
    expect<string[]>([...ASSET_VERSION_STATES].sort()).toEqual(
      ["approved", "cancelled", "completed", "failed", "needs_review", "processing", "queued", "rejected"].sort(),
    );
  });

  for (const [from, to] of VALID) {
    test(`accepts ${from} -> ${to}`, () => {
      expect(canTransition(from, to)).toBe(true);
      expect(() => assertTransition(from, to)).not.toThrow();
    });
  }

  const validKeys = new Set(VALID.map(([a, b]) => `${a}->${b}`));
  for (const from of ASSET_VERSION_STATES) {
    for (const to of ASSET_VERSION_STATES) {
      if (validKeys.has(`${from}->${to}`)) continue;
      test(`rejects ${from} -> ${to}`, () => {
        expect(canTransition(from, to)).toBe(false);
        expect(() => assertTransition(from, to)).toThrow(InvalidTransitionError);
      });
    }
  }

  test("terminal states", () => {
    expect(ASSET_VERSION_STATES.filter(isTerminal).sort()).toEqual(["approved", "cancelled", "failed", "rejected"]);
  });

  test("generated versions start queued; manual text edits start in review", () => {
    expect(initialStateFor("generation")).toBe("queued");
    expect(initialStateFor("manual_edit")).toBe("needs_review");
  });
});
