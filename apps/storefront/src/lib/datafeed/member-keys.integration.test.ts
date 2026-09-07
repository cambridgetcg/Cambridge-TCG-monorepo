import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ pool: null as Pool | null }));
vi.mock("@/lib/db", () => ({
  query: (sql: string, args?: unknown[]) => state.pool!.query(sql, args),
  transaction: async (fn: (query: (sql: string, args?: unknown[]) => Promise<unknown>) => Promise<unknown>) => {
    const client = await state.pool!.connect();
    try {
      await client.query("BEGIN");
      const result = await fn((sql, args) => client.query(sql, args));
      await client.query("COMMIT");
      return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  },
}));
import { createMemberKey, listMemberKeys, resolveMemberBearer, revokeMemberKey } from "./member-keys";

const target = process.env.MEMBER_KEYS_TEST_DATABASE_URL;
const schema = `member_keys_test_${randomUUID().replaceAll("-", "")}`;
const owner = randomUUID();
const other = randomUUID();
let admin: Pool;

describe.skipIf(!target)("member keys isolated PostgreSQL integration", () => {
  beforeAll(async () => {
    // Explicit opt-in and exact throwaway DB; never inherit DATABASE_URL or contact a remote host.
    const url = new URL(target!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/pricing_keys_test") throw new Error("Requires local pricing_keys_test database.");
    url.searchParams.delete("sslmode");
    admin = new Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } });
    await admin.query(`CREATE SCHEMA ${schema}`);
    state.pool = new Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: false }, options: `-c search_path=${schema},public`, max: 12 });
    await state.pool.query("CREATE TABLE users (id uuid PRIMARY KEY)");
    await state.pool.query("INSERT INTO users (id) VALUES ($1), ($2)", [owner, other]);
    const migration = await readFile(new URL("../../../drizzle/0138_member_data_keys.sql", import.meta.url), "utf8");
    await state.pool.query(migration);
  });
  afterAll(async () => {
    await state.pool?.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
  });

  it("hash-only issuance, owner isolation, expiry, revocation and owner cascade", async () => {
    const minted = await createMemberKey(owner, "integration");
    expect(minted.token).toMatch(/^ctcg_member_/);
    const stored = (await state.pool!.query("SELECT * FROM member_data_keys WHERE id = $1", [minted.key.id])).rows[0];
    expect(JSON.stringify(stored)).not.toContain(minted.token);
    expect(new Date(stored.expires_at).getTime() - new Date(stored.created_at).getTime()).toBe(90 * 86400000);
    expect(await resolveMemberBearer(`Bearer ${minted.token}`)).toMatchObject({ ok: true, actor: { userId: owner } });
    expect(await listMemberKeys(other)).toEqual([]);
    expect(await revokeMemberKey(other, minted.key.id)).toBe(false);
    expect(await resolveMemberBearer(`Bearer ${minted.token}`)).toMatchObject({ ok: true });
    expect(await revokeMemberKey(owner, minted.key.id)).toBe(true);
    expect(await resolveMemberBearer(`Bearer ${minted.token}`)).toEqual({ ok: false, status: 401 });

    const expired = await createMemberKey(owner, "expired");
    await state.pool!.query("UPDATE member_data_keys SET created_at = NOW() - interval '91 days', expires_at = NOW() - interval '1 day' WHERE id = $1", [expired.key.id]);
    expect(await resolveMemberBearer(`Bearer ${expired.token}`)).toEqual({ ok: false, status: 401 });
    const deletedOwner = randomUUID();
    await state.pool!.query("INSERT INTO users VALUES ($1)", [deletedOwner]);
    const orphan = await createMemberKey(deletedOwner, "owner deletion");
    await resolveMemberBearer(`Bearer ${orphan.token}`);
    await state.pool!.query("DELETE FROM users WHERE id = $1", [deletedOwner]);
    expect(await resolveMemberBearer(`Bearer ${orphan.token}`)).toEqual({ ok: false, status: 401 });
    expect((await state.pool!.query("SELECT * FROM member_data_rate_buckets WHERE key_id = $1", [orphan.key.id])).rows).toEqual([]);
  });

  it("database constrains scope and maximum expiry", async () => {
    const minted = await createMemberKey(owner, "constraints");
    await expect(state.pool!.query("UPDATE member_data_keys SET scope = 'write' WHERE id = $1", [minted.key.id])).rejects.toMatchObject({ code: "23514" });
    await expect(state.pool!.query("UPDATE member_data_keys SET expires_at = created_at + interval '91 days' WHERE id = $1", [minted.key.id])).rejects.toMatchObject({ code: "23514" });
    await revokeMemberKey(owner, minted.key.id);
  });

  it("serializes concurrent key mints at five active keys", async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => createMemberKey(other, `parallel ${i}`)));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(5);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(3);
    expect((await state.pool!.query("SELECT count(*)::int AS n FROM member_data_keys WHERE user_id = $1", [other])).rows[0].n).toBe(5);
  });

  it("atomically permits exactly 30 of 40 simultaneous requests and bounds cleanup", async () => {
    const minted = await createMemberKey(owner, "concurrency");
    // Avoid straddling a wall-clock minute while testing one minute's atomic bucket.
    const remaining = (await state.pool!.query("SELECT EXTRACT(EPOCH FROM date_trunc('minute', NOW()) + interval '1 minute' - NOW())::float AS seconds")).rows[0].seconds;
    if (remaining < 3) await new Promise(resolve => setTimeout(resolve, remaining * 1000 + 100));
    const results = await Promise.all(Array.from({ length: 40 }, () => resolveMemberBearer(`Bearer ${minted.token}`)));
    expect(results.filter(result => result.ok)).toHaveLength(30);
    expect(results.filter(result => !result.ok && result.status === 429)).toHaveLength(10);
    await state.pool!.query("INSERT INTO member_data_rate_buckets (key_id, bucket_minute, request_count) SELECT $1, NOW() - interval '2 days' - (n * interval '1 minute'), 1 FROM generate_series(1, 150) n", [minted.key.id]);
    await resolveMemberBearer(`Bearer ${minted.token}`);
    expect((await state.pool!.query("SELECT count(*)::int AS n FROM member_data_rate_buckets WHERE bucket_minute < NOW() - interval '1 day'")).rows[0].n).toBe(50);
  });
});
