import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbQuery } = vi.hoisted(() => ({ dbQuery: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: dbQuery, transaction: vi.fn() }));

import {
  hashAgentToken,
  parseAgentBearer,
  resolveAgentBearer,
  stampKeyUse,
} from "./auth";

// Built at runtime so no literal key-shaped string sits in the repository.
const TOKEN = "ctcg_agt_" + "Ab1".repeat(7) + "Z";

function agentRow(overrides: Record<string, unknown> = {}) {
  return {
    key_id: "key-1",
    rate_limit_tier: "free",
    agent_id: "agent-1",
    public_handle: "agent-one",
    operated_by_user_id: "user-1",
    registered_via: "operator",
    agent_status: "active",
    suspended_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  dbQuery.mockReset();
});

describe("parseAgentBearer", () => {
  it("accepts the minted shape with any scheme case and spacing", () => {
    expect(TOKEN).toHaveLength("ctcg_agt_".length + 22);
    for (const header of [
      `Bearer ${TOKEN}`,
      `bearer ${TOKEN}`,
      `BEARER ${TOKEN}`,
      `Bearer    ${TOKEN}`,
      `Bearer\t${TOKEN}`,
    ]) {
      expect(parseAgentBearer(header)).toEqual({ kind: "token", token: TOKEN });
    }
  });

  it("treats an absent or empty header as missing", () => {
    expect(parseAgentBearer(null)).toEqual({ kind: "missing" });
    expect(parseAgentBearer(undefined)).toEqual({ kind: "missing" });
    expect(parseAgentBearer("")).toEqual({ kind: "missing" });
  });

  it.each([
    ["another scheme", `Basic ${TOKEN}`],
    ["no token", "Bearer"],
    ["no separator", `Bearer${TOKEN}`],
    ["a trailing word", `Bearer ${TOKEN} extra`],
    ["a wrong prefix", "Bearer ctcg_agx_" + "a".repeat(22)],
    ["an uppercase prefix", "Bearer CTCG_AGT_" + "a".repeat(22)],
    ["21 characters", "Bearer ctcg_agt_" + "a".repeat(21)],
    ["23 characters", "Bearer ctcg_agt_" + "a".repeat(23)],
    ["a non-base62 dash", "Bearer ctcg_agt_" + "a".repeat(21) + "-"],
    ["a non-base62 underscore", "Bearer ctcg_agt_" + "a".repeat(21) + "_"],
    ["a member key", "Bearer ctcg_member_" + "a".repeat(43)],
    ["a very long value", "Bearer ctcg_agt_" + "a".repeat(10_000)],
  ])("rejects %s as malformed", (_label, header) => {
    expect(parseAgentBearer(header)).toEqual({ kind: "malformed" });
  });
});

describe("resolveAgentBearer", () => {
  it("refuses missing and malformed credentials before any database access", async () => {
    await expect(resolveAgentBearer(null)).resolves.toMatchObject({
      ok: false,
      status: 401,
      reason_code: "missing_credentials",
    });
    for (const header of [
      "Bearer token",
      `Basic ${TOKEN}`,
      "Bearer ctcg_agt_" + "a".repeat(16),
      "Bearer ctcg_member_" + "a".repeat(43),
    ]) {
      await expect(resolveAgentBearer(header)).resolves.toMatchObject({
        ok: false,
        status: 401,
        reason_code: "malformed_credentials",
      });
    }
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("gives unknown and revoked keys the same 401 and the same code", async () => {
    // Revoked keys are filtered by the lookup itself, so the gate cannot
    // tell a revoked key from a string that was never a key.
    dbQuery.mockResolvedValue({ rows: [] });
    const unknown = await resolveAgentBearer(`Bearer ${"ctcg_agt_" + "z".repeat(22)}`);
    const revoked = await resolveAgentBearer(`Bearer ${TOKEN}`);

    expect(unknown).toEqual({
      ok: false,
      status: 401,
      reason_code: "unknown_or_revoked_key",
      error: "unknown or revoked key",
    });
    expect(revoked).toEqual(unknown);
    const [sql, values] = dbQuery.mock.calls[1];
    expect(sql).toContain("k.revoked_at IS NULL");
    expect(values).toEqual([hashAgentToken(TOKEN)]);
  });

  it("types suspended and archived agents as distinct 403s", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [
        agentRow({
          agent_status: "suspended",
          suspended_at: new Date("2026-10-20T09:30:00.000Z"),
        }),
      ],
    });
    await expect(resolveAgentBearer(`Bearer ${TOKEN}`)).resolves.toEqual({
      ok: false,
      status: 403,
      reason_code: "agent_suspended",
      error: "agent is suspended",
      suspended_at: "2026-10-20T09:30:00.000Z",
    });
    expect(dbQuery.mock.calls[0][0]).toContain("a.suspended_at");

    dbQuery.mockResolvedValueOnce({ rows: [agentRow({ agent_status: "archived" })] });
    await expect(resolveAgentBearer(`Bearer ${TOKEN}`)).resolves.toEqual({
      ok: false,
      status: 403,
      reason_code: "agent_archived",
      error: "agent is archived",
    });
  });

  it("resolves a live key on an active agent to its actor", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [agentRow()] });
    await expect(resolveAgentBearer(`bearer ${TOKEN}`)).resolves.toEqual({
      ok: true,
      actor: {
        kind: "agent",
        agentId: "agent-1",
        agentPublicHandle: "agent-one",
        operatorUserId: "user-1",
        registeredVia: "operator",
        keyId: "key-1",
        rateLimitTier: "free",
      },
    });
  });

  it("lets a database failure reach the route instead of answering for it", async () => {
    dbQuery.mockRejectedValueOnce(Object.assign(new Error("connection reset"), { code: "08006" }));
    await expect(resolveAgentBearer(`Bearer ${TOKEN}`)).rejects.toMatchObject({ code: "08006" });
  });
});

describe("stampKeyUse", () => {
  it("never moves last_used_at on a key whose revocation has committed", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });
    await stampKeyUse("key-1");
    const [sql, values] = dbQuery.mock.calls[0];
    expect(sql).toContain("AND revoked_at IS NULL");
    expect(values).toEqual(["key-1"]);
  });

  it("swallows a failed stamp", async () => {
    dbQuery.mockRejectedValueOnce(new Error("timeout"));
    await expect(stampKeyUse("key-1")).resolves.toBeUndefined();
  });
});
