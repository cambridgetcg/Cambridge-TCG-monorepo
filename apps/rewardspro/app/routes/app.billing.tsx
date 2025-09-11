import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate, Link } from "@remix-run/react";
export { ErrorBoundary } from "../components/ErrorBoundary";
import {
  Page,
  Layout,
  Card,
  Button,
  Banner,
  BlockStack,
  InlineStack,
  Text,
  ProgressBar,
  Badge,
  Icon,
  Box,
  Divider,
  CalloutCard,
  DataTable,
  Spinner,
} from "@shopify/polaris";
import {
  CheckIcon,
  AlertTriangleIcon,
  CalendarIcon,
  CreditCardIcon,
  MegaphoneIcon,
  LightbulbIcon,
  ChartVerticalIcon,
} from "@shopify/polaris-icons";
import { useState, useCallback, useEffect } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// ============= TYPES =============
type BillingPlan = {
  id: string;
  shop: string;
  planName: string;
  status: string;
  monthlyPrice: number;
  usageCap: number | null;
  currentPeriodEnd: string | null;
  cap80AlertSent: boolean;
  cap90AlertSent: boolean;
  lastCapAlert: string | null;
  metadata: any;
  createdAt: string;
  updatedAt: string;
};

type UsageRecord = {
  id: string;
  description: string;
  amount: number;
  processedAt: string;
  currencyCode: string;
};

type LoaderData = {
  currentPlan: BillingPlan | null;
  activeSubscription: any;
  monthlyUsage: number;
  usageRecords: UsageRecord[];
  usagePercentage: number;
  daysRemaining: number;
  notifications: any[];
  shop: string;
};

// ============= CONSTANTS =============
const MANAGED_PLANS = {
  "RewardsPro Monthly": {
    name: "RewardsPro Monthly",
    displayName: "RewardsPro Monthly",
    price: 49,
    interval: "month",
    ordersIncluded: 1000,
    overageRate: 0.01, // $0.01 per order
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
  },
  "RewardsPro Annual": {
    name: "RewardsPro Annual",
    displayName: "RewardsPro Annual",
    price: 490,
    interval: "year",
    ordersIncluded: 12000,
    overageRate: 0.01,
    features: [
      "12,000 orders included (1,000/month)",
      "$0.01 per additional order",
      "Save ~17% compared to monthly",
      "All monthly features included",
      "Annual billing cycle",
      "Dedicated onboarding",
      "Quarterly business reviews",
      "Custom integrations support",
    ],
  },
};

