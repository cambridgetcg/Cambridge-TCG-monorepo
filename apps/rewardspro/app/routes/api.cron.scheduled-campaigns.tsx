/**
 * Hourly cron job for processing scheduled email campaigns
 * - Mark campaigns more than LATE_LIMIT_HOURS past their time as "missed"
 *   (they piled up while email was off; old news is not sent)
 * - Mark campaigns whose send was cut off part way (still "sending" long
 *   after any send could be running) as "failed": they may have gone out, so
 *   they are never sent again by themselves
 * - Send up to CAMPAIGNS_PER_RUN due campaigns, oldest first, through
 *   sendCampaign() (services/campaign-send.server.ts), the same path as the
 *   send page's Send now; the rest wait for the next run
 * - sendCampaign marks each "sent", or "failed" with the reason
 * - The run answers 500 if any campaign couldn't be sent because RewardsPro
 *   or its email service failed (not when its audience or the monthly limit
 *   held it back), after trying the others
 *
 * Runs hourly at :15 (vercel.json: "15 * * * *")
 *
 * IMPORTANT: Uses distributed locking to prevent concurrent execution
 * across multiple Vercel regions.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { acquireCronLock, releaseCronLock, cleanupExpiredLocks } from "../services/cron-lock.server";
import { markCutOffSends, notSentMetrics, sendCampaign } from "../services/campaign-send.server";
import { marketingEmailBlockedReason } from "../services/marketing-email.server";
import * as crypto from "node:crypto";
import { verifyCronAuth } from "~/utils/cron-auth.server";

/** A campaign this late when email can go out is held back, not sent */
const LATE_LIMIT_HOURS = 24;
/** Campaigns sent per run, so a run ends well inside the function's time limit */
const CAMPAIGNS_PER_RUN = 10;

const MISSED_REASON = `It was more than ${LATE_LIMIT_HOURS} hours past its scheduled time when email could go out, so it was held back rather than sent late. Duplicate it to send it again.`;

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

  // Leave scheduled campaigns waiting while marketing email is switched off
  const blocked = marketingEmailBlockedReason();
  if (blocked) {
    log('warn', 'Marketing email is off; scheduled campaigns stay scheduled', { reason: blocked });
    return json({ success: true, skipped: true, reason: blocked, correlationId });
  }

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
    missedCount: 0,
    interruptedCount: 0,
    errors: 0,
    details: [] as any[]
  };

  const now = new Date();
  const lateCutoff = new Date(now.getTime() - LATE_LIMIT_HOURS * 60 * 60 * 1000);

  try {
    // 5. Hold back campaigns too late to send, and say why on each
    const tooLate = { status: 'scheduled', scheduledFor: { lt: lateCutoff } };
    results.missedCount = isDryRun
      ? await prisma.emailCampaign.count({ where: tooLate })
      : (await prisma.emailCampaign.updateMany({
          where: tooLate,
          data: { status: 'missed', metrics: notSentMetrics(MISSED_REASON), updatedAt: now },
        })).count;
    if (results.missedCount > 0) {
      log('warn', `${results.missedCount} scheduled campaigns were more than ${LATE_LIMIT_HOURS} hours late; marked missed`);
    }

    // 6. Sends cut off part way may have gone out: marked failed, and the run
    // fails so the operator sees that something stopped them
    results.interruptedCount = await markCutOffSends(now, isDryRun);
    if (results.interruptedCount > 0) {
      results.errors += results.interruptedCount;
      log('error', `${results.interruptedCount} campaigns were cut off while sending; marked failed, as they may have gone out`);
    }

    // 7. Find scheduled campaigns that are due, oldest first
    const dueCampaigns = await prisma.emailCampaign.findMany({
      where: {
        status: 'scheduled',
        scheduledFor: { gte: lateCutoff, lte: now },
      },
      orderBy: { scheduledFor: 'asc' },
      take: CAMPAIGNS_PER_RUN,
      select: {
        id: true,
        shop: true,
        name: true,
        scheduledFor: true,
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

        // Only moves to 'sending' if still 'scheduled', so Send now can't send it too
        const outcome = await sendCampaign(campaign.shop, campaign.id, 'scheduled');

        if (outcome.status === 'taken') {
          log('info', `Campaign ${campaign.id} is no longer scheduled; skipping`);
          continue;
        }

        if (outcome.status === 'not_sent') {
          results.failedCount++;
          if (outcome.cause === 'failed') results.errors++;
          results.details.push({ type: 'not_sent', campaignId: campaign.id, name: campaign.name, reason: outcome.reason, cause: outcome.cause });
          log(outcome.cause === 'failed' ? 'error' : 'warn', `Campaign ${campaign.id} not sent`, { reason: outcome.reason, cause: outcome.cause });
          continue;
        }

        // The email service gave no answer: marked failed, and not retried,
        // because some or all of its emails may have gone out
        if (outcome.status === 'may_have_sent') {
          results.failedCount++;
          results.errors++;
          results.details.push({ type: 'may_have_sent', campaignId: campaign.id, name: campaign.name, reason: outcome.reason });
          log('error', `Campaign ${campaign.id} may have been sent; the email service gave no answer`);
          continue;
        }

        results.sentCount++;
        results.details.push({
          type: 'sent',
          campaignId: campaign.id,
          name: campaign.name,
          shop: campaign.shop,
          recipientCount: outcome.recipients,
          sent: outcome.sent,
          failed: outcome.failed,
        });

        log('info', `Campaign ${campaign.id} sent: ${outcome.sent} sent, ${outcome.failed} failed`);
      } catch (error: any) {
        // sendCampaign has marked it failed. It is not retried, because some
        // of its emails may already have gone out.
        log('error', `Failed to send campaign ${campaign.id}`, { error: error.message });
        results.errors++;
        results.failedCount++;

        results.details.push({
          type: 'failed',
          campaignId: campaign.id,
          name: campaign.name,
          error: error.message,
        });
      }
    }

    // 8. Log summary
    const summary = {
      sent: results.sentCount,
      failed: results.failedCount,
      missed: results.missedCount,
      interrupted: results.interruptedCount,
      errorCount: results.errors,
      duration: Date.now() - startTime,
      dryRun: isDryRun,
    };

    // A campaign RewardsPro or its email service failed to send makes the
    // run fail, so Vercel and the operator see it
    const runFailed = results.errors > 0;
    log(runFailed ? 'error' : 'info', 'Scheduled campaigns cron completed', summary);

    return json({
      success: !runFailed,
      correlationId,
      summary,
    }, { status: runFailed ? 500 : 200 });
  } catch (error: any) {
    log('error', 'Scheduled campaigns cron failed', { error: error.message });
    return json({
      success: false,
      correlationId,
      error: "Scheduled campaign processing failed",
    }, { status: 500 });
  } finally {
    if (lock.lockId) {
      await releaseCronLock(lock.lockId);
      log('info', 'Released distributed lock');
    }
  }
}
