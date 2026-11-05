/**
 * Erasure and privacy requests (spec 7: shop/redact, customers/redact,
 * customers/data_request).
 *
 * - eraseMerchant (shop/redact, 48 h after an uninstall): every row of the
 *   merchant, derived from the data model as the old app's
 *   shop-data-cleanup.server.ts did (there by a `shop` column, here by
 *   `merchantId`), then the merchant row and the store's sessions, in one
 *   transaction that passes ledger_entry's append-only trigger.
 * - redactCustomer (customers/redact): blanks one customer row and closes
 *   what was still to be paid to or taken from them. The ledger's amounts
 *   stay; closing adds adjustment entries, as the merchant's "Close without
 *   sending" does (rule 12).
 * - openPrivacyRequest / buildPrivacyReport (customers/data_request): a
 *   request row the merchant sees, and a report built live from the rows the
 *   app holds about the buyer when they download it. Nothing is stored for it.
 *
 * Each throws on failure, with nothing half-done (one transaction), so the
 * route answers 500 and Shopify delivers it again.
 */
import { Prisma, type PayoutState } from "@prisma/client";
import prisma from "~/db.server";
import type { ConnectionContext } from "./merchant.server";
import { CUSTOMER_ERASED, closeWithoutSending, lockPayout } from "./payouts.server";
import { isCanonicalShop } from "./shop-domain";

/** How long a data request's report can be downloaded, from its receipt. */
export const REPORT_RETENTION_DAYS = 45;
/** When the merchant should have answered a data request, from its receipt. */
export const REPORT_DUE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
// Erasing a large merchant runs many statements; allow well beyond Prisma's
// default 5 s interactive-transaction timeout (carried).
const ERASURE_TRANSACTION = { timeout: 60_000, maxWait: 10_000 };
const PLATFORM = "shopify" as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DataModel = (typeof Prisma.dmmf.datamodel.models)[number];

const MODELS: readonly DataModel[] = Prisma.dmmf.datamodel.models;

const holdsMerchantRows = (model: DataModel) => model.fields.some((field) => field.kind === "scalar" && field.name === "merchantId");

/** The models this model's foreign keys point at (not itself). */
function pointsAt(model: DataModel): string[] {
  return model.fields
    .filter((field) => field.kind === "object" && (field.relationFromFields?.length ?? 0) > 0 && field.type !== model.name)
    .map((field) => field.type);
}

/**
 * Every model with a `merchantId` in a safe deletion order: each comes
 * before every model it points at. Unlike the old app, every foreign key
 * orders the deletion, SET NULL ones too: the keys are composite
 * ([merchant_id, x_id]), so a SET NULL would null merchant_id, which is NOT
 * NULL. The merchant row itself goes last, by the caller.
 */
export function merchantErasureOrder(): string[] {
  const scoped = MODELS.filter(holdsMerchantRows);
  const names = new Set(scoped.map((model) => model.name));
  const pointedAtBy = new Map<string, Set<string>>(scoped.map((model) => [model.name, new Set()]));
  for (const model of scoped) {
    for (const target of pointsAt(model)) {
      if (names.has(target)) pointedAtBy.get(target)!.add(model.name);
    }
  }

  const order: string[] = [];
  const done = new Set<string>();
  while (order.length < scoped.length) {
    const ready = scoped
      .map((model) => model.name)
      .filter((name) => !done.has(name) && [...pointedAtBy.get(name)!].every((by) => done.has(by)))
      .sort();
    if (ready.length === 0) throw new Error("[erasure] Foreign-key cycle between the merchant's models; cannot order the erasure");
    for (const name of ready) {
      done.add(name);
      order.push(name);
    }
  }
  return order;
}

type DeleteDelegate = { deleteMany: (args: { where: { merchantId: string } }) => Promise<{ count: number }> };

const delegateOf = (tx: Prisma.TransactionClient, model: string) =>
  (tx as unknown as Record<string, DeleteDelegate>)[model.charAt(0).toLowerCase() + model.slice(1)];

/**
 * shop/redact: erase the store's merchant: every model with a `merchantId`
 * (merchantErasureOrder), the connection among them, so a later install
 * starts afresh and imports again (spec 6.5); then the merchant row; then
 * the store's sessions. One transaction with SET LOCAL rewards.erasing =
 * 'on', the one exception ledger_entry's trigger allows. Returns the rows
 * deleted per model. A store with no connection loses only its sessions.
 */
