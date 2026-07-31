import { createHash, createHmac, randomBytes } from "node:crypto";
import {
  CASHLOOM_HANDOFF_MODE,
  CASHLOOM_IDENTITY_ASSURANCE,
  CASHLOOM_MERCHANT_KEY_ID_PATTERN,
} from "./contract";

export interface CashloomTradeSnapshot {
  id: string;
  buyer_id: string;
  seller_id: string;
  sku: string;
  card_name: string | null;
  condition: string;
  price: string;
  quantity: number;
  commission_amount: string;
  seller_payout: string;
  escrow_status: string;
  escrow_tier: string | null;
  requires_photos: boolean;
  requires_inspection: boolean;
  seller_ships_to: string | null;
  dispute_window_hours: number | null;
  payout_hold_days: number | null;
  accepts_returns: boolean;
  return_window_days: number | null;
  payment_expires_at: string | Date | null;
}

export interface CashloomHandoffEffects {
  moves_money: false;
  changes_trade_state: false;
}

export interface CashloomHandoffNonclaims {
  is_cashloom_payment_request: false;
  is_cashloom_acceptance: false;
  is_signed: false;
  verifies_key_ownership: false;
  proves_payment: false;
  funds_or_provides_escrow: false;
  records_payout: false;
  confirms_counterparty_acceptance: false;
}

export interface CashloomHandoffTerms {
  asset_id: "fiat:iso4217/GBP";
  currency: "GBP";
  economics: {
    unit_price_pence: string;
    quantity: number;
    gross_amount_pence: string;
    commission_amount_pence: string;
    seller_payout_pence: string;
  };
  item: {
    sku: string;
    card_name: string | null;
    condition: string;
  };
  escrow: {
    tier: string | null;
    requires_photos: boolean;
    requires_inspection: boolean;
    dispute_window_hours: number | null;
    payout_hold_days: number | null;
  };
  logistics: {
    seller_ships_to: string | null;
    accepts_returns: boolean;
    return_window_days: number | null;
    shipping_address_included: false;
  };
  payment_window_expires_at: string | null;
}

export interface CashloomHandoffPacket {
  schema: "cambridgetcg.cashloom-handoff/v1";
  handoff_mode: typeof CASHLOOM_HANDOFF_MODE;
  merchant_key_id: string;
  identity_assurance: typeof CASHLOOM_IDENTITY_ASSURANCE;
  binding: {
    nonce_hex: string;
    participant_references: {
      buyer: string;
      seller: string;
    };
    terms_hash: string;
    expected_purpose_note: string;
  };
  terms: CashloomHandoffTerms;
  effects: CashloomHandoffEffects;
  nonclaims: CashloomHandoffNonclaims;
}

export interface BuiltCashloomHandoff {
  packet: CashloomHandoffPacket;
  canonical_json: string;
  handoff_id: string;
  terms_hash: string;
  expected_purpose_note: string;
}

export interface CashloomHandoffDto extends BuiltCashloomHandoff {
  created_at: string;
  effects: CashloomHandoffEffects;
  nonclaims: CashloomHandoffNonclaims;
}

export interface CashloomTradeHandoffView {
  handoff: CashloomHandoffDto | null;
  role: "buyer" | "seller";
  can_prepare: boolean;
  unavailable_reason?: CashloomHandoffUnavailableReason;
}

