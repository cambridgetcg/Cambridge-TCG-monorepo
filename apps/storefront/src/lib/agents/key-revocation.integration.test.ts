// Opt-in: AGENT_AUTH_TEST_DATABASE_URL=postgres://<user>@127.0.0.1:<port>/agent_auth_test
// Real Postgres row locks for agent.revoke_key, the gate, stampKeyUse and the
// Coverage Hunt key share lock. archiveAgent is whichever operator-actions.ts
// this tree has, so the deadlock check also covers the transactional archive.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  pool: null as import("pg").Pool | null,
  userId: "",
  // Runs after each statement inside a transaction; the ordering test uses it
  // to hold a real Coverage Hunt transaction open right after its key lock.
  afterTxStatement: null as null | ((sql: string) => Promise<void>),
  txPids: [] as number[],
  recordTxPid: false,
  events: [] as string[],
}));
vi.mock("@/lib/db", () => ({
  query: (sql: string, args?: unknown[]) => state.pool!.query(sql, args),
  transaction: async (fn: (query: (sql: string, args?: unknown[]) => Promise<unknown>) => Promise<unknown>) => {
    const client = await state.pool!.connect();
    try {
      if (state.recordTxPid) state.txPids.push((await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
      await client.query("BEGIN");
      const result = await fn(async (sql, args) => {
        const out = await client.query(sql, args);
        await state.afterTxStatement?.(sql);
        return out;
      });
      state.events.push("tx-commit-sent");
      await client.query("COMMIT");
      return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  },
}));
// The operator session (archiveAgent's requireUser) is a fixed user.
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: state.userId } }) }));

import { resolveAgentBearer, stampKeyUse } from "./auth";
import { createAgentWithKey, mintRawToken } from "./creation";
import { revokePresentedKey } from "./key-revocation";
import { archiveAgent } from "./operator-actions";
import { ARCHIVE_REVOCATION_REASON, HOLDER_REVOCATION_REASON } from "./revocation-reasons";
import { createCoverageCandidate } from "@/lib/coverage-hunt/candidates";
import { persistCoverageHuntScoutTurn, persistCoverageHuntTurn } from "@/lib/coverage-hunt/db";
import type { ScoutSubmission } from "@/lib/coverage-hunt/types";

const target = process.env.AGENT_AUTH_TEST_DATABASE_URL;
const schema = `agent_auth_test_${randomUUID().replaceAll("-", "")}`;
const owner = randomUUID();
let admin: Pool;
let pool: Pool;
let seq = 0;

const scoutSubmission: ScoutSubmission = {
  role: "scout",
  claim: "insufficient",
  lanes: { facts: [], self_claims: [], inferences: [], unknowns: ["The public denominator is unknown."] },
  evidence: [],
  suggested_correction: null,
  boundary: "Public evidence only.",
};

function candidate() {
  seq += 1;
  return createCoverageCandidate({
    kind: "declared_observed_disagreement",
    target: { game_code: "op", source_id: "cardrush" },
    metrics: { observations: seq },
    observed_at: new Date().toISOString(),
    why_candidate: `Declared and observed coverage differ (${schema} ${seq}).`,
  });
}

/** A real operator-door agent and key (createAgentWithKey), plus optional extra keys. */
async function seedAgent(extraKeys = 0) {
  seq += 1;
  const handle = `kr${seq}-${randomUUID().slice(0, 8)}`;
  const created = await createAgentWithKey({
    operatedByUserId: owner,
    publicHandle: handle,
    displayName: `Integration ${seq}`,
    modelTag: "integration-test",
  });
  if (!created.ok) throw new Error(`seed failed: ${created.error}`);
  const keys = [{ keyId: created.key_id, token: created.token }];
  for (let i = 0; i < extraKeys; i++) {
    const minted = mintRawToken();
    const row = await pool.query(
      "INSERT INTO agent_keys (agent_id, key_hash, key_prefix, name) VALUES ($1, $2, $3, 'extra') RETURNING id",
      [created.agent_id, minted.hash, minted.prefix],
    );
    keys.push({ keyId: row.rows[0].id as string, token: minted.token });
  }
  return {
    agentId: created.agent_id,
    keys,
    actor: { agent_id: created.agent_id, operator_user_id: owner, public_handle: handle },
  };
}

const keyRow = async (keyId: string) =>
  (await pool.query("SELECT revoked_at, revoked_reason, last_used_at FROM agent_keys WHERE id = $1", [keyId])).rows[0];

