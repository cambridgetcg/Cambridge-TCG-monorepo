import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), query: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: mocks.transaction }));

import { BINDING_JWK_ERRORS, ed25519Thumbprint } from "./signed-act-verify";
import { bindSigningKey, listSigningKeys, removeSigningKey } from "./signing-key-actions";

// The operator's binding, removal and listing, against a scripted tx. Real
// locks and constraints run in signed-acts.integration.test.ts.

const USER_ID = "00000000-0000-4000-8000-0000000000a1";
const AGENT_ID = "00000000-0000-4000-8000-0000000000b2";
const SIGNING_KEY_ID = "00000000-0000-4000-8000-0000000000c3";
const b64u = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

function freshJwk() {
  const secretKey = ed25519.utils.randomSecretKey();
  const x = b64u(ed25519.getPublicKey(secretKey));
  return { secretKey, x, kid: ed25519Thumbprint(x), text: JSON.stringify({ kty: "OKP", crv: "Ed25519", x }) };
}

/** A tx that answers each statement in order and records it. */
function txAnswering(...results: Array<{ rows: unknown[] }>) {
  const tx = vi.fn();
  for (const result of results) tx.mockResolvedValueOnce({ rowCount: result.rows.length, ...result });
  tx.mockResolvedValue({ rows: [], rowCount: 0 });
  mocks.transaction.mockImplementation(async (fn: (q: typeof tx) => Promise<unknown>) => fn(tx));
  return tx;
}
const sqlOf = (tx: ReturnType<typeof vi.fn>, call: number) => String(tx.mock.calls[call][0]).replace(/\s+/g, " ");

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("AGENT_SIGNED_ACTS", "on");
  vi.stubEnv("AGENT_SIGNED_ACTS_AUDIENCE", "https://cambridgetcg.com");
  mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
});
afterEach(() => vi.unstubAllEnvs());

