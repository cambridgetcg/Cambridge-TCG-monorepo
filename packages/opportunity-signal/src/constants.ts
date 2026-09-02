export const OPPORTUNITY_SIGNAL_INPUT_SCHEMA =
  "cambridgetcg.opportunity-signal-input/1" as const;

export const OPPORTUNITY_SIGNAL_EVIDENCE_SCHEMA =
  "cambridgetcg.opportunity-signal-evidence/1" as const;

export const OPPORTUNITY_SIGNAL_PROVIDER_RESULT_SCHEMA =
  "cambridgetcg.opportunity-signal-provider-result/1" as const;

export const OPPORTUNITY_SIGNAL_SCHEMA =
  "cambridgetcg.opportunity-signal/1" as const;

export const OPPORTUNITY_SIGNAL_CURRENCY = "GBP" as const;

export const OPPORTUNITY_SIGNAL_OPERATION =
  "subscriber_derived_signal" as const;

export const OPPORTUNITY_SIGNAL_CLAIM_SCOPE =
  "decision_support_estimate" as const;

export const OPPORTUNITY_SIGNAL_MAX_MINOR_UNITS = 100_000_000_000 as const;

export const OPPORTUNITY_SIGNAL_MAX_LIFETIME_MS = 60_000 as const;

export const OPPORTUNITY_SIGNAL_CONDITIONS = [
  "mint",
  "near_mint",
  "excellent",
  "good",
  "light_played",
  "played",
  "poor",
] as const;

export const OPPORTUNITY_SIGNAL_FINISHES = ["normal", "foil"] as const;

export const OPPORTUNITY_SIGNAL_VALUATION_BASES = [
  "aggregate_reference",
  "completed_sales",
  "mixed",
] as const;

export const OPPORTUNITY_SIGNAL_CONFIDENCE_BANDS = [
  "low",
  "medium",
  "high",
] as const;

export const OPPORTUNITY_SIGNAL_LIQUIDITY_BANDS = [
  "unknown",
  "low",
  "medium",
  "high",
] as const;

export const OPPORTUNITY_SIGNAL_COST_KEYS = [
  "buyer_fee",
  "inbound_shipping",
  "acquisition_tax_and_duty",
  "seller_fee",
  "payment_processing",
  "outbound_shipping",
  "disposal_tax_and_duty",
] as const;

export const OPPORTUNITY_SIGNAL_NOT_APPLICABLE_REASONS = [
  "included_elsewhere",
  "not_charged",
  "not_due",
] as const;

export const OPPORTUNITY_SIGNAL_FX_NOT_REQUIRED_REASON =
  "all_inputs_native_gbp" as const;

export const OPPORTUNITY_SIGNAL_EVIDENCE_FLAGS = [
  "aggregate_not_trade_tape",
  "short_history",
  "sparse_history",
  "interpolated_input",
] as const;

/** Canonical public ordering. Never sort these values alphabetically. */
export const OPPORTUNITY_SIGNAL_REASON_CODES = [
  "invalid_input",
  "rights_not_eligible",
  "candidate_expired",
  "valuation_expired",
  "cost_quote_expired",
  "unknown_cost",
  "fx_missing",
  "fx_expired",
  "asset_mismatch",
  "insufficient_evidence",
  "numeric_overflow",
  "private_policy_threshold_not_met",
  "private_policy_threshold_met",
] as const;

/** Canonical public ordering. Never sort these values alphabetically. */
export const OPPORTUNITY_SIGNAL_RISK_CODES = [
  "aggregate_not_trade_tape",
  "short_history",
  "sparse_history",
  "interpolated_input",
  "estimated_costs",
  "estimated_fx",
  "liquidity_unknown",
  "liquidity_low",
  "availability_not_reserved",
  "condition_unverified",
  "authenticity_unverified",
] as const;

export const OPPORTUNITY_SIGNAL_INHERENT_UNAVAILABLE_RISKS = [
  "availability_not_reserved",
  "condition_unverified",
  "authenticity_unverified",
] as const;

export const OPPORTUNITY_SIGNAL_CLASSIFICATIONS = [
  "potential_deal",
  "not_qualified",
  "unavailable",
] as const;

export const OPPORTUNITY_SIGNAL_SPREAD_BANDS = [
  "positive_under_500_minor",
  "500_to_1499_minor",
  "1500_to_4999_minor",
  "5000_plus_minor",
] as const;

export const OPPORTUNITY_SIGNAL_MARGIN_BANDS = [
  "positive_under_1000_bps",
  "1000_to_2499_bps",
  "2500_to_4999_bps",
  "5000_plus_bps",
] as const;

export const OPPORTUNITY_SIGNAL_DOES_NOT_INCLUDE = [
  "executable_exit_quote",
  "listing_reservation",
  "profit_guarantee",
  "authenticity_or_condition_verification",
  "financial_or_tax_advice",
  "source_rows_or_model_parameters",
] as const;

export const OPPORTUNITY_SIGNAL_LIMITS = {
  candidate_ref_chars: 128,
  sku_chars: 128,
  reason_codes: OPPORTUNITY_SIGNAL_REASON_CODES.length,
  risk_codes: OPPORTUNITY_SIGNAL_RISK_CODES.length,
} as const;

// TypeScript's readonly tuples are mutable to untyped JavaScript at runtime.
// Freeze every vocabulary so a consumer cannot alter parser semantics.
Object.freeze(OPPORTUNITY_SIGNAL_CONDITIONS);
Object.freeze(OPPORTUNITY_SIGNAL_FINISHES);
Object.freeze(OPPORTUNITY_SIGNAL_VALUATION_BASES);
Object.freeze(OPPORTUNITY_SIGNAL_CONFIDENCE_BANDS);
Object.freeze(OPPORTUNITY_SIGNAL_LIQUIDITY_BANDS);
Object.freeze(OPPORTUNITY_SIGNAL_COST_KEYS);
Object.freeze(OPPORTUNITY_SIGNAL_NOT_APPLICABLE_REASONS);
Object.freeze(OPPORTUNITY_SIGNAL_EVIDENCE_FLAGS);
Object.freeze(OPPORTUNITY_SIGNAL_REASON_CODES);
Object.freeze(OPPORTUNITY_SIGNAL_RISK_CODES);
Object.freeze(OPPORTUNITY_SIGNAL_INHERENT_UNAVAILABLE_RISKS);
Object.freeze(OPPORTUNITY_SIGNAL_CLASSIFICATIONS);
Object.freeze(OPPORTUNITY_SIGNAL_SPREAD_BANDS);
Object.freeze(OPPORTUNITY_SIGNAL_MARGIN_BANDS);
Object.freeze(OPPORTUNITY_SIGNAL_DOES_NOT_INCLUDE);
Object.freeze(OPPORTUNITY_SIGNAL_LIMITS);
