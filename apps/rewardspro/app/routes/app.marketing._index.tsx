import { json, ActionFunctionArgs, LoaderFunctionArgs, redirect } from "@remix-run/node";
import { useLoaderData, useNavigate, useFetcher } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
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
  Tooltip,
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
  ExternalIcon,
  GiftCardIcon,
  TargetIcon,
  StarIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { getMarketingModeInfo, setMarketingHubMode, markChoiceModalSeen } from "~/services/marketing-mode.server";
import { MarketingChoiceModal } from "~/components/MarketingChoiceModal";
import { KlaviyoMarketingDashboard } from "~/components/KlaviyoMarketingDashboard";
import { SubscriptionCard } from "~/components/Billing/UpgradePrompt";
import type { MarketingHubMode } from "@prisma/client";
import {
  checkLimitAccess,
} from "~/utils/require-feature.server";

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

// Klaviyo-specific types
interface KlaviyoSyncStatus {
  isConnected: boolean;
  connectionMethod: "oauth" | "api_key" | null;
  lastSyncAt: string | null;
  profilesSynced: number;
  eventsSentToday: number;
  syncStatus: "idle" | "syncing" | "error";
  syncError: string | null;
}

interface EventToggle {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  eventCount: number;
}

interface RecentKlaviyoEvent {
  id: string;
  eventType: string;
  customerEmail: string;
  timestamp: string;
  status: "sent" | "failed";
}

interface LoaderData {
  shop: string;
  isConfigured: boolean;
  // Plan Access
  planAccess: {
    campaigns: { hasAccess: boolean; requiredPlan?: string };
    automation: { hasAccess: boolean; requiredPlan?: string };
    aiRecommendations: { hasAccess: boolean; requiredPlan?: string };
  };
  campaignLimitAccess: {
    canCreate: boolean;
    current: number;
    max: number;
  };
  // Marketing Hub Mode
  marketingMode: MarketingHubMode;
  showChoiceModal: boolean;
  isKlaviyoConnected: boolean;
  // In-House Metrics (for INHOUSE mode)
  metrics: {
    totalSent: number;
    totalOpened: number;
    totalClicked: number;
    openRate: number;
    clickRate: number;
    totalRevenue: number;
    totalOrders: number;
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
  // Klaviyo-specific data (for KLAVIYO mode)
  klaviyoData: {
    syncStatus: KlaviyoSyncStatus;
    eventToggles: EventToggle[];
    recentEvents: RecentKlaviyoEvent[];
  } | null;
}

// ============================================
// LOADER
// ============================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Rate-based model: All plans have access to all marketing features
  // Limits differentiate plans (e.g., maxCampaigns, maxEmails)

  // Count existing campaigns for limit check
  let campaignCount = 0;
  try {
    campaignCount = await db.emailCampaign.count({ where: { shop } });
  } catch (e) {
    // Table might not exist
  }
  const campaignLimitAccess = await checkLimitAccess(shop, 'maxCampaigns', campaignCount);

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

  // Get marketing mode info
  const modeInfo = await getMarketingModeInfo(shop);
  const showChoiceModal = modeInfo.mode === "UNCONFIGURED" && !modeInfo.hasSeenChoice;

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
  // DATA API COMPATIBLE: Use count instead of loading all customers
  let customerStats = { total: 0, withEmail: 0, subscribed: 0 };
  try {
    const [totalCount, withEmailCount] = await Promise.all([
      db.customer.count({ where: { shop } }),
      db.customer.count({ where: { shop, email: { not: null } } }),
    ]);

    customerStats.total = totalCount;
    customerStats.withEmail = withEmailCount;
    // For now, assume all with email are subscribed (you'd track this properly in production)
    customerStats.subscribed = customerStats.withEmail;
  } catch (e) {
    // Table might not exist
  }

