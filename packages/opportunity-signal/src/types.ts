import type {
  OPPORTUNITY_SIGNAL_CLAIM_SCOPE,
  OPPORTUNITY_SIGNAL_CLASSIFICATIONS,
  OPPORTUNITY_SIGNAL_CONDITIONS,
  OPPORTUNITY_SIGNAL_CONFIDENCE_BANDS,
  OPPORTUNITY_SIGNAL_COST_KEYS,
  OPPORTUNITY_SIGNAL_CURRENCY,
  OPPORTUNITY_SIGNAL_DOES_NOT_INCLUDE,
  OPPORTUNITY_SIGNAL_EVIDENCE_SCHEMA,
  OPPORTUNITY_SIGNAL_EVIDENCE_FLAGS,
  OPPORTUNITY_SIGNAL_FINISHES,
  OPPORTUNITY_SIGNAL_INPUT_SCHEMA,
  OPPORTUNITY_SIGNAL_LIQUIDITY_BANDS,
  OPPORTUNITY_SIGNAL_MARGIN_BANDS,
  OPPORTUNITY_SIGNAL_NOT_APPLICABLE_REASONS,
  OPPORTUNITY_SIGNAL_OPERATION,
  OPPORTUNITY_SIGNAL_PROVIDER_RESULT_SCHEMA,
  OPPORTUNITY_SIGNAL_REASON_CODES,
  OPPORTUNITY_SIGNAL_RISK_CODES,
  OPPORTUNITY_SIGNAL_SCHEMA,
  OPPORTUNITY_SIGNAL_SPREAD_BANDS,
  OPPORTUNITY_SIGNAL_VALUATION_BASES,
} from "./constants";

export type OpportunitySignalCondition =
  (typeof OPPORTUNITY_SIGNAL_CONDITIONS)[number];
export type OpportunitySignalFinish =
  (typeof OPPORTUNITY_SIGNAL_FINISHES)[number];
export type OpportunitySignalValuationBasis =
  (typeof OPPORTUNITY_SIGNAL_VALUATION_BASES)[number];
export type OpportunitySignalConfidence =
  (typeof OPPORTUNITY_SIGNAL_CONFIDENCE_BANDS)[number];
export type OpportunitySignalLiquidityBand =
  (typeof OPPORTUNITY_SIGNAL_LIQUIDITY_BANDS)[number];
export type OpportunitySignalCostKey =
  (typeof OPPORTUNITY_SIGNAL_COST_KEYS)[number];
export type OpportunitySignalEvidenceFlag =
  (typeof OPPORTUNITY_SIGNAL_EVIDENCE_FLAGS)[number];
export type OpportunitySignalReasonCode =
  (typeof OPPORTUNITY_SIGNAL_REASON_CODES)[number];
export type OpportunitySignalRiskCode =
  (typeof OPPORTUNITY_SIGNAL_RISK_CODES)[number];
export type OpportunitySignalClassification =
  (typeof OPPORTUNITY_SIGNAL_CLASSIFICATIONS)[number];
export type OpportunitySignalNotApplicableReason =
  (typeof OPPORTUNITY_SIGNAL_NOT_APPLICABLE_REASONS)[number];
export type OpportunitySignalSpreadBand =
  (typeof OPPORTUNITY_SIGNAL_SPREAD_BANDS)[number];
export type OpportunitySignalMarginBand =
  (typeof OPPORTUNITY_SIGNAL_MARGIN_BANDS)[number];

/** A canonical UTC timestamp with exactly millisecond precision. */
export type OpportunitySignalTimestamp = string;

/** A lowercase SHA-256 digest prefixed with `sha256:`. */
export type OpportunitySignalSha256Digest = `sha256:${string}`;
export type OpportunitySignalPolicyDigest = OpportunitySignalSha256Digest;

/**
 * A non-negative, safe integer range. For input money it always denotes
 * already-normalized GBP minor units. The unit of each output range is named
 * by its containing field.
 */
