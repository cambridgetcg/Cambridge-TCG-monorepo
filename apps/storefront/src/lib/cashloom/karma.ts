import { canonicalJson, sha256Id } from "./canonical";

/**
 * Cambridge's first KARMA adapter is an explainable dry run over local
 * observations. It deliberately cannot change the account, trade, escrow, or
 * payment. The proposed response lets us test policy quality; the effective
 * response stays `observe` until a later, separately reviewed release gives a
 * specific reversible boundary authority to do more.
 */

export const CASHLOOM_KARMA_POLICY_SCHEMA = "cashloom.karma-policy/v1" as const;
export const CASHLOOM_KARMA_DECISION_SCHEMA = "cashloom.karma-decision/v1" as const;
export const CASHLOOM_KARMA_POLICY_ID =
  "cambridgetcg.cashloom-observe-only/1" as const;

export type CashloomKarmaPurpose =
  | "account.cashloom-profile"
  | "market.cashloom-handoff";
export type CashloomKarmaSeverity = "low" | "medium" | "high" | "critical";
export type CashloomKarmaResponse = "observe" | "friction" | "isolate" | "deny";
export type CashloomKarmaState =
  | "evaluated"
  | "evidence-invalid"
  | "evidence-unavailable";

export interface CashloomKarmaSignalInput {
  readonly signal_type: unknown;
  readonly severity: unknown;
  readonly observed_at: unknown;
}

export interface CashloomKarmaFinding {
  readonly namespace: "cambridgetcg.fraud-signal-catalog/v1";
  readonly signal_type: string;
  readonly severity: CashloomKarmaSeverity;
  readonly observed_at: string;
  readonly proposed_response: CashloomKarmaResponse;
  readonly explanation: string;
}

export interface CashloomKarmaDecision {
  readonly schema: typeof CASHLOOM_KARMA_DECISION_SCHEMA;
  readonly policy: {
    readonly schema: typeof CASHLOOM_KARMA_POLICY_SCHEMA;
    readonly policy_id: typeof CASHLOOM_KARMA_POLICY_ID;
    readonly policy_hash: string;
    readonly mode: "observe-only";
    readonly evidence_scope: "current-account-unresolved-advisory";
    readonly activation: "preview-only-never-enforce";
    readonly max_evidence_records: number;
    readonly max_evidence_age_seconds: number;
    readonly invalid_evidence_response: "isolate";
    readonly effective_response: "observe";
  };
  readonly purpose: CashloomKarmaPurpose;
  /** No user id, email, wallet, IP address, or global subject identifier. */
  readonly subject_scope: "current-authenticated-participant";
  readonly state: CashloomKarmaState;
  readonly evaluated_at: string;
  /** Hash of the accepted normalized findings; null when no valid bundle exists. */
  readonly evidence_bundle_hash: string | null;
  readonly supplied_evidence_count: number;
  readonly evidence_count: number;
  readonly ignored_evidence_count: number;
  readonly proposed_response: CashloomKarmaResponse;
  readonly effective_response: "observe";
  readonly findings: readonly CashloomKarmaFinding[];
  readonly notices: readonly string[];
  readonly effects: {
    readonly changes_account_state: false;
    readonly changes_trade_state: false;
    readonly changes_escrow_state: false;
    readonly moves_or_holds_money: false;
    readonly contacts_or_attacks_external_systems: false;
    readonly publishes_identity_or_reputation: false;
  };
}

const MAX_EVIDENCE = 64;
const MAX_EVIDENCE_AGE_SECONDS = 90 * 24 * 60 * 60;
const SIGNAL_TYPE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SEVERITIES = new Set<CashloomKarmaSeverity>([
  "low",
  "medium",
  "high",
  "critical",
]);
const RESPONSE_RANK: Readonly<Record<CashloomKarmaResponse, number>> = {
  observe: 0,
  friction: 1,
  isolate: 2,
  deny: 3,
};
interface SignalPolicy {
  readonly severity: CashloomKarmaSeverity;
  readonly proposed_response: CashloomKarmaResponse;
  readonly purposes: readonly CashloomKarmaPurpose[];
}

/**
 * Closed local catalog. Database severity is checked against this policy,
 * never trusted as an action selector by itself. Trade-handoff preview omits
 * payment, auction, and trade-specific rows because the current table cannot
 * reliably bind all of them to this exact market trade.
 */
