import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import { useState, useCallback, useMemo } from "react";
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
  tierCalculationResults?: {
    total: number;
    changed: number;
    errors: number;
  };
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
// COMPONENT
// ============================================

export default function Customers() {
  const data = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  
  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [bannerMessage, setBannerMessage] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Format currency helper
  const formatAmount = useCallback((amount: number) => {
    return formatCurrency(amount, data.shopSettings as any);
  }, [data.shopSettings]);

  // Handle search
  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    // You could implement client-side filtering or server-side search here
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
      setShowSuccessBanner(true);
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
    const formData = new FormData();
    formData.append("action", "calculate-single");
    formData.append("customerId", customerId);
    submit(formData, { method: "post" });
  }, [submit]);

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

  // Table rows
  const rows = filteredCustomers.map(customer => [
    customer.email,
    customer.currentTier ? (
      <Badge tone="success">
        {`${customer.currentTier.name} (${customer.currentTier.cashbackPercent}%)`}
      </Badge>
    ) : (
      <Badge tone="warning">No tier</Badge>
    ),
    formatAmount(customer.storeCredit),
    customer.currentTier ? (
      <Text variant="bodySm" tone="subdued" as="span">
        Min: {formatAmount(customer.currentTier.minSpend)}
      </Text>
    ) : (
      "-"
    ),
    <InlineStack gap="100">
      <Button size="slim" onClick={() => handleViewCustomer(customer.id)}>
        View
      </Button>
      <Button size="slim" variant="plain" onClick={() => handleCalculateSingle(customer.id)}>
        Recalculate
      </Button>
    </InlineStack>
  ]);

  const isLoading = navigation.state === "submitting" || isCalculating;

  // Effect to handle action results
  if (navigation.state === "idle" && isCalculating) {
    setIsCalculating(false);
    // You would handle the response here
  }

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
          <BlockStack gap="400">
            {/* Success Banner */}
            {showSuccessBanner && (
              <Banner
                title={bannerMessage}
                tone="success"
                onDismiss={() => setShowSuccessBanner(false)}
              />
            )}

            {/* Stats Overview */}
            <Card>
              <Box padding="400">
                <InlineStack align="space-between">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">
                      Customer Overview
                    </Text>
                    <Text variant="bodyMd" tone="subdued" as="p">
                      Total: {data.totalCustomers} customers
                    </Text>
                  </BlockStack>
                  <InlineStack gap="400">
                    <BlockStack gap="100" align="center">
                      <Icon source={PersonIcon} tone="base" />
                      <Text variant="bodyLg" fontWeight="semibold" as="p">
                        {data.customers.filter(c => c.currentTier).length}
                      </Text>
                      <Text variant="bodySm" tone="subdued" as="p">
                        With tiers
                      </Text>
                    </BlockStack>
                    <BlockStack gap="100" align="center">
                      <Icon source={AlertTriangleIcon} tone="warning" />
                      <Text variant="bodyLg" fontWeight="semibold" as="p">
                        {data.customers.filter(c => !c.currentTier).length}
                      </Text>
                      <Text variant="bodySm" tone="subdued" as="p">
                        No tier
                      </Text>
                    </BlockStack>
                  </InlineStack>
                </InlineStack>
              </Box>
            </Card>

            {/* Filters */}
            <Card>
              <Box padding="400">
                <InlineStack gap="300">
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="Search customers"
                      labelHidden
                      placeholder="Search by email or ID..."
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
              </Box>
            </Card>

            {/* Customer Table */}
            <Card>
              {filteredCustomers.length > 0 ? (
                <DataTable
                  columnContentTypes={["text", "text", "numeric", "text", "text"]}
                  headings={[
                    "Customer",
                    "Current Tier",
                    "Store Credit",
                    "Tier Requirement",
                    "Actions",
                  ]}
                  rows={rows}
                />
              ) : (
                <EmptyState
                  heading="No customers found"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Try adjusting your search or filters.</p>
                </EmptyState>
              )}
            </Card>

            {/* Tier Calculation Info */}
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <InlineStack align="space-between">
                    <Text variant="headingMd" as="h3">
                      Tier Calculation
                    </Text>
                    <Icon source={ChartVerticalIcon} tone="base" />
                  </InlineStack>
                  <Text variant="bodyMd" tone="subdued" as="p">
                    Tiers are automatically calculated based on customer spending. Click "Calculate all tiers" to update all customers based on their order history.
                  </Text>
                  <BlockStack gap="200">
                    <InlineStack gap="100">
                      <Icon source={CheckCircleIcon} tone="success" />
                      <Text variant="bodySm" as="p">
                        Calculation includes all paid orders
                      </Text>
                    </InlineStack>
                    <InlineStack gap="100">
                      <Icon source={CheckCircleIcon} tone="success" />
                      <Text variant="bodySm" as="p">
                        Refunds are automatically deducted
                      </Text>
                    </InlineStack>
                    <InlineStack gap="100">
                      <Icon source={CheckCircleIcon} tone="success" />
                      <Text variant="bodySm" as="p">
                        Respects tier evaluation periods (Annual/Lifetime)
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Box>
            </Card>
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