import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { dbQuery } = vi.hoisted(() => ({ dbQuery: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: dbQuery, transaction: vi.fn() }));

import { hashAgentToken } from "./auth";
import {
  KEY_EXIT_COMPLETENESS,
  KEY_EXIT_INVENTORY_VERSION,
  KEY_EXIT_RETAINED,
  KEY_REPLACEMENT_CASES,
  keyReplacementSummary,
  keyReplacementText,
} from "./key-exit-inventory";
import { revokePresentedKey } from "./key-revocation";
import { HOLDER_REVOCATION_REASON } from "./revocation-reasons";

// Built at runtime so no literal key-shaped string sits in the repository.
const TOKEN = "ctcg_agt_" + "Ab1".repeat(7) + "Z";
const OTHER_TOKEN = "ctcg_agt_" + "q".repeat(22);

// Values a careless SELECT * would leak. None may reach an answer. (The
// agent's status is read on purpose and reaches the answer only through
// replacement and this_key_future_authority; no status key may appear.)
const AGENT_ID = "11111111-1111-4111-8111-111111111111";
const OPERATOR_ID = "22222222-2222-4222-8222-222222222222";
const LEAKY_COLUMNS = {
  agent_id: AGENT_ID,
  id: "33333333-3333-4333-8333-333333333333",
  operated_by_user_id: OPERATOR_ID,
  public_handle: "quiet-heron",
  revoked_reason: "admin: abuse report",
};

// A status filter would refuse a suspended or archived agent's holder.
const STATUS_FILTER = /\bstatus\s*(?:=|<>|!=|\bIN\b|\bIS\b)/i;

const NOT_ACTIVE = {
  performed: false,
  revoked: false,
  key_state: "not_active",
  message:
    "This string does not authenticate here (unknown, or already revoked). Nothing was changed. Repeating is safe.",
  docs: "https://cambridgetcg.com/methodology/agents",
};

function expectNoLeak(outcome: unknown) {
  const encoded = JSON.stringify(outcome);
  // The design reference stays in code comments, never on the wire.
  expect(encoded).not.toMatch(/xenia|covenant|exit\.revocation|exit\.states|exit\.retention/i);
  for (const value of [
    AGENT_ID,
    OPERATOR_ID,
    "quiet-heron",
    "admin: abuse report",
    HOLDER_REVOCATION_REASON,
    hashAgentToken(TOKEN),
    TOKEN,
  ]) {
    expect(encoded).not.toContain(value);
  }
  for (const key of [
    "revoked_reason",
    "revoked_by",
    "agent_status",
    "status",
    "public_handle",
    "agent_id",
    "operator_user_id",
    "operated_by_user_id",
    "terminal",
  ]) {
    expect(outcome).not.toHaveProperty(key);
  }
}

