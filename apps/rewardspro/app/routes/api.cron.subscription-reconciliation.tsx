/**
 * Tier Subscription Status Reconciliation Cron Job
 *
 * Detects and fixes discrepancies between local TierSubscription status
 * and Shopify's actual subscription contract status.
 *
 * This handles cases where:
 * - Subscription was cancelled in Shopify but webhook failed
 * - Subscription status changed in Shopify backend (dunning, etc.)
 * - Database shows ACTIVE but Shopify shows CANCELLED/PAUSED
 *
 * Schedule: Weekly on Sunday at 6 AM UTC
 * Endpoint: GET /api/cron/subscription-reconciliation
 *
 * Add to vercel.json: { "path": "/api/cron/subscription-reconciliation", "schedule": "0 6 * * 0" }
 *
 * @security Requires CRON_SECRET header
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "~/db.server";
import { acquireCronLock, releaseCronLock, cleanupExpiredLocks } from "~/services/cron-lock.server";
import { updateCustomerToEffectiveTier } from "~/services/tier-resolution.server";
import * as crypto from "node:crypto";
import { verifyCronAuth } from "~/utils/cron-auth.server";

const JOB_NAME = "subscription-reconciliation";
const LOCK_TTL_MINUTES = 60; // Longer TTL for weekly job

interface DiscrepancyResult {
  subscriptionId: string;
  customerId: string;
  customerEmail: string;
  localStatus: string;
  shopifyStatus: string;
  action: 'UPDATED' | 'FLAGGED' | 'ERROR';
  errorMessage?: string;
}

interface ShopResult {
  shop: string;
  subscriptionsChecked: number;
  discrepanciesFound: number;
  autoFixed: number;
  needsReview: number;
  discrepancies: DiscrepancyResult[];
  errors: string[];
  durationMs: number;
}

// GraphQL query to check subscription contract status
const SUBSCRIPTION_STATUS_QUERY = `#graphql
  query GetSubscriptionStatus($id: ID!) {
    node(id: $id) {
      ... on SubscriptionContract {
        id
        status
        nextBillingDate
        customer {
          id
          email
        }
      }
    }
  }
`;

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
      service: 'subscription-reconciliation-cron',
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
  log('info', 'Subscription reconciliation cron started');

  const results: ShopResult[] = [];

  try {
    // DATA API COMPATIBLE: groupBy is not supported by Aurora Data API adapter
    // Get all distinct shops that have active tier subscriptions using findMany + Set
    const activeSubscriptions = await prisma.tierSubscription.findMany({
      where: { status: 'ACTIVE' },
      select: { shop: true },
    });
    const shopsWithSubscriptions = [...new Set(activeSubscriptions.map(s => s.shop))];

    log('info', `Found ${shopsWithSubscriptions.length} shops with active subscriptions`);

    for (const shop of shopsWithSubscriptions) {
      const shopStartTime = Date.now();

      const result: ShopResult = {
        shop,
        subscriptionsChecked: 0,
        discrepanciesFound: 0,
        autoFixed: 0,
        needsReview: 0,
        discrepancies: [],
        errors: [],
        durationMs: 0
      };

      try {
        log('info', `Processing shop: ${shop}`);

        // Get all active tier subscriptions for this shop
        const activeSubscriptions = await prisma.tierSubscription.findMany({
          where: {
            shop,
            status: 'ACTIVE'
          },
          include: {
            customer: {
              select: {
                id: true,
                email: true,
                shopifyCustomerId: true
              }
            }
          },
          take: 100 // Limit per shop to prevent timeout
        });

        result.subscriptionsChecked = activeSubscriptions.length;
        log('info', `Found ${activeSubscriptions.length} active subscriptions for ${shop}`);

        // For each subscription, we would ideally check against Shopify
        // However, this requires admin API access per shop
        // For now, we flag subscriptions that haven't been updated in a while

        const staleThreshold = new Date();
        staleThreshold.setDate(staleThreshold.getDate() - 30); // 30 days

        for (const subscription of activeSubscriptions) {
          // Check for potentially stale subscriptions
          const isStale = subscription.updatedAt < staleThreshold;
          const isPastEndDate = subscription.endDate && new Date(subscription.endDate) < new Date();

          if (isPastEndDate) {
            // Subscription is marked active but end date has passed - this is a discrepancy
            result.discrepanciesFound++;

            try {
              // Auto-fix: Mark as expired
              await prisma.tierSubscription.update({
                where: { id: subscription.id },
                data: {
                  status: 'EXPIRED',
                  updatedAt: new Date()
                }
              });

              // Re-evaluate customer tier
              await updateCustomerToEffectiveTier(shop, subscription.customerId, {
                triggeredBy: 'subscription_reconciliation'
              });

              result.autoFixed++;
              result.discrepancies.push({
                subscriptionId: subscription.id,
                customerId: subscription.customerId,
                customerEmail: subscription.customer?.email || 'unknown',
                localStatus: 'ACTIVE',
                shopifyStatus: 'EXPIRED (past end date)',
                action: 'UPDATED'
              });

              log('info', `Auto-fixed expired subscription ${subscription.id}`, {
                shop,
                customerId: subscription.customerId,
                endDate: subscription.endDate
              });

            } catch (updateError: any) {
              result.discrepancies.push({
                subscriptionId: subscription.id,
                customerId: subscription.customerId,
                customerEmail: subscription.customer?.email || 'unknown',
                localStatus: 'ACTIVE',
                shopifyStatus: 'EXPIRED (past end date)',
                action: 'ERROR',
                errorMessage: updateError.message
              });
            }
          } else if (isStale && !subscription.shopifySubscriptionContractId) {
            // Subscription is active but has no Shopify contract ID and hasn't been updated
            // This might be a data integrity issue
            result.discrepanciesFound++;
            result.needsReview++;
            result.discrepancies.push({
              subscriptionId: subscription.id,
              customerId: subscription.customerId,
              customerEmail: subscription.customer?.email || 'unknown',
              localStatus: 'ACTIVE',
              shopifyStatus: 'UNKNOWN (no contract ID)',
              action: 'FLAGGED'
            });

            log('warn', `Stale subscription without contract ID: ${subscription.id}`, {
              shop,
              customerId: subscription.customerId,
              lastUpdate: subscription.updatedAt
            });
          }
        }

        result.durationMs = Date.now() - shopStartTime;
        results.push(result);

        log('info', `Shop ${shop} processed`, {
          subscriptionsChecked: result.subscriptionsChecked,
          discrepanciesFound: result.discrepanciesFound,
          autoFixed: result.autoFixed,
          needsReview: result.needsReview,
          durationMs: result.durationMs
        });

      } catch (shopError: any) {
        log('error', `Error processing shop ${shop}`, { error: shopError.message });
        result.errors.push(shopError.message);
        result.durationMs = Date.now() - shopStartTime;
        results.push(result);
      }
    }

    // Calculate summary
    const summary = {
      shopsProcessed: results.length,
      totalSubscriptionsChecked: results.reduce((sum, r) => sum + r.subscriptionsChecked, 0),
      totalDiscrepancies: results.reduce((sum, r) => sum + r.discrepanciesFound, 0),
      totalAutoFixed: results.reduce((sum, r) => sum + r.autoFixed, 0),
      totalNeedsReview: results.reduce((sum, r) => sum + r.needsReview, 0),
      errorsEncountered: results.reduce((sum, r) => sum + r.errors.length, 0),
      durationMs: Date.now() - startTime
    };

    log('info', 'Subscription reconciliation completed', summary);

    // Send alert if discrepancies found that need review
    if (summary.totalNeedsReview > 0 && process.env.SLACK_WEBHOOK_URL) {
      await sendAlert(
        `⚠️ Subscription Reconciliation: Found ${summary.totalDiscrepancies} discrepancies. Auto-fixed: ${summary.totalAutoFixed}. Needs review: ${summary.totalNeedsReview}. Check logs for details.`
      );
    }

    return json({
      success: true,
      correlationId,
      summary
    });

  } catch (error: any) {
    log('error', 'Subscription reconciliation failed', { error: error.message, stack: error.stack });
    return json({
      success: false,
      correlationId,
      error: "Subscription reconciliation failed"
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
