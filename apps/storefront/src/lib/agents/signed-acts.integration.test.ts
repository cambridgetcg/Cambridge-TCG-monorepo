// Opt-in: AGENT_AUTH_TEST_DATABASE_URL=postgres://<user>@127.0.0.1:<port>/agent_auth_test
// Held keys on real PostgreSQL (docs/plans/agent-auth/held-keys.md, build
// step 5): one act submitted twice; an act that waits on a removal's locks,
// and a signed mint that waits on the operator's mint at the cap (each seen
// waiting, so the locks are proven, not just the outcomes); a signed mint
// racing the operator's mint at the cap; two agents confirming one key; the
// nonce purge. Also the whole path once, migration 0152's guard and
// erasure, a one-connection pool, the maintenance sweep, and acts made by
// the reference signer (examples/agents/held-key-signer.mjs). Transactions
// run through postgres.js (@cambridge-tcg/db/compat), as production's do:
// it rolls back a whole transaction after any failed statement, so the act
// path must refuse without one, and this is where that is shown.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import crypto, { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { ed25519 } from "@noble/curves/ed25519.js";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  db: null as import("@cambridge-tcg/db/compat").CompatDbInstance | null,
  pool: null as import("pg").Pool | null,
  userId: "",
}));
vi.mock("@/lib/db", () => ({
  query: (sql: string, args?: unknown[]) => state.db!.query(sql, args),
  transaction: (fn: Parameters<import("@cambridge-tcg/db/compat").CompatDbInstance["transaction"]>[0]) => state.db!.transaction(fn),
}));
vi.mock("@/lib/auth", () => ({
  auth: async () => {
    await state.db!.query("SELECT id FROM users WHERE id = $1", [state.userId]);
    return { user: { id: state.userId } };
  },
}));

import { createCompatDb } from "@cambridge-tcg/db/compat";
import { hashAgentToken, resolveAgentBearer } from "./auth";
import { mintKey } from "./operator-actions";
import { SIGNED_ACT_LIMITS } from "./signed-act-config";
import { createActLimiter } from "./signed-act-limits";
import { currentDisclosure, disclosureSha256 } from "./signed-act-disclosures";
import { ed25519Thumbprint } from "./signed-act-verify";
import { submitAgentAct, type AgentActAnswer } from "./signed-acts";
import { bindSigningKey, listSigningKeys, removeSigningKey } from "./signing-key-actions";
import { runSignedActSweep, SIGNED_ACT_SWEEP_JOB } from "./signed-act-sweep";

const target = process.env.AGENT_AUTH_TEST_DATABASE_URL;
const schema = `held_keys_test_${randomUUID().replaceAll("-", "")}`;
const AUD = "https://cambridgetcg.com";
const ENV = { AGENT_SIGNED_ACTS: "on", AGENT_SIGNED_ACTS_AUDIENCE: AUD };
const MINT_DISCLOSURE = disclosureSha256(currentDisclosure("key.mint").text);
let admin: Pool;
let pool: Pool;
let seq = 0;

const b64u = (bytes: Uint8Array | string) => Buffer.from(bytes).toString("base64url");

function compatUrl(): string {
  const url = new URL(target!);
  url.searchParams.delete("sslmode");
  url.searchParams.set("search_path", schema);
  return url.toString();
}

function holder() {
  const secretKey = ed25519.utils.randomSecretKey();
  const x = b64u(ed25519.getPublicKey(secretKey));
  return { secretKey, x, kid: ed25519Thumbprint(x), jwk: JSON.stringify({ kty: "OKP", crv: "Ed25519", x }) };
}
type Holder = ReturnType<typeof holder>;

function sign(h: Holder, agentId: string, act: string, params: Record<string, string> = {}, iatOffset = 0) {
  const iat = Math.floor(Date.now() / 1000) + iatOffset;
  const header = b64u(JSON.stringify({ alg: "Ed25519", typ: "ctcg-act.v1", kid: h.kid }));
  const payload = b64u(JSON.stringify({ aud: AUD, act, sub: agentId, iat, exp: iat + 120, jti: b64u(crypto.randomBytes(16)), params }));
  return `${header}.${payload}.${b64u(ed25519.sign(Buffer.from(`${header}.${payload}`), h.secretKey))}`;
}

const submit = (act: string) => submitAgentAct({ act, preview: null }, { clientAddress: "203.0.113.1", env: ENV, limiter: createActLimiter() });

/** A usage key's secret, made as the reference signer would, and its mint params. */
function usageKey(expires = "30d") {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const token = "ctcg_agt_" + Array.from(crypto.randomBytes(22), (b) => alphabet[b % 62]).join("");
  return { token, params: { key_sha256: hashAgentToken(token), key_prefix: token.slice(0, 12), expires, name: "signed", preview_sha256: MINT_DISCLOSURE } };
}

async function newUser() {
  const id = randomUUID();
  await pool.query("INSERT INTO users (id) VALUES ($1)", [id]);
  return id;
}

async function insertAgent(userId: string, opts: { status?: string; registeredVia?: string } = {}) {
  seq += 1;
  const row = await pool.query(
    `INSERT INTO agents (operated_by_user_id, public_handle, display_name, model_tag, status, registered_via)
     VALUES ($1, $2, 'Held keys', 'integration-test', $3, $4) RETURNING id`,
    [userId, `hk${seq}-${randomUUID().slice(0, 8)}`, opts.status ?? "active", opts.registeredVia ?? "operator"],
  );
  return row.rows[0].id as string;
}

/** A signing key written straight into the tables, as a direct database
 *  write would, past every check binding makes. */
async function insertSigningKey(agentId: string, h: Holder, alg = "Ed25519") {
  const event = randomUUID();
  await state.db!.transaction(async (tx) => {
    await tx(`INSERT INTO agent_act_events (id, agent_id, basis, act, outcome, thumbprint) VALUES ($1, $2, 'operator', 'signing_key.bind', 'applied', $3)`, [event, agentId, h.kid]);
    await tx(
      `INSERT INTO agent_signing_keys (agent_id, thumbprint, public_key, alg, bound_by_event, confirmed_at) VALUES ($1, $2, $3, $4, $5, NOW())`,
      [agentId, h.kid, Buffer.from(h.x, "base64url"), alg, event],
    );
  });
}

