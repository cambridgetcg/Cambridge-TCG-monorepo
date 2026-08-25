/**
 * Database substrate for wallet control proofs.
 *
 * Status columns are deliberately narrow: challenges are pending, consumed,
 * or invalidated; links are active or revoked. Verification first commits a
 * bounded attempt reservation, does expensive cryptography outside a
 * transaction, then re-locks the exact challenge and applies one-use
 * consumption + owner link together.
 */

import { query, transaction } from "@/lib/db";
import type { BuiltWalletChallenge } from "./proof";
import type {
  SignatureProof,
  WalletChallengeRecord,
  WalletLinkRecord,
} from "./types";

export const WALLET_CHALLENGE_MAX_VERIFICATION_ATTEMPTS = 5;
export const WALLET_USER_MAX_VERIFICATION_ATTEMPTS_PER_HOUR = 40;

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
}

export type WalletQuery = (
  sql: string,
  params?: unknown[],
) => Promise<QueryResult>;
export type WalletTransaction = <T>(
  fn: (query: WalletQuery) => Promise<T>,
) => Promise<T>;

export interface WalletDbDependencies {
  query?: WalletQuery;
  transaction?: WalletTransaction;
}

function asDate(value: unknown): Date {
  const date =
    value instanceof Date ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime()))
    throw new Error("Wallet timestamp is invalid.");
  return date;
}

function asNullableDate(value: unknown): Date | null {
  return value == null ? null : asDate(value);
}

function challengeFromRow(row: Record<string, unknown>): WalletChallengeRecord {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    address: String(row.address) as WalletChallengeRecord["address"],
    address_key: String(
      row.address_key,
    ) as WalletChallengeRecord["address_key"],
    chain_id: Number(row.chain_id) as WalletChallengeRecord["chain_id"],
    chain_ref: String(row.chain_ref) as WalletChallengeRecord["chain_ref"],
    nonce_digest: String(row.nonce_digest),
    session_binding_digest: String(row.session_binding_digest),
    request_id: String(row.request_id),
    domain: String(row.domain),
    origin: String(row.origin),
    statement: String(row.statement),
    message: String(row.message),
    issued_at: asDate(row.issued_at),
    expires_at: asDate(row.expires_at),
    verification_attempt_count: Number(row.verification_attempt_count ?? 0),
    verification_last_attempt_at: asNullableDate(
      row.verification_last_attempt_at,
    ),
    consumed_at: asNullableDate(row.consumed_at),
    invalidated_at: asNullableDate(row.invalidated_at),
  };
}

function linkFromRow(row: Record<string, unknown>): WalletLinkRecord {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    address: String(row.address) as WalletLinkRecord["address"],
    address_key: String(row.address_key) as WalletLinkRecord["address_key"],
    chain_id: Number(row.chain_id) as WalletLinkRecord["chain_id"],
    chain_ref: String(row.chain_ref) as WalletLinkRecord["chain_ref"],
    proof_kind: String(row.proof_kind) as WalletLinkRecord["proof_kind"],
    verification_method: String(
      row.verification_method,
    ) as WalletLinkRecord["verification_method"],
    initial_challenge_id: String(row.initial_challenge_id),
    last_verified_challenge_id: String(row.last_verified_challenge_id),
    linked_at: asDate(row.linked_at),
    last_verified_at: asDate(row.last_verified_at),
    revoked_at: asNullableDate(row.revoked_at),
  };
}

function rootQuery(dependencies?: WalletDbDependencies): WalletQuery {
  return dependencies?.query ?? (query as WalletQuery);
}

function rootTransaction(
  dependencies?: WalletDbDependencies,
): WalletTransaction {
  return dependencies?.transaction ?? (transaction as WalletTransaction);
}

export async function storeWalletLinkChallenge(
  args: { user_id: string; challenge: BuiltWalletChallenge },
  dependencies?: WalletDbDependencies,
): Promise<
  | { status: "stored"; challenge: WalletChallengeRecord }
  | { status: "rate_limited" }
