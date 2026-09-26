import type { SqlDatabase } from "./sql";

export type UserRecord = { id: string; email: string; name: string; passwordHash: string };
export type OrganisationRecord = { id: string; name: string };
export type MemberRole = "owner" | "member";

export type SessionRecord = {
  user: { id: string; email: string; name: string };
  organisation: OrganisationRecord;
  role: MemberRole;
  expiresAt: string;
};

export class EmailTakenError extends Error {
  constructor() {
    super("email_taken");
  }
}

export async function findUserByEmail(db: SqlDatabase, email: string): Promise<UserRecord | null> {
  const row = await db
    .prepare("SELECT id, email, name, password_hash FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string; email: string; name: string; password_hash: string }>();
  return row ? { id: row.id, email: row.email, name: row.name, passwordHash: row.password_hash } : null;
}

/** Creates user, organisation, owner membership, empty brand settings and a session atomically. */
export async function createAccount(
  db: SqlDatabase,
  input: { email: string; name: string; passwordHash: string; organisationName: string; sessionId: string; sessionExpiresAt: string; now: string },
): Promise<{ user: { id: string; email: string; name: string }; organisation: OrganisationRecord }> {
  const userId = crypto.randomUUID();
  const organisationId = crypto.randomUUID();
  try {
    await db.batch([
      db
        .prepare("INSERT INTO users (id, email, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(userId, input.email, input.name, input.passwordHash, input.now, input.now),
      db
        .prepare("INSERT INTO organisations (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
        .bind(organisationId, input.organisationName, input.now, input.now),
      db
        .prepare("INSERT INTO organisation_members (organisation_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)")
        .bind(organisationId, userId, input.now),
      db
        .prepare("INSERT INTO brand_settings (organisation_id, agency_name, updated_at) VALUES (?, ?, ?)")
        .bind(organisationId, input.organisationName, input.now),
      db
        .prepare("INSERT INTO sessions (id, user_id, organisation_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
        .bind(input.sessionId, userId, organisationId, input.now, input.sessionExpiresAt),
    ]);
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed: users\.email/.test(error.message)) throw new EmailTakenError();
    throw error;
  }
  return { user: { id: userId, email: input.email, name: input.name }, organisation: { id: organisationId, name: input.organisationName } };
}

/** The organisation a user signs in to. Users currently belong to exactly one organisation. */
export async function primaryMembership(db: SqlDatabase, userId: string): Promise<{ organisationId: string } | null> {
  const row = await db
    .prepare("SELECT organisation_id FROM organisation_members WHERE user_id = ? ORDER BY created_at LIMIT 1")
    .bind(userId)
    .first<{ organisation_id: string }>();
  return row ? { organisationId: row.organisation_id } : null;
}

export async function insertSession(
  db: SqlDatabase,
  input: { id: string; userId: string; organisationId: string; now: string; expiresAt: string },
): Promise<void> {
  await db
    .prepare("INSERT INTO sessions (id, user_id, organisation_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(input.id, input.userId, input.organisationId, input.now, input.expiresAt)
    .run();
}

export async function findSession(db: SqlDatabase, sessionId: string, now: string): Promise<SessionRecord | null> {
  const row = await db
    .prepare(
      `SELECT s.expires_at, u.id AS user_id, u.email, u.name AS user_name, o.id AS org_id, o.name AS org_name, m.role
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         JOIN organisations o ON o.id = s.organisation_id
         JOIN organisation_members m ON m.organisation_id = s.organisation_id AND m.user_id = s.user_id
        WHERE s.id = ? AND s.expires_at > ?`,
    )
    .bind(sessionId, now)
    .first<{ expires_at: string; user_id: string; email: string; user_name: string; org_id: string; org_name: string; role: MemberRole }>();
  if (!row) return null;
  return {
    user: { id: row.user_id, email: row.email, name: row.user_name },
    organisation: { id: row.org_id, name: row.org_name },
    role: row.role,
    expiresAt: row.expires_at,
  };
}

export async function deleteSession(db: SqlDatabase, sessionId: string): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
}
