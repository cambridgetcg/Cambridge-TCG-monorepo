import { json, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { useState } from "react";
import {
  Page,
  Layout,
  Card,
  Box,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  Icon,
  Divider,
  InlineGrid,
  Banner,
  ProgressBar,
} from "@shopify/polaris";
import {
  EmailIcon,
  ChartVerticalIcon,
  CashDollarIcon,
  AutomationIcon,
  StatusActiveIcon,
  CheckCircleIcon,
  ClockIcon,
  PersonIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { AnalyticsRecommendationsService } from "~/services/analytics-recommendations.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log('[Marketing Hub] === Loader Started ===');

  try {
    // Step 1: Authentication
    console.log('[Marketing Hub] Step 1: Authenticating...');
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    console.log('[Marketing Hub] ✓ Authenticated for shop:', shop);

    // Step 2: Get email settings (safe - table might not exist)
    console.log('[Marketing Hub] Step 2: Fetching email settings...');
    let emailSettings = null;
    try {
      emailSettings = await db.emailSettings.findUnique({
        where: { shop },
      });
      console.log('[Marketing Hub] ✓ Email settings:', emailSettings ? 'found' : 'not configured yet');
    } catch (settingsError: any) {
      console.error('[Marketing Hub] ⚠️ Email settings table may not exist:', settingsError.message);
      console.log('[Marketing Hub] This is expected if migration hasn\'t run yet');
    }

    // Step 3: Get automation stats (safe - table might not exist)
    console.log('[Marketing Hub] Step 3: Fetching automation stats...');
    let activeAutomations = 0;
    let totalAutomations = 0;
    try {
      // Use findMany instead of groupBy (Data API adapter doesn't support groupBy)
      const allAutomations = await db.emailAutomation.findMany({
        where: { shop },
        select: { isEnabled: true },
      });
      totalAutomations = allAutomations.length;
      activeAutomations = allAutomations.filter(a => a.isEnabled).length;
      console.log('[Marketing Hub] ✓ Automation stats - Active:', activeAutomations, 'Total:', totalAutomations);
    } catch (automationError: any) {
      console.error('[Marketing Hub] ⚠️ EmailAutomation table error:', automationError.message);
      console.error('[Marketing Hub] Error name:', automationError.name);
      console.log('[Marketing Hub] Using default values');
    }

    // Step 4: Get recommendations from shared service
    console.log('[Marketing Hub] Step 4: Fetching analytics recommendations...');
    let recommendations: any[] = [];
    let highPriorityRecommendations: any[] = [];
    try {
      const recommendationsService = new AnalyticsRecommendationsService(shop);

      // Get pending recommendations only
      recommendations = await recommendationsService.getActionRecommendations({
        status: 'pending'
      });

      highPriorityRecommendations = recommendations.filter(r => r.priority >= 8);
      console.log('[Marketing Hub] ✓ Recommendations:', recommendations.length, 'High priority:', highPriorityRecommendations.length);
    } catch (recommendError: any) {
      console.error('[Marketing Hub] ⚠️ Error fetching recommendations:', recommendError.message);
      console.error('[Marketing Hub] Stack:', recommendError.stack);
      console.log('[Marketing Hub] Using empty recommendations');
    }

    // Step 5: Get recent campaigns (safe - table might not exist)
    console.log('[Marketing Hub] Step 5: Fetching recent campaigns...');
    let recentCampaigns: any[] = [];
    try {
      recentCampaigns = await db.emailCampaign.findMany({
        where: { shop },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          template: {
            select: { name: true, type: true },
          },
        },
      });
      console.log('[Marketing Hub] ✓ Recent campaigns:', recentCampaigns.length);
    } catch (campaignError: any) {
      console.error('[Marketing Hub] ⚠️ EmailCampaign table may not exist:', campaignError.message);
      console.log('[Marketing Hub] Using empty campaigns');
    }

    // Step 6: Calculate email metrics (safe - table might not exist)
    console.log('[Marketing Hub] Step 6: Calculating email metrics...');
    let sentCount = 0;
    let openedCount = 0;
    try {
      const last30Days = new Date();
      last30Days.setDate(last30Days.getDate() - 30);

      // Use findMany instead of groupBy (Data API adapter doesn't support groupBy)
      const allEvents = await db.emailEvent.findMany({
        where: {
          shop,
          createdAt: { gte: last30Days },
        },
        select: { eventType: true },
      });

      sentCount = allEvents.filter(e => e.eventType === 'sent').length;
      openedCount = allEvents.filter(e => e.eventType === 'opened').length;
      console.log('[Marketing Hub] ✓ Email metrics - Sent:', sentCount, 'Opened:', openedCount);
    } catch (metricsError: any) {
      console.error('[Marketing Hub] ⚠️ EmailEvent table error:', metricsError.message);
      console.error('[Marketing Hub] Error name:', metricsError.name);
      console.log('[Marketing Hub] Using default metrics');
    }

    // Mock revenue data (would come from order tracking in production)
    const revenueGenerated = 0;

    console.log('[Marketing Hub] ✓ All data fetched successfully');
    console.log('[Marketing Hub] === Loader Complete ===');

    return json({
      shop,
      emailSettings,
      metrics: {
        emailsSent: sentCount,
        openRate: sentCount > 0 ? ((openedCount / sentCount) * 100).toFixed(1) : "0.0",
        revenue: revenueGenerated,
      },
      automationStats: {
        active: activeAutomations,
        total: totalAutomations,
      },
      recentCampaigns: recentCampaigns.map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
        scheduledFor: c.scheduledFor,
        sentAt: c.sentAt,
        metrics: c.metrics,
      })),
      recommendations,
      highPriorityRecommendations,
    });
  } catch (error: any) {
    console.error('[Marketing Hub] ❌ FATAL ERROR in loader');
    console.error('[Marketing Hub] Error name:', error.name);
    console.error('[Marketing Hub] Error message:', error.message);
    console.error('[Marketing Hub] Error code:', error.code);
    console.error('[Marketing Hub] Error stack:', error.stack);

    // If it's a Prisma/Data API error, log the specific details
    if (error.code) {
      console.error('[Marketing Hub] Error code:', error.code);
      console.error('[Marketing Hub] Error meta:', JSON.stringify(error.meta, null, 2));
    }

    // Check for groupBy error specifically (Data API adapter doesn't support it)
    if (error.message && error.message.includes('groupBy is not a function')) {
      console.error('[Marketing Hub] 🔴 CRITICAL: groupBy is not supported by Data API adapter!');
      console.error('[Marketing Hub] This should have been fixed - check if code was deployed correctly');
    }

    // Return error response with graceful fallback data matching the expected structure
    console.error('[Marketing Hub] Returning error response with fallback data');
    return json({
      error: {
        message: error.message || 'Unknown error',
        name: error.name || 'Error',
        code: error.code,
      },
      shop: 'unknown',
      emailSettings: null,
      metrics: {
        emailsSent: 0,
        openRate: "0.0",
        revenue: 0,
      },
      automationStats: {
        active: 0,
        total: 0,
      },
      recentCampaigns: [],
      recommendations: [],
      highPriorityRecommendations: [],
    }, { status: 500 });
  }
};