// ============= HELPERS =============
const calculateDaysRemaining = (endDate: string): number => {
  const end = new Date(endDate);
  const now = new Date();
  const diffTime = Math.abs(end.getTime() - now.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

const calculateUsagePercentage = (used: number, limit: number): number => {
  if (limit === 0) return 0;
  return Math.min(Math.round((used / limit) * 100), 100);
};

const getUsageTone = (percentage: number): "success" | "critical" => {
  if (percentage < 90) return "success";
  return "critical";
};

const getCurrentMonthName = (): string => {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  return months[new Date().getMonth()];
};

// ============= LOADER =============
export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log("[Billing Page] Loading billing information...");
  
  // Import plan names from server module inside loader
  const { MONTHLY_PLAN, ANNUAL_PLAN } = await import("../shopify.server");
  
  try {
    const { session, billing } = await authenticate.admin(request);
    
    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;
    console.log("[Billing Page] Shop:", shop);

    // Check active subscription with Shopify
    let activeSubscription = null;
    if (billing) {
      try {
        const { hasActivePayment, appSubscriptions } = await billing.check({
          plans: [MONTHLY_PLAN, ANNUAL_PLAN],
          isTest: process.env.NODE_ENV === 'development',
        });
        
        if (hasActivePayment && appSubscriptions?.length > 0) {
          activeSubscription = appSubscriptions[0];
          console.log("[Billing Page] Active subscription found:", activeSubscription.name);
        }
      } catch (error) {
        console.error("[Billing Page] Error checking subscription:", error);
      }
    }
    
    // Fetch billing plan from database
    const billingPlan = await db.billingPlan.findUnique({
      where: { shop },
    });

    // Calculate current month's usage
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    
    // Get usage records for this month
    let usageRecords = [];
    try {
      usageRecords = await db.usageRecord.findMany({
        where: {
          shop,
          processedAt: {
            gte: startOfMonth,
          },
        },
        orderBy: {
          processedAt: 'desc',
        },
        take: 10, // Last 10 usage records
      });
    } catch (error) {
      console.warn("[Billing Page] Could not fetch usage records (migration may be pending):", error);
      // Continue with empty records if there's a schema mismatch
      usageRecords = [];
    }
    
    // Calculate total monthly usage
    let monthlyUsage = 0;
    try {
      const monthlyUsageAgg = await db.usageRecord.aggregate({
        where: {
          shop,
          processedAt: {
            gte: startOfMonth,
          },
        },
        _sum: {
          amount: true,
        },
      });
      monthlyUsage = monthlyUsageAgg._sum.amount || 0;
      console.log("[Billing Page] Monthly usage: $", monthlyUsage);
    } catch (error) {
      console.warn("[Billing Page] Could not calculate monthly usage (migration may be pending):", error);
      // Continue with 0 usage if the amount column doesn't exist yet
      monthlyUsage = 0;
    }
    
    // Get any notifications
    let notifications = [];
    try {
      notifications = await db.notification.findMany({
        where: {
          shop,
          type: 'USAGE_CAP_WARNING',
          read: false,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 5,
      });
    } catch (error) {
      console.warn("[Billing Page] Could not fetch notifications (table may not exist yet):", error);
      // Continue with empty notifications if the table doesn't exist
      notifications = [];
    }

    // Calculate metrics
    const daysRemaining = billingPlan?.currentPeriodEnd 
      ? calculateDaysRemaining(billingPlan.currentPeriodEnd.toString())
      : 30;
    
    const usagePercentage = billingPlan?.usageCap
      ? Math.min(Math.round((monthlyUsage / Number(billingPlan.usageCap)) * 100), 100)
      : 0;
    
    // Serialize data for JSON
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
        : String(billingPlan.createdAt),
      updatedAt: billingPlan.updatedAt instanceof Date
        ? billingPlan.updatedAt.toISOString()
        : String(billingPlan.updatedAt),
    } : null;
    
    const serializedRecords = usageRecords.map(record => ({
      ...record,
      amount: Number(record.amount),
      processedAt: record.processedAt instanceof Date
        ? record.processedAt.toISOString()
        : String(record.processedAt),
    }));

    return json<LoaderData>({
      currentPlan: serializedPlan,
      activeSubscription,
      monthlyUsage: Number(monthlyUsage),
      usageRecords: serializedRecords,
      usagePercentage,
      daysRemaining,
      notifications,
      shop,
    });
  } catch (error: any) {
    console.error("[Billing Page] Error:", error);
    throw new Response("Failed to load billing information", { status: 500 });
  }
};

// ============= ACTION =============
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { session, billing, redirect } = await authenticate.admin(request);
    
    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;
    const formData = await request.formData();
    const intent = formData.get("intent") as string;

    if (intent === "upgrade") {
      // Redirect to Shopify-hosted pricing page for managed pricing
      const shopDomain = session.shop;
      const storeHandle = shopDomain.replace(".myshopify.com", "");
      const appHandle = process.env.SHOPIFY_APP_HANDLE || "rewardspro";
      
      const pricingPageUrl = `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
      
      return redirect(pricingPageUrl, { target: "_top" });
    }
    
    if (intent === "create-usage-charge") {
      // Example of creating a usage charge
      const description = formData.get("description") as string;
      const amount = parseFloat(formData.get("amount") as string);
      
      const response = await fetch(`${process.env.SHOPIFY_APP_URL}/api/billing/usage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shop-Domain': shop,
        },
        body: JSON.stringify({
          description,
          amount,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        return json({ error: error.error || "Failed to create usage charge" }, { status: 400 });
      }
      
      return json({ success: true, message: "Usage charge created successfully" });
    }
    
    if (intent === "mark-notification-read") {
      const notificationId = formData.get("notificationId") as string;
      
      await db.notification.update({
        where: { id: notificationId },
        data: { read: true },
      });
      
      return json({ success: true });
    }

    return json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[Billing Action] Error:", error);
    return json({ error: "Failed to process billing action" }, { status: 500 });
  }
};

