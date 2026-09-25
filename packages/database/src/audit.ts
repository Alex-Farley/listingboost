import type { OrganisationScope } from "./scope";
import type { SqlDatabase, SqlStatement } from "./sql";

export function auditStatement(
  db: SqlDatabase,
  scope: OrganisationScope,
  event: { action: string; subjectType: string; subjectId: string; metadata?: Record<string, unknown>; now: string },
): SqlStatement {
  return db
    .prepare(
      `INSERT INTO audit_events (id, organisation_id, actor_user_id, action, subject_type, subject_id, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      scope.organisationId,
      scope.userId,
      event.action,
      event.subjectType,
      event.subjectId,
      JSON.stringify(event.metadata ?? {}),
      event.now,
    );
}