export async function eraseMerchant(shop: string): Promise<Record<string, number>> {
  if (!isCanonicalShop(shop)) throw new Error(`Not a canonical *.myshopify.com shop domain: ${JSON.stringify(shop)}`);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL rewards.erasing = 'on'`;
    const deleted: Record<string, number> = {};
    const connection = await tx.connection.findUnique({
      where: { platform_externalAccountId: { platform: PLATFORM, externalAccountId: shop } },
      select: { merchantId: true },
    });
    if (connection) {
      const { merchantId } = connection;
      for (const model of merchantErasureOrder()) {
        deleted[model] = (await delegateOf(tx, model).deleteMany({ where: { merchantId } })).count;
      }
      deleted.Merchant = (await tx.merchant.deleteMany({ where: { id: merchantId } })).count;
    }
    deleted.Session = (await tx.session.deleteMany({ where: { shop } })).count;
    return deleted;
  }, ERASURE_TRANSACTION);
}

/**
 * The payouts an erased buyer's are closed from: nothing in them reached
 * Shopify, or can now.
 *
 * `needs_look` includes `could_not_confirm` (Ruling 38): such a credit may
 * have landed, but with the buyer's id erased nothing can read their credit
 * history, so nothing could ever settle it. It is closed as never given, and
 * the ledger may then understate cashback that did land. An `unconfirmed`
 * credit is still left to the hourly check, which refuses it for the same
 * reason and leaves the merchant to close it.
 */
const CLOSED_AT_ERASURE: readonly PayoutState[] = ["pending", "held", "needs_look"];

/**
 * customers/redact: close the buyer's `pending`, `held` and `needs_look`
 * payouts with closeWithoutSending (settled `auto`, `lastError` "Customer
 * data erased"), then blank their row (`externalCustomerId` null,
 * `redactedAt` now, the manual tier lock removed). Each closed payout gets an
 * adjustment cancelling what is left of its entry, so the ledger stays true
 * and nothing is sent or taken back for it again. The buyer's data requests
 * are deleted with them. `found` is false for a buyer never seen (or already
 * erased).
 *
 * The locks follow lockPayout's order, order by order: the order's credit
 * (then the order), then its take-backs. A credit is closed first, which nets
 * its held take-backs; a take-back still held for a credit whose send was
 * unclear is closed then too, and that credit is left to the hourly check. A
 * payout being sent is left to its sender. The customer row is blanked last:
 * changing `external_customer_id` takes the row FOR UPDATE, which the FOR
 * KEY SHARE of every ledger and payout insert's foreign-key check waits on,
 * so taken first it would deadlock with a refund or an answer holding this
 * buyer's credit (CONCURRENCY-3).
 */
export async function redactCustomer(
  conn: ConnectionContext,
  externalCustomerId: string,
  now: Date = new Date(),
): Promise<{ found: boolean }> {
  return prisma.$transaction(async (tx) => {
    const { merchantId, connectionId } = conn;
    await tx.privacyRequest.deleteMany({ where: { merchantId, connectionId, externalCustomerId } });
    const customer = await tx.customer.findUnique({
      where: { connectionId_externalCustomerId: { connectionId, externalCustomerId } },
      select: { id: true },
    });
    if (!customer) return { found: false };

    const open = await tx.payout.findMany({
      where: { merchantId, customerId: customer.id, state: { in: [...CLOSED_AT_ERASURE] } },
      select: { ledgerEntry: { select: { orderId: true } } },
    });
    const orderIds = [...new Set(open.map((p) => p.ledgerEntry.orderId).filter((id): id is string => id !== null))].sort();
    for (const orderId of orderIds) {
      const payouts = await tx.payout.findMany({
        where: { merchantId, customerId: customer.id, ledgerEntry: { orderId } },
        select: { id: true, direction: true },
      });
      const ids = (direction: "credit" | "debit") => payouts.filter((p) => p.direction === direction).map((p) => p.id).sort();
      // The credit is locked whatever its state, so the take-backs always come after it.
      for (const id of [...ids("credit"), ...ids("debit")]) {
        const payout = await lockPayout(tx, id);
        // A take-back its credit's close has netted has nothing to send already.
        if (!payout || !CLOSED_AT_ERASURE.includes(payout.state)) continue;
        await closeWithoutSending(tx, payout, { now, settledBy: "auto" });
        await tx.payout.update({ where: { id }, data: { lastError: CUSTOMER_ERASED } });
      }
    }

    await tx.customer.update({ where: { id: customer.id }, data: { externalCustomerId: null, redactedAt: now, lockedTierId: null } });
    return { found: true };
  }, ERASURE_TRANSACTION);
}

/**
 * customers/data_request: open a request, due REPORT_DUE_DAYS and
 * downloadable for REPORT_RETENTION_DAYS from `now` (its receipt). A request
 * Shopify delivers again (same Shopify request id) opens no second one.
 * `ordersRequested` holds the order ids Shopify named, as orders store them.
 */
export async function openPrivacyRequest(
  conn: ConnectionContext,
  i: { externalCustomerId: string | null; shopifyRequestId: string | null; ordersRequested: string[]; now?: Date },
): Promise<{ id: string }> {
  const now = i.now ?? new Date();
  const data = {
    merchantId: conn.merchantId,
    connectionId: conn.connectionId,
    externalCustomerId: i.externalCustomerId,
    shopifyRequestId: i.shopifyRequestId,
    ordersRequested: i.ordersRequested,
    status: "open" as const,
    receivedAt: now,
    dueAt: new Date(now.getTime() + REPORT_DUE_DAYS * DAY_MS),
    expiresAt: new Date(now.getTime() + REPORT_RETENTION_DAYS * DAY_MS),
  };
  if (i.shopifyRequestId === null) return prisma.privacyRequest.create({ data, select: { id: true } });
  // ON CONFLICT (connection_id, shopify_request_id) DO NOTHING.
  await prisma.privacyRequest.createMany({ data: [data], skipDuplicates: true });
  return prisma.privacyRequest.findUniqueOrThrow({
    where: { connectionId_shopifyRequestId: { connectionId: conn.connectionId, shopifyRequestId: i.shopifyRequestId } },
    select: { id: true },
  });
}

/**
 * The report of a data request, built now from what the app holds about the
 * buyer: their customer row, their orders (with refunds), ledger entries and
 * payouts. No names or emails are held, so none are in it. Null for a
 * request that isn't this merchant's, or past its expiry. The first download
 * is recorded (`downloadedAt`, status `downloaded`).
 */
export async function buildPrivacyReport(
  merchantId: string,
  privacyRequestId: string,
  now: Date = new Date(),
): Promise<{ filename: string; json: string } | null> {
  if (!UUID.test(merchantId) || !UUID.test(privacyRequestId)) return null;
  const request = await prisma.privacyRequest.findFirst({ where: { id: privacyRequestId, merchantId } });
  if (!request || request.status === "expired" || request.expiresAt <= now) return null;

  const customer =
    request.externalCustomerId === null
      ? null
      : await prisma.customer.findUnique({
          where: { connectionId_externalCustomerId: { connectionId: request.connectionId, externalCustomerId: request.externalCustomerId } },
        });
  const ofCustomer = customer ? { merchantId, customerId: customer.id } : null;
  const [orders, ledgerEntries, payouts] = ofCustomer
    ? await Promise.all([
        prisma.order.findMany({ where: ofCustomer, include: { refunds: true }, orderBy: { orderedAt: "asc" } }),
        prisma.ledgerEntry.findMany({ where: ofCustomer, orderBy: { createdAt: "asc" } }),
        prisma.payout.findMany({ where: ofCustomer, orderBy: { createdAt: "asc" } }),
      ])
    : [[], [], []];

  const report = {
    request: {
      id: request.id,
      shopifyRequestId: request.shopifyRequestId,
      receivedAt: request.receivedAt,
      ordersRequested: request.ordersRequested,
    },
    customerFound: customer !== null,
    customer,
    orders,
    ledgerEntries,
    payouts,
  };
  await prisma.privacyRequest.updateMany({ where: { id: request.id, downloadedAt: null }, data: { downloadedAt: now, status: "downloaded" } });
  const name = request.shopifyRequestId !== null && /^\d+$/.test(request.shopifyRequestId) ? request.shopifyRequestId : request.id;
  return { filename: `customer-data-request-${name}.json`, json: JSON.stringify(report, null, 2) };
}
