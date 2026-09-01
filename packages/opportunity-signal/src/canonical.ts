import {
  parseOpportunitySignalEvidenceEnvelopeV1,
  parseOpportunitySignalInputV1,
} from "./parsers";
import type {
  OpportunitySignalEvidenceEnvelopeV1,
  OpportunitySignalInputV1,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Canonical JSON for this bounded, already-parsed contract. Object keys sort
 * lexically at every depth; arrays retain their contract-validated order.
 * This is deliberately not advertised as a general RFC 8785 implementation.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  throw new TypeError(
    "Opportunity Signal canonical JSON accepts only parsed v1 JSON values.",
  );
}

function evidenceBundle(
  input: OpportunitySignalEvidenceEnvelopeV1,
): Record<string, unknown> {
  return {
    schema: input.schema,
    candidate: input.candidate,
    valuation: input.valuation,
    costs: input.costs,
    currency_normalization: input.currency_normalization,
  };
}

export function canonicalOpportunitySignalEvidenceBundleJsonV1(
  rawEvidenceEnvelope: unknown,
): string {
  const envelope = parseOpportunitySignalEvidenceEnvelopeV1(
    rawEvidenceEnvelope,
  );
  return canonicalJson(evidenceBundle(envelope));
}

export function canonicalOpportunitySignalEvidenceBundleBytesV1(
  rawEvidenceEnvelope: unknown,
): Uint8Array {
  return new TextEncoder().encode(
    canonicalOpportunitySignalEvidenceBundleJsonV1(rawEvidenceEnvelope),
  );
}

export function canonicalOpportunitySignalRequestJsonV1(rawInput: unknown): string {
  return canonicalJson(parseOpportunitySignalInputV1(rawInput));
}

export function canonicalOpportunitySignalRequestBytesV1(
  rawInput: unknown,
): Uint8Array {
  return new TextEncoder().encode(canonicalOpportunitySignalRequestJsonV1(rawInput));
}