> {
  return rootTransaction(dependencies)(async (q) => {
    // One user-wide lock makes both properties below race-safe across all of
    // this participant's sessions: the rolling issuance cap and the
    // one-latest-challenge invalidation rule.
    await q(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `wallet-link-challenge-user:${args.user_id}`,
    ]);
    const issuedSince = new Date(
      args.challenge.issued_at.getTime() - 60 * 60 * 1_000,
    );
    const recent = await q(
      `SELECT COUNT(*)::integer AS issued_count
         FROM evm_wallet_link_challenges
        WHERE user_id = $1
          AND issued_at >= $2`,
      [args.user_id, issuedSince],
    );
    if (Number(recent.rows[0]?.issued_count ?? 0) >= 20) {
      return { status: "rate_limited" };
    }

    // Only the newest challenge for this address in this exact Cambridge
    // session remains usable. Historical rows stay explicit and inspectable.
    await q(
      `UPDATE evm_wallet_link_challenges
          SET invalidated_at = $5
        WHERE user_id = $1
          AND session_binding_digest = $2
          AND chain_id = $3
          AND address_key = $4
          AND consumed_at IS NULL
          AND invalidated_at IS NULL`,
      [
        args.user_id,
        args.challenge.session_binding_digest,
        args.challenge.chain_id,
        args.challenge.address_key,
        args.challenge.issued_at,
      ],
    );
    const inserted = await q(
      `INSERT INTO evm_wallet_link_challenges (
         id, user_id, chain_namespace, chain_id, chain_ref,
         address, address_key, nonce_digest, session_binding_digest,
         request_id, domain, origin, statement, message, issued_at, expires_at
       ) VALUES (
         $1, $2, 'eip155', $3, $4,
         $5, $6, $7, $8,
         $9, $10, $11, $12, $13, $14, $15
       )
       RETURNING *`,
      [
        args.challenge.id,
        args.user_id,
        args.challenge.chain_id,
        args.challenge.chain_ref,
        args.challenge.address,
        args.challenge.address_key,
        args.challenge.nonce_digest,
        args.challenge.session_binding_digest,
        args.challenge.request_id,
        args.challenge.domain,
        args.challenge.origin,
        args.challenge.statement,
        args.challenge.message,
        args.challenge.issued_at,
        args.challenge.expires_at,
      ],
    );
    return { status: "stored", challenge: challengeFromRow(inserted.rows[0]) };
  });
}

export async function getWalletLinkChallenge(
  args: { id: string; user_id: string; session_binding_digest: string },
  dependencies?: WalletDbDependencies,
): Promise<WalletChallengeRecord | null> {
  const result = await rootQuery(dependencies)(
    `SELECT *
       FROM evm_wallet_link_challenges
      WHERE id = $1
        AND user_id = $2
        AND session_binding_digest = $3`,
    [args.id, args.user_id, args.session_binding_digest],
  );
  return result.rows[0] ? challengeFromRow(result.rows[0]) : null;
}

export type ReserveWalletVerificationAttemptResult =
  | {
      status: "reserved";
      challenge: WalletChallengeRecord;
      attempted_at: Date;
    }
  | { status: "not_found" }
  | { status: "expired" }
  | { status: "consumed" }
  | { status: "invalidated" }
  | { status: "challenge_attempt_limited" }
  | { status: "user_rate_limited" };

/**
 * Spend one verification attempt before any signature cryptography or RPC.
 * The user advisory lock makes the challenge and rolling user caps atomic
 * across sessions; production time comes from PostgreSQL after both locks.
 */