  // Fetch Klaviyo data if in Klaviyo mode
  let klaviyoData: LoaderData["klaviyoData"] = null;
  if (modeInfo.mode === "KLAVIYO") {
    try {
      // Get Klaviyo sync status from email settings
      const syncStatus: KlaviyoSyncStatus = {
        isConnected: modeInfo.isKlaviyoConnected,
        connectionMethod: emailSettings?.klaviyoOAuthConnected ? "oauth" : emailSettings?.klaviyoApiKey ? "api_key" : null,
        lastSyncAt: emailSettings?.klaviyoLastSyncAt?.toISOString() || null,
        profilesSynced: customerStats.total, // Approximation
        eventsSentToday: 0,
        syncStatus: (emailSettings?.klaviyoSyncStatus as "idle" | "syncing" | "error") || "idle",
        syncError: emailSettings?.klaviyoSyncError || null,
      };

      // Count events sent today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      try {
        const eventsToday = await db.klaviyoEvent.count({
          where: {
            shop,
            createdAt: { gte: today },
            status: "SENT",
          },
        });
        syncStatus.eventsSentToday = eventsToday;
      } catch (e) {
        // Table might not exist
      }

      // Get automation settings for event toggles
      let automationSettings: any = null;
      try {
        automationSettings = await db.klaviyoAutomationSettings.findUnique({
          where: { shop },
        });
      } catch (e) {
        // Table might not exist
      }

      // Build event toggles (using correct Prisma field names from KlaviyoAutomationSettings)
      const eventToggles: EventToggle[] = [
        { id: "customer_enrolled", name: "Customer Enrolled", description: "When a customer joins the loyalty program", enabled: automationSettings?.sendCustomerEnrolled ?? true, eventCount: 0 },
        { id: "tier_upgraded", name: "Tier Upgraded", description: "When a customer moves to a higher tier", enabled: automationSettings?.sendTierUpgraded ?? true, eventCount: 0 },
        { id: "tier_downgraded", name: "Tier Downgraded", description: "When a customer moves to a lower tier", enabled: automationSettings?.sendTierDowngraded ?? true, eventCount: 0 },
        { id: "order_placed", name: "Order Placed", description: "When a customer places an order", enabled: automationSettings?.sendOrderPlaced ?? true, eventCount: 0 },
        { id: "cashback_earned", name: "Cashback Earned", description: "When cashback is credited to account", enabled: automationSettings?.sendCashbackEarned ?? true, eventCount: 0 },
        { id: "cashback_redeemed", name: "Cashback Redeemed", description: "When cashback is used on an order", enabled: automationSettings?.sendCashbackRedeemed ?? true, eventCount: 0 },
        { id: "points_expiring", name: "Points Expiring", description: "Reminder before points expire", enabled: automationSettings?.sendPointsExpiring ?? true, eventCount: 0 },
        { id: "win_back", name: "Win-Back Trigger", description: "When customer becomes at-risk", enabled: automationSettings?.sendWinBack ?? true, eventCount: 0 },
        { id: "birthday", name: "Birthday", description: "Customer birthday celebration", enabled: automationSettings?.sendCustomerBirthday ?? false, eventCount: 0 },
        { id: "anniversary", name: "Membership Anniversary", description: "Annual loyalty anniversary", enabled: automationSettings?.sendCustomerAnniversary ?? false, eventCount: 0 },
      ];

      // Get recent Klaviyo events
      let recentEvents: RecentKlaviyoEvent[] = [];
      try {
        const events = await db.klaviyoEvent.findMany({
          where: { shop },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            eventType: true,
            customerEmail: true,
            createdAt: true,
            status: true,
          },
        });

        recentEvents = events.map((e) => ({
          id: e.id,
          eventType: e.eventType,
          customerEmail: e.customerEmail || "unknown@email.com",
          timestamp: e.createdAt.toISOString(),
          status: e.status === "SENT" ? "sent" : "failed",
        }));
      } catch (e) {
        // Table might not exist
      }

