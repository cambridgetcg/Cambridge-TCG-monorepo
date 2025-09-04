import { useMemo, useCallback } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  BlockStack,
  Banner,
  EmptyState,
  SkeletonPage,
  SkeletonBodyText,
  SkeletonDisplayText,
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Import icons
import {
  PersonSegmentIcon,
  CashDollarFilledIcon,
  CartIcon,
  ReplayIcon,
  SettingsIcon,
  PriceListIcon,
} from "../utils/polaris-icons";

// Import dashboard components
import { MetricCard } from "../components/dashboard/MetricCard";
import { TierCard } from "../components/dashboard/TierCard";
import { CustomerJourney } from "../components/dashboard/CustomerJourney";
import { SetupChecklist } from "../components/dashboard/SetupChecklist";
import { QuickActionCard } from "../components/dashboard/QuickActionCard";
import { RecentActivityList } from "../components/dashboard/RecentActivityList";

// Types
interface DashboardData {
  shop: string;
  stats: {
    customers: number;
    activeCustomers: number;
    tiers: number;
    totalRewards: number;
    monthlyRewards: number;
    tiersList: Array<{
      id: string;
      name: string;
      minSpend: number;
      cashbackPercent: number;
      evaluationPeriod: string;
      customerCount?: number;
    }>;
  };
  billingPlan: {
    planName: string;
    maxCustomers: number;
  } | null;
  recentActivity: Array<{
    id: string;
    type: "CASHBACK_EARNED" | "CASHBACK_REDEEMED" | "TIER_UPGRADED" | "CUSTOMER_JOINED";
    customer: {
      email: string;
      name?: string;
    };
    amount: number;
    createdAt: string;
    description?: string;
  }>;
  setupTasks: Array<{
    id: string;
    label: string;
    description?: string;
    completed: boolean;
    action: string;
    priority?: "high" | "medium" | "low";
  }>;
  setupProgress: number;
  isProgramLive: boolean;
  trends: {
    customerGrowth: number;
    rewardGrowth: number;
  };
}

