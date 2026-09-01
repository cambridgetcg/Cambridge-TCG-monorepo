import {
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
  OPPORTUNITY_SIGNAL_FX_NOT_REQUIRED_REASON,
  OPPORTUNITY_SIGNAL_INPUT_SCHEMA,
  OPPORTUNITY_SIGNAL_INHERENT_UNAVAILABLE_RISKS,
  OPPORTUNITY_SIGNAL_LIQUIDITY_BANDS,
  OPPORTUNITY_SIGNAL_MARGIN_BANDS,
  OPPORTUNITY_SIGNAL_MAX_MINOR_UNITS,
  OPPORTUNITY_SIGNAL_NOT_APPLICABLE_REASONS,
  OPPORTUNITY_SIGNAL_OPERATION,
  OPPORTUNITY_SIGNAL_PROVIDER_RESULT_SCHEMA,
  OPPORTUNITY_SIGNAL_REASON_CODES,
  OPPORTUNITY_SIGNAL_RISK_CODES,
  OPPORTUNITY_SIGNAL_SCHEMA,
  OPPORTUNITY_SIGNAL_SPREAD_BANDS,
  OPPORTUNITY_SIGNAL_VALUATION_BASES,
} from "./constants";
import {
  OpportunitySignalContractError,
  type OpportunitySignalContractIssue,
  type OpportunitySignalContractIssueCode,
  type OpportunitySignalContractPhase,
} from "./error";
import type {
  OpportunitySignalAssetV1,
  OpportunitySignalCandidateV1,
  OpportunitySignalClassification,
  OpportunitySignalConfidence,
  OpportunitySignalCostStateV1,
  OpportunitySignalCostsV1,
  OpportunitySignalCurrencyNormalizationV1,
  OpportunitySignalEstimateV1,
  OpportunitySignalEvidenceEnvelopeV1,
  OpportunitySignalEvidenceFlag,
  OpportunitySignalInputV1,
  OpportunitySignalIntegerRange,
  OpportunitySignalLiquidityBand,
  OpportunitySignalLiquidityV1,
  OpportunitySignalProviderResultV1,
  OpportunitySignalReasonCode,
  OpportunitySignalReleaseEligibilityV1,
  OpportunitySignalRiskCode,
  OpportunitySignalTimedEvidenceV1,
  OpportunitySignalTimestamp,
  OpportunitySignalV1,
  OpportunitySignalValuationBasis,
  OpportunitySignalValuationV1,
} from "./types";

type PlainRecord = Record<string, unknown>;

const CANONICAL_UTC =
  /^(?!0000-)[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{3}Z$/;
const OPAQUE_REF = /^ctcg_cand_[A-Za-z0-9]{22}$/;
const SKU = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const POLICY_DIGEST = /^sha256:[0-9a-f]{64}$/;

function fail(
  phase: OpportunitySignalContractPhase,
  path: string,
  code: OpportunitySignalContractIssueCode,
  message: string,
): never {
  throw new OpportunitySignalContractError(phase, [{ path, code, message }]);
}

function plainRecord(
  value: unknown,
  path: string,
  phase: OpportunitySignalContractPhase,
): PlainRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(phase, path, "wrong_type", "Expected a plain JSON object.");
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return fail(phase, path, "wrong_type", "Expected a plain JSON object.");
  }

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      return fail(
        phase,
        path,
        "unknown_field",
        "Symbol keys are not part of the JSON contract.",
      );
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      return fail(
        phase,
        `${path}.${key}`,
        "invalid_format",
        "Only enumerable JSON data properties are accepted.",
      );
    }
  }

  return value as PlainRecord;
}

function exactKeys(
  record: PlainRecord,
  allowed: readonly string[],
  required: readonly string[],
  path: string,
  phase: OpportunitySignalContractPhase,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) {
      fail(
        phase,
        `${path}.${key}`,
        "unknown_field",
        "Unknown fields are rejected at the public contract boundary.",
      );
    }
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      fail(phase, `${path}.${key}`, "required", "Required field is missing.");
    }
  }
}

function plainArray(
  value: unknown,
  path: string,
  phase: OpportunitySignalContractPhase,
): readonly unknown[] {
  if (!Array.isArray(value)) {
    return fail(phase, path, "wrong_type", "Expected a JSON array.");
  }

  const keys = Reflect.ownKeys(value);
  for (const key of keys) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(key)) {
      return fail(
        phase,
        path,
        "unknown_field",
        "Array properties outside its JSON indices are rejected.",
      );
    }
    const index = Number(key);
    if (!Number.isSafeInteger(index) || index < 0 || index >= value.length) {
      return fail(phase, path, "invalid_format", "Array indices are invalid.");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      return fail(
        phase,
        `${path}[${index}]`,
        "invalid_format",
        "Only enumerable JSON data properties are accepted.",
      );
    }
  }

  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      return fail(
        phase,
        `${path}[${index}]`,
        "required",
        "Sparse JSON arrays are rejected.",
      );
    }
  }
  return value;
}

