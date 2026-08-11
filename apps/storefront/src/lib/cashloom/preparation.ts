import { canonicalJson, sha256Id } from "./canonical";

export const CASHLOOM_PAYMENT_PREPARATION_SCHEMA =
  "cambridgetcg.cashloom-payment-preparation/v1" as const;
export const CASHLOOM_PAYMENT_PREPARATION_AUTHORITY =
  "cambridge_database_session" as const;
export const CASHLOOM_PAYMENT_PREPARATION_ACTION = "record_preparation" as const;
export const CASHLOOM_PAYMENT_PREPARATION_STATE = "prepared" as const;
export const CASHLOOM_EXPECTED_TRADE_STATE = "awaiting_payment" as const;
export const CASHLOOM_EXPECTED_PREPARATION_STATE = "none" as const;
export const CASHLOOM_PAYMENT_PREPARATION_DISCLOSURE_NOTICE_VERSION =
  "cashloom-preparation-retention-v1" as const;

const SHA256_ID_PATTERN = /^sha256:[0-9a-f]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface CashloomPaymentPreparationWrite {
  action: typeof CASHLOOM_PAYMENT_PREPARATION_ACTION;
  handoff_id: string;
  terms_hash: string;
  expected_trade_state: typeof CASHLOOM_EXPECTED_TRADE_STATE;
  expected_preparation_state: typeof CASHLOOM_EXPECTED_PREPARATION_STATE;
  disclosure_notice_version: typeof CASHLOOM_PAYMENT_PREPARATION_DISCLOSURE_NOTICE_VERSION;
  idempotency_key: string;
}

export interface CashloomPaymentPreparationEffects {
  moves_money: false;
  selects_settlement_rail: false;
  changes_trade_state: false;
  unlocks_shipping: false;
  changes_payout: false;
}

export interface CashloomPaymentPreparationNonclaims {
  is_cashloom_v2_record: false;
  is_payment_or_acceptance: false;
  proves_cashloom_key_control: false;
  creates_escrow: false;
  observes_settlement: false;
}

export interface CashloomPaymentPreparationDto {
  schema: typeof CASHLOOM_PAYMENT_PREPARATION_SCHEMA;
  preparation_id: string;
  handoff_id: string;
  terms_hash: string;
  state: typeof CASHLOOM_PAYMENT_PREPARATION_STATE;
  actor_role: "buyer";
  authority: typeof CASHLOOM_PAYMENT_PREPARATION_AUTHORITY;
  disclosure_notice_version: typeof CASHLOOM_PAYMENT_PREPARATION_DISCLOSURE_NOTICE_VERSION;
  created_at: string;
  effects: CashloomPaymentPreparationEffects;
  nonclaims: CashloomPaymentPreparationNonclaims;
}

export type CashloomPreparationValidation<T> =
  | { ok: true; value: T }
  | { ok: false; field: string; message: string };

