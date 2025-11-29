import { json, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { useState, useCallback } from "react";
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
  Select,
  EmptyState,
  Tooltip,
  Tabs,
} from "@shopify/polaris";
import {
  EmailIcon,
  ChartVerticalIcon,
  AutomationIcon,
  CheckCircleIcon,
  ClockIcon,
  PersonIcon,
  SendIcon,
  ViewIcon,
  ButtonIcon,
  CashDollarIcon,
  AlertCircleIcon,
  PlusIcon,
  SettingsIcon,
  ChartLineIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

// ============================================
// TYPES
// ============================================

interface CampaignMetrics {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  revenue: number;
  orders: number;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  scheduledFor: string | null;
  sentAt: string | null;
  metrics: CampaignMetrics | null;
  templateName?: string;
}

interface Automation {
  id: string;
  name: string;
  trigger: string;
  isEnabled: boolean;
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
}

interface Recommendation {
  id: string;
  type: string;
  title: string;
  description: string;
  affectedCount: number;
  predictedRevenue: number | null;
  priority: number;
}

interface LoaderData {
  shop: string;
  isConfigured: boolean;
  metrics: {
    totalSent: number;
    totalOpened: number;
    totalClicked: number;
    openRate: number;
    clickRate: number;
    totalRevenue: number;
    totalOrders: number;
    // Comparison to previous period
    sentChange: number;
    openRateChange: number;
    clickRateChange: number;
    revenueChange: number;
  };
  recentCampaigns: Campaign[];
  automations: Automation[];
  recommendations: Recommendation[];
  customerStats: {
    total: number;
    withEmail: number;
    subscribed: number;
  };
}

// ============================================
// LOADER
// ============================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Check if email is configured
  let emailSettings = null;
  try {
    emailSettings = await db.emailSettings.findUnique({
      where: { shop },
    });
  } catch (e) {
    // Table might not exist yet
  }

  const isConfigured = !!emailSettings?.senderEmail;

  // Fetch email metrics from events (last 30 days)
  let totalSent = 0;
  let totalOpened = 0;
  let totalClicked = 0;
  let totalDelivered = 0;

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const events = await db.emailEvent.findMany({
      where: {
        shop,
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    totalSent = events.filter(e => e.eventType === 'sent').length;
    totalDelivered = events.filter(e => e.eventType === 'delivered').length;
    totalOpened = events.filter(e => e.eventType === 'opened').length;
    totalClicked = events.filter(e => e.eventType === 'clicked').length;
  } catch (e) {
    // Table might not exist
  }

  const openRate = totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0;
  const clickRate = totalOpened > 0 ? (totalClicked / totalOpened) * 100 : 0;

  // Fetch recent campaigns
  let recentCampaigns: Campaign[] = [];
  try {
    const campaigns = await db.emailCampaign.findMany({
      where: { shop },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    // Fetch template names
    const templateIds = campaigns.map(c => c.templateId).filter(Boolean);
    const templates = templateIds.length > 0
      ? await db.emailTemplate.findMany({
          where: { id: { in: templateIds } },
        })
      : [];

    const templateMap = new Map(templates.map(t => [t.id, t.name]));

    recentCampaigns = campaigns.map(c => ({
      id: c.id,
      name: c.name,
      status: c.status,
      scheduledFor: c.scheduledFor?.toISOString() || null,
      sentAt: c.sentAt?.toISOString() || null,
      metrics: c.metrics as CampaignMetrics | null,
      templateName: templateMap.get(c.templateId),
    }));
  } catch (e) {
    // Table might not exist
  }

  // Fetch automations
  let automations: Automation[] = [];
  try {
    const autoList = await db.emailAutomation.findMany({
      where: { shop },
      orderBy: { createdAt: 'desc' },
    });

    automations = autoList.map(a => ({
      id: a.id,
      name: a.name,
      trigger: a.trigger,
      isEnabled: a.isEnabled,
      totalSent: a.totalSent,
      totalOpened: a.totalOpened,
      totalClicked: a.totalClicked,
    }));
  } catch (e) {
    // Table might not exist
  }

  // Fetch recommendations
  let recommendations: Recommendation[] = [];
  try {
    const recs = await db.analyticsRecommendation.findMany({
      where: {
        shop,
        status: 'pending',
        expiresAt: { gte: new Date() },
      },
      orderBy: { priority: 'desc' },
      take: 5,
    });

    recommendations = recs.map(r => ({
      id: r.id,
      type: r.type,
      title: r.title,
      description: r.description,
      affectedCount: r.affectedCount,
      predictedRevenue: r.predictedRevenue,
      priority: r.priority,
    }));
  } catch (e) {
    // Table might not exist
  }

  // Customer stats
  let customerStats = { total: 0, withEmail: 0, subscribed: 0 };
  try {
    const customers = await db.customer.findMany({
      where: { shop },
    });

    customerStats.total = customers.length;
    customerStats.withEmail = customers.filter(c => c.email).length;
    // For now, assume all with email are subscribed (you'd track this properly in production)
    customerStats.subscribed = customerStats.withEmail;
  } catch (e) {
    // Table might not exist
  }

  return json<LoaderData>({
    shop,
    isConfigured,
    metrics: {
      totalSent,
      totalOpened,
      totalClicked,
      openRate: parseFloat(openRate.toFixed(1)),
      clickRate: parseFloat(clickRate.toFixed(1)),
      totalRevenue: 0, // Would come from order attribution
      totalOrders: 0,
      // Mock changes for now
      sentChange: 12,
      openRateChange: 5.2,
      clickRateChange: 8.1,
      revenueChange: 15.3,
    },
    recentCampaigns,
    automations,
    recommendations,
    customerStats,
  });
};

// ============================================
// HELPER COMPONENTS
// ============================================

function MetricCard({
  title,
  value,
  change,
  suffix = "",
  prefix = "",
  helpText,
  progress,
  progressTone = "primary",
}: {
  title: string;
  value: string | number;
  change?: number;
  suffix?: string;
  prefix?: string;
  helpText?: string;
  progress?: number;
  progressTone?: "primary" | "success" | "critical";
}) {
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="span" variant="bodySm" tone="subdued">{title}</Text>
          {change !== undefined && (
            <Badge tone={change >= 0 ? "success" : "critical"}>
              {change >= 0 ? "+" : ""}{change}%
            </Badge>
          )}
        </InlineStack>
        <Text variant="heading2xl" as="p">
          {prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}
        </Text>
        {helpText && (
          <Text as="span" variant="bodySm" tone="subdued">{helpText}</Text>
        )}
        {progress !== undefined && (
          <ProgressBar progress={progress} size="small" tone={progressTone} />
        )}
      </BlockStack>
    </Card>
  );
}

function CampaignStatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { tone: any; label: string }> = {
    draft: { tone: "info", label: "Draft" },
    scheduled: { tone: "warning", label: "Scheduled" },
    sending: { tone: "attention", label: "Sending" },
    sent: { tone: "success", label: "Sent" },
    failed: { tone: "critical", label: "Failed" },
  };

  const config = statusConfig[status] || { tone: "info", label: status };
  return <Badge tone={config.tone}>{config.label}</Badge>;
}

function AutomationTriggerBadge({ trigger }: { trigger: string }) {
  const triggerLabels: Record<string, string> = {
    welcome: "Welcome",
    tier_upgrade: "Tier Upgrade",
    tier_downgrade: "Tier Downgrade",
    points_expiry: "Points Expiring",
    birthday: "Birthday",
    win_back: "Win Back",
    post_purchase: "Post Purchase",
  };

  return (
    <Badge tone="info">{triggerLabels[trigger] || trigger}</Badge>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function MarketingHub() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState("30");

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // If not configured, show setup prompt
  if (!data.isConfigured) {
    return (
      <Page title="Marketing Hub">
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState
                heading="Set up email marketing"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                action={{
                  content: "Configure Email Settings",
                  onAction: () => navigate("/app/marketing/settings"),
                }}
                secondaryAction={{
                  content: "Learn more",
                  url: "https://docs.rewardspro.io/features/email-marketing",
                  target: "_blank",
                }}
              >
                <p>
                  Connect your email provider to start sending targeted campaigns
                  to your loyalty program members. Automate tier notifications,
                  reward reminders, and win-back campaigns.
                </p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page
      title="Marketing Hub"
      subtitle="Email campaigns and automation for your loyalty program"
      primaryAction={{
        content: "Create Campaign",
        icon: PlusIcon,
        onAction: () => navigate("/app/marketing/campaigns/create"),
      }}
      secondaryActions={[
        {
          content: "Templates",
          onAction: () => navigate("/app/marketing/templates"),
        },
        {
          content: "Settings",
          icon: SettingsIcon,
          onAction: () => navigate("/app/marketing/settings"),
        },
      ]}
    >
      <Layout>
        {/* Global Controls */}
        <Layout.Section>
          <InlineStack align="end">
            <Select
              label=""
              labelHidden
              options={[
                { label: "Last 7 days", value: "7" },
                { label: "Last 30 days", value: "30" },
                { label: "Last 90 days", value: "90" },
                { label: "This year", value: "365" },
              ]}
              value={dateRange}
              onChange={setDateRange}
            />
          </InlineStack>
        </Layout.Section>

        {/* Key Metrics Bar - 4 columns */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
            <MetricCard
              title="Emails Sent"
              value={data.metrics.totalSent}
              change={data.metrics.sentChange}
              helpText={`${Math.round(data.metrics.totalSent * 0.88).toLocaleString()} last period`}
              progress={75}
            />
            <MetricCard
              title="Open Rate"
              value={data.metrics.openRate}
              suffix="%"
              change={data.metrics.openRateChange}
              helpText="Industry avg: 21.3%"
              progress={Math.min(data.metrics.openRate / 40 * 100, 100)}
              progressTone="success"
            />
            <MetricCard
              title="Click Rate"
              value={data.metrics.clickRate}
              suffix="%"
              change={data.metrics.clickRateChange}
              helpText="Industry avg: 2.6%"
              progress={Math.min(data.metrics.clickRate / 10 * 100, 100)}
              progressTone="success"
            />
            <MetricCard
              title="Revenue Generated"
              value={formatCurrency(data.metrics.totalRevenue)}
              change={data.metrics.revenueChange}
              helpText={`${data.metrics.totalOrders} orders attributed`}
              progress={85}
              progressTone="success"
            />
          </InlineGrid>
        </Layout.Section>

        {/* Main Content Grid */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, lg: "2fr 1fr" }} gap="400">
            {/* Left Column - Campaigns & Automations */}
            <BlockStack gap="400">
              {/* Recent Campaigns */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">Recent Campaigns</Text>
                    <Button
                      variant="plain"
                      onClick={() => navigate("/app/marketing/campaigns")}
                    >
                      View all
                    </Button>
                  </InlineStack>

                  {data.recentCampaigns.length === 0 ? (
                    <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                      <BlockStack gap="200" inlineAlign="center">
                        <Icon source={EmailIcon} tone="subdued" />
                        <Text as="p" tone="subdued" alignment="center">
                          No campaigns yet. Create your first campaign to engage your customers.
                        </Text>
                        <Button onClick={() => navigate("/app/marketing/campaigns/create")}>
                          Create Campaign
                        </Button>
                      </BlockStack>
                    </Box>
                  ) : (
                    <BlockStack gap="300">
                      {data.recentCampaigns.map((campaign) => (
                        <Box
                          key={campaign.id}
                          padding="300"
                          background="bg-surface-secondary"
                          borderRadius="200"
                        >
                          <InlineStack align="space-between" blockAlign="center">
                            <BlockStack gap="100">
                              <InlineStack gap="200" blockAlign="center">
                                <Text as="span" variant="bodyMd" fontWeight="semibold">
                                  {campaign.name}
                                </Text>
                                <CampaignStatusBadge status={campaign.status} />
                              </InlineStack>
                              <Text as="span" variant="bodySm" tone="subdued">
                                {campaign.status === "sent"
                                  ? `Sent ${formatDate(campaign.sentAt)}`
                                  : campaign.status === "scheduled"
                                  ? `Scheduled for ${formatDate(campaign.scheduledFor)}`
                                  : `Last edited ${formatDate(campaign.sentAt || campaign.scheduledFor)}`}
                              </Text>
                            </BlockStack>
                            {campaign.metrics && campaign.status === "sent" && (
                              <InlineStack gap="400">
                                <Tooltip content="Opens">
                                  <InlineStack gap="100" blockAlign="center">
                                    <Icon source={ViewIcon} tone="subdued" />
                                    <Text as="span" variant="bodySm">
                                      {campaign.metrics.opened > 0
                                        ? `${((campaign.metrics.opened / campaign.metrics.sent) * 100).toFixed(1)}%`
                                        : "—"}
                                    </Text>
                                  </InlineStack>
                                </Tooltip>
                                <Tooltip content="Clicks">
                                  <InlineStack gap="100" blockAlign="center">
                                    <Icon source={ButtonIcon} tone="subdued" />
                                    <Text as="span" variant="bodySm">
                                      {campaign.metrics.clicked > 0
                                        ? `${((campaign.metrics.clicked / campaign.metrics.opened) * 100).toFixed(1)}%`
                                        : "—"}
                                    </Text>
                                  </InlineStack>
                                </Tooltip>
                              </InlineStack>
                            )}
                          </InlineStack>
                        </Box>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>

              {/* Automations */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="h2" variant="headingMd">Automations</Text>
                      <Badge tone="info">
                        {data.automations.filter(a => a.isEnabled).length} active
                      </Badge>
                    </InlineStack>
                    <Button
                      variant="plain"
                      onClick={() => navigate("/app/marketing/automation/workflows")}
                    >
                      Manage
                    </Button>
                  </InlineStack>

                  {data.automations.length === 0 ? (
                    <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                      <BlockStack gap="200" inlineAlign="center">
                        <Icon source={AutomationIcon} tone="subdued" />
                        <Text as="p" tone="subdued" alignment="center">
                          Set up automated emails for tier changes, welcome messages, and more.
                        </Text>
                        <Button onClick={() => navigate("/app/marketing/automation/create")}>
                          Create Automation
                        </Button>
                      </BlockStack>
                    </Box>
                  ) : (
                    <BlockStack gap="200">
                      {data.automations.slice(0, 4).map((automation) => (
                        <Box
                          key={automation.id}
                          padding="300"
                          background="bg-surface-secondary"
                          borderRadius="200"
                        >
                          <InlineStack align="space-between" blockAlign="center">
                            <InlineStack gap="300" blockAlign="center">
                              <div
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: "50%",
                                  backgroundColor: automation.isEnabled ? "#34D399" : "#9CA3AF",
                                }}
                              />
                              <BlockStack gap="100">
                                <Text as="span" variant="bodyMd" fontWeight="medium">
                                  {automation.name}
                                </Text>
                                <AutomationTriggerBadge trigger={automation.trigger} />
                              </BlockStack>
                            </InlineStack>
                            <BlockStack gap="100" inlineAlign="end">
                              <Text as="span" variant="bodySm">
                                {automation.totalSent.toLocaleString()} sent
                              </Text>
                              <Text as="span" variant="bodySm" tone="subdued">
                                {automation.totalSent > 0
                                  ? `${((automation.totalOpened / automation.totalSent) * 100).toFixed(0)}% opened`
                                  : "No data yet"}
                              </Text>
                            </BlockStack>
                          </InlineStack>
                        </Box>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            </BlockStack>

            {/* Right Column - Audience & Recommendations */}
            <BlockStack gap="400">
              {/* Audience Overview */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Audience</Text>
                  <BlockStack gap="300">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">Total Customers</Text>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {data.customerStats.total.toLocaleString()}
                      </Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">With Email</Text>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {data.customerStats.withEmail.toLocaleString()}
                      </Text>
                    </InlineStack>
                    <Divider />
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">Reachable</Text>
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          {data.customerStats.subscribed.toLocaleString()}
                        </Text>
                        <Badge tone="success">
                          {data.customerStats.total > 0
                            ? `${((data.customerStats.subscribed / data.customerStats.total) * 100).toFixed(0)}%`
                            : "0%"}
                        </Badge>
                      </InlineStack>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* AI Recommendations */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="h2" variant="headingMd">Recommendations</Text>
                      {data.recommendations.length > 0 && (
                        <Badge tone="attention">{data.recommendations.length}</Badge>
                      )}
                    </InlineStack>
                    <Button
                      variant="plain"
                      onClick={() => navigate("/app/marketing/recommendations")}
                    >
                      View all
                    </Button>
                  </InlineStack>

                  {data.recommendations.length === 0 ? (
                    <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                      <InlineStack gap="200" blockAlign="center">
                        <Icon source={CheckCircleIcon} tone="success" />
                        <Text as="p" variant="bodySm" tone="subdued">
                          No new recommendations. Check back later!
                        </Text>
                      </InlineStack>
                    </Box>
                  ) : (
                    <BlockStack gap="300">
                      {data.recommendations.slice(0, 3).map((rec) => (
                        <Box
                          key={rec.id}
                          padding="300"
                          background={rec.priority >= 8 ? "bg-surface-warning" : "bg-surface-secondary"}
                          borderRadius="200"
                        >
                          <BlockStack gap="200">
                            <InlineStack align="space-between" blockAlign="start">
                              <Text as="span" variant="bodyMd" fontWeight="semibold">
                                {rec.title}
                              </Text>
                              {rec.priority >= 8 && (
                                <Badge tone="warning">High Priority</Badge>
                              )}
                            </InlineStack>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {rec.affectedCount.toLocaleString()} customers
                              {rec.predictedRevenue && (
                                <> • Est. {formatCurrency(rec.predictedRevenue)}</>
                              )}
                            </Text>
                            <Button
                              size="slim"
                              onClick={() => navigate(`/app/marketing/campaigns/smart-create?recommendationId=${rec.id}`)}
                            >
                              Create Campaign
                            </Button>
                          </BlockStack>
                        </Box>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>

              {/* Quick Actions */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Quick Actions</Text>
                  <BlockStack gap="200">
                    <Button
                      fullWidth
                      textAlign="left"
                      icon={EmailIcon}
                      onClick={() => navigate("/app/marketing/campaigns/create")}
                    >
                      New Email Campaign
                    </Button>
                    <Button
                      fullWidth
                      textAlign="left"
                      icon={AutomationIcon}
                      onClick={() => navigate("/app/marketing/automation/create")}
                    >
                      New Automation
                    </Button>
                    <Button
                      fullWidth
                      textAlign="left"
                      icon={ChartLineIcon}
                      onClick={() => navigate("/app/marketing/analytics")}
                    >
                      View Analytics
                    </Button>
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </InlineGrid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