// Loader function
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    
    if (!session) {
      throw new Response("Session not found", { status: 401 });
    }
    
    const shop = session.shop;
    
    // Calculate date ranges
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    
    // Fetch all data in parallel
    const [
      customers,
      activeCustomers,
      tiers,
      recentActivity,
      billingPlan,
      totalRewards,
      monthlyRewards,
      previousMonthRewards,
      previousCustomers,
      tierCustomerCounts,
    ] = await Promise.all([
      // Total customers
      db.customer.count({ where: { shop } }),
      
      // Active customers (with activity in last 30 days)
      db.customer.count({
        where: {
          shop,
          OR: [
            { lastPurchaseDate: { gte: thirtyDaysAgo } },
            { updatedAt: { gte: thirtyDaysAgo } },
          ],
        },
      }),
      
      // Tiers
      db.tier.findMany({
        where: { shop },
        orderBy: { minSpend: "asc" },
      }),
      
      // Recent activity
      db.storeCreditLedger.findMany({
        where: { shop },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { customer: true },
      }),
      
      // Billing plan
      db.billingPlan.findUnique({ where: { shop } }),
      
      // Total rewards all time
      db.storeCreditLedger.aggregate({
        where: {
          shop,
          type: "CASHBACK_EARNED",
          amount: { gt: 0 },
        },
        _sum: { amount: true },
      }),
      
      // Monthly rewards
      db.storeCreditLedger.aggregate({
        where: {
          shop,
          type: "CASHBACK_EARNED",
          amount: { gt: 0 },
          createdAt: { gte: thirtyDaysAgo },
        },
        _sum: { amount: true },
      }),
      
      // Previous month rewards (for trend)
      db.storeCreditLedger.aggregate({
        where: {
          shop,
          type: "CASHBACK_EARNED",
          amount: { gt: 0 },
          createdAt: {
            gte: sixtyDaysAgo,
            lt: thirtyDaysAgo,
          },
        },
        _sum: { amount: true },
      }),
      
      // Previous period customers (for trend)
      db.customer.count({
        where: {
          shop,
          createdAt: { lt: thirtyDaysAgo },
        },
      }),
      
      // Customer counts per tier - using findMany instead of groupBy
      db.customer.findMany({
        where: { shop },
        select: {
          currentTierId: true,
        },
      }),
    ]);
    
    // Calculate customer counts per tier
    const tierCountMap = tierCustomerCounts.reduce((acc: Record<string, number>, item: { currentTierId: string | null }) => {
      if (item.currentTierId) {
        acc[item.currentTierId] = (acc[item.currentTierId] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
    
    // Enhance tiers with customer counts
    const tiersWithCounts = tiers.map((tier: any) => ({
      ...tier,
      customerCount: tierCountMap[tier.id] || 0,
    }));
    
    // Calculate trends
    const customerGrowth = previousCustomers > 0
      ? ((customers - previousCustomers) / previousCustomers) * 100
      : 0;
    
    const currentMonthTotal = monthlyRewards._sum.amount || 0;
    const previousMonthTotal = previousMonthRewards._sum.amount || 0;
    const rewardGrowth = previousMonthTotal > 0
      ? ((currentMonthTotal - previousMonthTotal) / previousMonthTotal) * 100
      : 0;
    
    // Setup tasks with priority
    const setupTasks = [
      {
        id: "tiers",
        label: "Create loyalty tiers",
        description: "Set up at least one tier to start rewarding customers",
        completed: tiers.length > 0,
        action: "/app/tiers",
        priority: "high" as const,
      },
      {
        id: "customers",
        label: "First customer enrolled",
        description: "Your first customer will be automatically enrolled on their next purchase",
        completed: customers > 0,
        action: "/app/customers",
        priority: "medium" as const,
      },
      {
        id: "billing",
        label: "Choose a billing plan",
        description: "Upgrade to unlock more features and remove limits",
        completed: billingPlan && billingPlan.planName !== "free",
        action: "/app/billing",
        priority: "low" as const,
      },
      {
        id: "settings",
        label: "Configure program settings",
        description: "Customize your loyalty program settings",
        completed: false, // Could be tracked in settings table
        action: "/app/settings",
        priority: "low" as const,
      },
    ];
    
    const setupProgress = Math.round(
      (setupTasks.filter(t => t.completed).length / setupTasks.length) * 100
    );
    const isProgramLive = tiers.length > 0;
    
    // Transform activity data with proper typing
    const transformedActivity = recentActivity.map((activity: any) => {
      // Map database types to component types
      let activityType: "CASHBACK_EARNED" | "CASHBACK_REDEEMED" | "TIER_UPGRADED" | "CUSTOMER_JOINED";
      
      switch (activity.type) {
        case "CASHBACK_EARNED":
          activityType = "CASHBACK_EARNED";
          break;
        case "CASHBACK_REDEEMED":
        case "ORDER_PAYMENT":
          activityType = "CASHBACK_REDEEMED";
          break;
        case "TIER_UPGRADED":
          activityType = "TIER_UPGRADED";
          break;
        default:
          activityType = "CASHBACK_EARNED"; // Default fallback
      }
      
      return {
        id: activity.id,
        type: activityType,
        customer: {
          email: activity.customer?.email || "Unknown",
          name: activity.customer?.name,
        },
        amount: Number(activity.amount),
        createdAt: activity.createdAt.toISOString(),
        description: activity.description,
      };
    });
    
    return json({
      shop,
      stats: {
        customers,
        activeCustomers,
        tiers: tiers.length,
        totalRewards: totalRewards._sum.amount || 0,
        monthlyRewards: currentMonthTotal,
        tiersList: tiersWithCounts,
      },
      billingPlan,
      recentActivity: transformedActivity,
      setupTasks,
      setupProgress,
      isProgramLive,
      trends: {
        customerGrowth,
        rewardGrowth,
      },
    });
  } catch (error) {
    console.error("[Dashboard] Loader error:", error);
    return json({
      shop: "unknown",
      stats: {
        customers: 0,
        activeCustomers: 0,
        tiers: 0,
        totalRewards: 0,
        monthlyRewards: 0,
        tiersList: [],
      },
      billingPlan: null,
      recentActivity: [],
      setupTasks: [],
      setupProgress: 0,
      isProgramLive: false,
      trends: {
        customerGrowth: 0,
        rewardGrowth: 0,
      },
    });
  }
};

// Main component
export default function Dashboard() {
  const data = useLoaderData<DashboardData>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";
  
  const {
    stats,
    billingPlan,
    recentActivity,
    setupTasks,
    setupProgress,
    isProgramLive,
    trends,
  } = data;
  
  // Memoized values
  const journeySteps = useMemo(() => [
    {
      icon: PersonSegmentIcon,
      timeframe: "IN A FEW DAYS",
      title: "First customer earns",
      description: "Customers that earn cashback are 1.5x more likely to repeat purchase",
    },
    {
      icon: CartIcon,
      timeframe: "WITHIN 90 DAYS",
      title: "First redemption",
      description: "Customers that redeem spend 3x more on average",
    },
    {
      icon: ReplayIcon,
      timeframe: "ONGOING",
      title: "Repeat purchases",
      description: "Loyalty members place 2.4x more orders annually",
    },
  ], []);
  
  const currentJourneyStep = useMemo(() => {
    if (stats.monthlyRewards > 100) return 2;
    if (stats.activeCustomers > 10) return 1;
    return 0;
  }, [stats.monthlyRewards, stats.activeCustomers]);
  
  // Callbacks
  const handleTaskAction = useCallback((action: string | (() => void)) => {
    if (typeof action === "string") {
      navigate(action);
    } else {
      action();
    }
  }, [navigate]);
  
  const handleQuickAction = useCallback((path: string) => {
    navigate(path);
  }, [navigate]);
  
  // Loading state
  if (isLoading) {
    return (
      <SkeletonPage primaryAction>
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              <SkeletonDisplayText size="small" />
              <SkeletonBodyText lines={3} />
            </BlockStack>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <SkeletonBodyText lines={4} />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <SkeletonBodyText lines={4} />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <SkeletonBodyText lines={4} />
          </Layout.Section>
        </Layout>
      </SkeletonPage>
    );
  }
  
  return (
    <Page title="Dashboard">
      <BlockStack gap="600">
        {/* Program Status Banner */}
        {!isProgramLive && (
          <Banner
            tone="warning"
            title="Complete setup to launch your loyalty program"
            action={{
              content: "View Setup Tasks",
              onAction: () => {
                const element = document.getElementById("setup-checklist");
                element?.scrollIntoView({ behavior: "smooth" });
              },
            }}
          >
            You're {setupProgress}% complete. Finish setup to start rewarding customers.
          </Banner>
        )}
        
        {isProgramLive && stats.customers === 0 && (
          <Banner
            tone="info"
            title="Your loyalty program is ready!"
          >
            Customers will automatically earn cashback on their next purchase.
          </Banner>
        )}
        
        {/* Metrics Cards */}
        <Layout>
          <Layout.Section variant="oneThird">
            <MetricCard
              title="Total Customers"
              value={stats.customers}
              subtitle={`${stats.activeCustomers} active this month`}
              icon={PersonSegmentIcon}
              badge={
                stats.customers > 0
                  ? { content: "Active", tone: "success" }
                  : { content: "New", tone: "new" }
              }
              trend={
                trends.customerGrowth !== 0
                  ? {
                      value: `${Math.abs(trends.customerGrowth).toFixed(1)}%`,
                      positive: trends.customerGrowth > 0,
                    }
                  : undefined
              }
              onClick={() => navigate("/app/customers")}
            />
          </Layout.Section>
          
          <Layout.Section variant="oneThird">
            <MetricCard
              title="Loyalty Tiers"
              value={stats.tiers}
              subtitle={stats.tiers > 0 ? "Tiers configured" : "Setup required"}
              icon={PriceListIcon}
              badge={
                stats.tiers > 0
                  ? { content: "Active", tone: "success" }
                  : { content: "Setup", tone: "warning" }
              }
              onClick={() => navigate("/app/tiers")}
            />
          </Layout.Section>
          
          <Layout.Section variant="oneThird">
            <MetricCard
              title="Total Rewards"
              value={`$${stats.totalRewards.toFixed(2)}`}
              subtitle={`$${stats.monthlyRewards.toFixed(2)} this month`}
              icon={CashDollarFilledIcon}
              badge={{ content: "All Time", tone: "info" }}
              trend={
                trends.rewardGrowth !== 0
                  ? {
                      value: `${Math.abs(trends.rewardGrowth).toFixed(1)}%`,
                      positive: trends.rewardGrowth > 0,
                    }
                  : undefined
              }
            />
          </Layout.Section>
        </Layout>
        
        {/* Customer Journey - Only show when program is live */}
        {isProgramLive && stats.customers > 0 && (
          <CustomerJourney steps={journeySteps} currentStep={currentJourneyStep} />
        )}
        
        {/* Setup Checklist - Show when not complete */}
        {setupProgress < 100 && (
          <Box id="setup-checklist">
            <SetupChecklist
              tasks={setupTasks}
              onTaskAction={handleTaskAction}
            />
          </Box>
        )}
        
        {/* Quick Actions */}
        <BlockStack gap="400">
          <Layout>
            <Layout.Section variant="oneHalf">
              <QuickActionCard
                title="Configure Tiers"
                description="Set up loyalty tiers and cashback percentages"
                icon={PriceListIcon}
                buttonText={stats.tiers > 0 ? "Manage" : "Get Started"}
                isHighPriority={stats.tiers === 0}
                badge={stats.tiers === 0 ? "Required" : undefined}
                onClick={() => handleQuickAction("/app/tiers")}
              />
            </Layout.Section>
            
            <Layout.Section variant="oneHalf">
              <QuickActionCard
                title="View Customers"
                description="Manage customer rewards and tier assignments"
                icon={PersonSegmentIcon}
                buttonText="View"
                onClick={() => handleQuickAction("/app/customers")}
              />
            </Layout.Section>
            
            <Layout.Section variant="oneHalf">
              <QuickActionCard
                title="Billing & Plans"
                description={
                  billingPlan?.planName === "free"
                    ? "Upgrade for unlimited customers"
                    : "Manage your subscription"
                }
                icon={CashDollarFilledIcon}
                buttonText={billingPlan?.planName === "free" ? "Upgrade" : "Manage"}
                isHighPriority={
                  billingPlan?.planName === "free" && stats.customers > 50
                }
                badge={
                  billingPlan?.planName === "free" && stats.customers > 50
                    ? "Action Needed"
                    : undefined
                }
                onClick={() => handleQuickAction("/app/billing")}
              />
            </Layout.Section>
            
            <Layout.Section variant="oneHalf">
              <QuickActionCard
                title="Settings"
                description="Configure program settings and preferences"
                icon={SettingsIcon}
                buttonText="Configure"
                onClick={() => handleQuickAction("/app/settings")}
              />
            </Layout.Section>
          </Layout>
        </BlockStack>
        
        {/* Recent Activity */}
        <RecentActivityList
          activities={recentActivity}
          onViewAll={() => navigate("/app/customers")}
          maxItems={5}
        />
        
        {/* Current Tiers Display */}
        {stats.tiersList && stats.tiersList.length > 0 && (
          <BlockStack gap="400">
            <Layout>
              {stats.tiersList.map((tier) => (
                <Layout.Section key={tier.id} variant={stats.tiersList.length > 2 ? "oneThird" : "oneHalf"}>
                  <TierCard
                    tier={tier}
                    isActive={(tier.customerCount || 0) > 0}
                    onEdit={() => navigate(`/app/tiers?edit=${tier.id}`)}
                  />
                </Layout.Section>
              ))}
            </Layout>
          </BlockStack>
        )}
        
        {/* Empty State */}
        {!isProgramLive && stats.customers === 0 && setupProgress === 0 && (
          <EmptyState
            heading="Start Building Customer Loyalty"
            action={{
              content: "Configure Tiers",
              onAction: () => navigate("/app/tiers"),
            }}
            secondaryAction={{
              content: "Learn More",
              url: "https://help.shopify.com/manual/promoting-marketing/loyalty-programs",
              external: true,
            }}
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            Set up your first loyalty tiers to start rewarding customers with automatic cashback.
          </EmptyState>
        )}
      </BlockStack>
    </Page>
  );
}

// Error boundary
export function ErrorBoundary() {
  return (
    <Page title="Dashboard">
      <Banner tone="critical">
        An error occurred while loading the dashboard. Please refresh the page or contact support if the issue persists.
      </Banner>
    </Page>
  );
}