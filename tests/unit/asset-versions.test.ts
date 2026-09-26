import { describe, expect, test } from "bun:test";
import {
  assertVersionMutable,
  ImmutableVersionError,
  nextVersionNumber,
  selectFinalVersion,
  type VersionSummary,
} from "@listingboost/domain";

const v = (versionNumber: number, state: VersionSummary["state"], approvedAt: string | null = null): VersionSummary => ({
  id: `v${versionNumber}`,
  versionNumber,
  state,
  approvedAt,
});

describe("AT-10 only approved versions are final", () => {
  test("no versions -> no final", () => {
    expect(selectFinalVersion([])).toBeNull();
  });

  test("unapproved versions are never final", () => {
    const states = ["queued", "processing", "completed", "needs_review", "rejected", "failed", "cancelled"] as const;
    expect(selectFinalVersion(states.map((s, i) => v(i + 1, s)))).toBeNull();
  });

  test("most recently approved version is final, even if a newer version awaits review", () => {
    const versions = [
      v(1, "approved", "2026-01-01T10:00:00.000Z"),
      v(2, "approved", "2026-01-02T10:00:00.000Z"),
      v(3, "needs_review"),
    ];
    expect(selectFinalVersion(versions)?.id).toBe("v2");
  });

  test("an approved record without approvedAt is rejected as corrupt", () => {
    expect(() => selectFinalVersion([v(1, "approved", null)])).toThrow();
  });
});

describe("AT-17 regeneration creates a new version", () => {
  test("next version number follows the highest existing number", () => {
    expect(nextVersionNumber([])).toBe(1);
    expect(nextVersionNumber([v(1, "failed"), v(3, "approved", "2026-01-01T00:00:00.000Z"), v(2, "rejected")])).toBe(4);
  });
});

describe("AT-18 approved versions are immutable", () => {
  test("approved version cannot be mutated", () => {
    expect(() => assertVersionMutable(v(1, "approved", "2026-01-01T00:00:00.000Z"))).toThrow(ImmutableVersionError);
  });
  test("versions awaiting review can still transition", () => {
    expect(() => assertVersionMutable(v(1, "needs_review"))).not.toThrow();
  });
});
