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
import { sendCampaignEmails } from "~/services/email-notifications.server";

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
  reachable: number;
  recommendedSegment: number; // Number of customers from recommendation
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
      metadata: dbCampaign.metadata as Campaign['metadata'],
    };
  } catch (e: any) {
    if (e instanceof Response) throw e;
    console.error("[Campaign Send] Error:", e);
    throw new Response("Error loading campaign", { status: 500 });
  }

  // Get audience stats
  let audienceStats: AudienceStats = { total: 0, withEmail: 0, reachable: 0, recommendedSegment: 0 };
  try {
    const customers = await prisma.customer.findMany({
      where: { shop },
    });
    audienceStats.total = customers.length;
    audienceStats.withEmail = customers.filter((c) => c.email).length;
    audienceStats.reachable = audienceStats.withEmail; // Simplified - would check subscription status

    // Calculate recommended segment count if campaign is from recommendation
    const segmentRules = campaign?.segmentRules as Campaign['segmentRules'];
    if (segmentRules?.fromRecommendation && segmentRules.targetCustomerIds?.length) {
      // Count how many of the target customers have valid emails
      const targetCustomers = await prisma.customer.findMany({
        where: {
          shop,
          id: { in: segmentRules.targetCustomerIds },
          email: { not: null },
        },
        select: { id: true },
      });
      audienceStats.recommendedSegment = targetCustomers.length;
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
          where: { shop, tierId: { in: tierIds } },
          select: { tierId: true },
        })
      : [];

    // Count customers per tier in memory
    const tierCountMap = new Map<string, number>();
    for (const customer of customerTierAssignments) {
      if (customer.tierId) {
        tierCountMap.set(customer.tierId, (tierCountMap.get(customer.tierId) || 0) + 1);
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

  return json({ campaign, audienceStats, tiers });
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

      // Get recipients based on filter
      let recipients: Array<{ email: string; name?: string; customerId?: string }> = [];

      if (sendToRecommended) {
        // Get the campaign to access targetCustomerIds
        const campaignData = await prisma.emailCampaign.findFirst({
          where: { id, shop },
          select: { segmentRules: true },
        });
        const segmentRules = campaignData?.segmentRules as any;
        const targetCustomerIds = segmentRules?.targetCustomerIds || [];

        if (targetCustomerIds.length > 0) {
          // Get customers from the recommendation segment (exclude suppressed/unsubscribed)
          const customers = await prisma.customer.findMany({
            where: {
              shop,
              id: { in: targetCustomerIds },
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
        }
      } else if (sendToAll) {
        // Get all customers with email (exclude suppressed/unsubscribed)
        const customers = await prisma.customer.findMany({
          where: { shop, email: { not: null }, acceptsMarketing: true, emailSuppressed: false },
          select: { id: true, email: true, firstName: true, lastName: true },
        });
        recipients = customers
          .filter((c) => c.email)
          .map((c) => ({
            email: c.email!,
            name: [c.firstName, c.lastName].filter(Boolean).join(" ") || undefined,
            customerId: c.id,
          }));
      } else if (selectedTiers.length > 0) {
        // Get customers in selected tiers (exclude suppressed/unsubscribed)
        const customers = await prisma.customer.findMany({
          where: {
            shop,
            email: { not: null },
            tierId: { in: selectedTiers },
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
      }

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
  const { campaign, audienceStats, tiers } = useLoaderData<typeof loader>();
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