const SIGNAL_POLICY = Object.freeze({
  rapid_listing: {
    severity: "medium",
    proposed_response: "friction",
    purposes: ["account.cashloom-profile", "market.cashloom-handoff"],
  },
  self_trading: {
    severity: "high",
    proposed_response: "isolate",
    purposes: ["account.cashloom-profile", "market.cashloom-handoff"],
  },
  velocity_spike: {
    severity: "medium",
    proposed_response: "friction",
    purposes: ["account.cashloom-profile", "market.cashloom-handoff"],
  },
  new_account_high_value: {
    severity: "high",
    proposed_response: "isolate",
    purposes: ["account.cashloom-profile"],
  },
  negative_reviews: {
    severity: "medium",
    proposed_response: "friction",
    purposes: ["account.cashloom-profile", "market.cashloom-handoff"],
  },
  chargeback: {
    severity: "critical",
    proposed_response: "deny",
    purposes: ["account.cashloom-profile"],
  },
  failed_payment_burst: {
    severity: "high",
    proposed_response: "isolate",
    purposes: ["account.cashloom-profile"],
  },
  bid_sniping: {
    severity: "medium",
    proposed_response: "friction",
    purposes: ["account.cashloom-profile"],
  },
  auction_default: {
    severity: "high",
    proposed_response: "isolate",
    purposes: ["account.cashloom-profile"],
  },
  trade_payment_default: {
    severity: "high",
    proposed_response: "isolate",
    purposes: ["account.cashloom-profile"],
  },
} as const satisfies Readonly<Record<string, SignalPolicy>>);
const EXPLANATION_BY_RESPONSE: Readonly<Record<CashloomKarmaResponse, string>> = {
  observe: "Record the observation; no additional response is proposed.",
  friction:
    "Add reversible friction before any future consequential operation.",
  isolate:
    "Use an isolated path with no real assets or external egress before any future consequential operation.",
  deny:
    "Do not permit a future consequential operation until independent evidence review.",
};

const POLICY_BODY = Object.freeze({
  schema: CASHLOOM_KARMA_POLICY_SCHEMA,
  policy_id: CASHLOOM_KARMA_POLICY_ID,
  mode: "observe-only" as const,
  evidence_scope: "current-account-unresolved-advisory" as const,
  activation: "preview-only-never-enforce" as const,
  max_evidence_records: MAX_EVIDENCE,
  max_evidence_age_seconds: MAX_EVIDENCE_AGE_SECONDS,
  invalid_evidence_response: "isolate" as const,
  effective_response: "observe" as const,
  signal_policy: SIGNAL_POLICY,
});

const POLICY_HASH = sha256Id(canonicalJson(POLICY_BODY));
const EFFECTS = Object.freeze({
  changes_account_state: false as const,
  changes_trade_state: false as const,
  changes_escrow_state: false as const,
  moves_or_holds_money: false as const,
  contacts_or_attacks_external_systems: false as const,
  publishes_identity_or_reputation: false as const,
});

function canonicalTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) return null;
  return value;
}

function strongestResponse(
  left: CashloomKarmaResponse,
  right: CashloomKarmaResponse,
): CashloomKarmaResponse {
  return RESPONSE_RANK[right] > RESPONSE_RANK[left] ? right : left;
}

function decisionBase(
  purpose: CashloomKarmaPurpose,
  evaluatedAt: string,
) {
  const canonical = canonicalTimestamp(evaluatedAt);
  if (canonical === null) {
    throw new TypeError("evaluated_at must be a canonical ISO 8601 timestamp.");
  }
  return {
    schema: CASHLOOM_KARMA_DECISION_SCHEMA,
    policy: {
      schema: CASHLOOM_KARMA_POLICY_SCHEMA,
      policy_id: CASHLOOM_KARMA_POLICY_ID,
      policy_hash: POLICY_HASH,
      mode: "observe-only" as const,
      evidence_scope: "current-account-unresolved-advisory" as const,
      activation: "preview-only-never-enforce" as const,
      max_evidence_records: MAX_EVIDENCE,
      max_evidence_age_seconds: MAX_EVIDENCE_AGE_SECONDS,
      invalid_evidence_response: "isolate" as const,
      effective_response: "observe" as const,
    },
    purpose,
    subject_scope: "current-authenticated-participant" as const,
    evaluated_at: canonical,
    effective_response: "observe" as const,
    effects: EFFECTS,
  };
}

