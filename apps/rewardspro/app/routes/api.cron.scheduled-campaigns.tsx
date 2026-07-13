/**
 * Hourly cron job for processing scheduled email campaigns
 * - Find campaigns with status "scheduled" and scheduledFor <= now
 * - Send them via sendCampaignEmails()
 * - Update status to "sent" or "failed"
 *
 * Should run hourly
 * Add to vercel.json: { "path": "/api/cron/scheduled-campaigns", "schedule": "0 * * * *" }
 *
 * IMPORTANT: Uses distributed locking to prevent concurrent execution
 * across multiple Vercel regions.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { acquireCronLock, releaseCronLock, cleanupExpiredLocks } from "../services/cron-lock.server";
import { sendCampaignEmails } from "../services/email-notifications.server";
import * as crypto from "node:crypto";
import { verifyCronAuth } from "~/utils/cron-auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  if (!verifyCronAuth(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startTime = Date.now();
  const correlationId = crypto.randomUUID();

  const log = (level: 'info' | 'warn' | 'error', message: string, data?: any) => {
    console.log(JSON.stringify({
      level,
      message,
      correlationId,
      timestamp: new Date().toISOString(),
      service: 'scheduled-campaigns-cron',
      ...data
    }));
  };

  log('info', 'Scheduled campaigns cron started');

  // 2. Clean up expired locks
  await cleanupExpiredLocks();

  // 3. Acquire distributed lock
  const lock = await acquireCronLock('scheduled-campaigns', 15); // 15 minute TTL

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
    sentCount: 0,
    failedCount: 0,
    errors: 0,
    details: [] as any[]
  };

  const now = new Date();

  try {
    // 5. Find scheduled campaigns that are due
    const dueCampaigns = await prisma.emailCampaign.findMany({
      where: {
        status: 'scheduled',
        scheduledFor: { lte: now },
      },
      select: {
        id: true,
        shop: true,
        name: true,
        scheduledFor: true,
        segmentRules: true,
      },
    });

    log('info', `Found ${dueCampaigns.length} scheduled campaigns to send`);

    for (const campaign of dueCampaigns) {
      try {
        log('info', `Processing campaign ${campaign.id} (${campaign.name}) for shop ${campaign.shop}`);

        if (isDryRun) {
          results.sentCount++;
          results.details.push({
            type: 'would_send',
            campaignId: campaign.id,
            name: campaign.name,
            shop: campaign.shop,
            scheduledFor: campaign.scheduledFor,
          });
          continue;
        }

        // Update status to "sending"
        await prisma.emailCampaign.updateMany({
          where: { id: campaign.id, shop: campaign.shop },
          data: {
            status: 'sending',
            sentAt: new Date(),
            updatedAt: new Date(),
          },
        });

        // Resolve recipients based on segmentRules
        const segmentRules = campaign.segmentRules as any;
        let recipients: Array<{ email: string; name?: string; customerId?: string }> = [];

        if (segmentRules?.fromRecommendation && segmentRules?.targetCustomerIds?.length) {
          // Recommendation-based targeting (exclude suppressed/unsubscribed)
          const customers = await prisma.customer.findMany({
            where: {
              shop: campaign.shop,
              id: { in: segmentRules.targetCustomerIds },
              email: { not: null },
              acceptsMarketing: true,
              emailSuppressed: false,
            },
            select: { id: true, email: true, firstName: true, lastName: true },
          });
          recipients = customers
            .filter((c) => c.email)
            .map((c) => ({
              email: c.email!,
              name: [c.firstName, c.lastName].filter(Boolean).join(" ") || undefined,
              customerId: c.id,
            }));
        } else if (segmentRules?.selectedTiers?.length) {
          // Tier-based targeting (exclude suppressed/unsubscribed)
          const customers = await prisma.customer.findMany({
            where: {
              shop: campaign.shop,
              email: { not: null },
              tierId: { in: segmentRules.selectedTiers },
              acceptsMarketing: true,
              emailSuppressed: false,
            },
            select: { id: true, email: true, firstName: true, lastName: true },
          });
          recipients = customers
            .filter((c) => c.email)
            .map((c) => ({
              email: c.email!,
              name: [c.firstName, c.lastName].filter(Boolean).join(" ") || undefined,
              customerId: c.id,
            }));
        } else {
          // All customers with email (exclude suppressed/unsubscribed)
          const customers = await prisma.customer.findMany({
            where: { shop: campaign.shop, email: { not: null }, acceptsMarketing: true, emailSuppressed: false },
            select: { id: true, email: true, firstName: true, lastName: true },
          });
          recipients = customers
            .filter((c) => c.email)
            .map((c) => ({
              email: c.email!,
              name: [c.firstName, c.lastName].filter(Boolean).join(" ") || undefined,
              customerId: c.id,
            }));
        }

        if (recipients.length === 0) {
          log('warn', `Campaign ${campaign.id} has zero recipients, marking as sent with 0`, {
            campaignId: campaign.id,
          });
        }

        // Send emails
        const sendResult = await sendCampaignEmails(campaign.shop, campaign.id, recipients);

        // Update campaign with results
        await prisma.emailCampaign.updateMany({
          where: { id: campaign.id, shop: campaign.shop },
          data: {
            status: 'sent',
            metrics: {
              sent: sendResult.sent,
              delivered: 0, // Actual delivery count comes from SendGrid webhook events
              opened: 0,
              clicked: 0,
              bounced: sendResult.failed,
              unsubscribed: 0,
              revenue: 0,
              orders: 0,
            },
            updatedAt: new Date(),
          },
        });

        results.sentCount++;
        results.details.push({
          type: 'sent',
          campaignId: campaign.id,
          name: campaign.name,
          shop: campaign.shop,
          recipientCount: recipients.length,
          sent: sendResult.sent,
          failed: sendResult.failed,
        });

        log('info', `Campaign ${campaign.id} sent: ${sendResult.sent} sent, ${sendResult.failed} failed`);
      } catch (error: any) {
        log('error', `Failed to send campaign ${campaign.id}`, { error: error.message });
        results.errors++;
        results.failedCount++;

        // Reset status to "scheduled" so it can be retried
        try {
          await prisma.emailCampaign.updateMany({
            where: { id: campaign.id, shop: campaign.shop, status: 'sending' },
            data: {
              status: 'failed',
              updatedAt: new Date(),
            },
          });
        } catch (resetError) {
          log('error', `Failed to reset campaign ${campaign.id} status`, {
            error: (resetError as Error).message,
          });
        }

        results.details.push({
          type: 'failed',
          campaignId: campaign.id,
          name: campaign.name,
          error: error.message,
        });
      }
    }

    // 6. Log summary
    const summary = {
      sent: results.sentCount,
      failed: results.failedCount,
      errorCount: results.errors,
      duration: Date.now() - startTime,
      dryRun: isDryRun,
    };

    log('info', 'Scheduled campaigns cron completed', summary);

    return json({
      success: true,
      correlationId,
      summary,
    });
  } catch (error: any) {
    log('error', 'Scheduled campaigns cron failed', { error: error.message });
    return json({
      success: false,
      correlationId,
      error: "Scheduled campaign processing failed",
    });
  } finally {
    if (lock.lockId) {
      await releaseCronLock(lock.lockId);
      log('info', 'Released distributed lock');
    }
  }
}
