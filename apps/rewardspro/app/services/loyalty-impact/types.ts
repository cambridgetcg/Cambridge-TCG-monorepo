/**
 * Loyalty Impact — types for the merchant-facing "is this app paying
 * for itself?" report.
 *
 * The honesty principle: we report observed cohort differences and
 * direct program costs. We do NOT claim causation. The counterfactual
 * (what members would have spent without the program) is unknowable,
 * so the `confidence` field is `low` or `medium`, never `high`, and
 * `caveat` enumerates the assumptions baked in.
 *
 * A merchant who reads this report should be able to answer:
 *   - "How much did members spend vs non-members?"
 *   - "What did the program cost me?"
 *   - "Are members spending enough more to cover program cost?"
 *
 * They should NOT come away thinking "the app caused $X in revenue."
 * Selection bias (engaged customers self-select into loyalty) is real
 * and not removable without an experiment.
 */

export type CohortDefinitionType =
  | "any-loyalty-event"     // any PointsLedger / StoreCreditLedger / etc.
  | "has-redeemed"          // has at least one negative-amount ledger entry
  | "has-spent-points";     // narrower: has a PointsLedger SPEND entry

export interface CohortMetrics {
  /** Number of unique customers in the cohort. */
  customerCount: number;
  /** Total order revenue in the window (net of refunds). */
  totalRevenue: number;
  /** Total order count in the window. */
  orderCount: number;
  /** Average order value (totalRevenue / orderCount). 0 if no orders. */
  aov: number;
  /** Average revenue per customer (totalRevenue / customerCount). 0 if no customers. */
  arpu: number;
}

export interface ProgramCost {
  /** Sum of |negative| PointsLedger amounts × shop's points-to-currency rate. */
  pointsRedeemedValue: number;
  /** Sum of positive StoreCreditLedger amounts (issued, not yet spent). */
  storeCreditIssued: number;
  /** Sum of |negative| StoreCreditLedger amounts (actually spent — this is the realized cost). */
  storeCreditRedeemed: number;
  /** Sum of IssuedGiftCard.totalValue (gift cards converted from store credit). */
  giftCardsIssued: number;
  /** Number of raffle winners delivered (no $ value computed — prizes are heterogeneous). */
  rafflePrizesAwarded: number;
  /** Number of mystery box rewards delivered. */
  mysteryBoxRewardsAwarded: number;
  /**
   * Sum of monetary cost components: pointsRedeemedValue +
   * storeCreditRedeemed + giftCardsIssued. NOT including the
   * non-monetary prize counts (those are reported separately because
   * their cost is shop-specific).
   */
  totalDirectCost: number;
}

export interface CohortRevenue {
  members: CohortMetrics;
  nonMembers: CohortMetrics;
  /** members.aov - nonMembers.aov (signed). Positive = members spend more per order. */
  aovDelta: number;
  /** Same as a percent of nonMembers.aov. NaN if nonMembers.aov is 0. */
  aovLiftPercent: number;
  /** members.arpu - nonMembers.arpu. */
  arpuDelta: number;
}

export interface EstimatedImpact {
  /** aovDelta × members.orderCount — naive AOV-lift × order volume. */
  aovLiftRevenue: number;
  /** aovLiftRevenue - programCost.totalDirectCost. */
  netImpact: number;
  /** Always `low` or `medium` — never `high`. */
  confidence: "low" | "medium";
  /** Plain-language enumeration of the assumptions baked in. */
  caveat: string;
}

export interface CohortDefinition {
  type: CohortDefinitionType;
  description: string;
}

export interface LoyaltyImpactReport {
  shop: string;
  windowFrom: Date;
  windowTo: Date;
  generatedAt: Date;

  cohortDefinition: CohortDefinition;
  cohorts: {
    members: number;
    nonMembers: number;
    totalCustomers: number;
  };

  revenue: CohortRevenue;
  programCost: ProgramCost;
  estimatedImpact: EstimatedImpact;
}

export interface ImpactOptions {
  /** Inclusive lower bound on the analysis window. Default: 30 days ago. */
  windowFrom?: Date;
  /** Inclusive upper bound. Default: now. */
  windowTo?: Date;
  /** Cohort definition. Default: `"any-loyalty-event"`. */
  cohortDefinition?: CohortDefinitionType;
  /**
   * Shop's points-to-currency exchange rate (1 point = $X). Used to
   * value PointsLedger redemptions in dollars. Default: 0.01 (i.e.,
   * 1 point = 1 cent), matching the most common Shopify-loyalty
   * configuration.
   */
  pointsRate?: number;
}
