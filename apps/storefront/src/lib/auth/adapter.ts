// Custom next-auth adapter for raw pg (no ORM)

import { query } from "@/lib/db";
import { generateHandle, fallbackHandle, HANDLE_MAX_ATTEMPTS } from "@/lib/users/handle";
import type { Adapter, AdapterUser, AdapterSession, VerificationToken } from "next-auth/adapters";

// users_username_key (unique) collision — the only 23505 worth retrying
// with a fresh handle. A users_email_key violation means a concurrent
// createUser for the same address; a new username won't fix that.
function isUsernameCollision(err: unknown): boolean {
  const pg = err as { code?: string; constraint?: string };
  return pg.code === "23505" && (pg.constraint ?? "").includes("username");
}

export function PgAdapter(): Adapter {
  return {
    async createUser(user) {
      // createUser runs exactly once per new user, so this is the seam
      // where the collector handle is assigned: a username in the same
      // INSERT means no user ever exists with NULL username and renders
      // as "—" to counterparties. Changeable at /account/profile.
      const maxAttempts = HANDLE_MAX_ATTEMPTS + 2;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const username = attempt <= HANDLE_MAX_ATTEMPTS ? generateHandle() : fallbackHandle();
        try {
          const result = await query(
            `INSERT INTO users (name, email, email_verified, image, username)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [user.name ?? null, user.email, user.emailVerified ?? null, user.image ?? null, username]
          );
          return toAdapterUser(result.rows[0]);
        } catch (err) {
          if (isUsernameCollision(err) && attempt < maxAttempts) continue;
          throw err;
        }
      }
      throw new Error("unreachable: createUser loop exits via return or throw");
    },

    async getUser(id) {
      const result = await query(`SELECT * FROM users WHERE id = $1`, [id]);
      return result.rows[0] ? toAdapterUser(result.rows[0]) : null;
    },

    async getUserByEmail(email) {
      const result = await query(`SELECT * FROM users WHERE email = $1`, [email]);
      return result.rows[0] ? toAdapterUser(result.rows[0]) : null;
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const result = await query(
        `SELECT u.* FROM users u
         JOIN accounts a ON a.user_id = u.id
         WHERE a.provider = $1 AND a.provider_account_id = $2`,
        [provider, providerAccountId]
      );
      return result.rows[0] ? toAdapterUser(result.rows[0]) : null;
    },

    async updateUser(user) {
      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (user.name !== undefined) { fields.push(`name = $${idx++}`); values.push(user.name); }
      if (user.email !== undefined) { fields.push(`email = $${idx++}`); values.push(user.email); }
      if (user.emailVerified !== undefined) { fields.push(`email_verified = $${idx++}`); values.push(user.emailVerified); }
      if (user.image !== undefined) { fields.push(`image = $${idx++}`); values.push(user.image); }
      fields.push(`updated_at = NOW()`);

      values.push(user.id);
      const result = await query(
        `UPDATE users SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
        values
      );
      return toAdapterUser(result.rows[0]);
    },

    async deleteUser(userId) {
      await query(`DELETE FROM users WHERE id = $1`, [userId]);
    },

    async linkAccount(account) {
      await query(
        `INSERT INTO accounts (user_id, type, provider, provider_account_id, refresh_token, access_token, expires_at, token_type, scope, id_token, session_state)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          account.userId, account.type, account.provider, account.providerAccountId,
          account.refresh_token ?? null, account.access_token ?? null,
          account.expires_at ?? null, account.token_type ?? null,
          account.scope ?? null, account.id_token ?? null, account.session_state ?? null,
        ]
      );
    },

    async unlinkAccount({ provider, providerAccountId }) {
      await query(
        `DELETE FROM accounts WHERE provider = $1 AND provider_account_id = $2`,
        [provider, providerAccountId]
      );
    },

    async createSession(session) {
      const result = await query(
        `INSERT INTO sessions (session_token, user_id, expires) VALUES ($1, $2, $3) RETURNING *`,
        [session.sessionToken, session.userId, session.expires]
      );
      return toAdapterSession(result.rows[0]);
    },

    async getSessionAndUser(sessionToken) {
      const result = await query(
        `SELECT s.*, u.id as u_id, u.name as u_name, u.email as u_email,
                u.email_verified as u_email_verified, u.image as u_image,
                u.role as u_role
         FROM sessions s JOIN users u ON s.user_id = u.id
         WHERE s.session_token = $1 AND s.expires > NOW()`,
        [sessionToken]
      );
      if (!result.rows[0]) return null;
      const row = result.rows[0];
      return {
        session: toAdapterSession(row),
        user: toAdapterUser({
          id: row.u_id, name: row.u_name, email: row.u_email,
          email_verified: row.u_email_verified, image: row.u_image,
          role: row.u_role,
        }),
      };
    },

    async updateSession(session) {
      const result = await query(
        `UPDATE sessions SET expires = $1 WHERE session_token = $2 RETURNING *`,
        [session.expires, session.sessionToken]
      );
      return result.rows[0] ? toAdapterSession(result.rows[0]) : null;
    },

    async deleteSession(sessionToken) {
      await query(`DELETE FROM sessions WHERE session_token = $1`, [sessionToken]);
    },

    async createVerificationToken(token) {
      await query(
        `INSERT INTO verification_tokens (identifier, token, expires) VALUES ($1, $2, $3)
         ON CONFLICT (identifier, token) DO NOTHING`,
        [token.identifier, token.token, token.expires]
      );
      return token;
    },

    async useVerificationToken({ identifier, token }) {
      const result = await query(
        `DELETE FROM verification_tokens WHERE identifier = $1 AND token = $2 RETURNING *`,
        [identifier, token]
      );
      if (!result.rows[0]) return null;
      return {
        identifier: result.rows[0].identifier,
        token: result.rows[0].token,
        expires: new Date(result.rows[0].expires),
      } as VerificationToken;
    },
  };
}

function toAdapterUser(
  row: Record<string, unknown>,
): AdapterUser & { role: string; username: string | null } {
  return {
    id: row.id as string,
    name: (row.name as string) ?? null,
    email: row.email as string,
    emailVerified: row.email_verified ? new Date(row.email_verified as string) : null,
    image: (row.image as string) ?? null,
    role: (row.role as string) ?? "user",
    // Rides along so events.signIn can skip the legacy-handle backfill
    // without a second read (the adapter SELECTs are all `*`).
    username: (row.username as string) ?? null,
  };
}

function toAdapterSession(row: Record<string, unknown>): AdapterSession {
  return {
    sessionToken: row.session_token as string,
    userId: row.user_id as string,
    expires: new Date(row.expires as string),
  };
}
