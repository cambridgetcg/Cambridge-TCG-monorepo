import "server-only";

import { query, transaction } from "@/lib/db";
import {
  CASHLOOM_EXPECTED_PREPARATION_STATE,
  CASHLOOM_EXPECTED_TRADE_STATE,
  CASHLOOM_PAYMENT_PREPARATION_ACTION,
  CASHLOOM_PAYMENT_PREPARATION_AUTHORITY,
  CASHLOOM_PAYMENT_PREPARATION_EFFECTS,
  CASHLOOM_PAYMENT_PREPARATION_NONCLAIMS,
  CASHLOOM_PAYMENT_PREPARATION_DISCLOSURE_NOTICE_VERSION,
  CASHLOOM_PAYMENT_PREPARATION_SCHEMA,
  CASHLOOM_PAYMENT_PREPARATION_STATE,
  buildCashloomPaymentPreparationDigests,
  cashloomPaymentPreparationId,
  cashloomPaymentPreparationRequestHash,
  type CashloomPaymentPreparationDto,
  type CashloomPaymentPreparationWrite,
} from "./preparation";

interface TradeAuthorityRow {
  id: string;
  buyer_id: string;
  seller_id: string;
  escrow_status: string;
  payment_window_open: boolean;
}

interface PreparationRow {
  preparation_id: string;
  trade_id: string;
  handoff_id: string;
  prepared_by: string;
  terms_hash: string;
  state: string;
  expected_trade_state: string;
  expected_preparation_state: string;
  disclosure_notice_version: string;
  request_hash: string;
  idempotency_key_hash: string;
  created_at: string | Date;
}

interface PreparationViewRow extends TradeAuthorityRow {
  handoff_id: string | null;
  handoff_terms_hash: string | null;
  preparation_id: string | null;
  preparation_handoff_id: string | null;
  preparation_prepared_by: string | null;
  preparation_terms_hash: string | null;
  preparation_state: string | null;
  preparation_expected_trade_state: string | null;
  preparation_expected_preparation_state: string | null;
  preparation_disclosure_notice_version: string | null;
  preparation_request_hash: string | null;
  preparation_idempotency_key_hash: string | null;
  preparation_created_at: string | Date | null;
}

export type CashloomPreparationAccessFailure =
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "forbidden" }
  | { ok: false; reason: "self_trade" };

export type CashloomPreparationFailure =
  | CashloomPreparationAccessFailure
  | {
      ok: false;
      reason:
        | "handoff_required"
        | "handoff_changed"
        | "trade_not_awaiting_payment"
        | "payment_window_expired"
        | "preparation_already_recorded"
        | "idempotency_conflict";
    };

export type CashloomPreparationUnavailableReason =
  | "buyer_only"
  | "self_trade"
  | "handoff_required"
  | "trade_not_awaiting_payment"
  | "payment_window_expired"
  | "preparation_already_recorded";

export interface CashloomPaymentPreparationView {
  preparation: CashloomPaymentPreparationDto | null;
  role: "buyer" | "seller";
  can_record_preparation: boolean;
  unavailable_reason?: CashloomPreparationUnavailableReason;
}

function isoTimestamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Database returned an invalid CashLoom preparation timestamp.");
  }
  return date.toISOString();
}

