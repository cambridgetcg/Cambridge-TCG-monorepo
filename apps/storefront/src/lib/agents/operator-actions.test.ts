import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  query: vi.fn(),
  transaction: vi.fn(),
  createAgentWithKey: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: mocks.transaction }));
vi.mock("./creation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./creation")>()),
  createAgentWithKey: mocks.createAgentWithKey,
}));

import { hashAgentToken } from "./auth";
import { archiveAgent, createAgent, mintKey, revokeKey } from "./operator-actions";
import { ARCHIVE_REVOCATION_REASON } from "./revocation-reasons";

const USER_ID = "00000000-0000-4000-8000-0000000000a1";
const AGENT_ID = "00000000-0000-4000-8000-0000000000b2";
const KEY_ID = "00000000-0000-4000-8000-0000000000c3";

/** Runs the transaction callback against a `tx` that answers in order. */
function txAnswering(...results: Array<{ rows: unknown[] }>) {
  const tx = vi.fn();
  for (const result of results) tx.mockResolvedValueOnce(result);
  mocks.transaction.mockImplementation(async (fn: (q: typeof tx) => Promise<unknown>) => fn(tx));
  return tx;
}

function sqlOf(tx: ReturnType<typeof vi.fn>, call: number): string {
  return String(tx.mock.calls[call][0]).replace(/\s+/g, " ");
}

const validCreate = {
  public_handle: "quiet-agent",
  display_name: "Quiet Agent",
  model_tag: "example-model",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
});

