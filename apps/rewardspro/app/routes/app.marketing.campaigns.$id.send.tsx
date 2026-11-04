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
import {
  type CampaignAudience,
  campaignAudience,
  sendCampaign,
  shopTimeZone,
  withCampaignAudience,
} from "~/services/campaign-send.server";
import { MARKETING_AUDIENCE } from "~/services/marketing-consent.server";
import { MARKETING_EMAIL_OFF, marketingEmailBlockedReason } from "~/services/marketing-email.server";
import { zonedTimeToUtc } from "~/utils/zoned-time";

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
  let audience: CampaignAudience | null = null;
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
    // The page opens on the audience saved on the campaign
    audience = campaignAudience(dbCampaign.segmentRules);
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

  return json({
    campaign,
    audience,
    audienceStats,
    tiers,
    marketingBlocked: marketingEmailBlockedReason() ? MARKETING_EMAIL_OFF : null,
    timeZone: await shopTimeZone(shop),
  });
};

const NOT_A_DRAFT = "This campaign has already been scheduled or sent. Reload the page to see where it is.";
const SEND_WENT_WRONG = "Something went wrong while sending this campaign. Reload the page to see whether it went out before you try again.";

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
  if (marketingEmailBlockedReason() && (intent === "send_now" || intent === "schedule")) {
    return json({ error: MARKETING_EMAIL_OFF }, { status: 409 });
  }

  if (intent !== "send_now" && intent !== "schedule") {
    return json({ error: "Unknown action" }, { status: 400 });
  }

  // The audience chosen on this page, saved on the campaign either way so
  // Send now and the scheduled send read the same thing
  const draft = await prisma.emailCampaign.findFirst({
    where: { id, shop, status: "draft" },
    select: { segmentRules: true },
  });
  if (!draft) {
    return json({ error: NOT_A_DRAFT }, { status: 409 });
  }
  const selectedTiers = formData.getAll("selectedTiers") as string[];
  const recommended = (draft.segmentRules as Campaign["segmentRules"])?.targetCustomerIds ?? [];
  const audience: CampaignAudience | null =
    formData.get("sendToRecommended") === "true"
      ? recommended.length > 0 ? { kind: "customers", customerIds: recommended } : null
      : formData.get("sendToAll") === "true"
        ? { kind: "all" }
        : selectedTiers.length > 0 ? { kind: "tiers", tierIds: selectedTiers } : null;
  if (!audience) {
    return json(
      { error: "No recipients match your audience selection. Adjust your filters and try again." },
      { status: 400 }
    );
  }
  const segmentRules = withCampaignAudience(draft.segmentRules, audience);

  if (intent === "send_now") {
    try {
      // Saves the audience as it takes the draft: pressing twice, or sending
      // one scheduled in another tab, finds it no longer a draft
      const outcome = await sendCampaign(shop, id, "draft", segmentRules);

      if (outcome.status === "taken") {
        return json({ error: NOT_A_DRAFT }, { status: 409 });
      }
      if (outcome.status === "not_sent") {
        return json({ error: outcome.reason }, { status: 400 });
      }

      console.log(`[Campaign] Sent campaign ${id}: ${outcome.sent} sent, ${outcome.failed} failed`);

      return redirect(`/app/marketing/campaigns/${id}`);
    } catch (e: any) {
      console.error(`[Campaign] Error sending campaign ${id}:`, e);
      return json({ error: SEND_WENT_WRONG }, { status: 500 });
    }
  }

  // Schedule: the date and time are the shop's local time
  const scheduledFor = zonedTimeToUtc(
    String(formData.get("scheduledDate") ?? ""),
    String(formData.get("scheduledTime") ?? ""),
    await shopTimeZone(shop),
  );

  if (!scheduledFor) {
    return json({ error: "Schedule date is required" }, { status: 400 });
  }
  if (scheduledFor.getTime() <= Date.now()) {
    return json({ error: "Choose a date and time in the future." }, { status: 400 });
  }

  try {
    const scheduled = await prisma.emailCampaign.updateMany({
      where: { id, shop, status: "draft" },
      data: {
        status: "scheduled",
        scheduledFor,
        segmentRules,
        updatedAt: new Date(),
      },
    });
    if (scheduled.count !== 1) {
      return json({ error: NOT_A_DRAFT }, { status: 409 });
    }

    return redirect(`/app/marketing/campaigns/${id}`);
  } catch (e: any) {
    return json({ error: e.message }, { status: 500 });
  }
};

export default function SendCampaign() {
  const { campaign, audience, audienceStats, tiers, marketingBlocked, timeZone } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();

  const [sendOption, setSendOption] = useState<"now" | "schedule">("now");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("09:00");
  // Start from the audience saved on the campaign (a duplicate keeps its tiers)
  const [selectedTiers, setSelectedTiers] = useState<string[]>(
    audience?.kind === "tiers" ? audience.tierIds.filter((tierId) => tiers.some((t) => t.id === tierId)) : []
  );

  // Check if campaign is from a recommendation
  const isFromRecommendation = campaign.segmentRules?.fromRecommendation;
  const hasRecommendedSegment = (campaign.segmentRules?.targetCustomerIds?.length ?? 0) > 0;

  // Otherwise the recommended segment if there is one, then all
  const [audienceType, setAudienceType] = useState<"recommended" | "all" | "tiers">(
    audience?.kind === "tiers"
      ? "tiers"
      : audience?.kind === "all"
        ? "all"
        : isFromRecommendation && hasRecommendedSegment ? "recommended" : "all"
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
                      helpText={`Your store's time zone (${timeZone})`}
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
                  <input type="hidden" name="scheduledDate" value={scheduledDate} />
                  <input type="hidden" name="scheduledTime" value={scheduledTime} />
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