export type CashloomHandoffUnavailableReason =
  | "seller_only"
  | "handoff_already_prepared"
  | "trade_not_awaiting_payment"
  | "payment_window_expired"
  | "cashloom_profile_required"
  | "cashloom_profile_disabled";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireExactObject(
  value: unknown,
  keys: readonly string[],
  field: string,
): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${field} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${field} must use the closed CashLoom handoff schema.`);
  }
  return value;
}

function isBoundedString(value: unknown, maxLength: number, allowEmpty = false): value is string {
  return typeof value === "string"
    && value.length <= maxLength
    && (allowEmpty || value.length > 0);
}

function isOptionalNonNegativeInteger(value: unknown): value is number | null {
  return value === null || (Number.isSafeInteger(value) && (value as number) >= 0);
}

function isPenceString(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value);
}

function isCanonicalIsoTimestamp(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

/**
 * Close and validate every nested field before stored packet bytes cross the
 * DAL boundary. A matching content hash proves byte integrity, not that the
 * bytes obey this non-executing/privacy-preserving schema.
 */
export function parseCashloomHandoffPacket(value: unknown): CashloomHandoffPacket {
  const packet = requireExactObject(value, [
    "schema",
    "handoff_mode",
    "merchant_key_id",
    "identity_assurance",
    "binding",
    "terms",
    "effects",
    "nonclaims",
  ], "packet");
  const binding = requireExactObject(packet.binding, [
    "nonce_hex",
    "participant_references",
    "terms_hash",
    "expected_purpose_note",
  ], "packet.binding");
  const references = requireExactObject(
    binding.participant_references,
    ["buyer", "seller"],
    "packet.binding.participant_references",
  );
  const terms = requireExactObject(packet.terms, [
    "asset_id",
    "currency",
    "economics",
    "item",
    "escrow",
    "logistics",
    "payment_window_expires_at",
  ], "packet.terms");
  const economics = requireExactObject(terms.economics, [
    "unit_price_pence",
    "quantity",
    "gross_amount_pence",
    "commission_amount_pence",
    "seller_payout_pence",
  ], "packet.terms.economics");
  const item = requireExactObject(
    terms.item,
    ["sku", "card_name", "condition"],
    "packet.terms.item",
  );
  const escrow = requireExactObject(terms.escrow, [
    "tier",
    "requires_photos",
    "requires_inspection",
    "dispute_window_hours",
    "payout_hold_days",
  ], "packet.terms.escrow");
  const logistics = requireExactObject(terms.logistics, [
    "seller_ships_to",
    "accepts_returns",
    "return_window_days",
    "shipping_address_included",
  ], "packet.terms.logistics");
  const effects = requireExactObject(
    packet.effects,
    ["moves_money", "changes_trade_state"],
    "packet.effects",
  );
  const nonclaims = requireExactObject(packet.nonclaims, [
    "is_cashloom_payment_request",
    "is_cashloom_acceptance",
    "is_signed",
    "verifies_key_ownership",
    "proves_payment",
    "funds_or_provides_escrow",
    "records_payout",
    "confirms_counterparty_acceptance",
  ], "packet.nonclaims");

  if (
    packet.schema !== "cambridgetcg.cashloom-handoff/v1"
    || packet.handoff_mode !== CASHLOOM_HANDOFF_MODE
    || packet.identity_assurance !== CASHLOOM_IDENTITY_ASSURANCE
    || typeof packet.merchant_key_id !== "string"
    || !CASHLOOM_MERCHANT_KEY_ID_PATTERN.test(packet.merchant_key_id)
    || typeof binding.nonce_hex !== "string"
    || !/^[0-9a-f]{32}$/.test(binding.nonce_hex)
    || typeof references.buyer !== "string"
    || !CASHLOOM_MERCHANT_KEY_ID_PATTERN.test(references.buyer)
    || typeof references.seller !== "string"
    || !CASHLOOM_MERCHANT_KEY_ID_PATTERN.test(references.seller)
    || typeof binding.terms_hash !== "string"
    || !CASHLOOM_MERCHANT_KEY_ID_PATTERN.test(binding.terms_hash)
    || typeof binding.expected_purpose_note !== "string"
    || !/^ctcg:v1:[0-9a-f]{64}$/.test(binding.expected_purpose_note)
  ) {
    throw new Error("packet binding or identity fields are invalid.");
  }
  if (
    terms.asset_id !== "fiat:iso4217/GBP"
    || terms.currency !== "GBP"
    || !isCanonicalIsoTimestamp(terms.payment_window_expires_at)
  ) {
    throw new Error("packet terms must name canonical GBP terms and expiry.");
  }
  if (
    !isPenceString(economics.unit_price_pence)
    || !Number.isSafeInteger(economics.quantity)
    || (economics.quantity as number) <= 0
    || !isPenceString(economics.gross_amount_pence)
    || !isPenceString(economics.commission_amount_pence)
    || !isPenceString(economics.seller_payout_pence)
    || BigInt(economics.gross_amount_pence) !== BigInt(economics.unit_price_pence)
      * BigInt(economics.quantity as number)
    || BigInt(economics.gross_amount_pence) !== BigInt(economics.commission_amount_pence)
      + BigInt(economics.seller_payout_pence)
  ) {
    throw new Error("packet economics must balance exactly in integer pence.");
  }
  if (
    !isBoundedString(item.sku, 60)
    || !(item.card_name === null || isBoundedString(item.card_name, 300, true))
    || !isBoundedString(item.condition, 10)
  ) {
    throw new Error("packet item fields are invalid.");
  }
  if (
    !(escrow.tier === null || isBoundedString(escrow.tier, 20))
    || typeof escrow.requires_photos !== "boolean"
    || typeof escrow.requires_inspection !== "boolean"
    || !isOptionalNonNegativeInteger(escrow.dispute_window_hours)
    || !isOptionalNonNegativeInteger(escrow.payout_hold_days)
  ) {
    throw new Error("packet fulfilment-tier fields are invalid.");
  }
  if (
    !(logistics.seller_ships_to === null || isBoundedString(logistics.seller_ships_to, 10))
    || typeof logistics.accepts_returns !== "boolean"
    || !isOptionalNonNegativeInteger(logistics.return_window_days)
    || logistics.shipping_address_included !== false
  ) {
    throw new Error("packet logistics fields are invalid or expose a shipping address.");
  }
  if (
    effects.moves_money !== false
    || effects.changes_trade_state !== false
    || Object.values(nonclaims).some((claim) => claim !== false)
  ) {
    throw new Error("packet effects or nonclaims contradict the non-executing boundary.");
  }

  return value as CashloomHandoffPacket;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error("Canonical JSON accepts only safe integers; encode exact amounts as strings.");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (typeof value !== "object" || value === undefined) {
    throw new Error("Canonical JSON accepts only JSON values.");
  }
  const entries = Object.entries(value).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}

export function numericGbpToPence(value: string, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be read from NUMERIC as a string.`);
  }
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(value);
  if (!match) {
    throw new Error(`${field} must be a non-negative decimal with at most two fractional digits.`);
  }
  const fractional = (match[2] ?? "").padEnd(2, "0");
  return (BigInt(match[1]) * BigInt(100) + BigInt(fractional || "0")).toString();
}

