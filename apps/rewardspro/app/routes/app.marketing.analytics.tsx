import { json, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Divider,
  DataTable,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Get recent campaigns with metrics
  // DATA API COMPATIBLE: Nested include not supported, use two-step query
  const campaigns = await db.emailCampaign.findMany({
    where: {
      shop,
      status: 'sent',
      sentAt: { not: null }
    },
    orderBy: { sentAt: 'desc' },
    take: 10
  });

  // Fetch templates separately and join in memory
  const templateIds = [...new Set(campaigns.map(c => c.templateId).filter(Boolean))];
  const templates = templateIds.length > 0
    ? await db.emailTemplate.findMany({
        where: { id: { in: templateIds } },
        select: { id: true, name: true, type: true }
      })
    : [];
  const templateMap = new Map(templates.map(t => [t.id, t]));

  // Process campaigns with predicted vs actual
  const campaignsWithPredictions = campaigns.map(campaign => {
    const metrics = campaign.metrics as any || {};
    const template = templateMap.get(campaign.templateId) || { name: 'Unknown', type: 'general' };

    // Mock predictions based on campaign type
    const predictions = getPredictions(template.type);

    return {
      id: campaign.id,
      name: campaign.name,
      type: template.type,
      sentAt: campaign.sentAt,
      metrics: {
        sent: metrics.sent || 0,
        delivered: metrics.delivered || 0,
        opened: metrics.opened || 0,
        clicked: metrics.clicked || 0,
        revenue: metrics.revenue || 0,
        orders: metrics.orders || 0,
      },
      predictions,
      performance: calculatePerformance(metrics, predictions)
    };
  });

  // Calculate overall statistics
  const totalSent = campaignsWithPredictions.reduce((sum, c) => sum + c.metrics.sent, 0);
  const totalOpened = campaignsWithPredictions.reduce((sum, c) => sum + c.metrics.opened, 0);
  const totalClicked = campaignsWithPredictions.reduce((sum, c) => sum + c.metrics.clicked, 0);
  const totalRevenue = campaignsWithPredictions.reduce((sum, c) => sum + c.metrics.revenue, 0);

  return json({
    shop,
    campaigns: campaignsWithPredictions,
    overallMetrics: {
      totalSent,
      openRate: totalSent > 0 ? (totalOpened / totalSent * 100).toFixed(1) : '0',
      clickRate: totalSent > 0 ? (totalClicked / totalSent * 100).toFixed(1) : '0',
      totalRevenue
    }
  });
};

function getPredictions(campaignType: string) {
  const predictionMap: Record<string, any> = {
    inactive_reengagement: {
      responseRate: 23,
      revenue: 4200,
      reactivated: 20
    },
    tier_upgrade: {
      responseRate: 41,
      revenue: 890,
      conversions: 14
    },
    reward_expiry: {
      responseRate: 60,
      revenue: 690,
      redemptions: 14
    },
    vip_retention: {
      responseRate: 67,
      revenue: 8400,
      retained: 8
    },
    birthday: {
      responseRate: 40,
      revenue: 2240,
      redemptions: 22
    },
    low_balance: {
      responseRate: 31,
      revenue: 565,
      activated: 29
    }
  };
  return predictionMap[campaignType] || { responseRate: 30, revenue: 1000, conversions: 10 };
}

function calculatePerformance(metrics: any, predictions: any) {
  const actualResponseRate = metrics.sent > 0 ? (metrics.opened / metrics.sent * 100) : 0;
  const responsePerformance = predictions.responseRate > 0
    ? ((actualResponseRate / predictions.responseRate) * 100).toFixed(0)
    : '100';

  const revenuePerformance = predictions.revenue > 0
    ? ((metrics.revenue / predictions.revenue) * 100).toFixed(0)
    : '100';

  return {
    responseRate: {
      predicted: predictions.responseRate,
      actual: actualResponseRate.toFixed(1),
      performance: responsePerformance,
      exceeded: parseInt(responsePerformance) > 100
    },
    revenue: {
      predicted: predictions.revenue,
      actual: metrics.revenue,
      performance: revenuePerformance,
      exceeded: parseInt(revenuePerformance) > 100
    }
  };
}

