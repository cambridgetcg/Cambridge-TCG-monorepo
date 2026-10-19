/**
 * Cashback Reconciliation Cron Job
 *
 * Retries PENDING StoreCreditLedger entries that failed to sync to Shopify.
 * These entries were created by the orders/paid webhook but the Shopify
 * store credit issuance failed or timed out.
 *
 * Only shops whose merchant turned on automatic cashback processing
 * (ShopSettings.autoCashbackProcessingEnabled) are reconciled; the others
 * issue cashback by hand from the Orders page.
 *
 * Each entry is claimed (PENDING to SYNCING) before Shopify is called. The
 * claim waits for any refund holding the entry's row lock
 * (services/refund-handler.server.ts), and the amount issued is read after
 * it, so a refund reduces what is issued instead of racing it. An entry
 * goes back to PENDING only when Shopify answered that it applied nothing;
 * without an answer it stays SYNCING and is not sent again.
 *
 * Schedule: Every 15 minutes
 * Endpoint: GET /api/cron/cashback-reconciliation
 *
 * Add to vercel.json crons with schedule every 15 minutes
 *
 * @security Requires CRON_SECRET header
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import type { Prisma } from "@prisma/client";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import prisma from "~/db.server";
import { unauthenticated } from "~/shopify.server";
import { acquireCronLock, releaseCronLock, cleanupExpiredLocks } from "~/services/cron-lock.server";
import * as crypto from "node:crypto";
import { verifyCronAuth } from "~/utils/cron-auth.server";
import { jsonObject } from "~/utils/json-object";
import { createStoreCreditService } from "~/services/shopify-store-credit.service";
import { claimLedgerEntry, markUnconfirmed } from "~/services/cashback-ledger.server";

const JOB_NAME = "cashback-reconciliation";
const LOCK_TTL_MINUTES = 15;
const MAX_ENTRIES_PER_RUN = 50;
// Only retry entries older than 2 minutes (avoid racing with the webhook)
const MIN_AGE_MINUTES = 2;
// Don't retry entries older than 7 days (likely need manual intervention)
const MAX_AGE_DAYS = 7;

async function settle(id: string, metadata: Prisma.InputJsonObject) {
  await prisma.storeCreditLedger.update({ where: { id }, data: { metadata } });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!verifyCronAuth(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startTime = Date.now();
  const correlationId = crypto.randomUUID();
  let lockId: string | undefined;

  const log = (level: string, message: string, data?: any) => {
    console.log(JSON.stringify({
      level,
      message,
      correlationId,
      timestamp: new Date().toISOString(),
      service: 'cashback-reconciliation-cron',
      ...data
    }));
  };

  // Acquire distributed lock
  await cleanupExpiredLocks();
  const lock = await acquireCronLock(JOB_NAME, LOCK_TTL_MINUTES);

  if (!lock.acquired) {
    log('info', 'Another instance is running, skipping');
    return json({ success: true, skipped: true, reason: 'lock_not_acquired', correlationId });
  }

  lockId = lock.lockId;
  log('info', 'Cashback reconciliation cron started');

  try {
    const now = new Date();
    const minAge = new Date(now.getTime() - MIN_AGE_MINUTES * 60 * 1000);
    const maxAge = new Date(now.getTime() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

    // Only merchants who turned automatic processing on
    const autoShops = await prisma.shopSettings.findMany({
      where: { autoCashbackProcessingEnabled: true },
      select: { shop: true, storeCurrency: true },
    });
    const currencyByShop = new Map(autoShops.map((s) => [s.shop, s.storeCurrency]));

    // Find PENDING cashback entries that need retry
    const pendingEntries = autoShops.length === 0 ? [] : await prisma.storeCreditLedger.findMany({
      where: {
        shop: { in: autoShops.map((s) => s.shop) },
        type: 'CASHBACK_EARNED',
        createdAt: {
          gte: maxAge,
          lte: minAge,
        },
        // Filter for PENDING syncStatus in metadata JSON
        // Prisma JSON filtering: metadata path contains syncStatus = PENDING
        metadata: {
          path: ['syncStatus'],
          equals: 'PENDING',
        },
      },
      select: { id: true, shop: true },
      orderBy: { createdAt: 'asc' },
      take: MAX_ENTRIES_PER_RUN,
    });

    log('info', `Found ${pendingEntries.length} PENDING cashback entries to reconcile`, { autoShops: autoShops.length });

    if (pendingEntries.length === 0) {
      return json({ success: true, correlationId, processed: 0, synced: 0, failed: 0 });
    }

    // Group by shop for efficient admin API access
    const byShop = new Map<string, typeof pendingEntries>();
    for (const entry of pendingEntries) {
      const shopEntries = byShop.get(entry.shop) || [];
      shopEntries.push(entry);
      byShop.set(entry.shop, shopEntries);
    }

    let synced = 0;
    let failed = 0;
    let skipped = 0;

    for (const [shop, entries] of byShop) {
      let admin: AdminApiContext;
      try {
        const result = await unauthenticated.admin(shop);
        admin = result.admin;
      } catch (err) {
        log('error', `Failed to get admin API for shop ${shop}`, { error: (err as Error).message });
        failed += entries.length;
        continue;
      }

      const storeCreditService = createStoreCreditService(admin, shop);

      for (const { id } of entries) {
        let claimed = false;
        let issueSent = false;
        try {
          // A refund or another run may have taken it since the query
          claimed = await claimLedgerEntry(id);
          if (!claimed) {
            skipped++;
            continue;
          }

          // Read after the claim: a refund may have reduced the entry
          const entry = await prisma.storeCreditLedger.findUniqueOrThrow({
            where: { id },
            include: {
              customer: { select: { id: true, shopifyCustomerId: true } },
              order: { select: { id: true, cashbackProcessed: true } },
            },
          });
          const metadata = jsonObject(entry.metadata);

          // Issued by hand from the Orders page in the meantime
          if (entry.order?.cashbackProcessed) {
            await settle(id, { ...metadata, syncStatus: 'SYNCED', settledBy: 'manual', syncedAt: now.toISOString() });
            skipped++;
            continue;
          }
          if (entry.amount.lte(0)) {
            await settle(id, { ...metadata, syncStatus: 'NOT_APPLICABLE' });
            skipped++;
            continue;
          }

          const currency = currencyByShop.get(shop) || (typeof metadata.currency === 'string' ? metadata.currency : null) || 'USD';
          const description = typeof metadata.description === 'string' ? metadata.description : 'Cashback reconciliation';

          log('info', `Retrying cashback sync for entry ${id}`, {
            shop,
            customerId: entry.customer.id,
            amount: Number(entry.amount),
          });

          issueSent = true;
          const result = await storeCreditService.issueStoreCredit(
            entry.customer.shopifyCustomerId,
            Number(entry.amount),
            currency,
            description
          );

          if (result.success) {
            const actualBalance = result.balance ?? entry.balance;

            await prisma.$transaction([
              prisma.storeCreditLedger.update({
                where: { id },
                data: {
                  balance: actualBalance,
                  metadata: {
                    ...metadata,
                    syncStatus: 'SYNCED',
                    autoProcessed: true,
                    syncedAt: now.toISOString(),
                    reconciledBy: 'cashback-reconciliation-cron',
                    reconciledAt: now.toISOString(),
                  },
                }
              }),
              prisma.customer.update({
                where: { id: entry.customer.id },
                data: {
                  storeCredit: actualBalance,
                  updatedAt: now,
                }
              }),
              ...(entry.order
                ? [prisma.order.update({ where: { id: entry.order.id }, data: { cashbackProcessed: true, updatedAt: now } })]
                : []),
            ]);

            synced++;
            log('info', `Synced cashback entry ${id} successfully`, { balance: actualBalance });
          } else if (result.ambiguous) {
            // No answer: Shopify may have credited it, so it stays SYNCING
            await markUnconfirmed(id, result.error);
            failed++;
            log('error', `Shopify did not confirm cashback entry ${id}`, { error: result.error, leftSyncing: true });
          } else {
            // Shopify refused: back to PENDING for the next run
            await settle(id, { ...metadata, syncStatus: 'PENDING' });
            failed++;
            log('error', `Failed to sync cashback entry ${id}`, { error: result.error });
          }
        } catch (entryError: any) {
          failed++;
          if (claimed && !issueSent) {
            try { await claimLedgerEntry(id, 'SYNCING', 'PENDING'); } catch { /* retried next run */ }
          }
          // After a credit was sent, the entry stays SYNCING: re-sending could
          // pay twice, so it waits for manual reconciliation
          log('error', `Error processing entry ${id}`, { error: entryError.message, leftSyncing: claimed && issueSent });
        }
      }
    }

    const summary = {
      processed: pendingEntries.length,
      synced,
      failed,
      skipped,
      durationMs: Date.now() - startTime,
    };

    log('info', 'Cashback reconciliation completed', summary);

    return json({ success: true, correlationId, ...summary });

  } catch (error: any) {
    log('error', 'Cashback reconciliation failed', { error: error.message, stack: error.stack });
    return json(
      { success: false, correlationId, error: "Cashback reconciliation failed" },
      { status: 500 },
    );
  } finally {
    if (lockId) {
      await releaseCronLock(lockId);
      log('info', 'Released distributed lock');
    }
  }
};
