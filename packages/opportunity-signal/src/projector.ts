import {
  OPPORTUNITY_SIGNAL_CLAIM_SCOPE,
  OPPORTUNITY_SIGNAL_DOES_NOT_INCLUDE,
  OPPORTUNITY_SIGNAL_EVIDENCE_SCHEMA,
  OPPORTUNITY_SIGNAL_INHERENT_UNAVAILABLE_RISKS,
  OPPORTUNITY_SIGNAL_SCHEMA,
} from "./constants";
import { deriveOpportunitySignalEconomicsBandsV1 } from "./economics";
import {
  OpportunitySignalContractError,
  type OpportunitySignalContractIssue,
} from "./error";
import {
  opportunitySignalEvidenceBundleDigestV1,
  opportunitySignalRequestDigestV1,
} from "./hash";
import {
  isOpportunitySignalContractError,
  parseOpportunitySignalInputV1,
  parseOpportunitySignalProviderResultV1,
  parseOpportunitySignalV1,
} from "./parsers";
import {
  canonicalOpportunitySignalReasonCodes,
  preflightOpportunitySignalV1,
} from "./preflight";
import type {
  OpportunitySignalInputV1,
  OpportunitySignalProviderResultV1,
  OpportunitySignalProviderV1,
  OpportunitySignalReasonCode,
  OpportunitySignalRiskCode,
  OpportunitySignalSha256Digest,
  OpportunitySignalSha256DigestProvider,
  OpportunitySignalTimestamp,
  OpportunitySignalV1,
} from "./types";

function earlierTimestamp(
  left: OpportunitySignalTimestamp,
  right: OpportunitySignalTimestamp,
): OpportunitySignalTimestamp {
  return Date.parse(left) <= Date.parse(right) ? left : right;
}

function unavailableSignal(
  input: OpportunitySignalInputV1,
  reasonCodes: readonly OpportunitySignalReasonCode[],
  riskCodes: readonly OpportunitySignalRiskCode[],
  privacyBlind = false,
): OpportunitySignalV1 {
  const rightsDenied = reasonCodes.includes("rights_not_eligible");
  const hideValuation = rightsDenied || privacyBlind;
  return parseOpportunitySignalV1({
    schema: OPPORTUNITY_SIGNAL_SCHEMA,
    candidate_ref: input.candidate.candidate_ref,
    sku: input.candidate.asset.sku,
    classification: "unavailable",
    evaluated_at: input.evaluated_at,
    expires_at: null,
    valuation_as_of: hideValuation
      ? null
      : input.valuation.evidence.source_stated_at,
    estimate: null,
    confidence: hideValuation ? null : input.valuation.confidence,
    liquidity: hideValuation ? null : input.valuation.liquidity.band,
    reason_codes: reasonCodes,
    risk_codes: hideValuation
      ? OPPORTUNITY_SIGNAL_INHERENT_UNAVAILABLE_RISKS
      : riskCodes,
    claim_scope: OPPORTUNITY_SIGNAL_CLAIM_SCOPE,
    does_not_include: OPPORTUNITY_SIGNAL_DOES_NOT_INCLUDE,
  });
}

function assertProviderBinding(
  input: OpportunitySignalInputV1,
  requestDigest: OpportunitySignalSha256Digest,
  result: OpportunitySignalProviderResultV1,
): void {
  const issues: OpportunitySignalContractIssue[] = [];
  if (result.candidate_ref !== input.candidate.candidate_ref) {
    issues.push({
      path: "$.candidate_ref",
      code: "cross_contract_mismatch",
      message: "Provider result is not bound to this candidate reference.",
    });
  }
  if (result.evaluated_at !== input.evaluated_at) {
    issues.push({
      path: "$.evaluated_at",
      code: "cross_contract_mismatch",
      message: "Provider result is not bound to this evaluated_at instant.",
    });
  }
  if (result.request_digest !== requestDigest) {
    issues.push({
      path: "$.request_digest",
      code: "cross_contract_mismatch",
      message: "Provider result is not bound to this exact validated request.",
    });
  }
  if (issues.length > 0) {
    throw new OpportunitySignalContractError("provider_result", issues);
  }
}

async function bindingState(
  input: OpportunitySignalInputV1,
  digestProvider?: OpportunitySignalSha256DigestProvider,
): Promise<
  | { readonly ok: false }
  | { readonly ok: true; readonly request_digest: OpportunitySignalSha256Digest }
> {
  const evidenceDigest = await opportunitySignalEvidenceBundleDigestV1(
    {
      schema: OPPORTUNITY_SIGNAL_EVIDENCE_SCHEMA,
      evaluated_at: input.evaluated_at,
      candidate: input.candidate,
      valuation: input.valuation,
      costs: input.costs,
      currency_normalization: input.currency_normalization,
    },
    digestProvider,
  );
  if (evidenceDigest !== input.release_eligibility.evidence_bundle_digest) {
    return Object.freeze({ ok: false });
  }
  return Object.freeze({
    ok: true,
    request_digest: await opportunitySignalRequestDigestV1(input, digestProvider),
  });
}

