/**
 * Recording a paid order, and the cashback it earns (spec 6.3 rules 1–6).
 *
 * One transaction writes the buyer, the order and, when the order earns, its
 * cashback ledger entry and the pending credit payout that moves it. The
 * order's natural key (connection, Shopify order id) is its idempotency: a
 * redelivered or racing `orders/paid`, or the sweep finding an order the
 * webhook already recorded, writes nothing and answers `already_recorded`.
 *
 * Every order with a buyer is recorded, earning or not, because tier spend
 * counts recorded orders (rule 10); `noCashbackReason` says why one earned
 * nothing. Guest orders have no one to pay and are not recorded.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { Decimal } from "decimal.js";
import prisma from "~/db.server";
import type { ConnectionContext } from "./merchant.server";
import { ISSUE_IN, cashbackFor, fromDb } from "./money";
import { type OrderFacts, cashbackBase } from "./order-facts";

export type NoCashbackReason = "import" | "before_install" | "test" | "cancelled" | "off" | "no_tier" | "nothing_to_pay_on";

export type RecordOrderResult =
  | { status: "no_customer" }
  | { status: "already_recorded"; orderId: string; customerId: string }
  | { status: "recorded"; orderId: string; customerId: string; payoutId: string | null; noCashback: NoCashbackReason | null };

/** Thrown inside the transaction to roll back a delivery that lost to an earlier one. */
class AlreadyRecorded extends Error {
  constructor(readonly result: { status: "already_recorded"; orderId: string; customerId: string }) {
    super("order already recorded");
  }
}

type TierRate = { id: string; name: string; cashbackPercent: Prisma.Decimal };

/**
 * Why an order earns nothing, before any amount is worked out, in the brief's
 * order: import, before install, test, cancelled, off, no tiers.
 *
 * "Before install" is the import's boundary (Decision 21), and also the last
 * time the app was away: an order created in [uninstalledAt, activatedAt)
 * fell while the store had no app (Ruling 13).
 */
function reasonBeforeAmounts(
  conn: ConnectionContext,
  facts: OrderFacts,
  source: "live" | "import",
  running: boolean,
  hasTiers: boolean,
): NoCashbackReason | null {
  if (source === "import") return "import";
  if (facts.orderedAt < conn.installedAt) return "before_install";
  if (conn.uninstalledAt !== null && facts.orderedAt >= conn.uninstalledAt && facts.orderedAt < conn.activatedAt) {
    return "before_install";
  }
  if (facts.test) return "test";
  if (facts.cancelledAt !== null) return "cancelled";
  if (!running) return "off";
  if (!hasTiers) return "no_tier";
  return null;
}

/**
 * Record one paid order. `db` is the client to run on (tests pass a second
 * one to race two deliveries).
 *
 * The rate is the buyer's tier held before this order's spend counts
 * (rule 2): a buyer new to the store, or with no tier yet, is placed in the
 * lowest tier first; a locked tier's rate wins over the stored one. The base
 * is the full `cashbackBase(facts)` even when Shopify already shows refunds:
 * those are applied after, as refunds before payout (Ruling 24, A10), so
 * `facts.refunds` is not written here.
 */