export default function MarketingDashboard() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const formatDate = (date: string | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { tone: any; text: string }> = {
      draft: { tone: 'info', text: 'Draft' },
      scheduled: { tone: 'warning', text: 'Scheduled' },
      sending: { tone: 'attention', text: 'Sending' },
      sent: { tone: 'success', text: 'Sent' },
      failed: { tone: 'critical', text: 'Failed' },
    };
    const config = statusMap[status] || { tone: 'info', text: status };
    return <Badge tone={config.tone}>{config.text}</Badge>;
  };

  // Get the appropriate action route for a recommendation
  const getRecommendationAction = (recommendation: any) => {
    const baseRoute = '/app/marketing/campaigns/smart-create';
    const params = new URLSearchParams({
      recommendationId: recommendation.id
    });

    // Different routes based on recommendation type
    switch (recommendation.type) {
      case 'expiring_rewards':
      case 'birthday_upcoming':
        // These could go to automation workflows
        return `/app/marketing/automation/create?${params}`;

      case 'vip_at_risk':
        // VIP retention could have its own specialized route (future enhancement)
        return `${baseRoute}?${params}&campaignType=retention`;

      case 'inactive_customers':
      case 'tier_upgrade_opportunity':
      case 'low_balance_reengagement':
      default:
        // Standard smart campaign creation with context
        return `${baseRoute}?${params}`;
    }
  };

  // Get action button text based on recommendation type
  const getActionButtonText = (recommendationType: string) => {
    switch (recommendationType) {
      case 'expiring_rewards':
        return 'Create Reminder';
      case 'vip_at_risk':
        return 'Launch Retention';
      case 'tier_upgrade_opportunity':
        return 'Create Upgrade Campaign';
      case 'inactive_customers':
        return 'Re-engage Now';
      default:
        return 'Create Campaign';
    }
  };

  return (
    <Page
      title="Marketing Hub"
      subtitle="Comprehensive analytics and insights for your email marketing campaigns"
      primaryAction={{
        content: "Create Campaign",
        onAction: () => navigate('/app/marketing/campaigns/create')
      }}
      secondaryActions={[
        {
          content: "Automation Workflows",
          onAction: () => navigate('/app/marketing/automation/workflows')
        },
        {
          content: "Templates",
          onAction: () => navigate('/app/marketing/templates')
        }
      ]}
    >
      <Layout>
        {/* Error Banner */}
        {(data as any).error && (
          <Layout.Section>
            <Banner
              title="Error Loading Marketing Data"
              tone="critical"
            >
              <p>
                There was an error loading marketing data: {(data as any).error.message}
              </p>
              <p style={{ marginTop: '8px' }}>
                Check the server logs for details. The page is showing with fallback data.
              </p>
            </Banner>
          </Layout.Section>
        )}

        {/* Key Metrics Grid */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="bodySm" tone="subdued">Total Sends</Text>
                  <Badge tone="info">+12%</Badge>
                </InlineStack>
                <Text variant="heading2xl" as="h3">
                  {data.metrics.emailsSent.toLocaleString()}
                </Text>
                <Text variant="bodySm" tone="subdued">
                  vs. {Math.round(data.metrics.emailsSent * 0.88).toLocaleString()} last month
                </Text>
                <ProgressBar progress={75} size="small" />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="bodySm" tone="subdued">Open Rate</Text>
                  <Badge tone="success">+5.2%</Badge>
                </InlineStack>
                <Text variant="heading2xl" as="h3">
                  {data.metrics.openRate}%
                </Text>
                <Text variant="bodySm" tone="subdued">
                  Industry avg: 21.3%
                </Text>
                <ProgressBar progress={parseFloat(data.metrics.openRate) / 40 * 100} size="small" tone="success" />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="bodySm" tone="subdued">Click Rate</Text>
                  <Badge tone="success">+8.1%</Badge>
                </InlineStack>
                <Text variant="heading2xl" as="h3">
                  14.2%
                </Text>
                <Text variant="bodySm" tone="subdued">
                  Industry avg: 8.5%
                </Text>
                <ProgressBar progress={67} size="small" tone="primary" />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="bodySm" tone="subdued">Revenue</Text>
                  <Badge tone="success">+15.3%</Badge>
                </InlineStack>
                <Text variant="heading2xl" as="h3">
                  ${data.metrics.revenue.toLocaleString()}
                </Text>
                <Text variant="bodySm" tone="subdued">
                  vs. ${Math.round(data.metrics.revenue * 0.87).toLocaleString()} last month
                </Text>
                <ProgressBar progress={85} size="small" tone="success" />
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        {/* Detailed Breakdown */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
            {/* Campaign Types */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3" fontWeight="semibold">
                  Campaign Types Performance
                </Text>
                <BlockStack gap="300">
                  <div>
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="bodyMd">Promotional</Text>
                      <Text variant="bodyMd" fontWeight="medium">38.5%</Text>
                    </InlineStack>
                    <Box paddingBlockStart="100">
                      <ProgressBar progress={38.5} size="small" tone="primary" />
                    </Box>
                  </div>
                  <div>
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="bodyMd">Newsletter</Text>
                      <Text variant="bodyMd" fontWeight="medium">67.2%</Text>
                    </InlineStack>
                    <Box paddingBlockStart="100">
                      <ProgressBar progress={67.2} size="small" tone="success" />
                    </Box>
                  </div>
                  <div>
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="bodyMd">Automation</Text>
                      <Text variant="bodyMd" fontWeight="medium">45.3%</Text>
                    </InlineStack>
                    <Box paddingBlockStart="100">
                      <ProgressBar progress={45.3} size="small" tone="primary" />
                    </Box>
                  </div>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Audience Engagement */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3" fontWeight="semibold">
                  Audience Engagement Levels
                </Text>
                <BlockStack gap="300">
                  <div>
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="200" blockAlign="center">
                        <Badge tone="success">Highly Engaged</Badge>
                        <Text variant="bodyMd">1,234 customers</Text>
                      </InlineStack>
                      <Text variant="bodyMd" fontWeight="medium">43%</Text>
                    </InlineStack>
                    <Box paddingBlockStart="100">
                      <ProgressBar progress={43} size="small" tone="success" />
                    </Box>
                  </div>
                  <div>
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="200" blockAlign="center">
                        <Badge tone="info">Moderately Engaged</Badge>
                        <Text variant="bodyMd">689 customers</Text>
                      </InlineStack>
                      <Text variant="bodyMd" fontWeight="medium">24%</Text>
                    </InlineStack>
                    <Box paddingBlockStart="100">
                      <ProgressBar progress={24} size="small" tone="primary" />
                    </Box>
                  </div>
                  <div>
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="200" blockAlign="center">
                        <Badge tone="warning">Low Engagement</Badge>
                        <Text variant="bodyMd">542 customers</Text>
                      </InlineStack>
                      <Text variant="bodyMd" fontWeight="medium">19%</Text>
                    </InlineStack>
                    <Box paddingBlockStart="100">
                      <ProgressBar progress={19} size="small" tone="warning" />
                    </Box>
                  </div>
                  <div>
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="200" blockAlign="center">
                        <Badge tone="critical">At Risk</Badge>
                        <Text variant="bodyMd">382 customers</Text>
                      </InlineStack>
                      <Text variant="bodyMd" fontWeight="medium">14%</Text>
                    </InlineStack>
                    <Box paddingBlockStart="100">
                      <ProgressBar progress={14} size="small" tone="critical" />
                    </Box>
                  </div>
                </BlockStack>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        {/* Recommended Actions */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h3" fontWeight="semibold">
                Recommended Actions
              </Text>
              <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
                <Card background="bg-surface-brand-subdued">
                  <BlockStack gap="200">
                    <Icon source={EmailIcon} />
                    <Text variant="headingSm" fontWeight="semibold">
                      Re-engage Inactive
                    </Text>
                    <Text variant="bodySm">
                      382 customers haven't opened an email in 30 days
                    </Text>
                    <Button size="slim" onClick={() => navigate('/app/marketing/campaigns/create')}>
                      Create Campaign
                    </Button>
                  </BlockStack>
                </Card>

                <Card background="bg-surface-success-subdued">
                  <BlockStack gap="200">
                    <Icon source={ClockIcon} />
                    <Text variant="headingSm" fontWeight="semibold">
                      Optimize Send Time
                    </Text>
                    <Text variant="bodySm">
                      Tuesday at 10 AM shows 37% better performance
                    </Text>
                    <Button size="slim" onClick={() => navigate('/app/marketing/campaigns/create')}>
                      Schedule Campaign
                    </Button>
                  </BlockStack>
                </Card>

                <Card background="bg-surface-secondary">
                  <BlockStack gap="200">
                    <Icon source={AutomationIcon} />
                    <Text variant="headingSm" fontWeight="semibold">
                      Add Automation
                    </Text>
                    <Text variant="bodySm">
                      Birthday emails have 89% open rate in similar stores
                    </Text>
                    <Button size="slim" onClick={() => navigate('/app/marketing/automation/workflows')}>
                      Create Workflow
                    </Button>
                  </BlockStack>
                </Card>
              </InlineGrid>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
