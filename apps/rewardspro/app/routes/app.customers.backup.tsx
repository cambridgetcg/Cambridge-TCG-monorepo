import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSearchParams, useFetcher, useNavigation } from "@remix-run/react";
export { ErrorBoundary } from "../components/ErrorBoundary";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Badge,
  TextField,
  Select,
  InlineStack,
  BlockStack,
  Text,
  Button,
  EmptyState,
  Icon,
  ResourceList,
  ResourceItem,
  Banner,
  ProgressBar,
  Modal,
  Box,
} from "@shopify/polaris";
import { SearchIcon, RefreshIcon } from "@shopify/polaris-icons";
import { useState, useCallback, useMemo, useEffect } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Types
type Customer = {
  id: string;
  shop: string;
  shopifyCustomerId: string;
  email: string;
  storeCredit: number;
  currentTierId: string | null;
  currentTier: {
    id: string;
    name: string;
    cashbackPercent: number;
  } | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    creditLedger: number;
  };
  // Calculated fields
  totalSpending?: number;
  lastOrderDate?: string;
};

type LoaderData = {
  customers: Customer[];
  tiers: Array<{
    id: string;
    name: string;
    minSpend: number;
    cashbackPercent: number;
  }>;
  stats: {
    totalCustomers: number;
    customersWithTier: number;
    totalStoreCredit: number;
  };
};

// Loader
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    
    if (!session?.shop) {
      console.error("[Customers] No shop in session - forcing re-authentication");
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;
    const url = new URL(request.url);
    
    // Get query parameters for filtering
    const search = url.searchParams.get("search") || "";
    const tierFilter = url.searchParams.get("tier") || "all";
    const sortBy = url.searchParams.get("sortBy") || "createdAt";
    const sortOrder = url.searchParams.get("sortOrder") || "desc";

    // Build where clause
    const whereClause: any = { shop };
    
    if (search) {
      whereClause.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { shopifyCustomerId: { contains: search } },
      ];
    }
    
    if (tierFilter !== "all") {
      if (tierFilter === "none") {
        whereClause.currentTierId = null;
      } else {
        whereClause.currentTierId = tierFilter;
      }
    }

    // Fetch customers with their tier and ledger count
    const customers = await db.customer.findMany({
      where: whereClause,
      include: {
        currentTier: {
          select: {
            id: true,
            name: true,
            cashbackPercent: true,
          },
        },
        _count: {
          select: {
            creditLedger: true,
          },
        },
      },
      orderBy: {
        [sortBy]: sortOrder as "asc" | "desc",
      },
      take: 50, // Limit for performance
    });

    // Fetch all tiers for filter dropdown
    const tiers = await db.tier.findMany({
      where: { shop },
      orderBy: { minSpend: "asc" },
      select: {
        id: true,
        name: true,
        minSpend: true,
        cashbackPercent: true,
      },
    });

    // Calculate stats (handle empty results)
    const stats = await db.customer.aggregate({
      where: { shop },
      _count: true,
      _sum: {
        storeCredit: true,
      },
    });

    const customersWithTier = await db.customer.count({
      where: {
        shop,
        currentTierId: { not: null },
      },
    });

    // Serialize data for JSON (handle both Date objects and strings from Data API)
    const serializedCustomers = customers.map((customer) => ({
      ...customer,
      storeCredit: Number(customer.storeCredit),
      createdAt: customer.createdAt instanceof Date 
        ? customer.createdAt.toISOString() 
        : customer.createdAt,
      updatedAt: customer.updatedAt instanceof Date 
        ? customer.updatedAt.toISOString() 
        : customer.updatedAt,
    }));

    return json<LoaderData>({
      customers: serializedCustomers,
      tiers,
      stats: {
        totalCustomers: stats._count,
        customersWithTier,
        totalStoreCredit: Number(stats._sum.storeCredit || 0),
      },
    });
  } catch (error) {
    console.error("Loader error:", error);
    throw new Response("Failed to load customers", { status: 500 });
  }
};

