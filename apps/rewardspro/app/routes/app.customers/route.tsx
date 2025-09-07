import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, useNavigation, useSubmit, useSearchParams, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { useState, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Text,
  BlockStack,
  InlineGrid,
  Badge,
  Banner,
  Box,
  InlineStack,
  EmptyState,
  Button,
  ButtonGroup,
  TextField,
  Icon
} from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";
import { authenticate } from "../../shopify.server";
import db from "../../db.server";
import { createCustomerSyncServiceV2 } from "../../services/customer-sync-v2.service";
import { formatCurrency } from "../../utils/currency";

// Type imports
import type { CustomersLoaderData, CustomersActionData } from "./types";

// ============================================================================
// LOADER - Fetch customers and stats
// ============================================================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  // Get search parameter from URL
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get('search') || '';
  
  try {
    // Fetch all customers first, then filter in memory if searching
    // This is because Data API adapter might not handle complex nested queries well
    const whereClause: any = { shop: session.shop };
    
    // For now, get all customers from the shop and filter after
    // This ensures search works correctly with Data API limitations
    
    // Fetch shop settings for currency formatting
    const shopSettings = await db.shopSettings.findUnique({
      where: { shop: session.shop }
    });

    // Fetch customers (Data API doesn't support includes)
    let customers = await db.customer.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 500 // Get more initially for filtering
    });
    
    // Filter in memory if search query exists
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      customers = customers.filter(customer => 
        customer.email.toLowerCase().includes(searchLower) ||
        customer.shopifyCustomerId.toLowerCase().includes(searchLower)
      );
    }
    
    // Limit to 100 after filtering
    customers = customers.slice(0, 100);

    // Fetch all tiers
    const tiers = await db.tier.findMany({
      where: { shop: session.shop },
      orderBy: { minSpend: 'asc' }
    });

    // Calculate stats
    const stats = {
      totalCustomers: await db.customer.count({
        where: { shop: session.shop }
      }),
      customersWithTiers: await db.customer.count({
        where: { 
          shop: session.shop,
          currentTierId: { not: null }
        }
      }),
      totalStoreCredit: customers.reduce((sum, c) => sum + Number(c.storeCredit), 0).toFixed(2)
    };

    // Fetch tier information for customers who have tiers
    const customerTierIds = customers
      .filter(c => c.currentTierId)
      .map(c => c.currentTierId);
    
    const customerTiers = customerTierIds.length > 0
      ? await db.tier.findMany({
          where: { id: { in: customerTierIds as string[] } }
        })
      : [];
    
    const tierMap = new Map(customerTiers.map(tier => [tier.id, tier]));
    
    // Format customers for display
    const formattedCustomers = customers.map(customer => {
      const tier = customer.currentTierId ? tierMap.get(customer.currentTierId) : null;
      return {
        id: customer.id,
        email: customer.email,
        shopifyCustomerId: customer.shopifyCustomerId,
        storeCredit: customer.storeCredit.toString(),
        currentTier: tier ? {
          name: tier.name,
          cashbackPercent: tier.cashbackPercent
        } : null,
        createdAt: customer.createdAt.toISOString(),
        updatedAt: customer.updatedAt.toISOString()
      };
    });

    return json<CustomersLoaderData>({
      customers: formattedCustomers,
      tiers,
      stats,
      searchQuery,
      shopSettings: shopSettings ? {
        storeCurrency: shopSettings.storeCurrency,
        currencyDisplayType: shopSettings.currencyDisplayType
      } : null
    });
  } catch (error) {
    console.error("Error loading customers:", error);
    return json<CustomersLoaderData>({
      customers: [],
      tiers: [],
      stats: {
        totalCustomers: 0,
        customersWithTiers: 0,
        totalStoreCredit: "0.00"
      },
      searchQuery: '',
      shopSettings: null
    });
  }
};

