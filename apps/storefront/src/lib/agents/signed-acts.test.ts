import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";

vi.mock("@/lib/db", () => ({ query: vi.fn(), transaction: vi.fn() }));
// The real verifier, watched: how often it runs, and against which key.
vi.mock("./signed-act-verify", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./signed-act-verify")>();
  return { ...actual, verifyActSignature: vi.fn(actual.verifyActSignature) };
});

import { query, transaction } from "@/lib/db";
import { signedActsConfig, SIGNED_ACT_LIMITS } from "./signed-act-config";
import { createActLimiter } from "./signed-act-limits";
import { currentDisclosure, disclosureSha256, isCurrentDisclosureDigest, SIGNED_ACT_DISCLOSURES } from "./signed-act-disclosures";
import { DUMMY_VERIFICATION_KEY, DUMMY_VERIFICATION_SEED_TEXT, ed25519Thumbprint, verifyActSignature } from "./signed-act-verify";
import { submitAgentAct, SIGNED_ACT_STATUS, type AgentActAnswer } from "./signed-acts";

// The act path before and around the database. The transaction itself runs
// against real PostgreSQL in signed-acts.integration.test.ts; here a
// scripted tx shows the branches the page names (replay, stale by the
// database's clock) and that nothing touches the database while closed.

const AUD = "https://cambridgetcg.com";
const OPEN = { AGENT_SIGNED_ACTS: "on", AGENT_SIGNED_ACTS_AUDIENCE: AUD };
const AGENT = "6f1c2a90-3b7e-4d21-9a55-0c8e4b7d2f13";
const b64u = (bytes: Uint8Array | string) => Buffer.from(bytes).toString("base64url");

function keyPair() {
  const secretKey = ed25519.utils.randomSecretKey();
  const publicKey = ed25519.getPublicKey(secretKey);
  return { secretKey, publicKey, kid: ed25519Thumbprint(b64u(publicKey)) };
}

function signAct(secretKey: Uint8Array, kid: string, overrides: Record<string, unknown> = {}, nowMs = Date.now()) {
  const iat = Math.floor(nowMs / 1000);
  const payload = { aud: AUD, act: "signer.check", sub: AGENT, iat, exp: iat + 120, jti: b64u(crypto.randomBytes(16)), params: {}, ...overrides };
  const h = b64u(JSON.stringify({ alg: "Ed25519", typ: "ctcg-act.v1", kid }));
  const p = b64u(JSON.stringify(payload));
  return `${h}.${p}.${b64u(ed25519.sign(Buffer.from(`${h}.${p}`), secretKey))}`;
}

const fresh = () => createActLimiter();
const submit = (args: unknown, env: Record<string, string | undefined> = OPEN, extra: Partial<Parameters<typeof submitAgentAct>[1]> = {}) =>
  submitAgentAct(args, { clientAddress: "203.0.113.7", env, limiter: fresh(), ...extra });

function refusalOf(answer: AgentActAnswer) {
  if (answer.ok) throw new Error("expected a refusal");
  return answer;
}

/** terminal ⇒ no next action; non-terminal ⇒ at least one, all optional. */
function expectInvariant(answer: AgentActAnswer) {
  const { refusal } = refusalOf(answer);
  expect(refusal.terminal ? refusal.next_actions.length === 0 : refusal.next_actions.length > 0).toBe(true);
  for (const next of refusal.next_actions) expect(next.optional).toBe(true);
}

