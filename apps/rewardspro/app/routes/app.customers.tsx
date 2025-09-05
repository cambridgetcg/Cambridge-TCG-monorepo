import { useState, useCallback, useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { 
  useLoaderData, 
  useActionData, 
  useNavigation, 
  useSubmit,
  useFetcher
} from "@remix-run/react";
import { 
  Page, 
  Layout, 
  Card, 
  DataTable, 
  Button, 
  TextField, 
  Select, 
  BlockStack, 
  InlineGrid,
  Text,
  Banner,
  Modal,
  Spinner,
  EmptyState,
  Badge,
  InlineStack,
  ProgressBar
} from "@shopify/polaris";
import { 
  RefreshIcon
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Types
interface CustomerData {
  id: string;
  email: string;
  shopifyCustomerId: string;
  storeCredit: number;
  currentTier: {
    id: string;
    name: string;
    cashbackPercent: number;
  } | null;
  transactionCount: number;
  createdAt: string;
}

interface LoaderData {
  customers: CustomerData[];
  tiers: Array<{
    id: string;
    name: string;
    minSpend: number;
    cashbackPercent: number;
  }>;
  stats: {
    totalCustomers: number;
    customersWithCredit: number;
    customersWithTiers: number;
  };
}

// Loader
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  
  // Get customers with tier info and transaction counts
  const customers = await db.customer.findMany({
    where: { shop },
    include: {
      currentTier: true,
      _count: {
        select: {
          creditLedger: true
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 100 // Limit for performance
  });
  
  // Format customer data
  const customersWithData: CustomerData[] = customers.map(customer => ({
    id: customer.id,
    email: customer.email,
    shopifyCustomerId: customer.shopifyCustomerId,
    storeCredit: Number(customer.storeCredit),
    currentTier: customer.currentTier ? {
      id: customer.currentTier.id,
      name: customer.currentTier.name,
      cashbackPercent: customer.currentTier.cashbackPercent
    } : null,
    transactionCount: customer._count.creditLedger,
    createdAt: customer.createdAt instanceof Date 
      ? customer.createdAt.toISOString() 
      : customer.createdAt
  }));
  
  // Get available tiers
  const tiers = await db.tier.findMany({
    where: { shop },
    orderBy: { minSpend: 'asc' }
  });
  
  // Calculate stats
  const stats = {
    totalCustomers: customers.length,
    customersWithCredit: customers.filter(c => Number(c.storeCredit) > 0).length,
    customersWithTiers: customers.filter(c => c.currentTier !== null).length,
  };
  
  return json<LoaderData>({
    customers: customersWithData,
    tiers,
    stats
  });
};

// Action handler
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const actionType = formData.get("actionType") as string;
  
  // Handle sync from Shopify
  if (actionType === "syncFromShopify") {
    try {
      // Get all tiers for tier assignment
      const tiers = await db.tier.findMany({
        where: { shop },
        orderBy: { minSpend: 'desc' }
      });
      
      if (tiers.length === 0) {
        return json({ 
          success: false, 
          error: "Please create loyalty tiers before syncing customers" 
        });
      }
      
      // GraphQL query to fetch customers
      const CUSTOMERS_QUERY = `#graphql
        query GetCustomers($cursor: String) {
          customers(first: 250, after: $cursor) {
            edges {
              node {
                id
                defaultEmailAddress {
                  emailAddress
                }
                firstName
                lastName
                defaultPhoneNumber {
                  phoneNumber
                }
                orders(first: 1) {
                  edges {
                    node {
                      totalPriceSet {
                        shopMoney {
                          amount
                        }
                      }
                    }
                  }
                }
                amountSpent {
                  amount
                  currencyCode
                }
                createdAt
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
      let cursor: string | null = null;
      let syncedCount = 0;
      let processedCount = 0;
      const errors: string[] = [];
      
      // Process customers in batches
      while (hasNextPage) {
        try {
          const response: any = await admin.graphql(
            CUSTOMERS_QUERY,
            { variables: { cursor } }
          );
          
          const data: any = await response.json();
          
          if (data.errors) {
            console.error("GraphQL errors:", data.errors);
            errors.push("Failed to fetch some customers from Shopify");
            break;
          }
          
          const customersData: any = data.data.customers;
          
          // Process each customer
          for (const edge of customersData.edges) {
            const customer = edge.node;
            processedCount++;
            
            // Skip customers without email
            const email = customer.defaultEmailAddress?.emailAddress;
            if (!email) {
              continue;
            }
            
            // Extract customer ID from GraphQL ID
            const shopifyCustomerId = customer.id.replace('gid://shopify/Customer/', '');
            
            // Calculate total spending
            const totalSpending = parseFloat(customer.amountSpent?.amount || "0");
            
            // Determine appropriate tier based on spending
            let assignedTier = null;
            for (const tier of tiers) {
              if (totalSpending >= tier.minSpend) {
                assignedTier = tier;
                break;
              }
            }
            
            // Upsert customer in database
            try {
              const existingCustomer = await db.customer.findUnique({
                where: {
                  shop_shopifyCustomerId: {
                    shop,
                    shopifyCustomerId
                  }
                }
              });
              
              if (existingCustomer) {
                // Update existing customer
                await db.customer.update({
                  where: { id: existingCustomer.id },
                  data: {
                    email,
                    currentTierId: assignedTier?.id || null
                  }
                });
              } else {
                // Create new customer
                await db.customer.create({
                  data: {
                    shop,
                    shopifyCustomerId,
                    email,
                    currentTierId: assignedTier?.id || null,
                    storeCredit: 0
                  }
                });
                
                // Log tier assignment if applicable
                if (assignedTier) {
                  const newCustomer = await db.customer.findUnique({
                    where: {
                      shop_shopifyCustomerId: {
                        shop,
                        shopifyCustomerId
                      }
                    }
                  });
                  
                  if (newCustomer) {
                    await db.tierChangeLog.create({
                      data: {
                        customerId: newCustomer.id,
                        shop,
                        fromTierId: null,
                        toTierId: assignedTier.id,
                        changeType: "INITIAL_ASSIGNMENT",
                        triggerType: "ACCOUNT_CREATED",
                        totalSpending: totalSpending,
                        metadata: {
                          source: "shopify_sync",
                          customerName: [customer.firstName, customer.lastName].filter(Boolean).join(' ')
                        }
                      }
                    });
                  }
                }
              }
              
              syncedCount++;
            } catch (error) {
              console.error(`Error processing customer ${email}:`, error);
              errors.push(`Failed to process customer: ${email}`);
            }
          }
          
          // Check for next page
          hasNextPage = customersData.pageInfo.hasNextPage;
          cursor = customersData.pageInfo.endCursor;
          
          // Add delay to avoid rate limiting
          if (hasNextPage) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.error("Error in sync batch:", error);
          errors.push(`Error after processing ${processedCount} customers`);
          break;
        }
      }
      
      return json({
        success: true,
        message: `Successfully synced ${syncedCount} customers`,
        syncedCount,
        processedCount,
        errors: errors.length > 0 ? errors : null
      });
    } catch (error) {
      console.error("Sync error:", error);
      return json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to sync customers" 
      });
    }
  }
  
  // Handle store credit adjustment
  if (actionType === "adjustCredit") {
    const customerId = formData.get("customerId") as string;
    const amount = parseFloat(formData.get("amount") as string);
    const creditAction = formData.get("creditAction") as string;
    
    if (!customerId || !amount || amount <= 0) {
      return json({ success: false, error: "Invalid amount" });
    }
    
    try {
      const customer = await db.customer.findUnique({
        where: { id: customerId }
      });
      
      if (!customer || customer.shop !== shop) {
        throw new Error("Customer not found");
      }
      
      // Calculate new balance
      const currentBalance = Number(customer.storeCredit);
      const newBalance = creditAction === "add" 
        ? currentBalance + amount 
        : Math.max(0, currentBalance - amount);
      
      // Update customer balance
      await db.customer.update({
        where: { id: customerId },
        data: { storeCredit: newBalance }
      });
      
      // Create ledger entry
      await db.storeCreditLedger.create({
        data: {
          customerId,
          shop,
          amount: creditAction === "add" ? amount : -amount,
          balance: newBalance,
          type: "MANUAL_ADJUSTMENT",
          metadata: {
            action: creditAction,
            adjustedBy: session.shop,
            reason: formData.get("reason") || "Manual adjustment via admin"
          }
        }
      });
      
      return json({ 
        success: true, 
        message: `Successfully ${creditAction === "add" ? "added" : "removed"} $${amount.toFixed(2)}` 
      });
    } catch (error) {
      return json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to adjust credit" 
      });
    }
  }
  
  return json({ success: false, error: "Invalid action" });
};

// Component
export default function CustomersPage() {
  const { customers, tiers, stats } = useLoaderData<LoaderData>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const fetcher = useFetcher();
  const submit = useSubmit();
  
  // State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTier, setSelectedTier] = useState("all");
  const [modalActive, setModalActive] = useState(false);
  const [syncModalActive, setSyncModalActive] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerData | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditAction, setCreditAction] = useState<"add" | "remove">("add");
  const [syncInProgress, setSyncInProgress] = useState(false);
  
  const isSubmitting = navigation.state === "submitting";
  const isSyncing = fetcher.state === "submitting" || syncInProgress;
  
  // Handle sync
  const handleSync = useCallback(() => {
    setSyncModalActive(true);
  }, []);
  
  const confirmSync = useCallback(() => {
    setSyncInProgress(true);
    const formData = new FormData();
    formData.append("actionType", "syncFromShopify");
    fetcher.submit(formData, { method: "post" });
  }, [fetcher]);
  
  // Handle sync response
  useEffect(() => {
    if (fetcher.data) {
      setSyncInProgress(false);
      setSyncModalActive(false);
    }
  }, [fetcher.data]);
  
  // Filter customers
  const filteredCustomers = customers.filter(customer => {
    const matchesSearch = customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.shopifyCustomerId.includes(searchTerm);
    const matchesTier = selectedTier === "all" || 
      (selectedTier === "none" && !customer.currentTier) ||
      customer.currentTier?.id === selectedTier;
    return matchesSearch && matchesTier;
  });
  
  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };
  
  // Format data for table
  const rows = filteredCustomers.map(customer => [
    <BlockStack gap="050">
      <Text variant="bodyMd" fontWeight="semibold" as="span">
        {customer.email}
      </Text>
      <Text variant="bodySm" tone="subdued" as="span">
        ID: {customer.shopifyCustomerId}
      </Text>
    </BlockStack>,
    customer.currentTier ? (
      <Badge tone="info">
        {`${customer.currentTier.name} (${customer.currentTier.cashbackPercent}%)`}
      </Badge>
    ) : (
      <Text variant="bodyMd" tone="subdued" as="span">No tier</Text>
    ),
    <Text variant="bodyMd" fontWeight={customer.storeCredit > 0 ? "semibold" : undefined} as="span">
      {formatCurrency(customer.storeCredit)}
    </Text>,
    <Text variant="bodyMd" as="span">
      {customer.transactionCount}
    </Text>,
    <InlineStack gap="200">
      <Button
        size="slim"
        onClick={() => {
          setSelectedCustomer(customer);
          setModalActive(true);
        }}
      >
        Adjust Credit
      </Button>
    </InlineStack>
  ]);
  
  // Handle credit adjustment
  const handleCreditAdjustment = () => {
    if (selectedCustomer && creditAmount) {
      const formData = new FormData();
      formData.append("actionType", "adjustCredit");
      formData.append("customerId", selectedCustomer.id);
      formData.append("amount", creditAmount);
      formData.append("creditAction", creditAction);
      submit(formData, { method: "post" });
      setModalActive(false);
      setCreditAmount("");
    }
  };
  
  // Get sync result from fetcher
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
        loading: isSyncing,
        disabled: isSyncing
      }}
    >
      <Layout>
        {/* Success/Error Messages */}
        {(actionData || syncResult) && (
          <Layout.Section>
            <Banner
              tone={(actionData?.success || syncResult?.success) ? "success" : "critical"}
              onDismiss={() => {}}
            >
              {actionData && actionData.success && "message" in actionData ? actionData.message : ""}
              {actionData && !actionData.success && "error" in actionData ? actionData.error : ""}
              {syncResult?.message}
              {syncResult?.errors && (
                <BlockStack gap="100">
                  {syncResult.errors.map((error, i) => (
                    <Text key={i} variant="bodySm" as="p">• {error}</Text>
                  ))}
                </BlockStack>
              )}
            </Banner>
          </Layout.Section>
        )}
        
        {/* Statistics Cards */}
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
                  {stats.customersWithCredit}
                </Text>
                <Text variant="bodySm" tone="subdued" as="p">
                  Have Store Credit
                </Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>
        
        {/* Customers Table */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              {/* Filters */}
              <InlineGrid columns={2} gap="400">
                <TextField
                  label="Search customers"
                  value={searchTerm}
                  onChange={setSearchTerm}
                  placeholder="Email or customer ID..."
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={() => setSearchTerm("")}
                />
                <Select
                  label="Filter by tier"
                  options={[
                    { label: "All customers", value: "all" },
                    { label: "No tier", value: "none" },
                    ...tiers.map(tier => ({
                      label: `${tier.name} (${tier.cashbackPercent}%)`,
                      value: tier.id
                    }))
                  ]}
                  value={selectedTier}
                  onChange={setSelectedTier}
                />
              </InlineGrid>
              
              {/* Data Table */}
              {filteredCustomers.length > 0 ? (
                <DataTable
                  columnContentTypes={["text", "text", "numeric", "numeric", "text"]}
                  headings={["Customer", "Tier", "Store Credit", "Transactions", "Actions"]}
                  rows={rows}
                />
              ) : (
                <EmptyState
                  heading="No customers found"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>
                    {searchTerm || selectedTier !== "all"
                      ? "Try adjusting your filters"
                      : "Sync from Shopify to import customers"}
                  </p>
                </EmptyState>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
      
      {/* Credit Adjustment Modal */}
      <Modal
        open={modalActive}
        onClose={() => setModalActive(false)}
        title={`Adjust Store Credit: ${selectedCustomer?.email}`}
        primaryAction={{
          content: creditAction === "add" ? "Add Credit" : "Remove Credit",
          onAction: handleCreditAdjustment,
          disabled: !creditAmount || parseFloat(creditAmount) <= 0 || isSubmitting,
          loading: isSubmitting
        }}
        secondaryActions={[{
          content: "Cancel",
          onAction: () => setModalActive(false)
        }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text variant="bodyMd" as="p">
              Current balance: {selectedCustomer && formatCurrency(selectedCustomer.storeCredit)}
            </Text>
            <Select
              label="Action"
              options={[
                { label: "Add credit", value: "add" },
                { label: "Remove credit", value: "remove" }
              ]}
              value={creditAction}
              onChange={(value) => setCreditAction(value as "add" | "remove")}
            />
            <TextField
              label="Amount (USD)"
              type="number"
              value={creditAmount}
              onChange={setCreditAmount}
              placeholder="0.00"
              min="0.01"
              step={0.01}
              autoComplete="off"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
      
      {/* Sync Modal */}
      <Modal
        open={syncModalActive}
        onClose={() => !isSyncing && setSyncModalActive(false)}
        title="Sync Customers from Shopify"
        primaryAction={{
          content: "Start Sync",
          onAction: confirmSync,
          loading: isSyncing,
          disabled: isSyncing
        }}
        secondaryActions={!isSyncing ? [{
          content: "Cancel",
          onAction: () => setSyncModalActive(false)
        }] : []}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {isSyncing ? (
              <>
                <Text variant="bodyMd" as="p">
                  Syncing customers from Shopify...
                </Text>
                <ProgressBar progress={75} tone="primary" animated />
                <Text variant="bodySm" tone="subdued" as="p">
                  This may take a few minutes. Please don't close this window.
                </Text>
              </>
            ) : (
              <>
                <Text variant="bodyMd" as="p">
                  This will import all customers from your Shopify store and automatically assign them to loyalty tiers based on their spending.
                </Text>
                <BlockStack gap="200">
                  <Text variant="bodyMd" fontWeight="semibold" as="p">
                    What will happen:
                  </Text>
                  <ul style={{ marginLeft: "20px" }}>
                    <li>Import customers with email addresses</li>
                    <li>Assign tiers based on total spending</li>
                    <li>Update existing customer records</li>
                  </ul>
                </BlockStack>
                {tiers.length === 0 && (
                  <Banner tone="warning">
                    <Text variant="bodyMd" as="p">
                      No tiers found. Create tiers first for automatic assignment.
                    </Text>
                  </Banner>
                )}
              </>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
      
      {/* Loading Overlay */}
      {isSubmitting && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 999
        }}>
          <Spinner size="large" />
        </div>
      )}
    </Page>
  );
}