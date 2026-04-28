/**
 * NextAuth database adapter for the admin app.
 *
 * Reads from the storefront's Postgres database — the users table
 * is the canonical source of admin identities (role='admin').
 *
 * Deliberately NOT creating users — admin users must already exist
 * in the storefront's users table. The adapter handles sessions and
 * verification tokens but rejects createUser calls.
 */

import { sfQuery } from "@/lib/db";
import type { Adapter, AdapterUser, AdapterSession, VerificationToken } from "next-auth/adapters";

export function AdminDbAdapter(): Adapter {
  return {
    // Admin users are pre-existing storefront users with role='admin'.
    // We don't create new users through the admin app.
    async createUser() {
      throw new Error(
        "AdminDbAdapter: user creation is not supported. " +
        "Grant admin access by setting role='admin' on an existing storefront user."
      );
    },

    async getUser(id) {
      const result = await sfQuery(
        `SELECT * FROM users WHERE id = $1`,
        [id],
      );
      return result.rows[0] ? toAdapterUser(result.rows[0]) : null;
    },

    async getUserByEmail(email) {
      const result = await sfQuery(
        `SELECT * FROM users WHERE email = $1`,
        [email],
      );
      return result.rows[0] ? toAdapterUser(result.rows[0]) : null;
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const result = await sfQuery(
        `SELECT u.* FROM users u
         JOIN accounts a ON a.user_id = u.id
         WHERE a.provider = $1 AND a.provider_account_id = $2`,
        [provider, providerAccountId],
      );
      return result.rows[0] ? toAdapterUser(result.rows[0]) : null;
    },

    async updateUser(user) {
      const result = await sfQuery(
        `SELECT * FROM users WHERE id = $1`,
        [user.id],
      );
      return result.rows[0] ? toAdapterUser(result.rows[0]) : toAdapterUser(user);
    },

    async deleteUser(userId) {
      // No-op — we don't delete users from here.
      void userId;
    },

    async linkAccount(account) {
      await sfQuery(
        `INSERT INTO accounts (user_id, type, provider, provider_account_id, refresh_token, access_token, expires_at, token_type, scope, id_token, session_state)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (provider, provider_account_id) DO NOTHING`,
        [
          account.userId, account.type, account.provider, account.providerAccountId,
          account.refresh_token ?? null, account.access_token ?? null,
          account.expires_at ?? null, account.token_type ?? null,
          account.scope ?? null, account.id_token ?? null, account.session_state ?? null,
        ],
      );
    },

    async unlinkAccount({ provider, providerAccountId }) {
      await sfQuery(
        `DELETE FROM accounts WHERE provider = $1 AND provider_account_id = $2`,
        [provider, providerAccountId],
      );
    },

    async createSession(session) {
      const result = await sfQuery(
        `INSERT INTO sessions (session_token, user_id, expires)
         VALUES ($1, $2, $3) RETURNING *`,
        [session.sessionToken, session.userId, session.expires],
      );
      return toAdapterSession(result.rows[0]);
    },

    async getSessionAndUser(sessionToken) {
      const result = await sfQuery(
        `SELECT s.*, u.id as u_id, u.name as u_name, u.email as u_email,
                u.email_verified as u_email_verified, u.image as u_image,
                u.role as u_role
         FROM sessions s JOIN users u ON s.user_id = u.id
         WHERE s.session_token = $1 AND s.expires > NOW()`,
        [sessionToken],
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
      const result = await sfQuery(
        `UPDATE sessions SET expires = $1 WHERE session_token = $2 RETURNING *`,
        [session.expires, session.sessionToken],
      );
      return result.rows[0] ? toAdapterSession(result.rows[0]) : null;
    },

    async deleteSession(sessionToken) {
      await sfQuery(
        `DELETE FROM sessions WHERE session_token = $1`,
        [sessionToken],
      );
    },

    async createVerificationToken(token) {
      await sfQuery(
        `INSERT INTO verification_tokens (identifier, token, expires)
         VALUES ($1, $2, $3)
         ON CONFLICT (identifier, token) DO NOTHING`,
        [token.identifier, token.token, token.expires],
      );
      return token;
    },

    async useVerificationToken({ identifier, token }) {
      const result = await sfQuery(
        `DELETE FROM verification_tokens WHERE identifier = $1 AND token = $2 RETURNING *`,
        [identifier, token],
      );
      if (!result.rows[0]) return null;
      const row = result.rows[0];
      return {
        identifier: row.identifier as string,
        token: row.token as string,
        expires: new Date(row.expires as string),
      } as VerificationToken;
    },
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

type RawUser = Record<string, unknown>;

function toAdapterUser(row: RawUser): AdapterUser & { role: string } {
  return {
    id: row.id as string,
    name: (row.name as string) ?? null,
    email: row.email as string,
    emailVerified: row.email_verified
      ? new Date(row.email_verified as string)
      : null,
    image: (row.image as string) ?? null,
    role: (row.role as string) ?? "user",
  };
}

function toAdapterSession(row: RawUser): AdapterSession {
  return {
    sessionToken: row.session_token as string,
    userId: row.user_id as string,
    expires: new Date(row.expires as string),
  };
}
