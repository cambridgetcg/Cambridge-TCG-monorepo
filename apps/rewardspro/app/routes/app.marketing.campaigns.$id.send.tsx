import { json, redirect } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, Form, useActionData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Banner,
  Checkbox,
  Divider,
  Box,
  Badge,
  TextField,
  Select,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import type { Prisma } from "@prisma/client";
import { sendCampaignEmails } from "~/services/email-notifications.server";
import { MARKETING_AUDIENCE } from "~/services/marketing-consent.server";
import { marketingEmailBlockedReason } from "~/services/marketing-email.server";

interface Campaign {
  id: string;
  name: string;
  subject: string;
  previewText: string;
  status: string;
  templateId: string | null;
  // Recommendation-based targeting
  segmentRules?: {
    fromRecommendation?: boolean;
    recommendationType?: string;
    targetCustomerIds?: string[];
    criteria?: any[];
    affectedCount?: number;
    predictedRevenue?: number;
  };
  metadata?: {
    source?: string;
    recommendationId?: string;
    recommendationType?: string;
    affectedCount?: number;
    predictedRevenue?: number;
  };
}

interface AudienceStats {
  total: number;
  withEmail: number;
  reachable: number; // Customers who consent to marketing email
  recommendedSegment: number; // Consenting customers from recommendation
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const { id } = params;

  if (!id) {
    throw new Response("Campaign ID required", { status: 400 });
  }

  // Fetch campaign
  let campaign: Campaign | null = null;
  try {
    const dbCampaign = await prisma.emailCampaign.findFirst({
      where: { id, shop },
    });

    if (!dbCampaign) {
      throw new Response("Campaign not found", { status: 404 });
    }

    if (dbCampaign.status !== "draft") {
      return redirect(`/app/marketing/campaigns/${id}`);
    }

    campaign = {
      id: dbCampaign.id,
      name: dbCampaign.name,
      subject: dbCampaign.subject || "",
      previewText: dbCampaign.previewText || "",
      status: dbCampaign.status,
      templateId: dbCampaign.templateId,
      segmentRules: dbCampaign.segmentRules as Campaign['segmentRules'],
    };
    // Recommendation context is stored alongside the targeting in segmentRules
    campaign.metadata = campaign.segmentRules?.fromRecommendation
      ? {
          source: 'analytics_recommendation',
          recommendationType: campaign.segmentRules.recommendationType,
          affectedCount: campaign.segmentRules.affectedCount,
          predictedRevenue: campaign.segmentRules.predictedRevenue,
        }
      : undefined;
  } catch (e: any) {
    if (e instanceof Response) throw e;
    console.error("[Campaign Send] Error:", e);
    throw new Response("Error loading campaign", { status: 500 });
  }

  // Get audience stats: only customers who consent can receive the campaign
  let audienceStats: AudienceStats = { total: 0, withEmail: 0, reachable: 0, recommendedSegment: 0 };
  try {
    const [total, withEmail, reachable] = await Promise.all([
      prisma.customer.count({ where: { shop } }),
      prisma.customer.count({ where: { shop, email: { not: "" } } }),
      prisma.customer.count({ where: { shop, ...MARKETING_AUDIENCE } }),
    ]);
    audienceStats = { total, withEmail, reachable, recommendedSegment: 0 };

    // Calculate recommended segment count if campaign is from recommendation
    const segmentRules = campaign?.segmentRules as Campaign['segmentRules'];
    if (segmentRules?.fromRecommendation && segmentRules.targetCustomerIds?.length) {
      audienceStats.recommendedSegment = await prisma.customer.count({
        where: { shop, ...MARKETING_AUDIENCE, id: { in: segmentRules.targetCustomerIds } },
      });
    }
  } catch (e) {
    // Table might not exist
  }

  // Get tiers for segmentation
  let tiers: { id: string; name: string; customerCount: number }[] = [];
  try {
    const dbTiers = await prisma.tier.findMany({
      where: { shop },
      orderBy: { minSpend: "asc" },
    });

    // DATA API COMPATIBLE: Batch count instead of N+1 queries
    const tierIds = dbTiers.map(t => t.id);
    const customerTierAssignments = tierIds.length > 0
      ? await prisma.customer.findMany({
          where: { shop, ...MARKETING_AUDIENCE, currentTierId: { in: tierIds } },
          select: { currentTierId: true },
        })
      : [];

    // Count customers per tier in memory
    const tierCountMap = new Map<string, number>();
    for (const customer of customerTierAssignments) {
      if (customer.currentTierId) {
        tierCountMap.set(customer.currentTierId, (tierCountMap.get(customer.currentTierId) || 0) + 1);
      }
    }

    for (const tier of dbTiers) {
      tiers.push({
        id: tier.id,
        name: tier.name,
        customerCount: tierCountMap.get(tier.id) || 0,
      });
    }
  } catch (e) {
    // Tables might not exist
  }