export async function reserveWalletVerificationAttempt(
  args: {
    id: string;
    user_id: string;
    session_binding_digest: string;
    /** Injected only for deterministic tests; production uses DB time. */
    now?: Date;
  },
  dependencies?: WalletDbDependencies,
): Promise<ReserveWalletVerificationAttemptResult> {
  return rootTransaction(dependencies)(async (q) => {
    await q(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `wallet-link-challenge-user:${args.user_id}`,
    ]);
    const lockedResult = await q(
      `SELECT *
         FROM evm_wallet_link_challenges
        WHERE id = $1
          AND user_id = $2
          AND session_binding_digest = $3
        FOR UPDATE`,
      [args.id, args.user_id, args.session_binding_digest],
    );
    if (!lockedResult.rows[0]) return { status: "not_found" };
    const locked = challengeFromRow(lockedResult.rows[0]);
    // Sample time after both potentially blocking locks. A verifier waiting
    // behind another attempt/finalizer cannot spend against a stale pre-wait
    // timestamp and extend the signed lifetime.
    const attemptedAt = args.now
      ? asDate(args.now)
      : asDate(
          (await q(`SELECT clock_timestamp() AS attempt_time`)).rows[0]
            ?.attempt_time,
        );
    if (locked.consumed_at) return { status: "consumed" };
    if (locked.invalidated_at) return { status: "invalidated" };
    if (attemptedAt.getTime() >= locked.expires_at.getTime()) {
      return { status: "expired" };
    }
    if (
      locked.verification_attempt_count >=
      WALLET_CHALLENGE_MAX_VERIFICATION_ATTEMPTS
    ) {
      return { status: "challenge_attempt_limited" };
    }

    const attemptedSince = new Date(attemptedAt.getTime() - 60 * 60 * 1_000);
    const recent = await q(
      `SELECT COUNT(*)::integer AS attempt_count
         FROM evm_wallet_link_verification_attempts
        WHERE user_id = $1
          AND attempted_at >= $2`,
      [args.user_id, attemptedSince],
    );
    if (
      Number(recent.rows[0]?.attempt_count ?? 0) >=
      WALLET_USER_MAX_VERIFICATION_ATTEMPTS_PER_HOUR
    ) {
      return { status: "user_rate_limited" };
    }

    const updated = await q(
      `UPDATE evm_wallet_link_challenges
          SET verification_attempt_count = verification_attempt_count + 1,
              verification_last_attempt_at = $2
        WHERE id = $1
        RETURNING *`,
      [locked.id, attemptedAt],
    );
    await q(
      `INSERT INTO evm_wallet_link_verification_attempts (
         challenge_id, user_id, chain_id, address_key, attempted_at
       ) VALUES ($1, $2, $3, $4, $5)`,
      [
        locked.id,
        locked.user_id,
        locked.chain_id,
        locked.address_key,
        attemptedAt,
      ],
    );
    return {
      status: "reserved",
      challenge: challengeFromRow(updated.rows[0]),
      attempted_at: attemptedAt,
    };
  });
}

export type FinalizeWalletLinkResult =
  | { status: "linked"; created: boolean; link: WalletLinkRecord }
  | { status: "conflict" }
  | { status: "not_found" }
  | { status: "expired" }
  | { status: "consumed" }
  | { status: "invalidated" }
  | { status: "changed" };

export async function finalizeVerifiedWalletLink(
  args: {
    challenge: WalletChallengeRecord;
    proof: SignatureProof;
    /** Injected only for deterministic tests; production uses DB time. */
    now?: Date;
  },
  dependencies?: WalletDbDependencies,
): Promise<FinalizeWalletLinkResult> {
  return rootTransaction(dependencies)(async (q) => {
    const lockedResult = await q(
      `SELECT *
         FROM evm_wallet_link_challenges
        WHERE id = $1
          AND user_id = $2
          AND session_binding_digest = $3
        FOR UPDATE`,
      [
        args.challenge.id,
        args.challenge.user_id,
        args.challenge.session_binding_digest,
      ],
    );
    if (!lockedResult.rows[0]) return { status: "not_found" };
    const locked = challengeFromRow(lockedResult.rows[0]);
    if (locked.consumed_at) return { status: "consumed" };
    if (locked.invalidated_at) return { status: "invalidated" };

    // Cryptography happened against the pre-read row. Recompare every signed
    // field after acquiring the lock before consuming anything.
    if (
      locked.message !== args.challenge.message ||
      locked.address !== args.challenge.address ||
      locked.address_key !== args.challenge.address_key ||
      locked.chain_id !== args.challenge.chain_id ||
      locked.chain_ref !== args.challenge.chain_ref ||
      locked.nonce_digest !== args.challenge.nonce_digest ||
      locked.request_id !== args.challenge.request_id ||
      locked.domain !== args.challenge.domain ||
      locked.origin !== args.challenge.origin ||
      locked.statement !== args.challenge.statement ||
      locked.issued_at.getTime() !== args.challenge.issued_at.getTime() ||
      locked.expires_at.getTime() !== args.challenge.expires_at.getTime()
    ) {
      return { status: "changed" };
    }

    // Serialize by chain/address even before a link row exists. This closes
    // the absent-row race that SELECT ... FOR UPDATE alone cannot lock.
    await q(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `${locked.chain_id}:${locked.address_key}`,
    ]);
    const ownerResult = await q(
      `SELECT *
         FROM evm_wallet_links
        WHERE chain_id = $1
          AND address_key = $2
          AND revoked_at IS NULL
        FOR UPDATE`,
      [locked.chain_id, locked.address_key],
    );
    const existing = ownerResult.rows[0]
      ? linkFromRow(ownerResult.rows[0])
      : null;

    // Sample database wall time only after every potentially blocking lock.
    // A challenge that was valid before an address/owner lock wait must not be
    // consumed after its signed expiry using a stale pre-wait timestamp.
    const effectiveNow = args.now
      ? asDate(args.now)
      : asDate(
          (await q(`SELECT clock_timestamp() AS verification_time`)).rows[0]
            ?.verification_time,
        );
    if (effectiveNow.getTime() >= locked.expires_at.getTime()) {
      return { status: "expired" };
    }

    await q(
      `UPDATE evm_wallet_link_challenges
          SET consumed_at = $2
        WHERE id = $1`,
      [locked.id, effectiveNow],
    );

    // A valid proof never silently transfers a wallet between Cambridge
    // accounts. The claimant gets a private conflict and the prior link must
    // be explicitly revoked from its owning account first.
    if (existing && existing.user_id !== locked.user_id) {
      return { status: "conflict" };
    }

    if (existing) {
      const updated = await q(
        `UPDATE evm_wallet_links
            SET address = $2,
                proof_kind = $3,
                verification_method = $4,
                last_signature_digest = $5,
                last_verified_challenge_id = $6,
                last_verified_at = $7,
                updated_at = $7
          WHERE id = $1
          RETURNING *`,
        [
          existing.id,
          locked.address,
          args.proof.proof_kind,
          args.proof.verification_method,
          args.proof.signature_digest,
          locked.id,
          effectiveNow,
        ],
      );
      return {
        status: "linked",
        created: false,
        link: linkFromRow(updated.rows[0]),
      };
    }

    const inserted = await q(
      `INSERT INTO evm_wallet_links (
         user_id, chain_namespace, chain_id, chain_ref, address, address_key,
         proof_kind, verification_method, last_signature_digest,
         proof_scope_version, initial_challenge_id, last_verified_challenge_id,
         linked_at, last_verified_at
       ) VALUES (
         $1, 'eip155', $2, $3, $4, $5,
         $6, $7, $8,
         'wallet-control-v1', $9, $9,
         $10, $10
       )
       RETURNING *`,
      [
        locked.user_id,
        locked.chain_id,
        locked.chain_ref,
        locked.address,
        locked.address_key,
        args.proof.proof_kind,
        args.proof.verification_method,
        args.proof.signature_digest,
        locked.id,
        effectiveNow,
      ],
    );
    return {
      status: "linked",
      created: true,
      link: linkFromRow(inserted.rows[0]),
    };
  });
}

