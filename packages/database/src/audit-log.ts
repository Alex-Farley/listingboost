import { auditStatement } from "./audit";
import type { OrganisationScope } from "./scope";
import type { SqlDatabase } from "./sql";

export async function recordAudit(
  db: SqlDatabase,
  scope: OrganisationScope,
  event: { action: string; subjectType: string; subjectId: string; metadata?: Record<string, unknown>; now: string },
): Promise<void> {
  await auditStatement(db, scope, event).run();
}