const WRITE_KEYS = [
  "action",
  "handoff_id",
  "terms_hash",
  "expected_trade_state",
  "expected_preparation_state",
  "disclosure_notice_version",
  "idempotency_key",
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseCashloomPaymentPreparationWrite(
  value: unknown,
): CashloomPreparationValidation<CashloomPaymentPreparationWrite> {
  if (!isObject(value)) {
    return { ok: false, field: "body", message: "Request body must be a JSON object." };
  }
  const actual = Object.keys(value).sort();
  const expected = [...WRITE_KEYS].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    return {
      ok: false,
      field: "body",
      message: `Request body must contain exactly: ${WRITE_KEYS.join(", ")}.`,
    };
  }
  if (value.action !== CASHLOOM_PAYMENT_PREPARATION_ACTION) {
    return {
      ok: false,
      field: "action",
      message: `action must be '${CASHLOOM_PAYMENT_PREPARATION_ACTION}'.`,
    };
  }
  for (const field of ["handoff_id", "terms_hash"] as const) {
    if (typeof value[field] !== "string" || !SHA256_ID_PATTERN.test(value[field])) {
      return { ok: false, field, message: `${field} must be lowercase sha256:<64 hex>.` };
    }
  }
  if (value.expected_trade_state !== CASHLOOM_EXPECTED_TRADE_STATE) {
    return {
      ok: false,
      field: "expected_trade_state",
      message: `expected_trade_state must be '${CASHLOOM_EXPECTED_TRADE_STATE}'.`,
    };
  }
  if (value.expected_preparation_state !== CASHLOOM_EXPECTED_PREPARATION_STATE) {
    return {
      ok: false,
      field: "expected_preparation_state",
      message: `expected_preparation_state must be '${CASHLOOM_EXPECTED_PREPARATION_STATE}'.`,
    };
  }
  if (
    value.disclosure_notice_version
    !== CASHLOOM_PAYMENT_PREPARATION_DISCLOSURE_NOTICE_VERSION
  ) {
    return {
      ok: false,
      field: "disclosure_notice_version",
      message: `disclosure_notice_version must be '${CASHLOOM_PAYMENT_PREPARATION_DISCLOSURE_NOTICE_VERSION}'.`,
    };
  }
  if (typeof value.idempotency_key !== "string" || !UUID_PATTERN.test(value.idempotency_key)) {
    return {
      ok: false,
      field: "idempotency_key",
      message: "idempotency_key must be a lowercase UUID v4.",
    };
  }
  return {
    ok: true,
    value: {
      action: CASHLOOM_PAYMENT_PREPARATION_ACTION,
      handoff_id: value.handoff_id as string,
      terms_hash: value.terms_hash as string,
      expected_trade_state: CASHLOOM_EXPECTED_TRADE_STATE,
      expected_preparation_state: CASHLOOM_EXPECTED_PREPARATION_STATE,
      disclosure_notice_version: CASHLOOM_PAYMENT_PREPARATION_DISCLOSURE_NOTICE_VERSION,
      idempotency_key: value.idempotency_key,
    },
  };
}

export interface CashloomPaymentPreparationDigests {
  preparation_id: string;
  request_hash: string;
  idempotency_key_hash: string;
}

export function cashloomPaymentPreparationRequestHash(
  tradeId: string,
  input: Omit<CashloomPaymentPreparationWrite, "idempotency_key">,
): string {
  return sha256Id(canonicalJson({
    schema: CASHLOOM_PAYMENT_PREPARATION_SCHEMA,
    action: input.action,
    trade_id: tradeId,
    handoff_id: input.handoff_id,
    terms_hash: input.terms_hash,
    expected_trade_state: input.expected_trade_state,
    expected_preparation_state: input.expected_preparation_state,
    disclosure_notice_version: input.disclosure_notice_version,
  }));
}

export function buildCashloomPaymentPreparationDigests(
  tradeId: string,
  actorId: string,
  input: CashloomPaymentPreparationWrite,
): CashloomPaymentPreparationDigests {
  const request_hash = cashloomPaymentPreparationRequestHash(tradeId, input);
  return {
    request_hash,
    idempotency_key_hash: cashloomPaymentPreparationIdempotencyHash(input.idempotency_key),
    preparation_id: cashloomPaymentPreparationId(actorId, request_hash),
  };
}

export function cashloomPaymentPreparationIdempotencyHash(key: string): string {
  return sha256Id(key);
}

export function cashloomPaymentPreparationId(actorId: string, requestHash: string): string {
  return sha256Id(canonicalJson({
    schema: CASHLOOM_PAYMENT_PREPARATION_SCHEMA,
    authority: CASHLOOM_PAYMENT_PREPARATION_AUTHORITY,
    actor_role: "buyer",
    prepared_by: actorId,
    request_hash: requestHash,
  }));
}

export const CASHLOOM_PAYMENT_PREPARATION_EFFECTS: CashloomPaymentPreparationEffects = {
  moves_money: false,
  selects_settlement_rail: false,
  changes_trade_state: false,
  unlocks_shipping: false,
  changes_payout: false,
};

export const CASHLOOM_PAYMENT_PREPARATION_NONCLAIMS: CashloomPaymentPreparationNonclaims = {
  is_cashloom_v2_record: false,
  is_payment_or_acceptance: false,
  proves_cashloom_key_control: false,
  creates_escrow: false,
  observes_settlement: false,
};