export interface OpportunitySignalIntegerRange {
  readonly low: number;
  readonly midpoint: number;
  readonly high: number;
}

export interface OpportunitySignalAssetV1 {
  readonly sku: string;
  readonly condition: OpportunitySignalCondition;
  readonly finish: OpportunitySignalFinish;
}

export interface OpportunitySignalTimedEvidenceV1 {
  readonly source_stated_at: OpportunitySignalTimestamp;
  readonly retrieved_at: OpportunitySignalTimestamp;
  readonly expires_at: OpportunitySignalTimestamp;
}

export interface OpportunitySignalCandidateV1 {
  /** Cambridge-generated opaque reference: never a URL or seller identity. */
  readonly candidate_ref: string;
  readonly asset: OpportunitySignalAssetV1;
  readonly quantity: 1;
  /** Already-normalized GBP minor units. */
  readonly asking_price_minor: number;
  readonly observed_at: OpportunitySignalTimestamp;
  readonly retrieved_at: OpportunitySignalTimestamp;
  readonly expires_at: OpportunitySignalTimestamp;
}

export type OpportunitySignalLiquidityV1 =
  | { readonly band: "unknown" }
  | {
      readonly band: Exclude<OpportunitySignalLiquidityBand, "unknown">;
      readonly evidence: OpportunitySignalTimedEvidenceV1;
    };

export interface OpportunitySignalValuationV1 {
  readonly asset: OpportunitySignalAssetV1;
  /** Already-normalized GBP minor units. */
  readonly estimated_gross_exit_minor: OpportunitySignalIntegerRange;
  readonly evidence: OpportunitySignalTimedEvidenceV1;
  readonly basis: OpportunitySignalValuationBasis;
  /** Evidence quality only; never a probability of profit. */
  readonly confidence: OpportunitySignalConfidence;
  readonly evidence_flags: readonly OpportunitySignalEvidenceFlag[];
  readonly liquidity: OpportunitySignalLiquidityV1;
}

export type OpportunitySignalCostStateV1 =
  | { readonly state: "unknown" }
  | {
      readonly state: "not_applicable";
      readonly reason: OpportunitySignalNotApplicableReason;
    }
  | {
      readonly state: "known" | "estimated";
      /** Already-normalized GBP minor units. */
      readonly amount_minor: OpportunitySignalIntegerRange;
      readonly evidence: OpportunitySignalTimedEvidenceV1;
    };

export type OpportunitySignalCostsV1 = Readonly<
  Record<OpportunitySignalCostKey, OpportunitySignalCostStateV1>
>;

export type OpportunitySignalCurrencyNormalizationV1 =
  | {
      readonly currency: typeof OPPORTUNITY_SIGNAL_CURRENCY;
      readonly state: "not_required";
      readonly reason: "all_inputs_native_gbp";
    }
  | {
      readonly currency: typeof OPPORTUNITY_SIGNAL_CURRENCY;
      readonly state: "quoted" | "estimated" | "unknown";
      readonly evidence: OpportunitySignalTimedEvidenceV1;
    };

export interface OpportunitySignalReleaseEligibilityV1 {
  readonly operation: typeof OPPORTUNITY_SIGNAL_OPERATION;
  readonly eligible: boolean;
  readonly evaluated_at: OpportunitySignalTimestamp;
  readonly expires_at: OpportunitySignalTimestamp;
  readonly policy_digest: OpportunitySignalPolicyDigest;
  /** Binds the rights decision to the exact evidence bundle it evaluated. */
  readonly evidence_bundle_digest: OpportunitySignalSha256Digest;
}

/**
 * Bootstrap-safe evidence document. `evaluated_at` validates nested evidence
 * timing but is not itself part of the evidence-bundle digest payload.
 */
