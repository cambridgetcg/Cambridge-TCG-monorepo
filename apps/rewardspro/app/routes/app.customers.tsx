import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useFetcher } from "@remix-run/react";
import { useState, useCallback, useMemo, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  DataTable,
  TextField,
  Select,
  Button,
  Badge,
  Text,
  BlockStack,
  InlineStack,
  Icon,
  Banner,
  Box,
  EmptyState,
  ProgressBar,
  Modal,
  Spinner,
  Divider,
  Grid,
  Tooltip,
  Avatar,
  SkeletonBodyText,
  SkeletonDisplayText,
} from "@shopify/polaris";
import {
  SearchIcon,
  PersonIcon,
  RefreshIcon,
  ChartVerticalIcon,
  StarFilledIcon,
  CashDollarIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  InfoIcon,
  ClockIcon,
  TrophyIcon,
  DiamondIcon,
  CircleTickIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { formatCurrency } from "../utils/currency";
import { 
  calculateCustomerTier, 
  calculateTiersForCustomers,
  calculateAllCustomerTiers 
} from "../services/tier-calculation.server";
import { CustomerDetailModal } from "../components/CustomerDetailModal";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface Customer {
  id: string;
  shopifyCustomerId: string;
  email: string;
  storeCredit: number;
  currentTier: {
    id: string;
    name: string;
    cashbackPercent: number;
    minSpend: number;
  } | null;
  createdAt: string;
  updatedAt: string;
}

interface LoaderData {
  customers: Customer[];
  tiers: Array<{
    id: string;
    name: string;
    minSpend: number;
    cashbackPercent: number;
  }>;
  shopSettings: {
    storeCurrency: string;
    currencyDisplayType: string;
  } | null;
  totalCustomers: number;
  tierDistribution: {
    tierName: string;
    count: number;
    percentage: number;
  }[];
}

// ============================================
// LOADER
// ============================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    
    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;
    const url = new URL(request.url);
    const searchQuery = url.searchParams.get("search") || "";
    const tierFilter = url.searchParams.get("tier") || "all";

    // Build where clause for filtering
    const whereClause: any = { shop };
    
    if (searchQuery) {
      whereClause.OR = [
        { email: { contains: searchQuery, mode: 'insensitive' } },
        { shopifyCustomerId: { contains: searchQuery, mode: 'insensitive' } },
      ];
    }
    
    if (tierFilter !== "all") {
      if (tierFilter === "none") {
        whereClause.currentTierId = null;
      } else {
        whereClause.currentTierId = tierFilter;
      }
    }

    // Fetch data in parallel
    const [customers, tiers, shopSettings, totalCount] = await Promise.all([
      db.customer.findMany({
        where: whereClause,
        include: {
          currentTier: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100, // Limit for performance
      }),
      db.tier.findMany({
        where: { shop },
        orderBy: { minSpend: 'asc' },
      }),
      db.shopSettings.findUnique({
        where: { shop },
      }),
      db.customer.count({
        where: { shop },
      }),
    ]);

    // Calculate tier distribution
    const tierDistribution = await Promise.all(
      tiers.map(async (tier) => {
        const count = await db.customer.count({
          where: { shop, currentTierId: tier.id },
        });
        return {
          tierName: tier.name,
          count,
          percentage: totalCount > 0 ? Math.round((count / totalCount) * 100) : 0,
        };
      })
    );

    // Add customers without tiers
    const noTierCount = await db.customer.count({
      where: { shop, currentTierId: null },
    });
    
    if (noTierCount > 0) {
      tierDistribution.unshift({
        tierName: "No Tier",
        count: noTierCount,
        percentage: totalCount > 0 ? Math.round((noTierCount / totalCount) * 100) : 0,
      });
    }

    // Format customers for display
    const formattedCustomers = customers.map(customer => ({
      id: customer.id,
      shopifyCustomerId: customer.shopifyCustomerId,
      email: customer.email,
      storeCredit: parseFloat(customer.storeCredit.toString()),
      currentTier: customer.currentTier ? {
        id: customer.currentTier.id,
        name: customer.currentTier.name,
        cashbackPercent: customer.currentTier.cashbackPercent,
        minSpend: customer.currentTier.minSpend,
      } : null,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    }));

    return json({
      customers: formattedCustomers,
      tiers,
      shopSettings: shopSettings ? {
        storeCurrency: shopSettings.storeCurrency,
        currencyDisplayType: shopSettings.currencyDisplayType,
      } : null,
      totalCustomers: totalCount,
      tierDistribution,
    });
  } catch (error) {
    console.error("[Customers] Loader error:", error);
    throw new Response("Failed to load customers", { status: 500 });
  }
};

