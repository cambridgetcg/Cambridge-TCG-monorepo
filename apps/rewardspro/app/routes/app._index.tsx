import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { useState, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Icon,
  Box,
  Badge,
  Divider,
  EmptyState,
  DataTable,
  Grid,
  ProgressBar,
  Tabs,
  Banner,
} from "@shopify/polaris";
import {
  PlusIcon,
  RefreshIcon,
  AlertTriangleIcon,
  PersonIcon,
  CashDollarIcon,
  RewardIcon,
  ChartVerticalIcon,
  CheckCircleIcon,
  InfoIcon,
} from "~/utils/polaris-icons";
import {
  StatsOverview,
  EnhancedDataTable,
  ActionBanner,
} from "../components/DesignSystem";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { formatCurrency } from "../utils/currency";
import { TierBadge } from "../components/TierBadge";
import {
  getTierStyle,
  sortTiersByPriority
} from "../utils/tier-styles";
import { CurrentPlanCard } from "~/components/Billing";
import { MANAGED_PLANS } from "~/constants/billing.constants";

// ============================================
// CONSTANTS
// ============================================

// Note: MANAGED_PLANS is now imported from ~/constants/billing.constants
// Keeping old version for reference only
const OLD_MANAGED_PLANS = {
  "RewardsPro Free": {
    name: "RewardsPro Free",
    displayName: "Free",
    price: 0,
    interval: "month",
    ordersIncluded: 200,
    overageRate: 0,
    features: [
      "200 orders per month",
      "All core features included",
      "Unlimited loyalty tiers",
      "Customer management",
      "Store credit tracking",
      "Basic analytics",
      "No credit card required",
      "Community support",
    ],
    recommended: false,
    isFree: true,
  },
  "RewardsPro Monthly": {
    name: "RewardsPro Monthly",
    displayName: "Pro",
    price: 49,
    interval: "month",
    ordersIncluded: 1000,
    overageRate: 0.01,
    features: [
      "1,000 orders included",
      "$0.01 per additional order",
      "Unlimited loyalty tiers",
      "Advanced analytics",
      "Custom email templates",
      "Priority support",
      "API access",
      "Webhook integrations",
    ],
    recommended: true,
    isFree: false,
  },
  "RewardsPro Annual": {
    name: "RewardsPro Annual",
    displayName: "Enterprise",
    price: 490,
    interval: "annual",
    ordersIncluded: 12000,
    overageRate: 0.008,
    features: [
      "12,000 orders included",
      "$0.008 per additional order",
      "All Pro features",
      "Annual billing (save $98)",
      "Dedicated support",
      "Custom integrations",
      "Advanced reporting",
      "White-label options",
    ],
    recommended: false,
    isFree: false,
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

const formatTransactionType = (type: string): string => {
  const typeMap: Record<string, string> = {
    'CASHBACK_EARNED': 'Cashback Earned',
    'ORDER_PAYMENT': 'Order Payment',
    'REFUND_CREDIT': 'Refund Credit',
    'MANUAL_ADJUSTMENT': 'Manual Adjustment',
    'SHOPIFY_SYNC': 'Shopify Sync',
    'ADMIN_ADJUSTMENT': 'Admin Adjustment',
    'TIER_BONUS': 'Tier Bonus',
  };

  return typeMap[type] || type.replace(/_/g, ' ').toLowerCase();
};

const getCurrentMonthName = (): string => {
  return new Date().toLocaleDateString('en-US', { month: 'long' });
};

const calculateDaysRemaining = (): number => {
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return Math.ceil((endOfMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

const calculateProjectedOrders = (currentOrders: number, daysRemaining: number): number => {
  const now = new Date();
  const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysPassed = totalDaysInMonth - daysRemaining;

  if (daysPassed === 0) return currentOrders;

  const dailyRate = currentOrders / daysPassed;
  return Math.ceil(dailyRate * totalDaysInMonth);
};

// ============================================
// TYPE DEFINITIONS
// ============================================

interface DashboardData {
  shop: string;
  metrics: {
    totalCustomers: number;
    totalStoreCredit: number;
    activeTiers: number;
    averageCredit: number;
    customersWithCredit: number;
    customersWithTiers: number;
  };
  tierDistribution: Array<{
    id: string;
    name: string;
    count: number;
    percentage: number;
    cashbackPercent: number;
    totalCredit: number;
    minSpend: number;
  }>;
  recentTransactions: Array<{
    id: string;
    type: string;
    amount: number;
    balance: number;
    customerEmail: string;
    createdAt: string;
    metadata: any;
  }>;
  topCustomers: Array<{
    id: string;
    email: string;
    storeCredit: number;
    tierName: string | null;
  }>;
  setupComplete: boolean;
  shopSettings: {
    storeCurrency: string;
    currencyDisplayType: string;
  } | null;
  // Billing data
  currentPlan: any | null;
  activeSubscription: any;
  monthlyOrderUsage: {
    orderCount: number;
    planLimit: number;
    planName: string;
    projectedOrders: number;
  } | null;
  currentMonth: string;
  daysRemaining: number;
}

// ============================================
// LOADER - Fetch dashboard data
// ============================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session, billing } = await authenticate.admin(request);

    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;
    console.log(`[Dashboard] Loading data for shop: ${shop}`);

    // Check active subscription with Shopify
    let activeSubscription = null;
    const { FREE_PLAN, MONTHLY_PLAN, ANNUAL_PLAN } = await import("../shopify.server");

    if (billing) {
      try {
        const { hasActivePayment, appSubscriptions } = await billing.check({
          plans: [FREE_PLAN, MONTHLY_PLAN, ANNUAL_PLAN],
          isTest: process.env.NODE_ENV === 'development',
        });

        if (hasActivePayment && appSubscriptions?.length > 0) {
          activeSubscription = appSubscriptions[0];
        }
      } catch (error) {
        console.error("[Dashboard] Error checking subscription:", error);
      }
    }

    // Fetch all data in parallel for performance
    const [
      shopSettings,
      customers,
      tiers,
      recentTransactions,
      billingPlan,
      monthlyOrderUsageData,
    ] = await Promise.all([
      // Shop settings
      db.shopSettings.findUnique({ 
        where: { shop } 
      }),
      
      // All customers with tier info
      db.customer.findMany({
        where: { shop },
        include: {
          currentTier: true,
        },
        orderBy: { storeCredit: 'desc' },
      }),
      
      // All tiers
      db.tier.findMany({
        where: { shop },
        orderBy: { minSpend: 'asc' },
      }),
      
      // Recent transactions (last 20)
      db.storeCreditLedger.findMany({
        where: { shop },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          customer: {
            select: {
              email: true,
              shopifyCustomerId: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),

      // Billing plan from database
      db.billingPlan.findUnique({
        where: { shop },
      }),

      // Monthly order usage
      db.monthlyOrderUsage.findUnique({
        where: {
          shop_year_month: {
            shop,
            year: new Date().getFullYear(),
            month: new Date().getMonth() + 1,
          }
        }
      }),
    ]);

    console.log(`[Dashboard] Fetched data - Customers: ${customers.length}, Tiers: ${tiers.length}, Transactions: ${recentTransactions.length}`);

    // Calculate metrics
    const totalCustomers = customers.length;
    const totalStoreCredit = customers.reduce((sum, c) => 
      sum + parseFloat(c.storeCredit.toString()), 0
    );
    const activeTiers = tiers.length;
    const averageCredit = totalCustomers > 0 ? totalStoreCredit / totalCustomers : 0;
    const customersWithCredit = customers.filter(c => parseFloat(c.storeCredit.toString()) > 0).length;
    const customersWithTiers = customers.filter(c => c.currentTierId).length;

    // Calculate tier distribution
    const tierDistribution = tiers.map(tier => {
      const customersInTier = customers.filter(c => c.currentTierId === tier.id);
      const totalCreditInTier = customersInTier.reduce((sum, c) => 
        sum + parseFloat(c.storeCredit.toString()), 0
      );
      
      return {
        id: tier.id,
        name: tier.name,
        count: customersInTier.length,
        percentage: totalCustomers > 0 ? (customersInTier.length / totalCustomers) * 100 : 0,
        cashbackPercent: tier.cashbackPercent,
        totalCredit: totalCreditInTier,
        minSpend: tier.minSpend,
      };
    });

    // Add "No Tier" category if there are customers without tiers
    const noTierCustomers = customers.filter(c => !c.currentTierId);
    if (noTierCustomers.length > 0) {
      const totalCreditNoTier = noTierCustomers.reduce((sum, c) => 
        sum + parseFloat(c.storeCredit.toString()), 0
      );
      
      tierDistribution.push({
        id: 'no-tier',
        name: "No Tier",
        count: noTierCustomers.length,
        percentage: totalCustomers > 0 ? (noTierCustomers.length / totalCustomers) * 100 : 0,
        cashbackPercent: 0,
        totalCredit: totalCreditNoTier,
        minSpend: 0,
      });
    }

    // Sort tier distribution by customer count
    tierDistribution.sort((a, b) => b.count - a.count);

    // Get top customers with store credit
    const topCustomers = customers
      .slice(0, 5)
      .map(c => ({
        id: c.id,
        email: c.email,
        storeCredit: parseFloat(c.storeCredit.toString()),
        tierName: c.currentTier?.name || null,
      }));

    // Format recent transactions for display
    const formattedTransactions = recentTransactions.map(tx => {
      // Build customer display name
      let customerDisplay = "Unknown Customer";
      
      if (tx.customer) {
        // Check if we have a name
        if (tx.customer.firstName || tx.customer.lastName) {
          const name = [tx.customer.firstName, tx.customer.lastName]
            .filter(Boolean)
            .join(' ');
          customerDisplay = name || tx.customer.email;
        } else if (tx.customer.email) {
          customerDisplay = tx.customer.email;
        }
      } else {
        // Log orphaned transactions for debugging
        console.warn(`[Dashboard] Transaction ${tx.id} has no associated customer`);
        
        // Try to extract info from metadata if available
        if (tx.metadata && typeof tx.metadata === 'object') {
          const meta = tx.metadata as any;
          if (meta.customerEmail) {
            customerDisplay = meta.customerEmail;
          } else if (meta.customerId) {
            customerDisplay = `Customer #${meta.customerId}`;
          }
        }
      }
      
      return {
        id: tx.id,
        type: tx.type,
        amount: parseFloat(tx.amount.toString()),
        balance: parseFloat(tx.balance.toString()),
        customerEmail: customerDisplay,
        createdAt: new Date(tx.createdAt).toLocaleDateString(),
        metadata: tx.metadata,
      };
    });

    // Check if setup is complete
    const setupComplete = tiers.length > 0;

    // Process billing data
    const currentMonth = getCurrentMonthName();
    const daysRemaining = calculateDaysRemaining();

    let monthlyOrderUsage = null;
    if (monthlyOrderUsageData) {
      const projectedOrders = calculateProjectedOrders(monthlyOrderUsageData.orderCount, daysRemaining);
      monthlyOrderUsage = {
        orderCount: monthlyOrderUsageData.orderCount,
        planLimit: monthlyOrderUsageData.planLimit,
        planName: monthlyOrderUsageData.planName,
        projectedOrders
      };
    } else if (!activeSubscription || activeSubscription?.name === 'RewardsPro Free') {
      // Default for free plan
      monthlyOrderUsage = {
        orderCount: 0,
        planLimit: 200,
        planName: 'RewardsPro Free',
        projectedOrders: 0
      };
    }

    // Serialize billing plan data
    const serializedPlan = billingPlan ? {
      ...billingPlan,
      monthlyPrice: Number(billingPlan.monthlyPrice || 0),
      usageCap: billingPlan.usageCap ? Number(billingPlan.usageCap) : null,
      currentPeriodEnd: billingPlan.currentPeriodEnd instanceof Date
        ? billingPlan.currentPeriodEnd.toISOString()
        : billingPlan.currentPeriodEnd,
      lastCapAlert: billingPlan.lastCapAlert instanceof Date
        ? billingPlan.lastCapAlert.toISOString()
        : billingPlan.lastCapAlert,
      createdAt: billingPlan.createdAt instanceof Date
        ? billingPlan.createdAt.toISOString()
        : billingPlan.createdAt,
      updatedAt: billingPlan.updatedAt instanceof Date
        ? billingPlan.updatedAt.toISOString()
        : billingPlan.updatedAt,
    } : null;

    const dashboardData: DashboardData = {
      shop,
      metrics: {
        totalCustomers,
        totalStoreCredit,
        activeTiers,
        averageCredit,
        customersWithCredit,
        customersWithTiers,
      },
      tierDistribution,
      recentTransactions: formattedTransactions,
      topCustomers,
      setupComplete,
      shopSettings: shopSettings ? {
        storeCurrency: shopSettings.storeCurrency,
        currencyDisplayType: shopSettings.currencyDisplayType,
      } : null,
      // Billing data
      currentPlan: serializedPlan,
      activeSubscription,
      monthlyOrderUsage,
      currentMonth,
      daysRemaining,
    };

    console.log(`[Dashboard] Returning data for ${shop}`);
    return json(dashboardData);
  } catch (error) {
    console.error("[Dashboard] Loader error:", error);
    throw new Response("Failed to load dashboard data", { status: 500 });
  }
};

// ============================================
// DASHBOARD COMPONENT
// ============================================

export default function Dashboard() {
  const data = useLoaderData<typeof loader>() as DashboardData;
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Plan details calculations are now handled by CurrentPlanCard component
  // These variables are kept for reference but no longer needed
  // const activePlanName = data.activeSubscription?.name || data.currentPlan?.planName || "RewardsPro Free";
  // const planDetails = MANAGED_PLANS[activePlanName as keyof typeof MANAGED_PLANS] || MANAGED_PLANS["RewardsPro Free"];
  // const currentUsage = data.monthlyOrderUsage?.orderCount || 0;
  // const planLimit = data.monthlyOrderUsage?.planLimit || 200;
  // const projectedUsage = data.monthlyOrderUsage?.projectedOrders || 0;
  // const usagePercentage = Math.min((currentUsage / planLimit) * 100, 100);
  // const projectedPercentage = Math.min((projectedUsage / planLimit) * 100, 100);
  // const progressTone = usagePercentage >= 90 ? "critical" : usagePercentage >= 75 ? "warning" : "success";
  // const protectionApplied = currentUsage > planLimit;
  // const ordersNotCounted = protectionApplied ? currentUsage - planLimit : 0;

  // Format currency helper
  const formatAmount = useCallback((amount: number) => {
    return formatCurrency(amount, data.shopSettings as any);
  }, [data.shopSettings]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    window.location.reload();
  }, []);

  // Tab configuration
  const tabs = [
    { id: 'overview', content: 'Overview', panelID: 'overview-panel' },
    { id: 'activity', content: 'Recent Activity', panelID: 'activity-panel' },
    { id: 'insights', content: 'Insights', panelID: 'insights-panel' },
  ];

  // If setup is not complete, show onboarding
  if (!data.setupComplete) {
    return (
      <Page title="Welcome to RewardsPro">
        <Layout>
          <Layout.Section>
            <EmptyState
              heading="Get started with RewardsPro"
              action={{
                content: "Manage customers & tiers",
                url: "/app/customers",
              }}
              secondaryAction={{
                content: "Configure settings",
                url: "/app/settings",
              }}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>Set up loyalty tiers and start rewarding your customers with cashback.</p>
            </EmptyState>
          </Layout.Section>
        </Layout>
        
        {/* Bottom spacer to prevent content from touching the bottom */}
        <div style={{ height: '80px', width: '100%' }} aria-hidden="true" />
      </Page>
    );
  }

  return (
    <Page 
      title="Dashboard"
      primaryAction={{
        content: "Add customer",
        icon: PlusIcon,
        url: "/app/customers",
      }}
      secondaryActions={[
        {
          content: "Refresh",
          icon: RefreshIcon,
          onAction: handleRefresh,
          loading: isRefreshing,
        },
      ]}
    >
      <Layout>
        {/* Plan Details Card - Using shared component */}
        <Layout.Section>
          <CurrentPlanCard
            activeSubscription={data.activeSubscription}
            currentPlan={data.currentPlan}
            monthlyOrderUsage={{
              orderCount: data.monthlyOrderUsage?.orderCount || 0,
              planLimit: data.monthlyOrderUsage?.planLimit || 200,
              projectedOrders: data.monthlyOrderUsage?.projectedOrders || 0,
              currentMonth: data.currentMonth
            }}
            showUpgradeButton={true}
            showOverageBanner={false}
            showCountStrategy={false}
            showProjectedUsage={true}
            compact={false}
            onUpgrade={() => navigate("/app/billing/plans")}
          />
        </Layout.Section>

        {/* Key Metrics Overview */}
        <Layout.Section>
          <StatsOverview
            stats={[
              {
                label: "Total Customers",
                value: data.metrics.totalCustomers.toString(),
                icon: PersonIcon,
              },
              {
                label: "Total Store Credit",
                value: formatAmount(data.metrics.totalStoreCredit),
                icon: CashDollarIcon,
              },
              {
                label: "Active Tiers",
                value: data.metrics.activeTiers.toString(),
                icon: RewardIcon,
              },
              {
                label: "Average Credit",
                value: formatAmount(data.metrics.averageCredit),
                icon: ChartVerticalIcon,
              },
            ]}
            loading={isRefreshing}
          />
        </Layout.Section>
        
        <Layout.Section>
          <BlockStack gap="500">

            {/* Tabbed Content Area */}
            <Card>
              <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
                {/* Overview Tab */}
                {selectedTab === 0 && (
                  <Box padding="400">
                    <BlockStack gap="500">
                      {/* Tier Distribution */}
                      <BlockStack gap="400">
                        <Text variant="headingMd" as="h2">
                          Tier Distribution
                        </Text>
                        {data.tierDistribution.length > 0 ? (
                          <BlockStack gap="300">
                            {sortTiersByPriority(data.tierDistribution).map((tier) => (
                              <BlockStack key={tier.id} gap="200">
                                <InlineStack align="space-between">
                                  <InlineStack gap="300" align="start">
                                    {tier.name === "No Tier" ? (
                                      <Icon source={AlertTriangleIcon} tone="caution" />
                                    ) : (
                                      <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '8px',
                                        background: getTierStyle(tier.name).backgroundColor,
                                        border: `2px solid ${getTierStyle(tier.name).borderColor}`,
                                      }}>
                                        <Icon 
                                          source={getTierStyle(tier.name).icon} 
                                          tone="base"
                                        />
                                      </div>
                                    )}
                                    <BlockStack gap="100">
                                      <InlineStack gap="200" align="start">
                                        {tier.name === "No Tier" ? (
                                          <Text variant="bodyMd" fontWeight="semibold" as="p">
                                            {tier.name}
                                          </Text>
                                        ) : (
                                          <TierBadge
                                            tierName={tier.name}
                                            size="small"
                                            showIcon={false}
                                            cashbackPercent={tier.cashbackPercent}
                                          />
                                        )}
                                      </InlineStack>
                                      <Text variant="bodySm" tone="subdued" as="p">
                                        {tier.count} customers • {formatAmount(tier.totalCredit)} total credit
                                      </Text>
                                    </BlockStack>
                                  </InlineStack>
                                  <Text variant="bodyLg" fontWeight="semibold" as="p">
                                    {tier.percentage.toFixed(1)}%
                                  </Text>
                                </InlineStack>
                                <ProgressBar
                                  progress={tier.percentage}
                                  size="small"
                                  tone={tier.name === "No Tier" ? "critical" : "success"}
                                />
                              </BlockStack>
                            ))}
                          </BlockStack>
                        ) : (
                          <EmptyState
                            heading="No tier data yet"
                            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                          >
                            <p>Tier distribution will appear here once you have customers.</p>
                          </EmptyState>
                        )}
                      </BlockStack>
                    </BlockStack>
                  </Box>
                )}

                {/* Recent Activity Tab */}
                {selectedTab === 1 && (
                  <Box padding="400">
                    <BlockStack gap="400">
                      <Text variant="headingMd" as="h2">
                        Recent Transactions
                      </Text>
                      {data.recentTransactions.length > 0 ? (
                        <EnhancedDataTable
                          columns={[
                            { header: "Customer", type: "text" },
                            { header: "Type", type: "text" },
                            { header: "Amount", type: "numeric" },
                            { header: "Balance", type: "numeric" },
                            { header: "Date", type: "text" },
                          ]}
                          rows={data.recentTransactions.slice(0, 10).map(tx => [
                            tx.customerEmail,
                            formatTransactionType(tx.type),
                            formatAmount(tx.amount),
                            formatAmount(tx.balance),
                            tx.createdAt,
                          ])}
                        />
                      ) : (
                        <EmptyState
                          heading="No transactions yet"
                          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                        >
                          <p>Transactions will appear here when customers earn or use store credit.</p>
                        </EmptyState>
                      )}
                    </BlockStack>
                  </Box>
                )}

                {/* Insights Tab */}
                {selectedTab === 2 && (
                  <Box padding="400">
                    <BlockStack gap="500">
                      <BlockStack gap="400">
                        <Text variant="headingMd" as="h2">
                          Key Insights
                        </Text>
                        
                        {/* Insights Cards */}
                        <BlockStack gap="300">
                          {data.metrics.customersWithTiers < data.metrics.totalCustomers * 0.5 && (
                            <ActionBanner
                              title="Opportunity: Increase tier participation"
                              content={`Only ${Math.round((data.metrics.customersWithTiers / data.metrics.totalCustomers) * 100)}% of your customers are in a tier. Consider reviewing tier thresholds or running a campaign.`}
                              tone="info"
                              action={{ content: "View customers", onAction: () => window.location.href = "/app/customers" }}
                            />
                          )}

                          {data.metrics.averageCredit > 50 && (
                            <ActionBanner
                              title="High average credit balance"
                              content={`Your customers have an average of ${formatAmount(data.metrics.averageCredit)} in store credit. This indicates strong engagement with your rewards program.`}
                              tone="success"
                            />
                          )}

                          {data.tierDistribution.find(t => t.name === "No Tier" && t.percentage > 30) && (
                            <ActionBanner
                              title="Many customers without tiers"
                              content={`${data.tierDistribution.find(t => t.name === "No Tier")?.percentage.toFixed(0)}% of customers aren't in a tier. Consider adjusting your tier requirements.`}
                              tone="warning"
                              action={{ content: "Manage customers & tiers", onAction: () => window.location.href = "/app/customers" }}
                            />
                          )}
                        </BlockStack>
                      </BlockStack>

                      <Divider />

                      {/* Program Statistics */}
                      <BlockStack gap="400">
                        <Text variant="headingMd" as="h2">
                          Program Statistics
                        </Text>
                        <Grid>
                          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                            <Card>
                              <Box padding="300">
                                <BlockStack gap="200">
                                  <Text variant="bodySm" tone="subdued" as="p">
                                    Tier Participation Rate
                                  </Text>
                                  <Text variant="headingLg" as="h3">
                                    {Math.round((data.metrics.customersWithTiers / data.metrics.totalCustomers) * 100)}%
                                  </Text>
                                  <ProgressBar 
                                    progress={(data.metrics.customersWithTiers / data.metrics.totalCustomers) * 100}
                                    size="small"
                                  />
                                </BlockStack>
                              </Box>
                            </Card>
                          </Grid.Cell>
                          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                            <Card>
                              <Box padding="300">
                                <BlockStack gap="200">
                                  <Text variant="bodySm" tone="subdued" as="p">
                                    Credit Utilization Rate
                                  </Text>
                                  <Text variant="headingLg" as="h3">
                                    {Math.round((data.metrics.customersWithCredit / data.metrics.totalCustomers) * 100)}%
                                  </Text>
                                  <ProgressBar 
                                    progress={(data.metrics.customersWithCredit / data.metrics.totalCustomers) * 100}
                                    size="small"
                                  />
                                </BlockStack>
                              </Box>
                            </Card>
                          </Grid.Cell>
                        </Grid>
                      </BlockStack>
                    </BlockStack>
                  </Box>
                )}
              </Tabs>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}