// ============= COMPONENT =============
export default function BillingPage() {
  const { 
    currentPlan, 
    activeSubscription, 
    monthlyUsage, 
    usageRecords,
    usagePercentage, 
    daysRemaining,
    notifications,
    shop 
  } = useLoaderData<LoaderData>();
  
  const fetcher = useFetcher();
  const navigate = useNavigate();
  
  const [showUsageHistory, setShowUsageHistory] = useState(false);
  
  const usageTone = getUsageTone(usagePercentage);
  const currentMonth = getCurrentMonthName();

  // Determine current plan details
  const activePlanName = activeSubscription?.name || currentPlan?.planName || "No active plan";
  const planDetails = MANAGED_PLANS[activePlanName as keyof typeof MANAGED_PLANS];
  const hasActivePlan = activeSubscription || currentPlan?.status === "active";
  
  const handleUpgrade = useCallback(() => {
    fetcher.submit(
      { intent: "upgrade" },
      { method: "post" }
    );
  }, [fetcher]);

  // Show success/error messages
  const actionData = fetcher.data as { error?: string; success?: boolean; message?: string } | undefined;

  return (
    <Page
      title="Billing & Usage"
      primaryAction={{
        content: hasActivePlan ? "Change plan" : "Choose a plan",
        onAction: handleUpgrade,
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {/* Success/Error Banners */}
            {actionData?.error && (
              <Banner tone="critical">
                <p>{actionData.error}</p>
              </Banner>
            )}
            {actionData?.success && (
              <Banner tone="success">
                <p>{actionData.message}</p>
              </Banner>
            )}

            {/* Notifications */}
            {notifications.map((notification) => (
              <Banner 
                key={notification.id}
                tone={notification.severity === 'WARNING' ? 'warning' : 'critical'}
                title={notification.title}
                onDismiss={() => {
                  fetcher.submit(
                    { intent: "mark-notification-read", notificationId: notification.id },
                    { method: "post" }
                  );
                }}
              >
                <p>{notification.message}</p>
              </Banner>
            ))}
            
            {/* Usage Alert Banners */}
            {currentPlan?.usageCap && usagePercentage >= 90 && (
              <Banner tone="critical" title="Usage cap approaching">
                <p>
                  You've used {usagePercentage}% of your monthly usage allowance (${monthlyUsage.toFixed(2)} of ${currentPlan.usageCap}). 
                  Additional charges will be capped to prevent overspending.
                </p>
              </Banner>
            )}
            {currentPlan?.usageCap && usagePercentage >= 80 && usagePercentage < 90 && (
              <Banner tone="warning" title="High usage detected">
                <p>
                  You've used {usagePercentage}% of your monthly usage allowance. 
                  Consider monitoring your usage to stay within your cap.
                </p>
              </Banner>
            )}

            {/* Active Subscription Card */}
            {hasActivePlan ? (
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <BlockStack gap="200">
                      <Text as="h2" variant="headingLg">
                        Current Subscription
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Managed through Shopify Billing
                      </Text>
                    </BlockStack>
                    <Button onClick={handleUpgrade}>Change plan</Button>
                  </InlineStack>

                  <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                    <BlockStack gap="400">
                      <InlineStack align="space-between">
                        <BlockStack gap="100">
                          <InlineStack gap="200">
                            <Text as="h3" variant="headingXl">
                              {planDetails?.displayName || activePlanName}
                            </Text>
                            {activeSubscription?.test && (
                              <Badge tone="info">Test Mode</Badge>
                            )}
                          </InlineStack>
                          <Text as="p" variant="headingLg">
                            ${planDetails?.price || currentPlan?.monthlyPrice || 0} 
                            <Text as="span" variant="bodyMd" tone="subdued">
                              USD/{planDetails?.interval || 'month'}
                            </Text>
                          </Text>
                        </BlockStack>
                        <BlockStack gap="100" align="end">
                          <Text as="p" variant="bodyMd" tone="subdued">
                            Status
                          </Text>
                          <Badge tone={currentPlan?.status === "active" ? "success" : "critical"}>
                            {currentPlan?.status || "No plan"}
                          </Badge>
                        </BlockStack>
                      </InlineStack>

                      {/* Usage Progress */}
                      {currentPlan?.usageCap && (
                        <Box>
                          <BlockStack gap="200">
                            <InlineStack align="space-between">
                              <Text as="p" variant="bodyMd">
                                <Icon source={ChartVerticalIcon} tone="base" />
                                {" "}Usage: ${monthlyUsage.toFixed(2)}
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {usagePercentage}% of ${currentPlan.usageCap} cap
                              </Text>
                            </InlineStack>
                            <ProgressBar 
                              progress={usagePercentage} 
                              tone={usageTone}
                              size="small"
                            />
                            {currentPlan.cap90AlertSent && (
                              <InlineStack gap="100">
                                <Icon source={AlertTriangleIcon} tone="warning" />
                                <Text as="p" variant="bodySm" tone="warning">
                                  90% cap alert sent
                                </Text>
                              </InlineStack>
                            )}
                          </BlockStack>
                        </Box>
                      )}

                      {/* Period Information */}
                      <InlineStack gap="400">
                        <Box>
                          <BlockStack gap="050">
                            <Text as="p" variant="bodySm" tone="subdued">
                              <Icon source={CalendarIcon} tone="subdued" />
                              {" "}Billing period
                            </Text>
                            <Text as="p" variant="bodyMd">
                              {currentPlan?.currentPeriodEnd 
                                ? `Ends ${new Date(currentPlan.currentPeriodEnd).toLocaleDateString()}`
                                : "Not set"
                              }
                            </Text>
                          </BlockStack>
                        </Box>
                        <Box>
                          <BlockStack gap="050">
                            <Text as="p" variant="bodySm" tone="subdued">
                              Days remaining
                            </Text>
                            <Text as="p" variant="bodyMd" fontWeight="semibold">
                              {daysRemaining} days
                            </Text>
                          </BlockStack>
                        </Box>
                      </InlineStack>

                    </BlockStack>
                  </Box>

                  <Box paddingBlockStart="200">
                    <Text as="p" variant="bodyMd">
                      <Icon source={CreditCardIcon} tone="base" />
                      {" "}Total usage charges this month: ${monthlyUsage.toFixed(2)} USD
                    </Text>
                  </Box>
                </BlockStack>
              </Card>
            ) : (
              <CalloutCard
                title="No Active Subscription"
                illustration="https://cdn.shopify.com/s/files/1/0583/9399/8427/files/empty-state.svg"
                primaryAction={{
                  content: "Choose a plan",
                  onAction: handleUpgrade,
                }}
              >
                <p>Select a billing plan to start using RewardsPro and unlock all features.</p>
              </CalloutCard>
            )}

            {/* Usage History */}
            {usageRecords.length > 0 && (
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text as="h2" variant="headingMd">
                      Recent Usage Charges
                    </Text>
                    <Button 
                      variant="plain" 
                      onClick={() => setShowUsageHistory(!showUsageHistory)}
                    >
                      {showUsageHistory ? "Hide" : "Show"} details
                    </Button>
                  </InlineStack>
                  
                  {showUsageHistory && (
                    <DataTable
                      columnContentTypes={[
                        'text',
                        'text',
                        'numeric',
                        'text',
                      ]}
                      headings={[
                        'Date',
                        'Description',
                        'Amount',
                        'Currency',
                      ]}
                      rows={usageRecords.map(record => [
                        new Date(record.processedAt).toLocaleDateString(),
                        record.description,
                        `$${record.amount.toFixed(2)}`,
                        record.currencyCode,
                      ])}
                    />
                  )}
                  
                  {!showUsageHistory && (
                    <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                      <Text as="p" variant="bodyMd">
                        {usageRecords.length} usage charges this month • Total: ${monthlyUsage.toFixed(2)} USD
                      </Text>
                    </Box>
                  )}
                </BlockStack>
              </Card>
            )}

            {/* Plan Features */}
            {planDetails && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    {planDetails.displayName} Features
                  </Text>
                  <BlockStack gap="200">
                    {planDetails.features.map((feature, index) => (
                      <InlineStack key={index} gap="200">
                        <Icon source={CheckIcon} tone="success" />
                        <Text as="p" variant="bodyMd">{feature}</Text>
                      </InlineStack>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Card>
            )}
            
            {/* Plan Comparison */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Available Plans
                </Text>
                <BlockStack gap="300">
                  {Object.values(MANAGED_PLANS).map(plan => (
                    <Box 
                      key={plan.name}
                      padding="300" 
                      background={plan.name === activePlanName ? "bg-surface-success" : "bg-surface-secondary"}
                      borderRadius="200"
                    >
                      <InlineStack align="space-between">
                        <BlockStack gap="100">
                          <InlineStack gap="200">
                            <Text as="p" variant="headingMd">
                              {plan.displayName}
                            </Text>
                            {plan.recommended && (
                              <Badge tone="info">Recommended</Badge>
                            )}
                            {plan.name === activePlanName && (
                              <Badge tone="success">Current Plan</Badge>
                            )}
                          </InlineStack>
                          <Text as="p" variant="bodyMd" tone="subdued">
                            ${plan.price}/{plan.interval} • {plan.ordersIncluded.toLocaleString()} orders
                          </Text>
                        </BlockStack>
                        {plan.name !== activePlanName && (
                          <Button onClick={handleUpgrade}>
                            Select
                          </Button>
                        )}
                      </InlineStack>
                    </Box>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            {/* Need Help Card */}
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Need help?
                </Text>
                <Text as="p" variant="bodyMd">
                  Our support team is here to help you choose the right plan for your business.
                </Text>
                <Button url="mailto:support@rewardspro.com" variant="plain">
                  Contact support
                </Button>
              </BlockStack>
            </Card>

            {/* Billing FAQ */}
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Billing FAQ
                </Text>
                <BlockStack gap="300">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      How does managed pricing work?
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Shopify handles all billing directly through your Shopify invoice.
                    </Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      What are usage charges?
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Usage charges are for order processing beyond your plan's included amount.
                    </Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      Are there usage caps?
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Yes, usage is capped to prevent unexpected charges. You'll be notified at 80% and 90%.
                    </Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      Can I switch between monthly and annual?
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Yes, you can switch anytime. Annual plans save ~17% compared to monthly.
                    </Text>
                  </BlockStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}