export function sha256Id(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function requireRandomBytes(bytes: Uint8Array, length: number, field: string): Buffer {
  if (bytes.byteLength !== length) {
    throw new Error(`${field} must contain exactly ${length} random bytes.`);
  }
  return Buffer.from(bytes);
}

function exactOptionalInteger(value: number | null, field: string): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer or null.`);
  }
  return value;
}

function isoOrNull(value: string | Date | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("payment_expires_at must be a valid timestamp.");
  return date.toISOString();
}

export function buildCashloomHandoff(
  trade: CashloomTradeSnapshot,
  merchantKeyId: string,
  entropy: { bindingNonce: Uint8Array; referenceSalt: Uint8Array },
): BuiltCashloomHandoff {
  if (!CASHLOOM_MERCHANT_KEY_ID_PATTERN.test(merchantKeyId)) {
    throw new Error("merchantKeyId must be lowercase sha256:<64 hex>.");
  }
  if (!Number.isSafeInteger(trade.quantity) || trade.quantity <= 0) {
    throw new Error("quantity must be a positive safe integer.");
  }
  const bindingNonce = requireRandomBytes(entropy.bindingNonce, 16, "bindingNonce");
  const referenceSalt = requireRandomBytes(entropy.referenceSalt, 32, "referenceSalt");

  const unitPricePence = numericGbpToPence(trade.price, "price");
  const grossPence = (BigInt(unitPricePence) * BigInt(trade.quantity)).toString();
  const commissionPence = numericGbpToPence(trade.commission_amount, "commission_amount");
  const sellerPayoutPence = numericGbpToPence(trade.seller_payout, "seller_payout");
  if (BigInt(grossPence) !== BigInt(commissionPence) + BigInt(sellerPayoutPence)) {
    throw new Error("Stored GBP economics do not balance exactly in integer pence.");
  }
  const terms: CashloomHandoffTerms = {
    asset_id: "fiat:iso4217/GBP",
    currency: "GBP",
    economics: {
      unit_price_pence: unitPricePence,
      quantity: trade.quantity,
      gross_amount_pence: grossPence,
      commission_amount_pence: commissionPence,
      seller_payout_pence: sellerPayoutPence,
    },
    item: {
      sku: trade.sku,
      card_name: trade.card_name,
      condition: trade.condition,
    },
    escrow: {
      tier: trade.escrow_tier,
      requires_photos: trade.requires_photos,
      requires_inspection: trade.requires_inspection,
      dispute_window_hours: exactOptionalInteger(
        trade.dispute_window_hours,
        "dispute_window_hours",
      ),
      payout_hold_days: exactOptionalInteger(trade.payout_hold_days, "payout_hold_days"),
    },
    logistics: {
      seller_ships_to: trade.seller_ships_to,
      accepts_returns: trade.accepts_returns,
      return_window_days: exactOptionalInteger(trade.return_window_days, "return_window_days"),
      shipping_address_included: false,
    },
    payment_window_expires_at: isoOrNull(trade.payment_expires_at),
  };

  const nonceHex = bindingNonce.toString("hex");
  const participantReferences = {
    buyer: `sha256:${createHmac("sha256", referenceSalt)
      .update(`cambridgetcg.cashloom/buyer/${trade.buyer_id}`, "utf8")
      .digest("hex")}`,
    seller: `sha256:${createHmac("sha256", referenceSalt)
      .update(`cambridgetcg.cashloom/seller/${trade.seller_id}`, "utf8")
      .digest("hex")}`,
  };
  // The nonce makes the terms fingerprint opaque and unique per prepared
  // handoff even when two trades happen to share identical public terms.
  const termsHash = sha256Id(canonicalJson({ nonce_hex: nonceHex, terms }));
  const purposeBinding = {
    merchant_key_id: merchantKeyId,
    participant_references: participantReferences,
    terms_hash: termsHash,
  };
  const expectedPurposeNote = `ctcg:v1:${sha256Id(canonicalJson(purposeBinding)).slice(7)}`;

  const effects: CashloomHandoffEffects = {
    moves_money: false,
    changes_trade_state: false,
  };
  const nonclaims: CashloomHandoffNonclaims = {
    is_cashloom_payment_request: false,
    is_cashloom_acceptance: false,
    is_signed: false,
    verifies_key_ownership: false,
    proves_payment: false,
    funds_or_provides_escrow: false,
    records_payout: false,
    confirms_counterparty_acceptance: false,
  };
  const packet: CashloomHandoffPacket = {
    schema: "cambridgetcg.cashloom-handoff/v1",
    handoff_mode: CASHLOOM_HANDOFF_MODE,
    merchant_key_id: merchantKeyId,
    identity_assurance: CASHLOOM_IDENTITY_ASSURANCE,
    binding: {
      nonce_hex: nonceHex,
      participant_references: participantReferences,
      terms_hash: termsHash,
      expected_purpose_note: expectedPurposeNote,
    },
    terms,
    effects,
    nonclaims,
  };
  const canonical = canonicalJson(parseCashloomHandoffPacket(packet));
  return {
    packet,
    canonical_json: canonical,
    handoff_id: sha256Id(canonical),
    terms_hash: termsHash,
    expected_purpose_note: expectedPurposeNote,
  };
}

export function buildCashloomHandoffWithSystemEntropy(
  trade: CashloomTradeSnapshot,
  merchantKeyId: string,
): BuiltCashloomHandoff {
  return buildCashloomHandoff(trade, merchantKeyId, {
    bindingNonce: randomBytes(16),
    referenceSalt: randomBytes(32),
  });
}