beforeEach(() => {
  vi.mocked(query).mockReset();
  vi.mocked(transaction).mockReset();
  vi.mocked(verifyActSignature).mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("the switch", () => {
  it("is closed unless the flag is exactly on and the audience is an origin", () => {
    for (const env of [
      {},
      { AGENT_SIGNED_ACTS: "on" },
      { AGENT_SIGNED_ACTS: "ON", AGENT_SIGNED_ACTS_AUDIENCE: AUD },
      { AGENT_SIGNED_ACTS: " on", AGENT_SIGNED_ACTS_AUDIENCE: AUD },
      { AGENT_SIGNED_ACTS: "true", AGENT_SIGNED_ACTS_AUDIENCE: AUD },
      { AGENT_SIGNED_ACTS: "on", AGENT_SIGNED_ACTS_AUDIENCE: "" },
      { AGENT_SIGNED_ACTS: "on", AGENT_SIGNED_ACTS_AUDIENCE: "cambridgetcg.com" },
      { AGENT_SIGNED_ACTS: "on", AGENT_SIGNED_ACTS_AUDIENCE: "https://cambridgetcg.com/" },
      { AGENT_SIGNED_ACTS: "on", AGENT_SIGNED_ACTS_AUDIENCE: "https://cambridgetcg.com/api" },
      { AGENT_SIGNED_ACTS: "on", AGENT_SIGNED_ACTS_AUDIENCE: "ftp://cambridgetcg.com" },
    ]) {
      expect(signedActsConfig(env), JSON.stringify(env)).toEqual({ open: false });
    }
    expect(signedActsConfig({ ...OPEN, AGENT_SIGNED_ACTS_AUDIENCE: ` ${AUD}\n` })).toEqual({ open: true, audience: AUD });
    expect(signedActsConfig({ AGENT_SIGNED_ACTS: "on", AGENT_SIGNED_ACTS_AUDIENCE: "http://127.0.0.1:3001" })).toEqual({ open: true, audience: "http://127.0.0.1:3001" });
  });

  it("closed, answers signed_acts_closed to anything, reading no database", async () => {
    const { secretKey, kid } = keyPair();
    for (const args of [null, {}, { preview: "key.mint" }, { act: signAct(secretKey, kid), preview: null }, "garbage"]) {
      const answer = await submit(args, {});
      expect(answer).toMatchObject({ ok: false, status: 503, verified: false, refusal: { reason_code: "signed_acts_closed", retryable: false, terminal: false } });
      expectInvariant(answer);
    }
    expect(query).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("arguments", () => {
  it("takes exactly one of act and preview, as a string, and nothing else", async () => {
    for (const args of [null, [], "x", {}, { act: null, preview: null }, { act: "a", preview: "key.mint" }, { act: 1 }, { preview: true }, { act: "a.b.c", confirm: true }]) {
      const answer = await submit(args);
      expect(answer, JSON.stringify(args)).toMatchObject({ ok: false, status: 400, refusal: { reason_code: "act_malformed" } });
      expectInvariant(answer);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it("refuses any other argument name, even beside a valid preview", async () => {
    for (const args of [{ preview: "key.mint", extra: 1 }, { act: null, preview: "key.mint", confirm: true }, { preview: "signer.check", arguments: {} }]) {
      expect(await submit(args), JSON.stringify(args)).toMatchObject({
        ok: false, status: 400, refusal: { reason_code: "act_malformed", detail: "send an object with act or preview only" },
      });
    }
    expect((await submit({ preview: "key.mint" })).ok).toBe(true);
  });
});

describe("previews", () => {
  it("write nothing, need no key, and give each act's disclosure with its SHA-256, the same for everyone", async () => {
    for (const name of ["signer.check", "key.mint", "key.revoke"] as const) {
      const first = await submit({ preview: name, act: null });
      const second = await submitAgentAct({ preview: name }, { clientAddress: "198.51.100.1", env: OPEN, limiter: fresh() });
      if (!first.ok || !second.ok) throw new Error("preview refused");
      const disclosure = currentDisclosure(name);
      expect(first.body).toMatchObject({
        preview: name,
        writes: "nothing",
        disclosure_version: disclosure.version,
        disclosure_text: disclosure.text,
        disclosure_sha256: disclosureSha256(disclosure.text),
        envelope: { typ: "ctcg-act.v1", aud: AUD, max_lifetime_seconds: 300 },
      });
      const { server_time: _a, ...a } = first.body;
      const { server_time: _b, ...b } = second.body;
      expect(a).toEqual(b);
      expect(first.verified).toBe(false);
      expect(disclosure.text).toContain("not identity, not consent");
      expect(disclosure.text).toContain("The privacy notice at https://cambridgetcg.com/privacy describes these records.");
      expect(disclosure.version).toBe(`${name}/2026-11-10.2`);
    }
    const mint = await submit({ preview: "key.mint" });
    if (!mint.ok) throw new Error("refused");
    expect(Object.keys(mint.body.params_template as object).sort()).toEqual(["expires", "key_prefix", "key_sha256", "name", "preview_sha256"]);
    expect(isCurrentDisclosureDigest("key.mint", mint.body.disclosure_sha256 as string)).toBe(true);
    expect(isCurrentDisclosureDigest("key.revoke", mint.body.disclosure_sha256 as string)).toBe(false);
    expect(await submit({ preview: "agent.archive" })).toMatchObject({ ok: false, refusal: { reason_code: "act_malformed" } });
    expect(query).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("keeps one current disclosure per act, with distinct versions", () => {
    for (const name of ["signer.check", "key.mint", "key.revoke"]) {
      expect(SIGNED_ACT_DISCLOSURES.filter((entry) => entry.act === name && entry.current)).toHaveLength(1);
      // Every version an agent may have signed stays readable, not current.
      const first = SIGNED_ACT_DISCLOSURES.find((entry) => entry.version === `${name}/2026-11-10.1`);
      expect(first).toMatchObject({ current: false });
      expect(first?.text).toContain("does not yet describe these records");
      expect(isCurrentDisclosureDigest(name as "key.mint", disclosureSha256(first!.text))).toBe(false);
    }
    expect(new Set(SIGNED_ACT_DISCLOSURES.map((entry) => entry.version)).size).toBe(SIGNED_ACT_DISCLOSURES.length);
  });
});

describe("before the database", () => {
  it("answers a malformed act with a fixed phrase, never echoing the act", async () => {
    const answer = await submit({ act: "not-a-jws-SECRETISH" });
    expect(answer).toMatchObject({ ok: false, status: 400, refusal: { reason_code: "act_malformed", detail: "not a compact JWS with an 86-character signature" } });
    expect(JSON.stringify(answer)).not.toContain("SECRETISH");
    expectInvariant(answer);
    expect(query).not.toHaveBeenCalled();
  });

  it("answers an act stale by the app's clock with server_time, before any lookup", async () => {
    const { secretKey, kid } = keyPair();
    const now = Date.now();
    const answer = await submit({ act: signAct(secretKey, kid, {}, now - 10 * 60_000) }, OPEN, { nowMs: () => now });
    expect(answer).toMatchObject({ ok: false, status: 400, refusal: { reason_code: "act_stale", server_time: new Date(now).toISOString() } });
    expect(refusalOf(answer).refusal.next_actions[0].action).toBe("sign_new_act");
    expect(query).not.toHaveBeenCalled();
  });

  it("limits before any lookup, per address, with exit-labelled acts counted apart", async () => {
    const { secretKey, kid } = keyPair();
    vi.mocked(query).mockResolvedValue({ rows: [], rowCount: 0 });
    const limiter = createActLimiter({ ...SIGNED_ACT_LIMITS, perAddress: 2 });
    const run = (act: string, address = "203.0.113.7") => submitAgentAct({ act }, { clientAddress: address, env: OPEN, limiter });
    expect((await run(signAct(secretKey, kid))).ok).toBe(false); // unverified, but counted
    await run(signAct(secretKey, kid));
    const third = await run(signAct(secretKey, kid));
    expect(third).toMatchObject({ ok: false, status: 429, refusal: { reason_code: "act_limited", retryable: true } });
    expect(refusalOf(third).retryAfterSeconds).toBeGreaterThan(0);
    expect(query).toHaveBeenCalledTimes(2);
    // An exit-labelled act from the same address has its own count.
    const exit = await run(signAct(secretKey, kid, { act: "key.revoke", params: { kid } }));
    expect(refusalOf(exit).refusal.reason_code).toBe("act_unverified");
    // Another address has its own.
    expect(refusalOf(await run(signAct(secretKey, kid), "198.51.100.9")).refusal.reason_code).toBe("act_unverified");
    // The per-address refusal is the one that says "from here".
    expect(refusalOf(third).message).toMatch(/^Too many acts from here just now\. Nothing was applied\. Retry in \d+s\.$/);
  });

  it("says an instance-wide refusal is about all callers, not about here", async () => {
    const { secretKey, kid } = keyPair();
    vi.mocked(query).mockResolvedValue({ rows: [], rowCount: 0 });
    const limiter = createActLimiter({ ...SIGNED_ACT_LIMITS, perInstance: 1 });
    expect(refusalOf(await submitAgentAct({ act: signAct(secretKey, kid) }, { clientAddress: "192.0.2.1", env: OPEN, limiter })).refusal.reason_code).toBe("act_unverified");
    const answer = refusalOf(await submitAgentAct({ act: signAct(secretKey, kid) }, { clientAddress: "192.0.2.2", env: OPEN, limiter }));
    expect(answer).toMatchObject({ status: 429, refusal: { reason_code: "act_limited" } });
    expect(answer.message).not.toContain("from here");
    expect(answer.message).toMatch(/^Too many acts reached this server just now, from all callers together\. Nothing was applied\. Retry in \d+s\.$/);
  });

  it("never counts a preview against an instance ceiling", async () => {
    const { secretKey, kid } = keyPair();
    vi.mocked(query).mockResolvedValue({ rows: [], rowCount: 0 });
    const limiter = createActLimiter({ ...SIGNED_ACT_LIMITS, perInstance: 1, exitPerInstance: 1 });
    for (let i = 0; i < 30; i += 1) {
      expect((await submitAgentAct({ preview: "key.mint" }, { clientAddress: `2001:db8:${i.toString(16)}:0::/64`, env: OPEN, limiter })).ok).toBe(true);
    }
    // Both classes still have their one act.
    const other = await submitAgentAct({ act: signAct(secretKey, kid) }, { clientAddress: "192.0.2.9", env: OPEN, limiter });
    const exit = await submitAgentAct({ act: signAct(secretKey, kid, { act: "key.revoke", params: { kid } }) }, { clientAddress: "192.0.2.9", env: OPEN, limiter });
    expect([refusalOf(other).refusal.reason_code, refusalOf(exit).refusal.reason_code]).toEqual(["act_unverified", "act_unverified"]);
    // Per address, previews are limited like anything else.
    const one = createActLimiter({ ...SIGNED_ACT_LIMITS, perAddress: 1 });
    expect((await submitAgentAct({ preview: "key.mint" }, { clientAddress: "192.0.2.3", env: OPEN, limiter: one })).ok).toBe(true);
    const again = refusalOf(await submitAgentAct({ preview: "key.mint" }, { clientAddress: "192.0.2.3", env: OPEN, limiter: one }));
    expect(again.message).toContain("from here");
  });

  it("gives an unknown key and a bad signature one answer, verifying both", async () => {
    const { secretKey, publicKey, kid } = keyPair();
    vi.mocked(query).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const unknown = await submit({ act: signAct(secretKey, kid) });
    // A key row exists, but the act was signed by another key.
    const other = keyPair();
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ id: "k1", public_key: Buffer.from(publicKey), alg: "Ed25519" }], rowCount: 1 });
    const badSignature = await submit({ act: signAct(other.secretKey, kid) });
    expect(unknown).toEqual(badSignature);
    expect(unknown).toMatchObject({ ok: false, status: 403, verified: false, refusal: { reason_code: "act_unverified" } });
    expect(transaction).not.toHaveBeenCalled();
    const [sql, params] = vi.mocked(query).mock.calls[0];
    expect(sql).toContain("FROM agent_signing_keys");
    expect(params).toEqual([AGENT, kid]);
  });

  it("runs the verifier exactly once on the unknown-key path, against the dummy key", async () => {
    const { secretKey, kid } = keyPair();
    vi.mocked(query).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    expect(await submit({ act: signAct(secretKey, kid) })).toMatchObject({ ok: false, status: 403, refusal: { reason_code: "act_unverified" } });
    expect(verifyActSignature).toHaveBeenCalledTimes(1);
    expect(vi.mocked(verifyActSignature).mock.calls[0][1]).toEqual(DUMMY_VERIFICATION_KEY);
    expect(vi.mocked(verifyActSignature).mock.results[0]).toEqual({ type: "return", value: false });
  });

  it("refuses an act the dummy key signs for an unknown key, though its signature verifies", async () => {
    // The dummy key's private half is public (its seed is in the source).
    const seed = new Uint8Array(crypto.createHash("sha256").update(DUMMY_VERIFICATION_SEED_TEXT, "utf8").digest());
    const kid = ed25519Thumbprint(b64u(DUMMY_VERIFICATION_KEY));
    vi.mocked(query).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const answer = await submit({ act: signAct(seed, kid) });
    expect(vi.mocked(verifyActSignature).mock.results).toEqual([{ type: "return", value: true }]);
    expect(answer).toMatchObject({ ok: false, status: 403, verified: false, refusal: { reason_code: "act_unverified" } });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("answers a failed lookup with auth_unavailable and logs only the error's code", async () => {
    const { secretKey, kid } = keyPair();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const jws = signAct(secretKey, kid);
    vi.mocked(query).mockRejectedValueOnce(Object.assign(new Error(`boom ${jws}`), { code: "57P01" }));
    const answer = await submit({ act: jws });
    expect(answer).toMatchObject({ ok: false, status: 503, refusal: { reason_code: "auth_unavailable", retryable: true } });
    expect(JSON.stringify(logged.mock.calls)).not.toContain(jws.slice(0, 20));
    expect(logged.mock.calls[0]).toEqual(["[agent.act] key lookup failed", "57P01"]);
  });
});

describe("the transaction (scripted)", () => {
  type Script = { nonce: boolean; dbEpoch?: number; revokedAt?: string | null };
  function scripted(script: Script) {
    const calls: [string, unknown[]][] = [];
    const tx = async (sql: string, params: unknown[] = []) => {
      calls.push([sql, params]);
      if (/FROM agents/.test(sql)) return { rows: [{ id: AGENT, public_handle: "agent-one", status: "active", suspended_at: null }], rowCount: 1 };
      if (/clock_timestamp\(\)/.test(sql)) {
        const epoch = script.dbEpoch ?? Date.now() / 1000;
        return { rows: [{ db_now: new Date(epoch * 1000), db_epoch: epoch, expired: false, lapsed: false, lapses_at: null }], rowCount: 1 };
      }
      if (/FROM agent_signing_keys\s+WHERE id = \$1/.test(sql)) {
        return {
          rows: [{
            id: "k1", thumbprint: params[2], confirmed_at: new Date(), revoked_at: script.revokedAt ?? null, revoked_by_event: script.revokedAt ? "e0" : null,
            not_after: null, created_at: new Date(),
          }],
          rowCount: 1,
        };
      }
      if (/INSERT INTO agent_act_nonces/.test(sql)) return script.nonce ? { rows: [{ jti: params[1] }], rowCount: 1 } : { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    };
    vi.mocked(transaction).mockImplementation(async (fn) => fn(tx as never));
    return calls;
  }

  function lookupFinds(publicKey: Uint8Array) {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ id: "k1", public_key: Buffer.from(publicKey), alg: "Ed25519" }], rowCount: 1 });
  }

  it("answers a replay act_replayed and writes no event", async () => {
    const { secretKey, publicKey, kid } = keyPair();
    lookupFinds(publicKey);
    const calls = scripted({ nonce: false });
    const answer = await submit({ act: signAct(secretKey, kid) });
    expect(answer).toMatchObject({ ok: false, status: 409, verified: true, refusal: { reason_code: "act_replayed" } });
    expect(calls.some(([sql]) => sql.includes("INSERT INTO agent_act_events"))).toBe(false);
    // Lock order: agent, then signing key; then the database's clock, read
    // only once both are held; then the nonce.
    const step = (sql: string) => (sql.includes("clock_timestamp") ? "clock_timestamp" : sql.match(/FROM agents|FROM agent_signing_keys|INSERT INTO agent_act_nonces/)?.[0]);
    expect(calls.map(([sql]) => step(sql)).filter(Boolean).slice(0, 4))
      .toEqual(["FROM agents", "FROM agent_signing_keys", "clock_timestamp", "INSERT INTO agent_act_nonces"]);
    expect(calls[1][0]).toContain("FOR NO KEY UPDATE");
    expect(calls[1][0]).not.toMatch(/NOW\(\)|clock_timestamp/);
  });

  it("records an act stale by the database's clock, consuming its nonce", async () => {
    const { secretKey, publicKey, kid } = keyPair();
    lookupFinds(publicKey);
    const now = Date.now();
    // The database's clock is 61 s behind the act's iat (the app's clock let it through).
    const calls = scripted({ nonce: true, dbEpoch: Math.floor(now / 1000) - 61 });
    const answer = await submit({ act: signAct(secretKey, kid, {}, now) }, OPEN, { nowMs: () => now });
    expect(answer).toMatchObject({ ok: false, status: 400, verified: true, refusal: { reason_code: "act_stale" } });
    const refusal = refusalOf(answer).refusal;
    expect(refusal.server_time).toBe(new Date((Math.floor(now / 1000) - 61) * 1000).toISOString());
    expect(refusal.receipt?.act_sha256).toMatch(/^[0-9a-f]{64}$/);
    const event = calls.find(([sql]) => sql.includes("INSERT INTO agent_act_events"));
    expect(event?.[1].slice(2, 5)).toEqual(["signer.check", "refused", "act_stale"]);
    expect(calls.some(([sql]) => sql.includes("SAVEPOINT"))).toBe(false);
  });

  it("records a validly signed act from an ended key as signing_key_ended, with when and by which event", async () => {
    const { secretKey, publicKey, kid } = keyPair();
    lookupFinds(publicKey);
    const calls = scripted({ nonce: true, revokedAt: "2026-11-10T12:00:00.000Z" });
    const answer = await submit({ act: signAct(secretKey, kid) });
    expect(answer).toMatchObject({
      ok: false, status: 403, refusal: { reason_code: "signing_key_ended", ended_at: "2026-11-10T12:00:00.000Z", revoked_by_event: "e0" },
    });
    expect(calls.find(([sql]) => sql.includes("INSERT INTO agent_act_events"))?.[1][4]).toBe("signing_key_ended");
  });

  it("applies the per-key limit to every verified act, exit acts included, so an ended key cannot write events without bound", async () => {
    const { secretKey, publicKey, kid } = keyPair();
    vi.mocked(query).mockResolvedValue({ rows: [{ id: "k1", public_key: Buffer.from(publicKey), alg: "Ed25519" }], rowCount: 1 });
    const calls = scripted({ nonce: true, revokedAt: "2026-11-10T12:00:00.000Z" });
    const limiter = createActLimiter({ ...SIGNED_ACT_LIMITS, perKey: 2 });
    const retire = () =>
      submitAgentAct({ act: signAct(secretKey, kid, { act: "key.revoke", params: { kid } }) }, { clientAddress: "192.0.2.1", env: OPEN, limiter });
    expect(refusalOf(await retire()).refusal.reason_code).toBe("signing_key_ended");
    expect(refusalOf(await retire()).refusal.reason_code).toBe("signing_key_ended");
    const third = refusalOf(await retire());
    expect(third).toMatchObject({ status: 429, verified: true, refusal: { reason_code: "act_limited" } });
    expect(third.message).toMatch(/^Too many acts signed by this key just now\. Nothing was applied\. Retry in \d+s\.$/);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(calls.filter(([sql]) => sql.includes("INSERT INTO agent_act_events"))).toHaveLength(2);
  });

  it("answers a failed transaction auth_unavailable, having applied nothing", async () => {
    const { secretKey, publicKey, kid } = keyPair();
    lookupFinds(publicKey);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(transaction).mockRejectedValueOnce(Object.assign(new Error("connection reset"), { code: "08006" }));
    expect(await submit({ act: signAct(secretKey, kid) })).toMatchObject({ ok: false, status: 503, verified: true, refusal: { reason_code: "auth_unavailable" } });
  });
});

describe("refusals", () => {
  it("give every code a status and keep the typed invariant", () => {
    expect(Object.keys(SIGNED_ACT_STATUS).sort()).toEqual([
      "act_disclosure_stale", "act_limited", "act_malformed", "act_params_invalid", "act_replayed", "act_stale", "act_unverified",
      "agent_archived", "agent_suspended", "auth_unavailable", "key_cap_reached", "signed_acts_closed", "signing_key_ended", "signing_key_in_use",
    ]);
  });
});

describe("the limiter", () => {
  it("rolls its window, caps each class per instance, and shares one bucket past the address cap", () => {
    let now = 1_000_000;
    const limiter = createActLimiter({ ...SIGNED_ACT_LIMITS, perAddress: 100, perInstance: 3, exitPerInstance: 1, perKey: 2, maxTrackedAddresses: 2 }, () => now);
    for (let i = 0; i < 3; i += 1) expect(limiter.beforeVerification(`a${i}`, "other").allowed).toBe(true);
    expect(limiter.beforeVerification("a9", "other")).toEqual({ allowed: false, retryAfterSeconds: 20, scope: "instance" });
    expect(limiter.beforeVerification("a9", "exit").allowed).toBe(true);
    expect(limiter.beforeVerification("a9", "exit").allowed).toBe(false);
    expect(limiter.afterVerification("kid").allowed).toBe(true);
    expect(limiter.afterVerification("kid").allowed).toBe(true);
    expect(limiter.afterVerification("kid").allowed).toBe(false);
    now += 60_000;
    expect(limiter.beforeVerification("a9", "other").allowed).toBe(true);
    expect(limiter.afterVerification("kid").allowed).toBe(true);

    const small = createActLimiter({ ...SIGNED_ACT_LIMITS, perAddress: 1, maxTrackedAddresses: 1 }, () => now);
    expect(small.beforeVerification("first", "other").allowed).toBe(true);
    expect(small.beforeVerification("second", "other").allowed).toBe(true); // overflow bucket
    expect(small.beforeVerification("third", "other").allowed).toBe(false); // overflow bucket full
  });
});