// ============================================
// ACTION - Handle tier calculations
// ============================================

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { session, admin } = await authenticate.admin(request);
    
    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const formData = await request.formData();
    const action = formData.get("action");
    const shop = session.shop;

    if (action === "calculate-all") {
      // Calculate tiers for all customers
      console.log("[Customers] Starting tier calculation for all customers");
      const results = await calculateAllCustomerTiers(shop, admin as any);
      
      return json({
        success: true,
        message: `Calculated tiers for ${results.total} customers. ${results.changed} tiers updated.`,
        results: {
          total: results.total,
          changed: results.changed,
          errors: results.errors,
        }
      });
    }
    
    if (action === "calculate-selected") {
      // Calculate tiers for selected customers
      const customerIds = formData.getAll("customerIds[]") as string[];
      
      if (customerIds.length === 0) {
        return json({ 
          success: false, 
          message: "No customers selected" 
        });
      }
      
      console.log(`[Customers] Calculating tiers for ${customerIds.length} selected customers`);
      const results = await calculateTiersForCustomers(shop, customerIds, admin as any);
      
      const changed = results.filter(r => r.changed).length;
      const errors = results.filter(r => r.error).length;
      
      return json({
        success: true,
        message: `Calculated tiers for ${results.length} customers. ${changed} tiers updated.`,
        results: {
          total: results.length,
          changed,
          errors,
        }
      });
    }
    
    if (action === "calculate-single") {
      // Calculate tier for a single customer
      const customerId = formData.get("customerId") as string;
      
      console.log(`[Customers] Calculating tier for customer ${customerId}`);
      const result = await calculateCustomerTier(shop, customerId, admin as any);
      
      return json({
        success: true,
        message: result.changed 
          ? `Tier updated from ${result.previousTierName || 'None'} to ${result.newTierName || 'None'}`
          : "Tier unchanged",
        result
      });
    }

    return json({ success: false, message: "Invalid action" });
  } catch (error) {
    console.error("[Customers] Action error:", error);
    return json({ 
      success: false, 
      message: error instanceof Error ? error.message : "Failed to calculate tiers" 
    });
  }
};

// ============================================
// HELPER COMPONENTS
// ============================================

function TierIcon({ tierName }: { tierName: string }) {
  const name = tierName.toLowerCase();
  if (name.includes('platinum') || name.includes('vip')) {
    return <Icon source={DiamondIcon} tone="emphasis" />;
  }
  if (name.includes('gold')) {
    return <Icon source={StarFilledIcon} tone="warning" />;
  }
  if (name.includes('silver')) {
    return <Icon source={StarFilledIcon} tone="subdued" />;
  }
  if (name.includes('bronze')) {
    return <Icon source={CircleTickIcon} tone="base" />;
  }
  return <Icon source={PersonIcon} tone="base" />;
}

