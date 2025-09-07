import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, useNavigation, useSubmit, useSearchParams, useRouteError, isRouteErrorResponse } from "@remix-run/react";
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
  ButtonGroup
} from "@shopify/polaris";
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
  
  // Get sorting parameters from URL
  const url = new URL(request.url);
  const sortBy = url.searchParams.get('sortBy') || 'createdAt';
  const sortOrder = url.searchParams.get('sortOrder') || 'desc';
  
  try {
    // Build orderBy based on sort parameters
    let orderBy: any = {};
    
    switch (sortBy) {
      case 'email':
        orderBy = { email: sortOrder };
        break;
      case 'shopifyCustomerId':
        orderBy = { shopifyCustomerId: sortOrder };
        break;
      case 'storeCredit':
        orderBy = { storeCredit: sortOrder };
        break;
      case 'tier':
        // Sort by tier's minSpend (higher tiers have higher minSpend)
        orderBy = { currentTier: { minSpend: sortOrder } };
        break;
      case 'createdAt':
      default:
        orderBy = { createdAt: sortOrder };
        break;
    }
    
    // Fetch shop settings for currency formatting
    const shopSettings = await db.shopSettings.findUnique({
      where: { shop: session.shop }
    });

    // Fetch customers with their tiers
    const customers = await db.customer.findMany({
      where: { shop: session.shop },
      include: {
        currentTier: true
      },
      orderBy,
      take: 100 // Limit to first 100 for performance
    });

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

    // Format customers for display
    const formattedCustomers = customers.map(customer => ({
      id: customer.id,
      email: customer.email,
      shopifyCustomerId: customer.shopifyCustomerId,
      storeCredit: customer.storeCredit.toString(),
      currentTier: customer.currentTier ? {
        name: customer.currentTier.name,
        cashbackPercent: customer.currentTier.cashbackPercent
      } : null,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString()
    }));

    return json<CustomersLoaderData>({
      customers: formattedCustomers,
      tiers,
      stats,
      sortBy,
      sortOrder,
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
      sortBy,
      sortOrder,
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
  const { customers, tiers, stats, sortBy = 'createdAt', sortOrder = 'desc', shopSettings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const isLoading = navigation.state === "submitting" || navigation.state === "loading";
  
  // Handle sync button click
  const handleSync = () => {
    const formData = new FormData();
    formData.append("action", "sync");
    submit(formData, { method: "post" });
  };
  
  // Handle column sorting
  const handleSort = (column: string) => {
    const newParams = new URLSearchParams(searchParams);
    
    // Toggle sort order if clicking the same column
    if (sortBy === column) {
      newParams.set('sortOrder', sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Default to ascending for new column
      newParams.set('sortBy', column);
      newParams.set('sortOrder', 'asc');
    }
    
    setSearchParams(newParams);
  };
  
  // Get sort indicator
  const getSortIndicator = (column: string) => {
    if (sortBy !== column) return '';
    return sortOrder === 'asc' ? ' ↑' : ' ↓';
  };
  
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
                  <InlineStack gap="200">
                    <Text variant="bodySm" tone="subdued" as="span">Sort by:</Text>
                    <ButtonGroup>
                      <Button 
                        size="slim" 
                        onClick={() => handleSort('email')}
                        pressed={sortBy === 'email'}
                      >
                        {`Email${getSortIndicator('email')}`}
                      </Button>
                      <Button 
                        size="slim" 
                        onClick={() => handleSort('shopifyCustomerId')}
                        pressed={sortBy === 'shopifyCustomerId'}
                      >
                        {`ID${getSortIndicator('shopifyCustomerId')}`}
                      </Button>
                      <Button 
                        size="slim" 
                        onClick={() => handleSort('tier')}
                        pressed={sortBy === 'tier'}
                      >
                        {`Tier${getSortIndicator('tier')}`}
                      </Button>
                      <Button 
                        size="slim" 
                        onClick={() => handleSort('storeCredit')}
                        pressed={sortBy === 'storeCredit'}
                      >
                        {`Credit${getSortIndicator('storeCredit')}`}
                      </Button>
                      <Button 
                        size="slim" 
                        onClick={() => handleSort('createdAt')}
                        pressed={sortBy === 'createdAt'}
                      >
                        {`Date${getSortIndicator('createdAt')}`}
                      </Button>
                    </ButtonGroup>
                  </InlineStack>
                  
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
