import { json, redirect } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Button,
  Banner,
  EmptyState,
  TextField,
  FormLayout,
  Checkbox,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { AnalyticsRecommendationsService } from "~/services/analytics-recommendations.server";
import prisma from "~/db.server";
import { v4 as uuidv4 } from "uuid";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const recommendationId = url.searchParams.get("recommendationId");
  const campaignType = url.searchParams.get("campaignType");

  const recommendationsService = new AnalyticsRecommendationsService(shop);

  // If a specific recommendation ID is provided, fetch it
  let specificRecommendation = null;
  let prefillData = null;

  try {
    if (recommendationId) {
      specificRecommendation = await recommendationsService.getRecommendationById(recommendationId);

      if (specificRecommendation) {
        // Transform recommendation to campaign prefill data
        prefillData = await recommendationsService.transformToCampaign(recommendationId);
      }
    }
  } catch (error) {
    console.error('[Smart Campaign Creator] Error fetching recommendation:', error);
    // Continue without the specific recommendation
  }

  // Get all pending recommendations
  let recommendations = [];
  try {
    recommendations = await recommendationsService.getActionRecommendations({
      status: 'pending'
    });
  } catch (error) {
    console.error('[Smart Campaign Creator] Error fetching recommendations:', error);
    // Continue with empty recommendations array
  }

  // Get email settings to check if configured
  let emailSettings = null;
  try {
    emailSettings = await prisma.emailSettings.findUnique({
      where: { shop },
    });
  } catch (error) {
    console.error('[Smart Campaign Creator] Email settings error:', error);
  }

  return json({
    shop,
    recommendationId,
    campaignType,
    specificRecommendation,
    prefillData,
    recommendations,
    emailSettings,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const action = formData.get("action") as string;

  if (action === "create_campaign") {
    const recommendationId = formData.get("recommendationId") as string;
    const name = formData.get("name") as string;
    const subject = formData.get("subject") as string;
    const previewText = formData.get("previewText") as string;
    const bodyHtml = formData.get("bodyHtml") as string;
    const sendImmediately = formData.get("sendImmediately") === "true";

    const recommendationsService = new AnalyticsRecommendationsService(shop);

    // If this is from a recommendation, mark it as applied
    if (recommendationId) {
      await recommendationsService.applyRecommendation(recommendationId);
    }

    // Create email template
    const template = await prisma.emailTemplate.create({
      data: {
        id: uuidv4(),
        shop,
        name: `${name} Template`,
        type: 'promotional',
        subject,
        previewText: previewText || '',
        bodyHtml: bodyHtml || '<p>Email content here...</p>',
        bodyText: bodyHtml?.replace(/<[^>]*>/g, '') || 'Email content here...',
        isActive: true,
      },
    });

    // Get recommendation data if from a recommendation
    let segmentRules: any = {};
    let metadata: any = {};

    if (recommendationId) {
      const recommendationsService = new AnalyticsRecommendationsService(shop);
      const recommendation = await recommendationsService.getRecommendationById(recommendationId);

      if (recommendation) {
        const segmentPayload = recommendation.segmentPayload as any;
        segmentRules = {
          fromRecommendation: true,
          recommendationType: recommendation.type,
          targetCustomerIds: segmentPayload?.customerIds || [],
          criteria: segmentPayload?.criteria || [],
        };
        metadata = {
          source: 'analytics_recommendation',
          recommendationId,
          recommendationType: recommendation.type,
          affectedCount: recommendation.affectedCount,
          predictedRevenue: recommendation.predictedRevenue,
        };
      }
    }

    // Create campaign
    const campaign = await prisma.emailCampaign.create({
      data: {
        id: uuidv4(),
        shop,
        name,
        templateId: template.id,
        status: sendImmediately ? 'scheduled' : 'draft',
        scheduledFor: sendImmediately ? new Date() : null,
        segmentRules,
        metadata,
        metrics: {},
      },
    });

    // Redirect to the newly created campaign
    return redirect(`/app/marketing/campaigns/${campaign.id}`);
  }

  if (action === "dismiss_recommendation") {
    const recommendationId = formData.get("recommendationId") as string;
    const recommendationsService = new AnalyticsRecommendationsService(shop);
    await recommendationsService.dismissRecommendation(recommendationId);
    return json({ success: true });
  }

  return json({ success: false, message: "Invalid action" }, { status: 400 });
};

export default function SmartCampaignCreator() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const handleCreateCampaign = (formData: FormData) => {
    formData.append("action", "create_campaign");
    fetcher.submit(formData, { method: "post" });
  };

  const handleDismissRecommendation = (recommendationId: string) => {
    const formData = new FormData();
    formData.append("recommendationId", recommendationId);
    formData.append("action", "dismiss_recommendation");
    fetcher.submit(formData, { method: "post" });
  };

  if (!data.emailSettings) {
    return (
      <Page
        title="Smart Campaign Creator"
        backAction={{ content: "Marketing", url: "/app/marketing" }}
      >
        <Layout>
          <Layout.Section>
            <Banner
              title="Email settings required"
              tone="warning"
            >
              <p>
                Configure your email sender settings before creating campaigns.
              </p>
              <Button onClick={() => navigate('/app/marketing/settings')}>
                Configure Settings
              </Button>
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  // If we have prefill data from a recommendation, show the campaign form
  if (data.prefillData && data.specificRecommendation) {
    return (
      <Page
        title="Create Campaign from Recommendation"
        subtitle={`Based on: ${data.specificRecommendation.title}`}
        backAction={{ content: "Marketing", url: "/app/marketing" }}
      >
        <Layout>
          {/* Recommendation Context */}
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="start">
                  <BlockStack gap="200">
                    <Text variant="headingMd" as="h3">
                      Recommendation Details
                    </Text>
                    <Text variant="bodyMd" tone="subdued" as="p">
                      {data.specificRecommendation.description}
                    </Text>
                  </BlockStack>
                  <Badge tone="success" children={`${data.specificRecommendation.affectedCount} customers`} />
                </InlineStack>

                <div style={{
                  padding: '12px',
                  backgroundColor: '#f9fafb',
                  borderRadius: '8px'
                }}>
                  <InlineStack gap="400">
                    <BlockStack gap="100">
                      <Text variant="bodySm" tone="subdued" as="p">
                        Predicted Revenue
                      </Text>
                      <Text variant="bodyMd" fontWeight="semibold" as="p">
                        ${data.specificRecommendation.predictedRevenue?.toLocaleString() || '0'}
                      </Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text variant="bodySm" tone="subdued" as="p">
                        Priority
                      </Text>
                      <Text variant="bodyMd" fontWeight="semibold" as="p">
                        {data.specificRecommendation.priority >= 8 ? 'High' :
                         data.specificRecommendation.priority >= 5 ? 'Medium' : 'Low'}
                      </Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text variant="bodySm" tone="subdued" as="p">
                        Type
                      </Text>
                      <Text variant="bodyMd" fontWeight="semibold" as="p">
                        {data.specificRecommendation.type.replace(/_/g, ' ')}
                      </Text>
                    </BlockStack>
                  </InlineStack>
                </div>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Campaign Form */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">
                  Campaign Details
                </Text>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    if (data.recommendationId) {
                      formData.append("recommendationId", data.recommendationId);
                    }
                    handleCreateCampaign(formData);
                  }}
                >
                  <FormLayout>
                    <TextField
                      label="Campaign Name"
                      name="name"
                      value={data.prefillData.name}
                      autoComplete="off"
                      requiredIndicator
                    />

                    <TextField
                      label="Email Subject"
                      name="subject"
                      value={data.prefillData.subject}
                      autoComplete="off"
                      helpText="You can use variables like {{customer_name}}, {{tier_name}}"
                      requiredIndicator
                    />

                    <TextField
                      label="Preview Text"
                      name="previewText"
                      value={data.prefillData.previewText || ''}
                      autoComplete="off"
                      helpText="Appears after the subject in email clients"
                    />

                    <TextField
                      label="Email Content"
                      name="bodyHtml"
                      value={data.prefillData.bodyHtml}
                      multiline={10}
                      autoComplete="off"
                      helpText="HTML content for the email"
                      requiredIndicator
                    />

                    <Checkbox
                      label="Send immediately after creation"
                      name="sendImmediately"
                    />

                    <InlineStack gap="300">
                      <Button submit variant="primary" loading={fetcher.state === "submitting"}>
                        Create Campaign
                      </Button>
                      <Button onClick={() => navigate('/app/marketing')}>
                        Cancel
                      </Button>
                      {data.recommendationId && (
                        <Button
                          onClick={() => handleDismissRecommendation(data.recommendationId!)}
                          tone="critical"
                          variant="plain"
                        >
                          Dismiss Recommendation
                        </Button>
                      )}
                    </InlineStack>
                  </FormLayout>
                </form>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  // Otherwise show all recommendations
  return (
    <Page
      title="Smart Campaign Creator"
      subtitle="Launch data-driven campaigns from analytics insights"
      backAction={{ content: "Marketing", url: "/app/marketing" }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h3">
                Analytics-Powered Recommendations
              </Text>
              <Text variant="bodyMd" tone="subdued" as="p">
                These campaigns are recommended based on your customer data and behavior patterns.
                Click on any recommendation to create a targeted campaign.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          {data.recommendations.length === 0 ? (
            <Card>
              <EmptyState
                heading="No recommendations available"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>We'll generate recommendations as your customer base grows and patterns emerge.</p>
                <Button onClick={() => navigate('/app/marketing')}>
                  Back to Marketing Hub
                </Button>
              </EmptyState>
            </Card>
          ) : (
            <BlockStack gap="400">
              {data.recommendations.map((recommendation) => (
                <RecommendationCard
                  key={recommendation.id}
                  recommendation={recommendation}
                  onSelect={() => {
                    // Navigate with recommendation ID
                    navigate(`?recommendationId=${recommendation.id}`);
                  }}
                  onDismiss={() => handleDismissRecommendation(recommendation.id)}
                />
              ))}
            </BlockStack>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}

interface RecommendationCardProps {
  recommendation: any;
  onSelect: () => void;
  onDismiss: () => void;
}

function RecommendationCard({ recommendation, onSelect, onDismiss }: RecommendationCardProps) {
  const getPriorityBadge = () => {
    const priority = recommendation.priority;
    let tone: any = 'info';
    let text = 'Low';

    if (priority >= 8) {
      tone = 'critical';
      text = 'High';
    } else if (priority >= 5) {
      tone = 'attention';
      text = 'Medium';
    }

    return <Badge tone={tone as any} children={`${text} Priority`} />;
  };

  const getTypeBadge = () => {
    const typeLabels: Record<string, string> = {
      inactive_customers: 'Re-engagement',
      tier_upgrade_opportunity: 'Tier Upgrade',
      expiring_rewards: 'Reward Expiry',
      vip_at_risk: 'VIP Retention',
      birthday_upcoming: 'Birthday',
      low_balance_reengagement: 'Balance Reminder'
    };

    return (
      <Badge tone="info">
        {typeLabels[recommendation.type] || recommendation.type}
      </Badge>
    );
  };

  return (
    <Card>
      <BlockStack gap="300">
        {/* Header with badges */}
        <InlineStack gap="200" blockAlign="center">
          {getPriorityBadge()}
          {getTypeBadge()}
          {recommendation.status === 'pending' && (
            <Badge tone="warning">Pending</Badge>
          )}
        </InlineStack>

        {/* Title and Description */}
        <BlockStack gap="200">
          <Text variant="headingSm" as="h3" fontWeight="semibold">
            {recommendation.title}
          </Text>
          <Text variant="bodySm" tone="subdued" as="p">
            {recommendation.description}
          </Text>
        </BlockStack>

        {/* Metrics */}
        <div style={{
          padding: '12px',
          backgroundColor: '#f9fafb',
          borderRadius: '8px'
        }}>
          <BlockStack gap="200">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="bodySm" as="span" tone="subdued">
                Affected Customers
              </Text>
              <Text variant="bodyMd" as="span" fontWeight="semibold">
                {recommendation.affectedCount} customers
              </Text>
            </InlineStack>
            {recommendation.predictedRevenue && (
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="bodySm" as="span" tone="subdued">
                  Potential Revenue
                </Text>
                <Text variant="bodyMd" as="span" fontWeight="semibold" tone="success">
                  ${recommendation.predictedRevenue.toLocaleString()}
                </Text>
              </InlineStack>
            )}
            {recommendation.expiresAt && (
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="bodySm" as="span" tone="subdued">
                  Expires
                </Text>
                <Text variant="bodyMd" as="span" fontWeight="semibold">
                  {new Date(recommendation.expiresAt).toLocaleDateString()}
                </Text>
              </InlineStack>
            )}
          </BlockStack>
        </div>

        {/* Action Buttons */}
        <InlineStack gap="200" align="space-between">
          <Button
            variant="plain"
            tone="critical"
            onClick={onDismiss}
          >
            Dismiss
          </Button>
          <Button
            variant="primary"
            onClick={onSelect}
          >
            Create Campaign →
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}