export default function MarketingAnalytics() {
  const data = useLoaderData<typeof loader>();

  return (
    <Page
      title="Campaign Performance"
      subtitle="Track predicted vs actual performance"
      backAction={{ content: "Marketing", url: "/app/marketing" }}
    >
      <Layout>
        {/* Overall Metrics */}
        <Layout.Section>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px'
          }}>
            <Card>
              <BlockStack gap="200">
                <Text variant="bodySm" tone="subdued" as="p">
                  Total Emails Sent
                </Text>
                <Text variant="headingLg" as="h3">
                  {data.overallMetrics.totalSent.toLocaleString()}
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text variant="bodySm" tone="subdued" as="p">
                  Open Rate
                </Text>
                <Text variant="headingLg" as="h3">
                  {data.overallMetrics.openRate}%
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text variant="bodySm" tone="subdued" as="p">
                  Click Rate
                </Text>
                <Text variant="headingLg" as="h3">
                  {data.overallMetrics.clickRate}%
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text variant="bodySm" tone="subdued" as="p">
                  Total Revenue
                </Text>
                <Text variant="headingLg" as="h3">
                  ${data.overallMetrics.totalRevenue.toLocaleString()}
                </Text>
              </BlockStack>
            </Card>
          </div>
        </Layout.Section>

        {/* Campaign Performance */}
        <Layout.Section>
          {data.campaigns.length === 0 ? (
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">
                  No Campaigns Yet
                </Text>
                <Text variant="bodyMd" tone="subdued" as="p">
                  Launch your first campaign to see performance metrics here
                </Text>
              </BlockStack>
            </Card>
          ) : (
            <BlockStack gap="400">
              {data.campaigns.map((campaign) => (
                <CampaignPerformanceCard key={campaign.id} campaign={campaign} />
              ))}
            </BlockStack>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}

interface CampaignPerformanceCardProps {
  campaign: any;
}

function CampaignPerformanceCard({ campaign }: CampaignPerformanceCardProps) {
  return (
    <Card>
      <BlockStack gap="400">
        {/* Header */}
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text variant="headingSm" as="h3" fontWeight="semibold">
              {campaign.name}
            </Text>
            <Text variant="bodySm" tone="subdued" as="p">
              Sent {new Date(campaign.sentAt).toLocaleDateString()} • {campaign.metrics.sent} recipients
            </Text>
          </BlockStack>
          <Badge tone={campaign.performance.responseRate.exceeded ? 'success' : 'info'}>
            {campaign.performance.responseRate.exceeded ? 'Exceeded Target' : 'Below Target'}
          </Badge>
        </InlineStack>

        <Divider />

        {/* Predicted vs Actual Table */}
        <BlockStack gap="200">
          <Text variant="bodySm" fontWeight="semibold" as="p">
            Predicted vs Actual Performance
          </Text>

          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '13px'
            }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e0e0e0' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>Metric</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600 }}>Predicted</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600 }}>Actual</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600 }}>Performance</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '12px' }}>Response Rate</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    {campaign.performance.responseRate.predicted}%
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center', fontWeight: 600, color: campaign.performance.responseRate.exceeded ? '#22c55e' : '#ef4444' }}>
                    {campaign.performance.responseRate.actual}% {campaign.performance.responseRate.exceeded ? '✓' : ''}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <Badge tone={campaign.performance.responseRate.exceeded ? 'success' : 'critical'}>
                      {campaign.performance.responseRate.performance}%
                    </Badge>
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '12px' }}>Revenue</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    ${campaign.performance.revenue.predicted.toLocaleString()}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center', fontWeight: 600, color: campaign.performance.revenue.exceeded ? '#22c55e' : '#ef4444' }}>
                    ${campaign.performance.revenue.actual.toLocaleString()} {campaign.performance.revenue.exceeded ? '✓' : ''}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <Badge tone={campaign.performance.revenue.exceeded ? 'success' : 'critical'}>
                      {campaign.performance.revenue.performance}%
                    </Badge>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </BlockStack>

        {/* Learning */}
        {campaign.performance.responseRate.exceeded && (
          <div style={{
            padding: '12px',
            backgroundColor: '#f0fdf4',
            border: '1px solid #22c55e',
            borderRadius: '8px'
          }}>
            <BlockStack gap="100">
              <Text variant="bodySm" fontWeight="semibold" as="p">
                💡 Learning: Campaign exceeded expectations
              </Text>
              <Text variant="bodySm" tone="subdued" as="p">
                Consider applying similar messaging and timing to future campaigns
              </Text>
            </BlockStack>
          </div>
        )}
      </BlockStack>
    </Card>
  );
}
