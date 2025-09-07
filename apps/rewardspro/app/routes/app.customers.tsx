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
  ProgressBar,
  Box
} from "@shopify/polaris";
import { 
  RefreshIcon
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { createCustomerSyncServiceV2 } from "../services/customer-sync-v2.service";
import type { SyncProgress } from "../services/customer-sync-v2.service";

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
      const startTime = Date.now();
      
      // Check for tiers first
      const tiersCount = await db.tier.count({
        where: { shop }
      });
      
      if (tiersCount === 0) {
        return json({ 
          success: false, 
          error: "Please create loyalty tiers before syncing customers" 
        });
      }

      // Create sync service V2 instance
      const syncService = await createCustomerSyncServiceV2(admin as any, shop, {
        batchSize: 50
      });

      // Run the sync
      const syncResult = await syncService.syncAllCustomers();
      
      // Return detailed result
      const endTime = Date.now();
      return json({
        success: syncResult.success,
        message: syncResult.message,
        syncedCount: syncResult.successful,
        processedCount: syncResult.processed,
        skippedCount: 0,
        totalCustomers: syncResult.processed,
        errors: syncResult.errors.length > 0 
          ? syncResult.errors.slice(0, 10) // Limit to 10 errors
          : null,
        duration: endTime - startTime
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
    skippedCount?: number;
    totalCustomers?: number;
    message?: string;
    errors?: string[];
    duration?: number;
  } | undefined;
  
  // Calculate sync progress percentage
  const syncProgress = syncResult && syncResult.processedCount && syncResult.totalCustomers
    ? Math.round((syncResult.processedCount / syncResult.totalCustomers) * 100)
    : 0;
  
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
              {syncResult?.syncedCount !== undefined && (
                <BlockStack gap="050">
                  <Text variant="bodySm" as="p">
                    • Synced: {syncResult.syncedCount} customers
                  </Text>
                  {syncResult.skippedCount !== undefined && syncResult.skippedCount > 0 && (
                    <Text variant="bodySm" as="p">
                      • Skipped: {syncResult.skippedCount} customers
                    </Text>
                  )}
                  {syncResult.totalCustomers !== undefined && (
                    <Text variant="bodySm" as="p">
                      • Total processed: {syncResult.processedCount} / {syncResult.totalCustomers}
                    </Text>
                  )}
                  {syncResult.duration !== undefined && (
                    <Text variant="bodySm" as="p">
                      • Duration: {(syncResult.duration / 1000).toFixed(1)} seconds
                    </Text>
                  )}
                </BlockStack>
              )}
              {syncResult?.errors && (
                <BlockStack gap="100">
                  <Text variant="bodySm" fontWeight="semibold" as="p">Errors encountered:</Text>
                  {syncResult.errors.map((error, i) => (
                    <Box key={i} padding="200" background="bg-surface-critical" borderRadius="200">
                      <Text variant="bodySm" tone="critical" as="p" breakWord>
                        {error}
                      </Text>
                    </Box>
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
          content: isSyncing ? "Syncing..." : "Start Sync",
          onAction: confirmSync,
          loading: isSyncing,
          disabled: isSyncing || tiers.length === 0
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
                <InlineStack align="space-between">
                  <Text variant="bodyMd" as="p">
                    Syncing customers from Shopify...
                  </Text>
                  <Spinner size="small" />
                </InlineStack>
                <ProgressBar progress={syncProgress || 75} tone="primary" animated />
                <InlineGrid columns={2} gap="400">
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued" as="p">
                      Processing batch data
                    </Text>
                    <Text variant="bodyMd" fontWeight="semibold" as="p">
                      Please wait...
                    </Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued" as="p">
                      Estimated time
                    </Text>
                    <Text variant="bodyMd" fontWeight="semibold" as="p">
                      1-3 minutes
                    </Text>
                  </BlockStack>
                </InlineGrid>
                <Banner tone="info">
                  <Text variant="bodySm" as="p">
                    This process runs in the background. Please don't close this window until complete.
                  </Text>
                </Banner>
              </>
            ) : (
              <>
                <Banner tone="info">
                  <Text variant="bodyMd" as="p">
                    Import all customers from your Shopify store and automatically assign loyalty tiers based on their total spending.
                  </Text>
                </Banner>
                
                <BlockStack gap="200">
                  <Text variant="bodyMd" fontWeight="semibold" as="p">
                    Sync Process Details:
                  </Text>
                  <BlockStack gap="050">
                    <InlineStack gap="100" align="start">
                      <Badge tone="success">✓</Badge>
                      <Text variant="bodySm" as="span">Import customers with valid email addresses</Text>
                    </InlineStack>
                    <InlineStack gap="100" align="start">
                      <Badge tone="success">✓</Badge>
                      <Text variant="bodySm" as="span">Automatically assign tiers based on lifetime spending</Text>
                    </InlineStack>
                    <InlineStack gap="100" align="start">
                      <Badge tone="success">✓</Badge>
                      <Text variant="bodySm" as="span">Update existing customer records without duplicates</Text>
                    </InlineStack>
                    <InlineStack gap="100" align="start">
                      <Badge tone="info">✓</Badge>
                      <Text variant="bodySm" as="span">Store customer metadata and marketing preferences</Text>
                    </InlineStack>
                    <InlineStack gap="100" align="start">
                      <Badge tone="attention">!</Badge>
                      <Text variant="bodySm" as="span">Skip disabled or invited customers</Text>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>

                {tiers.length === 0 ? (
                  <Banner tone="critical">
                    <Text variant="bodyMd" as="p">
                      No tiers found! Please create loyalty tiers first for automatic tier assignment during sync.
                    </Text>
                  </Banner>
                ) : (
                  <Card>
                    <BlockStack gap="200">
                      <Text variant="bodySm" fontWeight="semibold" as="p">
                        Available Tiers ({tiers.length}):
                      </Text>
                      <BlockStack gap="050">
                        {tiers.slice(0, 3).map(tier => (
                          <InlineStack key={tier.id} gap="200" align="space-between">
                            <Text variant="bodySm" as="span">{tier.name}</Text>
                            <Badge tone="info">
                              {`Min: ${formatCurrency(tier.minSpend)} | ${tier.cashbackPercent}% cashback`}
                            </Badge>
                          </InlineStack>
                        ))}
                        {tiers.length > 3 && (
                          <Text variant="bodySm" tone="subdued" as="span">
                            ...and {tiers.length - 3} more
                          </Text>
                        )}
                      </BlockStack>
                    </BlockStack>
                  </Card>
                )}

                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" as="p">
                    <strong>Note:</strong> The sync process may take several minutes depending on the number of customers in your store.
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    Rate limits are automatically handled to ensure smooth operation.
                  </Text>
                </BlockStack>
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