function literal<T extends string>(
  value: unknown,
  expected: T,
  path: string,
  phase: OpportunitySignalContractPhase,
): T {
  if (value !== expected) {
    return fail(
      phase,
      path,
      typeof value === "string" ? "unsupported_value" : "wrong_type",
      `Expected the exact value ${expected}.`,
    );
  }
  return expected;
}

function enumValue<const Values extends readonly string[]>(
  value: unknown,
  allowed: Values,
  path: string,
  phase: OpportunitySignalContractPhase,
): Values[number] {
  if (typeof value !== "string") {
    return fail(phase, path, "wrong_type", "Expected a supported string value.");
  }
  if (!(allowed as readonly string[]).includes(value)) {
    return fail(
      phase,
      path,
      "unsupported_value",
      "Value is not supported by opportunity-signal/v1.",
    );
  }
  return value as Values[number];
}

function booleanValue(
  value: unknown,
  path: string,
  phase: OpportunitySignalContractPhase,
): boolean {
  if (typeof value !== "boolean") {
    return fail(phase, path, "wrong_type", "Expected a JSON boolean.");
  }
  return value;
}

function nullable<T>(
  value: unknown,
  parser: (value: unknown) => T,
): T | null {
  return value === null ? null : parser(value);
}

function canonicalTimestamp(
  value: unknown,
  path: string,
  phase: OpportunitySignalContractPhase,
): OpportunitySignalTimestamp {
  if (typeof value !== "string") {
    return fail(
      phase,
      path,
      "wrong_type",
      "Expected a canonical UTC timestamp string.",
    );
  }
  if (!CANONICAL_UTC.test(value)) {
    return fail(
      phase,
      path,
      "invalid_format",
      "Timestamp must be canonical UTC with exactly millisecond precision.",
    );
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    return fail(phase, path, "invalid_format", "Timestamp is not a real UTC instant.");
  }
  return value;
}

function timestampMs(value: OpportunitySignalTimestamp): number {
  return Date.parse(value);
}

function opaqueReference(
  value: unknown,
  path: string,
  phase: OpportunitySignalContractPhase,
): string {
  if (typeof value !== "string") {
    return fail(phase, path, "wrong_type", "Expected an opaque reference string.");
  }
  if (!OPAQUE_REF.test(value)) {
    return fail(
      phase,
      path,
      "invalid_format",
      "Reference must be ctcg_cand_ followed by exactly 22 base62 characters.",
    );
  }
  return value;
}

function sku(
  value: unknown,
  path: string,
  phase: OpportunitySignalContractPhase,
): string {
  if (typeof value !== "string") {
    return fail(phase, path, "wrong_type", "Expected a Cambridge SKU string.");
  }
  if (!SKU.test(value)) {
    return fail(
      phase,
      path,
      "invalid_format",
      "SKU must be 1-128 safe identifier characters.",
    );
  }
  return value;
}

function boundedInteger(
  value: unknown,
  path: string,
  phase: OpportunitySignalContractPhase,
  options: { readonly positive?: boolean } = {},
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    Object.is(value, -0)
  ) {
    return fail(phase, path, "wrong_type", "Expected a safe JSON integer.");
  }
  const minimum = options.positive === true ? 1 : 0;
  if (value < minimum || value > OPPORTUNITY_SIGNAL_MAX_MINOR_UNITS) {
    return fail(
      phase,
      path,
      "out_of_range",
      `Integer must be between ${minimum} and ${OPPORTUNITY_SIGNAL_MAX_MINOR_UNITS}.`,
    );
  }
  return value;
}

function integerRange(
  value: unknown,
  path: string,
  phase: OpportunitySignalContractPhase,
  options: { readonly positiveLow?: boolean } = {},
): OpportunitySignalIntegerRange {
  const record = plainRecord(value, path, phase);
  exactKeys(record, ["low", "midpoint", "high"], ["low", "midpoint", "high"], path, phase);
  const low = boundedInteger(record.low, `${path}.low`, phase, {
    positive: options.positiveLow,
  });
  const midpoint = boundedInteger(record.midpoint, `${path}.midpoint`, phase);
  const high = boundedInteger(record.high, `${path}.high`, phase);
  if (low > midpoint || midpoint > high) {
    return fail(
      phase,
      path,
      "invalid_order",
      "Range must satisfy low <= midpoint <= high.",
    );
  }
  return Object.freeze({ low, midpoint, high });
}

function asset(
  value: unknown,
  path: string,
  phase: OpportunitySignalContractPhase,
): OpportunitySignalAssetV1 {
  const record = plainRecord(value, path, phase);
  exactKeys(record, ["sku", "condition", "finish"], ["sku", "condition", "finish"], path, phase);
  return Object.freeze({
    sku: sku(record.sku, `${path}.sku`, phase),
    condition: enumValue(record.condition, OPPORTUNITY_SIGNAL_CONDITIONS, `${path}.condition`, phase),
    finish: enumValue(record.finish, OPPORTUNITY_SIGNAL_FINISHES, `${path}.finish`, phase),
  });
}