function decodePreparation(row: PreparationRow): CashloomPaymentPreparationDto {
  if (
    row.state !== CASHLOOM_PAYMENT_PREPARATION_STATE
    || row.expected_trade_state !== CASHLOOM_EXPECTED_TRADE_STATE
    || row.expected_preparation_state !== CASHLOOM_EXPECTED_PREPARATION_STATE
    || row.disclosure_notice_version
      !== CASHLOOM_PAYMENT_PREPARATION_DISCLOSURE_NOTICE_VERSION
  ) {
    throw new Error("Stored CashLoom preparation has an invalid closed state.");
  }
  const requestHash = cashloomPaymentPreparationRequestHash(row.trade_id, {
    action: CASHLOOM_PAYMENT_PREPARATION_ACTION,
    handoff_id: row.handoff_id,
    terms_hash: row.terms_hash,
    expected_trade_state: CASHLOOM_EXPECTED_TRADE_STATE,
    expected_preparation_state: CASHLOOM_EXPECTED_PREPARATION_STATE,
    disclosure_notice_version: CASHLOOM_PAYMENT_PREPARATION_DISCLOSURE_NOTICE_VERSION,
  });
  if (
    requestHash !== row.request_hash
    || cashloomPaymentPreparationId(row.prepared_by, requestHash) !== row.preparation_id
    || !/^sha256:[0-9a-f]{64}$/.test(row.idempotency_key_hash)
  ) {
    throw new Error("Stored CashLoom preparation does not match its content address.");
  }
  return {
    schema: CASHLOOM_PAYMENT_PREPARATION_SCHEMA,
    preparation_id: row.preparation_id,
    handoff_id: row.handoff_id,
    terms_hash: row.terms_hash,
    state: CASHLOOM_PAYMENT_PREPARATION_STATE,
    actor_role: "buyer",
    authority: CASHLOOM_PAYMENT_PREPARATION_AUTHORITY,
    disclosure_notice_version: CASHLOOM_PAYMENT_PREPARATION_DISCLOSURE_NOTICE_VERSION,
    created_at: isoTimestamp(row.created_at),
    effects: CASHLOOM_PAYMENT_PREPARATION_EFFECTS,
    nonclaims: CASHLOOM_PAYMENT_PREPARATION_NONCLAIMS,
  };
}

function preparationFromViewRow(row: PreparationViewRow): CashloomPaymentPreparationDto | null {
  if (!row.preparation_id) return null;
  if (
    !row.preparation_handoff_id
    || !row.preparation_prepared_by
    || !row.preparation_terms_hash
    || !row.preparation_state
    || !row.preparation_expected_trade_state
    || !row.preparation_expected_preparation_state
    || !row.preparation_disclosure_notice_version
    || !row.preparation_request_hash
    || !row.preparation_idempotency_key_hash
    || !row.preparation_created_at
  ) {
    throw new Error("Stored CashLoom preparation is incomplete.");
  }
  return decodePreparation({
    preparation_id: row.preparation_id,
    trade_id: row.id,
    handoff_id: row.preparation_handoff_id,
    prepared_by: row.preparation_prepared_by,
    terms_hash: row.preparation_terms_hash,
    state: row.preparation_state,
    expected_trade_state: row.preparation_expected_trade_state,
    expected_preparation_state: row.preparation_expected_preparation_state,
    disclosure_notice_version: row.preparation_disclosure_notice_version,
    request_hash: row.preparation_request_hash,
    idempotency_key_hash: row.preparation_idempotency_key_hash,
    created_at: row.preparation_created_at,
  });
}

export async function authorizeCashloomPaymentPreparationBuyer(
  tradeId: string,
  viewerId: string,
): Promise<{ ok: true } | CashloomPreparationAccessFailure> {
  const result = await query(
    `SELECT buyer_id, seller_id
       FROM market_trades
      WHERE id = $1`,
    [tradeId],
  );
  if (!result.rows[0]) return { ok: false, reason: "not_found" };
  if (result.rows[0].buyer_id !== viewerId) return { ok: false, reason: "forbidden" };
  if (result.rows[0].buyer_id === result.rows[0].seller_id) {
    return { ok: false, reason: "self_trade" };
  }
  return { ok: true };
}

