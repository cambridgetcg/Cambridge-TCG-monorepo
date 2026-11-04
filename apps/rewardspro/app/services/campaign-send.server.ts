/**
 * Sending one email campaign. The send page's Send now, the Create page's
 * Send immediately and the scheduled-campaigns cron all come here, so they
 * read the audience the same way and a campaign goes out once.
 *
 * A campaign's audience is saved in EmailCampaign.segmentRules as exactly one
 * of these (a recommendation's context may sit beside it):
 *   { allCustomers: true }                                  everyone who agreed to marketing
 *   { tierIds: [...] }                                      those of them in these tiers
 *   { fromRecommendation: true, targetCustomerIds: [...] }  those of them a recommendation picked
 * Anything else can't be read, and then nothing is sent.
 */

import type { Prisma } from "@prisma/client";
import prisma from "~/db.server";
import { jsonObject } from "~/utils/json-object";
import { usableTimeZone } from "~/utils/zoned-time";
import { sendCampaignEmails } from "./email-notifications.server";
import { MARKETING_AUDIENCE } from "./marketing-consent.server";
import { marketingEmailBlockedReason } from "./marketing-email.server";

export type CampaignAudience =
  | { kind: "all" }
  | { kind: "tiers"; tierIds: string[] }
  | { kind: "customers"; customerIds: string[] };

export type CampaignSendOutcome =
  | { status: "sent"; recipients: number; sent: number; failed: number }
  | { status: "not_sent"; reason: string }
  /** Someone else is sending it, or it is no longer in the state the caller saw */
  | { status: "taken" };

const UNKNOWN_AUDIENCE = "RewardsPro couldn't tell who this campaign is for. Duplicate it and choose the audience again.";
const NO_RECIPIENTS = "No recipients match your audience selection. Adjust your filters and try again.";

function stringList(value: Prisma.JsonValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v !== "") : [];
}

/** Who a campaign is for, from its segmentRules, or null when that can't be told. */
export function campaignAudience(segmentRules: Prisma.JsonValue | undefined): CampaignAudience | null {
  const rules = jsonObject(segmentRules);
  const found: CampaignAudience[] = [];
  if (rules.allCustomers === true) found.push({ kind: "all" });
  const tierIds = stringList(rules.tierIds);
  // Before this shape was settled, the Create page saved "All Customers" as tierIds ["all"]
  if (tierIds.length === 1 && tierIds[0] === "all") found.push({ kind: "all" });
  else if (tierIds.length > 0) found.push({ kind: "tiers", tierIds });
  const customerIds = rules.fromRecommendation === true ? stringList(rules.targetCustomerIds) : [];
  if (customerIds.length > 0) found.push({ kind: "customers", customerIds });
  return found.length === 1 ? found[0] : null;
}

/** `segmentRules` with `audience` as its one audience, keeping any recommendation context. */
export function withCampaignAudience(
  segmentRules: Prisma.JsonValue | undefined,
  audience: CampaignAudience,
): Prisma.InputJsonObject {
  const context = { ...jsonObject(segmentRules) };
  delete context.allCustomers;
  delete context.tierIds;
  delete context.targetCustomerIds;
  if (audience.kind === "all") return { ...context, allCustomers: true };
  if (audience.kind === "tiers") return { ...context, tierIds: audience.tierIds };
  return { ...context, fromRecommendation: true, targetCustomerIds: audience.customerIds };
}

/** The customers an audience reaches: only those who agreed to marketing (sendMarketingEmail checks again). */
export async function campaignRecipients(shop: string, audience: CampaignAudience): Promise<Array<{ customerId: string }>> {
  const where: Prisma.CustomerWhereInput = { shop, ...MARKETING_AUDIENCE };
  if (audience.kind === "tiers") where.currentTierId = { in: audience.tierIds };
  if (audience.kind === "customers") where.id = { in: audience.customerIds };
  const customers = await prisma.customer.findMany({ where, select: { id: true } });
  return customers.map((c) => ({ customerId: c.id }));
}

/** The shop's time zone: Shopify's shop.ianaTimezone, saved in ShopSettings when the app opens. */
export async function shopTimeZone(shop: string): Promise<string> {
  const settings = await prisma.shopSettings.findUnique({ where: { shop }, select: { timezone: true } });
  return usableTimeZone(settings?.timezone);
}

