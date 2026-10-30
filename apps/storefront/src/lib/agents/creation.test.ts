import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: mocks.transaction }));

import { createAgentWithKey, type CreateAgentWithKeyInput } from "./creation";

const USER_ID = "00000000-0000-4000-8000-0000000000a1";

function txAnswering(...results: Array<{ rows: unknown[] }>) {
  const tx = vi.fn();
  for (const result of results) tx.mockResolvedValueOnce(result);
  mocks.transaction.mockImplementation(async (fn: (q: typeof tx) => Promise<unknown>) => fn(tx));
  return tx;
}

function sqlOf(tx: ReturnType<typeof vi.fn>, call: number): string {
  return String(tx.mock.calls[call][0]).replace(/\s+/g, " ");
}

const input: CreateAgentWithKeyInput = {
  operatedByUserId: USER_ID,
  publicHandle: "quiet-agent",
  displayName: "Quiet Agent",
  modelTag: "example-model",
  registeredVia: "operator",
  tier: "free",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createAgentWithKey operator cap", () => {
  it("locks the operator row, counts, then inserts agent and key, all on the transaction", async () => {
    const tx = txAnswering(
      { rows: [{ id: USER_ID }] },
      { rows: [{ n: 9 }] },
      { rows: [{ id: "agent-1" }] },
      { rows: [{ id: "key-1" }] },
    );

    const outcome = await createAgentWithKey({ ...input, maxActiveAgentsForOperator: 10 });

    expect(outcome).toMatchObject({ ok: true, agent_id: "agent-1", key_id: "key-1" });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(sqlOf(tx, 0)).toBe("SELECT id FROM users WHERE id = $1 FOR NO KEY UPDATE");
    expect(tx.mock.calls[0][1]).toEqual([USER_ID]);
    expect(sqlOf(tx, 1)).toContain("FROM agents WHERE operated_by_user_id = $1 AND status <> 'archived'");
    expect(sqlOf(tx, 2)).toContain("INSERT INTO agents");
    expect(sqlOf(tx, 3)).toContain("INSERT INTO agent_keys");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("returns agent_cap_reached without inserting when the operator is at the cap", async () => {
    const tx = txAnswering({ rows: [{ id: USER_ID }] }, { rows: [{ n: 10 }] });

    await expect(
      createAgentWithKey({ ...input, maxActiveAgentsForOperator: 10 }),
    ).resolves.toEqual({
      ok: false,
      code: "agent_cap_reached",
      error: "You already operate 10 active agents. Archive one first.",
    });
    expect(tx).toHaveBeenCalledTimes(2);
    expect(tx.mock.calls.some(([sql]) => String(sql).includes("INSERT"))).toBe(false);
  });

  it("fails closed when the operator row is missing", async () => {
    const tx = txAnswering({ rows: [] });

    await expect(
      createAgentWithKey({ ...input, maxActiveAgentsForOperator: 10 }),
    ).resolves.toMatchObject({ ok: false, code: "create_failed" });
    expect(tx).toHaveBeenCalledTimes(1);
  });

  it("takes no operator lock when no cap is asked for", async () => {
    const tx = txAnswering({ rows: [{ id: "agent-1" }] }, { rows: [{ id: "key-1" }] });

    await expect(createAgentWithKey(input)).resolves.toMatchObject({ ok: true });
    expect(tx).toHaveBeenCalledTimes(2);
    expect(sqlOf(tx, 0)).toContain("INSERT INTO agents");
  });

  it("still reports a taken handle as handle_taken", async () => {
    mocks.transaction.mockRejectedValue(
      new Error('duplicate key value violates unique constraint "agents_public_handle_key"'),
    );

    await expect(
      createAgentWithKey({ ...input, maxActiveAgentsForOperator: 10 }),
    ).resolves.toEqual({ ok: false, code: "handle_taken", error: "That handle is already taken." });
  });
});
