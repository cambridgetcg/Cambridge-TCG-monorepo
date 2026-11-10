// Opt-in: AGENT_AUTH_TEST_DATABASE_URL=postgres://<user>@127.0.0.1:<port>/agent_auth_test
// Real Postgres row locks for the operator door's caps, revocation and archive,
// cross-account refusals that read the same as a missing id, and a
// one-connection pool run proving no action nests a second connection.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  pool: null as import("pg").Pool | null,
  userId: "",
  // Makes the matching statement inside a transaction throw (atomicity check).
  failOn: null as RegExp | null,
  // When set, transactions run through postgres.js as production's do
  // (@cambridge-tcg/db/compat), so its error shape is what the code meets.
  compat: null as import("@cambridge-tcg/db/compat").CompatDbInstance | null,
}));
vi.mock("@/lib/db", () => ({
  query: (sql: string, args?: unknown[]) => state.pool!.query(sql, args),
  transaction: async (fn: (query: (sql: string, args?: unknown[]) => Promise<unknown>) => Promise<unknown>) => {
    if (state.compat) return state.compat.transaction(fn as Parameters<typeof state.compat.transaction>[0]);
    const client = await state.pool!.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(async (sql, args) => {
        if (state.failOn?.test(sql)) throw new Error("injected failure");
        return client.query(sql, args);
      });
      await client.query("COMMIT");
      return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  },
}));
// A fixed signed-in user. Like the real auth() (database sessions through the
// root pool), it reads through root query(), so under a one-connection pool an
// action that called auth() inside its transaction would stall and fail.
vi.mock("@/lib/auth", () => ({
  auth: async () => {
    await state.pool!.query("SELECT id FROM users WHERE id = $1", [state.userId]);
    return { user: { id: state.userId } };
  },
}));

import { createCompatDb } from "@cambridge-tcg/db/compat";
import { archiveAgent, createAgent, mintKey, revokeKey } from "./operator-actions";
import { createAgentWithKey, mintRawToken } from "./creation";
import { keyExpiryDateRange, liveAgentKeySql } from "./key-expiry";
import { ARCHIVE_REVOCATION_REASON } from "./revocation-reasons";

const target = process.env.AGENT_AUTH_TEST_DATABASE_URL;
const schema = `operator_door_test_${randomUUID().replaceAll("-", "")}`;
let admin: Pool;
let pool: Pool;
let seq = 0;

const MINT_REFUSED = "Keys can be minted only for your active operator-managed agents.";
const KEY_CAP = "This agent already has 5 active keys. Revoke one first.";
const AGENT_CAP = "You already operate 10 active agents. Archive one first.";

async function newUser() {
  const id = randomUUID();
  await pool.query("INSERT INTO users (id) VALUES ($1)", [id]);
  return id;
}

/** An agent row with no keys, inserted directly. */
async function insertAgent(userId: string, opts: { status?: string; registeredVia?: string } = {}) {
  seq += 1;
  const row = await pool.query(
    `INSERT INTO agents (operated_by_user_id, public_handle, display_name, model_tag, status, registered_via)
     VALUES ($1, $2, 'Integration', 'integration-test', $3, $4) RETURNING id`,
    [userId, `od${seq}-${randomUUID().slice(0, 8)}`, opts.status ?? "active", opts.registeredVia ?? "operator"],
  );
  return row.rows[0].id as string;
}

const handle = () => { seq += 1; return `oc${seq}-${randomUUID().slice(0, 8)}`; };
const createInput = (key_expiry = "90d") => ({ public_handle: handle(), display_name: "Integration", model_tag: "integration-test", key_expiry });
/** Every mint states its expiry; 30 days unless a test says otherwise. */
const mint = (agent_id: string, name: string, key_expiry = "30d") => mintKey({ agent_id, name, key_expiry });

const liveKeyCount = async (agentId: string) =>
  (await pool.query(`SELECT count(*)::int AS n FROM agent_keys WHERE agent_id = $1 AND ${liveAgentKeySql("")}`, [agentId])).rows[0].n as number;
const unrevokedKeyCount = async (agentId: string) =>
  (await pool.query("SELECT count(*)::int AS n FROM agent_keys WHERE agent_id = $1 AND revoked_at IS NULL", [agentId])).rows[0].n as number;
const keyRow = async (keyId: string) =>
  (await pool.query("SELECT revoked_at, revoked_reason FROM agent_keys WHERE id = $1", [keyId])).rows[0];
