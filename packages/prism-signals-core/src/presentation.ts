import {
  OPPORTUNITY_SIGNAL_DOES_NOT_INCLUDE,
  OPPORTUNITY_SIGNAL_SCHEMA,
  parseOpportunitySignalV1,
  type OpportunitySignalClassification,
  type OpportunitySignalConfidence,
  type OpportunitySignalLiquidityBand,
  type OpportunitySignalMarginBand,
  type OpportunitySignalRiskCode,
  type OpportunitySignalSpreadBand,
  type OpportunitySignalV1,
} from "@cambridge-tcg/opportunity-signal";

/**
 * Public presentation vocabulary for PRISM Signals.
 *
 * The synthetic signal below is an exact, strictly parsed public
 * OpportunitySignalV1. It contains no input evidence, source row, exact
 * economics, provider request, score, threshold, or model/debug field. Web
 * and Telegram hosts project from this same frozen value.
 */

export const PRISM_SIGNALS_BRAND = Object.freeze({
  maker: "Cambridge TCG",
  name: "PRISM Signals",
  byline: "by Cambridge TCG",
  tagline: "Potential deals, with the risks attached.",
});

export const PRISM_SIGNALS_PREVIEW_NOTICE =
  "Synthetic preview · no live market data · no payment" as const;

export const PRISM_SIGNALS_PUBLIC_ORIGIN =
  "https://cambridgetcg.com" as const;

function publicLink<const Path extends string>(origin: string, path: Path) {
  return Object.freeze({
    path,
    url: `${origin}${path}`,
  });
}

/**
 * Builds the canonical relative paths and host-specific absolute links.
 *
 * An origin is transport configuration, not a general base URL: only a bare
 * HTTPS origin is admitted. This prevents credentials, query state, fragments,
 * or path prefixes from silently changing Telegram and methodology links.
 */