const unknownToken = () => mintRawToken().token;

async function waitFor(check: () => Promise<boolean>, label: string, ms = 3000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for ${label}`);
}

function within<T>(promise: Promise<T>, label: string, ms = 3000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), ms)),
  ]);
}

/** Backends of this run that are waiting on a lock held by `pid`. */
async function blockedBy(pid: number) {
  return (
    await admin.query(
      "SELECT pid, query FROM pg_stat_activity WHERE application_name = $1 AND $2 = ANY(pg_blocking_pids(pid))",
      [schema, pid],
    )
  ).rows as { pid: number; query: string }[];
}

/** Backends of this run waiting on any lock (a second waiter on a row queues
 *  behind the first waiter's tuple lock, not behind the holder). */
async function lockWaiters(fragment: string) {
  return (
    await admin.query(
      "SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = $1 AND wait_event_type = 'Lock' AND position($2 in query) > 0",
      [schema, fragment],
    )
  ).rows[0].n as number;
}

/** Never hand a client back to the pool inside an open transaction. */
async function endAndRelease(client: PoolClient) {
  await client.query("ROLLBACK").catch(() => undefined);
  client.release();
}

/** Pause the next transaction right after its agent_keys FOR SHARE (lockLiveActorKey). */
function pauseAfterKeyShareLock() {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  let locked!: () => void;
  const keyLocked = new Promise<void>((resolve) => { locked = resolve; });
  let held = false;
  state.events = [];
  state.txPids = [];
  state.recordTxPid = true;
  state.afterTxStatement = async (sql) => {
    if (!held && /FROM agent_keys[\s\S]*FOR SHARE/.test(sql)) { held = true; locked(); await hold; }
  };
  return {
    keyLocked: () => within(keyLocked, "the contribution to take its key share lock"),
    release: () => release(),
    reset() { state.afterTxStatement = null; state.recordTxPid = false; release(); },
  };
}

describe.skipIf(!target)("agent key revocation isolated PostgreSQL integration", () => {
  beforeAll(async () => {
    // Explicit opt-in and exact throwaway DB; never inherit DATABASE_URL or contact a remote host.
    const url = new URL(target!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/agent_auth_test") throw new Error("Requires local agent_auth_test database.");
    url.searchParams.delete("sslmode");
    admin = new Pool({ connectionString: url.toString(), application_name: `${schema}_admin` });
    await admin.query(`CREATE SCHEMA ${schema}`);
    // statement_timeout: a lock wait that never ends fails fast instead of hanging the run.
    pool = new Pool({
      connectionString: url.toString(),
      application_name: schema,
      options: `-c search_path=${schema},public -c statement_timeout=5000`,
      max: 24,
    });
    state.pool = pool;
    state.userId = owner;
    // Pure FK target for agents.operated_by_user_id.
    await pool.query("CREATE TABLE users (id uuid PRIMARY KEY)");
    await pool.query("INSERT INTO users (id) VALUES ($1)", [owner]);
    for (const file of ["0090_agents.sql", "0112_agent_self_serve.sql", "0120_coverage_hunt.sql"]) {
      await pool.query(await readFile(new URL(`../../../drizzle/${file}`, import.meta.url), "utf8"));
    }
  });
  afterAll(async () => {
    state.pool = null;
    await pool?.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
  });

  it("revokes a live key once; a repeat answers exactly as an unknown key does", async () => {
    const { keys } = await seedAgent(2);
    const [live, other] = keys;

    const preview = await revokePresentedKey(live.token);
    expect(preview).toMatchObject({ performed: false, revoked: false, key_state: "active", other_live_keys: 2 });
    expect((await keyRow(live.keyId)).revoked_at).toBeNull();

    const performed = await revokePresentedKey(live.token, { confirm: true });
    const stored = await keyRow(live.keyId);
    expect(performed).toMatchObject({
      performed: true,
      revoked: true,
      key_state: "revoked",
      key_prefix: live.token.slice(0, 12),
      revoked_at: (stored.revoked_at as Date).toISOString(),
      // The CTE's outer SELECT sees the pre-update snapshot; the revoked key is excluded by id.
      other_live_keys: 2,
    });
    expect(stored.revoked_reason).toBe(HOLDER_REVOCATION_REASON);

    const repeat = await revokePresentedKey(live.token, { confirm: true });
    const unknown = await revokePresentedKey(unknownToken(), { confirm: true });
    expect(repeat).toStrictEqual(unknown);
    expect(repeat).toMatchObject({ performed: false, revoked: false, key_state: "not_active" });
    // The preview of a revoked key is the same answer too.
    expect(await revokePresentedKey(live.token)).toStrictEqual(await revokePresentedKey(unknownToken()));
    expect(await keyRow(live.keyId)).toEqual(stored);
    expect((await keyRow(other.keyId)).revoked_at).toBeNull();
  });

  it("two concurrent confirms on separate connections: exactly one performs, the other is not-active", async () => {
    const notActive = await revokePresentedKey(unknownToken(), { confirm: true });

    // Forced overlap: both UPDATEs queue behind one share lock, then race when it is released.
    const { keys: [forced] } = await seedAgent();
    const blocker: PoolClient = await pool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT 1 FROM agent_keys WHERE id = $1 FOR SHARE", [forced.keyId]);
      const blockerPid = (await blocker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid as number;
      const racing = Promise.all([
        revokePresentedKey(forced.token, { confirm: true }),
        revokePresentedKey(forced.token, { confirm: true }),
      ]);
      await waitFor(async () => (await blockedBy(blockerPid)).length >= 1 && (await lockWaiters("UPDATE agent_keys")) === 2, "both revocations to wait on the lock");
      await blocker.query("COMMIT");
      const results = await racing;
      expect(results.filter((r) => r.performed === true)).toHaveLength(1);
      expect(results.filter((r) => r.performed !== true)).toStrictEqual([notActive]);
    } finally { await endAndRelease(blocker); }

    // Unforced: plain Promise.all, many rounds.
    for (let round = 0; round < 15; round++) {
      const { keys: [key] } = await seedAgent();
      const results = await Promise.all([1, 2, 3].map(() => revokePresentedKey(key.token, { confirm: true })));
      expect(results.filter((r) => r.performed === true)).toHaveLength(1);
      expect(results.filter((r) => r.performed !== true)).toStrictEqual([notActive, notActive]);
    }
  }, 20000);

  it("after revocation the gate answers 401 unknown_or_revoked_key and stampKeyUse no longer stamps the key", async () => {
    const { keys: [key] } = await seedAgent();
    const before = await resolveAgentBearer(`Bearer ${key.token}`);
    expect(before).toMatchObject({ ok: true, actor: { keyId: key.keyId } });
    await stampKeyUse(key.keyId);
    const stamped = (await keyRow(key.keyId)).last_used_at as Date;
    expect(stamped).toBeInstanceOf(Date);

    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(await revokePresentedKey(key.token, { confirm: true })).toMatchObject({ performed: true });

    const after = await resolveAgentBearer(`Bearer ${key.token}`);
    expect(after).toStrictEqual({ ok: false, status: 401, reason_code: "unknown_or_revoked_key", error: "unknown or revoked key" });
    expect(after).toStrictEqual(await resolveAgentBearer(`Bearer ${unknownToken()}`));

    await new Promise((resolve) => setTimeout(resolve, 15));
    await stampKeyUse(key.keyId);
    expect((await keyRow(key.keyId)).last_used_at).toEqual(stamped);
  });

  it("a suspended (or archived) agent's key can still be revoked by its holder", async () => {
    const suspended = await seedAgent();
    await pool.query("UPDATE agents SET status = 'suspended', suspended_at = NOW(), suspended_reason = 'integration' WHERE id = $1", [suspended.agentId]);
    const [key] = suspended.keys;
    expect(await resolveAgentBearer(`Bearer ${key.token}`)).toMatchObject({ ok: false, status: 403, reason_code: "agent_suspended" });
    expect(await revokePresentedKey(key.token)).toMatchObject({ key_state: "active", performed: false });
    expect(await revokePresentedKey(key.token, { confirm: true })).toMatchObject({ performed: true, key_state: "revoked" });
    expect(await resolveAgentBearer(`Bearer ${key.token}`)).toMatchObject({ ok: false, status: 401, reason_code: "unknown_or_revoked_key" });

    const archived = await seedAgent();
    await pool.query("UPDATE agents SET status = 'archived', archived_at = NOW() WHERE id = $1", [archived.agentId]);
    expect(await revokePresentedKey(archived.keys[0].token, { confirm: true })).toMatchObject({ performed: true });
  });

  it("Coverage Hunt: a contribution holding its key's share lock delays the revocation; later contributions are refused key_revoked", async () => {
    const { keys: [key], actor } = await seedAgent();
    const pause = pauseAfterKeyShareLock();
    try {
      // The real persist path; it pauses right after lockLiveActorKey's FOR SHARE.
      const contribution = persistCoverageHuntScoutTurn({
        candidate: candidate(), actor, actor_key_id: key.keyId, client_request_id: "hold-1", submission: scoutSubmission,
      });
      await pause.keyLocked();
      const contributionPid = state.txPids[0];
      let revokeSettled = false;
      const revocation = revokePresentedKey(key.token, { confirm: true }).then((outcome) => {
        revokeSettled = true;
        state.events.push("revoke-settled");
        return outcome;
      });
      await waitFor(async () => (await blockedBy(contributionPid)).some((row) => row.query.includes("UPDATE agent_keys")), "the revocation to wait on the contribution");
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(revokeSettled).toBe(false);
      expect((await keyRow(key.keyId)).revoked_at).toBeNull();

      pause.release();
      const persisted = await contribution;
      expect(persisted).toMatchObject({ ok: true, idempotent: false, turn: { role: "scout" } });
      expect(await revocation).toMatchObject({ performed: true });
      // The revocation could not finish before the contribution's COMMIT was sent.
      expect(state.events.indexOf("tx-commit-sent")).toBeGreaterThanOrEqual(0);
      expect(state.events.indexOf("tx-commit-sent")).toBeLessThan(state.events.indexOf("revoke-settled"));
      const caseId = persisted.case.id;
      expect((await pool.query("SELECT count(*)::int AS n FROM coverage_hunt_turns WHERE agent_id = $1", [actor.agent_id])).rows[0].n).toBe(1);

      // After the revocation committed, both entry points refuse before writing anything.
      const fresh = candidate();
      await expect(persistCoverageHuntScoutTurn({
        candidate: fresh, actor, actor_key_id: key.keyId, client_request_id: "after-1", submission: scoutSubmission,
      })).rejects.toMatchObject({ name: "CoverageHuntError", code: "key_revoked" });
      await expect(persistCoverageHuntTurn({
        case_id: caseId, actor, actor_key_id: key.keyId, client_request_id: "after-2", submission: scoutSubmission,
      })).rejects.toMatchObject({ name: "CoverageHuntError", code: "key_revoked" });
      expect((await pool.query("SELECT count(*)::int AS n FROM coverage_hunt_cases WHERE candidate_fingerprint = $1", [fresh.fingerprint])).rows[0].n).toBe(0);
      expect((await pool.query("SELECT count(*)::int AS n FROM coverage_hunt_turns WHERE agent_id = $1", [actor.agent_id])).rows[0].n).toBe(1);
    } finally { pause.reset(); }
  }, 20000);

  it("Coverage Hunt: a contribution that meets an uncommitted revocation waits for it, then writes nothing", async () => {
    const { keys: [key], actor } = await seedAgent();
    const revoker: PoolClient = await pool.connect();
    try {
      await revoker.query("BEGIN");
      // The write half of key-revocation.ts's REVOKE_SQL, held open.
      await revoker.query(
        "UPDATE agent_keys SET revoked_at = NOW(), revoked_reason = $2 WHERE key_hash = (SELECT key_hash FROM agent_keys WHERE id = $1) AND revoked_at IS NULL",
        [key.keyId, HOLDER_REVOCATION_REASON],
      );
      const revokerPid = (await revoker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid as number;
      const fresh = candidate();
      const contribution = persistCoverageHuntScoutTurn({
        candidate: fresh, actor, actor_key_id: key.keyId, client_request_id: "meets-1", submission: scoutSubmission,
      });
      const settled = contribution.then(() => "ok", (error) => error);
      await waitFor(async () => (await blockedBy(revokerPid)).length === 1, "the contribution to wait on the revocation");
      await revoker.query("COMMIT");
      expect(await settled).toMatchObject({ name: "CoverageHuntError", code: "key_revoked" });
      expect((await pool.query("SELECT count(*)::int AS n FROM coverage_hunt_cases WHERE candidate_fingerprint = $1", [fresh.fingerprint])).rows[0].n).toBe(0);
    } finally { await endAndRelease(revoker); }
  }, 20000);

  it("Coverage Hunt and archiveAgent at their worst interleaving: archive waits on the key share lock and both finish", async () => {
    const { agentId, keys: [key], actor } = await seedAgent();
    const pause = pauseAfterKeyShareLock();
    try {
      const contribution = persistCoverageHuntScoutTurn({
        candidate: candidate(), actor, actor_key_id: key.keyId, client_request_id: "worst-1", submission: scoutSubmission,
      });
      await pause.keyLocked();
      const contributionPid = state.txPids[0];
      // archive's status update passes the contribution's agents KEY SHARE; its key revocation then waits on the key share lock.
      const archive = archiveAgent({ agent_id: agentId });
      await waitFor(async () => (await blockedBy(contributionPid)).some((row) => row.query.includes("UPDATE agent_keys")), "archiveAgent's key revocation to wait on the contribution");
      pause.release();
      // The contribution's later locks (the turn's FK KEY SHARE on agents) do not conflict with archive's row lock.
      expect(await contribution).toMatchObject({ ok: true });
      expect(await archive).toStrictEqual({ ok: true, data: { archived: true } });
    } finally { pause.reset(); }
    expect((await keyRow(key.keyId)).revoked_reason).toBe(ARCHIVE_REVOCATION_REASON);
    expect((await pool.query("SELECT status FROM agents WHERE id = $1", [agentId])).rows[0].status).toBe("archived");
  }, 20000);

  it("contributions, holder revocations, stamps and archiveAgent never deadlock under concurrency", async () => {
    const rounds = 40;
    const agents = await Promise.all(Array.from({ length: rounds }, () => seedAgent(1)));
    const results = await Promise.allSettled(
      agents.flatMap(({ agentId, keys: [k1, k2], actor }) => [
        persistCoverageHuntScoutTurn({ candidate: candidate(), actor, actor_key_id: k1.keyId, client_request_id: "race-1", submission: scoutSubmission }),
        persistCoverageHuntScoutTurn({ candidate: candidate(), actor, actor_key_id: k2.keyId, client_request_id: "race-2", submission: scoutSubmission }),
        archiveAgent({ agent_id: agentId }),
        revokePresentedKey(k1.token, { confirm: true }),
        stampKeyUse(k2.keyId),
        revokePresentedKey(k2.token),
      ]),
    );
    // Only an orderly refusal is allowed: no deadlock (40P01), no statement timeout (57014), nothing else.
    const unexpected = results.filter(
      (r) => r.status === "rejected" && !(r.reason?.name === "CoverageHuntError" && r.reason?.code === "key_revoked"),
    );
    expect(unexpected.map((r) => (r as PromiseRejectedResult).reason?.code ?? String((r as PromiseRejectedResult).reason))).toEqual([]);
    const values = results.flatMap((r) => (r.status === "fulfilled" ? [r.value as Record<string, unknown> | undefined] : []));
    expect(values.filter((v) => v && "key_state" in v && v.key_state === "unknown")).toEqual([]);
    expect(values.filter((v) => v && "ok" in v && v.ok === false && "error" in v)).toEqual([]);
    const ids = agents.map((a) => a.agentId);
    expect((await pool.query("SELECT count(*)::int AS n FROM agents WHERE id = ANY($1) AND status = 'archived'", [ids])).rows[0].n).toBe(rounds);
    expect((await pool.query("SELECT count(*)::int AS n FROM agent_keys WHERE agent_id = ANY($1) AND revoked_at IS NULL", [ids])).rows[0].n).toBe(0);
  }, 20000);

  it("with a one-connection pool the Coverage Hunt write and the revocation complete (nothing nests)", async () => {
    const url = new URL(target!);
    url.searchParams.delete("sslmode");
    const single = new Pool({
      connectionString: url.toString(),
      application_name: schema,
      options: `-c search_path=${schema},public -c statement_timeout=5000`,
      max: 1,
      connectionTimeoutMillis: 2000,
    });
    const { query, transaction } = await import("@/lib/db");
    state.pool = single;
    try {
      // Control: this harness does catch a root query nested inside a transaction.
      await expect(transaction(async () => query("SELECT 1"))).rejects.toThrow(/timeout/i);
      const { keys: [key], actor } = await seedAgent();
      expect(await persistCoverageHuntScoutTurn({
        candidate: candidate(), actor, actor_key_id: key.keyId, client_request_id: "single-1", submission: scoutSubmission,
      })).toMatchObject({ ok: true });
      expect(await revokePresentedKey(key.token, { confirm: true })).toMatchObject({ performed: true });
      await expect(persistCoverageHuntScoutTurn({
        candidate: candidate(), actor, actor_key_id: key.keyId, client_request_id: "single-2", submission: scoutSubmission,
      })).rejects.toMatchObject({ code: "key_revoked" });
    } finally {
      state.pool = pool;
      await single.end();
    }
  }, 15000);
});