// ============================================================================
// ACTION - Handle sync
// ============================================================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  
  const formData = await request.formData();
  const action = formData.get("action");
  
  if (action === "sync") {
    try {
      // Check if tiers exist
      const tierCount = await db.tier.count({
        where: { shop: session.shop }
      });
      
      if (tierCount === 0) {
        return json<CustomersActionData>({
          success: false,
          message: "Please create at least one tier before syncing customers"
        });
      }
      
      // Create and run sync service
      const syncService = await createCustomerSyncServiceV2(admin as any, session.shop, {
        batchSize: 50
      });
      
      const result = await syncService.syncAllCustomers();
      
      return json<CustomersActionData>({
        success: result.success,
        message: result.message,
        processed: result.processed,
        successful: result.successful,
        failed: result.failed,
        errors: result.errors.slice(0, 5) // Limit errors displayed
      });
      
    } catch (error) {
      console.error("Sync error:", error);
      return json<CustomersActionData>({
        success: false,
        message: error instanceof Error ? error.message : "Sync failed"
      });
    }
  }
  
  return json<CustomersActionData>({
    success: false,
    message: "Invalid action"
  });
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function CustomersPageV2() {
  const { customers, tiers, stats, searchQuery = '', shopSettings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchValue, setSearchValue] = useState(searchQuery);
  
  const isLoading = navigation.state === "submitting" || navigation.state === "loading";
  const isSearching = navigation.state === "loading" && searchParams.has('search');
  
  // Handle sync button click
  const handleSync = () => {
    const formData = new FormData();
    formData.append("action", "sync");
    submit(formData, { method: "post" });
  };
  
  // Handle search
  const handleSearch = useCallback(
    (value: string) => {
      setSearchValue(value);
      const newParams = new URLSearchParams(searchParams);
      if (value) {
        newParams.set('search', value);
      } else {
        newParams.delete('search');
      }
      setSearchParams(newParams);
    },
    [searchParams, setSearchParams]
  );
  
  // Clear search
  const handleClearSearch = useCallback(() => {
    handleSearch('');
  }, [handleSearch]);
  
  // Prepare data for table
  const rows = customers.map(customer => [
    customer.email,
    customer.shopifyCustomerId,
    customer.currentTier ? (
      <Badge tone="success">
        {`${customer.currentTier.name} (${customer.currentTier.cashbackPercent.toString()}%)`}
      </Badge>
    ) : (
      <Badge>No tier</Badge>
    ),
    formatCurrency(customer.storeCredit, shopSettings),
    new Date(customer.createdAt).toLocaleDateString()
  ]);
  
  return (
    <Page
      title="Customers"
      primaryAction={{
        content: "Sync from Shopify",
        loading: isLoading,
        onAction: handleSync
      }}
    >
      {/* Search Bar */}
      <div style={{ marginBottom: "16px" }}>
        <TextField
          label="Search customers"
          value={searchValue}
          onChange={handleSearch}
          clearButton
          onClearButtonClick={handleClearSearch}
          prefix={<Icon source={SearchIcon} />}
          placeholder="Search by email or customer ID"
          autoComplete="off"
          loading={isSearching}
        />
      </div>
      
      <Layout>
        {/* Sync Result Banner */}
        {actionData && (
          <Layout.Section>
            <Banner
              title={actionData.success ? "Sync completed" : "Sync failed"}
              tone={actionData.success ? "success" : "critical"}
              onDismiss={() => {}}
            >
              {actionData.message && (
                <Text as="p">{actionData.message}</Text>
              )}
              
              {actionData.processed !== undefined && (
                <BlockStack gap="100">
                  <Text as="p">
                    Processed: {actionData.processed} customers
                  </Text>
                  {actionData.successful !== undefined && (
                    <Text as="p">
                      Successful: {actionData.successful}
                    </Text>
                  )}
                  {actionData.failed !== undefined && actionData.failed > 0 && (
                    <Text as="p">
                      Failed: {actionData.failed}
                    </Text>
                  )}
                </BlockStack>
              )}
              
              {actionData.errors && actionData.errors.length > 0 && (
                <BlockStack gap="100">
                  <Text fontWeight="semibold" as="p">Errors:</Text>
                  {actionData.errors.map((error: string, i: number) => (
                    <Box key={i} padding="200" background="bg-surface-critical" borderRadius="200">
                      <Text as="p" variant="bodySm" breakWord>
                        {error}
                      </Text>
                    </Box>
                  ))}
                </BlockStack>
              )}
            </Banner>
          </Layout.Section>
        )}
        
        {/* Statistics */}
        <Layout.Section>
          <InlineGrid columns={3} gap="400">
            <Card>
              <BlockStack gap="200">
                <Text variant="headingLg" as="h2">
                  {stats.totalCustomers}
                </Text>
                <Text variant="bodySm" tone="subdued" as="p">
                  Total Customers
                </Text>
              </BlockStack>
            </Card>
            
            <Card>
              <BlockStack gap="200">
                <Text variant="headingLg" as="h2">
                  {stats.customersWithTiers}
                </Text>
                <Text variant="bodySm" tone="subdued" as="p">
                  With Tiers
                </Text>
              </BlockStack>
            </Card>
            
            <Card>
              <BlockStack gap="200">
                <Text variant="headingLg" as="h2">
                  {formatCurrency(stats.totalStoreCredit, shopSettings)}
                </Text>
                <Text variant="bodySm" tone="subdued" as="p">
                  Total Store Credit
                </Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>
        
        {/* Customers Table */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h2">
                  Customer List
                </Text>
                {customers.length > 0 && (
                  <Badge tone="info">
                    {`Showing ${customers.length.toString()} of ${stats.totalCustomers.toString()}`}
                  </Badge>
                )}
              </InlineStack>
              
              {customers.length > 0 ? (
                <BlockStack gap="300">
                  <DataTable
                    columnContentTypes={["text", "text", "text", "numeric", "text"]}
                    headings={[
                      "Email",
                      "Shopify ID",
                      "Tier",
                      "Store Credit",
                      "Created"
                    ]}
                    rows={rows}
                  />
                </BlockStack>
              ) : (
                <EmptyState
                  heading="No customers yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>
                    Click "Sync from Shopify" to import your customers.
                  </p>
                </EmptyState>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
        
        {/* Tiers Reference */}
        {tiers.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Active Tiers
                </Text>
                <InlineStack gap="200">
                  {tiers.map(tier => (
                    <Badge key={tier.id} tone="info">
                      {`${tier.name}: ${tier.cashbackPercent.toString()}%${tier.minSpend !== null ? ` (Min: $${tier.minSpend.toString()})` : ''}`}
                    </Badge>
                  ))}
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
// ============================================================================
// ERROR BOUNDARY
// ============================================================================

/**
 * Error boundary for the customers route
 * Provides graceful error handling and user-friendly error messages
 */
export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <Page title="Error">
        <Layout>
          <Layout.Section>
            <Banner tone="critical">
              <p>
                {error.status === 404
                  ? "Customer not found"
                  : error.status === 401
                  ? "You don't have permission to view this page"
                  : error.data || "An error occurred while loading customers"}
              </p>
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page title="Error">
      <Layout>
        <Layout.Section>
          <Banner tone="critical">
            <p>An unexpected error occurred while loading customers. Please try again later.</p>
          </Banner>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
