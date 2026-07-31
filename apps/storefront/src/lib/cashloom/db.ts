import "server-only";

import { query, transaction } from "@/lib/db";
import {
  CASHLOOM_DISCLOSURE_NOTICE_VERSION,
  CASHLOOM_HANDOFF_MODE,
  CASHLOOM_IDENTITY_ASSURANCE,
  type CashloomProfileWrite,
  type CashloomSettlementProfileDto,
} from "./contract";
import {
  buildCashloomHandoffWithSystemEntropy,
  canonicalJson,
  parseCashloomHandoffPacket,
  sha256Id,
  type CashloomHandoffDto,
  type CashloomHandoffUnavailableReason,
  type CashloomTradeHandoffView,
  type CashloomTradeSnapshot,
} from "./handoff";

interface ProfileRow {
  merchant_key_id: string;
  enabled: boolean;
  handoff_mode: typeof CASHLOOM_HANDOFF_MODE;
  disclosure_notice_version: typeof CASHLOOM_DISCLOSURE_NOTICE_VERSION;
  disclosure_acknowledged_at: string | Date;
  created_at: string | Date;
  updated_at: string | Date;
}

interface HandoffRow {
  handoff_id: string;
  merchant_key_id: string;
  terms_hash: string;
  expected_purpose_note: string;
  canonical_json: string;
  created_at: string | Date;
}

interface TradeViewRow extends CashloomTradeSnapshot {
  payment_window_open: boolean;
  profile_configured: boolean;
  profile_enabled: boolean;
  handoff_id: string | null;
  handoff_merchant_key_id: string | null;
  handoff_terms_hash: string | null;
  handoff_expected_purpose_note: string | null;
  handoff_canonical_json: string | null;
  handoff_created_at: string | Date | null;
}

export type CashloomTradeAccessFailure =
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "forbidden" };

export type CashloomPrepareFailure =
  | CashloomTradeAccessFailure
  | {
      ok: false;
      reason:
        | "trade_not_awaiting_payment"
        | "payment_window_expired"
        | "cashloom_profile_required"
        | "cashloom_profile_disabled";
    };

export async function authorizeCashloomTradeSeller(
  tradeId: string,
  viewerId: string,
): Promise<{ ok: true } | CashloomTradeAccessFailure> {
  // This deliberately projects only the seller id. POST uses it before
  // reading an untrusted request body; the transactional prepare path below
  // repeats authorization and every state check before inserting anything.
  const result = await query(
    `SELECT seller_id
       FROM market_trades
      WHERE id = $1`,
    [tradeId],
  );
  if (!result.rows[0]) return { ok: false, reason: "not_found" };
  if (result.rows[0].seller_id !== viewerId) {
    return { ok: false, reason: "forbidden" };
  }
  return { ok: true };
}

function isoTimestamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Database returned an invalid timestamp.");
  return date.toISOString();
}

function profileDto(row: ProfileRow): CashloomSettlementProfileDto {
  return {
    merchant_key_id: row.merchant_key_id,
    enabled: row.enabled,
    handoff_mode: CASHLOOM_HANDOFF_MODE,
    identity_assurance: CASHLOOM_IDENTITY_ASSURANCE,
    disclosure_notice_version: CASHLOOM_DISCLOSURE_NOTICE_VERSION,
    disclosure_acknowledged_at: isoTimestamp(row.disclosure_acknowledged_at),
    created_at: isoTimestamp(row.created_at),
    updated_at: isoTimestamp(row.updated_at),
  };
}