function timedEvidence(
  value: unknown,
  path: string,
  phase: OpportunitySignalContractPhase,
  evaluatedAt: OpportunitySignalTimestamp,
): OpportunitySignalTimedEvidenceV1 {
  const record = plainRecord(value, path, phase);
  exactKeys(
    record,
    ["source_stated_at", "retrieved_at", "expires_at"],
    ["source_stated_at", "retrieved_at", "expires_at"],
    path,
    phase,
  );
  const sourceStatedAt = canonicalTimestamp(record.source_stated_at, `${path}.source_stated_at`, phase);
  const retrievedAt = canonicalTimestamp(record.retrieved_at, `${path}.retrieved_at`, phase);
  const expiresAt = canonicalTimestamp(record.expires_at, `${path}.expires_at`, phase);
  if (timestampMs(sourceStatedAt) > timestampMs(retrievedAt)) {
    return fail(
      phase,
      path,
      "invalid_order",
      "Evidence source_stated_at must not be after retrieved_at.",
    );
  }
  if (timestampMs(retrievedAt) > timestampMs(evaluatedAt)) {
    return fail(
      phase,
      path,
      "cross_contract_mismatch",
      "Evidence retrieved_at must not be after the input evaluated_at.",
    );
  }
  if (timestampMs(retrievedAt) >= timestampMs(expiresAt)) {
    return fail(
      phase,
      path,
      "invalid_order",
      "Evidence expires_at must be after retrieved_at.",
    );
  }
  return Object.freeze({
    source_stated_at: sourceStatedAt,
    retrieved_at: retrievedAt,
    expires_at: expiresAt,
  });
}

function canonicalEnumArray<const Values extends readonly string[]>(
  value: unknown,
  allowed: Values,
  path: string,
  phase: OpportunitySignalContractPhase,
): readonly Values[number][] {
  const array = plainArray(value, path, phase);
  if (array.length > allowed.length) {
    return fail(phase, path, "out_of_range", "Array contains too many values.");
  }
  const indices = new Map<string, number>(allowed.map((item, index) => [item, index]));
  const result: Values[number][] = [];
  let priorIndex = -1;
  const seen = new Set<string>();
  for (let index = 0; index < array.length; index += 1) {
    const item = enumValue(array[index], allowed, `${path}[${index}]`, phase);
    if (seen.has(item)) {
      return fail(
        phase,
        `${path}[${index}]`,
        "duplicate_value",
        "Contract code arrays must contain unique values.",
      );
    }
    seen.add(item);
    const canonicalIndex = indices.get(item)!;
    if (canonicalIndex <= priorIndex) {
      return fail(
        phase,
        path,
        "invalid_order",
        "Values must follow the contract's declared canonical order.",
      );
    }
    priorIndex = canonicalIndex;
    result.push(item);
  }
  return Object.freeze(result);
}

function candidate(
  value: unknown,
  path: string,
  phase: OpportunitySignalContractPhase,
  evaluatedAt: OpportunitySignalTimestamp,
): OpportunitySignalCandidateV1 {
  const record = plainRecord(value, path, phase);
  exactKeys(
    record,
    [
      "candidate_ref",
      "asset",
      "quantity",
      "asking_price_minor",
      "observed_at",
      "retrieved_at",
      "expires_at",
    ],
    [
      "candidate_ref",
      "asset",
      "quantity",
      "asking_price_minor",
      "observed_at",
      "retrieved_at",
      "expires_at",
    ],
    path,
    phase,
  );
  if (record.quantity !== 1) {
    fail(
      phase,
      `${path}.quantity`,
      typeof record.quantity === "number" ? "unsupported_value" : "wrong_type",
      "opportunity-signal/v1 evaluates exactly one card at a time.",
    );
  }
  const observedAt = canonicalTimestamp(record.observed_at, `${path}.observed_at`, phase);
  const retrievedAt = canonicalTimestamp(record.retrieved_at, `${path}.retrieved_at`, phase);
  const expiresAt = canonicalTimestamp(record.expires_at, `${path}.expires_at`, phase);
  if (timestampMs(observedAt) > timestampMs(retrievedAt)) {
    fail(
      phase,
      path,
      "invalid_order",
      "Candidate observed_at must not be after retrieved_at.",
    );
  }
  if (timestampMs(retrievedAt) > timestampMs(evaluatedAt)) {
    fail(
      phase,
      path,
      "cross_contract_mismatch",
      "Candidate retrieved_at must not be after the input evaluated_at.",
    );
  }
  if (timestampMs(retrievedAt) >= timestampMs(expiresAt)) {
    fail(
      phase,
      path,
      "invalid_order",
      "Candidate expires_at must be after retrieved_at.",
    );
  }
  return Object.freeze({
    candidate_ref: opaqueReference(record.candidate_ref, `${path}.candidate_ref`, phase),
    asset: asset(record.asset, `${path}.asset`, phase),
    quantity: 1,
    asking_price_minor: boundedInteger(
      record.asking_price_minor,
      `${path}.asking_price_minor`,
      phase,
      { positive: true },
    ),
    observed_at: observedAt,
    retrieved_at: retrievedAt,
    expires_at: expiresAt,
  });
}

