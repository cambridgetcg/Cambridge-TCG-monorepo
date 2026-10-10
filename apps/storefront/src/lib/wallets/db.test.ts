import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ query: vi.fn(), transaction: vi.fn() }));

import {
  finalizeVerifiedWalletLink,
  reserveWalletVerificationAttempt,
  revokeOwnedWalletLink,
  storeWalletLinkChallenge,
  type WalletQuery,
  type WalletTransaction,
} from "./db";
import type { BuiltWalletChallenge } from "./proof";
import type { WalletChallengeRecord } from "./types";

const NOW = new Date("2026-08-23T12:01:00.000Z");
const USER_ID = "123e4567-e89b-42d3-a456-426614174099";
const OTHER_USER_ID = "123e4567-e89b-42d3-a456-426614174088";
const CHALLENGE_ID = "123e4567-e89b-42d3-a456-426614174001";
const WALLET_ID = "123e4567-e89b-42d3-a456-426614174002";
const ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const challenge: WalletChallengeRecord = {
  id: CHALLENGE_ID,
  user_id: USER_ID,
  address: ADDRESS,
  address_key: ADDRESS.toLowerCase() as `0x${string}`,
  chain_id: 84_532,
  chain_ref: "eip155:84532",
  nonce_digest: "a".repeat(64),
  session_binding_digest: "b".repeat(64),
  request_id: CHALLENGE_ID,
  domain: "cambridgetcg.com",
  origin: "https://cambridgetcg.com",
  statement: "proof statement",
  message: "exact message",
  issued_at: new Date("2026-08-23T12:00:00.000Z"),
  expires_at: new Date("2026-08-23T12:05:00.000Z"),
  verification_attempt_count: 0,
  verification_last_attempt_at: null,
  consumed_at: null,
  invalidated_at: null,
};

function challengeRow(overrides: Record<string, unknown> = {}) {
  return { ...challenge, ...overrides };
}

function linkRow(userId = USER_ID, overrides: Record<string, unknown> = {}) {
  return {
    id: WALLET_ID,
    user_id: userId,
    address: ADDRESS,
    address_key: ADDRESS.toLowerCase(),
    chain_id: 84_532,
    chain_ref: "eip155:84532",
    proof_kind: "eoa",
    verification_method: "viem_eoa_local",
    initial_challenge_id: "123e4567-e89b-42d3-a456-426614174009",
    last_verified_challenge_id: CHALLENGE_ID,
    linked_at: "2026-08-23T11:00:00.000Z",
    last_verified_at: NOW.toISOString(),
    revoked_at: null,
    ...overrides,
  };
}

function scriptedTransaction(handler: WalletQuery): WalletTransaction {
  return async <T>(fn: (query: WalletQuery) => Promise<T>) => fn(handler);
}