export async function recordOrder(
  conn: ConnectionContext,
  facts: OrderFacts,
  source: "live" | "import",
  db: PrismaClient = prisma,
): Promise<RecordOrderResult> {
  if (facts.externalCustomerId === null) return { status: "no_customer" };
  const externalCustomerId = facts.externalCustomerId;
  const { merchantId, connectionId } = conn;
  const now = new Date();
  const base = cashbackBase(facts);

  try {
    return await db.$transaction(async (tx) => {
      // The switch as it is now, not as the caller read it (rule 6: off means
      // no new cashback from the moment it is off).
      const { running } = await tx.merchant.findUniqueOrThrow({ where: { id: merchantId }, select: { running: true } });
      // Lowest first: the smallest minimum spend, as qualify (A12) reads it.
      const tiers: TierRate[] = await tx.tier.findMany({
        where: { merchantId },
        orderBy: [{ minSpend: "asc" }, { position: "asc" }, { id: "asc" }],
        select: { id: true, name: true, cashbackPercent: true },
      });
      const lowest = tiers[0] ?? null;

      // ON CONFLICT DO NOTHING: of two deliveries for a new buyer, the second
      // waits for the first's insert to commit, then inserts nothing.
      await tx.customer.createMany({
        data: [
          {
            merchantId,
            connectionId,
            externalCustomerId,
            tierId: lowest?.id ?? null,
            tierSince: lowest ? now : null,
          },
        ],
        skipDuplicates: true,
      });
      let customer = await tx.customer.findUniqueOrThrow({
        where: { connectionId_externalCustomerId: { connectionId, externalCustomerId } },
        select: { id: true, tierId: true, lockedTierId: true },
      });
      if (customer.tierId === null && lowest) {
        // A buyer known from before there were tiers. Conditional, so a
        // concurrent placement is never overwritten.
        await tx.customer.updateMany({
          where: { id: customer.id, tierId: null },
          data: { tierId: lowest.id, tierSince: now },
        });
        customer = await tx.customer.findUniqueOrThrow({
          where: { id: customer.id },
          select: { id: true, tierId: true, lockedTierId: true },
        });
      }

      const rateTier = tiers.find((t) => t.id === (customer.lockedTierId ?? customer.tierId)) ?? null;
      let noCashback = reasonBeforeAmounts(conn, facts, source, running, rateTier !== null);
      let cashback: { amount: Decimal; currency: string; shopAmount: Decimal; percent: Decimal } | null = null;
      if (noCashback === null && rateTier) {
        const percent = fromDb(rateTier.cashbackPercent);
        const currency = ISSUE_IN === "presentment" ? facts.currency : facts.shopCurrency;
        const issueBase = ISSUE_IN === "presentment" ? base.amount : base.shopAmount;
        const amount = cashbackFor(issueBase, percent, currency);
        if (amount.gt(0)) {
          cashback = { amount, currency, shopAmount: cashbackFor(base.shopAmount, percent, facts.shopCurrency), percent };
        } else {
          noCashback = "nothing_to_pay_on";
        }
      }

      // ON CONFLICT (connection_id, external_order_id) DO NOTHING: a racing
      // delivery blocks here until the first commits, then inserts nothing.
      const inserted = await tx.order.createManyAndReturn({
        data: [
          {
            merchantId,
            connectionId,
            customerId: customer.id,
            externalOrderId: facts.externalOrderId,
            name: facts.name,
            source,
            currency: facts.currency,
            totalAmount: facts.total.amount.toFixed(),
            productAmount: facts.productValue.amount.toFixed(),
            shopProductAmount: facts.productValue.shopAmount.toFixed(),
            storeCreditUsed: facts.storeCreditUsed.amount.toFixed(),
            shopStoreCreditUsed: facts.storeCreditUsed.shopAmount.toFixed(),
            giftCardUsed: facts.giftCardUsed.amount.toFixed(),
            cashbackBase: base.amount.toFixed(),
            refundedProductAmount: facts.refundedProductValue.amount.toFixed(),
            shopRefundedProductAmount: facts.refundedProductValue.shopAmount.toFixed(),
            orderedAt: facts.orderedAt,
            paidAt: facts.paidAt,
            cancelledAt: facts.cancelledAt,
            test: facts.test,
            noCashbackReason: noCashback,
          },
        ],
        skipDuplicates: true,
        select: { id: true },
      });
      if (inserted.length === 0) {
        const existing = await tx.order.findUniqueOrThrow({
          where: { connectionId_externalOrderId: { connectionId, externalOrderId: facts.externalOrderId } },
          select: { id: true, customerId: true },
        });
        // Roll back this delivery's buyer writes too: a repeat writes nothing.
        throw new AlreadyRecorded({ status: "already_recorded", orderId: existing.id, customerId: existing.customerId });
      }
      const orderId = inserted[0].id;

      if (!cashback || !rateTier) {
        return { status: "recorded", orderId, customerId: customer.id, payoutId: null, noCashback };
      }

      const entry = await tx.ledgerEntry.create({
        data: {
          merchantId,
          connectionId,
          customerId: customer.id,
          orderId,
          kind: "cashback",
          amount: cashback.amount.toFixed(),
          currency: cashback.currency,
          shopAmount: cashback.shopAmount.toFixed(),
          tierName: rateTier.name,
          ratePercent: cashback.percent.toFixed(),
          idempotencyKey: `cashback:${orderId}`,
        },
        select: { id: true },
      });
      const payout = await tx.payout.create({
        data: {
          merchantId,
          ledgerEntryId: entry.id,
          customerId: customer.id,
          rail: "shopify_store_credit",
          direction: "credit",
          amount: cashback.amount.toFixed(),
          currency: cashback.currency,
          state: "pending",
          nextAttemptAt: now,
        },
        select: { id: true },
      });
      return { status: "recorded", orderId, customerId: customer.id, payoutId: payout.id, noCashback: null };
    });
  } catch (error) {
    if (error instanceof AlreadyRecorded) return error.result;
    throw error;
  }
}