export function evaluateCashloomKarma(input: {
  readonly purpose: CashloomKarmaPurpose;
  readonly evaluated_at: string;
  readonly signals: readonly CashloomKarmaSignalInput[];
  readonly evidence_truncated?: boolean;
}): Readonly<CashloomKarmaDecision> {
  const base = decisionBase(input.purpose, input.evaluated_at);
  const evaluatedMs = Date.parse(base.evaluated_at);
  const notices: string[] = [
    "Observations are local advisory claims, not proof of identity, intent, guilt, or a complete history.",
    "The proposed response is visible for policy testing; this release always observes and performs no response.",
  ];

  if (
    !Array.isArray(input.signals)
    || input.signals.length > MAX_EVIDENCE
    || input.evidence_truncated === true
  ) {
    notices.push(
      input.evidence_truncated
        ? "The local evidence set exceeded the bounded evaluation window."
        : `Evidence must be a dense array with at most ${MAX_EVIDENCE} entries.`,
    );
    return Object.freeze({
      ...base,
      state: "evidence-invalid" as const,
      evidence_bundle_hash: null,
      supplied_evidence_count: Array.isArray(input.signals) ? input.signals.length : 0,
      evidence_count: 0,
      ignored_evidence_count: 0,
      proposed_response: "isolate" as const,
      findings: Object.freeze([]),
      notices: Object.freeze(notices),
    });
  }

  const findings: CashloomKarmaFinding[] = [];
  let ignoredStale = 0;
  let ignoredUnrecognized = 0;
  let ignoredOutOfPurpose = 0;
  let invalidEvidence = false;
  for (let index = 0; index < input.signals.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(input.signals, index)) {
      invalidEvidence = true;
      break;
    }
    const signal = input.signals[index]!;
    const observedAt = canonicalTimestamp(signal.observed_at);
    if (
      typeof signal.signal_type !== "string"
      || !SIGNAL_TYPE.test(signal.signal_type)
      || observedAt === null
      || Date.parse(observedAt) > evaluatedMs
    ) {
      invalidEvidence = true;
      break;
    }
    if (
      evaluatedMs - Date.parse(observedAt)
      > MAX_EVIDENCE_AGE_SECONDS * 1_000
    ) {
      ignoredStale += 1;
      continue;
    }
    const policy = Object.prototype.hasOwnProperty.call(
      SIGNAL_POLICY,
      signal.signal_type,
    )
      ? SIGNAL_POLICY[signal.signal_type as keyof typeof SIGNAL_POLICY]
      : null;
    if (policy === null) {
      ignoredUnrecognized += 1;
      continue;
    }
    if (!(policy.purposes as readonly CashloomKarmaPurpose[]).includes(input.purpose)) {
      ignoredOutOfPurpose += 1;
      continue;
    }
    if (
      typeof signal.severity !== "string"
      || !SEVERITIES.has(signal.severity as CashloomKarmaSeverity)
      || signal.severity !== policy.severity
    ) {
      invalidEvidence = true;
      break;
    }
    const severity = policy.severity;
    const response = policy.proposed_response;
    findings.push({
      namespace: "cambridgetcg.fraud-signal-catalog/v1",
      signal_type: signal.signal_type,
      severity,
      observed_at: observedAt,
      proposed_response: response,
      explanation: EXPLANATION_BY_RESPONSE[response],
    });
  }

  if (invalidEvidence) {
    notices.push("At least one local observation was malformed or postdated the evaluation time.");
    return Object.freeze({
      ...base,
      state: "evidence-invalid" as const,
      evidence_bundle_hash: null,
      supplied_evidence_count: input.signals.length,
      evidence_count: 0,
      ignored_evidence_count: 0,
      proposed_response: "isolate" as const,
      findings: Object.freeze([]),
      notices: Object.freeze(notices),
    });
  }

  findings.sort((left, right) =>
    left.observed_at.localeCompare(right.observed_at)
    || left.signal_type.localeCompare(right.signal_type)
    || left.severity.localeCompare(right.severity));
  if (ignoredStale > 0) {
    notices.push(
      `${ignoredStale} otherwise-valid local observation${ignoredStale === 1 ? " was" : "s were"} outside the 90-day policy window and ${ignoredStale === 1 ? "was" : "were"} not used.`,
    );
  }
  if (ignoredUnrecognized > 0) {
    notices.push(
      `${ignoredUnrecognized} observation${ignoredUnrecognized === 1 ? " used" : "s used"} an unrecognised signal type, so ${ignoredUnrecognized === 1 ? "it was" : "they were"} not used.`,
    );
  }
  if (ignoredOutOfPurpose > 0) {
    notices.push(
      `${ignoredOutOfPurpose} recognised observation${ignoredOutOfPurpose === 1 ? " was" : "s were"} outside this purpose's closed policy and ${ignoredOutOfPurpose === 1 ? "was" : "were"} not used.`,
    );
  }
  const proposedResponse = findings.reduce<CashloomKarmaResponse>(
    (current, finding) => strongestResponse(current, finding.proposed_response),
    "observe",
  );
  const evidenceBundleHash = sha256Id(canonicalJson({
    purpose: input.purpose,
    findings,
  }));

  return Object.freeze({
    ...base,
    state: "evaluated" as const,
    evidence_bundle_hash: evidenceBundleHash,
    supplied_evidence_count: input.signals.length,
    evidence_count: findings.length,
    ignored_evidence_count:
      ignoredStale + ignoredUnrecognized + ignoredOutOfPurpose,
    proposed_response: proposedResponse,
    findings: Object.freeze(findings),
    notices: Object.freeze(notices),
  });
}

export function unavailableCashloomKarmaDecision(
  purpose: CashloomKarmaPurpose,
  evaluatedAt: string,
): Readonly<CashloomKarmaDecision> {
  const base = decisionBase(purpose, evaluatedAt);
  return Object.freeze({
    ...base,
    state: "evidence-unavailable" as const,
    evidence_bundle_hash: null,
    supplied_evidence_count: 0,
    evidence_count: 0,
    ignored_evidence_count: 0,
    proposed_response: "isolate" as const,
    findings: Object.freeze([]),
    notices: Object.freeze([
      "Local evidence was unavailable, so no safety claim can be made.",
      "Observe-only mode keeps the effective response at observe and changes no account, trade, escrow, or payment state.",
    ]),
  });
}