/** A fresh operator, agent and bound key; confirmed by a signer.check unless asked not to. */
async function setup(opts: { confirm?: boolean } = {}) {
  const userId = await newUser();
  state.userId = userId;
  const agentId = await insertAgent(userId);
  const h = holder();
  const bound = await bindSigningKey({ agent_id: agentId, public_jwk: h.jwk, key_expiry: "90d" });
  if (!bound.ok) throw new Error(bound.error);
  if (opts.confirm !== false) expectApplied(await submit(sign(h, agentId, "signer.check")));
  return { userId, agentId, h, signingKeyId: bound.data.signing_key_id };
}

function expectApplied(answer: AgentActAnswer) {
  if (!answer.ok) throw new Error(`refused: ${answer.refusal.reason_code} ${answer.refusal.detail ?? ""}`);
  return answer;
}
const codeOf = (answer: AgentActAnswer) => (answer.ok ? "applied" : answer.refusal.reason_code);

/** One connection holding a transaction open, and its backend's pid. */
async function lockHolder() {
  const client = await pool.connect();
  await client.query("BEGIN");
  const pid = (await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid as number;
  return { client, pid };
}

/** True once some backend is waiting on a lock `pid` holds; false after ~3 s. */
async function blockedBy(pid: number): Promise<boolean> {
  for (let i = 0; i < 60; i += 1) {
    const waiting = await pool.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))`, [pid]);
    if (waiting.rows[0].n > 0) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

const liveUsageKeys = async (agentId: string) =>
  (await pool.query(`SELECT count(*)::int AS n FROM agent_keys WHERE agent_id = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())`, [agentId])).rows[0].n as number;
const events = async (agentId: string) =>
  (await pool.query(`SELECT id, basis, act, outcome, refusal, act_sha256, thumbprint FROM agent_act_events WHERE agent_id = $1 ORDER BY created_at, id`, [agentId])).rows;

describe.skipIf(!target)("held keys on isolated PostgreSQL", () => {
  beforeAll(async () => {
    // Explicit opt-in and exact throwaway DB; never DATABASE_URL, never a remote host.
    const url = new URL(target!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/agent_auth_test") throw new Error("Requires local agent_auth_test database.");
    vi.stubEnv("AGENT_SIGNED_ACTS", "on");
    vi.stubEnv("AGENT_SIGNED_ACTS_AUDIENCE", AUD);
    url.searchParams.delete("sslmode");
    admin = new Pool({ connectionString: url.toString() });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: url.toString(), options: `-c search_path=${schema},public -c statement_timeout=5000`, max: 8 });
    state.pool = pool;
    await pool.query("CREATE TABLE users (id uuid PRIMARY KEY)");
    for (const file of ["0090_agents.sql", "0112_agent_self_serve.sql", "0148_ops_observability.sql", "0150_mcp_daily_agent_revoke_key.sql", "0151_agent_key_expiry.sql", "0152_agent_signing_keys.sql"]) {
      await pool.query(await readFile(new URL(`../../../drizzle/${file}`, import.meta.url), "utf8"));
    }
    state.db = createCompatDb({ url: compatUrl(), ssl: false, max: 16 });
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await state.db?.close();
    state.db = null;
    await pool?.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
  });

  it("runs the whole path once: bind, confirm, mint, use, revoke, retire", async () => {
    const { userId, agentId, h, signingKeyId } = await setup({ confirm: false });
    const pending = await listSigningKeys({ agent_id: agentId });
    if (!pending.ok || !pending.data.open) throw new Error("list failed");
    expect(pending.data.signing_keys.map((k) => [k.kid, k.state])).toEqual([[h.kid, "pending"]]);

    // signer.check confirms the pending key and returns the agent's record.
    const check = expectApplied(await submit(sign(h, agentId, "signer.check")));
    expect(check.body).toMatchObject({
      act: "signer.check", outcome: "applied", signing_key_confirmed: true,
      agent: { id: agentId, status: "active" },
      signing_keys: [{ kid: h.kid, state: "confirmed", bound_by: "operator" }],
      usage_keys: [],
      verification: { alg: "Ed25519", canonicalization: "none" },
    });

    // key.mint: the hash and prefix only; the key then authenticates at the gate.
    const key = usageKey("7d");
    const minted = expectApplied(await submit(sign(h, agentId, "key.mint", key.params)));
    const receipt = minted.body.receipt as { event_id: string; act_sha256: string };
    expect(minted.body).toMatchObject({ key: { key_prefix: key.params.key_prefix, minted_by_event: receipt.event_id } });
    expect(JSON.stringify(minted.body)).not.toContain(key.token);
    const gate = await resolveAgentBearer(`Bearer ${key.token}`);
    expect(gate).toMatchObject({ ok: true, actor: { agentId, registeredVia: "operator" } });
    const stored = (await pool.query(`SELECT minted_by_event, EXTRACT(EPOCH FROM expires_at - created_at)::float8 AS life FROM agent_keys WHERE key_hash = $1`, [key.params.key_sha256])).rows[0];
    expect(stored).toEqual({ minted_by_event: receipt.event_id, life: 7 * 86400 });
    const listed = await listSigningKeys({ agent_id: agentId });
    if (!listed.ok || !listed.data.open) throw new Error("list failed");
    expect(listed.data.signed_mints).toMatchObject([{ key_prefix: key.params.key_prefix, minted_by_event: receipt.event_id, minted_by_kid: h.kid }]);

    // The event keeps the act as sent, and the database checks its digest.
    const event = (await pool.query(`SELECT act_jws, act_sha256, verification, effect FROM agent_act_events WHERE id = $1`, [receipt.event_id])).rows[0];
    expect(crypto.createHash("sha256").update(event.act_jws).digest("hex")).toBe(event.act_sha256);
    expect(event.act_sha256).toBe(receipt.act_sha256);
    expect(event.effect).toMatchObject({ minted_key_id: (minted.body.key as { key_id: string }).key_id });

    // A wrong disclosure digest, a reused hash, a malformed prefix: recorded refusals.
    expect(codeOf(await submit(sign(h, agentId, "key.mint", { ...usageKey().params, preview_sha256: "0".repeat(64) })))).toBe("act_disclosure_stale");
    const reused = await submit(sign(h, agentId, "key.mint", { ...usageKey().params, key_sha256: key.params.key_sha256 }));
    expect(reused).toMatchObject({ ok: false, status: 422, refusal: { reason_code: "act_params_invalid", detail: "key_sha256 malformed or in use" } });
    expect(codeOf(await submit(sign(h, agentId, "key.mint", { ...usageKey().params, key_prefix: "ctcg_agt_" })))).toBe("act_params_invalid");
    expect(await liveUsageKeys(agentId)).toBe(1);

    // key.revoke by key_id, twice: the second answers already revoked.
    const keyId = (minted.body.key as { key_id: string }).key_id;
    const revoked = expectApplied(await submit(sign(h, agentId, "key.revoke", { key_id: keyId })));
    expect(revoked.body).toMatchObject({ revoked: { key_id: keyId, already_revoked: false } });
    expect(expectApplied(await submit(sign(h, agentId, "key.revoke", { key_id: keyId }))).body).toMatchObject({ revoked: { already_revoked: true } });
    expect(await resolveAgentBearer(`Bearer ${key.token}`)).toMatchObject({ ok: false, reason_code: "unknown_or_revoked_key" });
    expect(codeOf(await submit(sign(h, agentId, "key.revoke", { key_id: randomUUID() })))).toBe("act_params_invalid");

    // Retire the signing key itself; it then signs nothing.
    expect(codeOf(await submit(sign(h, agentId, "key.revoke", { kid: holder().kid })))).toBe("act_params_invalid");
    const retired = expectApplied(await submit(sign(h, agentId, "key.revoke", { kid: h.kid })));
    const retiredEvent = (retired.body.receipt as { event_id: string }).event_id;
    const ended = await submit(sign(h, agentId, "signer.check"));
    expect(ended).toMatchObject({ ok: false, status: 403, refusal: { reason_code: "signing_key_ended", revoked_by_event: retiredEvent } });
    expect((await pool.query(`SELECT revocation_kind, revoked_by_event FROM agent_signing_keys WHERE id = $1`, [signingKeyId])).rows[0])
      .toEqual({ revocation_kind: "holder-retired", revoked_by_event: retiredEvent });

    // Every act is in the record, with its outcome; the binding too.
    const all = await events(agentId);
    expect(all.map((row) => [row.basis, row.act, row.outcome, row.refusal])).toEqual([
      ["operator", "signing_key.bind", "applied", null],
      ["signed-act", "signer.check", "applied", null],
      ["signed-act", "key.mint", "applied", null],
      ["signed-act", "key.mint", "refused", "act_disclosure_stale"],
      ["signed-act", "key.mint", "refused", "act_params_invalid"],
      ["signed-act", "key.mint", "refused", "act_params_invalid"],
      ["signed-act", "key.revoke", "applied", null],
      ["signed-act", "key.revoke", "applied", null],
      ["signed-act", "key.revoke", "refused", "act_params_invalid"],
      ["signed-act", "key.revoke", "refused", "act_params_invalid"],
      ["signed-act", "key.revoke", "applied", null],
      ["signed-act", "signer.check", "refused", "signing_key_ended"],
    ]);
    void userId;
  });

  it("applies one act submitted twice exactly once, in parallel or in turn; the replay writes no event", async () => {
    const { agentId, h } = await setup();
    for (let round = 0; round < 5; round += 1) {
      const act = sign(h, agentId, "key.mint", usageKey().params);
      const before = (await events(agentId)).length;
      const answers = await Promise.all([submit(act), submit(act), submit(act)]);
      expect(answers.map(codeOf).sort()).toEqual(["act_replayed", "act_replayed", "applied"]);
      expect((await events(agentId)).length).toBe(before + 1);
      expect(codeOf(await submit(act))).toBe("act_replayed");
    }
    expect(await liveUsageKeys(agentId)).toBe(5);
    expect((await pool.query(`SELECT count(*)::int AS n FROM agent_act_nonces WHERE thumbprint = $1`, [h.kid])).rows[0].n).toBe(6);
  }, 20000);

  it("makes an act wait for an operator's removal that holds its locks, then refuses it: the key has ended", async () => {
    const { agentId, h, signingKeyId } = await setup();
    // The removal's statements, in its order, held open: the agent row, an
    // event, the key row revoked.
    const { client, pid } = await lockHolder();
    let answer: AgentActAnswer;
    try {
      await client.query(`SELECT id FROM agents WHERE id = $1 FOR NO KEY UPDATE`, [agentId]);
      const removal = randomUUID();
      await client.query(`INSERT INTO agent_act_events (id, agent_id, basis, act, outcome, thumbprint) VALUES ($1, $2, 'operator', 'signing_key.remove', 'applied', $3)`, [removal, agentId, h.kid]);
      await client.query(`UPDATE agent_signing_keys SET revoked_at = NOW(), revoked_by_event = $2, revocation_kind = 'operator-removed' WHERE id = $1`, [signingKeyId, removal]);
      const pending = submit(sign(h, agentId, "key.mint", usageKey().params));
      // The act is seen waiting on the removal's locks before the removal commits.
      expect(await blockedBy(pid)).toBe(true);
      await client.query("COMMIT");
      answer = await pending;
      expect(answer).toMatchObject({ ok: false, status: 403, refusal: { reason_code: "signing_key_ended", revoked_by_event: removal } });
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
    expect(await liveUsageKeys(agentId)).toBe(0);
    expect((await events(agentId)).map((row) => row.refusal).at(-1)).toBe("signing_key_ended");
  });

  it("makes a signed mint wait for the operator's mint that holds the agent row at the cap's edge, then refuses it at the cap", async () => {
    const { userId, agentId, h } = await setup();
    for (let i = 0; i < 4; i += 1) expect((await mintKey({ agent_id: agentId, name: `k${i}`, key_expiry: "30d" })).ok).toBe(true);
    state.userId = userId;
    // The operator's mint, held open: the agent row, then the fifth key.
    const { client, pid } = await lockHolder();
    try {
      await client.query(`SELECT id FROM agents WHERE id = $1 FOR NO KEY UPDATE`, [agentId]);
      await client.query(`INSERT INTO agent_keys (agent_id, key_hash, key_prefix, name) VALUES ($1, $2, 'ctcg_agt_Op5', 'operator')`, [agentId, crypto.randomBytes(32).toString("hex")]);
      const pending = submit(sign(h, agentId, "key.mint", usageKey().params));
      expect(await blockedBy(pid)).toBe(true);
      await client.query("COMMIT");
      expect(await pending).toMatchObject({ ok: false, status: 409, refusal: { reason_code: "key_cap_reached" } });
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
    expect(await liveUsageKeys(agentId)).toBe(5);
  });

  it("judges expiry, lapse and staleness by the database's clock after the locks are held, not when the transaction began", async () => {
    const dbEpoch = async () => Number((await pool.query(`SELECT EXTRACT(EPOCH FROM clock_timestamp())::float8 AS t`)).rows[0].t);
    /** Holds the agent row while `act` waits for it, until the database's clock passes `until`. */
    async function behindLock(agentId: string, act: string, until: number) {
      const { client, pid } = await lockHolder();
      try {
        await client.query(`SELECT id FROM agents WHERE id = $1 FOR NO KEY UPDATE`, [agentId]);
        const pending = submit(act);
        expect(await blockedBy(pid)).toBe(true);
        while ((await dbEpoch()) < until + 0.2) await new Promise((resolve) => setTimeout(resolve, 50));
        await client.query("COMMIT");
        return await pending;
      } finally {
        await client.query("ROLLBACK").catch(() => {});
        client.release();
      }
    }

    // Stale: exp passes while the act waits.
    const stale = await setup();
    const iat = Math.floor(Date.now() / 1000);
    const header = b64u(JSON.stringify({ alg: "Ed25519", typ: "ctcg-act.v1", kid: stale.h.kid }));
    const payload = b64u(JSON.stringify({ aud: AUD, act: "key.mint", sub: stale.agentId, iat, exp: iat + 1, jti: b64u(crypto.randomBytes(16)), params: usageKey().params }));
    const shortLived = `${header}.${payload}.${b64u(ed25519.sign(Buffer.from(`${header}.${payload}`), stale.h.secretKey))}`;
    const staleAnswer = await behindLock(stale.agentId, shortLived, iat + 1);
    expect(staleAnswer).toMatchObject({ ok: false, status: 400, refusal: { reason_code: "act_stale" } });
    if (!staleAnswer.ok) expect(Date.parse(staleAnswer.refusal.server_time!) / 1000).toBeGreaterThanOrEqual(iat + 1);
    expect(await liveUsageKeys(stale.agentId)).toBe(0);

    // Expired: the key's not_after passes while the act waits.
    const expiring = await setup();
    const notAfter = (await pool.query(
      `UPDATE agent_signing_keys SET not_after = clock_timestamp() + interval '1 second' WHERE id = $1 RETURNING EXTRACT(EPOCH FROM not_after)::float8 AS t`,
      [expiring.signingKeyId],
    )).rows[0].t as number;
    const expired = await behindLock(expiring.agentId, sign(expiring.h, expiring.agentId, "signer.check"), notAfter);
    expect(expired).toMatchObject({ ok: false, status: 403, refusal: { reason_code: "signing_key_ended" } });
    if (!expired.ok) expect(Math.abs(Date.parse(expired.refusal.ended_at!) - notAfter * 1000)).toBeLessThan(2);

    // Lapsed: a pending key's window closes while its first act waits.
    const pending = await setup({ confirm: false });
    const lapsesAt = (await pool.query(
      `UPDATE agent_signing_keys SET created_at = clock_timestamp() - interval '7 days' + interval '1 second' WHERE id = $1
       RETURNING EXTRACT(EPOCH FROM created_at + interval '7 days')::float8 AS t`,
      [pending.signingKeyId],
    )).rows[0].t as number;
    expect(await behindLock(pending.agentId, sign(pending.h, pending.agentId, "signer.check"), lapsesAt)).toMatchObject({
      ok: false, status: 403, refusal: { reason_code: "signing_key_ended" },
    });
    expect((await pool.query(`SELECT confirmed_at FROM agent_signing_keys WHERE id = $1`, [pending.signingKeyId])).rows[0].confirmed_at).toBeNull();
    // Leave no week-old pending key for the sweep's count below.
    await pool.query(`DELETE FROM agent_signing_keys WHERE id = $1`, [pending.signingKeyId]);
  }, 20000);

  it("never passes five live usage keys when a signed mint races the operator's mint at the cap", async () => {
    for (let round = 0; round < 8; round += 1) {
      const { userId, agentId, h } = await setup();
      for (let i = 0; i < 4; i += 1) expect((await mintKey({ agent_id: agentId, name: `k${i}`, key_expiry: "30d" })).ok).toBe(true);
      state.userId = userId;
      const [operator, signed] = await Promise.all([
        mintKey({ agent_id: agentId, name: "operator", key_expiry: "30d" }),
        submit(sign(h, agentId, "key.mint", usageKey().params)),
      ]);
      expect(await liveUsageKeys(agentId)).toBe(5);
      expect([operator.ok, signed.ok].filter(Boolean)).toHaveLength(1);
      if (!signed.ok) expect(signed.refusal.reason_code).toBe("key_cap_reached");
      if (!operator.ok) expect(operator.error).toBe("This agent already has 5 active keys. Revoke one first.");
    }
  }, 30000);

  it("binds a key again once its pending window has lapsed, without the operator removing the old row first", async () => {
    const { userId, agentId, h, signingKeyId } = await setup({ confirm: false });
    await pool.query(`UPDATE agent_signing_keys SET created_at = created_at - interval '8 days' WHERE id = $1`, [signingKeyId]);
    expect(codeOf(await submit(sign(h, agentId, "signer.check")))).toBe("signing_key_ended");
    state.userId = userId;
    const again = await bindSigningKey({ agent_id: agentId, public_jwk: h.jwk, key_expiry: "30d" });
    expect(again).toMatchObject({ ok: true, data: { kid: h.kid, state: "pending" } });
    if (!again.ok) throw new Error(again.error);
    // The lapsed row is gone, as the sweep would have taken it; the new one confirms.
    expect((await pool.query(`SELECT id FROM agent_signing_keys WHERE agent_id = $1`, [agentId])).rows.map((row) => row.id)).toEqual([again.data.signing_key_id]);
    expect(expectApplied(await submit(sign(h, agentId, "signer.check"))).body).toMatchObject({ signing_key_confirmed: true });
    expect((await events(agentId)).map((row) => [row.act, row.refusal])).toEqual([
      ["signing_key.bind", null],
      ["signer.check", "signing_key_ended"],
      ["signing_key.bind", null],
      ["signer.check", null],
    ]);
    // A pending key still inside its window stays bound.
    const fresh = await setup({ confirm: false });
    expect(await bindSigningKey({ agent_id: fresh.agentId, public_jwk: fresh.h.jwk, key_expiry: "30d" })).toEqual({ ok: false, error: "This key is already bound to this agent." });
  });

  it("lets only one of two agents confirm one key; the other's holder alone learns it is in use", async () => {
    for (let round = 0; round < 8; round += 1) {
      const h = holder();
      const agents: string[] = [];
      for (let i = 0; i < 2; i += 1) {
        state.userId = await newUser();
        const agentId = await insertAgent(state.userId);
        // The paste form never says the key is bound elsewhere.
        const bound = await bindSigningKey({ agent_id: agentId, public_jwk: h.jwk, key_expiry: "never" });
        expect(bound).toMatchObject({ ok: true, data: { state: "pending" } });
        agents.push(agentId);
      }
      const answers = await Promise.all(agents.map((agentId) => submit(sign(h, agentId, "signer.check"))));
      expect(answers.map(codeOf).sort()).toEqual(["applied", "signing_key_in_use"]);
      const confirmed = (await pool.query(`SELECT count(*)::int AS n FROM agent_signing_keys WHERE thumbprint = $1 AND confirmed_at IS NOT NULL`, [h.kid])).rows[0].n;
      expect(confirmed).toBe(1);
      const loser = agents[answers.findIndex((answer) => !answer.ok)];
      expect((await events(loser)).map((row) => row.refusal)).toEqual([null, "signing_key_in_use"]);
      // It stays in use for that agent: a later act gets the same answer.
      expect(codeOf(await submit(sign(h, loser, "signer.check")))).toBe("signing_key_in_use");
    }
  }, 30000);

  it("purges expired nonces a few at a time inside acts, and keeps live ones", async () => {
    const { agentId, h } = await setup();
    const stale = holder().kid;
    await pool.query(
      `INSERT INTO agent_act_nonces (thumbprint, jti, expires_at)
       SELECT $1, 'expired-' || g, NOW() - make_interval(secs => g) FROM generate_series(1, 40) g`,
      [stale],
    );
    const count = async (kid: string) => (await pool.query(`SELECT count(*)::int AS n FROM agent_act_nonces WHERE thumbprint = $1`, [kid])).rows[0].n as number;
    expect(await count(stale)).toBe(40);
    expectApplied(await submit(sign(h, agentId, "signer.check")));
    expect(await count(stale)).toBe(24);
    expectApplied(await submit(sign(h, agentId, "signer.check")));
    expectApplied(await submit(sign(h, agentId, "signer.check")));
    expect(await count(stale)).toBe(0);
    // This key's own nonces (setup's check and these three) are live: kept.
    expect(await count(h.kid)).toBe(4);
    const live = (await pool.query(`SELECT bool_and(expires_at > NOW() + interval '150 seconds') AS ok FROM agent_act_nonces WHERE thumbprint = $1`, [h.kid])).rows[0].ok;
    expect(live).toBe(true);
  });

  it("refuses by the database's clock, consumes the nonce of a refused act, and refuses minting for a suspended agent", async () => {
    const { agentId, h } = await setup();
    // iat 200 s ahead: past the database's 60 s of skew, inside the app's 300.
    const ahead = sign(h, agentId, "signer.check", {}, 200);
    expect(await submit(ahead)).toMatchObject({ ok: false, refusal: { reason_code: "act_stale", receipt: { act_sha256: expect.any(String) } } });
    expect(codeOf(await submit(ahead))).toBe("act_replayed");
    await pool.query(`UPDATE agents SET status = 'suspended', suspended_at = NOW() WHERE id = $1`, [agentId]);
    expect(await submit(sign(h, agentId, "key.mint", usageKey().params))).toMatchObject({ ok: false, status: 403, refusal: { reason_code: "agent_suspended" } });
    expect(codeOf(await submit(sign(h, agentId, "signer.check")))).toBe("applied");
    expect(await liveUsageKeys(agentId)).toBe(0);
  });

  it("refuses a key name with control characters as act_params_invalid, before any statement can fail", async () => {
    const { agentId, h } = await setup();
    const nonces = async () => (await pool.query(`SELECT count(*)::int AS n FROM agent_act_nonces WHERE thumbprint = $1`, [h.kid])).rows[0].n as number;
    for (const name of ["a\u0000b", "line\nbreak", "bell\u0007", "del\u007f", "next\u0085line"]) {
      const before = { nonces: await nonces(), events: (await events(agentId)).length };
      const answer = await submit(sign(h, agentId, "key.mint", { ...usageKey().params, name }));
      expect(answer, JSON.stringify(name)).toMatchObject({ ok: false, status: 422, verified: true, refusal: { reason_code: "act_params_invalid", detail: "name" } });
      // A recorded refusal: the nonce is used up and the event written.
      expect(await nonces()).toBe(before.nonces + 1);
      expect((await events(agentId)).map((row) => row.refusal).slice(before.events)).toEqual(["act_params_invalid"]);
    }
    expect(await liveUsageKeys(agentId)).toBe(0);
    // A name with ordinary punctuation, accents and emoji is fine.
    expectApplied(await submit(sign(h, agentId, "key.mint", { ...usageKey().params, name: "Café laptop — 2026 😀" })));
  });

  it("looks up only operator-managed agents' Ed25519 keys: any other row is an unknown key, never verified as one", async () => {
    // perKey 0: an act that got past the lookup and verified would answer act_limited.
    const noPerKey = () => createActLimiter({ ...SIGNED_ACT_LIMITS, perKey: 0 });
    const run = (act: string) => submitAgentAct({ act, preview: null }, { clientAddress: "203.0.113.2", env: ENV, limiter: noPerKey() });
    state.userId = await newUser();

    // A self-serve agent's key, written directly (binding refuses one).
    const selfServe = await insertAgent(state.userId, { registeredVia: "self-serve" });
    const h1 = holder();
    await insertSigningKey(selfServe, h1);
    expect(await run(sign(h1, selfServe, "signer.check"))).toMatchObject({ ok: false, status: 403, verified: false, refusal: { reason_code: "act_unverified" } });

    // A row whose alg is not Ed25519 (a later algorithm, say) holding Ed25519
    // bytes: never verified as Ed25519. Only 0152's CHECK stops such a row,
    // so it is lifted for this one insert.
    const operator = await insertAgent(state.userId);
    const h2 = holder();
    await pool.query(`ALTER TABLE agent_signing_keys DROP CONSTRAINT agent_signing_keys_alg_values`);
    try {
      await insertSigningKey(operator, h2, "ES256");
      expect(await run(sign(h2, operator, "signer.check"))).toMatchObject({ ok: false, status: 403, verified: false, refusal: { reason_code: "act_unverified" } });
      expect((await pool.query(`SELECT count(*)::int AS n FROM agent_act_nonces WHERE thumbprint = $1`, [h2.kid])).rows[0].n).toBe(0);
    } finally {
      await pool.query(`DELETE FROM agent_signing_keys WHERE agent_id = $1`, [operator]);
      await pool.query(`ALTER TABLE agent_signing_keys ADD CONSTRAINT agent_signing_keys_alg_values CHECK (alg IN ('Ed25519'))`);
    }
    // The same key as Ed25519 is found and verified (so the two above were refused by the lookup).
    await insertSigningKey(operator, h2);
    expect(await run(sign(h2, operator, "signer.check"))).toMatchObject({ ok: false, status: 429, verified: true, refusal: { reason_code: "act_limited" } });
  });

  it("lets a signed act reach only its own agent's keys, and an archived agent only retire", async () => {
    const a = await setup();
    const b = await setup();
    state.userId = a.userId;
    const aKey = await mintKey({ agent_id: a.agentId, name: "a's", key_expiry: "30d" });
    if (!aKey.ok) throw new Error(aKey.error);
    state.userId = b.userId;
    // B's signing key names A's usage key: as if it did not exist.
    expect(await submit(sign(b.h, b.agentId, "key.revoke", { key_id: aKey.data.key_id }))).toMatchObject({
      ok: false, status: 422, refusal: { reason_code: "act_params_invalid", detail: "key_id names no usage key of this agent" },
    });
    expect(await liveUsageKeys(a.agentId)).toBe(1);
    // B's operator cannot list A's signing keys either.
    expect(await listSigningKeys({ agent_id: a.agentId })).toEqual({ ok: false, error: "Agent not found." });

    // Archived, A may check and retire its signing key, but not revoke a usage key.
    await pool.query(`UPDATE agents SET status = 'archived', archived_at = NOW() WHERE id = $1`, [a.agentId]);
    expect(await submit(sign(a.h, a.agentId, "key.revoke", { key_id: aKey.data.key_id }))).toMatchObject({
      ok: false, status: 403, refusal: { reason_code: "agent_archived" },
    });
    expect(await liveUsageKeys(a.agentId)).toBe(1);
    expect(codeOf(await submit(sign(a.h, a.agentId, "signer.check")))).toBe("applied");
    expect(codeOf(await submit(sign(a.h, a.agentId, "key.revoke", { kid: a.h.kid })))).toBe("applied");
  });

  it("binds only to the signed-in operator's own agents: another operator's agent gets the missing agent's answer, and nothing is written", async () => {
    const a = await setup({ confirm: false });
    const b = await setup({ confirm: false });
    const before = { keys: await pool.query(`SELECT id FROM agent_signing_keys WHERE agent_id = $1`, [a.agentId]), events: await events(a.agentId) };
    state.userId = b.userId;
    const theirs = await bindSigningKey({ agent_id: a.agentId, public_jwk: holder().jwk, key_expiry: "30d" });
    const missing = await bindSigningKey({ agent_id: randomUUID(), public_jwk: holder().jwk, key_expiry: "30d" });
    expect(theirs).toEqual({ ok: false, error: "Signing keys can be bound only to your active operator-managed agents." });
    expect(theirs).toEqual(missing);
    expect((await pool.query(`SELECT id FROM agent_signing_keys WHERE agent_id = $1`, [a.agentId])).rows).toEqual(before.keys.rows);
    expect(await events(a.agentId)).toEqual(before.events);
  });

  it("caps binding at two live signing keys, not counting lapsed or expired ones", async () => {
    const { userId, agentId, signingKeyId } = await setup({ confirm: false });
    // The first key lapses (never confirmed in 7 days); a second expires.
    await pool.query(`UPDATE agent_signing_keys SET created_at = created_at - interval '8 days' WHERE id = $1`, [signingKeyId]);
    const second = holder();
    state.userId = userId;
    const bound = await bindSigningKey({ agent_id: agentId, public_jwk: second.jwk, key_expiry: "7d" });
    if (!bound.ok) throw new Error(bound.error);
    await pool.query(
      `UPDATE agent_signing_keys SET created_at = NOW() - interval '2 days', not_after = NOW() - interval '1 day' WHERE id = $1`,
      [bound.data.signing_key_id],
    );
    // Neither counts: two more bind, and a third does not.
    expect(await bindSigningKey({ agent_id: agentId, public_jwk: holder().jwk, key_expiry: "30d" })).toMatchObject({ ok: true });
    expect(await bindSigningKey({ agent_id: agentId, public_jwk: holder().jwk, key_expiry: "30d" })).toMatchObject({ ok: true });
    expect(await bindSigningKey({ agent_id: agentId, public_jwk: holder().jwk, key_expiry: "30d" })).toEqual({
      ok: false, error: "This agent already has 2 live signing keys. Remove one first.",
    });
    // Leave no week-old pending key for the sweep's count below.
    await pool.query(`DELETE FROM agent_signing_keys WHERE id = $1`, [signingKeyId]);
  });

  it("checks each event's digest against its act, and keeps created_at and agent_id as written", async () => {
    const { agentId, h } = await setup();
    const act = sign(h, agentId, "signer.check");
    const digest = (text: string) => crypto.createHash("sha256").update(text).digest("hex");
    const insert = (sha: string) =>
      pool.query(
        `INSERT INTO agent_act_events (agent_id, basis, act, outcome, act_jws, act_sha256) VALUES ($1, 'signed-act', 'signer.check', 'applied', $2, $3)`,
        [agentId, act, sha],
      );
    await expect(insert(digest(`${act}x`))).rejects.toMatchObject({ code: "23514" });
    await insert(digest(act));
    const [first] = await events(agentId);
    const other = await insertAgent(state.userId);
    // Not even beside 7b's nulling, which alone is allowed.
    const NULL_FOUR = "act_jws = NULL, thumbprint = NULL, verification = NULL, effect = NULL";
    for (const [set, params] of [
      ["created_at = created_at - interval '1 day'", []],
      [`created_at = created_at - interval '1 day', ${NULL_FOUR}`, []],
      ["agent_id = $2", [other]],
      [`agent_id = $2, ${NULL_FOUR}`, [other]],
    ] as const) {
      await expect(pool.query(`UPDATE agent_act_events SET ${set} WHERE id = $1`, [first.id, ...params]), set).rejects.toThrow(/append-only/);
    }
    // Nulling the four erasable columns, agent kept (7b), is still allowed.
    await pool.query(`UPDATE agent_act_events SET act_jws = NULL, thumbprint = NULL, verification = NULL, effect = NULL WHERE id = $1`, [first.id]);
  });

  it("needs 0152 before agent.act is counted: 0150's CHECK refuses the word, 0152's takes it", async () => {
    const before = `held_keys_pre0152_${randomUUID().replaceAll("-", "")}`;
    await admin.query(`CREATE SCHEMA ${before}`);
    const scoped = new Pool({ connectionString: new URL(target!).toString(), options: `-c search_path=${before},public`, max: 1 });
    try {
      await scoped.query("CREATE TABLE users (id uuid PRIMARY KEY)");
      for (const file of ["0090_agents.sql", "0112_agent_self_serve.sql", "0148_ops_observability.sql", "0150_mcp_daily_agent_revoke_key.sql", "0151_agent_key_expiry.sql"]) {
        await scoped.query(await readFile(new URL(`../../../drizzle/${file}`, import.meta.url), "utf8"));
      }
      const count = (tool: string) => scoped.query(`INSERT INTO mcp_daily VALUES (current_date, 'tools/call', $1, false, 'ok', 1)`, [tool]);
      await count("agent.revoke_key");
      await expect(count("agent.act")).rejects.toMatchObject({ code: "23514" });
      await scoped.query(await readFile(new URL("../../../drizzle/0152_agent_signing_keys.sql", import.meta.url), "utf8"));
      await count("agent.act");
    } finally {
      await scoped.end();
      await admin.query(`DROP SCHEMA IF EXISTS ${before} CASCADE`);
    }
  });

  it("keeps events append-only, nulls their erasable columns with the agent, and lets 7b null them in place", async () => {
    const { agentId, h } = await setup();
    const [first] = await events(agentId);
    await expect(pool.query(`UPDATE agent_act_events SET outcome = 'refused', refusal = 'x' WHERE id = $1`, [first.id])).rejects.toThrow(/append-only/);
    await expect(pool.query(`DELETE FROM agent_act_events WHERE id = $1`, [first.id])).rejects.toThrow(/append-only/);
    await expect(pool.query(`UPDATE agent_act_events SET thumbprint = NULL WHERE id = $1`, [first.id])).rejects.toThrow(/append-only/);
    // 7b: the four erasable columns to NULL with agent_id unchanged.
    await pool.query(`UPDATE agent_act_events SET act_jws = NULL, thumbprint = NULL, verification = NULL, effect = NULL WHERE id = $1`, [first.id]);
    // 7a and account deletion: the agent goes, its keys with it; each event keeps a receipt.
    await pool.query(`DELETE FROM agents WHERE id = $1`, [agentId]);
    const left = (await pool.query(
      `SELECT agent_id, basis, act, outcome, act_sha256, act_jws, thumbprint, verification, effect FROM agent_act_events WHERE thumbprint IS NULL AND act_sha256 IN (SELECT act_sha256 FROM agent_act_events WHERE agent_id IS NULL) ORDER BY created_at`,
    )).rows;
    expect(left.length).toBeGreaterThanOrEqual(1);
    for (const row of left) expect(row).toMatchObject({ agent_id: null, act_jws: null, thumbprint: null, verification: null, effect: null });
    expect((await pool.query(`SELECT count(*)::int AS n FROM agent_signing_keys WHERE thumbprint = $1`, [h.kid])).rows[0].n).toBe(0);
    // A direct write cannot file a key under another key's kid.
    await expect(state.db!.transaction(async (tx) => {
      const event = randomUUID();
      await tx(`INSERT INTO agent_act_events (id, agent_id, basis, act, outcome) VALUES ($1, $2, 'operator', 'signing_key.bind', 'applied')`, [event, await insertAgent(state.userId)]);
      await tx(`INSERT INTO agent_signing_keys (agent_id, thumbprint, public_key, bound_by_event) SELECT agent_id, $1, $2, id FROM agent_act_events WHERE id = $3`, [holder().kid, Buffer.from(ed25519.getPublicKey(ed25519.utils.randomSecretKey())), event]);
    })).rejects.toMatchObject({ code: "23514" });
  });

  it("refuses TRUNCATE of the events, directly or by a cascade from agents", async () => {
    const { agentId } = await setup();
    const client = await pool.connect();
    try {
      // A plain TRUNCATE is refused already: other tables reference the events.
      for (const statement of ["TRUNCATE agent_act_events CASCADE", "TRUNCATE agents CASCADE"]) {
        // Inside a transaction rolled back either way, so a missing guard
        // empties nothing for the tests after this one.
        await client.query("BEGIN");
        await expect(client.query(statement), statement).rejects.toThrow(/agent_act_events is append-only and is not truncated/);
        await client.query("ROLLBACK");
      }
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
    expect((await events(agentId)).length).toBeGreaterThan(0);
  });

  it("0152 waits at most 3 seconds for a lock, then fails whole instead of queueing the gate behind it", async () => {
    // A reader holds agent_keys, as the gate's lookup does for a moment.
    const reader = await pool.connect();
    const migrator = await pool.connect();
    try {
      await reader.query("BEGIN");
      await reader.query("SELECT 1 FROM agent_keys LIMIT 1");
      await migrator.query("BEGIN");
      const started = Date.now();
      // Without lock_timeout this waits for the reader until statement_timeout (5 s here).
      await expect(migrator.query(await readFile(new URL("../../../drizzle/0152_agent_signing_keys.sql", import.meta.url), "utf8")))
        .rejects.toMatchObject({ code: "55P03" });
      const waited = Date.now() - started;
      expect(waited).toBeGreaterThanOrEqual(2900);
      expect(waited).toBeLessThan(4900);
    } finally {
      await migrator.query("ROLLBACK").catch(() => {});
      await reader.query("ROLLBACK").catch(() => {});
      migrator.release();
      reader.release();
    }
    // The setting ended with that transaction.
    expect((await pool.query("SHOW lock_timeout")).rows[0].lock_timeout).toBe("0");
  }, 15000);

  it("0152 adds agent.act to mcp_daily.tool and keeps the words 0150 allowed", async () => {
    const row = (tool: string) => `INSERT INTO mcp_daily VALUES (current_date, 'tools/call', '${tool}', false, 'ok', 1)`;
    await pool.query(row("agent.act"));
    await pool.query(row("agent.revoke_key"));
    await expect(pool.query(row("agent.unknown"))).rejects.toMatchObject({ code: "23514" });
  });

  it("sweeps expired nonces and week-old unconfirmed keys, keeps confirmed ones, and records its run", async () => {
    const confirmed = await setup();
    const pending = await setup({ confirm: false });
    const removed = await setup({ confirm: false });
    expect(await removeSigningKey({ signing_key_id: removed.signingKeyId })).toMatchObject({ ok: true });
    // Eight days old, all three: only the two never confirmed go.
    await pool.query(
      `UPDATE agent_signing_keys SET created_at = created_at - interval '8 days',
              confirmed_at = confirmed_at - interval '8 days' + interval '1 second',
              revoked_at = revoked_at - interval '8 days' + interval '1 second'
        WHERE id = ANY($1::uuid[])`,
      [[confirmed.signingKeyId, pending.signingKeyId, removed.signingKeyId]],
    );
    const tag = randomUUID().slice(0, 8);
    await pool.query(
      `INSERT INTO agent_act_nonces (thumbprint, jti, expires_at)
       SELECT $1, $2 || n, NOW() - make_interval(mins => n) FROM generate_series(1, 5) n
       UNION ALL SELECT $1, $2 || 'live', NOW() + interval '2 minutes'`,
      [confirmed.h.kid, `sweep-${tag}-`],
    );
    const sql = (text: string, params?: unknown[]) => state.db!.query(text, params) as Promise<{ rows: Record<string, unknown>[] }>;
    const minute23 = new Date(Date.UTC(2026, 10, 10, 12, 23, 0));

    // Closed, it reads nothing.
    expect(await runSignedActSweep(minute23, sql, {})).toEqual({ ranInWindow: true, open: false });
    const swept = await runSignedActSweep(minute23, sql, ENV);
    expect(swept).toMatchObject({ ranInWindow: true, open: true, provisioned: true, deleted: { pendingKeys: 2 } });
    if (!("deleted" in swept)) throw new Error("not swept");
    expect(swept.deleted.nonces).toBeGreaterThanOrEqual(5);

    const left = await pool.query(`SELECT jti FROM agent_act_nonces WHERE jti LIKE $1`, [`sweep-${tag}-%`]);
    expect(left.rows.map((row) => row.jti)).toEqual([`sweep-${tag}-live`]);
    const keys = await pool.query(`SELECT id FROM agent_signing_keys WHERE id = ANY($1::uuid[])`, [[confirmed.signingKeyId, pending.signingKeyId, removed.signingKeyId]]);
    expect(keys.rows.map((row) => row.id)).toEqual([confirmed.signingKeyId]);
    // The bind and removal events stay; the operator can bind the lapsed key again.
    expect((await events(pending.agentId)).map((event) => event.act)).toEqual(["signing_key.bind"]);
    state.userId = pending.userId;
    expect(await bindSigningKey({ agent_id: pending.agentId, public_jwk: pending.h.jwk, key_expiry: "30d" })).toMatchObject({ ok: true });

    const recorded = await pool.query(`SELECT outcome, http_status, counts FROM ops_job_outcomes WHERE job = $1 ORDER BY started_at DESC LIMIT 1`, [SIGNED_ACT_SWEEP_JOB]);
    expect(recorded.rows[0]).toMatchObject({ outcome: "ran", http_status: 200, counts: { nonces: swept.deleted.nonces, pendingKeys: 2 } });
  });

  it("applies acts the reference signer made: its key binds, confirms and mints a key that authenticates", async () => {
    const signer = resolve(process.cwd(), "../../examples/agents/held-key-signer.mjs");
    const dir = mkdtempSync(join(tmpdir(), "held-key-signer-pg-"));
    try {
      const run = (args: string[]) =>
        JSON.parse(execFileSync(process.execPath, [signer, ...args], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
      const keyFile = join(dir, "agent.pem");
      const { public_jwk: jwk, kid } = run(["keygen", "--key", keyFile]);
      const userId = await newUser();
      state.userId = userId;
      const agentId = await insertAgent(userId);
      const bound = await bindSigningKey({ agent_id: agentId, public_jwk: JSON.stringify(jwk), key_expiry: "30d" });
      expect(bound).toMatchObject({ ok: true, data: { kid, state: "pending" } });

      const check = run(["sign", "--key", keyFile, "--agent", agentId, "--act", "signer.check", "--aud", AUD]);
      expect(expectApplied(await submitAgentAct(check.body, { clientAddress: "203.0.113.9", env: ENV, limiter: createActLimiter() })).body).toMatchObject({
        signing_key_confirmed: true,
        signing_keys: [{ kid, state: "confirmed" }],
      });

      const usageFile = join(dir, "usage.txt");
      const mint = run(["sign", "--key", keyFile, "--agent", agentId, "--act", "key.mint", "--expires", "7d", "--usage-key-out", usageFile, "--preview-sha256", MINT_DISCLOSURE, "--aud", AUD]);
      const minted = expectApplied(await submitAgentAct(mint.body, { clientAddress: "203.0.113.9", env: ENV, limiter: createActLimiter() }));
      expect(minted.body).toMatchObject({ key: { key_prefix: mint.usage_key_prefix } });
      const token = readFileSync(usageFile, "utf8").trim();
      const resolved = await resolveAgentBearer(`Bearer ${token}`);
      expect(resolved).toMatchObject({ ok: true, actor: { agentId } });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("with a one-connection pool, bind, act and remove complete: nothing nests a second connection", async () => {
    const single = createCompatDb({ url: compatUrl(), ssl: false, max: 1 });
    const shared = state.db;
    state.db = single;
    try {
      const { agentId, h, signingKeyId } = await setup({ confirm: false });
      expectApplied(await submit(sign(h, agentId, "signer.check")));
      expectApplied(await submit(sign(h, agentId, "key.mint", usageKey().params)));
      expect(await removeSigningKey({ signing_key_id: signingKeyId })).toMatchObject({ ok: true });
      expect(codeOf(await submit(sign(h, agentId, "signer.check")))).toBe("signing_key_ended");
    } finally {
      state.db = shared;
      await single.close();
    }
  }, 20000);
});