// Action handler for sync
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    
    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;
    const formData = await request.formData();
    const intent = formData.get("intent") as string;

    if (intent === "sync") {
      // Fetch all tiers for assignment logic
      const tiers = await db.tier.findMany({
        where: { shop },
        orderBy: { minSpend: "desc" },
      });

      if (tiers.length === 0) {
        return json({ 
          error: "Please create loyalty tiers before syncing customers",
          syncedCount: 0 
        });
      }

      // GraphQL query to fetch customers from Shopify
      const CUSTOMERS_QUERY = `#graphql
        query GetCustomers($cursor: String) {
          customers(first: 250, after: $cursor) {
            edges {
              node {
                id
                email
                firstName
                lastName
                phone
                totalSpentAmount {
                  amount
                  currencyCode
                }
                ordersCount
                createdAt
                updatedAt
                addresses {
                  country
                  province
                  city
                }
              }
              cursor
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;

      let hasNextPage = true;
      let cursor = null;
      let syncedCount = 0;
      let processedCount = 0;
      const errors: string[] = [];

      // Process customers in batches
      while (hasNextPage) {
        try {
          const response = await admin.graphql(
            CUSTOMERS_QUERY,
            { variables: { cursor } }
          );

          const data = await response.json();
          
          if (data.errors) {
            console.error("GraphQL errors:", data.errors);
            errors.push("Failed to fetch some customers from Shopify");
            break;
          }

          const customers = data.data.customers;
          
          // Process each customer
          for (const edge of customers.edges) {
            const customer = edge.node;
            processedCount++;
            
            // Skip customers without email
            if (!customer.email) {
              continue;
            }

            // Extract customer ID from GraphQL ID
            const shopifyCustomerId = customer.id.replace('gid://shopify/Customer/', '');
            
            // Calculate total spending (convert from cents to dollars)
            const totalSpending = parseFloat(customer.totalSpentAmount?.amount || "0");
            
            // Determine appropriate tier based on spending
            let assignedTier = null;
            for (const tier of tiers) {
              if (totalSpending >= tier.minSpend) {
                assignedTier = tier;
                break;
              }
            }

            // Prepare customer data (only using fields that exist in the schema)
            const customerData = {
              shop,
              shopifyCustomerId,
              email: customer.email,
              currentTierId: assignedTier?.id || null,
              storeCredit: 0, // Default to 0 for new customers
            };

            // Upsert customer in database
            const upsertedCustomer = await db.customer.upsert({
              where: {
                shop_shopifyCustomerId: {
                  shop,
                  shopifyCustomerId,
                },
              },
              create: customerData,
              update: {
                email: customerData.email,
                currentTierId: customerData.currentTierId,
              },
            });
            
            // If tier was assigned, log it
            if (assignedTier && !upsertedCustomer.currentTierId) {
              await db.tierChangeLog.create({
                data: {
                  customerId: upsertedCustomer.id,
                  shop,
                  fromTierId: null,
                  toTierId: assignedTier.id,
                  changeType: "INITIAL_ASSIGNMENT",
                  triggerType: "ACCOUNT_CREATED",
                  totalSpending: totalSpending,
                  metadata: {
                    syncedFromShopify: true,
                    customerName: [customer.firstName, customer.lastName].filter(Boolean).join(' '),
                    ordersCount: customer.ordersCount,
                  },
                },
              });
            }

            syncedCount++;
          }

          // Check for next page
          hasNextPage = customers.pageInfo.hasNextPage;
          cursor = customers.pageInfo.endCursor;
          
          // Add a small delay to avoid rate limiting
          if (hasNextPage) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.error("Error processing customer batch:", error);
          errors.push(`Error processing batch after ${processedCount} customers`);
          break;
        }
      }

      return json({
        success: true,
        syncedCount,
        processedCount,
        errors: errors.length > 0 ? errors : null,
        message: `Successfully synced ${syncedCount} customers`,
      });
    }

    return json({ error: "Invalid action" });
  } catch (error) {
    console.error("Action error:", error);
    return json({ error: "Failed to sync customers" }, { status: 500 });
  }
};

// Component
export default function CustomersPage() {
  const { customers, tiers } = useLoaderData<LoaderData>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const navigation = useNavigation();
    
  // Search and filter state
  const [searchValue, setSearchValue] = useState(searchParams.get("search") || "");
  const [selectedTier, setSelectedTier] = useState(searchParams.get("tier") || "all");
  
  // Sync modal state
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncInProgress, setSyncInProgress] = useState(false);
  
  // Handle sync action
  const handleSync = useCallback(() => {
    setSyncModalOpen(true);
  }, []);
  
  const confirmSync = useCallback(() => {
    setSyncInProgress(true);
    const formData = new FormData();
    formData.append("intent", "sync");
    fetcher.submit(formData, { method: "post" });
  }, [fetcher]);
  
  // Handle sync response
  useEffect(() => {
    if (fetcher.data) {
      setSyncInProgress(false);
      setSyncModalOpen(false);
    }
  }, [fetcher.data]);
  
  // Handle search
  const handleSearch = useCallback((value: string) => {
    setSearchValue(value);
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set("search", value);
    } else {
      params.delete("search");
    }
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  // Handle tier filter
  const handleTierFilter = useCallback((value: string) => {
    setSelectedTier(value);
    const params = new URLSearchParams(searchParams);
    if (value !== "all") {
      params.set("tier", value);
    } else {
      params.delete("tier");
    }
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  // Prepare tier options for filter
  const tierOptions = useMemo(() => {
    const options = [
      { label: "All Tiers", value: "all" },
      { label: "No Tier", value: "none" },
    ];
    
    tiers.forEach((tier) => {
      options.push({
        label: `${tier.name} (${tier.cashbackPercent}% cashback)`,
        value: tier.id,
      });
    });
    
    return options;
  }, [tiers]);

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  // Get tier badge tone
  const getTierTone = (tier: Customer["currentTier"]) => {
    if (!tier) return "new";
    if (tier.cashbackPercent >= 10) return "success";
    if (tier.cashbackPercent >= 5) return "info";
    return "attention";
  };

  // Prepare table rows for desktop
  const rows = customers.map((customer) => [
    <BlockStack gap="100">
      <Text as="span" variant="bodyMd" fontWeight="semibold">
        {customer.email}
      </Text>
      <Text as="span" variant="bodySm" tone="subdued">
        ID: {customer.shopifyCustomerId}
      </Text>
    </BlockStack>,
    customer.currentTier ? (
      <Badge tone={getTierTone(customer.currentTier)}>
        {customer.currentTier.name}
      </Badge>
    ) : (
      <Badge tone="new">No Tier</Badge>
    ),
    <Text as="span" variant="bodyMd" fontWeight="semibold">
      {formatCurrency(customer.storeCredit)}
    </Text>,
    <Button
      url={`/app/customers/${customer.id}`}
      size="slim"
      variant="plain"
    >
      View Details
    </Button>,
  ]);

  // Check if we're loading
  const isLoading = navigation.state === "loading";
  const isSyncing = fetcher.state === "submitting" || syncInProgress;
  
  // Get sync result
  const syncResult = fetcher.data as { 
    success?: boolean; 
    error?: string; 
    syncedCount?: number; 
    processedCount?: number;
    message?: string;
    errors?: string[];
  } | undefined;

  return (
    <Page
      title="Customers"
      primaryAction={{
        content: "Sync from Shopify",
        icon: RefreshIcon,
        onAction: handleSync,
        disabled: isSyncing,
        loading: isSyncing,
      }}
    >
      <Layout>
        <Layout.Section variant="fullWidth">
          <Card>
            <BlockStack gap="400">
              {/* Filters - Responsive */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                <div style={{ flex: "1 1 300px", minWidth: "200px" }}>
                  <TextField
                    label="Search customers"
                    value={searchValue}
                    onChange={handleSearch}
                    placeholder="Search by email or customer ID"
                    prefix={<Icon source={SearchIcon} />}
                    autoComplete="off"
                    clearButton
                    onClearButtonClick={() => handleSearch("")}
                  />
                </div>
                <div style={{ flex: "0 1 200px", minWidth: "150px" }}>
                  <Select
                    label="Filter by tier"
                    options={tierOptions}
                    value={selectedTier}
                    onChange={handleTierFilter}
                  />
                </div>
              </div>

              {/* Customer table/list - Responsive */}
              {customers.length === 0 ? (
                <EmptyState
                  heading="No customers found"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>
                    {searchValue || selectedTier !== "all"
                      ? "Try adjusting your filters"
                      : "Customers will appear here when they make purchases"}
                  </p>
                </EmptyState>
              ) : (
                <>
                  {/* Desktop view - Table */}
                  <div style={{ display: "block" }} className="desktop-only">
                    <DataTable
                      columnContentTypes={["text", "text", "numeric", "text"]}
                      headings={[
                        "Customer",
                        "Tier",
                        "Store Credit",
                        "Actions",
                      ]}
                      rows={rows}
                      sortable={[true, false, true, false]}
                    />
                  </div>
                  
                  {/* Mobile view - Resource List */}
                  <div style={{ display: "none" }} className="mobile-only">
                    <ResourceList
                      items={customers}
                      renderItem={(customer) => {
                        const { id, email, shopifyCustomerId, currentTier, storeCredit } = customer;
                        
                        return (
                          <ResourceItem
                            id={id}
                            url={`/app/customers/${id}`}
                            accessibilityLabel={`View details for ${email}`}
                          >
                            <BlockStack gap="200">
                              <InlineStack align="space-between" blockAlign="start">
                                <BlockStack gap="100">
                                  <Text as="h3" variant="bodyMd" fontWeight="semibold">
                                    {email}
                                  </Text>
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    ID: {shopifyCustomerId}
                                  </Text>
                                </BlockStack>
                                {currentTier ? (
                                  <Badge tone={getTierTone(currentTier)}>
                                    {currentTier.name}
                                  </Badge>
                                ) : (
                                  <Badge tone="new">No Tier</Badge>
                                )}
                              </InlineStack>
                              <BlockStack gap="050">
                                <Text as="p" variant="bodySm" tone="subdued">Store Credit</Text>
                                <Text as="p" variant="bodyMd" fontWeight="semibold">
                                  {formatCurrency(storeCredit)}
                                </Text>
                              </BlockStack>
                            </BlockStack>
                          </ResourceItem>
                        );
                      }}
                    />
                  </div>
                  
                  {/* CSS for responsive display */}
                  <style>{`
                    @media (max-width: 768px) {
                      .desktop-only { display: none !important; }
                      .mobile-only { display: block !important; }
                    }
                    @media (min-width: 769px) {
                      .desktop-only { display: block !important; }
                      .mobile-only { display: none !important; }
                    }
                  `}</style>
                </>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

      </Layout>

      {/* Sync Success/Error Banner */}
      {syncResult && !syncModalOpen && (
        <div style={{ position: "fixed", bottom: "20px", right: "20px", maxWidth: "400px", zIndex: 1000 }}>
          <Banner
            tone={syncResult.success ? "success" : "critical"}
            onDismiss={() => fetcher.data = null}
          >
            <BlockStack gap="200">
              <Text variant="headingMd" as="h3">
                {syncResult.success ? "Sync Complete" : "Sync Failed"}
              </Text>
              <Text variant="bodyMd" as="p">
                {syncResult.message || syncResult.error}
              </Text>
              {syncResult.syncedCount !== undefined && (
                <Text variant="bodySm" as="p">
                  Synced: {syncResult.syncedCount} / {syncResult.processedCount || syncResult.syncedCount} customers
                </Text>
              )}
              {syncResult.errors && syncResult.errors.length > 0 && (
                <BlockStack gap="100">
                  <Text variant="bodySm" fontWeight="semibold" as="p">Errors:</Text>
                  {syncResult.errors.map((error, i) => (
                    <Text key={i} variant="bodySm" as="p">• {error}</Text>
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </Banner>
        </div>
      )}

      {/* Sync Confirmation Modal */}
      <Modal
        open={syncModalOpen}
        onClose={() => !isSyncing && setSyncModalOpen(false)}
        title="Sync Customers from Shopify"
        primaryAction={{
          content: "Start Sync",
          onAction: confirmSync,
          loading: isSyncing,
          disabled: isSyncing,
        }}
        secondaryActions={!isSyncing ? [
          {
            content: "Cancel",
            onAction: () => setSyncModalOpen(false),
          },
        ] : []}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {isSyncing ? (
              <>
                <Text variant="bodyMd" as="p">
                  Syncing customers from your Shopify store. This may take a few minutes depending on the number of customers.
                </Text>
                <ProgressBar progress={75} tone="primary" animated />
                <Text variant="bodySm" tone="subdued" as="p">
                  Please don't close this window while syncing is in progress.
                </Text>
              </>
            ) : (
              <>
                <Text variant="bodyMd" as="p">
                  This will fetch all customers from your Shopify store and update their information in RewardsPro.
                </Text>
                
                <BlockStack gap="200">
                  <Text variant="bodyMd" fontWeight="semibold" as="p">
                    What will happen:
                  </Text>
                  <ul style={{ marginLeft: "20px", marginTop: "8px" }}>
                    <li>
                      <Text variant="bodyMd" as="span">
                        Import all customers with their email and spending data
                      </Text>
                    </li>
                    <li>
                      <Text variant="bodyMd" as="span">
                        Automatically assign loyalty tiers based on total spending
                      </Text>
                    </li>
                    <li>
                      <Text variant="bodyMd" as="span">
                        Update existing customer records if they already exist
                      </Text>
                    </li>
                  </ul>
                </BlockStack>
                
                {tiers.length === 0 && (
                  <Banner tone="warning">
                    <Text variant="bodyMd" as="p">
                      No loyalty tiers found. Please create tiers first to automatically assign customers to appropriate levels.
                    </Text>
                  </Banner>
                )}
                
                <Text variant="bodySm" tone="subdued" as="p">
                  Note: Large customer bases may take several minutes to sync. The sync will continue in the background.
                </Text>
              </>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}