export async function getCashloomPaymentPreparationView(
  tradeId: string,
  viewerId: string,
): Promise<{ ok: true; value: CashloomPaymentPreparationView } | CashloomPreparationAccessFailure> {
  // Authorize before selecting receipt material. The second query repeats the
  // participant predicate so a later read never relies on this first result.
  const access = await query(
    `SELECT buyer_id, seller_id
       FROM market_trades
      WHERE id = $1`,
    [tradeId],
  );
  if (!access.rows[0]) return { ok: false, reason: "not_found" };
  const { buyer_id: buyerId, seller_id: sellerId } = access.rows[0];
  if (buyerId !== viewerId && sellerId !== viewerId) {
    return { ok: false, reason: "forbidden" };
  }

  const result = await query(
    `SELECT t.id, t.buyer_id, t.seller_id, t.escrow_status::text,
            (t.payment_expires_at IS NULL OR t.payment_expires_at > NOW()) AS payment_window_open,
            handoff.handoff_id, handoff.terms_hash AS handoff_terms_hash,
            prep.preparation_id,
            prep.handoff_id AS preparation_handoff_id,
            prep.prepared_by AS preparation_prepared_by,
            prep.terms_hash AS preparation_terms_hash,
            prep.state AS preparation_state,
            prep.expected_trade_state AS preparation_expected_trade_state,
            prep.expected_preparation_state AS preparation_expected_preparation_state,
            prep.disclosure_notice_version AS preparation_disclosure_notice_version,
            prep.request_hash AS preparation_request_hash,
            prep.idempotency_key_hash AS preparation_idempotency_key_hash,
            prep.created_at AS preparation_created_at
       FROM market_trades t
       LEFT JOIN market_trade_cashloom_handoffs handoff ON handoff.trade_id = t.id
       LEFT JOIN market_trade_cashloom_payment_preparations prep ON prep.trade_id = t.id
      WHERE t.id = $1
        AND (t.buyer_id = $2 OR t.seller_id = $2)`,
    [tradeId, viewerId],
  );
  if (!result.rows[0]) return { ok: false, reason: "forbidden" };
  const row = result.rows[0] as PreparationViewRow;
  const preparation = preparationFromViewRow(row);
  const role = row.buyer_id === viewerId ? "buyer" : "seller";
  let unavailable: CashloomPreparationUnavailableReason | undefined;
  if (preparation) unavailable = "preparation_already_recorded";
  else if (row.buyer_id === row.seller_id) unavailable = "self_trade";
  else if (role !== "buyer") unavailable = "buyer_only";
  else if (!row.handoff_id) unavailable = "handoff_required";
  else if (row.escrow_status !== CASHLOOM_EXPECTED_TRADE_STATE) unavailable = "trade_not_awaiting_payment";
  else if (!row.payment_window_open) unavailable = "payment_window_expired";
  return {
    ok: true,
    value: {
      preparation,
      role,
      can_record_preparation: unavailable === undefined,
      ...(unavailable ? { unavailable_reason: unavailable } : {}),
    },
  };
}

const LOCK_TRADE = `
  SELECT id, buyer_id, seller_id, escrow_status::text,
         (payment_expires_at IS NULL OR payment_expires_at > NOW()) AS payment_window_open
    FROM market_trades
   WHERE id = $1
   FOR UPDATE`;

const SELECT_PREPARATION_COLUMNS = `
  SELECT preparation_id, trade_id, handoff_id, prepared_by, terms_hash,
         state, expected_trade_state, expected_preparation_state,
         disclosure_notice_version, request_hash, idempotency_key_hash, created_at
    FROM market_trade_cashloom_payment_preparations`;

function isExactReplay(
  row: PreparationRow,
  tradeId: string,
  viewerId: string,
  input: CashloomPaymentPreparationWrite,
): boolean {
  const digests = buildCashloomPaymentPreparationDigests(tradeId, viewerId, input);
  return row.trade_id === tradeId
    && row.prepared_by === viewerId
    && row.handoff_id === input.handoff_id
    && row.terms_hash === input.terms_hash
    && row.request_hash === digests.request_hash
    && row.idempotency_key_hash === digests.idempotency_key_hash
    && row.preparation_id === digests.preparation_id;
}

export async function recordCashloomPaymentPreparation(
  tradeId: string,
  viewerId: string,
  input: CashloomPaymentPreparationWrite,
): Promise<
  | { ok: true; value: CashloomPaymentPreparationDto; reused: boolean }
  | CashloomPreparationFailure