beforeEach(() => {
  dbQuery.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("revokePresentedKey preview", () => {
  it.each([
    ["omitted", {}],
    ["false", { confirm: false }],
    ['the string "true"', { confirm: "true" }],
    ["1", { confirm: 1 }],
    ["an object", { confirm: { value: true } }],
  ])("previews and writes nothing when confirm is %s", async (_label, options) => {
    dbQuery.mockResolvedValueOnce({
      rows: [
        {
          key_prefix: "ctcg_agt_Ab1",
          registered_via: "operator",
          status: "active",
          other_live_keys: 1,
          ...LEAKY_COLUMNS,
        },
      ],
    });

    const outcome = await revokePresentedKey(TOKEN, options);

    expect(dbQuery).toHaveBeenCalledOnce();
    const [sql, values] = dbQuery.mock.calls[0];
    expect(sql).toMatch(/^\s*SELECT\b/);
    expect(sql).not.toMatch(/\b(?:UPDATE|INSERT|DELETE)\b/);
    expect(sql).toMatch(/WHERE k\.key_hash = \$1\s+AND k\.revoked_at IS NULL\s*$/);
    expect(sql).toContain("a.status");
    expect(sql).not.toMatch(STATUS_FILTER);
    expect(values).toEqual([hashAgentToken(TOKEN)]);
    expect(outcome).toMatchObject({
      performed: false,
      revoked: false,
      key_state: "active",
      key_prefix: "ctcg_agt_Ab1",
      other_live_keys: 1,
      reversible: false,
      replacement: "The operator can mint a new key at /account/agents.",
      states: {
        this_key_future_authority: "active",
        other_keys: { live_count: 1, changed: false },
      },
    });
    expectNoLeak(outcome);
  });
});

describe("revokePresentedKey with confirm: true", () => {
  it("revokes in one statement and returns the itemized exit facts", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [
        {
          key_prefix: "ctcg_agt_Ab1",
          revoked_at: new Date("2026-10-29T12:00:00.000Z"),
          registered_via: "operator",
          status: "active",
          other_live_keys: 2,
          ...LEAKY_COLUMNS,
        },
      ],
    });

    const outcome = await revokePresentedKey(TOKEN, { confirm: true });

    expect(dbQuery).toHaveBeenCalledOnce();
    const [sql, values] = dbQuery.mock.calls[0];
    expect(sql).toContain("UPDATE agent_keys");
    expect(sql).toContain("SET revoked_at = NOW(), revoked_reason = $2");
    expect(sql).toMatch(/WHERE key_hash = \$1 AND revoked_at IS NULL\s+RETURNING\b/);
    expect(sql).toContain("k2.id <> r.id");
    // No status check, rate-limit bucket or last-used stamp; status is only read.
    expect(sql).toContain("a.status");
    expect(sql).not.toMatch(STATUS_FILTER);
    expect(sql).not.toMatch(/agent_rate_buckets|last_used_at/);
    expect(values).toEqual([hashAgentToken(TOKEN), HOLDER_REVOCATION_REASON]);

    expect(outcome).toMatchObject({
      performed: true,
      revoked: true,
      key_state: "revoked",
      key_prefix: "ctcg_agt_Ab1",
      revoked_at: "2026-10-29T12:00:00.000Z",
      other_live_keys: 2,
      reversible: false,
      inventory_version: KEY_EXIT_INVENTORY_VERSION,
      evidence_state: "derived from source; production not observed",
      completeness: KEY_EXIT_COMPLETENESS,
      replacement: "The operator can mint a new key at /account/agents.",
      receipt_reference: {
        key_prefix: "ctcg_agt_Ab1",
        revoked_at: "2026-10-29T12:00:00.000Z",
        note: "a lookup aid for support, not proof of identity",
      },
      states: {
        this_key_future_authority: "ended",
        other_keys: { live_count: 2, changed: false },
        agent_profile: "kept; status unchanged",
        deletion: "not performed",
        export: "not offered in-band",
        settlement: "not applicable: no money is involved",
        holds: "none known",
      },
      credential_note:
        "Possession of this key authorised this act. It is not proof of identity, authorship or control of the agent profile.",
      docs: "https://cambridgetcg.com/methodology/agents",
    });
    if (outcome.key_state !== "revoked") throw new Error("expected a revocation");
    expect(outcome.linearization).toContain("Prospective from the commit of this update.");
    expect(outcome.linearization).toContain(
      "A Coverage Hunt contribution re-checks this key inside its own write transaction",
    );
    expect(outcome.linearization).toContain(
      "revoked_at records when the revoking statement started; a Coverage Hunt contribution that took its key lock first may commit after that time, but none commits after the revocation does.",
    );
    expect(outcome.unknown_layers.length).toBeGreaterThan(0);
    expect(outcome.third_party_copies).toContain("cannot recall those copies");
    expect(outcome.retained).toEqual(KEY_EXIT_RETAINED);
    for (const entry of outcome.retained) {
      expect(entry.fields.length).toBeGreaterThan(0);
      expect(entry.legal_basis).toBe(
        "not separately stated; see https://cambridgetcg.com/privacy",
      );
      for (const field of ["why_kept", "who_can_see", "expiry"] as const) {
        expect(entry[field].length).toBeGreaterThan(0);
      }
    }
    expect(outcome.next_actions.map((action) => action.action)).toEqual([
      "request_erasure",
      "request_correction_or_challenge",
    ]);
    for (const action of outcome.next_actions) {
      expect(action.optional).toBe(true);
      expect(action.href).toMatch(/^mailto:support@cambridgetcg\.com\?subject=/);
    }
    expect(outcome.next_actions[1].text).toContain("No review procedure is written down yet.");
    expectNoLeak(outcome);
  });

  it("names no replacement for a self-serve agent", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [
        {
          key_prefix: "ctcg_agt_Ab1",
          revoked_at: "2026-10-29T12:00:00.000Z",
          registered_via: "self-serve",
          status: "active",
          other_live_keys: 0,
        },
      ],
    });

    const outcome = await revokePresentedKey(TOKEN, { confirm: true });

    expect(outcome).toMatchObject({
      key_state: "revoked",
      replacement: "No replacement key can be issued while self-serve registration is paused.",
    });
  });
});

