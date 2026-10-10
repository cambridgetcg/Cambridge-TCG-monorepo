import { OPPORTUNITY_SIGNAL_CURRENCY } from "./constants";
import type {
  OpportunitySignalEstimateV1,
  OpportunitySignalInputV1,
} from "./types";

const ACQUISITION_COSTS = [
  "buyer_fee",
  "inbound_shipping",
  "acquisition_tax_and_duty",
] as const;

const DISPOSAL_COSTS = [
  "seller_fee",
  "payment_processing",
  "outbound_shipping",
  "disposal_tax_and_duty",
] as const;

function conservativeCostHigh(
  input: OpportunitySignalInputV1,
  keys: readonly (keyof OpportunitySignalInputV1["costs"])[],
): bigint | null {
  let total = 0n;
  for (const key of keys) {
    const cost = input.costs[key];
    if (cost.state === "unknown") return null;
    if (cost.state === "known" || cost.state === "estimated") {
      total += BigInt(cost.amount_minor.high);
    }
  }
  return total;
}

function spreadBand(spreadMinor: bigint): OpportunitySignalEstimateV1["conservative_net_transaction_spread_band"] {
  if (spreadMinor < 500n) return "positive_under_500_minor";
  if (spreadMinor < 1_500n) return "500_to_1499_minor";
  if (spreadMinor < 5_000n) return "1500_to_4999_minor";
  return "5000_plus_minor";
}

function marginBand(marginBps: bigint): OpportunitySignalEstimateV1["conservative_margin_band"] {
  if (marginBps < 1_000n) return "positive_under_1000_bps";
  if (marginBps < 2_500n) return "1000_to_2499_bps";
  if (marginBps < 5_000n) return "2500_to_4999_bps";
  return "5000_plus_bps";
}

/**
 * Transparent economics floor. It subtracts every cost's HIGH bound from the
 * valuation LOW bound. The denominator is the HIGH acquisition outlay. No
 * private threshold or classification policy is present here.
 */
export function deriveOpportunitySignalEconomicsBandsV1(
  input: OpportunitySignalInputV1,
): OpportunitySignalEstimateV1 | null {
  const acquisitionCosts = conservativeCostHigh(input, ACQUISITION_COSTS);
  const disposalCosts = conservativeCostHigh(input, DISPOSAL_COSTS);
  if (acquisitionCosts === null || disposalCosts === null) return null;

  const acquisitionMinor =
    BigInt(input.candidate.asking_price_minor) + acquisitionCosts;
  const conservativeSpreadMinor =
    BigInt(input.valuation.estimated_gross_exit_minor.low) -
    acquisitionMinor -
    disposalCosts;
  if (acquisitionMinor <= 0n || conservativeSpreadMinor <= 0n) return null;

  // Positive BigInt division floors, making the disclosed band conservative.
  const conservativeMarginBps =
    (conservativeSpreadMinor * 10_000n) / acquisitionMinor;
  if (conservativeMarginBps <= 0n) return null;

  return Object.freeze({
    currency: OPPORTUNITY_SIGNAL_CURRENCY,
    conservative_net_transaction_spread_band: spreadBand(
      conservativeSpreadMinor,
    ),
    conservative_margin_band: marginBand(conservativeMarginBps),
  });
}
