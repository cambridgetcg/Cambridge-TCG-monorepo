// Custom next-auth adapter for raw pg (no ORM)

import { query } from "@/lib/db";
import type { Adapter, AdapterUser, AdapterSession, VerificationToken } from "next-auth/adapters";

export function PgAdapter(): Adapter {
  return {
    async createUser(user) {
      const result = await query(
        `INSERT INTO users (name, email, email_verified, image)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [user.name ?? null, user.email, user.emailVerified ?? null, user.image ?? null]
      );
      return toAdapterUser(result.rows[0]);
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
                u.email_verified as u_email_verified, u.image as u_image
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

function toAdapterUser(row: Record<string, unknown>): AdapterUser {
  return {
    id: row.id as string,
    name: (row.name as string) ?? null,
    email: row.email as string,
    emailVerified: row.email_verified ? new Date(row.email_verified as string) : null,
    image: (row.image as string) ?? null,
  };
}

function toAdapterSession(row: Record<string, unknown>): AdapterSession {
  return {
    sessionToken: row.session_token as string,
    userId: row.user_id as string,
    expires: new Date(row.expires as string),
  };
}