function liquidity(
  value: unknown,
  path: string,
  phase: OpportunitySignalContractPhase,
  evaluatedAt: OpportunitySignalTimestamp,
): OpportunitySignalLiquidityV1 {
  const record = plainRecord(value, path, phase);
  const band = enumValue(record.band, OPPORTUNITY_SIGNAL_LIQUIDITY_BANDS, `${path}.band`, phase);
  if (band === "unknown") {
    exactKeys(record, ["band"], ["band"], path, phase);
    return Object.freeze({ band });
  }
  exactKeys(record, ["band", "evidence"], ["band", "evidence"], path, phase);
  return Object.freeze({
    band,
    evidence: timedEvidence(record.evidence, `${path}.evidence`, phase, evaluatedAt),
  });
}

function valuation(
  value: unknown,
  path: string,
  phase: OpportunitySignalContractPhase,
  evaluatedAt: OpportunitySignalTimestamp,
): OpportunitySignalValuationV1 {
  const record = plainRecord(value, path, phase);
  exactKeys(
    record,
    [
      "asset",
      "estimated_gross_exit_minor",
      "evidence",
      "basis",
      "confidence",
      "evidence_flags",
      "liquidity",
    ],
    [
      "asset",
      "estimated_gross_exit_minor",
      "evidence",
      "basis",
      "confidence",
      "evidence_flags",
      "liquidity",
    ],
    path,
    phase,
  );
  const basis = enumValue(
    record.basis,
    OPPORTUNITY_SIGNAL_VALUATION_BASES,
    `${path}.basis`,
    phase,
  ) as OpportunitySignalValuationBasis;
  const evidenceFlags = canonicalEnumArray(
    record.evidence_flags,
    OPPORTUNITY_SIGNAL_EVIDENCE_FLAGS,
    `${path}.evidence_flags`,
    phase,
  ) as readonly OpportunitySignalEvidenceFlag[];
  if (basis === "aggregate_reference" && !evidenceFlags.includes("aggregate_not_trade_tape")) {
    fail(
      phase,
      `${path}.evidence_flags`,
      "required",
      "Aggregate reference valuations must declare aggregate_not_trade_tape.",
    );
  }
  return Object.freeze({
    asset: asset(record.asset, `${path}.asset`, phase),
    estimated_gross_exit_minor: integerRange(
      record.estimated_gross_exit_minor,
      `${path}.estimated_gross_exit_minor`,
      phase,
    ),
    evidence: timedEvidence(record.evidence, `${path}.evidence`, phase, evaluatedAt),
    basis,
    confidence: enumValue(
      record.confidence,
      OPPORTUNITY_SIGNAL_CONFIDENCE_BANDS,
      `${path}.confidence`,
      phase,
    ) as OpportunitySignalConfidence,
    evidence_flags: evidenceFlags,
    liquidity: liquidity(record.liquidity, `${path}.liquidity`, phase, evaluatedAt),
  });
}

function costState(
  value: unknown,
  path: string,
  phase: OpportunitySignalContractPhase,
  evaluatedAt: OpportunitySignalTimestamp,
): OpportunitySignalCostStateV1 {
  const record = plainRecord(value, path, phase);
  const state = enumValue(
    record.state,
    ["unknown", "not_applicable", "known", "estimated"] as const,
    `${path}.state`,
    phase,
  );
  if (state === "unknown") {
    exactKeys(record, ["state"], ["state"], path, phase);
    return Object.freeze({ state });
  }
  if (state === "not_applicable") {
    exactKeys(record, ["state", "reason"], ["state", "reason"], path, phase);
    return Object.freeze({
      state,
      reason: enumValue(
        record.reason,
        OPPORTUNITY_SIGNAL_NOT_APPLICABLE_REASONS,
        `${path}.reason`,
        phase,
      ),
    });
  }
  exactKeys(record, ["state", "amount_minor", "evidence"], ["state", "amount_minor", "evidence"], path, phase);
  return Object.freeze({
    state,
    amount_minor: integerRange(record.amount_minor, `${path}.amount_minor`, phase),
    evidence: timedEvidence(record.evidence, `${path}.evidence`, phase, evaluatedAt),
  });
}

function costs(
  value: unknown,
  path: string,
  phase: OpportunitySignalContractPhase,
  evaluatedAt: OpportunitySignalTimestamp,
): OpportunitySignalCostsV1 {
  const record = plainRecord(value, path, phase);
  exactKeys(record, OPPORTUNITY_SIGNAL_COST_KEYS, OPPORTUNITY_SIGNAL_COST_KEYS, path, phase);
  const parsed = {} as Record<(typeof OPPORTUNITY_SIGNAL_COST_KEYS)[number], OpportunitySignalCostStateV1>;
  for (const key of OPPORTUNITY_SIGNAL_COST_KEYS) {
    parsed[key] = costState(record[key], `${path}.${key}`, phase, evaluatedAt);
  }
  return Object.freeze(parsed);
}

