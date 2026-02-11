/**
 * Cashback Reconciliation Cron Job
 *
 * Retries PENDING StoreCreditLedger entries that failed to sync to Shopify.
 * These entries were created by the orders/paid webhook but the Shopify
 * store credit issuance failed or timed out.
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
import { timingSafeEqual } from "crypto";
import db from "~/db.server";
import { unauthenticated } from "~/shopify.server";
import { acquireCronLock, releaseCronLock, cleanupExpiredLocks } from "~/services/cron-lock.server";
import * as crypto from "crypto";

const JOB_NAME = "cashback-reconciliation";
const LOCK_TTL_MINUTES = 15;
const MAX_ENTRIES_PER_RUN = 50;
// Only retry entries older than 2 minutes (avoid racing with the webhook)
const MIN_AGE_MINUTES = 2;
// Don't retry entries older than 7 days (likely need manual intervention)
const MAX_AGE_DAYS = 7;

export const loader = async ({ request }: LoaderFunctionArgs) => {
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

  // Verify cron secret
  const authHeader = request.headers.get("Authorization");
  const cronSecret = authHeader?.replace('Bearer ', '');

  const isAuthorized = (() => {
    if (!process.env.CRON_SECRET || !cronSecret) return false;
    try {
      const secretBuffer = new Uint8Array(Buffer.from(cronSecret));
      const expectedBuffer = new Uint8Array(Buffer.from(process.env.CRON_SECRET));
      if (secretBuffer.length !== expectedBuffer.length) return false;
      return timingSafeEqual(secretBuffer, expectedBuffer);
    } catch {
      return false;
    }
  })();

  if (!isAuthorized) {
    log('error', 'Unauthorized cron attempt');
    return json({ error: "Unauthorized" }, { status: 401 });
  }

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

    // Find PENDING cashback entries that need retry
    const pendingEntries = await db.storeCreditLedger.findMany({
      where: {
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
      include: {
        customer: {
          select: {
            id: true,
            shopifyCustomerId: true,
            storeCredit: true,
          }
        }
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_ENTRIES_PER_RUN,
    });

    log('info', `Found ${pendingEntries.length} PENDING cashback entries to reconcile`);

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
      let admin: any;
      try {
        const result = await unauthenticated.admin(shop);
        admin = result.admin;
      } catch (err) {
        log('error', `Failed to get admin API for shop ${shop}`, { error: (err as Error).message });
        failed += entries.length;
        continue;
      }

      const { createStoreCreditService } = await import("~/services/shopify-store-credit.service");
      const storeCreditService = createStoreCreditService(admin, shop);

      // Get shop currency
      const shopSettings = await db.shopSettings.findUnique({
        where: { shop },
        select: { storeCurrency: true }
      });

      for (const entry of entries) {
        try {
          if (!entry.customer) {
            log('warn', `Skipping entry ${entry.id} - no customer found`);
            skipped++;
            continue;
          }

          const metadata = entry.metadata as any;
          const currency = shopSettings?.storeCurrency || metadata?.currency || 'USD';
          const description = metadata?.description || `Cashback reconciliation`;

          log('info', `Retrying cashback sync for entry ${entry.id}`, {
            shop,
            customerId: entry.customer.id,
            amount: Number(entry.amount),
          });

          const result = await storeCreditService.issueStoreCredit(
            entry.customer.shopifyCustomerId,
            Number(entry.amount),
            currency,
            description
          );

          if (result.success) {
            const actualBalance = result.balance || (Number(entry.customer.storeCredit) + Number(entry.amount));

            // Update ledger entry to SYNCED
            await db.storeCreditLedger.update({
              where: { id: entry.id },
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
            });

            // Update customer balance
            await db.customer.update({
              where: { id: entry.customer.id },
              data: {
                storeCredit: actualBalance,
                updatedAt: now,
              }
            });

            synced++;
            log('info', `Synced cashback entry ${entry.id} successfully`, { balance: actualBalance });
          } else {
            failed++;
            log('error', `Failed to sync cashback entry ${entry.id}`, { error: result.error });
          }
        } catch (entryError: any) {
          failed++;
          log('error', `Error processing entry ${entry.id}`, { error: entryError.message });
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
    return json({ success: false, correlationId, error: error.message }, { status: 500 });
  } finally {
    if (lockId) {
      await releaseCronLock(lockId);
      log('info', 'Released distributed lock');
    }
  }
};