export function createPrismSignalsLinks(origin: string) {
  if (
    typeof origin !== "string" ||
    origin !== origin.trim() ||
    !/^https:\/\/[^\s/?#@\\]+\/?$/.test(origin)
  ) {
    throw new TypeError(
      "PRISM Signals origin must be a bare HTTPS origin without credentials, query, fragment, or path.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new TypeError("PRISM Signals origin must be a valid HTTPS origin.");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new TypeError(
      "PRISM Signals origin must be a bare HTTPS origin without credentials, query, fragment, or path.",
    );
  }

  const canonicalOrigin = parsed.origin;
  return Object.freeze({
    product: publicLink(canonicalOrigin, "/prism-signals"),
    terms: publicLink(canonicalOrigin, "/prism-signals/terms"),
    support: publicLink(canonicalOrigin, "/contact"),
    privacy: publicLink(canonicalOrigin, "/privacy#prism-signals-telegram"),
    methodology: publicLink(canonicalOrigin, "/methodology/prism-signals"),
    signalMethodology: publicLink(
      canonicalOrigin,
      "/methodology/opportunity-signals",
    ),
    offer: publicLink(canonicalOrigin, "/api/prism-signals/offer"),
  });
}

export type PrismSignalsLinks = ReturnType<typeof createPrismSignalsLinks>;

/** Default catalog paths and absolute links for the current public host. */
export const PRISM_SIGNALS_LINKS = createPrismSignalsLinks(
  PRISM_SIGNALS_PUBLIC_ORIGIN,
);

export const PRISM_TELEGRAM_PREVIEW_START = "demo_prism_v1" as const;

/** `/start` is admitted separately and only with the exact preview parameter. */
export const PRISM_SIGNALS_TELEGRAM_COMMANDS = Object.freeze([
  "/demo",
  "/terms",
  "/privacy",
  "/support",
  "/paysupport",
] as const);

/**
 * Deliberately authored at the public output seam, then strictly validated and
 * deeply frozen by `@cambridge-tcg/opportunity-signal`.
 */
export const PRISM_SIGNALS_SYNTHETIC_SIGNAL: OpportunitySignalV1 =
  parseOpportunitySignalV1({
    schema: OPPORTUNITY_SIGNAL_SCHEMA,
    candidate_ref: "ctcg_cand_0123456789ABCDEFGHIJKL",
    sku: "synthetic-prism-preview-001",
    classification: "potential_deal",
    evaluated_at: "2026-09-01T12:00:00.000Z",
    expires_at: "2026-09-01T12:00:45.000Z",
    valuation_as_of: "2026-09-01T11:55:00.000Z",
    estimate: {
      currency: "GBP",
      conservative_net_transaction_spread_band: "500_to_1499_minor",
      conservative_margin_band: "2500_to_4999_bps",
    },
    confidence: "medium",
    liquidity: "unknown",
    reason_codes: ["private_policy_threshold_met"],
    risk_codes: [
      "estimated_costs",
      "liquidity_unknown",
      "availability_not_reserved",
      "condition_unverified",
      "authenticity_unverified",
    ],
    claim_scope: "decision_support_estimate",
    does_not_include: OPPORTUNITY_SIGNAL_DOES_NOT_INCLUDE,
  });

const CLASSIFICATION_LABELS = {
  potential_deal: "Potential deal",
  not_qualified: "Not qualified",
  unavailable: "Unavailable",
} as const satisfies Record<OpportunitySignalClassification, string>;

const CLASSIFICATION_NOTES = {
  potential_deal:
    "A private policy flagged this public result for human inspection. It is not an instruction to buy.",
  not_qualified:
    "The candidate did not meet the private policy. That is not a statement about future performance.",
  unavailable:
    "The public contract could not provide a qualified decision. No action should be inferred.",
} as const satisfies Record<OpportunitySignalClassification, string>;

const SPREAD_LABELS = {
  positive_under_500_minor: "Positive, under £5.00 band",
  "500_to_1499_minor": "£5.00–£14.99 band",
  "1500_to_4999_minor": "£15.00–£49.99 band",
  "5000_plus_minor": "£50.00+ band",
} as const satisfies Record<OpportunitySignalSpreadBand, string>;

const MARGIN_LABELS = {
  positive_under_1000_bps: "Positive, under 10.00% band",
  "1000_to_2499_bps": "10.00%–24.99% band",
  "2500_to_4999_bps": "25.00%–49.99% band",
  "5000_plus_bps": "50.00%+ band",
} as const satisfies Record<OpportunitySignalMarginBand, string>;

const CONFIDENCE_LABELS = {
  low: "Low evidence quality",
  medium: "Medium evidence quality",
  high: "High evidence quality",
} as const satisfies Record<OpportunitySignalConfidence, string>;

const LIQUIDITY_LABELS = {
  unknown: "Unknown",
  low: "Low",
  medium: "Medium",
  high: "High",
} as const satisfies Record<OpportunitySignalLiquidityBand, string>;

export const PRISM_SIGNALS_RISK_LABELS = Object.freeze({
  aggregate_not_trade_tape: "Reference aggregate is not a trade tape",
  short_history: "Price history is short",
  sparse_history: "Price history is sparse",
  interpolated_input: "Some evidence may be interpolated",
  estimated_costs: "Some costs may be estimated",
  estimated_fx: "Currency conversion may be estimated",
  liquidity_unknown: "Liquidity is unknown",
  liquidity_low: "Liquidity may be low",
  availability_not_reserved: "Availability is not reserved",
  condition_unverified: "Condition is not verified",
  authenticity_unverified: "Authenticity is not verified",
} as const satisfies Record<OpportunitySignalRiskCode, string>);

const NON_CLAIM_LABELS = Object.freeze({
  executable_exit_quote: "No executable exit quote",
  listing_reservation: "No listing reservation",
  profit_guarantee: "No profit guarantee",
  authenticity_or_condition_verification:
    "No authenticity or condition verification",
  financial_or_tax_advice: "No financial or tax advice",
  source_rows_or_model_parameters: "No source rows or model parameters",
} as const satisfies Record<
  (typeof OPPORTUNITY_SIGNAL_DOES_NOT_INCLUDE)[number],
  string
>);

export function presentPrismOpportunitySignalV1(raw: unknown) {
  const signal = parseOpportunitySignalV1(raw);
  const estimate = signal.estimate;

  return Object.freeze({
    eyebrow: "Synthetic signal 01",
    title: "Candidate card",
    descriptor:
      signal.candidate_ref === null || signal.sku === null
        ? "Synthetic candidate · identity unavailable"
        : "One synthetic candidate · bound public projection",
    classification: CLASSIFICATION_LABELS[signal.classification],
    classificationNote: CLASSIFICATION_NOTES[signal.classification],
    bands: Object.freeze([
      Object.freeze({
        label: "Conservative net spread",
        value:
          estimate === null
            ? "Unavailable"
            : SPREAD_LABELS[
                estimate.conservative_net_transaction_spread_band
              ],
        note: "Coarse illustrative category; no exact valuation is shown.",
      }),
      Object.freeze({
        label: "Conservative margin",
        value:
          estimate === null
            ? "Unavailable"
            : MARGIN_LABELS[estimate.conservative_margin_band],
        note: "Costs are considered before the category is assigned.",
      }),
      Object.freeze({
        label: "Confidence",
        value:
          signal.confidence === null
            ? "Unavailable"
            : CONFIDENCE_LABELS[signal.confidence],
        note: "Evidence quality, not the probability of profit.",
      }),
      Object.freeze({
        label: "Liquidity",
        value:
          signal.liquidity === null
            ? "Unavailable"
            : LIQUIDITY_LABELS[signal.liquidity],
        note: "A liquidity band is separate from evidence confidence.",
      }),
      Object.freeze({
        label: "Freshness",
        value: "No live window",
        note:
          signal.expires_at === null
            ? "This fixed synthetic result has no usable contract expiry."
            : `Contract fixture expiry ${signal.expires_at}; it is never refreshed.`,
      }),
    ]),
    riskCodes: signal.risk_codes,
    risks: Object.freeze(
      signal.risk_codes.map((code) => PRISM_SIGNALS_RISK_LABELS[code]),
    ),
    nonClaimCodes: signal.does_not_include,
    nonClaims: Object.freeze(
      signal.does_not_include.map((code) => NON_CLAIM_LABELS[code]),
    ),
    boundary:
      "No card or listing URL, seller identity, source row, exact spread, or exact valuation crosses this preview.",
  });
}

export const PRISM_SIGNALS_SYNTHETIC_CARD =
  presentPrismOpportunitySignalV1(PRISM_SIGNALS_SYNTHETIC_SIGNAL);

/** Labels derived from the exact six-value public contract tuple. */
export const PRISM_SIGNALS_NON_CLAIMS =
  PRISM_SIGNALS_SYNTHETIC_CARD.nonClaims;

export const PRISM_SIGNALS_CHANNELS = Object.freeze([
  Object.freeze({
    id: "web",
    shortLabel: "WEB",
    label: "Independent web",
    headline: "The whole decision, on one page.",
    body:
      "See the coarse bands, evidence-quality label, liquidity state, risks, and non-claims together before deciding what to inspect independently.",
    steps: Object.freeze([
      "Read the potential-deal classification",
      "Open the risks before acting",
      "Verify the physical and commercial facts yourself",
    ]),
    currentStatus:
      "The public reading stays fixed. A separate fail-closed Stripe test account surface exists; no live checkout or market data is connected.",
  }),
  Object.freeze({
    id: "telegram",
    shortLabel: "TG",
    label: "Telegram channel",
    headline: "The same caution, in a compact alert.",
    body:
      "A future channel can carry a shorter version of the same bounded signal. It must not drop the confidence meaning, unknown liquidity, or inherent risks to save space.",
    steps: Object.freeze([
      "Receive a compact signal summary",
      "Read the attached risk block",
      "Return to the branded web page for full context",
    ]),
    currentStatus:
      "A fail-closed test webhook exists; no bot registration, durable update ledger, entitlement, or outbound delivery is connected.",
  }),
]);

export const PRISM_SIGNALS_FUTURE_RAILS = Object.freeze([
  Object.freeze({
    channel: "Independent web purchase",
    rail: "Stripe",
    status: "Test-only / configuration-gated",
    rule:
      "The separate All sandbox accepts test mode only and reaches the fixed synthetic fixture. Live Stripe remains off until the rights, production offer, tax, terms, entitlement, and private-delivery gates exist.",
  }),
  Object.freeze({
    channel: "Purchase inside Telegram",
    rail: "Telegram Stars",
    status: "Off in this preview",
    rule:
      "A future digital-goods purchase initiated and fulfilled inside Telegram is intended to use Telegram Stars, subject to a fresh platform-policy review before launch.",
  }),
  Object.freeze({
    channel: "Additional web rails",
    rail: "PayPal and crypto",
    status: "Later / off",
    rule:
      "These are not accepted here. Any later web-only addition needs its own settlement, refund, evidence, and operational review.",
  }),
]);