function currencyNormalization(
  value: unknown,
  path: string,
  phase: OpportunitySignalContractPhase,
  evaluatedAt: OpportunitySignalTimestamp,
): OpportunitySignalCurrencyNormalizationV1 {
  const record = plainRecord(value, path, phase);
  const currency = literal(record.currency, OPPORTUNITY_SIGNAL_CURRENCY, `${path}.currency`, phase);
  const state = enumValue(
    record.state,
    ["not_required", "quoted", "estimated", "unknown"] as const,
    `${path}.state`,
    phase,
  );
  if (state === "not_required") {
    exactKeys(
      record,
      ["currency", "state", "reason"],
      ["currency", "state", "reason"],
      path,
      phase,
    );
    return Object.freeze({
      currency,
      state,
      reason: literal(
        record.reason,
        OPPORTUNITY_SIGNAL_FX_NOT_REQUIRED_REASON,
        `${path}.reason`,
        phase,
      ),
    });
  }
  exactKeys(record, ["currency", "state", "evidence"], ["currency", "state", "evidence"], path, phase);
  return Object.freeze({
    currency,
    state,
    evidence: timedEvidence(record.evidence, `${path}.evidence`, phase, evaluatedAt),
  });
}

function releaseEligibility(
  value: unknown,
  path: string,
  phase: OpportunitySignalContractPhase,
  inputEvaluatedAt: OpportunitySignalTimestamp,
): OpportunitySignalReleaseEligibilityV1 {
  const record = plainRecord(value, path, phase);
  exactKeys(
    record,
    [
      "operation",
      "eligible",
      "evaluated_at",
      "expires_at",
      "policy_digest",
      "evidence_bundle_digest",
    ],
    [
      "operation",
      "eligible",
      "evaluated_at",
      "expires_at",
      "policy_digest",
      "evidence_bundle_digest",
    ],
    path,
    phase,
  );
  const evaluatedAt = canonicalTimestamp(record.evaluated_at, `${path}.evaluated_at`, phase);
  const expiresAt = canonicalTimestamp(record.expires_at, `${path}.expires_at`, phase);
  if (timestampMs(evaluatedAt) > timestampMs(inputEvaluatedAt)) {
    fail(
      phase,
      path,
      "cross_contract_mismatch",
      "Rights evaluated_at must not be after the input evaluated_at.",
    );
  }
  if (timestampMs(evaluatedAt) >= timestampMs(expiresAt)) {
    fail(
      phase,
      path,
      "invalid_order",
      "Rights expires_at must be after its evaluated_at.",
    );
  }
  if (typeof record.policy_digest !== "string" || !POLICY_DIGEST.test(record.policy_digest)) {
    fail(
      phase,
      `${path}.policy_digest`,
      typeof record.policy_digest === "string" ? "invalid_format" : "wrong_type",
      "Policy digest must be sha256 followed by 64 lowercase hexadecimal characters.",
    );
  }
  if (
    typeof record.evidence_bundle_digest !== "string" ||
    !POLICY_DIGEST.test(record.evidence_bundle_digest)
  ) {
    fail(
      phase,
      `${path}.evidence_bundle_digest`,
      typeof record.evidence_bundle_digest === "string"
        ? "invalid_format"
        : "wrong_type",
      "Evidence bundle digest must be sha256 followed by 64 lowercase hexadecimal characters.",
    );
  }
  return Object.freeze({
    operation: literal(record.operation, OPPORTUNITY_SIGNAL_OPERATION, `${path}.operation`, phase),
    eligible: booleanValue(record.eligible, `${path}.eligible`, phase),
    evaluated_at: evaluatedAt,
    expires_at: expiresAt,
    policy_digest: record.policy_digest as `sha256:${string}`,
    evidence_bundle_digest:
      record.evidence_bundle_digest as `sha256:${string}`,
  });
}

export function parseOpportunitySignalInputV1(raw: unknown): OpportunitySignalInputV1 {
  const phase = "input" as const;
  const record = plainRecord(raw, "$", phase);
  exactKeys(
    record,
    [
      "schema",
      "evaluated_at",
      "candidate",
      "valuation",
      "costs",
      "currency_normalization",
      "release_eligibility",
    ],
    [
      "schema",
      "evaluated_at",
      "candidate",
      "valuation",
      "costs",
      "currency_normalization",
      "release_eligibility",
    ],
    "$",
    phase,
  );
  const evaluatedAt = canonicalTimestamp(record.evaluated_at, "$.evaluated_at", phase);
  return Object.freeze({
    schema: literal(record.schema, OPPORTUNITY_SIGNAL_INPUT_SCHEMA, "$.schema", phase),
    evaluated_at: evaluatedAt,
    candidate: candidate(record.candidate, "$.candidate", phase, evaluatedAt),
    valuation: valuation(record.valuation, "$.valuation", phase, evaluatedAt),
    costs: costs(record.costs, "$.costs", phase, evaluatedAt),
    currency_normalization: currencyNormalization(
      record.currency_normalization,
      "$.currency_normalization",
      phase,
      evaluatedAt,
    ),
    release_eligibility: releaseEligibility(
      record.release_eligibility,
      "$.release_eligibility",
      phase,
      evaluatedAt,
    ),
  });
}

