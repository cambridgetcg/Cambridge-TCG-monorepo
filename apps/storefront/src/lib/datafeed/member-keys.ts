import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { query, transaction } from "@/lib/db";

export const MEMBER_KEY_LIMIT = 5;
export const MEMBER_KEY_DAYS = 90;
export const MEMBER_REQUESTS_PER_MINUTE = 30;
const TOKEN_RE = /^ctcg_member_[A-Za-z0-9_-]{43}$/;
export const MEMBER_KEY_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MemberKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  scope: "price-read";
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export class MemberKeyError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

export function hashMemberKey(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function mintMemberSecret() {
  const token = `ctcg_member_${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashMemberKey(token), prefix: token.slice(0, 19) };
}

const SUMMARY_COLUMNS = `id, name, key_prefix AS "keyPrefix", scope,
  created_at AS "createdAt", expires_at AS "expiresAt", revoked_at AS "revokedAt"`;

// Active keys first; the account surface explicitly labels its bounded history.
export async function listMemberKeys(userId: string): Promise<MemberKeySummary[]> {
  const result = await query(
    `SELECT ${SUMMARY_COLUMNS} FROM member_data_keys WHERE user_id = $1
     ORDER BY (revoked_at IS NULL AND expires_at > NOW()) DESC, created_at DESC, id DESC LIMIT 100`,
    [userId],
  );
  return JSON.parse(JSON.stringify(result.rows)) as MemberKeySummary[];
}

export async function createMemberKey(userId: string, name: string) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 80 || /[\x00-\x1f\x7f]/.test(name)) {
    throw new MemberKeyError("Name must be 1–80 characters without control characters.", 400);
  }
  return transaction(async (tx) => {
    // Serializes concurrent mints for this owner; the cap cannot race.
    const owner = await tx(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
    if (!owner.rows.length) throw new MemberKeyError("Sign in required.", 401);
    const active = await tx(
      `SELECT count(*)::int AS n FROM member_data_keys
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()`, [userId],
    );
    if (Number(active.rows[0].n) >= MEMBER_KEY_LIMIT) {
      throw new MemberKeyError("You have five active keys. Revoke one before creating another.", 409);
    }
    const secret = mintMemberSecret();
    const result = await tx(
      `INSERT INTO member_data_keys (user_id, key_hash, key_prefix, name)
       VALUES ($1, $2, $3, $4) RETURNING ${SUMMARY_COLUMNS}`,
      [userId, secret.hash, secret.prefix, name.trim()],
    );
    return { key: JSON.parse(JSON.stringify(result.rows[0])) as MemberKeySummary, token: secret.token };
  });
}

export async function revokeMemberKey(userId: string, keyId: string): Promise<boolean> {
  if (!MEMBER_KEY_ID_RE.test(keyId)) throw new MemberKeyError("Invalid key ID.", 400);
  const result = await query(
    `UPDATE member_data_keys SET revoked_at = COALESCE(revoked_at, NOW())
     WHERE id = $1 AND user_id = $2 RETURNING id`, [keyId, userId],
  );
  return result.rows.length > 0;
}

export type MemberBearerResult =
  | { ok: true; actor: { userId: string }; remaining: number; resetSeconds: number }
  | { ok: false; status: 401 | 429; resetSeconds?: number };

/** No token in a URL, session fallback, agent credential, tier, or per-read tracking. */
export async function resolveMemberBearer(header: string | null): Promise<MemberBearerResult> {
  const match = header?.match(/^Bearer ([A-Za-z0-9_-]+)$/i);
  if (!match || !TOKEN_RE.test(match[1])) return { ok: false, status: 401 };
  const result = await query(
    `WITH valid_key AS (
       SELECT k.id, k.user_id FROM member_data_keys k JOIN users u ON u.id = k.user_id
       WHERE k.key_hash = $1 AND k.scope = 'price-read'
         AND k.revoked_at IS NULL AND k.expires_at > NOW()
     ), pruned AS (
       DELETE FROM member_data_rate_buckets WHERE (key_id, bucket_minute) IN (
         SELECT key_id, bucket_minute FROM member_data_rate_buckets
         WHERE bucket_minute < NOW() - interval '1 day'
           AND EXISTS (SELECT 1 FROM valid_key)
         ORDER BY bucket_minute LIMIT 100
       )
     ), consumed AS (
       INSERT INTO member_data_rate_buckets (key_id, bucket_minute, request_count)
       SELECT id, date_trunc('minute', NOW()), 1 FROM valid_key
       ON CONFLICT (key_id, bucket_minute) DO UPDATE
         SET request_count = LEAST(member_data_rate_buckets.request_count + 1, 31)
       RETURNING key_id, request_count
     )
     SELECT v.user_id, c.request_count,
       GREATEST(1, CEIL(EXTRACT(EPOCH FROM (date_trunc('minute', NOW()) + interval '1 minute' - NOW()))))::int AS reset_seconds
     FROM consumed c JOIN valid_key v ON v.id = c.key_id`,
    [hashMemberKey(match[1])],
  );
  const row = result.rows[0];
  if (!row) return { ok: false, status: 401 };
  if (row.request_count > MEMBER_REQUESTS_PER_MINUTE) {
    return { ok: false, status: 429, resetSeconds: row.reset_seconds };
  }
  return {
    ok: true, actor: { userId: row.user_id },
    remaining: MEMBER_REQUESTS_PER_MINUTE - row.request_count,
    resetSeconds: row.reset_seconds,
  };
}