export interface OpportunitySignalEvidenceEnvelopeV1 {
  readonly schema: typeof OPPORTUNITY_SIGNAL_EVIDENCE_SCHEMA;
  readonly evaluated_at: OpportunitySignalTimestamp;
  readonly candidate: OpportunitySignalCandidateV1;
  readonly valuation: OpportunitySignalValuationV1;
  readonly costs: OpportunitySignalCostsV1;
  readonly currency_normalization: OpportunitySignalCurrencyNormalizationV1;
}

export interface OpportunitySignalInputV1 {
  readonly schema: typeof OPPORTUNITY_SIGNAL_INPUT_SCHEMA;
  /** Injected by the caller. This package never reads a clock. */
  readonly evaluated_at: OpportunitySignalTimestamp;
  readonly candidate: OpportunitySignalCandidateV1;
  readonly valuation: OpportunitySignalValuationV1;
  readonly costs: OpportunitySignalCostsV1;
  readonly currency_normalization: OpportunitySignalCurrencyNormalizationV1;
  readonly release_eligibility: OpportunitySignalReleaseEligibilityV1;
}

export interface OpportunitySignalEstimateV1 {
  readonly currency: typeof OPPORTUNITY_SIGNAL_CURRENCY;
  readonly conservative_net_transaction_spread_band: OpportunitySignalSpreadBand;
  readonly conservative_margin_band: OpportunitySignalMarginBand;
}

export interface OpportunitySignalProviderContextV1 {
  readonly request_digest: OpportunitySignalSha256Digest;
}

/**
 * The only value a private engine may return across the public seam. It does
 * not contain scores, features, weights, source rows, fair values, or debug
 * fields. The echo fields bind an asynchronous result to one exact request.
 */
export interface OpportunitySignalProviderResultV1 {
  readonly schema: typeof OPPORTUNITY_SIGNAL_PROVIDER_RESULT_SCHEMA;
  readonly candidate_ref: string;
  readonly evaluated_at: OpportunitySignalTimestamp;
  readonly request_digest: OpportunitySignalSha256Digest;
  readonly expires_at: OpportunitySignalTimestamp;
  readonly classification: OpportunitySignalClassification;
  readonly reason_codes: readonly OpportunitySignalReasonCode[];
}

export interface OpportunitySignalProviderV1 {
  evaluate(
    input: OpportunitySignalInputV1,
    context: OpportunitySignalProviderContextV1,
  ): Promise<unknown>;
}

/** The single Web Crypto capability required by this package. */
export interface OpportunitySignalSha256DigestProvider {
  digest(algorithm: "SHA-256", data: ArrayBuffer): Promise<ArrayBuffer>;
}

export interface OpportunitySignalV1 {
  readonly schema: typeof OPPORTUNITY_SIGNAL_SCHEMA;
  readonly candidate_ref: string | null;
  readonly sku: string | null;
  readonly classification: OpportunitySignalClassification;
  readonly evaluated_at: OpportunitySignalTimestamp;
  readonly expires_at: OpportunitySignalTimestamp | null;
  readonly valuation_as_of: OpportunitySignalTimestamp | null;
  readonly estimate: OpportunitySignalEstimateV1 | null;
  readonly confidence: OpportunitySignalConfidence | null;
  readonly liquidity: OpportunitySignalLiquidityBand | null;
  readonly reason_codes: readonly OpportunitySignalReasonCode[];
  readonly risk_codes: readonly OpportunitySignalRiskCode[];
  readonly claim_scope: typeof OPPORTUNITY_SIGNAL_CLAIM_SCOPE;
  readonly does_not_include: typeof OPPORTUNITY_SIGNAL_DOES_NOT_INCLUDE;
}

export type OpportunitySignalPreflightV1 =
  | {
      readonly ok: true;
      readonly expires_at_ceiling: OpportunitySignalTimestamp;
      readonly risk_codes: readonly OpportunitySignalRiskCode[];
    }
  | {
      readonly ok: false;
      readonly reason_codes: readonly OpportunitySignalReasonCode[];
      readonly risk_codes: readonly OpportunitySignalRiskCode[];
    };