function concurrentBudgetHarness(
  initialRows: Map<string, Record<string, unknown>>,
  initialLedgerCount: number,
): {
  transaction: WalletTransaction;
  rows: Map<string, Record<string, unknown>>;
  ledgerCount: () => number;
} {
  const rows = new Map(initialRows);
  let ledgerCount = initialLedgerCount;
  let lockTail = Promise.resolve();

  const transaction: WalletTransaction = async <T>(
    fn: (query: WalletQuery) => Promise<T>,
  ): Promise<T> => {
    let releaseUserLock: (() => void) | undefined;
    const q: WalletQuery = async (sql, params) => {
      if (sql.includes("pg_advisory_xact_lock")) {
        const previous = lockTail;
        lockTail = new Promise<void>((resolve) => {
          releaseUserLock = resolve;
        });
        await previous;
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("FOR UPDATE")) {
        const row = rows.get(String(params?.[0]));
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      if (sql.includes("clock_timestamp()")) {
        return { rows: [{ attempt_time: NOW }], rowCount: 1 };
      }
      if (sql.includes("COUNT(*)")) {
        return { rows: [{ attempt_count: ledgerCount }], rowCount: 1 };
      }
      if (sql.includes("SET verification_attempt_count")) {
        const id = String(params?.[0]);
        const row = rows.get(id);
        if (!row) return { rows: [], rowCount: 0 };
        const updated = {
          ...row,
          verification_attempt_count:
            Number(row.verification_attempt_count) + 1,
          verification_last_attempt_at: params?.[1],
        };
        rows.set(id, updated);
        return { rows: [updated], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO evm_wallet_link_verification_attempts")) {
        ledgerCount += 1;
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    };

    try {
      return await fn(q);
    } finally {
      releaseUserLock?.();
    }
  };

  return { transaction, rows, ledgerCount: () => ledgerCount };
}

const proof = {
  proof_kind: "eoa" as const,
  verification_method: "viem_eoa_local" as const,
  signature_digest: "c".repeat(64),
};

function builtChallenge(): BuiltWalletChallenge {
  return {
    id: challenge.id,
    address: challenge.address,
    address_key: challenge.address_key,
    chain_id: challenge.chain_id,
    chain_ref: challenge.chain_ref,
    nonce_digest: challenge.nonce_digest,
    session_binding_digest: challenge.session_binding_digest,
    request_id: challenge.request_id,
    domain: challenge.domain,
    origin: challenge.origin,
    statement: challenge.statement,
    message: challenge.message,
    issued_at: challenge.issued_at,
    expires_at: challenge.expires_at,
  };
}

describe("serialized challenge issuance", () => {
  it("takes the user lock before counting, invalidating, and inserting", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const q: WalletQuery = async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("COUNT(*)")) {
        return { rows: [{ issued_count: 19 }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO evm_wallet_link_challenges")) {
        return { rows: [challengeRow()], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    };

    const result = await storeWalletLinkChallenge(
      { user_id: USER_ID, challenge: builtChallenge() },
      { transaction: scriptedTransaction(q) },
    );

    expect(result).toMatchObject({
      status: "stored",
      challenge: { id: CHALLENGE_ID },
    });
    expect(calls.map(({ sql }) => sql)).toEqual([
      expect.stringContaining("pg_advisory_xact_lock"),
      expect.stringContaining("COUNT(*)"),
      expect.stringContaining("UPDATE evm_wallet_link_challenges"),
      expect.stringContaining("INSERT INTO evm_wallet_link_challenges"),
    ]);
    expect(calls[0]?.params).toEqual([`wallet-link-challenge-user:${USER_ID}`]);
    expect(calls[2]?.params).toEqual([
      USER_ID,
      challenge.session_binding_digest,
      challenge.chain_id,
      challenge.address_key,
      challenge.issued_at,
    ]);
  });

  it("returns a typed cap result at 20 challenges per user/hour without invalidating", async () => {
    const calls: string[] = [];
    const q: WalletQuery = async (sql) => {
      calls.push(sql);
      if (sql.includes("COUNT(*)")) {
        return { rows: [{ issued_count: "20" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    };

    await expect(
      storeWalletLinkChallenge(
        { user_id: USER_ID, challenge: builtChallenge() },
        { transaction: scriptedTransaction(q) },
      ),
    ).resolves.toEqual({ status: "rate_limited" });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("pg_advisory_xact_lock");
    expect(calls[1]).toContain("COUNT(*)");
  });
});

describe("atomic verification attempt budget", () => {
  it("takes the user lock, challenge row lock, then DB clock before spending an attempt", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const q: WalletQuery = async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("clock_timestamp()")) {
        return { rows: [{ attempt_time: NOW }], rowCount: 1 };
      }
      if (sql.includes("FOR UPDATE")) {
        return { rows: [challengeRow()], rowCount: 1 };
      }
      if (
        sql.includes("evm_wallet_link_verification_attempts") &&
        sql.includes("COUNT")
      ) {
        return { rows: [{ attempt_count: 39 }], rowCount: 1 };
      }
      if (sql.includes("SET verification_attempt_count")) {
        return {
          rows: [
            challengeRow({
              verification_attempt_count: 1,
              verification_last_attempt_at: NOW,
            }),
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    };

    await expect(
      reserveWalletVerificationAttempt(
        {
          id: CHALLENGE_ID,
          user_id: USER_ID,
          session_binding_digest: challenge.session_binding_digest,
        },
        { transaction: scriptedTransaction(q) },
      ),
    ).resolves.toMatchObject({
      status: "reserved",
      attempted_at: NOW,
      challenge: { verification_attempt_count: 1 },
    });
    expect(calls.map(({ sql }) => sql)).toEqual([
      expect.stringContaining("pg_advisory_xact_lock"),
      expect.stringContaining("FOR UPDATE"),
      expect.stringContaining("clock_timestamp()"),
      expect.stringContaining("evm_wallet_link_verification_attempts"),
      expect.stringContaining("SET verification_attempt_count"),
      expect.stringContaining(
        "INSERT INTO evm_wallet_link_verification_attempts",
      ),
    ]);
    expect(calls[4]?.params).toEqual([CHALLENGE_ID, NOW]);
    expect(calls[5]?.params).toEqual([
      CHALLENGE_ID,
      USER_ID,
      challenge.chain_id,
      challenge.address_key,
      NOW,
    ]);
  });

  it("serializes concurrent per-challenge and per-user budget reservations", async () => {
    const sameChallenge = concurrentBudgetHarness(
      new Map([
        [CHALLENGE_ID, challengeRow({ verification_attempt_count: 4 })],
      ]),
      0,
    );
    const sameResults = await Promise.all([
      reserveWalletVerificationAttempt(
        {
          id: CHALLENGE_ID,
          user_id: USER_ID,
          session_binding_digest: challenge.session_binding_digest,
        },
        { transaction: sameChallenge.transaction },
      ),
      reserveWalletVerificationAttempt(
        {
          id: CHALLENGE_ID,
          user_id: USER_ID,
          session_binding_digest: challenge.session_binding_digest,
        },
        { transaction: sameChallenge.transaction },
      ),
    ]);
    expect(sameResults.map(({ status }) => status).sort()).toEqual([
      "challenge_attempt_limited",
      "reserved",
    ]);
    expect(
      sameChallenge.rows.get(CHALLENGE_ID)?.verification_attempt_count,
    ).toBe(5);
    expect(sameChallenge.ledgerCount()).toBe(1);

    const otherChallengeId = "123e4567-e89b-42d3-a456-426614174003";
    const sameUser = concurrentBudgetHarness(
      new Map([
        [CHALLENGE_ID, challengeRow()],
        [otherChallengeId, challengeRow({ id: otherChallengeId })],
      ]),
      39,
    );
    const userResults = await Promise.all([
      reserveWalletVerificationAttempt(
        {
          id: CHALLENGE_ID,
          user_id: USER_ID,
          session_binding_digest: challenge.session_binding_digest,
        },
        { transaction: sameUser.transaction },
      ),
      reserveWalletVerificationAttempt(
        {
          id: otherChallengeId,
          user_id: USER_ID,
          session_binding_digest: challenge.session_binding_digest,
        },
        { transaction: sameUser.transaction },
      ),
    ]);
    expect(userResults.map(({ status }) => status).sort()).toEqual([
      "reserved",
      "user_rate_limited",
    ]);
    expect(sameUser.ledgerCount()).toBe(40);
    expect(
      [...sameUser.rows.values()].reduce(
        (total, row) => total + Number(row.verification_attempt_count),
        0,
      ),
    ).toBe(1);
  });

  it("returns terminal and 429 budget statuses without spending another attempt", async () => {
    for (const testCase of [
      {
        row: challengeRow({ verification_attempt_count: 5 }),
        recent: 0,
        status: "challenge_attempt_limited",
      },
      {
        row: challengeRow({ verification_attempt_count: 1 }),
        recent: 40,
        status: "user_rate_limited",
      },
      {
        row: challengeRow({ consumed_at: NOW }),
        recent: 0,
        status: "consumed",
      },
      {
        row: challengeRow({ invalidated_at: NOW }),
        recent: 0,
        status: "invalidated",
      },
      {
        row: challengeRow(),
        recent: 0,
        status: "expired",
        now: challenge.expires_at,
      },
    ] as const) {
      const calls: string[] = [];
      const q: WalletQuery = async (sql) => {
        calls.push(sql);
        if (sql.includes("FOR UPDATE")) {
          return { rows: [testCase.row], rowCount: 1 };
        }
        if (
          sql.includes("evm_wallet_link_verification_attempts") &&
          sql.includes("COUNT")
        ) {
          return {
            rows: [{ attempt_count: testCase.recent }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      };
      await expect(
        reserveWalletVerificationAttempt(
          {
            id: CHALLENGE_ID,
            user_id: USER_ID,
            session_binding_digest: challenge.session_binding_digest,
            now: "now" in testCase ? testCase.now : NOW,
          },
          { transaction: scriptedTransaction(q) },
        ),
      ).resolves.toEqual({ status: testCase.status });
      expect(
        calls.some((sql) => sql.includes("SET verification_attempt_count")),
      ).toBe(false);
      expect(
        calls.some((sql) =>
          sql.includes("INSERT INTO evm_wallet_link_verification_attempts"),
        ),
      ).toBe(false);
    }
  });
});

describe("atomic wallet ownership finalization", () => {
  it("consumes a valid challenge but refuses silent transfer to another owner", async () => {
    const calls: string[] = [];
    const q: WalletQuery = async (sql) => {
      calls.push(sql);
      if (sql.includes("FROM evm_wallet_link_challenges"))
        return { rows: [challengeRow()], rowCount: 1 };
      if (sql.includes("FROM evm_wallet_links"))
        return { rows: [linkRow(OTHER_USER_ID)], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    };
    const result = await finalizeVerifiedWalletLink(
      { challenge, proof, now: NOW },
      { transaction: scriptedTransaction(q) },
    );
    expect(result).toEqual({ status: "conflict" });
    expect(calls.some((sql) => sql.includes("SET consumed_at"))).toBe(true);
    expect(
      calls.some((sql) => sql.includes("INSERT INTO evm_wallet_links")),
    ).toBe(false);
  });

  it("is idempotent for the same active Cambridge owner", async () => {
    const calls: string[] = [];
    const q: WalletQuery = async (sql) => {
      calls.push(sql);
      if (sql.includes("FROM evm_wallet_link_challenges"))
        return { rows: [challengeRow()], rowCount: 1 };
      if (sql.includes("FROM evm_wallet_links"))
        return { rows: [linkRow()], rowCount: 1 };
      if (sql.includes("UPDATE evm_wallet_links"))
        return { rows: [linkRow()], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    };
    const result = await finalizeVerifiedWalletLink(
      { challenge, proof, now: NOW },
      { transaction: scriptedTransaction(q) },
    );
    expect(result).toMatchObject({
      status: "linked",
      created: false,
      link: { id: WALLET_ID },
    });
    expect(
      calls.some((sql) => sql.includes("INSERT INTO evm_wallet_links")),
    ).toBe(false);
  });

  it("rejects replay after the challenge is consumed without touching a link", async () => {
    const q = vi.fn<WalletQuery>().mockResolvedValue({
      rows: [challengeRow({ consumed_at: NOW.toISOString() })],
      rowCount: 1,
    });
    const result = await finalizeVerifiedWalletLink(
      { challenge, proof, now: NOW },
      { transaction: scriptedTransaction(q) },
    );
    expect(result).toEqual({ status: "consumed" });
    expect(q).toHaveBeenCalledTimes(1);
  });

  it("uses wall time after every blocking lock, rejecting expiry before consumption", async () => {
    const calls: string[] = [];
    const q: WalletQuery = async (sql) => {
      calls.push(sql);
      if (sql.includes("FROM evm_wallet_link_challenges")) {
        return { rows: [challengeRow()], rowCount: 1 };
      }
      if (sql.includes("pg_advisory_xact_lock")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("FROM evm_wallet_links")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("clock_timestamp()")) {
        return {
          rows: [{ verification_time: challenge.expires_at }],
          rowCount: 1,
        };
      }
      throw new Error(`Unexpected query after expiry: ${sql}`);
    };

    await expect(
      finalizeVerifiedWalletLink(
        { challenge, proof },
        { transaction: scriptedTransaction(q) },
      ),
    ).resolves.toEqual({ status: "expired" });
    expect(calls).toHaveLength(4);
    expect(calls[0]).toContain("FOR UPDATE");
    expect(calls[1]).toContain("pg_advisory_xact_lock");
    expect(calls[2]).toContain("FROM evm_wallet_links");
    expect(calls[2]).toContain("FOR UPDATE");
    expect(calls[3]).toContain("clock_timestamp()");
    expect(calls.some((sql) => sql.includes("SET consumed_at"))).toBe(false);
    expect(
      calls.some((sql) => sql.includes("INSERT INTO evm_wallet_links")),
    ).toBe(false);
  });
});

describe("safe wallet revocation", () => {
  it("uses explicit last-writer semantics and leaves issued challenges untouched", async () => {
    const activeCalls: string[] = [];
    const active: WalletQuery = async (sql) => {
      activeCalls.push(sql);
      if (sql.includes("SELECT id, revoked_at")) {
        return { rows: [{ id: WALLET_ID, revoked_at: null }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    };
    await expect(
      revokeOwnedWalletLink(
        { id: WALLET_ID, user_id: USER_ID, now: NOW },
        { transaction: scriptedTransaction(active) },
      ),
    ).resolves.toEqual({
      status: "revoked",
      already_revoked: false,
      id: WALLET_ID,
    });
    // Testnet v1 documents last-writer semantics: current-row revocation does
    // not pretend to cancel a separately issued or in-flight proof.
    expect(
      activeCalls.some((sql) => sql.includes("evm_wallet_link_challenges")),
    ).toBe(false);

    // A challenge already held by another request therefore remains governed
    // by its own one-use and five-minute checks. A later successful verifier
    // may re-create the active link; revocation is not a cancellation token.

    const revoked: WalletQuery = async () => ({
      rows: [{ id: WALLET_ID, revoked_at: NOW.toISOString() }],
      rowCount: 1,
    });
    await expect(
      revokeOwnedWalletLink(
        { id: WALLET_ID, user_id: USER_ID, now: NOW },
        { transaction: scriptedTransaction(revoked) },
      ),
    ).resolves.toEqual({
      status: "revoked",
      already_revoked: true,
      id: WALLET_ID,
    });
  });

  it("uses the same not-found result for absent and non-owned IDs", async () => {
    const none: WalletQuery = async () => ({ rows: [], rowCount: 0 });
    await expect(
      revokeOwnedWalletLink(
        { id: WALLET_ID, user_id: USER_ID, now: NOW },
        { transaction: scriptedTransaction(none) },
      ),
    ).resolves.toEqual({ status: "not_found" });
  });
});