  return json({ campaign, audienceStats, tiers, marketingBlocked: marketingEmailBlockedReason() });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const { id } = params;

  if (!id) {
    return json({ error: "Campaign ID required" }, { status: 400 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  // Server-side switch: no marketing email while it cannot be sent safely
  const blocked = marketingEmailBlockedReason();
  if (blocked && (intent === "send_now" || intent === "schedule")) {
    return json({ error: blocked }, { status: 409 });
  }

  if (intent === "send_now") {
    try {
      // Get audience filter from form
      const sendToAll = formData.get("sendToAll") === "true";
      const sendToRecommended = formData.get("sendToRecommended") === "true";
      const selectedTiers = formData.getAll("selectedTiers") as string[];

      // Update campaign status to sending
      await prisma.emailCampaign.updateMany({
        where: { id, shop },
        data: {
          status: "sending",
          sentAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Get recipients based on filter; only customers who consent to
      // marketing (sendCampaignEmails checks again)
      const audience = { shop, ...MARKETING_AUDIENCE };
      let where: Prisma.CustomerWhereInput | null = null;

      if (sendToRecommended) {
        // Get the campaign to access targetCustomerIds
        const campaignData = await prisma.emailCampaign.findFirst({
          where: { id, shop },
          select: { segmentRules: true },
        });
        const segmentRules = campaignData?.segmentRules as any;
        const targetCustomerIds = segmentRules?.targetCustomerIds || [];
        if (targetCustomerIds.length > 0) {
          where = { ...audience, id: { in: targetCustomerIds } };
        }
      } else if (sendToAll) {
        where = audience;
      } else if (selectedTiers.length > 0) {
        where = { ...audience, currentTierId: { in: selectedTiers } };
      }

      const recipients = where
        ? (await prisma.customer.findMany({ where, select: { id: true } })).map((c) => ({ customerId: c.id }))
        : [];

      // Guard: prevent sending to zero recipients
      if (recipients.length === 0) {
        // Reset status back to draft
        await prisma.emailCampaign.updateMany({
          where: { id, shop, status: "sending" },
          data: { status: "draft", updatedAt: new Date() },
        });
        return json(
          { error: "No recipients match your audience selection. Adjust your filters and try again." },
          { status: 400 }
        );
      }

      // Snapshot template HTML at send time for audit trail
      let templateSnapshot: { subject?: string; htmlContent?: string } = {};
      try {
        const campaignData = await prisma.emailCampaign.findFirst({
          where: { id, shop },
          select: { templateId: true, subject: true },
        });
        if (campaignData?.templateId) {
          const tmpl = await prisma.emailTemplate.findFirst({
            where: { id: campaignData.templateId, shop },
            select: { subject: true, htmlContent: true },
          });
          if (tmpl) {
            templateSnapshot = {
              subject: campaignData.subject || tmpl.subject || undefined,
              htmlContent: tmpl.htmlContent || undefined,
            };
          }
        }
      } catch (e) {
        // Non-critical — proceed with send even if snapshot fails
      }

      // Send emails
      const sendResult = await sendCampaignEmails(shop, id, recipients);

      // Update campaign with results + template snapshot
      await prisma.emailCampaign.updateMany({
        where: { id, shop },
        data: {
          status: "sent",
          metrics: {
            sent: sendResult.sent,
            delivered: 0, // Actual delivery count comes from SendGrid webhook events
            opened: 0,
            clicked: 0,
            bounced: sendResult.failed,
            unsubscribed: 0,
            revenue: 0,
            orders: 0,
            templateSnapshot,
          },
          updatedAt: new Date(),
        },
      });

      console.log(`[Campaign] Sent campaign ${id}: ${sendResult.sent} sent, ${sendResult.failed} failed`);

      return redirect(`/app/marketing/campaigns/${id}`);
    } catch (e: any) {
      console.error(`[Campaign] Error sending campaign:`, e);
      // Reset status from "sending" back to "draft" so campaign isn't orphaned
      try {
        await prisma.emailCampaign.updateMany({
          where: { id, shop, status: "sending" },
          data: { status: "draft", updatedAt: new Date() },
        });
      } catch (resetError) {
        console.error(`[Campaign] Failed to reset campaign status:`, resetError);
      }
      return json({ error: e.message }, { status: 500 });
    }
  }

  if (intent === "schedule") {
    const scheduledFor = formData.get("scheduledFor") as string;

    if (!scheduledFor) {
      return json({ error: "Schedule date is required" }, { status: 400 });
    }

    try {
      await prisma.emailCampaign.updateMany({
        where: { id, shop },
        data: {
          status: "scheduled",
          scheduledFor: new Date(scheduledFor),
          updatedAt: new Date(),
        },
      });

      return redirect(`/app/marketing/campaigns/${id}`);
    } catch (e: any) {
      return json({ error: e.message }, { status: 500 });
    }
  }

  return json({ error: "Unknown action" }, { status: 400 });
};

export default function SendCampaign() {
  const { campaign, audienceStats, tiers, marketingBlocked } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();

  const [sendOption, setSendOption] = useState<"now" | "schedule">("now");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [selectedTiers, setSelectedTiers] = useState<string[]>([]);

  // Check if campaign is from a recommendation
  const isFromRecommendation = campaign.segmentRules?.fromRecommendation;
  const hasRecommendedSegment = (campaign.segmentRules?.targetCustomerIds?.length ?? 0) > 0;

  // Default to recommended segment if available, otherwise all
  const [audienceType, setAudienceType] = useState<"recommended" | "all" | "tiers">(
    isFromRecommendation && hasRecommendedSegment ? "recommended" : "all"
  );
  const sendToAll = audienceType === "all";
  const sendToRecommended = audienceType === "recommended";

  const handleTierToggle = (tierId: string) => {
    if (selectedTiers.includes(tierId)) {
      setSelectedTiers(selectedTiers.filter((id) => id !== tierId));
    } else {
      setSelectedTiers([...selectedTiers, tierId]);
    }
  };

  const getEstimatedRecipients = () => {
    if (sendToRecommended) {
      return audienceStats.recommendedSegment;
    }
    if (sendToAll) {
      return audienceStats.reachable;
    }
    return tiers
      .filter((t) => selectedTiers.includes(t.id))
      .reduce((sum, t) => sum + t.customerCount, 0);
  };

  // Helper to get recommendation type label
  const getRecommendationTypeLabel = (type?: string) => {
    const labels: Record<string, string> = {
      inactive_customers: "Re-engagement",
      tier_upgrade_opportunity: "Tier Upgrade",
      expiring_rewards: "Reward Expiry",
      vip_at_risk: "VIP Retention",
      birthday_upcoming: "Birthday",
      low_balance_reengagement: "Balance Reminder",
    };
    return labels[type || ""] || type || "Analytics";
  };

  return (
    <Page
      title="Send Campaign"
      subtitle={campaign.name}
      backAction={{
        content: "Campaign",
        onAction: () => navigate(`/app/marketing/campaigns/${campaign.id}`),
      }}
    >
      <Layout>
        {actionData?.error && (
          <Layout.Section>
            <Banner tone="critical" title="Error">
              <p>{actionData.error}</p>
            </Banner>
          </Layout.Section>
        )}

        {marketingBlocked && (
          <Layout.Section>
            <Banner tone="warning" title="Marketing email is off">
              <p>{marketingBlocked}</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Banner tone="info">
            <p>
              Campaigns go only to customers who subscribed to email marketing in Shopify and have not
              unsubscribed. Every email includes an unsubscribe link.
            </p>
          </Banner>
        </Layout.Section>

        {/* Campaign Preview */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Campaign Preview
              </Text>
              <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text as="span" tone="subdued">Subject:</Text>
                    <Text as="span" fontWeight="semibold">{campaign.subject}</Text>
                  </InlineStack>
                  {campaign.previewText && (
                    <InlineStack align="space-between">
                      <Text as="span" tone="subdued">Preview:</Text>
                      <Text as="span">{campaign.previewText}</Text>
                    </InlineStack>
                  )}
                </BlockStack>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Recommendation Context Banner */}
        {isFromRecommendation && (
          <Layout.Section>
            <Banner
              title="Campaign from Analytics Recommendation"
              tone="info"
            >
              <BlockStack gap="200">
                <Text as="p" variant="bodySm">
                  This campaign was created from a <strong>{getRecommendationTypeLabel(campaign.metadata?.recommendationType)}</strong> recommendation.
                  {campaign.metadata?.affectedCount && (
                    <> It targets <strong>{campaign.metadata.affectedCount} customers</strong> identified by analytics.</>
                  )}
                  {campaign.metadata?.predictedRevenue && (
                    <> Predicted revenue: <strong>${campaign.metadata.predictedRevenue.toLocaleString()}</strong>.</>
                  )}
                </Text>
              </BlockStack>
            </Banner>
          </Layout.Section>
        )}

        {/* Audience Selection */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Audience
              </Text>

              {/* Recommended Segment Option (if from recommendation) */}
              {isFromRecommendation && hasRecommendedSegment && (
                <Checkbox
                  label={`Send to recommended segment (${audienceStats.recommendedSegment} customers from analytics)`}
                  checked={audienceType === "recommended"}
                  onChange={(checked) => setAudienceType(checked ? "recommended" : "all")}
                />
              )}

              {/* All Customers Option */}
              {(!isFromRecommendation || !hasRecommendedSegment || audienceType !== "recommended") && (
                <Checkbox
                  label="Send to all reachable customers"
                  checked={audienceType === "all"}
                  onChange={(checked) => setAudienceType(checked ? "all" : "tiers")}
                />
              )}

              {/* Tier Selection */}
              {audienceType === "tiers" && tiers.length > 0 && (
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Select tiers to target:
                  </Text>
                  {tiers.map((tier) => (
                    <Checkbox
                      key={tier.id}
                      label={`${tier.name} (${tier.customerCount} customers)`}
                      checked={selectedTiers.includes(tier.id)}
                      onChange={() => handleTierToggle(tier.id)}
                    />
                  ))}
                </BlockStack>
              )}

              <Divider />

              <InlineStack align="space-between">
                <Text as="span">Estimated recipients:</Text>
                <Badge tone={sendToRecommended ? "success" : "info"}>
                  {`${getEstimatedRecipients().toLocaleString()}${sendToRecommended ? " (targeted)" : ""}`}
                </Badge>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Send Options */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                When to Send
              </Text>

              <InlineStack gap="400">
                <Button
                  variant={sendOption === "now" ? "primary" : "secondary"}
                  onClick={() => setSendOption("now")}
                >
                  Send Now
                </Button>
                <Button
                  variant={sendOption === "schedule" ? "primary" : "secondary"}
                  onClick={() => setSendOption("schedule")}
                >
                  Schedule
                </Button>
              </InlineStack>

              {sendOption === "schedule" && (
                <InlineStack gap="400">
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="Date"
                      type="date"
                      value={scheduledDate}
                      onChange={setScheduledDate}
                      autoComplete="off"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Select
                      label="Time"
                      options={[
                        { label: "6:00 AM", value: "06:00" },
                        { label: "7:00 AM", value: "07:00" },
                        { label: "8:00 AM", value: "08:00" },
                        { label: "9:00 AM", value: "09:00" },
                        { label: "10:00 AM", value: "10:00" },
                        { label: "11:00 AM", value: "11:00" },
                        { label: "12:00 PM", value: "12:00" },
                        { label: "1:00 PM", value: "13:00" },
                        { label: "2:00 PM", value: "14:00" },
                        { label: "3:00 PM", value: "15:00" },
                        { label: "4:00 PM", value: "16:00" },
                        { label: "5:00 PM", value: "17:00" },
                        { label: "6:00 PM", value: "18:00" },
                        { label: "7:00 PM", value: "19:00" },
                        { label: "8:00 PM", value: "20:00" },
                        { label: "9:00 PM", value: "21:00" },
                        { label: "10:00 PM", value: "22:00" },
                      ]}
                      value={scheduledTime}
                      onChange={setScheduledTime}
                    />
                  </div>
                </InlineStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Action Buttons */}
        <Layout.Section>
          <InlineStack align="end" gap="200">
            <Button onClick={() => navigate(`/app/marketing/campaigns/${campaign.id}`)}>
              Cancel
            </Button>
            <Form method="post">
              {/* Audience filter data */}
              <input type="hidden" name="sendToAll" value={sendToAll.toString()} />
              <input type="hidden" name="sendToRecommended" value={sendToRecommended.toString()} />
              {selectedTiers.map((tierId) => (
                <input key={tierId} type="hidden" name="selectedTiers" value={tierId} />
              ))}

              {sendOption === "now" ? (
                <>
                  <input type="hidden" name="intent" value="send_now" />
                  <Button variant="primary" submit tone="success">
                    Send Campaign Now
                  </Button>
                </>
              ) : (
                <>
                  <input type="hidden" name="intent" value="schedule" />
                  <input
                    type="hidden"
                    name="scheduledFor"
                    value={`${scheduledDate}T${scheduledTime}:00`}
                  />
                  <Button
                    variant="primary"
                    submit
                    disabled={!scheduledDate}
                  >
                    Schedule Campaign
                  </Button>
                </>
              )}
            </Form>
          </InlineStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