> {
  return transaction(async (txQuery) => {
    const tradeResult = await txQuery(LOCK_TRADE, [tradeId]);
    if (!tradeResult.rows[0]) return { ok: false, reason: "not_found" } as const;
    const trade = tradeResult.rows[0] as TradeAuthorityRow;
    if (trade.buyer_id !== viewerId) return { ok: false, reason: "forbidden" } as const;
    if (trade.buyer_id === trade.seller_id) return { ok: false, reason: "self_trade" } as const;

    const digests = buildCashloomPaymentPreparationDigests(tradeId, viewerId, input);

    // Idempotency is checked before current-state gates: an exact retry must
    // return the original stored success even if the trade advanced later.
    const keyed = await txQuery(
      `${SELECT_PREPARATION_COLUMNS}
        WHERE prepared_by = $1 AND idempotency_key_hash = $2`,
      [viewerId, digests.idempotency_key_hash],
    );
    if (keyed.rows[0]) {
      const row = keyed.rows[0] as PreparationRow;
      if (!isExactReplay(row, tradeId, viewerId, input)) {
        return { ok: false, reason: "idempotency_conflict" } as const;
      }
      return { ok: true, value: decodePreparation(row), reused: true } as const;
    }

    const existing = await txQuery(
      `${SELECT_PREPARATION_COLUMNS}
        WHERE trade_id = $1`,
      [tradeId],
    );
    if (existing.rows[0]) {
      return { ok: false, reason: "preparation_already_recorded" } as const;
    }
    if (trade.escrow_status !== CASHLOOM_EXPECTED_TRADE_STATE) {
      return { ok: false, reason: "trade_not_awaiting_payment" } as const;
    }
    if (!trade.payment_window_open) {
      return { ok: false, reason: "payment_window_expired" } as const;
    }

    const handoff = await txQuery(
      `SELECT handoff_id, terms_hash
         FROM market_trade_cashloom_handoffs
        WHERE trade_id = $1`,
      [tradeId],
    );
    if (!handoff.rows[0]) return { ok: false, reason: "handoff_required" } as const;
    if (
      handoff.rows[0].handoff_id !== input.handoff_id
      || handoff.rows[0].terms_hash !== input.terms_hash
    ) {
      return { ok: false, reason: "handoff_changed" } as const;
    }

    const inserted = await txQuery(
      `INSERT INTO market_trade_cashloom_payment_preparations
         (preparation_id, trade_id, handoff_id, prepared_by, terms_hash,
          state, expected_trade_state, expected_preparation_state,
          disclosure_notice_version, request_hash, idempotency_key_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT DO NOTHING
       RETURNING preparation_id`,
      [
        digests.preparation_id,
        tradeId,
        input.handoff_id,
        viewerId,
        input.terms_hash,
        CASHLOOM_PAYMENT_PREPARATION_STATE,
        CASHLOOM_EXPECTED_TRADE_STATE,
        CASHLOOM_EXPECTED_PREPARATION_STATE,
        CASHLOOM_PAYMENT_PREPARATION_DISCLOSURE_NOTICE_VERSION,
        digests.request_hash,
        digests.idempotency_key_hash,
      ],
    );

    // A different-trade reuse of the same actor/key or an unexpected writer
    // can win another unique constraint while this transaction waits.
    if (inserted.rowCount === 0) {
      const retryWinner = await txQuery(
        `${SELECT_PREPARATION_COLUMNS}
          WHERE prepared_by = $1 AND idempotency_key_hash = $2`,
        [viewerId, digests.idempotency_key_hash],
      );
      if (retryWinner.rows[0]) {
        const row = retryWinner.rows[0] as PreparationRow;
        if (!isExactReplay(row, tradeId, viewerId, input)) {
          return { ok: false, reason: "idempotency_conflict" } as const;
        }
        return { ok: true, value: decodePreparation(row), reused: true } as const;
      }
      return { ok: false, reason: "preparation_already_recorded" } as const;
    }

    const winner = await txQuery(
      `${SELECT_PREPARATION_COLUMNS}
        WHERE preparation_id = $1`,
      [digests.preparation_id],
    );
    if (!winner.rows[0]) {
      throw new Error("CashLoom preparation insert did not produce a stored winner.");
    }
    return {
      ok: true,
      value: decodePreparation(winner.rows[0] as PreparationRow),
      reused: false,
    } as const;
  });
}

export function isCashloomPaymentPreparationMigrationMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "42P01";
}