/** Metrics for a campaign that sent nothing, with the reason the merchant sees on it. */
export function notSentMetrics(reason: string): Prisma.InputJsonObject {
  return { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0, revenue: 0, orders: 0, notSentReason: reason };
}

/**
 * Send a 'draft' (Send now, Send immediately) or 'scheduled' (the cron)
 * campaign to the audience saved on it, or to `segmentRules` saved with it
 * as it is taken. It moves to 'sending' only from `from`, so when two
 * requests race, one sends and the other is "taken".
 * When nothing goes out, a draft stays a draft (the caller shows the reason)
 * and a scheduled campaign is marked 'failed' with the reason.
 */
export async function sendCampaign(
  shop: string,
  campaignId: string,
  from: "draft" | "scheduled",
  segmentRules?: Prisma.InputJsonObject,
): Promise<CampaignSendOutcome> {
  const blocked = marketingEmailBlockedReason();
  if (blocked) return { status: "not_sent", reason: blocked };

  const claimed = await prisma.emailCampaign.updateMany({
    where: { id: campaignId, shop, status: from },
    data: { status: "sending", sentAt: new Date(), updatedAt: new Date(), ...(segmentRules && { segmentRules }) },
  });
  if (claimed.count !== 1) return { status: "taken" };

  const notSent = async (reason: string): Promise<CampaignSendOutcome> => {
    await prisma.emailCampaign.updateMany({
      where: { id: campaignId, shop, status: "sending" },
      data:
        from === "draft"
          ? { status: "draft", sentAt: null, updatedAt: new Date() }
          : { status: "failed", metrics: notSentMetrics(reason), updatedAt: new Date() },
    });
    return { status: "not_sent", reason };
  };

  try {
    const campaign = await prisma.emailCampaign.findFirstOrThrow({
      where: { id: campaignId, shop },
      select: { segmentRules: true, templateId: true, subject: true },
    });
    const audience = campaignAudience(campaign.segmentRules);
    if (!audience) return await notSent(UNKNOWN_AUDIENCE);

    const recipients = await campaignRecipients(shop, audience);
    // A draft goes back to the merchant to choose again; a scheduled
    // campaign that reaches no one is recorded as sent to 0
    if (recipients.length === 0 && from === "draft") return await notSent(NO_RECIPIENTS);

    // Snapshot the template at send time for the audit trail
    let templateSnapshot: { subject?: string; htmlContent?: string } = {};
    try {
      const template = await prisma.emailTemplate.findFirst({
        where: { id: campaign.templateId, shop },
        select: { subject: true, htmlContent: true },
      });
      if (template) {
        templateSnapshot = {
          subject: campaign.subject || template.subject || undefined,
          htmlContent: template.htmlContent || undefined,
        };
      }
    } catch {
      // Non-critical: send without the snapshot
    }

    const result = await sendCampaignEmails(shop, campaignId, recipients);
    if (result.sent === 0 && result.failed > 0) {
      return await notSent(result.errors[0] || "The email service didn't accept this campaign.");
    }

    await prisma.emailCampaign.updateMany({
      where: { id: campaignId, shop, status: "sending" },
      data: {
        status: "sent",
        metrics: {
          sent: result.sent,
          delivered: 0, // Actual delivery count comes from SendGrid webhook events
          opened: 0,
          clicked: 0,
          bounced: result.failed,
          unsubscribed: 0,
          revenue: 0,
          orders: 0,
          templateSnapshot,
        },
        updatedAt: new Date(),
      },
    });
    return { status: "sent", recipients: recipients.length, sent: result.sent, failed: result.failed };
  } catch (error) {
    // A draft goes back to draft so it isn't stuck. A scheduled campaign is
    // marked failed and never retried, since some of it may have gone out.
    try {
      await prisma.emailCampaign.updateMany({
        where: { id: campaignId, shop, status: "sending" },
        data: from === "draft" ? { status: "draft", sentAt: null, updatedAt: new Date() } : { status: "failed", updatedAt: new Date() },
      });
    } catch (resetError) {
      console.error(`[Campaign] Failed to reset campaign ${campaignId} status:`, resetError);
    }
    throw error;
  }
}
