/**
 * customers/data_request reports (GDPR Art. 15).
 *
 * Shopify sends the request; the app owes the merchant a copy of everything
 * it holds about the shopper. The report is built from the data model, the
 * same way erasure finds a shopper's rows (collectCustomerData in
 * services/shop-data-cleanup.server.ts), stored encrypted, and offered to the
 * merchant at Settings > Privacy requests (routes/app.settings.privacy.tsx).
 * Reports are deleted REPORT_RETENTION_DAYS after they are made, when the
 * shopper is redacted, and with the shop's data.
 */

import prisma from "~/db.server";
import { decrypt, encrypt } from "~/utils/encryption";
import { collectCustomerData } from "./shop-data-cleanup.server";

/** Long enough for the merchant to answer the shopper (30 days) and download it. */
export const REPORT_RETENTION_DAYS = 45;

export interface DataRequestInput {
  shopifyRequestId: string;
  shopifyCustomerId: string;
  email?: string | null;
  ordersRequested?: number[];
}

/** JSON for stored values: Decimal and Date serialise themselves; BigInt does not. */
function reportJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v), 2);
}

/**
 * Build and store the report for one data request. Idempotent per request:
 * a redelivered webhook replaces the earlier report. Returns counts only.
 */
export async function storeCustomerDataReport(
  shop: string,
  request: DataRequestInput,
): Promise<{ id: string; customerFound: boolean; recordCount: number }> {
  await deleteExpiredDataRequests();

  const { customerFound, rows } = await collectCustomerData(shop, {
    shopifyCustomerId: request.shopifyCustomerId,
    email: request.email,
  });
  const recordCount = Object.values(rows).reduce((sum, list) => sum + list.length, 0);
  const now = new Date();
  const report = encrypt(
    reportJson({
      generatedAt: now.toISOString(),
      shop,
      shopifyRequestId: request.shopifyRequestId,
      shopifyCustomerId: request.shopifyCustomerId,
      ordersRequested: request.ordersRequested ?? [],
      customerFound,
      note: customerFound || recordCount > 0
        ? "Every record RewardsPro holds about this customer, by table."
        : "RewardsPro holds no records about this customer.",
      records: rows,
    }),
  );
  const expiresAt = new Date(now.getTime() + REPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const stored = await prisma.customerDataRequest.upsert({
    where: { shop_shopifyRequestId: { shop, shopifyRequestId: request.shopifyRequestId } },
    create: { shop, shopifyRequestId: request.shopifyRequestId, shopifyCustomerId: request.shopifyCustomerId, report, recordCount, expiresAt },
    update: { report, recordCount, expiresAt, createdAt: now, downloadedAt: null },
    select: { id: true },
  });
  return { id: stored.id, customerFound, recordCount };
}

/** The shop's reports, newest first, without their contents. */
export function listDataRequests(shop: string) {
  return prisma.customerDataRequest.findMany({
    where: { shop, expiresAt: { gt: new Date() } },
    select: { id: true, shopifyRequestId: true, shopifyCustomerId: true, recordCount: true, createdAt: true, downloadedAt: true, expiresAt: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

/** Reports the merchant has not downloaded yet. */
export function countPendingDataRequests(shop: string): Promise<number> {
  return prisma.customerDataRequest.count({ where: { shop, downloadedAt: null, expiresAt: { gt: new Date() } } });
}

/** Decrypt one report for the merchant and record the download. */
export async function readDataRequestReport(shop: string, id: string): Promise<{ filename: string; json: string } | null> {
  const request = await prisma.customerDataRequest.findFirst({
    where: { id, shop, expiresAt: { gt: new Date() } },
    select: { id: true, shopifyRequestId: true, report: true },
  });
  if (!request) return null;
  await prisma.customerDataRequest.update({ where: { id: request.id }, data: { downloadedAt: new Date() } });
  return { filename: `customer-data-request-${request.shopifyRequestId.replace(/[^\w-]/g, "")}.json`, json: decrypt(request.report) };
}

/** Delete reports past their retention period, for every shop. */
export async function deleteExpiredDataRequests(now = new Date()): Promise<number> {
  const { count } = await prisma.customerDataRequest.deleteMany({ where: { expiresAt: { lte: now } } });
  return count;
}