describe("revokePresentedKey states replacement and authority by agent status", () => {
  it.each([
    ["operator", "active", "active", "The operator can mint a new key at /account/agents."],
    ["operator", "suspended", "suspended_with_agent", "While this agent is suspended, no new key can be minted for it."],
    ["operator", "archived", "archived_with_agent", "This agent is archived; no new key can be minted for it."],
    ["self-serve", "active", "active", "No replacement key can be issued while self-serve registration is paused."],
    ["self-serve", "suspended", "suspended_with_agent", "No replacement key can be issued while self-serve registration is paused."],
    ["self-serve", "archived", "archived_with_agent", "No replacement key can be issued while self-serve registration is paused."],
  ])("%s agent, %s: preview and revocation", async (via, status, authority, replacement) => {
    dbQuery.mockResolvedValueOnce({
      rows: [{ key_prefix: "ctcg_agt_Ab1", registered_via: via, status, other_live_keys: 0 }],
    });
    const preview = await revokePresentedKey(TOKEN);
    expect(preview).toMatchObject({
      key_state: "active",
      replacement,
      states: { this_key_future_authority: authority },
    });
    expectNoLeak(preview);

    dbQuery.mockResolvedValueOnce({
      rows: [
        {
          key_prefix: "ctcg_agt_Ab1",
          revoked_at: "2026-10-29T12:00:00.000Z",
          registered_via: via,
          status,
          other_live_keys: 0,
        },
      ],
    });
    const performed = await revokePresentedKey(TOKEN, { confirm: true });
    expect(performed).toMatchObject({
      key_state: "revoked",
      replacement,
      states: { this_key_future_authority: "ended" },
    });
    expectNoLeak(performed);
  });

  it("offers a replacement only for an active operator-managed agent, and lists every case in one summary", () => {
    for (const via of ["operator", "self-serve"] as const) {
      for (const status of ["active", "suspended", "archived"] as const) {
        const text = keyReplacementText(via, status);
        expect(text.includes("/account/agents")).toBe(via === "operator" && status === "active");
      }
    }
    for (const entry of KEY_REPLACEMENT_CASES) {
      expect(keyReplacementSummary()).toContain(`${entry.label}: ${entry.text}`);
    }
  });
});

describe("the retained inventory", () => {
  it("names the stores found outside the key and agent rows, and says it may be incomplete", () => {
    const categories = KEY_EXIT_RETAINED.map((entry) => entry.category);
    for (const store of ["user_decks", "coverage_hunt_chronicle", "agent_registration_buckets"]) {
      expect(categories.some((category) => category.startsWith(store)), store).toBe(true);
    }
    const fields = KEY_EXIT_RETAINED.flatMap((entry) => entry.fields);
    for (const field of [
      "agent_id",
      "game_rooms.player1_name",
      "game_rooms.player1_id",
      "match_lifecycle_log.actor_label",
      "metadata.turn_id",
    ]) {
      expect(fields).toContain(field);
    }
    const keyRow = KEY_EXIT_RETAINED[0];
    expect(keyRow.why_kept).toContain("No code deletes revoked key rows");
    expect(keyRow.why_kept).not.toContain("recognised as not active");
    expect(KEY_EXIT_COMPLETENESS).toContain("An agent wrote this inventory and it may be incomplete");
  });
});

describe("revokePresentedKey adds no oracle", () => {
  it("gives unknown and already-revoked strings one identical not-active answer", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    const answers = [
      await revokePresentedKey(TOKEN, { confirm: true }),
      await revokePresentedKey(OTHER_TOKEN, { confirm: true }),
      await revokePresentedKey(TOKEN),
      await revokePresentedKey(OTHER_TOKEN),
    ];

    for (const answer of answers) {
      expect(answer).toEqual(NOT_ACTIVE);
      expectNoLeak(answer);
    }
  });

  it("answers a string that cannot be a key without a lookup", async () => {
    for (const token of ["", "ctcg_agt_short", "ctcg_member_" + "a".repeat(43)]) {
      await expect(revokePresentedKey(token, { confirm: true })).resolves.toEqual(NOT_ACTIVE);
    }
    expect(dbQuery).not.toHaveBeenCalled();
  });
});

describe("revokePresentedKey when the database fails", () => {
  it("reports an unknown, retryable state and logs only the error code", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = Object.assign(
      new Error(`could not write ${hashAgentToken(TOKEN)}`),
      { code: "57P01" },
    );
    dbQuery.mockRejectedValue(failure);

    await expect(revokePresentedKey(TOKEN, { confirm: true })).resolves.toEqual({
      performed: "unknown",
      key_state: "unknown",
      retryable: true,
      message: "Revocation state is unknown. Repeating is safe; it cannot revoke anything else.",
      docs: "https://cambridgetcg.com/methodology/agents",
    });
    // A preview never writes, so its failure is not an unknown revocation.
    await expect(revokePresentedKey(TOKEN)).resolves.toMatchObject({
      performed: false,
      key_state: "unknown",
      retryable: true,
    });

    expect(consoleError).toHaveBeenCalledWith("[agent.revoke_key]", "57P01");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(hashAgentToken(TOKEN));
  });
});
