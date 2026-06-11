/**
 * Customer journey aggregator.
 *
 * `getCustomerJourney(shop, customerId, opts)` reads every loyalty
 * event for a customer (parallel queries across 8 tables), runs them
 * through the pure `mergeTimeline` to normalize + sort, and returns a
 * `CustomerJourneyReport` ready for a support UI or CLI.
 *
 * Read-only. Never mutates state. Safe to call from any admin route.
 */
import prisma from "~/db.server";
import { mergeTimeline } from "./merge";
import type {
  CurrentState,
  CustomerJourneyReport,
  JourneyOptions,
} from "./types";

export async function getCustomerJourney(
  shop: string,
  customerId: string,
  opts: JourneyOptions = {}
): Promise<CustomerJourneyReport> {
  // 1. Customer header — single read; throws if missing.
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, shop },
    include: {
      currentTier: { select: { id: true, name: true } },
    },
  });
  if (!customer) {
    throw new Error(`Customer ${customerId} not found in shop ${shop}`);
  }

  const since = opts.since ?? customer.createdAt;
  const until = opts.until ?? new Date();

  // 2. Parallel reads across every loyalty table.
  // Each query is scoped by (shop, customerId) so cross-shop
  // observation isn't possible even with a wrong customerId.
  // Each is also bounded to the [since, until] window so a long-lived
  // customer doesn't return tens of thousands of rows by default.
  const range = { gte: since, lte: until };

  const [
    pointsLedger,
    storeCreditLedger,
    tierChanges,
    raffleEntries,
    raffleWins,
    mysteryBoxOpens,
    mysteryBoxWins,
    challenges,
    giftCardsIssued,
  ] = await Promise.all([
    prisma.pointsLedger.findMany({
      where: { shop, customerId, createdAt: range },
      orderBy: { createdAt: "asc" },
    }),
    prisma.storeCreditLedger.findMany({
      where: { shop, customerId, createdAt: range },
      orderBy: { createdAt: "asc" },
    }),
    prisma.tierChangeLog.findMany({
      // fromTierName / toTierName are denormalized on TierChangeLog
      // itself; no relation join needed. triggerType is the source-of-
      // change enum (ORDER_PAID, MANUAL_ADJUSTMENT, etc.).
      where: { shop, customerId, createdAt: range },
      orderBy: { createdAt: "asc" },
    }),
    prisma.raffleEntry.findMany({
      where: { shop, customerId, createdAt: range },
      include: { raffle: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.raffleWinner.findMany({
      where: { shop, customerId, selectedAt: range },
      include: { rafflePrize: { select: { name: true } } },
      orderBy: { selectedAt: "asc" },
    }),
    prisma.mysteryBoxOpen.findMany({
      where: { shop, customerId, createdAt: range },
      include: { box: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.mysteryBoxWinner.findMany({
      where: { shop, customerId, createdAt: range },
      include: { reward: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.challengeParticipant.findMany({
      where: {
        shop,
        customerId,
        claimedAt: { not: null, gte: since, lte: until },
      },
      include: { challenge: { select: { name: true } } },
      orderBy: { claimedAt: "asc" },
    }),
    prisma.issuedGiftCard.findMany({
      where: { shop, purchasedByCustomerId: customerId, createdAt: range },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // 3. Pure merge — produces normalized, filtered, sorted, limited timeline.
  const timeline = mergeTimeline(
    {
      pointsLedger: pointsLedger.map((r) => ({ ...r, amount: r.amount, balance: r.balance })),
      storeCreditLedger: storeCreditLedger.map((r) => ({ ...r })),
      tierChanges: tierChanges.map((r) => ({
        id: r.id,
        fromTierId: r.fromTierId,
        toTierId: r.toTierId,
        fromTierName: r.fromTierName ?? null,
        toTierName: r.toTierName ?? null,
        source: r.triggerType ?? null,
        createdAt: r.createdAt,
      })),
      raffleEntries: raffleEntries.map((r) => ({
        id: r.id,
        raffleId: r.raffleId,
        raffleName: r.raffle?.name ?? null,
        entriesCount: r.entriesCount,
        pointsSpent: r.pointsSpent,
        isWinner: r.isWinner,
        createdAt: r.createdAt,
      })),
      raffleWins: raffleWins.map((r) => ({
        id: r.id,
        raffleId: r.raffleId,
        rafflePrizeId: r.rafflePrizeId,
        prizeName: r.rafflePrize?.name ?? null,
        deliveryStatus: r.deliveryStatus,
        selectedAt: r.selectedAt,
      })),
      mysteryBoxOpens: mysteryBoxOpens.map((r) => ({
        id: r.id,
        boxId: r.boxId,
        boxName: r.box?.name ?? null,
        pointsSpent: r.pointsSpent,
        isFreeOpen: r.isFreeOpen,
        createdAt: r.createdAt,
      })),
      mysteryBoxWins: mysteryBoxWins.map((r) => ({
        id: r.id,
        openId: r.openId,
        rewardId: r.rewardId,
        rewardName: r.reward?.name ?? null,
        deliveryStatus: r.deliveryStatus,
        createdAt: r.createdAt,
      })),
      challenges: challenges.map((r) => ({
        id: r.id,
        challengeId: r.challengeId,
        challengeName: r.challenge?.name ?? null,
        status: r.status,
        claimedAt: r.claimedAt,
      })),
      giftCardsIssued: giftCardsIssued.map((r) => ({
        id: r.id,
        totalValue: r.totalValue,
        status: r.status,
        recipientEmail: r.recipientEmail,
        createdAt: r.createdAt,
      })),
    },
    opts
  );

  // 4. Current state — read from Customer row directly (already loaded).
  const currentState: CurrentState = {
    pointsBalance: Number(customer.pointsBalance ?? 0),
    lifetimePoints: Number(customer.lifetimePoints ?? 0),
    storeCredit: Number(customer.storeCredit ?? 0),
    currentTierId: customer.currentTier?.id ?? null,
    currentTierName: customer.currentTier?.name ?? null,
  };

  // 5. Compose report.
  const rangeFrom =
    timeline.length > 0 ? timeline[0].timestamp : customer.createdAt;
  const rangeTo =
    timeline.length > 0 ? timeline[timeline.length - 1].timestamp : new Date();

  return {
    customer: {
      id: customer.id,
      shop: customer.shop,
      email: customer.email ?? null,
      shopifyCustomerId: customer.shopifyCustomerId ?? null,
      createdAt: customer.createdAt,
    },
    currentState,
    timeline,
    totalEvents: timeline.length,
    rangeFrom,
    rangeTo,
  };
}
