import { describe, expect, test } from "bun:test";
import {
  assertCampaignTransition,
  canTransitionCampaign,
  deriveCampaignState,
  normalizeCampaignState,
} from "../src/lib/campaign-state";

describe("campaign state machine", () => {
  test("normalizes legacy MVP states", () => {
    expect(normalizeCampaignState("building")).toBe("draft");
    expect(normalizeCampaignState("error")).toBe("failed");
  });

  test("allows the supported lifecycle transitions", () => {
    expect(canTransitionCampaign("draft", "planning")).toBe(true);
    expect(canTransitionCampaign("planning", "generating")).toBe(true);
    expect(canTransitionCampaign("generating", "partial")).toBe(true);
    expect(canTransitionCampaign("partial", "ready")).toBe(true);
    expect(canTransitionCampaign("failed", "generating")).toBe(true);
  });

  test("rejects skipping required lifecycle stages", () => {
    expect(canTransitionCampaign("draft", "ready")).toBe(false);
    expect(canTransitionCampaign("planning", "ready")).toBe(false);
    expect(() => assertCampaignTransition("draft", "ready")).toThrow(
      "Invalid campaign state transition",
    );
  });

  test("derives campaign state from asset lifecycle", () => {
    expect(deriveCampaignState([])).toBe("planning");
    expect(deriveCampaignState(["queued", "generating"])).toBe("generating");
    expect(deriveCampaignState(["ready", "ready"])).toBe("ready");
    expect(deriveCampaignState(["ready", "failed"])).toBe("partial");
    expect(deriveCampaignState(["failed", "failed"])).toBe("failed");
  });
});
