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
import { MARKETING_EMAIL_OFF, marketingEmailBlockedReason } from "./marketing-email.server";

export type CampaignAudience =
  | { kind: "all" }
  | { kind: "tiers"; tierIds: string[] }
  | { kind: "customers"; customerIds: string[] };

export type CampaignSendOutcome =
  | { status: "sent"; recipients: number; sent: number; failed: number }
  /**
   * Nothing went out. "refused": RewardsPro held it back for something about
   * the campaign or the shop (its audience, the monthly limit, Klaviyo,
   * email switched off). "failed": RewardsPro or its email service failed.
   */
  | { status: "not_sent"; reason: string; cause: "refused" | "failed" }
  /** Someone else is sending it, or it is no longer in the state the caller saw */
  | { status: "taken" };

const UNKNOWN_AUDIENCE = "RewardsPro couldn't tell who this campaign is for. Duplicate it and choose the audience again.";
const NO_RECIPIENTS = "No recipients match your audience selection. Adjust your filters and try again.";
const NO_ONE_AGREED = "When it was due, no one in its audience had agreed to marketing email, so nothing was sent.";
const COULD_NOT_SEND = {
  draft: "RewardsPro couldn't send this campaign just now. Try again later.",
  scheduled: "RewardsPro couldn't send this campaign when it was due, so nothing was sent. Duplicate it to try again.",
};
const WENT_WRONG_BEFORE_SENDING = "Something went wrong before this campaign was sent, so nothing went out. Duplicate it to send it again.";
const MAY_HAVE_GONE_OUT =
  "Something went wrong while this campaign was sending, and some customers may have received it. RewardsPro won't send it again by itself, because that could email them twice.";

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

const NO_METRICS = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0, revenue: 0, orders: 0 };

/** Metrics for a campaign that sent nothing, with the reason the merchant sees on it. */
export function notSentMetrics(reason: string): Prisma.InputJsonObject {
  return { ...NO_METRICS, notSentReason: reason };
}

/**
 * Send a 'draft' (Send now, Send immediately) or 'scheduled' (the cron)
 * campaign to the audience saved on it, or to `segmentRules` saved with it
 * as it is taken. It moves to 'sending' only from `from`, so when two
 * requests race, one sends and the other is "taken".
 * When nothing goes out, a draft stays a draft with the audience it had (the
 * caller shows the reason), and a scheduled campaign is marked 'failed' with
 * the reason. If something goes wrong once the email service may have sent
 * some of it, it is marked failed, never put back to draft.
 */
export async function sendCampaign(
  shop: string,
  campaignId: string,
  from: "draft" | "scheduled",
  segmentRules?: Prisma.InputJsonObject,
): Promise<CampaignSendOutcome> {
  if (marketingEmailBlockedReason()) return { status: "not_sent", reason: MARKETING_EMAIL_OFF, cause: "refused" };

  // The audience saved before this send, put back if the draft doesn't go out
  const before = segmentRules
    ? await prisma.emailCampaign.findFirst({ where: { id: campaignId, shop, status: from }, select: { segmentRules: true } })
    : null;
  const claimed = await prisma.emailCampaign.updateMany({
    where: { id: campaignId, shop, status: from },
    data: { status: "sending", sentAt: new Date(), updatedAt: new Date(), ...(segmentRules && { segmentRules }) },
  });
  if (claimed.count !== 1) return { status: "taken" };

  const backToDraft = () => ({
    status: "draft",
    sentAt: null,
    updatedAt: new Date(),
    ...(before && { segmentRules: before.segmentRules as Prisma.InputJsonValue }),
  });
  const failedUnsent = (reason: string) => ({ status: "failed", sentAt: null, metrics: notSentMetrics(reason), updatedAt: new Date() });
  const notSent = async (reason: string, cause: "refused" | "failed"): Promise<CampaignSendOutcome> => {
    await prisma.emailCampaign.updateMany({
      where: { id: campaignId, shop, status: "sending" },
      data: from === "draft" ? backToDraft() : failedUnsent(reason),
    });
    return { status: "not_sent", reason, cause };
  };

  let handedOff = false;
  try {
    const campaign = await prisma.emailCampaign.findFirstOrThrow({
      where: { id: campaignId, shop },
      select: { segmentRules: true, templateId: true, subject: true },
    });
    const audience = campaignAudience(campaign.segmentRules);
    if (!audience) return await notSent(UNKNOWN_AUDIENCE, "refused");

    const recipients = await campaignRecipients(shop, audience);
    if (recipients.length === 0) return await notSent(from === "draft" ? NO_RECIPIENTS : NO_ONE_AGREED, "refused");

    // Snapshot the template at send time for the audit trail
    let templateSnapshot: { subject?: string; htmlContent?: string } = {};
    try {
      const template = await prisma.emailTemplate.findFirst({
        where: { id: campaign.templateId, shop },
        select: { subject: true, htmlContent: true, bodyHtml: true },
      });
      if (template) {
        templateSnapshot = {
          subject: campaign.subject || template.subject || undefined,
          htmlContent: template.htmlContent || template.bodyHtml || undefined,
        };
      }
    } catch {
      // Non-critical: send without the snapshot
    }

    // From here the email service may send it
    handedOff = true;
    const result = await sendCampaignEmails(shop, campaignId, recipients);
    if (result.sent === 0) {
      if (result.refused) return await notSent(result.refused, "refused");
      // Everyone left the audience (stopped agreeing to marketing) since it was read
      if (result.errors.length === 0) return await notSent(from === "draft" ? NO_RECIPIENTS : NO_ONE_AGREED, "refused");
      // The provider's own words are for the operator, not the merchant
      console.error(`[Campaign] The email service didn't send campaign ${campaignId} for ${shop}:`, result.errors);
      return await notSent(COULD_NOT_SEND[from], "failed");
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
    // Once the email service has it, some of it may have gone out, so it is
    // marked failed and never sent again by itself. Before that, a draft goes
    // back to draft so it isn't stuck, and a scheduled campaign says nothing went out.
    try {
      await prisma.emailCampaign.updateMany({
        where: { id: campaignId, shop, status: "sending" },
        data: handedOff
          ? { status: "failed", metrics: { ...NO_METRICS, interruptedReason: MAY_HAVE_GONE_OUT }, updatedAt: new Date() }
          : from === "draft"
            ? backToDraft()
            : failedUnsent(WENT_WRONG_BEFORE_SENDING),
      });
    } catch (resetError) {
      console.error(`[Campaign] Failed to reset campaign ${campaignId} status:`, resetError);
    }
    throw error;
  }
}
