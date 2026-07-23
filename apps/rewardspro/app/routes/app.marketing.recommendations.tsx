import { json, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
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
  Tabs,
  EmptyState,
  InlineGrid,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { AnalyticsRecommendationsService } from "~/services/analytics-recommendations.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const filter = url.searchParams.get("filter") || "all";

  const recommendationsService = new AnalyticsRecommendationsService(shop);

  // Get recommendations based on filter
  let recommendations = [];
  let pendingCount = 0;
  let appliedCount = 0;
  let dismissedCount = 0;

  try {
    // Get all recommendations
    const allRecommendations = await recommendationsService.getActionRecommendations({
      limit: 100 // Get more recommendations for the full view
    });

    // Count by status
    pendingCount = allRecommendations.filter(r => r.status === 'pending').length;
    appliedCount = allRecommendations.filter(r => r.status === 'applied').length;
    dismissedCount = allRecommendations.filter(r => r.status === 'dismissed').length;

    // Filter based on selected tab
    switch (filter) {
      case 'pending':
        recommendations = allRecommendations.filter(r => r.status === 'pending');
        break;
      case 'applied':
        recommendations = allRecommendations.filter(r => r.status === 'applied');
        break;
      case 'dismissed':
        recommendations = allRecommendations.filter(r => r.status === 'dismissed');
        break;
      default:
        recommendations = allRecommendations;
    }
  } catch (error) {
    console.error('[Recommendations] Error loading recommendations:', error);
  }

  // Calculate aggregate metrics
  const totalPotentialRevenue = recommendations
    .filter(r => r.status === 'pending')
    .reduce((sum, r) => sum + (r.predictedRevenue || 0), 0);

  const totalAffectedCustomers = recommendations
    .filter(r => r.status === 'pending')
    .reduce((sum, r) => sum + r.affectedCount, 0);

  return json({
    shop,
    filter,
    recommendations,
    counts: {
      all: recommendations.length,
      pending: pendingCount,
      applied: appliedCount,
      dismissed: dismissedCount
    },
    metrics: {
      totalPotentialRevenue,
      totalAffectedCustomers,
      avgRevenuePerRecommendation: pendingCount > 0 ? totalPotentialRevenue / pendingCount : 0
    }
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const action = formData.get("action") as string;
  const recommendationId = formData.get("recommendationId") as string;

  const recommendationsService = new AnalyticsRecommendationsService(shop);

  try {
    switch (action) {
      case "apply":
        await recommendationsService.applyRecommendation(recommendationId);
        return json({ success: true, message: "Recommendation applied" });

      case "dismiss":
        await recommendationsService.dismissRecommendation(recommendationId);
        return json({ success: true, message: "Recommendation dismissed" });

      case "refresh":
        // Generate fresh recommendations
        await recommendationsService.generateRecommendations();
        return json({ success: true, message: "Recommendations refreshed" });

      default:
        return json({ success: false, message: "Invalid action" }, { status: 400 });
    }
  } catch (error: any) {
    return json({
      success: false,
      message: error.message || "Action failed"
    }, { status: 500 });
  }
};

export default function RecommendationsView() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const handleTabChange = (index: number) => {
    const tabId = tabs[index]?.id || 'all';
    navigate(`?filter=${tabId}`);
  };

  const handleAction = (action: string, recommendationId: string) => {
    const formData = new FormData();
    formData.append("action", action);
    formData.append("recommendationId", recommendationId);
    fetcher.submit(formData, { method: "post" });
  };

  const handleRefresh = () => {
    const formData = new FormData();
    formData.append("action", "refresh");
    fetcher.submit(formData, { method: "post" });
  };

  const tabs = [
    {
      id: 'all',
      content: `All (${data.counts.all})`,
      accessibilityLabel: 'All recommendations',
      panelID: 'all-recommendations',
    },
    {
      id: 'pending',
      content: `Pending (${data.counts.pending})`,
      accessibilityLabel: 'Pending recommendations',
      panelID: 'pending-recommendations',
    },
    {
      id: 'applied',
      content: `Applied (${data.counts.applied})`,
      accessibilityLabel: 'Applied recommendations',
      panelID: 'applied-recommendations',
    },
    {
      id: 'dismissed',
      content: `Dismissed (${data.counts.dismissed})`,
      accessibilityLabel: 'Dismissed recommendations',
      panelID: 'dismissed-recommendations',
    },
  ];

  const selectedTabIndex = tabs.findIndex(tab => tab.id === data.filter);

  return (
    <Page
      title="Marketing Recommendations"
      subtitle="Data-driven opportunities from customer analytics"
      backAction={{ content: "Marketing", url: "/app/marketing" }}
      primaryAction={{
        content: "Refresh Insights",
        onAction: handleRefresh,
        loading: fetcher.state === "submitting"
      }}
    >
      <Layout>
        {/* Metrics Summary */}
        {data.counts.pending > 0 && (
          <Layout.Section>
            <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3" tone="subdued">
                    Potential Revenue
                  </Text>
                  <Text variant="headingXl" as="p" fontWeight="bold">
                    ${data.metrics.totalPotentialRevenue.toLocaleString()}
                  </Text>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3" tone="subdued">
                    Customers to Reach
                  </Text>
                  <Text variant="headingXl" as="p" fontWeight="bold">
                    {data.metrics.totalAffectedCustomers.toLocaleString()}
                  </Text>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3" tone="subdued">
                    Avg. Value per Action
                  </Text>
                  <Text variant="headingXl" as="p" fontWeight="bold">
                    ${data.metrics.avgRevenuePerRecommendation.toFixed(2)}
                  </Text>
                </BlockStack>
              </Card>
            </InlineGrid>
          </Layout.Section>
        )}

        {/* Recommendations List with Tabs */}
        <Layout.Section>
          <Card>
            <Tabs tabs={tabs} selected={selectedTabIndex} onSelect={handleTabChange}>
              <div style={{ padding: '16px 0' }}>
                {data.recommendations.length === 0 ? (
                  <EmptyState
                    heading={`No ${data.filter === 'all' ? '' : data.filter} recommendations`}
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    {data.filter === 'pending' && (
                      <p>Click "Refresh Insights" to generate new recommendations based on current data.</p>
                    )}
                    {data.filter === 'applied' && (
                      <p>Applied recommendations will appear here after you create campaigns from them.</p>
                    )}
                    {data.filter === 'dismissed' && (
                      <p>Dismissed recommendations will appear here.</p>
                    )}
                  </EmptyState>
                ) : (
                  <BlockStack gap="400">
                    {data.recommendations.map((recommendation) => (
                      <RecommendationRow
                        key={recommendation.id}
                        recommendation={recommendation}
                        onAction={handleAction}
                        onNavigate={(id) => navigate(`/app/marketing/campaigns/smart-create?recommendationId=${id}`)}
                      />
                    ))}
                  </BlockStack>
                )}
              </div>
            </Tabs>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

interface RecommendationRowProps {
  recommendation: any;
  onAction: (action: string, id: string) => void;
  onNavigate: (id: string) => void;
}

function RecommendationRow({ recommendation, onAction, onNavigate }: RecommendationRowProps) {
  const getPriorityColor = (priority: number) => {
    if (priority >= 8) return '#DC2626'; // Red
    if (priority >= 5) return '#F59E0B'; // Amber
    return '#3B82F6'; // Blue
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      inactive_customers: 'Re-engagement',
      tier_upgrade_opportunity: 'Tier Upgrade',
      expiring_rewards: 'Reward Expiry',
      vip_at_risk: 'VIP Retention',
      birthday_upcoming: 'Birthday',
      low_balance_reengagement: 'Balance Reminder'
    };
    return labels[type] || type;
  };

  const getStatusBadge = () => {
    const statusConfig: Record<string, { tone: any; text: string }> = {
      pending: { tone: 'warning', text: 'Pending' },
      applied: { tone: 'success', text: 'Applied' },
      dismissed: { tone: 'subdued', text: 'Dismissed' },
      expired: { tone: 'critical', text: 'Expired' }
    };

    // Check if expired
    if (recommendation.expiresAt && new Date(recommendation.expiresAt) < new Date()) {
      return <Badge tone="critical">Expired</Badge>;
    }

    const config = statusConfig[recommendation.status] || { tone: 'info', text: recommendation.status };
    return <Badge tone={config.tone}>{config.text}</Badge>;
  };

  const isExpired = recommendation.expiresAt && new Date(recommendation.expiresAt) < new Date();
  const canTakeAction = recommendation.status === 'pending' && !isExpired;

  return (
    <div style={{
      padding: '16px',
      borderRadius: '8px',
      border: '1px solid #e5e5e5',
      backgroundColor: recommendation.status === 'applied' ? '#f9fafb' : 'white'
    }}>
      <BlockStack gap="300">
        {/* Header */}
        <InlineStack align="space-between" blockAlign="start">
          <BlockStack gap="200">
            <InlineStack gap="200" blockAlign="center">
              <div style={{
                width: '4px',
                height: '24px',
                backgroundColor: getPriorityColor(recommendation.priority),
                borderRadius: '2px'
              }} />
              <Text variant="headingSm" as="h4" fontWeight="semibold">
                {recommendation.title}
              </Text>
              <Badge tone="info">{getTypeLabel(recommendation.type)}</Badge>
              {getStatusBadge()}
            </InlineStack>
            <Text variant="bodySm" tone="subdued" as="p">
              {recommendation.description}
            </Text>
          </BlockStack>
        </InlineStack>

        {/* Metrics */}
        <InlineStack gap="400">
          <BlockStack gap="100">
            <Text variant="bodySm" tone="subdued" as="span">
              Affected Customers
            </Text>
            <Text variant="bodyMd" fontWeight="medium" as="span">
              {recommendation.affectedCount}
            </Text>
          </BlockStack>

          {recommendation.predictedRevenue && (
            <BlockStack gap="100">
              <Text variant="bodySm" tone="subdued" as="span">
                Potential Revenue
              </Text>
              <Text variant="bodyMd" fontWeight="medium" tone="success" as="span">
                ${recommendation.predictedRevenue.toLocaleString()}
              </Text>
            </BlockStack>
          )}

          {recommendation.appliedAt && (
            <BlockStack gap="100">
              <Text variant="bodySm" tone="subdued" as="span">
                Applied
              </Text>
              <Text variant="bodyMd" fontWeight="medium" as="span">
                {new Date(recommendation.appliedAt).toLocaleDateString()}
              </Text>
            </BlockStack>
          )}

          {recommendation.expiresAt && recommendation.status === 'pending' && (
            <BlockStack gap="100">
              <Text variant="bodySm" tone="subdued" as="span">
                Expires
              </Text>
              <Text variant="bodyMd" fontWeight="medium" tone={isExpired ? 'critical' : undefined} as="span">
                {new Date(recommendation.expiresAt).toLocaleDateString()}
              </Text>
            </BlockStack>
          )}
        </InlineStack>

        {/* Actions */}
        {canTakeAction && (
          <InlineStack gap="200">
            <Button
              variant="primary"
              onClick={() => onNavigate(recommendation.id)}
            >
              Create Campaign
            </Button>
            <Button
              onClick={() => onAction('dismiss', recommendation.id)}
            >
              Dismiss
            </Button>
          </InlineStack>
        )}

        {recommendation.status === 'applied' && (
          <Text variant="bodySm" tone="success" as="p">
            ✓ Campaign created from this recommendation
          </Text>
        )}
      </BlockStack>
    </div>
  );
}
