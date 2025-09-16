/**
 * Subscription Pricing Management Page
 * Allows admins to view and edit subscription plan prices and discounts
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData, useFetcher } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  Button,
  Box,
  Text,
  BlockStack,
  InlineStack,
  Banner,
  Badge,
  DataTable,
  Modal,
  FormLayout,
  TextField,
  Select,
  DatePicker,
  Checkbox,
  Divider,
  Icon,
  Tooltip,
  Toast,
  Frame,
  EmptyState,
  SkeletonBodyText,
  Tabs,
} from "@shopify/polaris";
import {
  EditIcon,
  ClockIcon,
  CashDollarIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  InfoIcon,
  ChartVerticalIcon,
  RefreshIcon,
  SettingsIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";
import { SubscriptionPricingManager } from "~/services/subscription/pricing-manager.server";
import { formatCurrency } from "~/utils/currency";
import type { BillingInterval } from "@prisma/client";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface SellingPlanData {
  id: string;
  shopifyPlanId: string;
  name: string;
  billingInterval: BillingInterval;
  intervalCount: number;
  basePrice: number | null;
  currentDiscount: number | null;
  lastPriceUpdate: string | null;
  activeSubscriptions: number;
  monthlyRevenue: number;
}

interface PricingHistoryItem {
  id: string;
  planName?: string;
  tierName?: string;
  billingInterval: BillingInterval;
  previousPrice: number;
  newPrice: number;
  previousDiscount: number;
  newDiscount: number;
  changedBy: string;
  changeReason: string | null;
  effectiveDate: string;
  affectedCount: number;
  createdAt: string;
}

interface LoaderData {
  sellingPlans: SellingPlanData[];
  pricingHistory: PricingHistoryItem[];
  pricingConfig: {
    allowPriceEditing: boolean;
    requireApproval: boolean;
    minDiscountPercent: number;
    maxDiscountPercent: number;
    priceChangeNotice: number;
    allowGrandfathering: boolean;
    autoSyncPrices: boolean;
    notifyCustomers: boolean;
  };
  tiers: Array<{
    id: string;
    name: string;
    monthlyPrice: number | null;
  }>;
  shopSettings: {
    storeCurrency: string;
    currencyDisplayType: string;
  } | null;
  stats: {
    totalPlans: number;
    totalActiveSubscriptions: number;
    totalMonthlyRevenue: number;
    lastPriceUpdate: string | null;
  };
}

// ============================================
// LOADER
// ============================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const shop = session.shop;

  try {
    // Check if subscription models exist
    if (!db.sellingPlanGroup || !db.sellingPlan || !db.subscriptionPricingConfig) {
      return json({
        sellingPlans: [],
        pricingHistory: [],
        pricingConfig: {
          allowPriceEditing: false,
          requireApproval: false,
          minDiscountPercent: 0,
          maxDiscountPercent: 50,
          priceChangeNotice: 30,
          allowGrandfathering: true,
          autoSyncPrices: true,
          notifyCustomers: true,
        },
        tiers: [],
        shopSettings: null,
        stats: {
          totalPlans: 0,
          totalActiveSubscriptions: 0,
          totalMonthlyRevenue: 0,
          lastPriceUpdate: null,
        },
      });
    }

    // Fetch all data in parallel
    const [
      sellingPlanGroup,
      pricingHistory,
      pricingConfig,
      tiers,
      shopSettings,
      activeSubscriptions,
    ] = await Promise.all([
      db.sellingPlanGroup.findFirst({
        where: { shop },
        include: { sellingPlans: true },
      }),
      SubscriptionPricingManager.getPricingHistory({ shop, limit: 20 }),
      SubscriptionPricingManager.getPricingConfig(shop),
      db.tier.findMany({
        where: { shop },
        orderBy: { minSpend: "asc" },
      }),
      db.shopSettings.findUnique({
        where: { shop },
      }),
      db.tierSubscription.groupBy({
        by: ["sellingPlanId", "status"],
        where: { shop },
        _count: true,
      }),
    ]);

    // Process selling plans with subscription counts
    const sellingPlans: SellingPlanData[] = [];
    let totalActiveSubscriptions = 0;
    let totalMonthlyRevenue = 0;
    let lastPriceUpdate: Date | null = null;

    if (sellingPlanGroup) {
      for (const plan of sellingPlanGroup.sellingPlans) {
        const activeSubs = activeSubscriptions
          .filter(s => s.sellingPlanId === plan.shopifyPlanId && s.status === "ACTIVE")
          .reduce((sum, s) => sum + s._count, 0);

        const monthlyRevenue = activeSubs * Number(plan.basePrice || 0);
        totalActiveSubscriptions += activeSubs;
        totalMonthlyRevenue += monthlyRevenue;

        if (plan.lastPriceUpdate && (!lastPriceUpdate || plan.lastPriceUpdate > lastPriceUpdate)) {
          lastPriceUpdate = plan.lastPriceUpdate;
        }

        sellingPlans.push({
          id: plan.id,
          shopifyPlanId: plan.shopifyPlanId,
          name: plan.name,
          billingInterval: plan.billingInterval,
          intervalCount: plan.intervalCount,
          basePrice: plan.basePrice ? Number(plan.basePrice) : null,
          currentDiscount: plan.currentDiscount ? Number(plan.currentDiscount) : null,
          lastPriceUpdate: plan.lastPriceUpdate?.toISOString() || null,
          activeSubscriptions: activeSubs,
          monthlyRevenue,
        });
      }
    }

    // Format pricing history
    const formattedHistory: PricingHistoryItem[] = await Promise.all(
      pricingHistory.map(async (item) => {
        // Get plan and tier names from metadata or relations
        let planName = "";
        let tierName = "";
        
        if (item.metadata && typeof item.metadata === "object") {
          const metadata = item.metadata as any;
          planName = metadata.planName || "";
          tierName = metadata.tierName || "";
        }

        return {
          id: item.id,
          planName,
          tierName,
          billingInterval: item.billingInterval,
          previousPrice: item.previousPrice,
          newPrice: item.newPrice,
          previousDiscount: item.previousDiscount,
          newDiscount: item.newDiscount,
          changedBy: item.changedBy,
          changeReason: item.changeReason,
          effectiveDate: item.effectiveDate.toISOString(),
          affectedCount: item.affectedCount || 0,
          createdAt: item.createdAt.toISOString(),
        };
      })
    );

    return json({
      sellingPlans,
      pricingHistory: formattedHistory,
      pricingConfig: {
        allowPriceEditing: pricingConfig.allowPriceEditing,
        requireApproval: pricingConfig.requireApproval,
        minDiscountPercent: Number(pricingConfig.minDiscountPercent),
        maxDiscountPercent: Number(pricingConfig.maxDiscountPercent),
        priceChangeNotice: pricingConfig.priceChangeNotice,
        allowGrandfathering: pricingConfig.allowGrandfathering,
        autoSyncPrices: pricingConfig.autoSyncPrices,
        notifyCustomers: pricingConfig.notifyCustomers,
      },
      tiers: tiers.map(tier => ({
        id: tier.id,
        name: tier.name,
        monthlyPrice: tier.monthlyPrice ? Number(tier.monthlyPrice) : null,
      })),
      shopSettings: shopSettings ? {
        storeCurrency: shopSettings.storeCurrency,
        currencyDisplayType: shopSettings.currencyDisplayType,
      } : null,
      stats: {
        totalPlans: sellingPlans.length,
        totalActiveSubscriptions,
        totalMonthlyRevenue,
        lastPriceUpdate: lastPriceUpdate?.toISOString() || null,
      },
    });
  } catch (error) {
    console.error("[Pricing Loader] Error:", error);
    throw new Response("Failed to load pricing data", { status: 500 });
  }
};

// ============================================
// ACTION
// ============================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const shop = session.shop;
  const changedBy = session.userId?.toString() || "admin";

  try {
    switch (intent) {
      case "updatePrice": {
        const sellingPlanId = formData.get("sellingPlanId") as string;
        const newPrice = Number(formData.get("newPrice"));
        const discountPercentage = Number(formData.get("discountPercentage"));
        const changeReason = formData.get("changeReason") as string;
        const effectiveDate = formData.get("effectiveDate") as string;
        const applyToActive = formData.get("applyToActive") === "true";

        const result = await SubscriptionPricingManager.updateSellingPlanPricing({
          shop,
          admin,
          sellingPlanId,
          newPrice,
          discountPercentage,
          changeReason,
          effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
          applyToActive,
          changedBy,
        });

        return json(result);
      }

      case "bulkUpdate": {
        const tierId = formData.get("tierId") as string;
        const priceData = JSON.parse(formData.get("priceData") as string);
        const changeReason = formData.get("changeReason") as string;

        const pricesByInterval = new Map<BillingInterval, { price: number; discount: number }>();
        for (const [interval, data] of Object.entries(priceData)) {
          pricesByInterval.set(interval as BillingInterval, data as any);
        }

        const result = await SubscriptionPricingManager.updateTierPricing({
          shop,
          admin,
          tierId,
          pricesByInterval,
          changeReason,
          changedBy,
        });

        return json(result);
      }

      case "updateConfig": {
        const updates = {
          allowPriceEditing: formData.get("allowPriceEditing") === "true",
          requireApproval: formData.get("requireApproval") === "true",
          minDiscountPercent: Number(formData.get("minDiscountPercent")),
          maxDiscountPercent: Number(formData.get("maxDiscountPercent")),
          priceChangeNotice: Number(formData.get("priceChangeNotice")),
          allowGrandfathering: formData.get("allowGrandfathering") === "true",
          autoSyncPrices: formData.get("autoSyncPrices") === "true",
          notifyCustomers: formData.get("notifyCustomers") === "true",
        };

        await SubscriptionPricingManager.updatePricingConfig(shop, updates);

        return json({ success: true, message: "Configuration updated successfully" });
      }

      case "previewChange": {
        const sellingPlanId = formData.get("sellingPlanId") as string;
        const newPrice = Number(formData.get("newPrice"));
        const discountPercentage = Number(formData.get("discountPercentage"));

        const preview = await SubscriptionPricingManager.previewPriceChange({
          shop,
          sellingPlanId,
          newPrice,
          discountPercentage,
        });

        return json({ success: true, preview });
      }

      default:
        return json({ success: false, error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("[Pricing Action] Error:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Operation failed",
    });
  }
};

// ============================================
// MAIN COMPONENT
// ============================================

export default function SubscriptionPricing() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const fetcher = useFetcher();

  // State
  const [selectedTab, setSelectedTab] = useState(0);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SellingPlanData | null>(null);
  const [toast, setToast] = useState<{ active: boolean; content: string; error?: boolean }>({
    active: false,
    content: "",
  });

  // Edit form state
  const [editFormData, setEditFormData] = useState({
    newPrice: "",
    discountPercentage: "",
    changeReason: "",
    effectiveDate: new Date().toISOString().split("T")[0],
    applyToActive: false,
  });

  // Config form state
  const [configFormData, setConfigFormData] = useState(data.pricingConfig);

  // Format currency helper
  const formatAmount = useCallback((amount: number) => {
    return formatCurrency(amount, data.shopSettings as any);
  }, [data.shopSettings]);

  // Format interval
  const formatInterval = (interval: BillingInterval, count: number) => {
    const intervals: Record<BillingInterval, string> = {
      WEEKLY: "Weekly",
      MONTHLY: "Monthly",
      QUARTERLY: "Quarterly",
      SEMIANNUAL: "Semi-Annual",
      ANNUAL: "Annual",
    };
    
    if (count > 1) {
      return `Every ${count} ${intervals[interval].toLowerCase()}`;
    }
    return intervals[interval];
  };

  // Handle edit plan
  const handleEditPlan = useCallback((plan: SellingPlanData) => {
    setSelectedPlan(plan);
    setEditFormData({
      newPrice: plan.basePrice?.toString() || "",
      discountPercentage: plan.currentDiscount?.toString() || "0",
      changeReason: "",
      effectiveDate: new Date().toISOString().split("T")[0],
      applyToActive: false,
    });
    setEditModalOpen(true);
  }, []);

  // Handle save price
  const handleSavePrice = useCallback(() => {
    if (!selectedPlan) return;

    const formData = new FormData();
    formData.append("intent", "updatePrice");
    formData.append("sellingPlanId", selectedPlan.id);
    formData.append("newPrice", editFormData.newPrice);
    formData.append("discountPercentage", editFormData.discountPercentage);
    formData.append("changeReason", editFormData.changeReason);
    formData.append("effectiveDate", editFormData.effectiveDate);
    formData.append("applyToActive", editFormData.applyToActive.toString());

    submit(formData, { method: "post" });
    setEditModalOpen(false);
  }, [selectedPlan, editFormData, submit]);

  // Handle config save
  const handleSaveConfig = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "updateConfig");
    Object.entries(configFormData).forEach(([key, value]) => {
      formData.append(key, value.toString());
    });

    submit(formData, { method: "post" });
    setConfigModalOpen(false);
  }, [configFormData, submit]);

  // Show toast on action result
  useEffect(() => {
    if (actionData) {
      setToast({
        active: true,
        content: actionData.message || (actionData.success ? "Operation successful" : "Operation failed"),
        error: !actionData.success,
      });
    }
  }, [actionData]);

  // Table rows for selling plans
  const sellingPlanRows = data.sellingPlans.map(plan => [
    plan.name,
    formatInterval(plan.billingInterval, plan.intervalCount),
    plan.basePrice ? formatAmount(plan.basePrice) : "—",
    plan.currentDiscount ? `${plan.currentDiscount}%` : "—",
    plan.activeSubscriptions.toString(),
    formatAmount(plan.monthlyRevenue),
    <Button
      size="slim"
      icon={EditIcon}
      onClick={() => handleEditPlan(plan)}
      disabled={!data.pricingConfig.allowPriceEditing}
    >
      Edit
    </Button>,
  ]);

  // Table rows for history
  const historyRows = data.pricingHistory.map(item => [
    <BlockStack gap="050">
      <Text as="span" variant="bodyMd">{item.planName || "—"}</Text>
      <Text as="span" variant="bodySm" tone="subdued">
        {formatInterval(item.billingInterval, 1)}
      </Text>
    </BlockStack>,
    <InlineStack gap="200">
      <Text as="span" variant="bodyMd" tone="subdued">
        {formatAmount(item.previousPrice)}
      </Text>
      <Icon source={ChartVerticalIcon} />
      <Text as="span" variant="bodyMd" fontWeight="semibold">
        {formatAmount(item.newPrice)}
      </Text>
    </InlineStack>,
    <InlineStack gap="200">
      <Text as="span" variant="bodyMd" tone="subdued">
        {item.previousDiscount}%
      </Text>
      <Icon source={ChartVerticalIcon} />
      <Text as="span" variant="bodyMd" fontWeight="semibold">
        {item.newDiscount}%
      </Text>
    </InlineStack>,
    item.changeReason || "—",
    <BlockStack gap="050">
      <Text as="span" variant="bodySm">{item.changedBy}</Text>
      <Text as="span" variant="bodySm" tone="subdued">
        {new Date(item.createdAt).toLocaleDateString()}
      </Text>
    </BlockStack>,
    item.affectedCount > 0 ? (
      <Badge tone="info">{item.affectedCount} affected</Badge>
    ) : (
      <Badge>Scheduled</Badge>
    ),
  ]);

  const tabs = [
    {
      id: "plans",
      content: "Selling Plans",
      badge: data.stats.totalPlans.toString(),
    },
    {
      id: "history",
      content: "Price History",
      badge: data.pricingHistory.length.toString(),
    },
  ];

  const isLoading = navigation.state !== "idle";

  return (
    <Frame>
      <Page
        title="Subscription Pricing"
        subtitle="Manage subscription plan prices and discounts"
        backAction={{ url: "/app/subscriptions" }}
        primaryAction={{
          content: "Bulk Update",
          icon: EditIcon,
          onAction: () => setBulkModalOpen(true),
          disabled: !data.pricingConfig.allowPriceEditing,
        }}
        secondaryActions={[
          {
            content: "Settings",
            icon: SettingsIcon,
            onAction: () => {
              setConfigFormData(data.pricingConfig);
              setConfigModalOpen(true);
            },
          },
        ]}
      >
        <Layout>
          {/* Stats Overview */}
          <Layout.Section>
            <Box padding="400">
              <InlineStack gap="400" align="start" blockAlign="stretch">
                <Card>
                  <Box padding="400">
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingMd">Active Plans</Text>
                      <Text as="p" variant="heading2xl">{data.stats.totalPlans}</Text>
                    </BlockStack>
                  </Box>
                </Card>
                <Card>
                  <Box padding="400">
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingMd">Active Subscriptions</Text>
                      <Text as="p" variant="heading2xl">{data.stats.totalActiveSubscriptions}</Text>
                    </BlockStack>
                  </Box>
                </Card>
                <Card>
                  <Box padding="400">
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingMd">Monthly Revenue</Text>
                      <Text as="p" variant="heading2xl">{formatAmount(data.stats.totalMonthlyRevenue)}</Text>
                    </BlockStack>
                  </Box>
                </Card>
                <Card>
                  <Box padding="400">
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingMd">Last Update</Text>
                      <Text as="p" variant="bodyLg">
                        {data.stats.lastPriceUpdate
                          ? new Date(data.stats.lastPriceUpdate).toLocaleDateString()
                          : "Never"}
                      </Text>
                    </BlockStack>
                  </Box>
                </Card>
              </InlineStack>
            </Box>
          </Layout.Section>

          {/* Configuration Banner */}
          {!data.pricingConfig.allowPriceEditing && (
            <Layout.Section>
              <Banner
                title="Price editing is disabled"
                tone="warning"
                action={{
                  content: "Enable in settings",
                  onAction: () => setConfigModalOpen(true),
                }}
              >
                <p>Price editing has been disabled in the configuration. Enable it to make changes.</p>
              </Banner>
            </Layout.Section>
          )}

          {/* Main Content Tabs */}
          <Layout.Section>
            <Card>
              <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
                <Box padding="400">
                  {selectedTab === 0 ? (
                    // Selling Plans Tab
                    data.sellingPlans.length > 0 ? (
                      <DataTable
                        columnContentTypes={[
                          "text",
                          "text",
                          "numeric",
                          "numeric",
                          "numeric",
                          "numeric",
                          "text",
                        ]}
                        headings={[
                          "Plan Name",
                          "Billing Interval",
                          "Base Price",
                          "Discount",
                          "Active Subs",
                          "Monthly Revenue",
                          "Actions",
                        ]}
                        rows={sellingPlanRows}
                      />
                    ) : (
                      <EmptyState
                        heading="No selling plans found"
                        action={{
                          content: "Create Selling Plans",
                          url: "/app/subscriptions/setup",
                        }}
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                      >
                        <p>Create selling plans to enable subscription pricing management.</p>
                      </EmptyState>
                    )
                  ) : (
                    // History Tab
                    data.pricingHistory.length > 0 ? (
                      <DataTable
                        columnContentTypes={[
                          "text",
                          "text",
                          "text",
                          "text",
                          "text",
                          "text",
                        ]}
                        headings={[
                          "Plan",
                          "Price Change",
                          "Discount Change",
                          "Reason",
                          "Changed By",
                          "Impact",
                        ]}
                        rows={historyRows}
                      />
                    ) : (
                      <EmptyState
                        heading="No price changes yet"
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                      >
                        <p>Price change history will appear here after you make your first update.</p>
                      </EmptyState>
                    )
                  )}
                </Box>
              </Tabs>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Edit Price Modal */}
        <Modal
          open={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          title={`Edit Pricing: ${selectedPlan?.name}`}
          primaryAction={{
            content: "Save Changes",
            onAction: handleSavePrice,
            loading: isLoading,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setEditModalOpen(false),
            },
          ]}
        >
          <Modal.Section>
            <FormLayout>
              <TextField
                label="Base Price"
                type="number"
                value={editFormData.newPrice}
                onChange={(value) => setEditFormData({ ...editFormData, newPrice: value })}
                prefix={data.shopSettings?.storeCurrency || "USD"}
                helpText="The base price before any discounts"
                autoComplete="off"
              />
              
              <TextField
                label="Discount Percentage"
                type="number"
                value={editFormData.discountPercentage}
                onChange={(value) => setEditFormData({ ...editFormData, discountPercentage: value })}
                suffix="%"
                helpText={`Must be between ${data.pricingConfig.minDiscountPercent}% and ${data.pricingConfig.maxDiscountPercent}%`}
                autoComplete="off"
              />
              
              <TextField
                label="Change Reason"
                value={editFormData.changeReason}
                onChange={(value) => setEditFormData({ ...editFormData, changeReason: value })}
                multiline={2}
                helpText="Document why this price change is being made"
                autoComplete="off"
              />
              
              <TextField
                label="Effective Date"
                type="date"
                value={editFormData.effectiveDate}
                onChange={(value) => setEditFormData({ ...editFormData, effectiveDate: value })}
                helpText="When the new price should take effect"
                autoComplete="off"
              />
              
              <Checkbox
                label="Apply to active subscriptions"
                checked={editFormData.applyToActive}
                onChange={(value) => setEditFormData({ ...editFormData, applyToActive: value })}
                helpText={
                  data.pricingConfig.allowGrandfathering
                    ? "Unchecked: Existing subscriptions keep old price (grandfathered)"
                    : "All active subscriptions will be updated"
                }
              />
              
              {selectedPlan && selectedPlan.activeSubscriptions > 0 && (
                <Banner tone="info" icon={InfoIcon}>
                  <p>
                    This change will affect {selectedPlan.activeSubscriptions} active{" "}
                    {selectedPlan.activeSubscriptions === 1 ? "subscription" : "subscriptions"}.
                  </p>
                </Banner>
              )}
            </FormLayout>
          </Modal.Section>
        </Modal>

        {/* Configuration Modal */}
        <Modal
          open={configModalOpen}
          onClose={() => setConfigModalOpen(false)}
          title="Pricing Configuration"
          primaryAction={{
            content: "Save Configuration",
            onAction: handleSaveConfig,
            loading: isLoading,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setConfigModalOpen(false),
            },
          ]}
        >
          <Modal.Section>
            <FormLayout>
              <Checkbox
                label="Allow price editing"
                checked={configFormData.allowPriceEditing}
                onChange={(value) => setConfigFormData({ ...configFormData, allowPriceEditing: value })}
                helpText="Enable or disable the ability to edit prices"
              />
              
              <Checkbox
                label="Require approval for price changes"
                checked={configFormData.requireApproval}
                onChange={(value) => setConfigFormData({ ...configFormData, requireApproval: value })}
                helpText="Price changes must be approved before taking effect"
              />
              
              <TextField
                label="Minimum discount percentage"
                type="number"
                value={configFormData.minDiscountPercent.toString()}
                onChange={(value) => setConfigFormData({ ...configFormData, minDiscountPercent: Number(value) })}
                suffix="%"
                autoComplete="off"
              />
              
              <TextField
                label="Maximum discount percentage"
                type="number"
                value={configFormData.maxDiscountPercent.toString()}
                onChange={(value) => setConfigFormData({ ...configFormData, maxDiscountPercent: Number(value) })}
                suffix="%"
                autoComplete="off"
              />
              
              <TextField
                label="Price increase notice period (days)"
                type="number"
                value={configFormData.priceChangeNotice.toString()}
                onChange={(value) => setConfigFormData({ ...configFormData, priceChangeNotice: Number(value) })}
                helpText="Days of advance notice for price increases"
                autoComplete="off"
              />
              
              <Checkbox
                label="Allow grandfathering"
                checked={configFormData.allowGrandfathering}
                onChange={(value) => setConfigFormData({ ...configFormData, allowGrandfathering: value })}
                helpText="Keep existing subscriptions at their current price when prices increase"
              />
              
              <Checkbox
                label="Auto-sync prices with Shopify"
                checked={configFormData.autoSyncPrices}
                onChange={(value) => setConfigFormData({ ...configFormData, autoSyncPrices: value })}
                helpText="Automatically sync price changes to Shopify"
              />
              
              <Checkbox
                label="Notify customers of price changes"
                checked={configFormData.notifyCustomers}
                onChange={(value) => setConfigFormData({ ...configFormData, notifyCustomers: value })}
                helpText="Send email notifications when prices change"
              />
            </FormLayout>
          </Modal.Section>
        </Modal>

        {/* Toast */}
        {toast.active && (
          <Toast
            content={toast.content}
            error={toast.error}
            onDismiss={() => setToast({ ...toast, active: false })}
          />
        )}
      </Page>
    </Frame>
  );
}