describe("createAgent", () => {
  it("passes the 10-agent cap into the creating transaction instead of counting first", async () => {
    mocks.createAgentWithKey.mockResolvedValue({
      ok: true,
      agent_id: AGENT_ID,
      public_handle: "quiet-agent",
      key_id: KEY_ID,
      token: "token-for-test",
      key_prefix: "ctcg_agt_abc",
    });

    const result = await createAgent({ ...validCreate, description: "  What it is for.  " });

    expect(result).toMatchObject({ ok: true, data: { agent_id: AGENT_ID } });
    expect(mocks.createAgentWithKey).toHaveBeenCalledWith(
      expect.objectContaining({
        operatedByUserId: USER_ID,
        registeredVia: "operator",
        maxActiveAgentsForOperator: 10,
        description: "What it is for.",
      }),
    );
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("returns the cap outcome's message", async () => {
    mocks.createAgentWithKey.mockResolvedValue({
      ok: false,
      code: "agent_cap_reached",
      error: "You already operate 10 active agents. Archive one first.",
    });

    await expect(createAgent(validCreate)).resolves.toEqual({
      ok: false,
      error: "You already operate 10 active agents. Archive one first.",
    });
  });

  it("rejects a description over 500 characters before creating anything", async () => {
    await expect(createAgent({ ...validCreate, description: "x".repeat(501) })).resolves.toEqual({
      ok: false,
      error: "Description too long (max 500).",
    });
    expect(mocks.createAgentWithKey).not.toHaveBeenCalled();

    mocks.createAgentWithKey.mockResolvedValue({ ok: false, code: "create_failed", error: "x" });
    await createAgent({ ...validCreate, description: "x".repeat(500) });
    expect(mocks.createAgentWithKey).toHaveBeenCalledWith(
      expect.objectContaining({ description: "x".repeat(500) }),
    );
  });

  it("stores an empty description as null", async () => {
    mocks.createAgentWithKey.mockResolvedValue({ ok: false, code: "create_failed", error: "x" });
    await createAgent({ ...validCreate, description: "   " });
    expect(mocks.createAgentWithKey).toHaveBeenCalledWith(
      expect.objectContaining({ description: null }),
    );
  });
});

describe("mintKey", () => {
  it("checks ownership, status and the operator door under a row lock in the same transaction", async () => {
    const tx = txAnswering(
      { rows: [{ id: AGENT_ID }] },
      { rows: [{ n: 1 }] },
      { rows: [{ id: KEY_ID }] },
    );

    const result = await mintKey({ agent_id: AGENT_ID, name: " laptop " });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    const lock = sqlOf(tx, 0);
    expect(lock).toContain("FROM agents");
    expect(lock).toContain("id = $1 AND operated_by_user_id = $2");
    expect(lock).toContain("status = 'active'");
    expect(lock).toContain("registered_via = 'operator'");
    expect(lock).toContain("FOR NO KEY UPDATE");
    expect(tx.mock.calls[0][1]).toEqual([AGENT_ID, USER_ID]);
    expect(sqlOf(tx, 1)).toContain("FROM agent_keys WHERE agent_id = $1 AND revoked_at IS NULL");
    expect(sqlOf(tx, 2)).toContain("INSERT INTO agent_keys");

    const [agentId, hash, prefix, name] = tx.mock.calls[2][1] as string[];
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(agentId).toBe(AGENT_ID);
    expect(name).toBe("laptop");
    expect(result.data.token).toMatch(/^ctcg_agt_[A-Za-z0-9]{22}$/);
    expect(prefix).toBe(result.data.token.slice(0, 12));
    expect(hash).toBe(hashAgentToken(result.data.token));
    expect(result.data.key_id).toBe(KEY_ID);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("refuses agents that are not this account's active operator-managed agents", async () => {
    const tx = txAnswering({ rows: [] });

    await expect(mintKey({ agent_id: AGENT_ID, name: "key" })).resolves.toEqual({
      ok: false,
      error: "Keys can be minted only for your active operator-managed agents.",
    });
    expect(tx).toHaveBeenCalledTimes(1);
  });

  it("refuses a sixth live key without inserting", async () => {
    const tx = txAnswering({ rows: [{ id: AGENT_ID }] }, { rows: [{ n: 5 }] });

    await expect(mintKey({ agent_id: AGENT_ID, name: "key" })).resolves.toEqual({
      ok: false,
      error: "This agent already has 5 active keys. Revoke one first.",
    });
    expect(tx).toHaveBeenCalledTimes(2);
    expect(tx.mock.calls.some(([sql]) => String(sql).includes("INSERT"))).toBe(false);
  });
});

describe("revokeKey", () => {
  it("revokes a live key of this account under a lock on the key row", async () => {
    const tx = txAnswering({ rows: [{ id: KEY_ID, revoked_at: null }] }, { rows: [] });

    await expect(revokeKey({ key_id: KEY_ID, reason: "rotated" })).resolves.toEqual({
      ok: true,
      data: { revoked: true, already_revoked: false },
    });
    const lock = sqlOf(tx, 0);
    expect(lock).toContain("JOIN agents a ON a.id = k.agent_id");
    expect(lock).toContain("k.id = $1 AND a.operated_by_user_id = $2");
    expect(lock).toContain("FOR NO KEY UPDATE OF k");
    expect(tx.mock.calls[0][1]).toEqual([KEY_ID, USER_ID]);
    expect(sqlOf(tx, 1)).toContain("UPDATE agent_keys SET revoked_at = NOW(), revoked_reason = $2");
    expect(tx.mock.calls[1][1]).toEqual([KEY_ID, "rotated"]);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("answers an already-revoked key as revoked without writing", async () => {
    const tx = txAnswering({ rows: [{ id: KEY_ID, revoked_at: "2026-10-29T10:00:00Z" }] });

    await expect(revokeKey({ key_id: KEY_ID })).resolves.toEqual({
      ok: true,
      data: { revoked: true, already_revoked: true },
    });
    expect(tx).toHaveBeenCalledTimes(1);
  });

  it("answers a key this account does not operate as not found", async () => {
    const tx = txAnswering({ rows: [] });

    await expect(revokeKey({ key_id: KEY_ID })).resolves.toEqual({
      ok: false,
      error: "Key not found.",
    });
    expect(tx).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["  rotated  ", "rotated"],
    ["", null],
    ["   ", null],
    [undefined, null],
  ])("trims the reason %j to %j", async (reason, stored) => {
    const tx = txAnswering({ rows: [{ id: KEY_ID, revoked_at: null }] }, { rows: [] });
    await revokeKey({ key_id: KEY_ID, reason });
    expect(tx.mock.calls[1][1]).toEqual([KEY_ID, stored]);
  });

  it("truncates a long reason to 200 characters instead of refusing the revocation", async () => {
    const tx = txAnswering({ rows: [{ id: KEY_ID, revoked_at: null }] }, { rows: [] });

    const result = await revokeKey({ key_id: KEY_ID, reason: `  ${"r".repeat(150)}${"é".repeat(150)}  ` });

    expect(result).toEqual({ ok: true, data: { revoked: true, already_revoked: false } });
    const stored = (tx.mock.calls[1][1] as string[])[1];
    expect(Array.from(stored)).toHaveLength(200);
    expect(stored).toBe(`${"r".repeat(150)}${"é".repeat(50)}`);
  });
});

describe("archiveAgent", () => {
  it("archives and revokes live keys in one transaction", async () => {
    const tx = txAnswering({ rows: [{ id: AGENT_ID }] }, { rows: [] });

    await expect(archiveAgent({ agent_id: AGENT_ID })).resolves.toEqual({
      ok: true,
      data: { archived: true },
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(sqlOf(tx, 0)).toContain("UPDATE agents SET status = 'archived'");
    expect(sqlOf(tx, 0)).toContain("operated_by_user_id = $2");
    expect(sqlOf(tx, 0)).toContain("RETURNING id");
    expect(tx.mock.calls[0][1]).toEqual([AGENT_ID, USER_ID]);
    expect(sqlOf(tx, 1)).toContain("UPDATE agent_keys SET revoked_at = NOW(), revoked_reason = $2");
    expect(sqlOf(tx, 1)).toContain("WHERE agent_id = $1 AND revoked_at IS NULL");
    expect(tx.mock.calls[1][1]).toEqual([AGENT_ID, ARCHIVE_REVOCATION_REASON]);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("revokes nothing when the agent is not this account's or is already archived", async () => {
    const tx = txAnswering({ rows: [] });

    await expect(archiveAgent({ agent_id: AGENT_ID })).resolves.toEqual({
      ok: false,
      error: "Agent not found or already archived.",
    });
    expect(tx).toHaveBeenCalledTimes(1);
  });
});

describe("input bounds before the database", () => {
  it.each(["not-a-uuid", "", `${AGENT_ID}x`, "' OR 1=1 --", 42, null, [AGENT_ID]])(
    "answers malformed id %j as not found without a query",
    async (id) => {
      await expect(mintKey({ agent_id: id as string, name: "key" })).resolves.toEqual({
        ok: false,
        error: "Agent not found.",
      });
      await expect(archiveAgent({ agent_id: id as string })).resolves.toEqual({
        ok: false,
        error: "Agent not found.",
      });
      await expect(revokeKey({ key_id: id as string })).resolves.toEqual({
        ok: false,
        error: "Key not found.",
      });
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.query).not.toHaveBeenCalled();
    },
  );

  it("asks for sign-in before any database access", async () => {
    mocks.auth.mockResolvedValue(null);

    for (const result of [
      await createAgent(validCreate),
      await mintKey({ agent_id: AGENT_ID, name: "key" }),
      await revokeKey({ key_id: KEY_ID }),
      await archiveAgent({ agent_id: AGENT_ID }),
    ]) {
      expect(result).toEqual({ ok: false, error: "Sign in required." });
    }
    expect(mocks.createAgentWithKey).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
