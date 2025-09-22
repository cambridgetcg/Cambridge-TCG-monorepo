import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import { UsageRecordService } from "../services/billing/usage-record.service";
import { BillingGraphQLService } from "../services/billing/billing-graphql.service";
import { shopifyApi, ApiVersion } from "@shopify/shopify-api";
import * as crypto from "crypto";

/**
 * Daily cron job for processing usage-based billing
 * Should be called once per day (ideally at midnight UTC)
 *
 * @pattern GET request from Vercel Cron with Authorization header
 * @security Requires CRON_SECRET in Authorization header
 * @note Vercel crons only run in production, not preview
 */

// Use loader for GET requests (Vercel sends GET, not POST)
export async function loader({ request }: LoaderFunctionArgs) {
  const startTime = Date.now();
  const correlationId = crypto.randomUUID();
  const userAgent = request.headers.get('user-agent');

  // Structured logging helper
  const log = (level: 'info' | 'warn' | 'error', message: string, data?: any) => {
    console.log(JSON.stringify({
      level,
      message,
      correlationId,
      timestamp: new Date().toISOString(),
      service: 'usage-billing-cron',
      ...data
    }));
  };

  log('info', 'Cron invocation started', {
    userAgent,
    isVercelCron: userAgent?.includes('vercel-cron/1.0'),
    method: request.method,
  });

  // 1. Verify authorization (use lowercase 'authorization' per Vercel docs)
  const auth = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

  // No fallback - require dedicated CRON_SECRET
  if (!process.env.CRON_SECRET || auth !== expectedAuth) {
    log('error', 'Unauthorized cron attempt', {
      hasSecret: !!process.env.CRON_SECRET,
      userAgent,
    });
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Check if new billing is enabled
  const useNewBilling = process.env.USE_NEW_BILLING === 'true';
  if (!useNewBilling) {
    log('info', 'New billing disabled, skipping usage processing');
    return json({
      success: true,
      message: "New billing not enabled",
      correlationId
    });
  }

  // 3. Parse query parameters
  const url = new URL(request.url);
  const isDryRun = url.searchParams.get('dry-run') === 'true';
  const dateParam = url.searchParams.get('date');

  if (isDryRun) {
    log('info', 'DRY RUN MODE - No charges will be created');
  }

  // 4. Get target date (yesterday by default, to process complete day's data)
  const targetDate = dateParam ? new Date(dateParam) : new Date();
  if (!dateParam) {
    targetDate.setUTCDate(targetDate.getUTCDate() - 1); // Process yesterday's usage
  }
  targetDate.setUTCHours(0, 0, 0, 0);

  const dateStr = targetDate.toISOString().split('T')[0];

  // 5. Idempotency check - prevent double processing
  if (!isDryRun) {
    try {
      const existingCount = await db.usageSummary.count({
        where: {
          date: {
            gte: targetDate,
            lt: new Date(targetDate.getTime() + 24 * 60 * 60 * 1000)
          }
        }
      });

      if (existingCount > 0) {
        log('info', 'Already processed for date', {
          date: dateStr,
          recordsFound: existingCount,
          duration: Date.now() - startTime,
        });
        return json({
          success: true,
          skipped: true,
          message: `Already processed for ${dateStr}`,
          correlationId,
        });
      }
    } catch (error: any) {
      if (!error.message?.includes('usageSummary')) {
        log('error', 'Idempotency check failed', {
          error: error.message,
          date: dateStr,
        });
      }
    }
  }

  log('info', `Processing usage for date: ${dateStr}`, {
    dryRun: isDryRun,
  });

  // 6. Get all shops with active subscriptions
  let activeShops;
  try {
    activeShops = await db.billingSubscription.findMany({
      where: {
        status: "ACTIVE",
        cappedAmount: { not: null }, // Only shops with usage-based billing
      },
      select: {
        shop: true,
        isTest: true,
        balanceRemaining: true,
        cappedAmount: true,
      }
    });
  } catch (error: any) {
    if (error.message?.includes('billingSubscription')) {
      log('warn', 'BillingSubscription table not found');
      return json({
        success: true,
        message: "Billing tables not yet created",
        correlationId
      });
    }

    log('error', 'Failed to fetch active shops', {
      error: error.message,
      duration: Date.now() - startTime,
    });
    throw error;
  }

  log('info', `Found ${activeShops.length} shops with active usage subscriptions`);

  // 7. Process each shop's usage
  const results = {
    processed: 0,
    skipped: 0,
    errors: 0,
    totalCharges: 0,
    shops: [] as any[],
  };

  // Process with concurrency limit
  const BATCH_SIZE = 5;
  for (let i = 0; i < activeShops.length; i += BATCH_SIZE) {
    const batch = activeShops.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (subscription) => {
      try {
        // Skip if shop is at or over cap
        if (subscription.balanceRemaining !== null && subscription.balanceRemaining <= 0) {
          log('warn', `Skipping ${subscription.shop} - usage cap reached`, {
            balanceRemaining: subscription.balanceRemaining,
            cappedAmount: subscription.cappedAmount,
          });
          results.skipped++;
          return;
        }

        // Get shop session for API calls
        const session = await db.session.findFirst({
          where: {
            shop: subscription.shop,
            isActive: true,
          }
        });

        if (!session) {
          log('warn', `No active session for ${subscription.shop}`);
          results.skipped++;
          return;
        }

        // Create admin API context
        const shopify = shopifyApi({
          apiKey: process.env.SHOPIFY_API_KEY!,
          apiSecretKey: process.env.SHOPIFY_API_SECRET!,
          scopes: process.env.SCOPES?.split(",") || [],
          hostName: process.env.SHOPIFY_APP_URL!.replace(/https?:\/\//, ""),
          apiVersion: ApiVersion.January24,
        });

        const adminClient = new shopify.clients.Graphql({
          session: {
            shop: session.shop,
            accessToken: session.accessToken!,
          }
        });

        // Process daily usage batch
        const appUrl = process.env.SHOPIFY_APP_URL!;
        const usageService = new UsageRecordService(
          { graphql: adminClient.query.bind(adminClient) } as any,
          subscription.shop
        );

        if (isDryRun) {
          log('info', `[DRY RUN] Would process usage for ${subscription.shop}`);
          results.processed++;
          return;
        }

        const result = await usageService.processDailyUsageBatch(targetDate);

        if (result.success) {
          results.processed++;
          results.shops.push({
            shop: subscription.shop,
            success: true,
          });

          // Check if approaching cap and log warning
          if (subscription.cappedAmount && subscription.balanceRemaining) {
            const remaining = subscription.balanceRemaining;
            const cap = subscription.cappedAmount;
            const usagePercent = ((cap - remaining) / cap) * 100;

            if (usagePercent >= 90) {
              log('warn', `${subscription.shop} approaching usage cap`, {
                usagePercent: usagePercent.toFixed(1),
                remaining,
                cap,
              });
            }
          }
        } else {
          log('error', `Failed to process ${subscription.shop}`, {
            error: result.error,
          });
          results.errors++;
          results.shops.push({
            shop: subscription.shop,
            success: false,
            error: result.error,
          });
        }

      } catch (error: any) {
        log('error', `Error processing shop ${subscription.shop}`, {
          error: error.message,
          stack: error.stack,
        });
        results.errors++;
        results.shops.push({
          shop: subscription.shop,
          success: false,
          error: error.message,
        });
      }
    }));
  }

  // 8. Log summary
  const summary = {
    date: dateStr,
    shopsProcessed: results.processed,
    shopsSkipped: results.skipped,
    errors: results.errors,
    totalShops: activeShops.length,
    duration: Date.now() - startTime,
    dryRun: isDryRun,
  };

  log('info', 'Usage billing job completed', summary);

  // 9. Send alert if there were errors
  if (results.errors > 0 && process.env.SLACK_WEBHOOK_URL) {
    await sendAlert(`⚠️ Usage billing had ${results.errors} errors for ${dateStr}`);
  }

  return json({
    success: true,
    correlationId,
    summary,
    details: isDryRun ? undefined : results.shops,
  });
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