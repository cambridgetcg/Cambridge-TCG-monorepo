/**
 * Daily cron job for tier maintenance tasks
 * - Process membership expirations
 * - Warn shoppers before a membership runs out
 * - Repair Customer / CustomerTierState tier mismatches
 *
 * It doesn't downgrade customers who stopped ordering: spending-based tiers
 * change on orders and in tier-recalculation, which is on unless a shop
 * turns it off.
 *
 * Runs daily at 01:00 UTC (vercel.json: "0 1 * * *")
 *
 * IMPORTANT: Uses distributed locking to prevent concurrent execution
 * across multiple Vercel regions.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { updateCustomerToEffectiveTier } from "../services/tier-resolution.server";
import { acquireCronLock, releaseCronLock, cleanupExpiredLocks } from "../services/cron-lock.server";
import {
  sendTierExpirationWarningEmail,
  sendTierExpiredEmail,
} from "../services/email-notifications.server";
import * as crypto from "node:crypto";
import { verifyCronAuth } from "~/utils/cron-auth.server";

// Tier purchase expiration warning configuration
const EXPIRATION_WARNING_DAYS = [7, 1]; // Send warnings at 7 days and 1 day before expiry

// Use loader for GET requests (Vercel sends GET, not POST)
export async function loader({ request }: LoaderFunctionArgs) {
  if (!verifyCronAuth(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

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
    errors: 0,
    details: [] as any[]
  };

  try {
    // 3. Process expired subscriptions
    const expiredSubscriptions = await prisma.tierSubscription.findMany({
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
          await prisma.tierSubscription.update({
            where: { id: subscription.id },
            data: {
              status: 'EXPIRED',
              endDate: new Date()
            }
          });

          // Recalculate effective tier using resolver
          const resolved = await updateCustomerToEffectiveTier(subscription.shop, subscription.customerId, {
            triggeredBy: 'subscription_expired',
            subscriptionId: subscription.id
          });
          if (!resolved.success) {
            // Leave it as it was, so the next run tries again
            await prisma.tierSubscription.update({
              where: { id: subscription.id },
              data: { status: 'ACTIVE', endDate: subscription.endDate }
            });
            throw new Error(`Could not re-resolve the tier: ${resolved.error ?? 'unknown error'}`);
          }
        }

        results.expiredMemberships++;
        results.details.push({
          type: 'subscription_expired',
          customerId: subscription.customerId,
          tierName: subscription.tier?.name ?? null,
          shop: subscription.shop
        });

        log('info', `Processed expired subscription for customer ${subscription.customerId}`);
      } catch (error: any) {
        log('error', `Failed to process subscription ${subscription.id}`, { error: error.message });
        results.errors++;
      }
    }

    // 4. Process expired one-time purchases
    const expiredPurchases = await prisma.tierPurchase.findMany({
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
        let newTierId: string | null = null;
        if (!isDryRun) {
          // Mark as expired
          await prisma.tierPurchase.update({
            where: { id: purchase.id },
            data: { status: 'EXPIRED' }
          });

          // Recalculate effective tier using resolver
          const resolved = await updateCustomerToEffectiveTier(purchase.shop, purchase.customerId, {
            triggeredBy: 'purchase_expired',
            purchaseId: purchase.id
          });
          if (!resolved.success) {
            // Leave it ACTIVE, so the next run tries again and no email goes out
            await prisma.tierPurchase.update({
              where: { id: purchase.id },
              data: { status: 'ACTIVE' }
            });
            throw new Error(`Could not re-resolve the tier: ${resolved.error ?? 'unknown error'}`);
          }
          newTierId = resolved.newTierId;
        }

        results.expiredMemberships++;
        results.details.push({
          type: 'purchase_expired',
          customerId: purchase.customerId,
          tierName: purchase.tier?.name ?? null,
          shop: purchase.shop
        });

        log('info', `Processed expired purchase for customer ${purchase.customerId}`);

        // Send expiration notification email, unless the shopper keeps the
        // tier (they renewed, or a manual tier or their spending holds it)
        if (!isDryRun && purchase.customer?.email && newTierId !== null && newTierId === purchase.tierId) {
          log('info', `Customer ${purchase.customerId} keeps the tier, so no membership-ended email`);
        } else if (!isDryRun && purchase.customer?.email) {
          try {
            const newTier = newTierId
              ? await prisma.tier.findFirst({ where: { id: newTierId, shop: purchase.shop }, select: { name: true } })
              : null;
            await sendTierExpiredEmail(purchase.shop, {
              customerId: purchase.customerId,
              email: purchase.customer.email,
              firstName: purchase.customer.firstName,
              expiredTierName: purchase.tier?.name || 'Premium',
              newTierName: newTier?.name ?? null,
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
      const expiringPurchases = await prisma.tierPurchase.findMany({
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
          const existingWarning = await prisma.emailEvent.findFirst({
            where: {
              shop: purchase.shop,
              eventType: 'TIER_EXPIRATION_WARNING',
              customerEmail: purchase.customer?.email || '',
              metadata: {
                path: ['daysUntilExpiry'],
                equals: warningDays
              },
              createdAt: {
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Within last 24 hours
              }
            }
          });

          if (existingWarning) {
            log('info', `Already sent ${warningDays}-day warning to customer ${purchase.customerId}, skipping`);
            continue;
          }

          // Nothing is ending for a shopper who renewed, or who holds the same
          // or a higher tier through another membership that ends later or never
          if (purchase.tier) {
            const lastsLonger = {
              shop: purchase.shop,
              customerId: purchase.customerId,
              status: 'ACTIVE' as const,
              tier: { is: { minSpend: { gte: purchase.tier.minSpend } } },
              OR: [{ endDate: null }, { endDate: { gt: purchase.endDate! } }],
            };
            const continues =
              (await prisma.tierPurchase.findFirst({
                where: { ...lastsLonger, id: { not: purchase.id } },
                select: { id: true }
              })) ??
              (await prisma.tierSubscription.findFirst({ where: lastsLonger, select: { id: true } }));
            if (continues) {
              log('info', `Customer ${purchase.customerId} has a membership that lasts longer, skipping the ${warningDays}-day warning`);
              continue;
            }
          }

          if (!isDryRun && purchase.customer?.email && purchase.tier) {
            // Get tier benefits for the email
            const tierBenefits: string[] = [];
            if (purchase.tier.cashbackPercent > 0) {
              tierBenefits.push(`${purchase.tier.cashbackPercent}% cashback on purchases`);
            }
            if (purchase.tier.pointsMultiplier?.gt(1)) {
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

              log('info', `Sent ${warningDays}-day expiration warning to customer ${purchase.customerId}`);
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

    // 6. Check for CustomerTierState consistency (Customer.currentTierId vs CustomerTierState.effectiveTierId)
    // This detects when the two sources of truth have gotten out of sync
    let consistencyRepairs = 0;
    try {
      // Newest mismatches first, so a few that keep failing can't hide the rest
      const desyncedCustomers = await prisma.$queryRaw`
        SELECT c.id, c.shop, c."currentTierId", cts."effectiveTierId"
        FROM "Customer" c
        JOIN "CustomerTierState" cts ON c.id = cts."customerId"
        WHERE c."currentTierId" IS DISTINCT FROM cts."effectiveTierId"
        ORDER BY c."updatedAt" DESC, c.id
        LIMIT 100
      ` as Array<{ id: string; shop: string; currentTierId: string | null; effectiveTierId: string | null }>;

      if (desyncedCustomers.length > 0) {
        log('warn', `Found ${desyncedCustomers.length} customers with tier state desync`);

        if (!isDryRun) {
          // Auto-repair by re-resolving each customer's tier
          for (const customer of desyncedCustomers) {
            try {
              const repaired = await updateCustomerToEffectiveTier(customer.shop, customer.id, {
                triggeredBy: 'consistency_repair'
              });
              if (repaired.success) {
                consistencyRepairs++;
              } else {
                log('error', `Failed to repair customer ${customer.id}`, { error: repaired.error });
                results.errors++;
              }
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
      consistencyRepairs,
      errorCount: results.errors,
      duration: Date.now() - startTime,
      dryRun: isDryRun
    };

    log('info', 'Tier maintenance job completed', summary);

    // 7. Send alert if there were errors (only when SLACK_WEBHOOK_URL is set)
    if (results.errors > 0 && process.env.SLACK_WEBHOOK_URL) {
      await sendAlert(`⚠️ Tier maintenance had ${results.errors} errors`);
    }

    // A membership that couldn't be ended, a warning that failed or a repair
    // that didn't work makes this a failed run, so the cron monitor and the
    // logs show it as one
    return json({
      success: results.errors === 0,
      correlationId,
      summary
    }, { status: results.errors > 0 ? 500 : 200 });

  } catch (error: any) {
    log('error', 'Tier maintenance job failed', { error: error.message });
    return json({
      success: false,
      correlationId,
      error: "Tier maintenance failed"
    }, { status: 500 });
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
