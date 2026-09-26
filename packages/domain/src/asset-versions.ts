import type { AssetVersionState } from "./asset-state";
import { DomainError, ImmutableVersionError } from "./errors";

export type VersionSummary = {
  id: string;
  versionNumber: number;
  state: AssetVersionState;
  approvedAt: string | null;
};

export function selectFinalVersion<T extends VersionSummary>(versions: readonly T[]): T | null {
  let final: T | null = null;
  for (const version of versions) {
    if (version.state !== "approved") continue;
    if (!version.approvedAt) {
      throw new DomainError("corrupt_version", `Approved version ${version.id} has no approval timestamp`);
    }
    if (!final || version.approvedAt > final.approvedAt! || (version.approvedAt === final.approvedAt && version.versionNumber > final.versionNumber)) {
      final = version;
    }
  }
  return final;
}

export function nextVersionNumber(versions: readonly Pick<VersionSummary, "versionNumber">[]): number {
  return versions.reduce((max, v) => Math.max(max, v.versionNumber), 0) + 1;
}

export function assertVersionMutable(version: Pick<VersionSummary, "id" | "state">): void {
  if (version.state === "approved") throw new ImmutableVersionError(version.id);
}