      klaviyoData = {
        syncStatus,
        eventToggles,
        recentEvents,
      };
    } catch (e) {
      console.error("[Marketing Hub] Error fetching Klaviyo data:", e);
    }
  }

  return json<LoaderData>({
    shop,
    isConfigured,
    // Plan Access - Rate-based model: All features enabled for all plans
    planAccess: {
      campaigns: { hasAccess: true },
      automation: { hasAccess: true },
      aiRecommendations: { hasAccess: true },
    },
    campaignLimitAccess: {
      canCreate: campaignLimitAccess.hasAccess,
      current: campaignCount,
      max: campaignLimitAccess.error?.maxLimit ?? 999999,
    },
    // Marketing Hub Mode
    marketingMode: modeInfo.mode,
    showChoiceModal,
    isKlaviyoConnected: modeInfo.isKlaviyoConnected,
    // Metrics
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
    // Klaviyo-specific data
    klaviyoData,
  });
};

// ============================================
// ACTION
// ============================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  switch (intent) {
    case "setMarketingMode": {
      // Rate-based model: All plans can set marketing mode
      const mode = formData.get("mode") as MarketingHubMode;

      // If selecting Klaviyo but not connected, redirect to connect page
      if (mode === "KLAVIYO") {
        const modeInfo = await getMarketingModeInfo(shop);
        if (!modeInfo.isKlaviyoConnected) {
          // Mark choice as seen but don't set mode yet
          await markChoiceModalSeen(shop);
          return redirect("/app/marketing/klaviyo?connect=true");
        }
      }

      const result = await setMarketingHubMode(shop, mode);

      if (!result.success) {
        return json({ success: false, error: result.error }, { status: 400 });
      }

      return json({ success: true, mode: result.mode });
    }

    case "dismissChoiceModal": {
      await markChoiceModalSeen(shop);
      return json({ success: true });
    }

    case "toggleEvent": {
      const eventId = formData.get("eventId") as string;
      const enabled = formData.get("enabled") === "true";

      // Map event toggle IDs to KlaviyoAutomationSettings field names
      const eventFieldMap: Record<string, string> = {
        customer_enrolled: "sendCustomerEnrolled",
        tier_upgraded: "sendTierUpgraded",
        tier_downgraded: "sendTierDowngraded",
        order_placed: "sendOrderPlaced",
        cashback_earned: "sendCashbackEarned",
        cashback_redeemed: "sendCashbackRedeemed",
        points_expiring: "sendPointsExpiring",
        win_back: "sendWinBack",
        birthday: "sendCustomerBirthday",
        anniversary: "sendCustomerAnniversary",
      };

      const fieldName = eventFieldMap[eventId];
      if (!fieldName) {
        return json({ success: false, error: "Unknown event type" }, { status: 400 });
      }

      try {
        await db.klaviyoAutomationSettings.upsert({
          where: { shop },
          create: {
            shop,
            [fieldName]: enabled,
          },
          update: {
            [fieldName]: enabled,
          },
        });
        return json({ success: true });
      } catch (e: any) {
        return json({ success: false, error: e.message }, { status: 500 });
      }
    }

    default:
      return json({ success: false, error: "Invalid intent" }, { status: 400 });
  }
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
  const fetcher = useFetcher();
  const [dateRange, setDateRange] = useState("30");
  const [choiceModalOpen, setChoiceModalOpen] = useState(data.showChoiceModal);

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

  // Handle mode selection
  const handleModeSelect = useCallback((mode: "INHOUSE" | "KLAVIYO") => {
    fetcher.submit(
      { intent: "setMarketingMode", mode },
      { method: "post" }
    );
    setChoiceModalOpen(false);
  }, [fetcher]);

  // Handle modal dismiss
  const handleModalDismiss = useCallback(() => {
    fetcher.submit(
      { intent: "dismissChoiceModal" },
      { method: "post" }
    );
    setChoiceModalOpen(false);
  }, [fetcher]);

  // Klaviyo dashboard handlers
  const handleSyncNow = useCallback(() => {
    fetcher.submit(
      { intent: "syncKlaviyo" },
      { method: "post" }
    );
  }, [fetcher]);

  const handleToggleEvent = useCallback((eventId: string, enabled: boolean) => {
    fetcher.submit(
      { intent: "toggleEvent", eventId, enabled: enabled.toString() },
      { method: "post" }
    );
  }, [fetcher]);

  const handleOpenKlaviyo = useCallback(() => {
    window.open("https://www.klaviyo.com/dashboard", "_blank");
  }, []);

  const handleManageSettings = useCallback(() => {
    navigate("/app/marketing/settings");
  }, [navigate]);

  // Show setup banner if not configured (but still show full hub)
  const showSetupBanner = !data.isConfigured && data.marketingMode !== "KLAVIYO";
  const isKlaviyoMode = data.marketingMode === "KLAVIYO";
  const isLoading = fetcher.state !== "idle";

  // Dynamic page actions based on mode
  const pageActions = isKlaviyoMode
    ? {
        primaryAction: {
          content: "Open Klaviyo",
          icon: ExternalIcon,
          onAction: () => window.open("https://www.klaviyo.com/dashboard", "_blank"),
        },
        secondaryActions: [
          {
            content: "Event Settings",
            onAction: () => navigate("/app/marketing/klaviyo"),
          },
          {
            content: "Settings",
            icon: SettingsIcon,
            onAction: () => navigate("/app/marketing/settings"),
          },
        ],
      }
    : {
        primaryAction: {
          content: "Create Campaign",
          icon: PlusIcon,
          onAction: () => navigate("/app/marketing/campaigns/create"),
        },
        secondaryActions: [
          {
            content: "Templates",
            onAction: () => navigate("/app/marketing/templates"),
          },
          {
            content: "Settings",
            icon: SettingsIcon,
            onAction: () => navigate("/app/marketing/settings"),
          },
        ],
      };

  return (
    <Page
      title="Marketing Hub"
      subtitle={
        isKlaviyoMode
          ? "Connected to Klaviyo for advanced marketing automation"
          : "Email campaigns and automation for your loyalty program"
      }
      titleMetadata={
        isKlaviyoMode ? (
          <Badge tone="magic">Powered by Klaviyo</Badge>
        ) : data.marketingMode === "INHOUSE" ? (
          <Badge tone="success">In-House</Badge>
        ) : null
      }
      primaryAction={pageActions.primaryAction}
      secondaryActions={pageActions.secondaryActions}
    >
      <Layout>
        {/* Setup Banner - shown if email not configured */}
        {showSetupBanner && (
          <Layout.Section>
            <Banner
              title="Complete your email setup"
              tone="warning"
              action={{
                content: "Configure Email Settings",
                onAction: () => navigate("/app/marketing/settings"),
              }}
              secondaryAction={{
                content: "Connect Klaviyo",
                onAction: () => navigate("/app/marketing/klaviyo"),
              }}
            >
              <p>
                Set up your email provider to start sending campaigns. You can use SendGrid for direct sending or connect Klaviyo for advanced marketing automation.
              </p>
            </Banner>
          </Layout.Section>
        )}

        {/* Klaviyo Mode Dashboard */}
        {isKlaviyoMode && data.klaviyoData && (
          <Layout.Section>
            <KlaviyoMarketingDashboard
              syncStatus={data.klaviyoData.syncStatus}
              eventToggles={data.klaviyoData.eventToggles}
              recentEvents={data.klaviyoData.recentEvents}
              onSyncNow={handleSyncNow}
              onToggleEvent={handleToggleEvent}
              onOpenKlaviyo={handleOpenKlaviyo}
              onManageSettings={handleManageSettings}
              isSyncing={isLoading}
            />
          </Layout.Section>
        )}

        {/* In-House Mode Content */}
        {!isKlaviyoMode && (
          <>
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
                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="h2" variant="headingMd">Recent Campaigns</Text>
                        {data.recentCampaigns.length > 0 ? (
                          <Badge tone={data.recentCampaigns.some(c => c.status === 'sent') ? "success" : "info"}>
                            {data.recentCampaigns.filter(c => c.status === 'sent').length > 0
                              ? `${data.recentCampaigns.filter(c => c.status === 'sent').length} sent`
                              : data.recentCampaigns.filter(c => c.status === 'scheduled').length > 0
                                ? `${data.recentCampaigns.filter(c => c.status === 'scheduled').length} scheduled`
                                : `${data.recentCampaigns.filter(c => c.status === 'draft').length} draft`}
                          </Badge>
                        ) : (
                          <Badge tone="new">Get Started</Badge>
                        )}
                      </InlineStack>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Send targeted emails to engage loyalty members
                      </Text>
                    </BlockStack>
                    {data.recentCampaigns.length > 0 && (
                      <Button
                        variant="plain"
                        onClick={() => navigate("/app/marketing/campaigns")}
                      >
                        View all
                      </Button>
                    )}
                  </InlineStack>

                  {data.recentCampaigns.length === 0 ? (
                    <Box padding="500" background="bg-surface-secondary" borderRadius="200">
                      <BlockStack gap="300" inlineAlign="center">
                        <div style={{
                          width: 48,
                          height: 48,
                          borderRadius: '50%',
                          backgroundColor: 'var(--p-color-bg-fill-info-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <Icon source={EmailIcon} tone="info" />
                        </div>
                        <BlockStack gap="100" inlineAlign="center">
                          <Text as="p" variant="bodyMd" fontWeight="semibold" alignment="center">
                            Launch your first campaign
                          </Text>
                          <Text as="p" tone="subdued" alignment="center" variant="bodySm">
                            Email campaigns help you announce promotions, share tier benefits, and re-engage inactive members. Start with a welcome announcement or a tier-exclusive offer.
                          </Text>
                        </BlockStack>
                        <InlineStack gap="200">
                          <Button variant="primary" onClick={() => navigate("/app/marketing/campaigns/create")}>
                            Create Campaign
                          </Button>
                          <Button variant="plain" onClick={() => navigate("/app/marketing/templates")}>
                            Browse Templates
                          </Button>
                        </InlineStack>
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
                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="h2" variant="headingMd">Automations</Text>
                        {data.automations.length === 0 ? (
                          <Badge tone="new">Set Up</Badge>
                        ) : data.automations.filter(a => a.isEnabled).length === 0 ? (
                          <Badge tone="warning">All Paused</Badge>
                        ) : (
                          <Badge tone="success">
                            {data.automations.filter(a => a.isEnabled).length} Running
                          </Badge>
                        )}
                      </InlineStack>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Triggered emails that run automatically on events
                      </Text>
                    </BlockStack>
                    {data.automations.length > 0 && (
                      <Button
                        variant="plain"
                        onClick={() => navigate("/app/marketing/automation/workflows")}
                      >
                        Manage
                      </Button>
                    )}
                  </InlineStack>

                  {data.automations.length === 0 ? (
                    <Box padding="500" background="bg-surface-secondary" borderRadius="200">
                      <BlockStack gap="300" inlineAlign="center">
                        <div style={{
                          width: 48,
                          height: 48,
                          borderRadius: '50%',
                          backgroundColor: 'var(--p-color-bg-fill-success-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <Icon source={AutomationIcon} tone="success" />
                        </div>
                        <BlockStack gap="100" inlineAlign="center">
                          <Text as="p" variant="bodyMd" fontWeight="semibold" alignment="center">
                            Set up automated engagement
                          </Text>
                          <Text as="p" tone="subdued" alignment="center" variant="bodySm">
                            Automations send timely emails when customers join, upgrade tiers, or become inactive. Start with a welcome email to greet new loyalty members.
                          </Text>
                        </BlockStack>
                        <InlineStack gap="200">
                          <Button variant="primary" onClick={() => navigate("/app/marketing/automation/create")}>
                            Create Automation
                          </Button>
                          <Button variant="plain" onClick={() => navigate("/app/marketing/automation/workflows")}>
                            View Templates
                          </Button>
                        </InlineStack>
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

              {/* Points Engagement Bridge */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="h2" variant="headingMd">Points Engagement</Text>
                        <Badge tone="magic">Gamification</Badge>
                      </InlineStack>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Promote gamified features to boost customer engagement
                      </Text>
                    </BlockStack>
                    <Button
                      variant="plain"
                      onClick={() => navigate("/app/rewards")}
                    >
                      View Points Hub
                    </Button>
                  </InlineStack>

                  <BlockStack gap="200">
                    {/* Raffles */}
                    <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="300" blockAlign="center">
                          <div style={{
                            width: 36,
                            height: 36,
                            borderRadius: '8px',
                            backgroundColor: '#e3f1df',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <Icon source={GiftCardIcon} tone="success" />
                          </div>
                          <BlockStack gap="050">
                            <Text as="span" variant="bodyMd" fontWeight="medium">
                              Raffles
                            </Text>
                            <Text as="span" variant="bodySm" tone="subdued">
                              Prize drawings customers enter with points
                            </Text>
                          </BlockStack>
                        </InlineStack>
                        <Button
                          size="slim"
                          onClick={() => navigate("/app/marketing/campaigns/create?preset=raffle")}
                        >
                          Announce
                        </Button>
                      </InlineStack>
                    </Box>

                    {/* Mystery Boxes */}
                    <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="300" blockAlign="center">
                          <div style={{
                            width: 36,
                            height: 36,
                            borderRadius: '8px',
                            backgroundColor: '#fef3cd',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <Icon source={StarIcon} tone="warning" />
                          </div>
                          <BlockStack gap="050">
                            <Text as="span" variant="bodyMd" fontWeight="medium">
                              Mystery Boxes
                            </Text>
                            <Text as="span" variant="bodySm" tone="subdued">
                              Surprise rewards with random outcomes
                            </Text>
                          </BlockStack>
                        </InlineStack>
                        <Button
                          size="slim"
                          onClick={() => navigate("/app/marketing/campaigns/create?preset=mystery-box")}
                        >
                          Promote
                        </Button>
                      </InlineStack>
                    </Box>

                    {/* Challenges */}
                    <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="300" blockAlign="center">
                          <div style={{
                            width: 36,
                            height: 36,
                            borderRadius: '8px',
                            backgroundColor: '#dbeafe',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <Icon source={TargetIcon} tone="info" />
                          </div>
                          <BlockStack gap="050">
                            <Text as="span" variant="bodyMd" fontWeight="medium">
                              Challenges
                            </Text>
                            <Text as="span" variant="bodySm" tone="subdued">
                              Goal-based activities for bonus points
                            </Text>
                          </BlockStack>
                        </InlineStack>
                        <Button
                          size="slim"
                          onClick={() => navigate("/app/marketing/campaigns/create?preset=challenge")}
                        >
                          Announce
                        </Button>
                      </InlineStack>
                    </Box>
                  </BlockStack>

                  {/* Tip */}
                  <Box padding="300" background="bg-surface-info" borderRadius="200">
                    <InlineStack gap="200" blockAlign="center">
                      <Icon source={EmailIcon} tone="info" />
                      <Text as="p" variant="bodySm">
                        <Text as="span" fontWeight="semibold">Pro tip:</Text> Segment by tier to send exclusive high-value raffles to VIP members
                      </Text>
                    </InlineStack>
                  </Box>
                </BlockStack>
              </Card>
            </BlockStack>

            {/* Right Column - Audience & Recommendations */}
            <BlockStack gap="400">
              {/* Audience Overview */}
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="h2" variant="headingMd">Audience</Text>
                      {data.customerStats.total === 0 ? (
                        <Badge tone="new">Build Audience</Badge>
                      ) : data.customerStats.withEmail / data.customerStats.total < 0.5 ? (
                        <Badge tone="warning">Low Coverage</Badge>
                      ) : data.customerStats.withEmail / data.customerStats.total >= 0.8 ? (
                        <Badge tone="success">Strong</Badge>
                      ) : (
                        <Badge tone="info">{data.customerStats.total} members</Badge>
                      )}
                    </InlineStack>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Your reachable loyalty program members
                    </Text>
                  </BlockStack>

                  {data.customerStats.total === 0 ? (
                    <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                      <BlockStack gap="200" inlineAlign="center">
                        <Icon source={PersonIcon} tone="subdued" />
                        <Text as="p" tone="subdued" alignment="center" variant="bodySm">
                          No customers enrolled yet. Customers will appear here as they join your loyalty program.
                        </Text>
                        <Button size="slim" onClick={() => navigate("/app/members")}>
                          View Customers
                        </Button>
                      </BlockStack>
                    </Box>
                  ) : (
                    <BlockStack gap="300">
                      <InlineStack align="space-between">
                        <Text as="span" variant="bodyMd">Total Customers</Text>
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          {data.customerStats.total.toLocaleString()}
                        </Text>
                      </InlineStack>
                      <InlineStack align="space-between">
                        <Text as="span" variant="bodyMd">With Email</Text>
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="span" variant="bodyMd" fontWeight="semibold">
                            {data.customerStats.withEmail.toLocaleString()}
                          </Text>
                          {data.customerStats.withEmail / data.customerStats.total < 0.5 && (
                            <Tooltip content="Less than 50% of customers have email addresses">
                              <Icon source={AlertCircleIcon} tone="warning" />
                            </Tooltip>
                          )}
                        </InlineStack>
                      </InlineStack>
                      <Divider />
                      <InlineStack align="space-between">
                        <Text as="span" variant="bodyMd">Reachable</Text>
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="span" variant="bodyMd" fontWeight="semibold">
                            {data.customerStats.subscribed.toLocaleString()}
                          </Text>
                          <Badge tone={
                            data.customerStats.total > 0 &&
                            (data.customerStats.subscribed / data.customerStats.total) >= 0.7
                              ? "success"
                              : "info"
                          }>
                            {data.customerStats.total > 0
                              ? `${((data.customerStats.subscribed / data.customerStats.total) * 100).toFixed(0)}%`
                              : "0%"}
                          </Badge>
                        </InlineStack>
                      </InlineStack>

                      {/* Actionable insight based on coverage */}
                      {data.customerStats.withEmail / data.customerStats.total < 0.5 && data.customerStats.total >= 10 && (
                        <Box padding="300" background="bg-surface-warning" borderRadius="200">
                          <InlineStack gap="200" blockAlign="center">
                            <Icon source={AlertCircleIcon} tone="warning" />
                            <Text as="p" variant="bodySm">
                              Encourage email sign-ups to reach more members with campaigns
                            </Text>
                          </InlineStack>
                        </Box>
                      )}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>

              {/* AI Recommendations */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="h2" variant="headingMd">Recommendations</Text>
                        {data.recommendations.length > 0 ? (
                          <Badge tone="attention">{data.recommendations.length} new</Badge>
                        ) : (
                          <Badge tone="success">Up to date</Badge>
                        )}
                      </InlineStack>
                      <Text as="p" variant="bodySm" tone="subdued">
                        AI-powered campaign suggestions
                      </Text>
                    </BlockStack>
                    {data.recommendations.length > 0 && (
                      <Button
                        variant="plain"
                        onClick={() => navigate("/app/marketing/recommendations")}
                      >
                        View all
                      </Button>
                    )}
                  </InlineStack>

                  {data.recommendations.length === 0 ? (
                    <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                      <BlockStack gap="200" inlineAlign="center">
                        <div style={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          backgroundColor: 'var(--p-color-bg-fill-success-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <Icon source={CheckCircleIcon} tone="success" />
                        </div>
                        <BlockStack gap="100" inlineAlign="center">
                          <Text as="p" variant="bodySm" fontWeight="semibold" alignment="center">
                            You're all caught up
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                            We analyze your customer data to suggest campaigns. New recommendations appear as opportunities arise.
                          </Text>
                        </BlockStack>
                      </BlockStack>
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
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">Quick Actions</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Common marketing tasks
                    </Text>
                  </BlockStack>
                  <BlockStack gap="200">
                    {/* Highlight primary action based on state */}
                    {data.recentCampaigns.length === 0 ? (
                      <Box
                        padding="300"
                        background="bg-surface-info-hover"
                        borderRadius="200"
                      >
                        <InlineStack align="space-between" blockAlign="center">
                          <InlineStack gap="200" blockAlign="center">
                            <Icon source={EmailIcon} tone="info" />
                            <BlockStack gap="050">
                              <Text as="span" variant="bodyMd" fontWeight="semibold">
                                Create First Campaign
                              </Text>
                              <Text as="span" variant="bodySm" tone="subdued">
                                Recommended to get started
                              </Text>
                            </BlockStack>
                          </InlineStack>
                          <Button
                            variant="primary"
                            size="slim"
                            onClick={() => navigate("/app/marketing/campaigns/create")}
                          >
                            Create
                          </Button>
                        </InlineStack>
                      </Box>
                    ) : data.automations.length === 0 ? (
                      <Box
                        padding="300"
                        background="bg-surface-success-hover"
                        borderRadius="200"
                      >
                        <InlineStack align="space-between" blockAlign="center">
                          <InlineStack gap="200" blockAlign="center">
                            <Icon source={AutomationIcon} tone="success" />
                            <BlockStack gap="050">
                              <Text as="span" variant="bodyMd" fontWeight="semibold">
                                Set Up Automation
                              </Text>
                              <Text as="span" variant="bodySm" tone="subdued">
                                Recommended next step
                              </Text>
                            </BlockStack>
                          </InlineStack>
                          <Button
                            variant="primary"
                            size="slim"
                            onClick={() => navigate("/app/marketing/automation/create")}
                          >
                            Create
                          </Button>
                        </InlineStack>
                      </Box>
                    ) : data.recommendations.length > 0 ? (
                      <Box
                        padding="300"
                        background="bg-surface-warning"
                        borderRadius="200"
                      >
                        <InlineStack align="space-between" blockAlign="center">
                          <InlineStack gap="200" blockAlign="center">
                            <Icon source={AlertCircleIcon} tone="warning" />
                            <BlockStack gap="050">
                              <Text as="span" variant="bodyMd" fontWeight="semibold">
                                {data.recommendations.length} Recommendation{data.recommendations.length > 1 ? 's' : ''}
                              </Text>
                              <Text as="span" variant="bodySm" tone="subdued">
                                Action opportunities available
                              </Text>
                            </BlockStack>
                          </InlineStack>
                          <Button
                            size="slim"
                            onClick={() => navigate("/app/marketing/recommendations")}
                          >
                            View
                          </Button>
                        </InlineStack>
                      </Box>
                    ) : null}

                    {/* Standard actions - de-emphasize the one already highlighted */}
                    {data.recentCampaigns.length > 0 && (
                      <Button
                        fullWidth
                        textAlign="left"
                        icon={EmailIcon}
                        onClick={() => navigate("/app/marketing/campaigns/create")}
                      >
                        New Email Campaign
                      </Button>
                    )}
                    {data.automations.length > 0 && (
                      <Button
                        fullWidth
                        textAlign="left"
                        icon={AutomationIcon}
                        onClick={() => navigate("/app/marketing/automation/create")}
                      >
                        New Automation
                      </Button>
                    )}
                    <Button
                      fullWidth
                      textAlign="left"
                      icon={ChartLineIcon}
                      onClick={() => navigate("/app/marketing/analytics")}
                    >
                      View Analytics
                    </Button>
                    <Button
                      fullWidth
                      textAlign="left"
                      icon={SettingsIcon}
                      onClick={() => navigate("/app/marketing/settings")}
                    >
                      Email Settings
                    </Button>
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </InlineGrid>
        </Layout.Section>
          </>
        )}
      </Layout>

      {/* Marketing Choice Modal */}
      <MarketingChoiceModal
        open={choiceModalOpen}
        isKlaviyoConnected={data.isKlaviyoConnected}
        onSelect={handleModeSelect}
        onDismiss={handleModalDismiss}
        loading={isLoading}
      />
    </Page>
  );
}