export async function getCashloomSettlementProfile(
  userId: string,
): Promise<CashloomSettlementProfileDto | null> {
  const result = await query(
    `SELECT merchant_key_id, enabled, handoff_mode, disclosure_notice_version,
            disclosure_acknowledged_at, created_at, updated_at
       FROM cashloom_settlement_profiles
      WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0] ? profileDto(result.rows[0] as ProfileRow) : null;
}

export async function saveCashloomSettlementProfile(
  userId: string,
  input: CashloomProfileWrite,
): Promise<CashloomSettlementProfileDto> {
  const result = await query(
    `INSERT INTO cashloom_settlement_profiles
       (user_id, merchant_key_id, enabled, handoff_mode,
        disclosure_notice_version, disclosure_acknowledged_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       merchant_key_id = EXCLUDED.merchant_key_id,
       enabled = EXCLUDED.enabled,
       handoff_mode = EXCLUDED.handoff_mode,
       disclosure_notice_version = EXCLUDED.disclosure_notice_version,
       disclosure_acknowledged_at = NOW(),
       updated_at = NOW()
     RETURNING merchant_key_id, enabled, handoff_mode, disclosure_notice_version,
               disclosure_acknowledged_at, created_at, updated_at`,
    [
      userId,
      input.merchant_key_id,
      input.enabled,
      CASHLOOM_HANDOFF_MODE,
      CASHLOOM_DISCLOSURE_NOTICE_VERSION,
    ],
  );
  return profileDto(result.rows[0] as ProfileRow);
}

export async function deleteCashloomSettlementProfile(userId: string): Promise<void> {
  await query(`DELETE FROM cashloom_settlement_profiles WHERE user_id = $1`, [userId]);
}

function decodeHandoff(row: HandoffRow): CashloomHandoffDto {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.canonical_json);
  } catch {
    throw new Error("Stored CashLoom handoff is not valid JSON.");
  }
  if (canonicalJson(parsed) !== row.canonical_json || sha256Id(row.canonical_json) !== row.handoff_id) {
    throw new Error("Stored CashLoom handoff does not match its canonical identifier.");
  }
  const packet = parseCashloomHandoffPacket(parsed);
  const refs = packet.binding.participant_references;
  if (
    packet.merchant_key_id !== row.merchant_key_id
    || packet.binding.terms_hash !== row.terms_hash
    || packet.binding.expected_purpose_note !== row.expected_purpose_note
  ) {
    throw new Error("Stored CashLoom handoff contradicts its immutable metadata or nonclaims.");
  }

  const recomputedTermsHash = sha256Id(canonicalJson({
    nonce_hex: packet.binding.nonce_hex,
    terms: packet.terms,
  }));
  const recomputedPurposeNote = `ctcg:v1:${sha256Id(canonicalJson({
    merchant_key_id: packet.merchant_key_id,
    participant_references: refs,
    terms_hash: recomputedTermsHash,
  })).slice(7)}`;
  if (recomputedTermsHash !== row.terms_hash || recomputedPurposeNote !== row.expected_purpose_note) {
    throw new Error("Stored CashLoom handoff terms or public-purpose binding do not verify.");
  }

  return {
    packet,
    canonical_json: row.canonical_json,
    handoff_id: row.handoff_id,
    terms_hash: row.terms_hash,
    expected_purpose_note: row.expected_purpose_note,
    created_at: isoTimestamp(row.created_at),
    effects: packet.effects,
    nonclaims: packet.nonclaims,
  };
}

function handoffFromTradeRow(row: TradeViewRow): CashloomHandoffDto | null {
  if (!row.handoff_id) return null;
  if (
    !row.handoff_merchant_key_id
    || !row.handoff_terms_hash
    || !row.handoff_expected_purpose_note
    || !row.handoff_canonical_json
    || !row.handoff_created_at
  ) {
    throw new Error("Stored CashLoom handoff is incomplete.");
  }
  return decodeHandoff({
    handoff_id: row.handoff_id,
    merchant_key_id: row.handoff_merchant_key_id,
    terms_hash: row.handoff_terms_hash,
    expected_purpose_note: row.handoff_expected_purpose_note,
    canonical_json: row.handoff_canonical_json,
    created_at: row.handoff_created_at,
  });
}

function unavailableReason(
  row: TradeViewRow,
  role: "buyer" | "seller",
  handoff: CashloomHandoffDto | null,
): CashloomHandoffUnavailableReason | undefined {
  if (handoff) return "handoff_already_prepared";
  if (role !== "seller") return "seller_only";
  if (row.escrow_status !== "awaiting_payment") return "trade_not_awaiting_payment";
  if (!row.payment_window_open) return "payment_window_expired";
  if (!row.profile_configured) return "cashloom_profile_required";
  if (!row.profile_enabled) return "cashloom_profile_disabled";
  return undefined;
}

function viewFromRow(row: TradeViewRow, viewerId: string): CashloomTradeHandoffView {
  const role = row.buyer_id === viewerId ? "buyer" : "seller";
  const handoff = handoffFromTradeRow(row);
  const reason = unavailableReason(row, role, handoff);
  return {
    handoff,
    role,
    can_prepare: reason === undefined,
    ...(reason ? { unavailable_reason: reason } : {}),
  };
}

const TRADE_VIEW_SELECT = `
  SELECT t.id, t.buyer_id, t.seller_id, t.sku,
         COALESCE(ask.card_name, t.sku) AS card_name,
         ask.condition,
         t.price::text, t.quantity,
         t.commission_amount::text, t.seller_payout::text,
         t.escrow_status::text, t.escrow_tier,
         t.requires_photos, t.requires_inspection, t.seller_ships_to,
         t.dispute_window_hours, t.payout_hold_days,
         t.accepts_returns, t.return_window_days, t.payment_expires_at,
         (t.payment_expires_at IS NULL OR t.payment_expires_at > NOW()) AS payment_window_open,
         (profile.user_id IS NOT NULL) AS profile_configured,
         COALESCE(profile.enabled, false) AS profile_enabled,
         handoff.handoff_id,
         handoff.merchant_key_id AS handoff_merchant_key_id,
         handoff.terms_hash AS handoff_terms_hash,
         handoff.expected_purpose_note AS handoff_expected_purpose_note,
         handoff.canonical_json AS handoff_canonical_json,
         handoff.created_at AS handoff_created_at
    FROM market_trades t
    JOIN market_orders ask ON ask.id = t.ask_order_id
    LEFT JOIN cashloom_settlement_profiles profile ON profile.user_id = t.seller_id
    LEFT JOIN market_trade_cashloom_handoffs handoff ON handoff.trade_id = t.id
   WHERE t.id = $1`;

export async function getCashloomTradeHandoffView(
  tradeId: string,
  viewerId: string,
): Promise<{ ok: true; value: CashloomTradeHandoffView } | CashloomTradeAccessFailure> {
  const result = await query(TRADE_VIEW_SELECT, [tradeId]);
  if (!result.rows[0]) return { ok: false, reason: "not_found" };
  const row = result.rows[0] as TradeViewRow;
  if (row.buyer_id !== viewerId && row.seller_id !== viewerId) {
    return { ok: false, reason: "forbidden" };
  }
  return { ok: true, value: viewFromRow(row, viewerId) };
}

const PREPARE_TRADE_SELECT = `
  SELECT t.id, t.buyer_id, t.seller_id, t.sku,
         COALESCE(ask.card_name, t.sku) AS card_name,
         ask.condition,
         t.price::text, t.quantity,
         t.commission_amount::text, t.seller_payout::text,
         t.escrow_status::text, t.escrow_tier,
         t.requires_photos, t.requires_inspection, t.seller_ships_to,
         t.dispute_window_hours, t.payout_hold_days,
         t.accepts_returns, t.return_window_days, t.payment_expires_at,
         (t.payment_expires_at IS NULL OR t.payment_expires_at > NOW()) AS payment_window_open
    FROM market_trades t
    JOIN market_orders ask ON ask.id = t.ask_order_id
   WHERE t.id = $1
   FOR SHARE OF t`;

export async function prepareCashloomTradeHandoff(
  tradeId: string,
  viewerId: string,
): Promise<
  | { ok: true; value: CashloomTradeHandoffView; reused: boolean }
  | CashloomPrepareFailure
> {
  return transaction(async (txQuery) => {
    const tradeResult = await txQuery(PREPARE_TRADE_SELECT, [tradeId]);
    if (!tradeResult.rows[0]) return { ok: false, reason: "not_found" } as const;
    const trade = tradeResult.rows[0] as CashloomTradeSnapshot & {
      payment_window_open: boolean;
    };
    if (trade.seller_id !== viewerId) return { ok: false, reason: "forbidden" } as const;
    if (trade.escrow_status !== "awaiting_payment") {
      return { ok: false, reason: "trade_not_awaiting_payment" } as const;
    }
    if (!trade.payment_window_open) {
      return { ok: false, reason: "payment_window_expired" } as const;
    }

    const existing = await txQuery(
      `SELECT handoff_id, merchant_key_id, terms_hash, expected_purpose_note,
              canonical_json, created_at
         FROM market_trade_cashloom_handoffs
        WHERE trade_id = $1`,
      [tradeId],
    );
    if (existing.rows[0]) {
      const handoff = decodeHandoff(existing.rows[0] as HandoffRow);
      return {
        ok: true,
        value: {
          handoff,
          role: "seller",
          can_prepare: false,
          unavailable_reason: "handoff_already_prepared",
        },
        reused: true,
      } as const;
    }

    const profileResult = await txQuery(
      `SELECT merchant_key_id, enabled
         FROM cashloom_settlement_profiles
        WHERE user_id = $1
        FOR SHARE`,
      [viewerId],
    );
    if (!profileResult.rows[0]) {
      return { ok: false, reason: "cashloom_profile_required" } as const;
    }
    if (profileResult.rows[0].enabled !== true) {
      return { ok: false, reason: "cashloom_profile_disabled" } as const;
    }

    const createdAt = new Date().toISOString();
    const built = buildCashloomHandoffWithSystemEntropy(
      trade,
      profileResult.rows[0].merchant_key_id as string,
    );
    const inserted = await txQuery(
      `INSERT INTO market_trade_cashloom_handoffs
         (trade_id, handoff_id, merchant_key_id, terms_hash,
          expected_purpose_note, canonical_json, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (trade_id) DO NOTHING
       RETURNING trade_id`,
      [
        tradeId,
        built.handoff_id,
        built.packet.merchant_key_id,
        built.terms_hash,
        built.expected_purpose_note,
        built.canonical_json,
        createdAt,
      ],
    );

    // A concurrent seller request may have won the unique trade_id insert.
    // Always read and return the stored winner instead of the losing packet.
    const winner = await txQuery(
      `SELECT handoff_id, merchant_key_id, terms_hash, expected_purpose_note,
              canonical_json, created_at
         FROM market_trade_cashloom_handoffs
        WHERE trade_id = $1`,
      [tradeId],
    );
    if (!winner.rows[0]) throw new Error("CashLoom handoff insert did not produce a stored winner.");
    const handoff = decodeHandoff(winner.rows[0] as HandoffRow);
    return {
      ok: true,
      value: {
        handoff,
        role: "seller",
        can_prepare: false,
        unavailable_reason: "handoff_already_prepared",
      },
      reused: inserted.rowCount === 0,
    } as const;
  });
}

export function isCashloomSettlementMigrationMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "42P01";
}
