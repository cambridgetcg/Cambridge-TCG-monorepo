import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: mocks.transaction }));

import { createAgentWithKey, type CreateAgentWithKeyInput } from "./creation";
import { keyExpiresAtSql } from "./key-expiry";

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
  keyExpiry: { kind: "days", days: 90 },
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

  it.each([
    [{ kind: "days", days: 7 } as const, [7, null]],
    [{ kind: "date", date: "2027-01-28" } as const, [null, "2027-01-28"]],
    [{ kind: "never" } as const, [null, null]],
  ])("stores the first key's expiry %j from the database's clock", async (keyExpiry, binds) => {
    const tx = txAnswering(
      { rows: [{ id: "agent-1" }] },
      { rows: [{ id: "key-1", expires_at: keyExpiry.kind === "never" ? null : new Date("2027-01-28T00:00:00Z") }] },
    );

    const outcome = await createAgentWithKey({ ...input, keyExpiry });

    expect(sqlOf(tx, 1)).toContain(`VALUES ($1, $2, $3, $4, $5, ${keyExpiresAtSql(6, 7)})`.replace(/\s+/g, " "));
    expect(sqlOf(tx, 1)).toContain("RETURNING id, expires_at");
    expect((tx.mock.calls[1][1] as unknown[]).slice(5)).toEqual(binds);
    expect(outcome).toMatchObject({
      ok: true,
      key_expires_at: keyExpiry.kind === "never" ? null : "2027-01-28T00:00:00.000Z",
    });
  });

  it("answers a date that began before the insert, by the database's clock, without a half-created agent", async () => {
    // postgres.js's shape, as production's driver throws it: constraint_name, not constraint.
    mocks.transaction.mockRejectedValue(
      Object.assign(new Error('new row for relation "agent_keys" violates check constraint "agent_keys_expiry_after_creation"'), {
        code: "23514",
        constraint_name: "agent_keys_expiry_after_creation",
      }),
    );

    await expect(
      createAgentWithKey({ ...input, keyExpiry: { kind: "date", date: "2026-11-11" } }),
    ).resolves.toEqual({
      ok: false,
      code: "expiry_date_passed",
      error: "That date has already begun (UTC). Choose a later date.",
    });
  });

  it("logs only the code of any other failure, never the failing row it carries", async () => {
    const rowHash = "f".repeat(64);
    // A postgres.js check violation on another constraint: its detail holds the new key's row.
    mocks.transaction.mockRejectedValue(
      Object.assign(new Error('new row for relation "agent_keys" violates check constraint "agent_keys_tier_values"'), {
        code: "23514",
        constraint_name: "agent_keys_tier_values",
        detail: `Failing row contains (key-1, agent-1, ${rowHash}, ctcg_agt_Abc, default, nope).`,
      }),
    );
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(createAgentWithKey(input)).resolves.toEqual({
        ok: false,
        code: "create_failed",
        error: "Failed to create agent.",
      });
      expect(logged).toHaveBeenCalledTimes(1);
      expect(logged.mock.calls[0]).toEqual(["[agents] createAgentWithKey failed:", "23514"]);
      expect(JSON.stringify(logged.mock.calls)).not.toContain(rowHash);
    } finally {
      logged.mockRestore();
    }
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
