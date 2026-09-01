import {
  OPPORTUNITY_SIGNAL_MAX_LIFETIME_MS,
  OPPORTUNITY_SIGNAL_REASON_CODES,
  OPPORTUNITY_SIGNAL_RISK_CODES,
} from "./constants";
import type {
  OpportunitySignalInputV1,
  OpportunitySignalPreflightV1,
  OpportunitySignalReasonCode,
  OpportunitySignalRiskCode,
  OpportunitySignalTimestamp,
} from "./types";

const reasonOrder = new Map<OpportunitySignalReasonCode, number>(
  OPPORTUNITY_SIGNAL_REASON_CODES.map((code, index) => [code, index]),
);
const riskOrder = new Map<OpportunitySignalRiskCode, number>(
  OPPORTUNITY_SIGNAL_RISK_CODES.map((code, index) => [code, index]),
);

function canonicalUnique<Code extends string>(
  values: Iterable<Code>,
  order: ReadonlyMap<Code, number>,
): readonly Code[] {
  return Object.freeze(
    [...new Set(values)].sort((left, right) => order.get(left)! - order.get(right)!),
  );
}

export function canonicalOpportunitySignalReasonCodes(
  values: Iterable<OpportunitySignalReasonCode>,
): readonly OpportunitySignalReasonCode[] {
  return canonicalUnique(values, reasonOrder);
}

export function canonicalOpportunitySignalRiskCodes(
  values: Iterable<OpportunitySignalRiskCode>,
): readonly OpportunitySignalRiskCode[] {
  return canonicalUnique(values, riskOrder);
}

function sameAsset(
  left: OpportunitySignalInputV1["candidate"]["asset"],
  right: OpportunitySignalInputV1["valuation"]["asset"],
): boolean {
  return (
    left.sku === right.sku &&
    left.condition === right.condition &&
    left.finish === right.finish
  );
}

function derivedRiskCodes(
  input: OpportunitySignalInputV1,
): readonly OpportunitySignalRiskCode[] {
  const risks: OpportunitySignalRiskCode[] = [...input.valuation.evidence_flags];

  if (
    input.valuation.basis === "aggregate_reference" &&
    !risks.includes("aggregate_not_trade_tape")
  ) {
    risks.push("aggregate_not_trade_tape");
  }
  if (
    Object.values(input.costs).some((cost) => cost.state === "estimated")
  ) {
    risks.push("estimated_costs");
  }
  if (input.currency_normalization.state === "estimated") {
    risks.push("estimated_fx");
  }
  if (input.valuation.liquidity.band === "unknown") {
    risks.push("liquidity_unknown");
  } else if (input.valuation.liquidity.band === "low") {
    risks.push("liquidity_low");
  }

  // These limitations are inherent in a non-executing decision-support signal.
  risks.push(
    "availability_not_reserved",
    "condition_unverified",
    "authenticity_unverified",
  );
  return canonicalOpportunitySignalRiskCodes(risks);
}

function instant(value: OpportunitySignalTimestamp): number {
  return Date.parse(value);
}

function signalCeiling(
  input: OpportunitySignalInputV1,
): OpportunitySignalTimestamp | null {
  const expiries: OpportunitySignalTimestamp[] = [
    input.candidate.expires_at,
    input.valuation.evidence.expires_at,
    input.release_eligibility.expires_at,
  ];

  for (const cost of Object.values(input.costs)) {
    if (cost.state === "known" || cost.state === "estimated") {
      expiries.push(cost.evidence.expires_at);
    }
  }
  if (input.currency_normalization.state !== "not_required") {
    expiries.push(input.currency_normalization.evidence.expires_at);
  }
  if (input.valuation.liquidity.band !== "unknown") {
    expiries.push(input.valuation.liquidity.evidence.expires_at);
  }

  const evaluatedMs = instant(input.evaluated_at);
  const lifetimeCeilingMs = evaluatedMs + OPPORTUNITY_SIGNAL_MAX_LIFETIME_MS;
  if (!Number.isSafeInteger(lifetimeCeilingMs)) return null;
  const earliestMs = Math.min(lifetimeCeilingMs, ...expiries.map(instant));
  try {
    const canonical = new Date(earliestMs).toISOString();
    return canonical.length === 24 ? canonical : null;
  } catch {
    return null;
  }
}

/**
 * Public safety policy only. This function contains no scoring weights,
 * profitability arithmetic, or private classification threshold.
 */
export function preflightOpportunitySignalV1(
  input: OpportunitySignalInputV1,
): OpportunitySignalPreflightV1 {
  const evaluatedMs = instant(input.evaluated_at);
  const reasons: OpportunitySignalReasonCode[] = [];
  const risks = derivedRiskCodes(input);

  if (
    !input.release_eligibility.eligible ||
    instant(input.release_eligibility.expires_at) <= evaluatedMs
  ) {
    reasons.push("rights_not_eligible");
  }
  if (instant(input.candidate.expires_at) <= evaluatedMs) {
    reasons.push("candidate_expired");
  }
  if (instant(input.valuation.evidence.expires_at) <= evaluatedMs) {
    reasons.push("valuation_expired");
  }

  let expiredCost = false;
  let unknownCost = false;
  for (const cost of Object.values(input.costs)) {
    if (cost.state === "unknown") {
      unknownCost = true;
    } else if (
      (cost.state === "known" || cost.state === "estimated") &&
      instant(cost.evidence.expires_at) <= evaluatedMs
    ) {
      expiredCost = true;
    }
  }
  if (expiredCost) reasons.push("cost_quote_expired");
  if (unknownCost) reasons.push("unknown_cost");

  if (input.currency_normalization.state === "unknown") {
    reasons.push("fx_missing");
  }
  if (
    input.currency_normalization.state !== "not_required" &&
    instant(input.currency_normalization.evidence.expires_at) <= evaluatedMs
  ) {
    reasons.push("fx_expired");
  }
  if (!sameAsset(input.candidate.asset, input.valuation.asset)) {
    reasons.push("asset_mismatch");
  }
  if (
    input.valuation.confidence === "low" ||
    input.currency_normalization.state === "estimated" ||
    (input.valuation.liquidity.band !== "unknown" &&
      instant(input.valuation.liquidity.evidence.expires_at) <= evaluatedMs)
  ) {
    reasons.push("insufficient_evidence");
  }

  const expiresAtCeiling = signalCeiling(input);
  if (expiresAtCeiling === null) reasons.push("numeric_overflow");

  if (reasons.length > 0) {
    return Object.freeze({
      ok: false,
      reason_codes: canonicalOpportunitySignalReasonCodes(reasons),
      risk_codes: risks,
    });
  }

  return Object.freeze({
    ok: true,
    expires_at_ceiling: expiresAtCeiling!,
    risk_codes: risks,
  });
}
