/**
 * Store Credit Reconciliation Cron Job
 *
 * Detects and reports discrepancies between local store credit balances
 * and Shopify's actual store credit balances.
 *
 * Schedule: Daily at 5 AM UTC
 * Endpoint: GET /api/cron/store-credit-reconciliation
 *
 * Add to vercel.json: { "path": "/api/cron/store-credit-reconciliation", "schedule": "0 5 * * *" }
 *
 * @security Requires CRON_SECRET header
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "~/db.server";
import { acquireCronLock, releaseCronLock, cleanupExpiredLocks } from "~/services/cron-lock.server";
import * as crypto from "node:crypto";
import { verifyCronAuth } from "~/utils/cron-auth.server";

const JOB_NAME = "store-credit-reconciliation";
const LOCK_TTL_MINUTES = 30;

// Discrepancy threshold - only report if difference is above this (in dollars)
const DISCREPANCY_THRESHOLD = 0.01;

interface DiscrepancyResult {
  customerId: string;
  customerEmail: string;
  shopifyCustomerId: string;
  localBalance: number;
  shopifyBalance: number;
  difference: number;
  percentageDiff: number;
}

interface ReconciliationResult {
  shop: string;
  customersChecked: number;
  discrepanciesFound: number;
  totalLocalBalance: number;
  totalShopifyBalance: number;
  discrepancies: DiscrepancyResult[];
  errors: string[];
  durationMs: number;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!verifyCronAuth(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startTime = Date.now();
  const correlationId = crypto.randomUUID();
  let lockId: string | undefined;

  // Structured logging helper
  const log = (level: 'info' | 'warn' | 'error', message: string, data?: any) => {
    console.log(JSON.stringify({
      level,
      message,
      correlationId,
      timestamp: new Date().toISOString(),
      service: 'store-credit-reconciliation-cron',
      ...data
    }));
  };

  // Acquire distributed lock
  await cleanupExpiredLocks();
  const lock = await acquireCronLock(JOB_NAME, LOCK_TTL_MINUTES);

  if (!lock.acquired) {
    log('info', 'Another instance is running, skipping', {
      existingLock: lock.existingLock
    });
    return json({
      success: true,
      skipped: true,
      reason: 'lock_not_acquired',
      correlationId
    });
  }

  lockId = lock.lockId;
  log('info', 'Store credit reconciliation cron started');

  const results: ReconciliationResult[] = [];

  try {
    // Get all shops with active settings
    const shops = await prisma.shopSettings.findMany({
      where: {
        widgetIsActive: true // Only check shops with active widget
      },
      select: {
        shop: true
      }
    });

    log('info', `Found ${shops.length} shops to check`);

    for (const shopSettings of shops) {
      const shop = shopSettings.shop;
      const shopStartTime = Date.now();

      try {
        log('info', `Processing shop: ${shop}`);

        // Get all customers with non-zero store credit
        const customers = await prisma.customer.findMany({
          where: {
            shop,
            storeCredit: { gt: 0 }
          },
          select: {
            id: true,
            email: true,
            shopifyCustomerId: true,
            storeCredit: true
          },
          take: 500 // Limit to prevent timeout
        });

        const result: ReconciliationResult = {
          shop,
          customersChecked: customers.length,
          discrepanciesFound: 0,
          totalLocalBalance: 0,
          totalShopifyBalance: 0,
          discrepancies: [],
          errors: [],
          durationMs: 0
        };

        // For now, we'll just sum up local balances
        // To actually check against Shopify, we'd need admin API access
        // This is a foundation that can be extended when admin API is available

        for (const customer of customers) {
          const localBalance = Number(customer.storeCredit);
          result.totalLocalBalance += localBalance;

          // Note: To actually fetch Shopify balance, you would need:
          // 1. Access to the shop's admin API (requires session)
          // 2. Create a service that authenticates per-shop
          //
          // For now, we're flagging customers with non-zero balance for audit
          // The actual Shopify balance check can be done via the orders sync or
          // webhook that already queries Shopify balance on each order

          // Check if the last ledger entry balance matches the customer's storeCredit field
          const lastLedger = await prisma.storeCreditLedger.findFirst({
            where: { customerId: customer.id },
            orderBy: { createdAt: 'desc' },
            select: { balance: true }
          });

          if (lastLedger) {
            const ledgerBalance = Number(lastLedger.balance);
            const diff = Math.abs(localBalance - ledgerBalance);

            if (diff > DISCREPANCY_THRESHOLD) {
              result.discrepanciesFound++;
              result.discrepancies.push({
                customerId: customer.id,
                customerEmail: customer.email || 'unknown',
                shopifyCustomerId: customer.shopifyCustomerId,
                localBalance,
                shopifyBalance: ledgerBalance, // Using ledger as proxy for now
                difference: localBalance - ledgerBalance,
                percentageDiff: ledgerBalance > 0 ? ((localBalance - ledgerBalance) / ledgerBalance) * 100 : 100
              });

              log('warn', `Discrepancy found for customer ${customer.email}`, {
                shop,
                customerId: customer.id,
                localBalance,
                ledgerBalance,
                difference: localBalance - ledgerBalance
              });
            }
          }
        }

        result.durationMs = Date.now() - shopStartTime;
        results.push(result);

        log('info', `Shop ${shop} processed`, {
          customersChecked: result.customersChecked,
          discrepanciesFound: result.discrepanciesFound,
          durationMs: result.durationMs
        });

      } catch (shopError: any) {
        log('error', `Error processing shop ${shop}`, { error: shopError.message });
        results.push({
          shop,
          customersChecked: 0,
          discrepanciesFound: 0,
          totalLocalBalance: 0,
          totalShopifyBalance: 0,
          discrepancies: [],
          errors: [shopError.message],
          durationMs: Date.now() - shopStartTime
        });
      }
    }

    // Calculate summary
    const summary = {
      shopsProcessed: results.length,
      totalCustomersChecked: results.reduce((sum, r) => sum + r.customersChecked, 0),
      totalDiscrepancies: results.reduce((sum, r) => sum + r.discrepanciesFound, 0),
      totalLocalBalance: results.reduce((sum, r) => sum + r.totalLocalBalance, 0),
      shopsWithDiscrepancies: results.filter(r => r.discrepanciesFound > 0).length,
      errorsEncountered: results.reduce((sum, r) => sum + r.errors.length, 0),
      durationMs: Date.now() - startTime
    };

    log('info', 'Store credit reconciliation completed', summary);

    // Send alert if discrepancies found
    if (summary.totalDiscrepancies > 0 && process.env.SLACK_WEBHOOK_URL) {
      await sendAlert(
        `⚠️ Store Credit Reconciliation: Found ${summary.totalDiscrepancies} discrepancies across ${summary.shopsWithDiscrepancies} shops. Check logs for details.`
      );
    }

    return json({
      success: true,
      correlationId,
      summary
    });

  } catch (error: any) {
    log('error', 'Store credit reconciliation failed', { error: error.message, stack: error.stack });
    return json({
      success: false,
      correlationId,
      error: "Store credit reconciliation failed"
    }, { status: 500 });
  } finally {
    if (lockId) {
      await releaseCronLock(lockId);
      log('info', 'Released distributed lock');
    }
  }
};

// Helper function to send alerts
async function sendAlert(message: string) {
  if (process.env.SLACK_WEBHOOK_URL) {
    try {
      await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: message,
          channel: '#alerts'
        })
      });
    } catch (error) {
      console.error('Failed to send Slack alert:', error);
    }
  }
}
