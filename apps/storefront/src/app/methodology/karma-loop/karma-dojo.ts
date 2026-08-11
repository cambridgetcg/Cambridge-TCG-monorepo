import {
  evaluateCashloomKarma,
  type CashloomKarmaDecision,
} from "@/lib/cashloom/karma";

export const KARMA_DOJO_EVALUATED_AT = "2026-08-01T10:00:00.000Z" as const;

type KarmaEvaluationInput = Parameters<typeof evaluateCashloomKarma>[0];

export interface KarmaDojoScenario {
  readonly id:
    | "quiet-lane"
    | "listing-burst"
    | "linked-counterparty-claim"
    | "processor-dispute-claim"
    | "unknown-critical-claim"
    | "wrong-purpose-claim"
    | "severity-mismatch"
    | "truncated-feed";
  readonly label: string;
  readonly summary: string;
  readonly input: KarmaEvaluationInput;
}

const scenario = (
  value: KarmaDojoScenario,
): Readonly<KarmaDojoScenario> => Object.freeze(value);

/**
 * Fixed synthetic fixtures: no account, trade, database, network coordinate,
 * or ambient clock enters the Dojo. The explicit evaluation time keeps the
 * examples stable instead of silently aging with the visitor's device clock.
 */
export const KARMA_DOJO_SCENARIOS = Object.freeze([
  scenario({
    id: "quiet-lane",
    label: "Quiet lane",
    summary: "No observations are supplied.",
    input: {
      purpose: "market.cashloom-handoff",
      evaluated_at: KARMA_DOJO_EVALUATED_AT,
      signals: [],
    },
  }),
  scenario({
    id: "listing-burst",
    label: "Listing burst",
    summary: "A catalogued medium-severity listing-rate claim is replayed.",
    input: {
      purpose: "market.cashloom-handoff",
      evaluated_at: KARMA_DOJO_EVALUATED_AT,
      signals: [{
        signal_type: "rapid_listing",
        severity: "medium",
        observed_at: "2026-07-31T09:00:00.000Z",
      }],
    },
  }),
  scenario({
    id: "linked-counterparty-claim",
    label: "Linked-counterparty claim",
    summary: "A catalogued high-severity self-trading claim is replayed.",
    input: {
      purpose: "market.cashloom-handoff",
      evaluated_at: KARMA_DOJO_EVALUATED_AT,
      signals: [{
        signal_type: "self_trading",
        severity: "high",
        observed_at: "2026-07-31T09:00:00.000Z",
      }],
    },
  }),
  scenario({
    id: "processor-dispute-claim",
    label: "Processor dispute claim",
    summary: "A catalogued critical chargeback claim is replayed for account review.",
    input: {
      purpose: "account.cashloom-profile",
      evaluated_at: KARMA_DOJO_EVALUATED_AT,
      signals: [{
        signal_type: "chargeback",
        severity: "critical",
        observed_at: "2026-07-31T09:00:00.000Z",
      }],
    },
  }),
  scenario({
    id: "unknown-critical-claim",
    label: "Unknown critical claim",
    summary: "An unrecognised label tries to borrow critical severity.",
    input: {
      purpose: "market.cashloom-handoff",
      evaluated_at: KARMA_DOJO_EVALUATED_AT,
      signals: [{
        signal_type: "attacker_supplied_future_policy",
        severity: "critical",
        observed_at: "2026-07-31T09:00:00.000Z",
      }],
    },
  }),
  scenario({
    id: "wrong-purpose-claim",
    label: "Wrong-purpose claim",
    summary: "An account-level chargeback claim is supplied to a market-trade purpose.",
    input: {
      purpose: "market.cashloom-handoff",
      evaluated_at: KARMA_DOJO_EVALUATED_AT,
      signals: [{
        signal_type: "chargeback",
        severity: "critical",
        observed_at: "2026-07-31T09:00:00.000Z",
      }],
    },
  }),
  scenario({
    id: "severity-mismatch",
    label: "Severity mismatch",
    summary: "A known medium signal arrives with a forged critical label.",
    input: {
      purpose: "market.cashloom-handoff",
      evaluated_at: KARMA_DOJO_EVALUATED_AT,
      signals: [{
        signal_type: "rapid_listing",
        severity: "critical",
        observed_at: "2026-07-31T09:00:00.000Z",
      }],
    },
  }),
  scenario({
    id: "truncated-feed",
    label: "Truncated feed",
    summary: "The adapter is told the bounded evidence window was incomplete.",
    input: {
      purpose: "market.cashloom-handoff",
      evaluated_at: KARMA_DOJO_EVALUATED_AT,
      evidence_truncated: true,
      signals: [],
    },
  }),
] as const);

export type KarmaDojoScenarioId = (typeof KARMA_DOJO_SCENARIOS)[number]["id"];

export interface KarmaDojoReplay {
  readonly scenario: Readonly<KarmaDojoScenario>;
  readonly decision: Readonly<CashloomKarmaDecision>;
}

export function replayKarmaDojoScenario(
  id: KarmaDojoScenarioId,
): Readonly<KarmaDojoReplay> {
  const selected = KARMA_DOJO_SCENARIOS.find((entry) => entry.id === id);
  if (selected === undefined) {
    throw new TypeError("Unknown fixed KARMA Dojo scenario.");
  }
  return Object.freeze({
    scenario: selected,
    decision: evaluateCashloomKarma(selected.input),
  });
}