async function preflightAndBind(
  input: OpportunitySignalInputV1,
  digestProvider?: OpportunitySignalSha256DigestProvider,
): Promise<
  | { readonly ok: false; readonly output: OpportunitySignalV1 }
  | {
      readonly ok: true;
      readonly request_digest: OpportunitySignalSha256Digest;
      readonly expires_at_ceiling: OpportunitySignalTimestamp;
      readonly risk_codes: readonly OpportunitySignalRiskCode[];
    }
> {
  const preflight = preflightOpportunitySignalV1(input);
  const binding = await bindingState(input, digestProvider);
  if (!preflight.ok || !binding.ok) {
    const reasons: OpportunitySignalReasonCode[] = preflight.ok
      ? []
      : [...preflight.reason_codes];
    if (!binding.ok) reasons.push("rights_not_eligible");
    return Object.freeze({
      ok: false,
      output: unavailableSignal(
        input,
        canonicalOpportunitySignalReasonCodes(reasons),
        preflight.risk_codes,
      ),
    });
  }
  return Object.freeze({
    ok: true,
    request_digest: binding.request_digest,
    expires_at_ceiling: preflight.expires_at_ceiling,
    risk_codes: preflight.risk_codes,
  });
}

/**
 * Recomputes both cryptographic bindings before projecting. Unknown provider
 * fields, stale request digests, and economically impossible potential claims
 * throw a redaction-safe contract error.
 */
export async function projectOpportunitySignalV1(
  rawInput: unknown,
  rawProviderResult: unknown,
  digestProvider?: OpportunitySignalSha256DigestProvider,
): Promise<OpportunitySignalV1> {
  const input = parseOpportunitySignalInputV1(rawInput);
  const bound = await preflightAndBind(input, digestProvider);
  if (!bound.ok) return bound.output;

  const providerResult = parseOpportunitySignalProviderResultV1(rawProviderResult);
  assertProviderBinding(input, bound.request_digest, providerResult);
  if (
    providerResult.classification === "unavailable" &&
    providerResult.reason_codes.includes("rights_not_eligible")
  ) {
    return unavailableSignal(
      input,
      providerResult.reason_codes,
      bound.risk_codes,
    );
  }
  const estimate =
    providerResult.classification === "potential_deal"
      ? deriveOpportunitySignalEconomicsBandsV1(input)
      : null;
  if (providerResult.classification === "potential_deal" && estimate === null) {
    throw new OpportunitySignalContractError("provider_result", [
      {
        path: "$.classification",
        code: "unsafe_claim",
        message:
          "potential_deal requires a positive conservative public spread and margin.",
      },
    ]);
  }

  return parseOpportunitySignalV1({
    schema: OPPORTUNITY_SIGNAL_SCHEMA,
    candidate_ref: input.candidate.candidate_ref,
    sku: input.candidate.asset.sku,
    classification: providerResult.classification,
    evaluated_at: input.evaluated_at,
    expires_at: earlierTimestamp(
      bound.expires_at_ceiling,
      providerResult.expires_at,
    ),
    valuation_as_of: input.valuation.evidence.source_stated_at,
    estimate,
    confidence: input.valuation.confidence,
    liquidity: input.valuation.liquidity.band,
    reason_codes: providerResult.reason_codes,
    risk_codes: bound.risk_codes,
    claim_scope: OPPORTUNITY_SIGNAL_CLAIM_SCOPE,
    does_not_include: OPPORTUNITY_SIGNAL_DOES_NOT_INCLUDE,
  });
}

/**
 * Complete public orchestration. Input failures throw. Public blockers and
 * evidence-digest mismatches skip the provider. Provider failures or replayed
 * results become redacted unavailable signals.
 */
export async function evaluateOpportunitySignalV1(
  provider: OpportunitySignalProviderV1,
  rawInput: unknown,
  digestProvider?: OpportunitySignalSha256DigestProvider,
): Promise<OpportunitySignalV1> {
  const input = parseOpportunitySignalInputV1(rawInput);
  const bound = await preflightAndBind(input, digestProvider);
  if (!bound.ok) return bound.output;

  let rawProviderResult: unknown;
  try {
    rawProviderResult = await provider.evaluate(
      input,
      Object.freeze({ request_digest: bound.request_digest }),
    );
  } catch {
    return unavailableSignal(
      input,
      ["invalid_input"],
      bound.risk_codes,
      true,
    );
  }

  try {
    // Deliberately recompute both digests rather than trusting the pre-call
    // binding, so direct/replayed results share one projection path.
    return await projectOpportunitySignalV1(
      input,
      rawProviderResult,
      digestProvider,
    );
  } catch (error) {
    if (!isOpportunitySignalContractError(error)) throw error;
    return unavailableSignal(
      input,
      ["invalid_input"],
      bound.risk_codes,
      true,
    );
  }
}
