/**
 * Loyalty Impact aggregator — facade over the pure compute logic.
 *
 * `getLoyaltyImpactReport(shop, opts)` performs parallel Prisma reads
 * for the analysis window, builds the member cohort according to the
 * chosen definition, and returns a `LoyaltyImpactReport`.
 *
 * Read-only. Safe to call from any admin route or scheduled cron.
 */
import prisma from "~/db.server";
import { compute } from "./compute";
import type {
  CohortDefinition,
  CohortDefinitionType,
  ImpactOptions,
  LoyaltyImpactReport,
} from "./types";

const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_POINTS_RATE = 0.01; // 1 point = 1 cent

const COHORT_DESCRIPTIONS: Record<CohortDefinitionType, string> = {
  "any-loyalty-event":
    "Customers with at least one PointsLedger or StoreCreditLedger entry, ever.",
  "has-redeemed":
    "Customers with at least one negative-amount PointsLedger or StoreCreditLedger entry (i.e. has spent points or store credit).",
  "has-spent-points":
    "Customers with at least one negative-amount PointsLedger entry within the window.",
};

export async function getLoyaltyImpactReport(
  shop: string,
  opts: ImpactOptions = {}
): Promise<LoyaltyImpactReport> {
  const now = new Date();
  const windowFrom =
    opts.windowFrom ?? new Date(now.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const windowTo = opts.windowTo ?? now;
  const cohortType: CohortDefinitionType = opts.cohortDefinition ?? "any-loyalty-event";
  const pointsRate = opts.pointsRate ?? DEFAULT_POINTS_RATE;

  const range = { gte: windowFrom, lte: windowTo };

  // Parallel reads. Customer cohort assignment is computed from full
  // history (not the window) for `any-loyalty-event` / `has-redeemed` —
  // those are lifetime traits, not window-specific. `has-spent-points`
  // intentionally restricts to the window.
  const [
    allCustomers,
    membersByLoyaltyEvent,
    membersByRedeemed,
    membersByWindowSpend,
    ordersInWindow,
    pointsLedgerInWindow,
    storeCreditLedgerInWindow,
    giftCardsInWindow,
    raffleWinnersDelivered,
    mysteryBoxWinnersDelivered,
  ] = await Promise.all([
    prisma.customer.findMany({ where: { shop }, select: { id: true } }),
    cohortType === "any-loyalty-event"
      ? prisma.customer.findMany({
          where: {
            shop,
            OR: [
              { pointsLedger: { some: {} } },
              { storeCreditLedger: { some: {} } },
            ],
          },
          select: { id: true },
        })
      : Promise.resolve([] as { id: string }[]),
    cohortType === "has-redeemed"
      ? prisma.customer.findMany({
          where: {
            shop,
            OR: [
              { pointsLedger: { some: { amount: { lt: 0 } } } },
              { storeCreditLedger: { some: { amount: { lt: 0 } } } },
            ],
          },
          select: { id: true },
        })
      : Promise.resolve([] as { id: string }[]),
    cohortType === "has-spent-points"
      ? prisma.customer.findMany({
          where: {
            shop,
            pointsLedger: {
              some: { amount: { lt: 0 }, createdAt: range },
            },
          },
          select: { id: true },
        })
      : Promise.resolve([] as { id: string }[]),
    prisma.order.findMany({
      where: { shop, createdAt: range },
      select: { customerId: true, netAmount: true },
    }),
    prisma.pointsLedger.findMany({
      where: { shop, createdAt: range },
      select: { amount: true },
    }),
    prisma.storeCreditLedger.findMany({
      where: { shop, createdAt: range },
      select: { amount: true },
    }),
    prisma.issuedGiftCard.findMany({
      where: { shop, createdAt: range },
      select: { totalValue: true },
    }),
    prisma.raffleWinner.count({
      where: { shop, deliveryStatus: "DELIVERED", selectedAt: range },
    }),
    prisma.mysteryBoxWinner.count({
      where: { shop, deliveryStatus: "DELIVERED", createdAt: range },
    }),
  ]);

  // Resolve which member set to use based on the cohort definition.
  const memberRows =
    cohortType === "any-loyalty-event"
      ? membersByLoyaltyEvent
      : cohortType === "has-redeemed"
      ? membersByRedeemed
      : membersByWindowSpend;

  const memberCustomerIds = new Set(memberRows.map((c) => c.id));
  const allCustomerIds = allCustomers.map((c) => c.id);

  const result = compute({
    allCustomerIds,
    memberCustomerIds,
    ordersInWindow,
    pointsLedger: pointsLedgerInWindow,
    storeCreditLedger: storeCreditLedgerInWindow,
    giftCardsIssued: giftCardsInWindow,
    raffleWinnersDelivered: { count: raffleWinnersDelivered },
    mysteryBoxWinnersDelivered: { count: mysteryBoxWinnersDelivered },
    options: { pointsRate },
  });

  const cohortDefinition: CohortDefinition = {
    type: cohortType,
    description: COHORT_DESCRIPTIONS[cohortType],
  };

  return {
    shop,
    windowFrom,
    windowTo,
    generatedAt: now,
    cohortDefinition,
    cohorts: result.cohorts,
    revenue: result.revenue,
    programCost: result.programCost,
    estimatedImpact: result.estimatedImpact,
  };
}
