/**
 * Daily cron job for tier maintenance tasks
 * - Process membership expirations
 * - Evaluate tier downgrades with grace periods
 * - Send tier change notifications
 *
 * Should run daily at midnight UTC
 * Add to vercel.json: { "path": "/api/cron/tier-maintenance", "schedule": "0 0 * * *" }
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import TierResolver from "../services/tier-resolver.server";
import * as crypto from "crypto";
import { Decimal } from "decimal.js";

// Configuration
const DOWNGRADE_GRACE_PERIOD_DAYS = 30;
const DOWNGRADE_WARNING_DAYS = 7;

// Use loader for GET requests (Vercel sends GET, not POST)
export async function loader({ request }: LoaderFunctionArgs) {
  const startTime = Date.now();
  const correlationId = crypto.randomUUID();

  // Structured logging helper
  const log = (level: 'info' | 'warn' | 'error', message: string, data?: any) => {
    console.log(JSON.stringify({
      level,
      message,
      correlationId,
      timestamp: new Date().toISOString(),
      service: 'tier-maintenance-cron',
      ...data
    }));
  };

  log('info', 'Tier maintenance cron started');

  // 1. Verify authorization
  const auth = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || auth !== expectedAuth) {
    log('error', 'Unauthorized cron attempt');
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Parse query parameters
  const url = new URL(request.url);
  const isDryRun = url.searchParams.get('dry-run') === 'true';

  if (isDryRun) {
    log('info', 'DRY RUN MODE - No changes will be made');
  }

  const results = {
    expiredMemberships: 0,
    downgradeWarnings: 0,
    downgrades: 0,
    errors: 0,
    details: [] as any[]
  };

  try {
    // 3. Process expired subscriptions
    const expiredSubscriptions = await db.tierSubscription.findMany({
      where: {
        status: 'ACTIVE',
        endDate: {
          not: null,
          lt: new Date()
        }
      },
      include: {
        customer: true,
        tier: true
      }
    });

    log('info', `Found ${expiredSubscriptions.length} expired subscriptions to process`);

    for (const subscription of expiredSubscriptions) {
      try {
        if (!isDryRun) {
          // Mark as expired and update customer's tier
          await db.tierSubscription.update({
            where: { id: subscription.id },
            data: { status: 'EXPIRED' }
          });

          await TierResolver.handleMembershipExpiration(subscription);
        }

        results.expiredMemberships++;
        results.details.push({
          type: 'subscription_expired',
          customerId: subscription.customerId,
          tierName: subscription.tier.name,
          shop: subscription.shop
        });

        log('info', `Processed expired subscription for customer ${subscription.customerId}`);
      } catch (error: any) {
        log('error', `Failed to process subscription ${subscription.id}`, { error: error.message });
        results.errors++;
      }
    }

    // 4. Process expired one-time purchases
    const expiredPurchases = await db.tierPurchase.findMany({
      where: {
        status: 'ACTIVE',
        endDate: {
          not: null,
          lt: new Date()
        }
      },
      include: {
        customer: true,
        tier: true
      }
    });

    log('info', `Found ${expiredPurchases.length} expired tier purchases to process`);

    for (const purchase of expiredPurchases) {
      try {
        if (!isDryRun) {
          // Mark as expired and update customer's tier
          await db.tierPurchase.update({
            where: { id: purchase.id },
            data: { status: 'EXPIRED' }
          });

          await TierResolver.handleMembershipExpiration(purchase);
        }

        results.expiredMemberships++;
        results.details.push({
          type: 'purchase_expired',
          customerId: purchase.customerId,
          tierName: purchase.tier.name,
          shop: purchase.shop
        });

        log('info', `Processed expired purchase for customer ${purchase.customerId}`);
      } catch (error: any) {
        log('error', `Failed to process purchase ${purchase.id}`, { error: error.message });
        results.errors++;
      }
    }

    // 5. Evaluate earned tier downgrades (with grace period)
    const gracePeriodDate = new Date();
    gracePeriodDate.setDate(gracePeriodDate.getDate() - DOWNGRADE_GRACE_PERIOD_DAYS);

    // Find customers who haven't made a purchase recently and might need downgrading
    const inactiveCustomers = await db.customer.findMany({
      where: {
        currentTierId: { not: null },
        // No active purchased tiers
        currentSubscriptionId: null,
        // Haven't ordered in grace period
        lastOrderDate: { lt: gracePeriodDate }
      },
      include: {
        currentTier: true
      }
    });

    log('info', `Found ${inactiveCustomers.length} potentially inactive customers to evaluate`);

    for (const customer of inactiveCustomers) {
      try {
        // Check if they still qualify for their current tier based on spending
        const earnedTier = await db.tier.findFirst({
          where: {
            shop: customer.shop,
            minSpend: { lte: customer.netSpent.toNumber() }
          },
          orderBy: { minSpend: 'desc' }
        });

        const shouldDowngrade = !earnedTier || earnedTier.id !== customer.currentTierId;

        if (shouldDowngrade) {
          // Check if we've already warned them
          const recentWarning = await db.tierChangeLog.findFirst({
            where: {
              customerId: customer.id,
              metadata: {
                path: '$.warningType',
                equals: 'DOWNGRADE_WARNING'
              },
              createdAt: {
                gte: new Date(Date.now() - DOWNGRADE_WARNING_DAYS * 24 * 60 * 60 * 1000)
              }
            }
          });

          if (!recentWarning) {
            // Send warning
            if (!isDryRun) {
              await db.tierChangeLog.create({
                data: {
                  id: crypto.randomUUID(),
                  customerId: customer.id,
                  shop: customer.shop,
                  fromTierId: customer.currentTierId,
                  fromTierName: customer.currentTier?.name,
                  toTierId: earnedTier?.id,
                  toTierName: earnedTier?.name,
                  changeType: 'DOWNGRADE',
                  triggerType: 'PERIODIC_REVIEW',
                  totalSpending: customer.totalSpent,
                  periodSpending: customer.netSpent,
                  metadata: {
                    warningType: 'DOWNGRADE_WARNING',
                    scheduledDate: new Date(Date.now() + DOWNGRADE_WARNING_DAYS * 24 * 60 * 60 * 1000),
                    reason: 'Inactive for grace period'
                  },
                  createdAt: new Date()
                }
              });

              // TODO: Send warning email
              // await sendDowngradeWarningEmail(customer, earnedTier);
            }

            results.downgradeWarnings++;
            results.details.push({
              type: 'downgrade_warning',
              customerId: customer.id,
              fromTier: customer.currentTier?.name,
              toTier: earnedTier?.name,
              shop: customer.shop
            });
          } else {
            // Warning was sent, check if it's time to downgrade
            const warningDate = new Date(recentWarning.createdAt);
            const daysSinceWarning = Math.floor(
              (Date.now() - warningDate.getTime()) / (24 * 60 * 60 * 1000)
            );

            if (daysSinceWarning >= DOWNGRADE_WARNING_DAYS) {
              // Execute downgrade
              if (!isDryRun) {
                await db.customer.update({
                  where: { id: customer.id },
                  data: {
                    currentTierId: earnedTier?.id || null,
                    updatedAt: new Date()
                  }
                });

                await db.tierChangeLog.create({
                  data: {
                    id: crypto.randomUUID(),
                    customerId: customer.id,
                    shop: customer.shop,
                    fromTierId: customer.currentTierId,
                    fromTierName: customer.currentTier?.name,
                    toTierId: earnedTier?.id,
                    toTierName: earnedTier?.name,
                    changeType: 'DOWNGRADE',
                    triggerType: 'PERIODIC_REVIEW',
                    totalSpending: customer.totalSpent,
                    periodSpending: customer.netSpent,
                    metadata: {
                      reason: 'Grace period expired',
                      inactiveDays: DOWNGRADE_GRACE_PERIOD_DAYS
                    },
                    createdAt: new Date()
                  }
                });

                // TODO: Send downgrade notification email
                // await sendDowngradeEmail(customer, earnedTier);
              }

              results.downgrades++;
              results.details.push({
                type: 'downgrade_executed',
                customerId: customer.id,
                fromTier: customer.currentTier?.name,
                toTier: earnedTier?.name,
                shop: customer.shop
              });
            }
          }
        }
      } catch (error: any) {
        log('error', `Failed to evaluate customer ${customer.id}`, { error: error.message });
        results.errors++;
      }
    }

    // 6. Log summary
    const summary = {
      expiredMemberships: results.expiredMemberships,
      downgradeWarnings: results.downgradeWarnings,
      downgrades: results.downgrades,
      errors: results.errors,
      duration: Date.now() - startTime,
      dryRun: isDryRun
    };

    log('info', 'Tier maintenance job completed', summary);

    // 7. Send alert if there were errors
    if (results.errors > 0 && process.env.SLACK_WEBHOOK_URL) {
      await sendAlert(`⚠️ Tier maintenance had ${results.errors} errors`);
    }

    return json({
      success: true,
      correlationId,
      summary,
      details: isDryRun ? results.details : undefined
    });

  } catch (error: any) {
    log('error', 'Tier maintenance job failed', { error: error.message, stack: error.stack });
    return json({
      success: false,
      correlationId,
      error: error.message
    });
  }
}

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