function CustomerAvatar({ email }: { email: string }) {
  const initials = email.substring(0, 2).toUpperCase();
  return (
    <div style={{ marginRight: '12px', display: 'inline-block' }}>
      <Avatar customer size="md" initials={initials} />
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function Customers() {
  const data = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const fetcher = useFetcher();
  
  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [bannerMessage, setBannerMessage] = useState("");
  const [bannerTone, setBannerTone] = useState<"success" | "warning" | "critical">("success");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [calculatingCustomerId, setCalculatingCustomerId] = useState<string | null>(null);

  // Format currency helper
  const formatAmount = useCallback((amount: number) => {
    return formatCurrency(amount, data.shopSettings as any);
  }, [data.shopSettings]);

  // Handle search
  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  // Handle tier filter
  const handleTierFilter = useCallback((value: string) => {
    setTierFilter(value);
  }, []);

  // Calculate all tiers
  const handleCalculateAll = useCallback(() => {
    if (confirm(`This will recalculate tiers for all ${data.totalCustomers} customers. This may take a few minutes. Continue?`)) {
      setIsCalculating(true);
      const formData = new FormData();
      formData.append("action", "calculate-all");
      submit(formData, { method: "post" });
    }
  }, [data.totalCustomers, submit]);

  // Calculate selected tiers
  const handleCalculateSelected = useCallback(() => {
    if (selectedCustomers.length === 0) {
      setBannerMessage("Please select customers first");
      setBannerTone("warning");
      setShowBanner(true);
      return;
    }
    
    setIsCalculating(true);
    const formData = new FormData();
    formData.append("action", "calculate-selected");
    selectedCustomers.forEach(id => formData.append("customerIds[]", id));
    submit(formData, { method: "post" });
  }, [selectedCustomers, submit]);

  // Calculate single customer tier
  const handleCalculateSingle = useCallback((customerId: string) => {
    setCalculatingCustomerId(customerId);
    const formData = new FormData();
    formData.append("action", "calculate-single");
    formData.append("customerId", customerId);
    fetcher.submit(formData, { method: "post" });
  }, [fetcher]);

  // Open customer detail modal
  const handleViewCustomer = useCallback((customerId: string) => {
    setSelectedCustomerId(customerId);
    setModalOpen(true);
  }, []);

  // Filter customers based on search and tier
  const filteredCustomers = useMemo(() => {
    return data.customers.filter(customer => {
      const matchesSearch = !searchQuery || 
        customer.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.shopifyCustomerId.includes(searchQuery);
      
      const matchesTier = tierFilter === "all" ||
        (tierFilter === "none" && !customer.currentTier) ||
        (customer.currentTier?.id === tierFilter);
      
      return matchesSearch && matchesTier;
    });
  }, [data.customers, searchQuery, tierFilter]);

  // Tier filter options
  const tierOptions = [
    { label: "All tiers", value: "all" },
    { label: "No tier", value: "none" },
    ...data.tiers.map(tier => ({
      label: `${tier.name} (${tier.cashbackPercent}%)`,
      value: tier.id,
    })),
  ];

  // Effect to handle fetcher response
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && calculatingCustomerId) {
      setCalculatingCustomerId(null);
      if (fetcher.data.success) {
        setBannerMessage(fetcher.data.message);
        setBannerTone("success");
        setShowBanner(true);
      }
    }
  }, [fetcher.state, fetcher.data, calculatingCustomerId]);

  // Effect to handle action results
  useEffect(() => {
    if (navigation.state === "idle" && isCalculating) {
      setIsCalculating(false);
    }
  }, [navigation.state, isCalculating]);

  // Table rows with enhanced UI
  const rows = filteredCustomers.map(customer => [
    <InlineStack gap="200" align="center">
      <CustomerAvatar email={customer.email} />
      <BlockStack gap="050">
        <Text variant="bodyMd" fontWeight="medium" as="span">
          {customer.email}
        </Text>
        <Text variant="bodySm" tone="subdued" as="span">
          ID: {customer.shopifyCustomerId}
        </Text>
      </BlockStack>
    </InlineStack>,
    customer.currentTier ? (
      <InlineStack gap="100" align="center">
        <TierIcon tierName={customer.currentTier.name} />
        <Badge tone="success">
          {`${customer.currentTier.name}`}
        </Badge>
        <Text variant="bodySm" tone="subdued" as="span">
          {customer.currentTier.cashbackPercent}%
        </Text>
      </InlineStack>
    ) : (
      <Badge tone="warning">No tier</Badge>
    ),
    <BlockStack gap="050">
      <Text variant="bodyMd" fontWeight="semibold" as="span">
        {formatAmount(customer.storeCredit)}
      </Text>
      <Text variant="bodySm" tone="subdued" as="span">
        Available
      </Text>
    </BlockStack>,
    customer.currentTier ? (
      <BlockStack gap="050">
        <Text variant="bodySm" as="span">
          Min: {formatAmount(customer.currentTier.minSpend)}
        </Text>
        <ProgressBar 
          progress={(customer.storeCredit / customer.currentTier.minSpend) * 100} 
          size="small" 
          tone="emphasis"
        />
      </BlockStack>
    ) : (
      <Text variant="bodySm" tone="subdued" as="span">-</Text>
    ),
    <InlineStack gap="200">
      <Button size="slim" onClick={() => handleViewCustomer(customer.id)}>
        View
      </Button>
      <Button 
        size="slim" 
        variant="plain" 
        onClick={() => handleCalculateSingle(customer.id)}
        loading={calculatingCustomerId === customer.id}
      >
        <Icon source={RefreshIcon} />
      </Button>
    </InlineStack>
  ]);

  const isLoading = navigation.state === "submitting" || isCalculating;

  return (
    <Page
      title="Customers"
      primaryAction={{
        content: "Calculate all tiers",
        icon: RefreshIcon,
        onAction: handleCalculateAll,
        loading: isLoading,
      }}
      secondaryActions={[
        {
          content: "Calculate selected",
          onAction: handleCalculateSelected,
          disabled: selectedCustomers.length === 0,
          loading: isLoading,
        },
      ]}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="600">
            {/* Success Banner */}
            {showBanner && (
              <Banner
                title={bannerMessage}
                tone={bannerTone}
                onDismiss={() => setShowBanner(false)}
              />
            )}

            {/* Stats Overview with Visual Hierarchy */}
            <Grid columns={{ xs: 1, sm: 2, md: 4, lg: 4, xl: 4 }}>
              <Grid.Cell>
                <Card>
                  <Box padding="400">
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <Text variant="bodySm" tone="subdued" as="p">
                          Total Customers
                        </Text>
                        <Icon source={PersonIcon} tone="base" />
                      </InlineStack>
                      <Text variant="headingXl" as="h3">
                        {data.totalCustomers}
                      </Text>
                      <Badge tone="info">
                        <InlineStack gap="050" align="center">
                          <Icon source={ArrowUpIcon} />
                          All time
                        </InlineStack>
                      </Badge>
                    </BlockStack>
                  </Box>
                </Card>
              </Grid.Cell>

              <Grid.Cell>
                <Card>
                  <Box padding="400">
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <Text variant="bodySm" tone="subdued" as="p">
                          With Tiers
                        </Text>
                        <Icon source={StarFilledIcon} tone="success" />
                      </InlineStack>
                      <Text variant="headingXl" as="h3">
                        {data.customers.filter(c => c.currentTier).length}
                      </Text>
                      <ProgressBar 
                        progress={(data.customers.filter(c => c.currentTier).length / data.totalCustomers) * 100} 
                        size="small"
                        tone="success"
                      />
                    </BlockStack>
                  </Box>
                </Card>
              </Grid.Cell>

              <Grid.Cell>
                <Card>
                  <Box padding="400">
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <Text variant="bodySm" tone="subdued" as="p">
                          Without Tiers
                        </Text>
                        <Icon source={AlertTriangleIcon} tone="warning" />
                      </InlineStack>
                      <Text variant="headingXl" as="h3">
                        {data.customers.filter(c => !c.currentTier).length}
                      </Text>
                      <Badge tone="warning">Needs attention</Badge>
                    </BlockStack>
                  </Box>
                </Card>
              </Grid.Cell>

              <Grid.Cell>
                <Card>
                  <Box padding="400">
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <Text variant="bodySm" tone="subdued" as="p">
                          Total Store Credit
                        </Text>
                        <Icon source={CashDollarIcon} tone="emphasis" />
                      </InlineStack>
                      <Text variant="headingXl" as="h3">
                        {formatAmount(data.customers.reduce((sum, c) => sum + c.storeCredit, 0))}
                      </Text>
                      <Text variant="bodySm" tone="subdued" as="span">
                        Available balance
                      </Text>
                    </BlockStack>
                  </Box>
                </Card>
              </Grid.Cell>
            </Grid>

            {/* Tier Distribution */}
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text variant="headingMd" as="h2">
                      Tier Distribution
                    </Text>
                    <Icon source={ChartVerticalIcon} tone="base" />
                  </InlineStack>
                  
                  <BlockStack gap="300">
                    {data.tierDistribution.map((tier, index) => (
                      <BlockStack key={index} gap="100">
                        <InlineStack align="space-between">
                          <InlineStack gap="200" align="center">
                            <TierIcon tierName={tier.tierName} />
                            <Text variant="bodyMd" fontWeight="medium" as="span">
                              {tier.tierName}
                            </Text>
                            <Badge tone={tier.tierName === "No Tier" ? "warning" : "info"}>
                              {tier.count} customers
                            </Badge>
                          </InlineStack>
                          <Text variant="bodyMd" tone="subdued" as="span">
                            {tier.percentage}%
                          </Text>
                        </InlineStack>
                        <ProgressBar 
                          progress={tier.percentage} 
                          size="small"
                          tone={tier.tierName === "No Tier" ? "warning" : "emphasis"}
                        />
                      </BlockStack>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Box>
            </Card>

            {/* Filters with Better Visual Design */}
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">
                    Search & Filter
                  </Text>
                  <InlineStack gap="300">
                    <div style={{ flex: 1 }}>
                      <TextField
                        label="Search customers"
                        labelHidden
                        placeholder="Search by email or customer ID..."
                        value={searchQuery}
                        onChange={handleSearch}
                        prefix={<Icon source={SearchIcon} />}
                        clearButton
                        onClearButtonClick={() => setSearchQuery("")}
                        autoComplete="off"
                      />
                    </div>
                    <Select
                      label="Filter by tier"
                      labelHidden
                      options={tierOptions}
                      value={tierFilter}
                      onChange={handleTierFilter}
                    />
                  </InlineStack>
                </BlockStack>
              </Box>
            </Card>

            {/* Enhanced Customer Table */}
            <Card>
              {isLoading ? (
                <Box padding="400">
                  <BlockStack gap="300">
                    <SkeletonDisplayText size="small" />
                    <SkeletonBodyText lines={5} />
                  </BlockStack>
                </Box>
              ) : filteredCustomers.length > 0 ? (
                <DataTable
                  columnContentTypes={["text", "text", "numeric", "text", "text"]}
                  headings={[
                    "Customer",
                    "Current Tier",
                    "Store Credit",
                    "Progress",
                    "Actions",
                  ]}
                  rows={rows}
                  hoverable
                />
              ) : (
                <EmptyState
                  heading="No customers found"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Try adjusting your search or filters, or sync customers from Shopify.</p>
                </EmptyState>
              )}
            </Card>

            {/* Enhanced Tier Calculation Info */}
            <Grid columns={{ xs: 1, sm: 1, md: 2, lg: 2, xl: 2 }}>
              <Grid.Cell>
                <Card>
                  <Box padding="400">
                    <BlockStack gap="400">
                      <InlineStack align="space-between">
                        <Text variant="headingMd" as="h3">
                          How Tier Calculation Works
                        </Text>
                        <Icon source={InfoIcon} tone="base" />
                      </InlineStack>
                      
                      <BlockStack gap="300">
                        <InlineStack gap="200" align="start">
                          <Icon source={CheckCircleIcon} tone="success" />
                          <BlockStack gap="050">
                            <Text variant="bodyMd" fontWeight="medium" as="span">
                              Automatic Processing
                            </Text>
                            <Text variant="bodySm" tone="subdued" as="span">
                              Tiers update automatically with each order
                            </Text>
                          </BlockStack>
                        </InlineStack>

                        <InlineStack gap="200" align="start">
                          <Icon source={CheckCircleIcon} tone="success" />
                          <BlockStack gap="050">
                            <Text variant="bodyMd" fontWeight="medium" as="span">
                              Smart Calculation
                            </Text>
                            <Text variant="bodySm" tone="subdued" as="span">
                              Includes all paid orders, deducts refunds
                            </Text>
                          </BlockStack>
                        </InlineStack>

                        <InlineStack gap="200" align="start">
                          <Icon source={CheckCircleIcon} tone="success" />
                          <BlockStack gap="050">
                            <Text variant="bodyMd" fontWeight="medium" as="span">
                              Flexible Periods
                            </Text>
                            <Text variant="bodySm" tone="subdued" as="span">
                              Respects annual or lifetime evaluation
                            </Text>
                          </BlockStack>
                        </InlineStack>
                      </BlockStack>
                    </BlockStack>
                  </Box>
                </Card>
              </Grid.Cell>

              <Grid.Cell>
                <Card>
                  <Box padding="400">
                    <BlockStack gap="400">
                      <InlineStack align="space-between">
                        <Text variant="headingMd" as="h3">
                          Quick Actions
                        </Text>
                        <Icon source={ClockIcon} tone="base" />
                      </InlineStack>
                      
                      <BlockStack gap="300">
                        <Button fullWidth onClick={handleCalculateAll} loading={isLoading}>
                          <InlineStack gap="100">
                            <Icon source={RefreshIcon} />
                            Recalculate All Tiers
                          </InlineStack>
                        </Button>
                        
                        <Text variant="bodySm" tone="subdued" as="p">
                          Last calculation updates all customer tiers based on their complete order history. 
                          This process may take a few minutes for large customer bases.
                        </Text>

                        <Divider />

                        <InlineStack gap="200">
                          <Badge tone="info">Tip</Badge>
                          <Text variant="bodySm" as="span">
                            Individual recalculation happens automatically with each order
                          </Text>
                        </InlineStack>
                      </BlockStack>
                    </BlockStack>
                  </Box>
                </Card>
              </Grid.Cell>
            </Grid>
          </BlockStack>
        </Layout.Section>
      </Layout>

      {/* Customer Detail Modal */}
      {selectedCustomerId && (
        <CustomerDetailModal
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setSelectedCustomerId(null);
          }}
          customerId={selectedCustomerId}
          customerEmail={filteredCustomers.find(c => c.id === selectedCustomerId)?.email || ""}
        />
      )}
    </Page>
  );
}