describe("while closed", () => {
  it("binds, removes and lists nothing, touching no database", async () => {
    vi.stubEnv("AGENT_SIGNED_ACTS", "");
    const { text } = freshJwk();
    expect(await bindSigningKey({ agent_id: AGENT_ID, public_jwk: text, key_expiry: "90d" })).toEqual({
      ok: false,
      error: "Agent-held signing keys are not open on this deployment.",
    });
    expect(await removeSigningKey({ signing_key_id: SIGNING_KEY_ID })).toMatchObject({ ok: false });
    expect(await listSigningKeys({ agent_id: AGENT_ID })).toEqual({ ok: true, data: { open: false } });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("asks for sign-in first", async () => {
    mocks.auth.mockResolvedValue(null);
    expect(await bindSigningKey({ agent_id: AGENT_ID, public_jwk: freshJwk().text, key_expiry: "90d" })).toEqual({ ok: false, error: "Sign in required." });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("bindSigningKey", () => {
  it("refuses a private key before reading anything, and never logs or echoes it", async () => {
    const { x } = freshJwk();
    const d = b64u(crypto.randomBytes(32));
    const logs = [vi.spyOn(console, "error"), vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "info")];
    // Even with a bad agent id and no expiry, the private key is what is answered.
    const result = await bindSigningKey({ agent_id: "not-an-id", public_jwk: JSON.stringify({ kty: "OKP", crv: "Ed25519", x, d }) });
    expect(result).toEqual({ ok: false, error: BINDING_JWK_ERRORS["private key"] });
    expect(JSON.stringify(result)).not.toContain(d);
    for (const log of logs) expect(log).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("refuses a published test key, a bad agent id and a missing expiry before the database", async () => {
    const rfc = JSON.stringify({ kty: "OKP", crv: "Ed25519", x: "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo" });
    expect(await bindSigningKey({ agent_id: AGENT_ID, public_jwk: rfc, key_expiry: "90d" })).toEqual({ ok: false, error: BINDING_JWK_ERRORS["published test key"] });
    const { text } = freshJwk();
    expect(await bindSigningKey({ agent_id: "agent-one", public_jwk: text, key_expiry: "90d" })).toMatchObject({ ok: false });
    for (const key_expiry of [undefined, "", "90", "forever"]) {
      expect(await bindSigningKey({ agent_id: AGENT_ID, public_jwk: text, key_expiry })).toMatchObject({ ok: false });
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("binds a pending key under the agent's row lock, recording an operator event first", async () => {
    const { text, kid } = freshJwk();
    const tx = txAnswering(
      { rows: [{ id: AGENT_ID }] },
      { rows: [] },
      { rows: [{ n: 1 }] },
      { rows: [{ passed: false }] },
      { rows: [] },
      { rows: [{ id: SIGNING_KEY_ID, not_after: new Date("2027-02-08T12:00:00Z"), pending_until: new Date("2026-11-17T12:00:00Z") }] },
    );
    const result = await bindSigningKey({ agent_id: AGENT_ID, public_jwk: text, key_expiry: "90d" });
    expect(result).toEqual({
      ok: true,
      data: { signing_key_id: SIGNING_KEY_ID, kid, state: "pending", not_after: "2027-02-08T12:00:00.000Z", pending_until: "2026-11-17T12:00:00.000Z" },
    });
    expect(sqlOf(tx, 0)).toContain("AND status = 'active' AND registered_via = 'operator' FOR NO KEY UPDATE");
    expect(tx.mock.calls[0][1]).toEqual([AGENT_ID, USER_ID]);
    // Only this agent's rows, never another agent's.
    expect(sqlOf(tx, 1)).toContain("WHERE agent_id = $1 AND thumbprint = $2");
    expect(sqlOf(tx, 4)).toContain("INSERT INTO agent_act_events");
    expect(sqlOf(tx, 4)).toContain("'operator', 'signing_key.bind', 'applied'");
    const eventId = tx.mock.calls[4][1][0];
    expect(sqlOf(tx, 5)).toContain("INSERT INTO agent_signing_keys");
    expect(tx.mock.calls[5][1]).toEqual([AGENT_ID, kid, expect.any(Buffer), 90, null, eventId]);
    expect((tx.mock.calls[5][1][2] as Buffer).length).toBe(32);
  });

  it("binds a key whose pending window lapsed again, deleting the lapsed row first as the sweep would", async () => {
    const { text, kid } = freshJwk();
    const LAPSED_ID = "00000000-0000-4000-8000-0000000000d4";
    const tx = txAnswering(
      { rows: [{ id: AGENT_ID }] },
      { rows: [{ id: LAPSED_ID, revoked_at: null, confirmed_at: null, lapsed: true }] },
      { rows: [{ n: 0 }] },
      { rows: [{ passed: false }] },
      { rows: [] },
      { rows: [] },
      { rows: [{ id: SIGNING_KEY_ID, not_after: null, pending_until: new Date("2026-11-17T12:00:00Z") }] },
    );
    expect(await bindSigningKey({ agent_id: AGENT_ID, public_jwk: text, key_expiry: "never" })).toMatchObject({ ok: true, data: { kid, state: "pending" } });
    expect(sqlOf(tx, 1)).toContain("AS lapsed");
    expect(sqlOf(tx, 4)).toContain("DELETE FROM agent_signing_keys WHERE id = ANY($1::uuid[]) AND agent_id = $2 AND confirmed_at IS NULL AND revoked_at IS NULL");
    expect(tx.mock.calls[4][1]).toEqual([[LAPSED_ID], AGENT_ID]);
    expect(sqlOf(tx, 5)).toContain("INSERT INTO agent_act_events");
    expect(sqlOf(tx, 6)).toContain("INSERT INTO agent_signing_keys");
  });

  it("answers the agent refusal, an already-bound key, an ended one, the cap and a begun date", async () => {
    const { text } = freshJwk();
    const bind = () => bindSigningKey({ agent_id: AGENT_ID, public_jwk: text, key_expiry: "30d" });
    txAnswering({ rows: [] });
    expect(await bind()).toEqual({ ok: false, error: "Signing keys can be bound only to your active operator-managed agents." });
    txAnswering({ rows: [{ id: AGENT_ID }] }, { rows: [{ revoked_at: null, confirmed_at: null }] });
    expect(await bind()).toEqual({ ok: false, error: "This key is already bound to this agent." });
    txAnswering({ rows: [{ id: AGENT_ID }] }, { rows: [{ revoked_at: new Date(), confirmed_at: new Date() }] });
    expect(await bind()).toEqual({ ok: false, error: "This key was bound to this agent before and has ended. Make a new key pair." });
    txAnswering({ rows: [{ id: AGENT_ID }] }, { rows: [{ revoked_at: new Date(), confirmed_at: null }] }, { rows: [{ n: 2 }] });
    expect(await bind()).toEqual({ ok: false, error: "This agent already has 2 live signing keys. Remove one first." });
    txAnswering({ rows: [{ id: AGENT_ID }] }, { rows: [] }, { rows: [{ n: 0 }] }, { rows: [{ passed: true }] });
    expect(await bind()).toEqual({ ok: false, error: "That date has already begun (UTC). Choose a later date." });
  });
});

describe("removeSigningKey", () => {
  it("locks the agent, then the key, records the removal and is idempotent", async () => {
    const tx = txAnswering(
      { rows: [{ agent_id: AGENT_ID }] },
      { rows: [{ id: AGENT_ID }] },
      { rows: [{ id: SIGNING_KEY_ID, thumbprint: "k".repeat(43), revoked_at: null }] },
    );
    expect(await removeSigningKey({ signing_key_id: SIGNING_KEY_ID })).toEqual({ ok: true, data: { removed: true, already_removed: false } });
    expect(sqlOf(tx, 0)).toContain("a.operated_by_user_id = $2");
    expect(sqlOf(tx, 1)).toContain("FROM agents WHERE id = $1 FOR NO KEY UPDATE");
    expect(sqlOf(tx, 2)).toContain("FROM agent_signing_keys WHERE id = $1 AND agent_id = $2 FOR NO KEY UPDATE");
    expect(sqlOf(tx, 3)).toContain("'operator', 'signing_key.remove', 'applied'");
    expect(sqlOf(tx, 4)).toContain("revocation_kind = 'operator-removed'");
    expect(tx.mock.calls[4][1][1]).toBe(tx.mock.calls[3][1][0]);

    txAnswering({ rows: [{ agent_id: AGENT_ID }] }, { rows: [{ id: AGENT_ID }] }, { rows: [{ id: SIGNING_KEY_ID, thumbprint: "k".repeat(43), revoked_at: new Date() }] });
    expect(await removeSigningKey({ signing_key_id: SIGNING_KEY_ID })).toEqual({ ok: true, data: { removed: true, already_removed: true } });
    txAnswering({ rows: [] });
    expect(await removeSigningKey({ signing_key_id: SIGNING_KEY_ID })).toEqual({ ok: false, error: "Signing key not found." });
    expect(await removeSigningKey({ signing_key_id: "x" })).toEqual({ ok: false, error: "Signing key not found." });
  });
});

describe("listSigningKeys", () => {
  it("lists the agent's signing keys with their states and the usage keys signed acts minted", async () => {
    const now = new Date("2026-11-10T12:00:00Z");
    txAnswering(
      { rows: [{ id: AGENT_ID }] },
      {
        rows: [
          { id: "s1", thumbprint: "a".repeat(43), created_at: now, not_after: null, confirmed_at: now, revoked_at: null, revocation_kind: null, pending_until: now, expired: false, lapsed: false },
          { id: "s2", thumbprint: "b".repeat(43), created_at: now, not_after: null, confirmed_at: null, revoked_at: null, revocation_kind: null, pending_until: new Date("2026-11-17T12:00:00Z"), expired: false, lapsed: false },
          { id: "s3", thumbprint: "c".repeat(43), created_at: now, not_after: null, confirmed_at: now, revoked_at: now, revocation_kind: "holder-retired", pending_until: now, expired: false, lapsed: false },
          { id: "s4", thumbprint: "d".repeat(43), created_at: now, not_after: now, confirmed_at: now, revoked_at: null, revocation_kind: null, pending_until: now, expired: true, lapsed: false },
        ],
      },
      { rows: [{ id: "u1", key_prefix: "ctcg_agt_Ab1", name: "laptop", created_at: now, expires_at: null, revoked_at: null, minted_by_event: "e1", minted_by_kid: "a".repeat(43) }] },
    );
    const listed = await listSigningKeys({ agent_id: AGENT_ID });
    if (!listed.ok || !listed.data.open) throw new Error("not listed");
    expect(listed.data.signing_keys.map((key) => [key.id, key.state, key.pending_until])).toEqual([
      ["s1", "confirmed", null],
      ["s2", "pending", "2026-11-17T12:00:00.000Z"],
      ["s3", "retired", null],
      ["s4", "expired", null],
    ]);
    expect(listed.data.signed_mints).toEqual([
      { key_id: "u1", key_prefix: "ctcg_agt_Ab1", name: "laptop", created_at: now.toISOString(), expires_at: null, revoked_at: null, minted_by_event: "e1", minted_by_kid: "a".repeat(43) },
    ]);
    expect(listed.data.max_live_signing_keys).toBe(2);
    txAnswering({ rows: [] });
    expect(await listSigningKeys({ agent_id: AGENT_ID })).toEqual({ ok: false, error: "Agent not found." });
  });
});
