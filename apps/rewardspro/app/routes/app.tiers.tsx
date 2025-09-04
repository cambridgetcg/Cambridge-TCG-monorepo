import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  Modal,
  Banner,
  BlockStack,
  Text,
  InlineStack,
  Box,
  EmptyState,
  Tabs,
  Badge,
  Icon,
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { TierForm, type TierFormData } from "../components/tiers/TierForm";
import { TierCard, type TierData } from "../components/tiers/TierCard";
import { TierList } from "../components/tiers/TierList";
import {
  PriceListIcon,
  StarFilledIcon,
  PersonSegmentIcon,
  CashDollarFilledIcon,
  ChartVerticalFilledIcon,
} from "../utils/polaris-icons";

// ============= TYPES =============
interface LoaderData {
  tiers: TierData[];
  shop: string;
  stats: {
    totalTiers: number;
    totalCustomers: number;
    averageCashback: number;
    totalRewardsDistributed: number;
  };
  errors?: string[];
}

interface ActionData {
  success?: boolean;
  error?: string;
  tier?: TierData;
  deletedId?: string;
}

// ============= LOADER =============
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    
    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;

    // Fetch tiers with customer counts and rewards
    const [tiers, customers, ledgerEntries] = await Promise.all([
      db.tier.findMany({
        where: { shop },
        orderBy: { minSpend: "asc" },
      }),
      // Use findMany instead of groupBy (Data API doesn't support groupBy)
      db.customer.findMany({
        where: { shop },
        select: { currentTierId: true },
      }).catch(() => []),
      // Use findMany instead of aggregate (Data API doesn't support aggregate)
      db.storeCreditLedger.findMany({
        where: {
          shop,
          type: "CASHBACK_EARNED",
        },
        select: { amount: true },
      }).catch(() => []),
    ]);

    // Calculate customer counts per tier
    const customerCountMap = customers.reduce((acc: Record<string, number>, customer: any) => {
      if (customer.currentTierId) {
        acc[customer.currentTierId] = (acc[customer.currentTierId] || 0) + 1;
      }
      return acc;
    }, {});
    
    // Calculate total rewards
    const totalRewardsSum = ledgerEntries.reduce((sum: number, entry: any) => {
      return sum + (parseFloat(entry.amount?.toString() || "0") || 0);
    }, 0);

    // Enhance tiers with additional data
    const enhancedTiers: TierData[] = tiers.map(tier => ({
      id: tier.id,
      name: tier.name,
      minSpend: tier.minSpend,
      cashbackPercent: tier.cashbackPercent,
      evaluationPeriod: tier.evaluationPeriod as "ANNUAL" | "LIFETIME",
      customerCount: customerCountMap[tier.id] || 0,
      createdAt: tier.createdAt instanceof Date 
        ? tier.createdAt.toISOString() 
        : tier.createdAt,
    }));

    // Calculate stats
    const stats = {
      totalTiers: tiers.length,
      totalCustomers: Object.values(customerCountMap).reduce((sum: number, count: any) => sum + count, 0),
      averageCashback: tiers.length > 0 
        ? tiers.reduce((sum, tier) => sum + tier.cashbackPercent, 0) / tiers.length 
        : 0,
      totalRewardsDistributed: totalRewardsSum,
    };

    return json<LoaderData>({ 
      tiers: enhancedTiers, 
      shop,
      stats,
    });
  } catch (error) {
    console.error("[Tiers] Loader error:", error);
    
    // Return empty data with error
    return json<LoaderData>({
      tiers: [],
      shop: "unknown",
      stats: {
        totalTiers: 0,
        totalCustomers: 0,
        averageCashback: 0,
        totalRewardsDistributed: 0,
      },
      errors: ["Failed to load tiers. Please refresh the page."],
    });
  }
};