/**
 * Parses the evidence bundle before a rights receipt exists. This avoids a
 * digest bootstrap cycle while retaining the same nested timing validation as
 * the full input parser.
 */
export function parseOpportunitySignalEvidenceEnvelopeV1(
  raw: unknown,
): OpportunitySignalEvidenceEnvelopeV1 {
  const phase = "input" as const;
  const record = plainRecord(raw, "$", phase);
  exactKeys(
    record,
    [
      "schema",
      "evaluated_at",
      "candidate",
      "valuation",
      "costs",
      "currency_normalization",
    ],
    [
      "schema",
      "evaluated_at",
      "candidate",
      "valuation",
      "costs",
      "currency_normalization",
    ],
    "$",
    phase,
  );
  const evaluatedAt = canonicalTimestamp(record.evaluated_at, "$.evaluated_at", phase);
  return Object.freeze({
    schema: literal(
      record.schema,
      OPPORTUNITY_SIGNAL_EVIDENCE_SCHEMA,
      "$.schema",
      phase,
    ),
    evaluated_at: evaluatedAt,
    candidate: candidate(record.candidate, "$.candidate", phase, evaluatedAt),
    valuation: valuation(record.valuation, "$.valuation", phase, evaluatedAt),
    costs: costs(record.costs, "$.costs", phase, evaluatedAt),
    currency_normalization: currencyNormalization(
      record.currency_normalization,
      "$.currency_normalization",
      phase,
      evaluatedAt,
    ),
  });
}

function estimate(
  value: unknown,
  path: string,
  phase: OpportunitySignalContractPhase,
): OpportunitySignalEstimateV1 {
  const record = plainRecord(value, path, phase);
  exactKeys(
    record,
    [
      "currency",
      "conservative_net_transaction_spread_band",
      "conservative_margin_band",
    ],
    [
      "currency",
      "conservative_net_transaction_spread_band",
      "conservative_margin_band",
    ],
    path,
    phase,
  );
  return Object.freeze({
    currency: literal(record.currency, OPPORTUNITY_SIGNAL_CURRENCY, `${path}.currency`, phase),
    conservative_net_transaction_spread_band: enumValue(
      record.conservative_net_transaction_spread_band,
      OPPORTUNITY_SIGNAL_SPREAD_BANDS,
      `${path}.conservative_net_transaction_spread_band`,
      phase,
    ),
    conservative_margin_band: enumValue(
      record.conservative_margin_band,
      OPPORTUNITY_SIGNAL_MARGIN_BANDS,
      `${path}.conservative_margin_band`,
      phase,
    ),
  });
}

function validateReasonShape(
  classification: OpportunitySignalClassification,
  reasonCodes: readonly OpportunitySignalReasonCode[],
  phase: OpportunitySignalContractPhase,
  path: string,
): void {
  if (classification === "potential_deal") {
    if (
      reasonCodes.length !== 1 ||
      reasonCodes[0] !== "private_policy_threshold_met"
    ) {
      fail(
        phase,
        `${path}.reason_codes`,
        "unsafe_claim",
        "potential_deal requires only private_policy_threshold_met.",
      );
    }
    return;
  }
  if (classification === "not_qualified") {
    if (
      reasonCodes.length !== 1 ||
      reasonCodes[0] !== "private_policy_threshold_not_met"
    ) {
      fail(
        phase,
        `${path}.reason_codes`,
        "unsafe_claim",
        "not_qualified requires only private_policy_threshold_not_met.",
      );
    }
    return;
  }
  if (reasonCodes.length === 0) {
    fail(phase, `${path}.reason_codes`, "required", "unavailable requires a reason code.");
  }
  if (
    reasonCodes.includes("private_policy_threshold_met") ||
    reasonCodes.includes("private_policy_threshold_not_met")
  ) {
    fail(
      phase,
      `${path}.reason_codes`,
      "unsafe_claim",
      "unavailable cannot claim a private threshold outcome.",
    );
  }
}

function validateOutputClassificationShape(
  classification: OpportunitySignalClassification,
  estimateValue: OpportunitySignalEstimateV1 | null,
  reasonCodes: readonly OpportunitySignalReasonCode[],
  phase: OpportunitySignalContractPhase,
  path: string,
): void {
  validateReasonShape(classification, reasonCodes, phase, path);
  if (classification === "potential_deal" && estimateValue === null) {
    fail(
      phase,
      `${path}.estimate`,
      "unsafe_claim",
      "potential_deal requires conservative public economics bands.",
    );
  }
  if (classification !== "potential_deal" && estimateValue !== null) {
    fail(
      phase,
      `${path}.estimate`,
      "unsafe_claim",
      "Only potential_deal may carry conservative public economics bands.",
    );
  }
}

