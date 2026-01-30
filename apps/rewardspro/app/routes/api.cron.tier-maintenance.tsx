/**
 * Daily cron job for tier maintenance tasks
 * - Process membership expirations
 * - Evaluate tier downgrades with grace periods
 * - Send tier change notifications
 *
 * Should run daily at midnight UTC
 * Add to vercel.json: { "path": "/api/cron/tier-maintenance", "schedule": "0 0 * * *" }
 *
 * IMPORTANT: Uses distributed locking to prevent concurrent execution
 * across multiple Vercel regions.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import { updateCustomerToEffectiveTier } from "../services/tier-resolution.server";
import { acquireCronLock, releaseCronLock, cleanupExpiredLocks } from "../services/cron-lock.server";
import {
  sendTierExpirationWarningEmail,
  sendTierExpiredEmail,
} from "../services/email-notifications.server";
import * as crypto from "crypto";
import { Decimal } from "decimal.js";

// Configuration
const DOWNGRADE_GRACE_PERIOD_DAYS = 30;
const DOWNGRADE_WARNING_DAYS = 7;

// Tier purchase expiration warning configuration
const EXPIRATION_WARNING_DAYS = [7, 1]; // Send warnings at 7 days and 1 day before expiry

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

  // 2. Clean up any expired locks from crashed instances
  await cleanupExpiredLocks();

  // 3. Acquire distributed lock to prevent concurrent execution
  const lock = await acquireCronLock('tier-maintenance', 15); // 15 minute TTL

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

  // 4. Parse query parameters
  const url = new URL(request.url);
  const isDryRun = url.searchParams.get('dry-run') === 'true';

  if (isDryRun) {
    log('info', 'DRY RUN MODE - No changes will be made');
  }

  const results = {
    expiredMemberships: 0,
    expirationWarnings: 0,
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
          // Mark as expired
          await db.tierSubscription.update({
            where: { id: subscription.id },
            data: {
              status: 'EXPIRED',
              endDate: new Date()
            }
          });

          // Recalculate effective tier using resolver
          await updateCustomerToEffectiveTier(subscription.shop, subscription.customerId, {
            triggeredBy: 'subscription_expired',
            subscriptionId: subscription.id
          });
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
          // Mark as expired
          await db.tierPurchase.update({
            where: { id: purchase.id },
            data: { status: 'EXPIRED' }
          });

          // Recalculate effective tier using resolver
          await updateCustomerToEffectiveTier(purchase.shop, purchase.customerId, {
            triggeredBy: 'purchase_expired',
            purchaseId: purchase.id
          });
        }

        results.expiredMemberships++;
        results.details.push({
          type: 'purchase_expired',
          customerId: purchase.customerId,
          tierName: purchase.tier.name,
          shop: purchase.shop
        });

        log('info', `Processed expired purchase for customer ${purchase.customerId}`);

        // Send expiration notification email
        if (!isDryRun && purchase.customer?.email) {
          try {
            await sendTierExpiredEmail(purchase.shop, {
              customerId: purchase.customerId,
              email: purchase.customer.email,
              firstName: purchase.customer.firstName,
              expiredTierName: purchase.tier?.name || 'Premium',
              newTierName: null, // Will be resolved by tier resolution
            });
          } catch (emailError: any) {
            log('warn', `Failed to send expiration email for ${purchase.customerId}`, { error: emailError.message });
          }
        }
      } catch (error: any) {
        log('error', `Failed to process purchase ${purchase.id}`, { error: error.message });
        results.errors++;
      }
    }

    // 4.5. Send expiration warning emails for upcoming expirations
    for (const warningDays of EXPIRATION_WARNING_DAYS) {
      const warningDate = new Date();
      warningDate.setDate(warningDate.getDate() + warningDays);
      const warningDateStart = new Date(warningDate);
      warningDateStart.setHours(0, 0, 0, 0);
      const warningDateEnd = new Date(warningDate);
      warningDateEnd.setHours(23, 59, 59, 999);

      // Find purchases expiring on this warning date that haven't been warned
      const expiringPurchases = await db.tierPurchase.findMany({
        where: {
          status: 'ACTIVE',
          endDate: {
            gte: warningDateStart,
            lte: warningDateEnd
          }
        },
        include: {
          customer: true,
          tier: true,
          tierProduct: true
        }
      });

      log('info', `Found ${expiringPurchases.length} tier purchases expiring in ${warningDays} day(s)`);

      for (const purchase of expiringPurchases) {
        try {
          // Check if we've already sent this warning level
          const warningKey = `EXPIRATION_WARNING_${warningDays}D`;
          const existingWarning = await db.emailEvent.findFirst({
            where: {
              shop: purchase.shop,
              eventType: 'TIER_EXPIRATION_WARNING',
              customerEmail: purchase.customer?.email || '',
              metadata: {
                path: '$.daysUntilExpiry',
                equals: warningDays
              },
              createdAt: {
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Within last 24 hours
              }
            }
          });

          if (existingWarning) {
            log('info', `Already sent ${warningDays}-day warning to ${purchase.customer?.email}, skipping`);
            continue;
          }

          if (!isDryRun && purchase.customer?.email && purchase.tier) {
            // Get tier benefits for the email
            const tierBenefits: string[] = [];
            if (purchase.tier.cashbackPercent > 0) {
              tierBenefits.push(`${purchase.tier.cashbackPercent}% cashback on purchases`);
            }
            if (purchase.tier.pointsMultiplier && purchase.tier.pointsMultiplier > 1) {
              tierBenefits.push(`${purchase.tier.pointsMultiplier}x points multiplier`);
            }
            if (purchase.tier.benefits) {
              const benefits = typeof purchase.tier.benefits === 'string'
                ? JSON.parse(purchase.tier.benefits)
                : purchase.tier.benefits;
              if (Array.isArray(benefits)) {
                tierBenefits.push(...benefits.slice(0, 3)); // Add up to 3 custom benefits
              }
            }

            const emailResult = await sendTierExpirationWarningEmail(purchase.shop, {
              customerId: purchase.customerId,
              email: purchase.customer.email,
              firstName: purchase.customer.firstName,
              tierName: purchase.tier.name,
              tierBenefits,
              daysUntilExpiry: warningDays,
              expirationDate: purchase.endDate!,
              // Could add renewal URL if tier product is still active
              renewalUrl: purchase.tierProduct?.isActive
                ? `https://${purchase.shop.replace('.myshopify.com', '')}.myshopify.com/products/${purchase.tierProduct.productHandle}`
                : undefined
            });

            if (emailResult.success && !emailResult.skipped) {
              results.expirationWarnings++;
              results.details.push({
                type: 'expiration_warning',
                customerId: purchase.customerId,
                tierName: purchase.tier.name,
                daysUntilExpiry: warningDays,
                shop: purchase.shop
              });

              log('info', `Sent ${warningDays}-day expiration warning to ${purchase.customer.email}`);
            }
          } else if (isDryRun && purchase.customer?.email) {
            results.expirationWarnings++;
            results.details.push({
              type: 'expiration_warning',
              customerId: purchase.customerId,
              tierName: purchase.tier?.name,
              daysUntilExpiry: warningDays,
              shop: purchase.shop,
              dryRun: true
            });
          }
        } catch (error: any) {
          log('error', `Failed to send expiration warning for purchase ${purchase.id}`, { error: error.message });
          results.errors++;
        }
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
              // Execute downgrade using tier resolution system
              // This respects priority: Manual Override > Subscription > Purchase > Spending-based
              if (!isDryRun) {
                const result = await updateCustomerToEffectiveTier(customer.shop, customer.id, {
                  triggeredBy: 'periodic_maintenance_downgrade'
                });

                // Only count as downgrade if tier actually changed
                if (result.changed) {
                  results.downgrades++;
                  results.details.push({
                    type: 'downgrade_executed',
                    customerId: customer.id,
                    fromTier: customer.currentTier?.name,
                    toTier: result.newTierId ? 'resolved by system' : null,
                    source: result.source,
                    shop: customer.shop
                  });
                }

                // TODO: Send downgrade notification email
                // await sendDowngradeEmail(customer, earnedTier);
              } else {
                // Dry run - just record what would happen
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
        }
      } catch (error: any) {
        log('error', `Failed to evaluate customer ${customer.id}`, { error: error.message });
        results.errors++;
      }
    }

    // 6. Check for CustomerTierState consistency (Customer.currentTierId vs CustomerTierState.effectiveTierId)
    // This detects when the two sources of truth have gotten out of sync
    let consistencyRepairs = 0;
    try {
      const desyncedCustomers = await db.$queryRaw`
        SELECT c.id, c.shop, c."currentTierId", cts."effectiveTierId"
        FROM "Customer" c
        JOIN "CustomerTierState" cts ON c.id = cts."customerId"
        WHERE c."currentTierId" IS DISTINCT FROM cts."effectiveTierId"
        LIMIT 100
      ` as Array<{ id: string; shop: string; currentTierId: string | null; effectiveTierId: string | null }>;

      if (desyncedCustomers.length > 0) {
        log('warn', `Found ${desyncedCustomers.length} customers with tier state desync`);

        if (!isDryRun) {
          // Auto-repair by re-resolving each customer's tier
          for (const customer of desyncedCustomers) {
            try {
              await updateCustomerToEffectiveTier(customer.shop, customer.id, {
                triggeredBy: 'consistency_repair'
              });
              consistencyRepairs++;
            } catch (error: any) {
              log('error', `Failed to repair customer ${customer.id}`, { error: error.message });
              results.errors++;
            }
          }

          log('info', `Repaired ${consistencyRepairs} desynced customer tier states`);
        } else {
          log('info', `[DRY RUN] Would repair ${desyncedCustomers.length} desynced customer tier states`);
        }
      }
    } catch (error: any) {
      log('error', 'Failed to check tier state consistency', { error: error.message });
    }

    // 7. Log summary
    const summary = {
      expiredMemberships: results.expiredMemberships,
      expirationWarnings: results.expirationWarnings,
      downgradeWarnings: results.downgradeWarnings,
      downgrades: results.downgrades,
      consistencyRepairs,
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
    log('error', 'Tier maintenance job failed', { error: error.message });
    return json({
      success: false,
      correlationId,
      error: error.message
    });
  } finally {
    // Always release the lock when done, even if there was an error
    if (lock.lockId) {
      await releaseCronLock(lock.lockId);
      log('info', 'Released distributed lock');
    }
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