const firstKeyId = async (agentId: string) =>
  (await pool.query("SELECT id FROM agent_keys WHERE agent_id = $1 ORDER BY created_at LIMIT 1", [agentId])).rows[0].id as string;

function within<T>(promise: Promise<T>, label: string, ms = 5000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out: ${label}`)), ms)),
  ]);
}

describe.skipIf(!target)("operator agent door isolated PostgreSQL integration", () => {
  beforeAll(async () => {
    // Explicit opt-in and exact throwaway DB; never inherit DATABASE_URL or contact a remote host.
    const url = new URL(target!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/agent_auth_test") throw new Error("Requires local agent_auth_test database.");
    url.searchParams.delete("sslmode");
    admin = new Pool({ connectionString: url.toString() });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({
      connectionString: url.toString(),
      options: `-c search_path=${schema},public -c statement_timeout=5000`,
      max: 24,
    });
    state.pool = pool;
    // Pure FK target for agents.operated_by_user_id.
    await pool.query("CREATE TABLE users (id uuid PRIMARY KEY)");
    for (const file of ["0090_agents.sql", "0112_agent_self_serve.sql", "0151_agent_key_expiry.sql"]) {
      await pool.query(await readFile(new URL(`../../../drizzle/${file}`, import.meta.url), "utf8"));
    }
  });
  afterAll(async () => {
    state.pool = null;
    await pool?.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
  });

  it("twelve concurrent mints for one agent stop at exactly five live keys", async () => {
    state.userId = await newUser();
    for (let round = 0; round < 3; round++) {
      const agentId = await insertAgent(state.userId);
      const results = await Promise.all(Array.from({ length: 12 }, (_, i) => mint(agentId, `k${i}`)));
      const minted = results.filter((r) => r.ok);
      expect(minted).toHaveLength(5);
      expect(results.filter((r) => !r.ok)).toStrictEqual(Array.from({ length: 7 }, () => ({ ok: false, error: KEY_CAP })));
      expect(await liveKeyCount(agentId)).toBe(5);
      for (const r of minted) if (r.ok) expect(r.data.key_prefix).toBe(r.data.token.slice(0, 12));
    }
  }, 20000);

  it("concurrent creates around the ten-agent cap never pass ten", async () => {
    const nearUser = await newUser();
    state.userId = nearUser;
    for (let i = 0; i < 6; i++) await insertAgent(state.userId);
    await insertAgent(state.userId, { status: "suspended" });
    for (let i = 0; i < 3; i++) await insertAgent(state.userId, { status: "archived" });
    const near = await Promise.all(Array.from({ length: 8 }, () => createAgent(createInput())));
    expect(near.filter((r) => r.ok)).toHaveLength(3);
    expect(near.filter((r) => !r.ok)).toStrictEqual(Array.from({ length: 5 }, () => ({ ok: false, error: AGENT_CAP })));

    const fresh = await newUser();
    state.userId = fresh;
    const burst = await Promise.all(Array.from({ length: 15 }, () => createAgent(createInput())));
    expect(burst.filter((r) => r.ok)).toHaveLength(10);

    const counts = await pool.query(
      "SELECT operated_by_user_id AS u, count(*)::int AS n FROM agents WHERE operated_by_user_id = ANY($1) AND status <> 'archived' GROUP BY 1",
      [[nearUser, fresh]],
    );
    expect(Object.fromEntries(counts.rows.map((row) => [row.u, row.n]))).toEqual({ [nearUser]: 10, [fresh]: 10 });
  }, 20000);

  it("mint is refused for suspended, archived, self-serve and other operators' agents; revoke and archive stay open for self-serve", async () => {
    state.userId = await newUser();
    const other = await newUser();
    const refused = [
      await insertAgent(state.userId, { status: "suspended" }),
      await insertAgent(state.userId, { status: "archived" }),
      await insertAgent(state.userId, { registeredVia: "self-serve" }),
      await insertAgent(other),
    ];
    for (const agentId of refused) {
      expect(await mint(agentId, "nope")).toStrictEqual({ ok: false, error: MINT_REFUSED });
      expect(await liveKeyCount(agentId)).toBe(0);
    }

    const selfServe = await createAgentWithKey({
      operatedByUserId: state.userId, publicHandle: handle(), displayName: "Legacy", modelTag: "integration-test", registeredVia: "self-serve",
      keyExpiry: { kind: "never" },
    });
    if (!selfServe.ok) throw new Error(selfServe.error);
    expect(await mint(selfServe.agent_id, "nope")).toStrictEqual({ ok: false, error: MINT_REFUSED });
    expect(await revokeKey({ key_id: selfServe.key_id })).toStrictEqual({ ok: true, data: { revoked: true, already_revoked: false } });
    expect(await archiveAgent({ agent_id: selfServe.agent_id })).toStrictEqual({ ok: true, data: { archived: true } });
  });

  it("revoke is idempotent: a second call answers already_revoked and keeps the first revocation", async () => {
    state.userId = await newUser();
    const created = await createAgent(createInput());
    if (!created.ok) throw new Error(created.error);
    const keyId = await firstKeyId(created.data.agent_id);

    expect(await revokeKey({ key_id: keyId, reason: `  ${"r".repeat(250)}  ` })).toStrictEqual({ ok: true, data: { revoked: true, already_revoked: false } });
    const first = await keyRow(keyId);
    expect(first.revoked_reason).toBe("r".repeat(200));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await revokeKey({ key_id: keyId, reason: "second" })).toStrictEqual({ ok: true, data: { revoked: true, already_revoked: true } });
    expect(await keyRow(keyId)).toEqual(first);

    // Another operator cannot see it.
    state.userId = await newUser();
    expect(await revokeKey({ key_id: keyId })).toStrictEqual({ ok: false, error: "Key not found." });

    // Concurrent revokes of one live key: exactly one performs.
    state.userId = (await pool.query("SELECT operated_by_user_id AS u FROM agents WHERE id = $1", [created.data.agent_id])).rows[0].u;
    const minted = await mint(created.data.agent_id, "race");
    if (!minted.ok) throw new Error(minted.error);
    const racing = await Promise.all([1, 2, 3, 4].map((i) => revokeKey({ key_id: minted.data.key_id, reason: `race ${i}` })));
    expect(racing.filter((r) => r.ok && !r.data.already_revoked)).toHaveLength(1);
    expect(racing.filter((r) => r.ok && r.data.already_revoked)).toHaveLength(3);
  });

  it("archive revokes every live key in the same transaction, and rolls back whole", async () => {
    state.userId = await newUser();
    const created = await createAgent(createInput());
    if (!created.ok) throw new Error(created.error);
    const agentId = created.data.agent_id;
    const keyIds = [await firstKeyId(agentId)];
    for (const name of ["two", "three"]) {
      const minted = await mint(agentId, name);
      if (!minted.ok) throw new Error(minted.error);
      keyIds.push(minted.data.key_id);
    }
    await revokeKey({ key_id: keyIds[2], reason: "old" });
    const earlier = await keyRow(keyIds[2]);

    expect(await archiveAgent({ agent_id: agentId })).toStrictEqual({ ok: true, data: { archived: true } });
    const agent = (await pool.query("SELECT status, archived_at, xmin::text AS xid FROM agents WHERE id = $1", [agentId])).rows[0];
    expect(agent.status).toBe("archived");
    const keys = (await pool.query(
      "SELECT id, revoked_at, revoked_reason, xmin::text AS xid FROM agent_keys WHERE id = ANY($1) ORDER BY created_at", [keyIds.slice(0, 2)],
    )).rows;
    for (const key of keys) {
      // Same NOW() and the same writing transaction id as the status update.
      expect(key).toMatchObject({ revoked_at: agent.archived_at, revoked_reason: ARCHIVE_REVOCATION_REASON, xid: agent.xid });
    }
    expect(await keyRow(keyIds[2])).toEqual(earlier);
    expect(await archiveAgent({ agent_id: agentId })).toStrictEqual({ ok: false, error: "Agent not found or already archived." });

    // A failure while revoking keys leaves the agent unarchived with its keys live.
    const second = await createAgent(createInput());
    if (!second.ok) throw new Error(second.error);
    state.failOn = /UPDATE agent_keys/;
    try {
      await expect(archiveAgent({ agent_id: second.data.agent_id })).rejects.toThrow("injected failure");
    } finally { state.failOn = null; }
    expect((await pool.query("SELECT status, archived_at FROM agents WHERE id = $1", [second.data.agent_id])).rows[0]).toEqual({ status: "active", archived_at: null });
    expect(await liveKeyCount(second.data.agent_id)).toBe(1);
  });

  it("another account cannot mint for, revoke a key of, or archive this account's agent, and is told what a missing id gets", async () => {
    const owner = await newUser();
    state.userId = owner;
    const created = await createAgent(createInput());
    if (!created.ok) throw new Error(created.error);
    const agentId = created.data.agent_id;
    const liveKeyId = await firstKeyId(agentId);
    const minted = await mint(agentId, "revoked-one");
    if (!minted.ok) throw new Error(minted.error);
    expect(await revokeKey({ key_id: minted.data.key_id, reason: "owner note" })).toMatchObject({ ok: true });
    const snapshot = async () => ({
      agent: (await pool.query("SELECT status, archived_at, updated_at FROM agents WHERE id = $1", [agentId])).rows[0],
      keys: (await pool.query(
        "SELECT id, revoked_at, revoked_reason FROM agent_keys WHERE agent_id = $1 ORDER BY id", [agentId],
      )).rows,
    });
    const before = await snapshot();
    expect(before.agent.status).toBe("active");
    expect(before.keys).toHaveLength(2);

    state.userId = await newUser();
    const missingAgent = randomUUID();
    const missingKey = randomUUID();

    const mintMissing = await mint(missingAgent, "x");
    expect(mintMissing).toStrictEqual({ ok: false, error: MINT_REFUSED });
    expect(await mint(agentId, "x")).toStrictEqual(mintMissing);

    const revokeMissing = await revokeKey({ key_id: missingKey, reason: "x" });
    expect(revokeMissing).toStrictEqual({ ok: false, error: "Key not found." });
    expect(await revokeKey({ key_id: liveKeyId, reason: "x" })).toStrictEqual(revokeMissing);
    // An already-revoked key answers the same: idempotence is not an existence oracle.
    expect(await revokeKey({ key_id: minted.data.key_id, reason: "x" })).toStrictEqual(revokeMissing);

    const archiveMissing = await archiveAgent({ agent_id: missingAgent });
    expect(archiveMissing).toStrictEqual({ ok: false, error: "Agent not found or already archived." });
    expect(await archiveAgent({ agent_id: agentId })).toStrictEqual(archiveMissing);

    // Nothing the other account did changed a row.
    expect(await snapshot()).toEqual(before);
    expect(await liveKeyCount(agentId)).toBe(1);

    // The owner still can.
    state.userId = owner;
    expect(await archiveAgent({ agent_id: agentId })).toStrictEqual({ ok: true, data: { archived: true } });
    expect(await liveKeyCount(agentId)).toBe(0);
  });

  it("an archive racing mints never leaves an archived agent with a live key", async () => {
    state.userId = await newUser();
    for (let round = 0; round < 10; round++) {
      const created = await createAgent(createInput());
      if (!created.ok) throw new Error(created.error);
      const agentId = created.data.agent_id;
      const [archived, ...mints] = await Promise.all([
        archiveAgent({ agent_id: agentId }),
        mint(agentId, "a"),
        mint(agentId, "b", "never"),
        mint(agentId, "c", "7d"),
      ]);
      expect(archived).toStrictEqual({ ok: true, data: { archived: true } });
      for (const mint of mints) if (!mint.ok) expect(mint.error).toBe(MINT_REFUSED);
      expect(await liveKeyCount(agentId)).toBe(0);
    }
  }, 20000);

  it("with a one-connection pool create, mint, revoke and archive complete: nothing nests a second connection", async () => {
    const url = new URL(target!);
    url.searchParams.delete("sslmode");
    const single = new Pool({
      connectionString: url.toString(),
      options: `-c search_path=${schema},public -c statement_timeout=5000`,
      max: 1,
      connectionTimeoutMillis: 2000,
    });
    const { query, transaction } = await import("@/lib/db");
    state.userId = await newUser();
    state.pool = single;
    try {
      // Control: this harness does catch a root query nested inside a transaction.
      await expect(transaction(async () => query("SELECT 1"))).rejects.toThrow(/timeout/i);

      const created = await within(createAgent(createInput()), "createAgent");
      expect(created).toMatchObject({ ok: true });
      if (!created.ok) throw new Error(created.error);
      const direct = await within(createAgentWithKey({
        operatedByUserId: state.userId, publicHandle: handle(), displayName: "Direct", modelTag: "integration-test", maxActiveAgentsForOperator: 10,
        keyExpiry: { kind: "days", days: 7 },
      }), "createAgentWithKey with a cap");
      expect(direct).toMatchObject({ ok: true });
      const minted = await within(mint(created.data.agent_id, "single"), "mintKey");
      expect(minted).toMatchObject({ ok: true });
      if (!minted.ok) throw new Error(minted.error);
      expect(await within(revokeKey({ key_id: minted.data.key_id }), "revokeKey")).toStrictEqual({ ok: true, data: { revoked: true, already_revoked: false } });
      expect(await within(archiveAgent({ agent_id: created.data.agent_id }), "archiveAgent")).toStrictEqual({ ok: true, data: { archived: true } });
    } finally {
      state.pool = pool;
      await single.end();
    }
  }, 20000);

  // ── Key expiry (0151) ────────────────────────────────────────────────

  const stored = async (keyId: string) =>
    (await pool.query(
      `SELECT expires_at, created_at,
              EXTRACT(EPOCH FROM expires_at - created_at)::float8 AS lifetime_seconds,
              to_char(expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') AS expires_utc
         FROM agent_keys WHERE id = $1`,
      [keyId],
    )).rows[0];

  it("mints with each choice and stores the instant from the database's clock", async () => {
    state.userId = await newUser();
    const created = await createAgent(createInput("7d"));
    if (!created.ok) throw new Error(created.error);
    const agentId = created.data.agent_id;
    const first = await stored(await firstKeyId(agentId));
    expect(first.lifetime_seconds).toBe(7 * 86400);
    expect(created.data.key_expires_at).toBe((first.expires_at as Date).toISOString());

    // Durations are exact multiples of 24 hours from the row's own created_at,
    // whatever the session's time zone (this cluster's is not UTC).
    for (const [choice, days] of [["30d", 30], ["90d", 90], ["365d", 365]] as const) {
      const minted = await mint(agentId, choice, choice);
      if (!minted.ok) throw new Error(minted.error);
      const row = await stored(minted.data.key_id);
      expect(row.lifetime_seconds, choice).toBe(days * 86400);
      expect(minted.data.key_expires_at).toBe((row.expires_at as Date).toISOString());
    }
    // A date ends at 00:00 UTC on that date; the furthest one offered.
    const { max } = keyExpiryDateRange();
    const dated = await mint(agentId, "dated", max);
    if (!dated.ok) throw new Error(dated.error);
    expect((await stored(dated.data.key_id)).expires_utc).toBe(`${max}T00:00:00.000000`);
    expect(dated.data.key_expires_at).toBe(`${max}T00:00:00.000Z`);

    expect(await liveKeyCount(agentId)).toBe(5);

    // Never: NULL is stored and returned, at create and at mint.
    const neverAgent = await createAgent(createInput("never"));
    if (!neverAgent.ok) throw new Error(neverAgent.error);
    expect(neverAgent.data.key_expires_at).toBeNull();
    expect((await stored(await firstKeyId(neverAgent.data.agent_id))).expires_at).toBeNull();
    const never = await mint(neverAgent.data.agent_id, "never", "never");
    if (!never.ok) throw new Error(never.error);
    expect((await stored(never.data.key_id)).expires_at).toBeNull();
    expect(never.data.key_expires_at).toBeNull();
  });

  it("refuses a missing or bad choice before touching the database", async () => {
    state.userId = await newUser();
    const agentId = await insertAgent(state.userId);
    for (const keyExpiry of [undefined, "", "90", "never ", "2020-01-01", keyExpiryDateRange().min.replace(/\d\d$/, "99")]) {
      const result = await mintKey({ agent_id: agentId, name: "bad", key_expiry: keyExpiry });
      expect(result, String(keyExpiry)).toMatchObject({ ok: false });
    }
    const unstated = { ...createInput(), key_expiry: undefined };
    expect(await createAgent(unstated)).toMatchObject({ ok: false });
    expect(await unrevokedKeyCount(agentId)).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS n FROM agents WHERE public_handle = $1", [unstated.public_handle])).rows[0].n).toBe(0);
  });

  it("through postgres.js, as production runs it: a date that has begun on the database's clock is a typed refusal, logged nowhere, and writes nothing", async () => {
    const DATE_PASSED = "That date has already begun (UTC). Choose a later date.";
    state.userId = await newUser();
    const agentId = await insertAgent(state.userId);
    const url = new URL(target!);
    url.searchParams.delete("sslmode");
    url.searchParams.set("search_path", schema);
    const compat = createCompatDb({ url: url.toString(), ssl: false, max: 2 });
    // Today's date began at 00:00 UTC, before this insert's NOW().
    const today = new Date().toISOString().slice(0, 10);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const createdHandle = handle();
    try {
      // Control: this driver names the field constraint_name, not constraint.
      const minted = mintRawToken();
      const raw = await compat.query(
        `INSERT INTO agent_keys (agent_id, key_hash, key_prefix, expires_at)
         VALUES ($1, $2, $3, $4::date::timestamp AT TIME ZONE 'UTC')`,
        [agentId, minted.hash, minted.prefix, today],
      ).then(() => null, (error: unknown) => error as Record<string, unknown>);
      expect(raw).toMatchObject({ code: "23514", constraint_name: "agent_keys_expiry_after_creation" });
      expect(raw?.constraint).toBeUndefined();

      state.compat = compat;
      // createAgentWithKey takes a parsed choice, so the app's range check is behind it.
      expect(await createAgentWithKey({
        operatedByUserId: state.userId, publicHandle: createdHandle, displayName: "Compat", modelTag: "integration-test",
        keyExpiry: { kind: "date", date: today },
      })).toStrictEqual({ ok: false, code: "expiry_date_passed", error: DATE_PASSED });

      // mintKey checks the range on the app's clock; a day behind, today still reads as tomorrow.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.now() - 86_400_000);
      const late = await mintKey({ agent_id: agentId, name: "late", key_expiry: today });
      vi.useRealTimers();
      expect(late).toStrictEqual({ ok: false, error: DATE_PASSED });
      expect(logged).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      state.compat = null;
      logged.mockRestore();
      await compat.close();
    }
    expect(await unrevokedKeyCount(agentId)).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS n FROM agents WHERE public_handle = $1", [createdHandle])).rows[0].n).toBe(0);
  });

  it("refuses a key name with control characters before any statement can fail, minting nothing", async () => {
    state.userId = await newUser();
    const agentId = await insertAgent(state.userId);
    for (const name of ["a\u0000b", "bell\u0007", "line\nbreak", "del\u007f", "next\u0085line"]) {
      expect(await mint(agentId, name), JSON.stringify(name)).toStrictEqual({ ok: false, error: "Key name cannot contain control characters." });
    }
    expect(await unrevokedKeyCount(agentId)).toBe(0);
    // Ordinary punctuation, accents and emoji are fine.
    expect(await mint(agentId, "Café laptop — 2026 😀")).toMatchObject({ ok: true });
  });

  it("the five-key cap counts live keys only: expired keys free their slot", async () => {
    state.userId = await newUser();
    const agentId = await insertAgent(state.userId);
    // Four keys that expired on the database's clock, and one live key.
    for (let i = 0; i < 4; i++) {
      const minted = mintRawToken();
      await pool.query(
        `INSERT INTO agent_keys (agent_id, key_hash, key_prefix, name, created_at, expires_at)
         VALUES ($1, $2, $3, 'expired', NOW() - interval '2 days', NOW() - interval '1 day')`,
        [agentId, minted.hash, minted.prefix],
      );
    }
    expect((await mint(agentId, "live-1")).ok).toBe(true);
    expect(await unrevokedKeyCount(agentId)).toBe(5);
    expect(await liveKeyCount(agentId)).toBe(1);

    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => mint(agentId, `k${i}`)));
    expect(results.filter((r) => r.ok)).toHaveLength(4);
    expect(results.filter((r) => !r.ok)).toStrictEqual(Array.from({ length: 4 }, () => ({ ok: false, error: KEY_CAP })));
    expect(await liveKeyCount(agentId)).toBe(5);
    expect(await unrevokedKeyCount(agentId)).toBe(9);

    // The operator can still revoke an expired key, and archive ends them all.
    const expiredId = (await pool.query(
      "SELECT id FROM agent_keys WHERE agent_id = $1 AND name = 'expired' ORDER BY id LIMIT 1", [agentId],
    )).rows[0].id as string;
    expect(await revokeKey({ key_id: expiredId, reason: "tidy" })).toStrictEqual({ ok: true, data: { revoked: true, already_revoked: false } });
    expect(await archiveAgent({ agent_id: agentId })).toStrictEqual({ ok: true, data: { archived: true } });
    expect(await unrevokedKeyCount(agentId)).toBe(0);
  });
});