// ============= ACTION =============
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    
    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;
    const formData = await request.formData();
    const intent = formData.get("intent") as string;

    switch (intent) {
      case "create": {
        const data: TierFormData = {
          name: formData.get("name") as string,
          minSpend: Number(formData.get("minSpend")),
          cashbackPercent: Number(formData.get("cashbackPercent")),
          evaluationPeriod: formData.get("evaluationPeriod") as "ANNUAL" | "LIFETIME",
          description: formData.get("description") as string,
        };

        // Validate
        if (!data.name || data.minSpend < 0 || data.cashbackPercent < 0 || data.cashbackPercent > 100) {
          return json<ActionData>({ 
            error: "Invalid tier data. Please check your inputs." 
          }, { status: 400 });
        }

        // Check for duplicate
        const existing = await db.tier.findFirst({
          where: { 
            shop,
            OR: [
              { name: data.name },
              { minSpend: data.minSpend }
            ]
          },
        });

        if (existing) {
          return json<ActionData>({ 
            error: existing.name === data.name 
              ? `A tier named "${data.name}" already exists` 
              : `A tier with minimum spend $${data.minSpend} already exists`
          }, { status: 400 });
        }

        // Generate tier ID
        const storeName = shop.split('.')[0];
        const tierId = `${storeName}-${data.name.toLowerCase().replace(/\s+/g, '-')}`;

        const newTier = await db.tier.create({
          data: {
            id: tierId,
            shop,
            name: data.name,
            minSpend: data.minSpend,
            cashbackPercent: data.cashbackPercent,
            evaluationPeriod: data.evaluationPeriod,
          },
        });

        return json<ActionData>({ 
          success: true, 
          tier: {
            ...newTier,
            customerCount: 0,
            createdAt: newTier.createdAt.toISOString(),
          }
        });
      }

      case "update": {
        const id = formData.get("id") as string;
        const data: TierFormData = {
          name: formData.get("name") as string,
          minSpend: Number(formData.get("minSpend")),
          cashbackPercent: Number(formData.get("cashbackPercent")),
          evaluationPeriod: formData.get("evaluationPeriod") as "ANNUAL" | "LIFETIME",
          description: formData.get("description") as string,
        };

        // Validate
        if (!id || !data.name || data.minSpend < 0 || data.cashbackPercent < 0 || data.cashbackPercent > 100) {
          return json<ActionData>({ 
            error: "Invalid tier data. Please check your inputs." 
          }, { status: 400 });
        }

        // Verify ownership
        const existingTier = await db.tier.findFirst({
          where: { id, shop },
        });

        if (!existingTier) {
          return json<ActionData>({ 
            error: "Tier not found" 
          }, { status: 404 });
        }

        // Check for duplicates (excluding current tier)
        const duplicate = await db.tier.findFirst({
          where: {
            shop,
            NOT: { id },
            OR: [
              { name: data.name },
              { minSpend: data.minSpend }
            ]
          },
        });

        if (duplicate) {
          return json<ActionData>({ 
            error: duplicate.name === data.name 
              ? `A tier named "${data.name}" already exists` 
              : `A tier with minimum spend $${data.minSpend} already exists`
          }, { status: 400 });
        }

        const updatedTier = await db.tier.update({
          where: { id },
          data: {
            name: data.name,
            minSpend: data.minSpend,
            cashbackPercent: data.cashbackPercent,
            evaluationPeriod: data.evaluationPeriod,
          },
        });

        return json<ActionData>({ 
          success: true, 
          tier: {
            ...updatedTier,
            createdAt: updatedTier.createdAt.toISOString(),
          }
        });
      }

      case "delete": {
        const id = formData.get("id") as string;

        if (!id) {
          return json<ActionData>({ 
            error: "Tier ID is required" 
          }, { status: 400 });
        }

        // Verify ownership
        const tier = await db.tier.findFirst({
          where: { id, shop },
        });

        if (!tier) {
          return json<ActionData>({ 
            error: "Tier not found" 
          }, { status: 404 });
        }

        // Check if tier has customers
        const customerCount = await db.customer.count({
          where: { currentTierId: id },
        });

        if (customerCount > 0) {
          return json<ActionData>({ 
            error: `Cannot delete tier with ${customerCount} customers. Please reassign customers first.` 
          }, { status: 400 });
        }

        await db.tier.delete({
          where: { id },
        });

        return json<ActionData>({ 
          success: true, 
          deletedId: id 
        });
      }

      case "bulkDelete": {
        const ids = formData.getAll("ids") as string[];
        
        if (!ids || ids.length === 0) {
          return json<ActionData>({ 
            error: "No tiers selected" 
          }, { status: 400 });
        }

        // Verify all tiers belong to shop and have no customers
        const tiersToDelete = await db.tier.findMany({
          where: {
            id: { in: ids },
            shop,
          },
        });

        if (tiersToDelete.length !== ids.length) {
          return json<ActionData>({ 
            error: "Some tiers not found or unauthorized" 
          }, { status: 404 });
        }

        // Check for customers
        const customerCounts = await db.customer.groupBy({
          by: ["currentTierId"],
          where: {
            currentTierId: { in: ids },
          },
          _count: true,
        });

        if (customerCounts.length > 0) {
          return json<ActionData>({ 
            error: "Cannot delete tiers with customers" 
          }, { status: 400 });
        }

        await db.tier.deleteMany({
          where: {
            id: { in: ids },
          },
        });

        return json<ActionData>({ 
          success: true 
        });
      }

      default:
        return json<ActionData>({ 
          error: "Invalid action" 
        }, { status: 400 });
    }
  } catch (error) {
    console.error("[Tiers] Action error:", error);
    
    if (error instanceof Response) {
      throw error;
    }
    
    return json<ActionData>({ 
      error: error instanceof Error ? error.message : "An unexpected error occurred" 
    }, { status: 500 });
  }
};