export async function listActiveWalletLinks(
  userId: string,
  dependencies?: WalletDbDependencies,
): Promise<WalletLinkRecord[]> {
  const result = await rootQuery(dependencies)(
    `SELECT *
       FROM evm_wallet_links
      WHERE user_id = $1
        AND revoked_at IS NULL
      ORDER BY linked_at DESC, id DESC`,
    [userId],
  );
  return result.rows.map(linkFromRow);
}

export type RevokeWalletLinkResult =
  | { status: "revoked"; already_revoked: boolean; id: string }
  | { status: "not_found" };

export async function revokeOwnedWalletLink(
  args: { id: string; user_id: string; now: Date },
  dependencies?: WalletDbDependencies,
): Promise<RevokeWalletLinkResult> {
  return rootTransaction(dependencies)(async (q) => {
    // Testnet v1 is deliberately last-writer-wins: this revokes the current
    // registry row but does not cancel an already issued or in-flight signed
    // challenge. Such a challenge can create a fresh link until its five-minute
    // expiry. Any payment-capable design must replace this with one shared
    // per-address generation/epoch and a consistent lock order.
    // Same predicate for missing and non-owned prevents an account from using
    // this endpoint to enumerate another participant's wallet-link history.
    const found = await q(
      `SELECT id, revoked_at
         FROM evm_wallet_links
        WHERE id = $1 AND user_id = $2
        FOR UPDATE`,
      [args.id, args.user_id],
    );
    if (!found.rows[0]) return { status: "not_found" };
    if (found.rows[0].revoked_at != null) {
      return { status: "revoked", already_revoked: true, id: args.id };
    }
    await q(
      `UPDATE evm_wallet_links
          SET revoked_at = $3, updated_at = $3
        WHERE id = $1 AND user_id = $2`,
      [args.id, args.user_id, args.now],
    );
    return { status: "revoked", already_revoked: false, id: args.id };
  });
}

export function isWalletStorageUnavailable(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: string }).code;
  return code === "42P01" || code === "42703";
}
