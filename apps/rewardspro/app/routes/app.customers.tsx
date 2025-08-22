import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
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
} from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";
import { useState, useCallback, useMemo } from "react";
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

    // Calculate stats
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

    // Serialize data for JSON
    const serializedCustomers = customers.map((customer) => ({
      ...customer,
      storeCredit: Number(customer.storeCredit),
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
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

// Component
export default function CustomersPage() {
  const { customers, tiers, stats } = useLoaderData<LoaderData>();
  const [searchParams, setSearchParams] = useSearchParams();
    
  // Search and filter state
  const [searchValue, setSearchValue] = useState(searchParams.get("search") || "");
  const [selectedTier, setSelectedTier] = useState(searchParams.get("tier") || "all");
  
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

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
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
    customer.currentTier ? (
      <Text as="span" variant="bodyMd">{customer.currentTier.cashbackPercent}%</Text>
    ) : (
      <Text as="span" variant="bodyMd" tone="subdued">—</Text>
    ),
    <BlockStack gap="100">
      <Text as="span" variant="bodySm">{formatDate(customer.createdAt)}</Text>
      <Text as="span" variant="bodySm" tone="subdued">
        {customer._count?.creditLedger || 0} transactions
      </Text>
    </BlockStack>,
    <Button
      url={`/app/customers/${customer.id}`}
      size="slim"
      variant="plain"
    >
      View Details
    </Button>,
  ]);

  return (
    <Page
      title="Customers"
      subtitle={`${stats.totalCustomers} customers • ${stats.customersWithTier} with tiers • ${formatCurrency(stats.totalStoreCredit)} total store credit`}
      primaryAction={{
        content: "Sync from Shopify",
        onAction: () => console.log("Sync customers"),
        disabled: true, // Will implement later
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
                      columnContentTypes={["text", "text", "numeric", "numeric", "text", "text"]}
                      headings={[
                        "Customer",
                        "Tier",
                        "Store Credit",
                        "Cashback Rate",
                        "Member Since",
                        "Actions",
                      ]}
                      rows={rows}
                      sortable={[true, false, true, false, true, false]}
                    />
                  </div>
                  
                  {/* Mobile view - Resource List */}
                  <div style={{ display: "none" }} className="mobile-only">
                    <ResourceList
                      items={customers}
                      renderItem={(customer) => {
                        const { id, email, shopifyCustomerId, currentTier, storeCredit, createdAt } = customer;
                        
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
                              <InlineStack gap="400">
                                <BlockStack gap="050">
                                  <Text as="p" variant="bodySm" tone="subdued">Store Credit</Text>
                                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                                    {formatCurrency(storeCredit)}
                                  </Text>
                                </BlockStack>
                                {currentTier && (
                                  <BlockStack gap="050">
                                    <Text as="p" variant="bodySm" tone="subdued">Cashback</Text>
                                    <Text as="p" variant="bodyMd">
                                      {currentTier.cashbackPercent}%
                                    </Text>
                                  </BlockStack>
                                )}
                                <BlockStack gap="050">
                                  <Text as="p" variant="bodySm" tone="subdued">Member Since</Text>
                                  <Text as="p" variant="bodyMd">
                                    {formatDate(createdAt)}
                                  </Text>
                                </BlockStack>
                              </InlineStack>
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

        {/* Stats sidebar - Responsive */}
        <Layout.Section>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "16px" }}>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Quick Stats</Text>
                <BlockStack gap="300">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Total Customers
                    </Text>
                    <Text as="p" variant="headingLg">{stats.totalCustomers}</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">
                      With Tier Assignment
                    </Text>
                    <Text as="p" variant="headingLg">{stats.customersWithTier}</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Total Store Credit
                    </Text>
                    <Text as="p" variant="headingLg">
                      {formatCurrency(stats.totalStoreCredit)}
                    </Text>
                  </BlockStack>
                </BlockStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Tier Distribution</Text>
                <BlockStack gap="200">
                  {tiers.map((tier) => {
                    const count = customers.filter(
                      (c) => c.currentTierId === tier.id
                    ).length;
                    const percentage = stats.totalCustomers
                      ? Math.round((count / stats.totalCustomers) * 100)
                      : 0;
                    
                    return (
                      <BlockStack key={tier.id} gap="100">
                        <InlineStack align="space-between">
                          <Text as="span" variant="bodySm">{tier.name}</Text>
                          <Text as="span" variant="bodySm" fontWeight="semibold">
                            {count} ({percentage}%)
                          </Text>
                        </InlineStack>
                        <div
                          style={{
                            height: "4px",
                            background: "#e5e5e5",
                            borderRadius: "2px",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              width: `${percentage}%`,
                              background: "#00a3e0",
                              transition: "width 0.3s ease",
                            }}
                          />
                        </div>
                      </BlockStack>
                    );
                  })}
                  <BlockStack gap="100">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm">No Tier</Text>
                      <Text as="span" variant="bodySm" fontWeight="semibold">
                        {stats.totalCustomers - stats.customersWithTier}
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </div>
        </Layout.Section>
      </Layout>
    </Page>
  );
}