// ============= COMPONENT =============
export default function TiersPage() {
  const { tiers, shop, stats, errors } = useLoaderData<LoaderData>();
  const fetcher = useFetcher<ActionData>();
  const navigate = useNavigate();
  
  const [modalActive, setModalActive] = useState(false);
  const [editingTier, setEditingTier] = useState<TierData | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [selectedTab, setSelectedTab] = useState(0);
  
  // Handle modal open/close
  const handleModalOpen = useCallback((tier?: TierData) => {
    setEditingTier(tier || null);
    setModalActive(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setModalActive(false);
    setEditingTier(null);
  }, []);

  // Handle form submission
  const handleFormSubmit = useCallback((data: TierFormData) => {
    const formData = new FormData();
    formData.append("intent", editingTier ? "update" : "create");
    
    if (editingTier) {
      formData.append("id", editingTier.id);
    }
    
    formData.append("name", data.name);
    formData.append("minSpend", data.minSpend.toString());
    formData.append("cashbackPercent", data.cashbackPercent.toString());
    formData.append("evaluationPeriod", data.evaluationPeriod);
    if (data.description) {
      formData.append("description", data.description);
    }

    fetcher.submit(formData, { method: "post" });
    handleModalClose();
  }, [editingTier, fetcher, handleModalClose]);

  // Handle delete
  const handleDelete = useCallback((id: string) => {
    const formData = new FormData();
    formData.append("intent", "delete");
    formData.append("id", id);
    fetcher.submit(formData, { method: "post" });
  }, [fetcher]);

  // Handle bulk delete
  const handleBulkDelete = useCallback((ids: string[]) => {
    const formData = new FormData();
    formData.append("intent", "bulkDelete");
    ids.forEach(id => formData.append("ids", id));
    fetcher.submit(formData, { method: "post" });
  }, [fetcher]);

  // Handle duplicate
  const handleDuplicate = useCallback((tier: TierData) => {
    const duplicatedTier = {
      ...tier,
      name: `${tier.name} (Copy)`,
      id: "", // Clear ID for new tier
    };
    handleModalOpen(duplicatedTier);
  }, [handleModalOpen]);

  // Show success/error messages
  const actionData = fetcher.data;
  const [showBanner, setShowBanner] = useState(false);
  
  useEffect(() => {
    if (actionData) {
      setShowBanner(true);
      const timer = setTimeout(() => setShowBanner(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [actionData]);
  
  // Tabs
  const tabs = [
    {
      id: "overview",
      content: "Overview",
      panelID: "overview-panel",
    },
    {
      id: "tiers",
      content: `Tiers (${tiers.length})`,
      panelID: "tiers-panel",
    },
    {
      id: "insights",
      content: "Insights",
      panelID: "insights-panel",
    },
  ];

  return (
    <Page
      title="Loyalty Tiers"
      subtitle="Manage cashback tiers to reward customers based on their spending"
      primaryAction={{
        content: "Add Tier",
        onAction: () => handleModalOpen(),
        icon: PriceListIcon,
      }}
      secondaryActions={[
        {
          content: viewMode === "cards" ? "Table View" : "Card View",
          onAction: () => setViewMode(viewMode === "cards" ? "table" : "cards"),
        },
      ]}
    >
      <BlockStack gap="500">
        {/* Error/Success Banners */}
        {errors && errors.length > 0 && (
          <Banner tone="critical" onDismiss={() => {}}>
            {errors.map((error, i) => (
              <Text key={i} as="p" variant="bodyMd">
                {error}
              </Text>
            ))}
          </Banner>
        )}
        
        {actionData?.error && showBanner && (
          <Banner tone="critical" onDismiss={() => setShowBanner(false)}>
            <Text as="p" variant="bodyMd">
              {actionData.error}
            </Text>
          </Banner>
        )}
        
        {actionData?.success && showBanner && (
          <Banner tone="success" onDismiss={() => setShowBanner(false)}>
            <Text as="p" variant="bodyMd">
              Tier {actionData.deletedId ? "deleted" : editingTier ? "updated" : "created"} successfully!
            </Text>
          </Banner>
        )}

        <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
          {/* Overview Tab */}
          {selectedTab === 0 && (
            <BlockStack gap="500">
              {/* Stats Cards */}
              <Layout>
                <Layout.Section variant="oneThird">
                  <Card>
                    <Box padding="400">
                      <BlockStack gap="300">
                        <InlineStack align="space-between">
                          <Icon source={PriceListIcon} tone="base" />
                          <Badge tone="info">{stats.totalTiers}</Badge>
                        </InlineStack>
                        <Text as="p" variant="heading2xl" fontWeight="bold">
                          {stats.totalTiers}
                        </Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Active Tiers
                        </Text>
                      </BlockStack>
                    </Box>
                  </Card>
                </Layout.Section>
                
                <Layout.Section variant="oneThird">
                  <Card>
                    <Box padding="400">
                      <BlockStack gap="300">
                        <InlineStack align="space-between">
                          <Icon source={PersonSegmentIcon} tone="base" />
                        </InlineStack>
                        <Text as="p" variant="heading2xl" fontWeight="bold">
                          {stats.totalCustomers}
                        </Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Enrolled Customers
                        </Text>
                      </BlockStack>
                    </Box>
                  </Card>
                </Layout.Section>
                
                <Layout.Section variant="oneThird">
                  <Card>
                    <Box padding="400">
                      <BlockStack gap="300">
                        <InlineStack align="space-between">
                          <Icon source={StarFilledIcon} tone="base" />
                        </InlineStack>
                        <Text as="p" variant="heading2xl" fontWeight="bold">
                          {stats.averageCashback.toFixed(1)}%
                        </Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Average Cashback
                        </Text>
                      </BlockStack>
                    </Box>
                  </Card>
                </Layout.Section>
              </Layout>

              {/* Quick Setup Guide */}
              {tiers.length === 0 && (
                <Card>
                  <EmptyState
                    heading="Start rewarding your customers"
                    action={{
                      content: "Create First Tier",
                      onAction: () => handleModalOpen(),
                    }}
                    secondaryAction={{
                      content: "Learn More",
                      url: "https://help.shopify.com",
                    }}
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>Create loyalty tiers to automatically reward customers with cashback based on their spending.</p>
                  </EmptyState>
                </Card>
              )}

              {/* Tier Cards */}
              {tiers.length > 0 && viewMode === "cards" && (
                <BlockStack gap="400">
                  {tiers.map((tier, index) => (
                    <TierCard
                      key={tier.id}
                      tier={tier}
                      onEdit={handleModalOpen}
                      onDelete={handleDelete}
                      onDuplicate={handleDuplicate}
                      onViewCustomers={(tierId) => navigate(`/app/customers?tier=${tierId}`)}
                      position={index + 1}
                      totalTiers={tiers.length}
                    />
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          )}
          
          {/* Tiers Tab (Table View) */}
          {selectedTab === 1 && (
            <TierList
              tiers={tiers}
              onEdit={handleModalOpen}
              onDelete={handleDelete}
              onBulkDelete={handleBulkDelete}
              loading={fetcher.state === "submitting"}
            />
          )}
          
          {/* Insights Tab */}
          {selectedTab === 2 && (
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Program Insights
                  </Text>
                  
                  <BlockStack gap="300">
                    <InlineStack align="space-between">
                      <Text as="p" variant="bodyMd">
                        Total Rewards Distributed
                      </Text>
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        ${stats.totalRewardsDistributed.toFixed(2)}
                      </Text>
                    </InlineStack>
                    
                    <InlineStack align="space-between">
                      <Text as="p" variant="bodyMd">
                        Average Cashback Rate
                      </Text>
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        {stats.averageCashback.toFixed(1)}%
                      </Text>
                    </InlineStack>
                    
                    <InlineStack align="space-between">
                      <Text as="p" variant="bodyMd">
                        Customers per Tier
                      </Text>
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        {stats.totalTiers > 0 ? Math.round(stats.totalCustomers / stats.totalTiers) : 0}
                      </Text>
                    </InlineStack>
                  </BlockStack>
                  
                  {/* Tier Distribution */}
                  {tiers.length > 0 && (
                    <>
                      <Text as="h3" variant="headingSm">
                        Tier Distribution
                      </Text>
                      <BlockStack gap="200">
                        {tiers.map((tier) => (
                          <Box key={tier.id}>
                            <InlineStack align="space-between" blockAlign="center">
                              <InlineStack gap="200" blockAlign="center">
                                <Text as="p" variant="bodyMd">
                                  {tier.name}
                                </Text>
                                <Badge size="small">
                                  {tier.customerCount || 0} customers
                                </Badge>
                              </InlineStack>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {tier.cashbackPercent}% cashback
                              </Text>
                            </InlineStack>
                          </Box>
                        ))}
                      </BlockStack>
                    </>
                  )}
                </BlockStack>
              </Box>
            </Card>
          )}
        </Tabs>
      </BlockStack>

      {/* Create/Edit Modal */}
      <Modal
        open={modalActive}
        onClose={handleModalClose}
        title={editingTier ? `Edit ${editingTier.name}` : "Create New Tier"}
        primaryAction={{
          content: editingTier ? "Update Tier" : "Create Tier",
          onAction: () => {
            const form = document.getElementById("tier-form") as HTMLFormElement;
            if (form) {
              form.requestSubmit();
            }
          },
          loading: fetcher.state === "submitting",
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: handleModalClose,
          },
        ]}
        large
      >
        <Modal.Section>
          <form
            id="tier-form"
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              
              handleFormSubmit({
                name: formData.get("name") as string,
                minSpend: Number(formData.get("minSpend")),
                cashbackPercent: Number(formData.get("cashbackPercent")),
                evaluationPeriod: formData.get("evaluationPeriod") as "ANNUAL" | "LIFETIME",
                description: formData.get("description") as string,
              });
            }}
          >
            <TierForm
              initialData={editingTier || undefined}
              onSubmit={handleFormSubmit}
              isSubmitting={fetcher.state === "submitting"}
              errors={actionData?.error ? [actionData.error] : []}
              existingTiers={tiers}
            />
          </form>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

// Error Boundary
export function ErrorBoundary() {
  return (
    <Page title="Loyalty Tiers">
      <Card>
        <Box padding="400">
          <Banner tone="critical" title="Something went wrong">
            Unable to load tiers. Please refresh the page or contact support.
          </Banner>
        </Box>
      </Card>
    </Page>
  );
}