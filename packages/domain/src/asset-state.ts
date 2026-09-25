import { InvalidTransitionError } from "./errors";

export const ASSET_VERSION_STATES = [
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
  "needs_review",
  "approved",
  "rejected",
] as const;

export type AssetVersionState = (typeof ASSET_VERSION_STATES)[number];

export type VersionOrigin = "generation" | "manual_edit";

// The single source of truth for lifecycle transitions (docs/ARCHITECTURE.md §6.1).
// The database mirrors this table in a trigger; keep both in sync.
const TRANSITIONS: Readonly<Record<AssetVersionState, readonly AssetVersionState[]>> = {
  queued: ["processing", "cancelled"],
  processing: ["completed", "failed", "cancelled", "queued"],
  completed: ["needs_review"],
  needs_review: ["approved", "rejected"],
  failed: [],
  cancelled: [],
  approved: [],
  rejected: [],
};

export function canTransition(from: AssetVersionState, to: AssetVersionState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: AssetVersionState, to: AssetVersionState): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export function isTerminal(state: AssetVersionState): boolean {
  return TRANSITIONS[state].length === 0;
}

export function isAssetVersionState(value: unknown): value is AssetVersionState {
  return typeof value === "string" && (ASSET_VERSION_STATES as readonly string[]).includes(value);
}

export function initialStateFor(origin: VersionOrigin): AssetVersionState {
  return origin === "generation" ? "queued" : "needs_review";
}

export function allowedTransitions(): ReadonlyArray<readonly [AssetVersionState, AssetVersionState]> {
  return ASSET_VERSION_STATES.flatMap((from) => TRANSITIONS[from].map((to) => [from, to] as const));
}