export function parseOpportunitySignalProviderResultV1(
  raw: unknown,
): OpportunitySignalProviderResultV1 {
  const phase = "provider_result" as const;
  const record = plainRecord(raw, "$", phase);
  exactKeys(
    record,
    [
      "schema",
      "candidate_ref",
      "evaluated_at",
      "request_digest",
      "expires_at",
      "classification",
      "reason_codes",
    ],
    [
      "schema",
      "candidate_ref",
      "evaluated_at",
      "request_digest",
      "expires_at",
      "classification",
      "reason_codes",
    ],
    "$",
    phase,
  );
  const evaluatedAt = canonicalTimestamp(record.evaluated_at, "$.evaluated_at", phase);
  const expiresAt = canonicalTimestamp(record.expires_at, "$.expires_at", phase);
  if (timestampMs(expiresAt) <= timestampMs(evaluatedAt)) {
    fail(
      phase,
      "$.expires_at",
      "invalid_order",
      "Provider result expires_at must be after evaluated_at.",
    );
  }
  const classification = enumValue(
    record.classification,
    OPPORTUNITY_SIGNAL_CLASSIFICATIONS,
    "$.classification",
    phase,
  ) as OpportunitySignalClassification;
  if (
    typeof record.request_digest !== "string" ||
    !POLICY_DIGEST.test(record.request_digest)
  ) {
    fail(
      phase,
      "$.request_digest",
      typeof record.request_digest === "string"
        ? "invalid_format"
        : "wrong_type",
      "Request digest must be sha256 followed by 64 lowercase hexadecimal characters.",
    );
  }
  const reasonCodes = canonicalEnumArray(
    record.reason_codes,
    OPPORTUNITY_SIGNAL_REASON_CODES,
    "$.reason_codes",
    phase,
  ) as readonly OpportunitySignalReasonCode[];
  validateReasonShape(classification, reasonCodes, phase, "$" );
  return Object.freeze({
    schema: literal(record.schema, OPPORTUNITY_SIGNAL_PROVIDER_RESULT_SCHEMA, "$.schema", phase),
    candidate_ref: opaqueReference(record.candidate_ref, "$.candidate_ref", phase),
    evaluated_at: evaluatedAt,
    request_digest: record.request_digest as `sha256:${string}`,
    expires_at: expiresAt,
    classification,
    reason_codes: reasonCodes,
  });
}

function exactDoesNotInclude(
  value: unknown,
  path: string,
  phase: OpportunitySignalContractPhase,
): typeof OPPORTUNITY_SIGNAL_DOES_NOT_INCLUDE {
  const array = plainArray(value, path, phase);
  if (array.length !== OPPORTUNITY_SIGNAL_DOES_NOT_INCLUDE.length) {
    return fail(
      phase,
      path,
      "unsafe_claim",
      "does_not_include must carry the complete v1 disclaimer tuple.",
    );
  }
  for (let index = 0; index < OPPORTUNITY_SIGNAL_DOES_NOT_INCLUDE.length; index += 1) {
    if (array[index] !== OPPORTUNITY_SIGNAL_DOES_NOT_INCLUDE[index]) {
      return fail(
        phase,
        `${path}[${index}]`,
        "unsafe_claim",
        "does_not_include must match the exact ordered v1 disclaimer tuple.",
      );
    }
  }
  return OPPORTUNITY_SIGNAL_DOES_NOT_INCLUDE;
}

