/**
 * Pure compute logic for loyalty-impact reports.
 *
 * No I/O. Takes already-fetched arrays and aggregates them. The
 * facade in `report.ts` does the Prisma reads and feeds the data here.
 *
 * Tested with synthetic input — see `test/unit/services/loyalty-impact.compute.test.ts`.
 */
import type {
  CohortMetrics,
  CohortRevenue,
  EstimatedImpact,
  ProgramCost,
  ImpactOptions,
} from "./types";

/* Source-row shapes — narrowed to fields we actually use, so callers
   can pass Prisma rows directly without remapping. */

interface OrderRow {
  customerId: string;
  netAmount: number | { toNumber(): number };
}

interface PointsLedgerEntry {
  amount: number | { toNumber(): number };
}

interface StoreCreditEntry {
  amount: number | { toNumber(): number };
}

interface GiftCardRow {
  totalValue: number | { toNumber(): number };
}

interface DeliveredCount {
  count: number;
}

export interface ComputeInputs {
  /** Customer IDs for the entire shop in the window. */
  allCustomerIds: string[];
  /** Customer IDs that meet the cohort definition. */
  memberCustomerIds: Set<string>;
  /** All orders in the window (any customer). */
  ordersInWindow: OrderRow[];
  /** PointsLedger entries in the window (used for redemption value). */
  pointsLedger: PointsLedgerEntry[];
  /** StoreCreditLedger entries in the window. */
  storeCreditLedger: StoreCreditEntry[];
  /** Gift cards issued in the window. */
  giftCardsIssued: GiftCardRow[];
  /** Raffle winners delivered in the window. */
  raffleWinnersDelivered: DeliveredCount;
  /** Mystery box winners delivered in the window. */
  mysteryBoxWinnersDelivered: DeliveredCount;
  /** Resolved options (after defaults applied). */
  options: Required<Pick<ImpactOptions, "pointsRate">>;
}

export interface ComputeResult {
  cohorts: { members: number; nonMembers: number; totalCustomers: number };
  revenue: CohortRevenue;
  programCost: ProgramCost;
  estimatedImpact: EstimatedImpact;
}

export function compute(inputs: ComputeInputs): ComputeResult {
  const memberMetrics = bucketMetrics(inputs.ordersInWindow, inputs.memberCustomerIds, "members");
  const nonMemberMetrics = bucketMetrics(inputs.ordersInWindow, inputs.memberCustomerIds, "nonMembers");

  const aovDelta = memberMetrics.aov - nonMemberMetrics.aov;
  const aovLiftPercent =
    nonMemberMetrics.aov === 0 ? Number.NaN : (aovDelta / nonMemberMetrics.aov) * 100;
  const arpuDelta = memberMetrics.arpu - nonMemberMetrics.arpu;

  const programCost = computeCost(inputs);

  // Naive AOV-lift attribution: (members.aov - nonMembers.aov) × members.orderCount.
  // Honest about its limits via `confidence` + `caveat`.
  const aovLiftRevenue = Math.max(0, aovDelta) * memberMetrics.orderCount;
  const netImpact = aovLiftRevenue - programCost.totalDirectCost;

  // Confidence: `medium` when both cohorts have meaningful sample sizes
  // AND there's at least 2x program-cost-to-revenue separation in either
  // direction (the signal is dominant). `low` otherwise. Never `high`.
  const minSampleSize = 50;
  const cohortsHealthy =
    inputs.memberCustomerIds.size >= minSampleSize &&
    inputs.allCustomerIds.length - inputs.memberCustomerIds.size >= minSampleSize;
  const confidence: EstimatedImpact["confidence"] =
    cohortsHealthy && Math.abs(netImpact) > programCost.totalDirectCost ? "medium" : "low";

  return {
    cohorts: {
      members: inputs.memberCustomerIds.size,
      nonMembers: inputs.allCustomerIds.length - inputs.memberCustomerIds.size,
      totalCustomers: inputs.allCustomerIds.length,
    },
    revenue: {
      members: memberMetrics,
      nonMembers: nonMemberMetrics,
      aovDelta,
      aovLiftPercent,
      arpuDelta,
    },
    programCost,
    estimatedImpact: {
      aovLiftRevenue,
      netImpact,
      confidence,
      caveat: buildCaveat(),
    },
  };
}

function bucketMetrics(
  orders: OrderRow[],
  memberSet: Set<string>,
  bucket: "members" | "nonMembers"
): CohortMetrics {
  let totalRevenue = 0;
  let orderCount = 0;
  const customerSet = new Set<string>();

  for (const o of orders) {
    const isMember = memberSet.has(o.customerId);
    const inBucket = bucket === "members" ? isMember : !isMember;
    if (!inBucket) continue;
    totalRevenue += num(o.netAmount);
    orderCount += 1;
    customerSet.add(o.customerId);
  }

  const customerCount = customerSet.size;
  return {
    customerCount,
    totalRevenue,
    orderCount,
    aov: orderCount === 0 ? 0 : totalRevenue / orderCount,
    arpu: customerCount === 0 ? 0 : totalRevenue / customerCount,
  };
}

function computeCost(inputs: ComputeInputs): ProgramCost {
  // Points redeemed = sum of |negative amounts| × points-to-currency rate.
  let pointsRedeemed = 0;
  for (const entry of inputs.pointsLedger) {
    const amt = num(entry.amount);
    if (amt < 0) pointsRedeemed += -amt;
  }
  const pointsRedeemedValue = pointsRedeemed * inputs.options.pointsRate;

  // Store credit: issued = sum of positive; redeemed = sum of |negative|.
  // The "real cost" is what's been redeemed; what's been issued is a
  // future obligation, reported separately so the merchant sees both.
  let storeCreditIssued = 0;
  let storeCreditRedeemed = 0;
  for (const entry of inputs.storeCreditLedger) {
    const amt = num(entry.amount);
    if (amt > 0) storeCreditIssued += amt;
    else storeCreditRedeemed += -amt;
  }

  let giftCardsIssued = 0;
  for (const card of inputs.giftCardsIssued) {
    giftCardsIssued += num(card.totalValue);
  }

  return {
    pointsRedeemedValue,
    storeCreditIssued,
    storeCreditRedeemed,
    giftCardsIssued,
    rafflePrizesAwarded: inputs.raffleWinnersDelivered.count,
    mysteryBoxRewardsAwarded: inputs.mysteryBoxWinnersDelivered.count,
    totalDirectCost: pointsRedeemedValue + storeCreditRedeemed + giftCardsIssued,
  };
}

function buildCaveat(): string {
  return [
    "AOV-lift attribution is naive: it multiplies the observed delta",
    "by member order volume. It does NOT control for selection bias",
    "(already-engaged customers self-select into loyalty), so the",
    "estimate over-attributes lift to the program. For a defensible",
    "ROI number, run an experiment with random assignment.",
    "Program cost includes points-redeemed value (at shop's pointsRate),",
    "store-credit-redeemed (not issued), and gift-cards issued. Raffle",
    "and mystery-box prizes are reported as counts only — their dollar",
    "value is shop-specific and not aggregated here.",
  ].join(" ");
}

function num(v: number | { toNumber(): number }): number {
  return typeof v === "number" ? v : v.toNumber();
}