export function parseOpportunitySignalV1(raw: unknown): OpportunitySignalV1 {
  const phase = "output" as const;
  const record = plainRecord(raw, "$", phase);
  exactKeys(
    record,
    [
      "schema",
      "candidate_ref",
      "sku",
      "classification",
      "evaluated_at",
      "expires_at",
      "valuation_as_of",
      "estimate",
      "confidence",
      "liquidity",
      "reason_codes",
      "risk_codes",
      "claim_scope",
      "does_not_include",
    ],
    [
      "schema",
      "candidate_ref",
      "sku",
      "classification",
      "evaluated_at",
      "expires_at",
      "valuation_as_of",
      "estimate",
      "confidence",
      "liquidity",
      "reason_codes",
      "risk_codes",
      "claim_scope",
      "does_not_include",
    ],
    "$",
    phase,
  );
  const candidateRef = nullable(record.candidate_ref, (item) => opaqueReference(item, "$.candidate_ref", phase));
  const parsedSku = nullable(record.sku, (item) => sku(item, "$.sku", phase));
  if ((candidateRef === null) !== (parsedSku === null)) {
    fail(
      phase,
      "$",
      "cross_contract_mismatch",
      "candidate_ref and sku must either both be present or both be null.",
    );
  }
  const classification = enumValue(
    record.classification,
    OPPORTUNITY_SIGNAL_CLASSIFICATIONS,
    "$.classification",
    phase,
  ) as OpportunitySignalClassification;
  const evaluatedAt = canonicalTimestamp(record.evaluated_at, "$.evaluated_at", phase);
  const expiresAt = nullable(record.expires_at, (item) => canonicalTimestamp(item, "$.expires_at", phase));
  if (expiresAt !== null && timestampMs(expiresAt) <= timestampMs(evaluatedAt)) {
    fail(phase, "$.expires_at", "invalid_order", "Output expires_at must be after evaluated_at.");
  }
  const valuationAsOf = nullable(record.valuation_as_of, (item) =>
    canonicalTimestamp(item, "$.valuation_as_of", phase),
  );
  if (
    valuationAsOf !== null &&
    timestampMs(valuationAsOf) > timestampMs(evaluatedAt)
  ) {
    fail(
      phase,
      "$.valuation_as_of",
      "cross_contract_mismatch",
      "valuation_as_of must not be after evaluated_at.",
    );
  }
  const parsedEstimate = nullable(record.estimate, (item) => estimate(item, "$.estimate", phase));
  const confidence = nullable(record.confidence, (item) =>
    enumValue(item, OPPORTUNITY_SIGNAL_CONFIDENCE_BANDS, "$.confidence", phase),
  ) as OpportunitySignalConfidence | null;
  const parsedLiquidity = nullable(record.liquidity, (item) =>
    enumValue(item, OPPORTUNITY_SIGNAL_LIQUIDITY_BANDS, "$.liquidity", phase),
  ) as OpportunitySignalLiquidityBand | null;
  const reasonCodes = canonicalEnumArray(
    record.reason_codes,
    OPPORTUNITY_SIGNAL_REASON_CODES,
    "$.reason_codes",
    phase,
  ) as readonly OpportunitySignalReasonCode[];
  const riskCodes = canonicalEnumArray(
    record.risk_codes,
    OPPORTUNITY_SIGNAL_RISK_CODES,
    "$.risk_codes",
    phase,
  ) as readonly OpportunitySignalRiskCode[];
  validateOutputClassificationShape(
    classification,
    parsedEstimate,
    reasonCodes,
    phase,
    "$",
  );
  if (reasonCodes.includes("rights_not_eligible")) {
    if (
      valuationAsOf !== null ||
      confidence !== null ||
      parsedLiquidity !== null
    ) {
      fail(
        phase,
        "$",
        "unsafe_claim",
        "Rights-denied output must not disclose valuation metadata.",
      );
    }
    if (
      riskCodes.length !==
        OPPORTUNITY_SIGNAL_INHERENT_UNAVAILABLE_RISKS.length ||
      !OPPORTUNITY_SIGNAL_INHERENT_UNAVAILABLE_RISKS.every(
        (risk, index) => riskCodes[index] === risk,
      )
    ) {
      fail(
        phase,
        "$.risk_codes",
        "unsafe_claim",
        "Rights-denied output may contain only inherent unavailable risks.",
      );
    }
  }
  if (classification !== "unavailable") {
    if (
      candidateRef === null ||
      parsedSku === null ||
      expiresAt === null ||
      valuationAsOf === null ||
      confidence === null ||
      parsedLiquidity === null
    ) {
      fail(
        phase,
        "$",
        "required",
        "A qualified provider decision requires bound identity, evidence, confidence, liquidity, and expiry fields.",
      );
    }
  }
  if (classification === "potential_deal" && confidence === "low") {
    fail(
      phase,
      "$.confidence",
      "unsafe_claim",
      "Low evidence confidence cannot support potential_deal.",
    );
  }
  return Object.freeze({
    schema: literal(record.schema, OPPORTUNITY_SIGNAL_SCHEMA, "$.schema", phase),
    candidate_ref: candidateRef,
    sku: parsedSku,
    classification,
    evaluated_at: evaluatedAt,
    expires_at: expiresAt,
    valuation_as_of: valuationAsOf,
    estimate: parsedEstimate,
    confidence,
    liquidity: parsedLiquidity,
    reason_codes: reasonCodes,
    risk_codes: riskCodes,
    claim_scope: literal(record.claim_scope, OPPORTUNITY_SIGNAL_CLAIM_SCOPE, "$.claim_scope", phase),
    does_not_include: exactDoesNotInclude(record.does_not_include, "$.does_not_include", phase),
  });
}

/** Safe utility for callers that need to classify a thrown contract error. */
export function isOpportunitySignalContractError(
  error: unknown,
): error is OpportunitySignalContractError {
  return error instanceof OpportunitySignalContractError;
}

/**
 * Returns safe issues only. Raw rejected values are deliberately absent.
 * Useful at logging boundaries that must not capture provider debug payloads.
 */
export function opportunitySignalContractIssues(
  error: OpportunitySignalContractError,
): readonly OpportunitySignalContractIssue[] {
  return error.issues;
}
