import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, useNavigation, useSubmit, useSearchParams, Form } from "@remix-run/react";
import { useState, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  TextField,
  Select,
  Button,
  Modal,
  FormLayout,
  Banner,
  InlineStack,
  BlockStack,
  Text,
  Badge,
  Box,
  Icon,
  Divider,
  EmptyState,
  DataTable,
  Thumbnail,
} from "@shopify/polaris";
import {
  SearchIcon,
  CashDollarIcon,
  PlusCircleIcon,
  MinusCircleIcon,
  RefreshIcon,
  ClockIcon,
  ReceiptRefundIcon,
  EditIcon,
  PersonIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { formatCurrency } from "../utils/currency";
import { v4 as uuidv4 } from "uuid";
import type { LedgerEntryType } from "@prisma/client";

// ============================================================================
// TYPES
// ============================================================================

interface Customer {
  id: string;
  email: string;
  shopifyCustomerId: string;
  storeCredit: string;
  currentTier: {
    name: string;
    cashbackPercent: number;
  } | null;
}

interface CreditTransaction {
  id: string;
  amount: string;
  balance: string;
  type: LedgerEntryType;
  metadata: any;
  createdAt: string;
}

// ============================================================================
// LOADER - Fetch customers and credit data
// ============================================================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get('search') || '';
  const customerId = url.searchParams.get('customerId');
  
  try {
    // Fetch shop settings for currency formatting
    const shopSettings = await db.shopSettings.findUnique({
      where: { shop: session.shop }
    });
    
    let selectedCustomer = null;
    let creditHistory: CreditTransaction[] = [];
    
    // If a customer is selected, fetch their details and credit history
    if (customerId) {
      // Try to find by database ID first
      selectedCustomer = await db.customer.findUnique({
        where: { id: customerId }
      });
      
      // If not found by database ID, try by Shopify customer ID
      if (!selectedCustomer && customerId) {
        selectedCustomer = await db.customer.findFirst({
          where: {
            shop: session.shop,
            shopifyCustomerId: customerId
          }
        });
      }
      
      if (selectedCustomer) {
        // Fetch tier separately (Data API doesn't support includes)
        const tier = selectedCustomer.currentTierId 
          ? await db.tier.findUnique({
              where: { id: selectedCustomer.currentTierId }
            })
          : null;
        
        // Fetch credit history
        const ledgerEntries = await db.storeCreditLedger.findMany({
          where: { customerId },
          orderBy: { createdAt: 'desc' },
          take: 50 // Last 50 transactions
        });
        
        creditHistory = ledgerEntries.map(entry => ({
          id: entry.id,
          amount: entry.amount.toString(),
          balance: entry.balance.toString(),
          type: entry.type,
          metadata: entry.metadata,
          createdAt: entry.createdAt.toISOString()
        }));
        
        selectedCustomer = {
          ...selectedCustomer,
          storeCredit: selectedCustomer.storeCredit.toString(),
          currentTier: tier ? {
            name: tier.name,
            cashbackPercent: tier.cashbackPercent
          } : null
        };
      }
    }
    
    // Fetch customers for search
    let customers = await db.customer.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    
    // Filter by search in memory (Data API limitations)
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      customers = customers.filter(customer => 
        customer.email.toLowerCase().includes(searchLower) ||
        customer.shopifyCustomerId.toLowerCase().includes(searchLower) ||
        customer.id.toLowerCase().includes(searchLower)
      );
    }
    
    // Fetch tiers for customers
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
    const formattedCustomers: Customer[] = customers.map(customer => {
      const tier = customer.currentTierId ? tierMap.get(customer.currentTierId) : null;
      return {
        id: customer.id,
        email: customer.email,
        shopifyCustomerId: customer.shopifyCustomerId,
        storeCredit: customer.storeCredit.toString(),
        currentTier: tier ? {
          name: tier.name,
          cashbackPercent: tier.cashbackPercent
        } : null
      };
    });
    
    return json({
      customers: formattedCustomers,
      selectedCustomer,
      creditHistory,
      searchQuery,
      shopSettings: shopSettings ? {
        storeCurrency: shopSettings.storeCurrency,
        currencyDisplayType: shopSettings.currencyDisplayType
      } : null
    });
  } catch (error) {
    console.error("Error loading credit management:", error);
    return json({
      customers: [],
      selectedCustomer: null,
      creditHistory: [],
      searchQuery: '',
      shopSettings: null
    });
  }
};

// ============================================================================
// ACTION - Handle credit adjustments
// ============================================================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  const formData = await request.formData();
  const actionType = formData.get("actionType") as string;
  const customerId = formData.get("customerId") as string;
  const amount = parseFloat(formData.get("amount") as string);
  const reason = formData.get("reason") as string;
  
  if (!customerId || isNaN(amount) || amount === 0) {
    return json({
      success: false,
      error: "Invalid input data"
    });
  }
  
  try {
    // Fetch customer
    const customer = await db.customer.findUnique({
      where: { id: customerId }
    });
    
    if (!customer) {
      return json({
        success: false,
        error: "Customer not found"
      });
    }
    
    // Calculate new balance
    const currentBalance = parseFloat(customer.storeCredit.toString());
    const adjustmentAmount = actionType === "add" ? Math.abs(amount) : -Math.abs(amount);
    const newBalance = currentBalance + adjustmentAmount;
    
    // Don't allow negative balance
    if (newBalance < 0) {
      return json({
        success: false,
        error: "Insufficient store credit balance"
      });
    }
    
    // Create ledger entry
    const ledgerEntry = await db.storeCreditLedger.create({
      data: {
        id: uuidv4(),
        customerId,
        shop: session.shop,
        amount: adjustmentAmount,
        balance: newBalance,
        type: "MANUAL_ADJUSTMENT",
        metadata: {
          reason,
          adjustedBy: "admin",
          timestamp: new Date().toISOString()
        },
        createdAt: new Date()
      }
    });
    
    // Update customer balance
    await db.customer.update({
      where: { id: customerId },
      data: {
        storeCredit: newBalance,
        updatedAt: new Date()
      }
    });
    
    return json({
      success: true,
      message: `Successfully ${actionType === "add" ? "added" : "removed"} ${formatCurrency(Math.abs(amount), null)} ${actionType === "add" ? "to" : "from"} store credit`,
      newBalance: newBalance.toString()
    });
  } catch (error) {
    console.error("Error adjusting credit:", error);
    return json({
      success: false,
      error: "Failed to adjust store credit"
    });
  }
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function CreditManagement() {
  const { customers, selectedCustomer, creditHistory, searchQuery, shopSettings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [searchValue, setSearchValue] = useState(searchQuery);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustmentType, setAdjustmentType] = useState<"add" | "remove">("add");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [quickTestMode, setQuickTestMode] = useState(false);
  const [quickTestId, setQuickTestId] = useState("");
  
  const isLoading = navigation.state === "submitting" || navigation.state === "loading";
  
  // Handle customer search
  const handleSearch = useCallback((value: string) => {
    setSearchValue(value);
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set('search', value);
    } else {
      newParams.delete('search');
    }
    // Keep customerId if present
    if (searchParams.get('customerId')) {
      newParams.set('customerId', searchParams.get('customerId')!);
    }
    setSearchParams(newParams);
  }, [searchParams, setSearchParams]);
  
  // Handle customer selection
  const handleSelectCustomer = useCallback((customerId: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('customerId', customerId);
    setSearchParams(newParams);
  }, [searchParams, setSearchParams]);
  
  // Handle quick test - load customer by Shopify ID directly
  const handleQuickTest = useCallback(() => {
    if (!quickTestId.trim()) return;
    
    // Find customer by Shopify ID in current list
    const customer = customers.find(c => 
      c.shopifyCustomerId === quickTestId || 
      c.id === quickTestId
    );
    
    if (customer) {
      // Found the customer, select them
      handleSelectCustomer(customer.id);
      setQuickTestMode(false);
      setQuickTestId("");
    } else {
      // Try to load directly by ID
      const newParams = new URLSearchParams(searchParams);
      newParams.set('customerId', quickTestId);
      newParams.set('search', quickTestId);
      setSearchParams(newParams);
      // Keep in quick test mode to show if customer not found
    }
  }, [quickTestId, customers, handleSelectCustomer, searchParams, setSearchParams]);
  
  // Handle adjustment modal
  const handleOpenAdjustModal = useCallback((type: "add" | "remove") => {
    setAdjustmentType(type);
    setAdjustmentAmount("");
    setAdjustmentReason("");
    setShowAdjustModal(true);
  }, []);
  
  const handleCloseAdjustModal = useCallback(() => {
    setShowAdjustModal(false);
    setAdjustmentAmount("");
    setAdjustmentReason("");
  }, []);
  
  const handleSubmitAdjustment = useCallback(() => {
    if (!selectedCustomer || !adjustmentAmount || !adjustmentReason) return;
    
    const formData = new FormData();
    formData.append("actionType", adjustmentType);
    formData.append("customerId", selectedCustomer.id);
    formData.append("amount", adjustmentAmount);
    formData.append("reason", adjustmentReason);
    
    submit(formData, { method: "post" });
    handleCloseAdjustModal();
  }, [selectedCustomer, adjustmentType, adjustmentAmount, adjustmentReason, submit, handleCloseAdjustModal]);
  
  // Format currency helper
  const formatAmount = (amount: number | string) => {
    return formatCurrency(amount, shopSettings as any);
  };
  
  // Get transaction type badge
  const getTransactionBadge = (type: LedgerEntryType) => {
    switch (type) {
      case "CASHBACK_EARNED":
        return <Badge tone="success">Cashback</Badge>;
      case "ORDER_PAYMENT":
        return <Badge tone="info">Payment</Badge>;
      case "REFUND_CREDIT":
        return <Badge tone="attention">Refund</Badge>;
      case "MANUAL_ADJUSTMENT":
        return <Badge>Manual</Badge>;
      case "SHOPIFY_SYNC":
        return <Badge tone="info">Sync</Badge>;
      default:
        return <Badge>{type}</Badge>;
    }
  };
  
  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };
  
  return (
    <Page
      title="Credit Management"
      subtitle="Manage customer store credit balances"
      backAction={{ url: "/app" }}
    >
      <Layout>
        {/* Action Result Banner */}
        {actionData && (
          <Layout.Section>
            <Banner
              title={actionData.success ? "Credit adjusted successfully" : "Failed to adjust credit"}
              tone={actionData.success ? "success" : "critical"}
              onDismiss={() => {}}
            >
              {actionData.success ? (
                <Text as="p">{(actionData as any).message}</Text>
              ) : (
                <Text as="p">{(actionData as any).error}</Text>
              )}
            </Banner>
          </Layout.Section>
        )}
        
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              {/* Toggle between search and quick test modes */}
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h3">
                  {quickTestMode ? "Quick Test Mode" : "Customer Search"}
                </Text>
                <Button
                  onClick={() => {
                    setQuickTestMode(!quickTestMode);
                    setQuickTestId("");
                  }}
                  size="slim"
                >
                  {quickTestMode ? "Switch to Search" : "Quick Test Mode"}
                </Button>
              </InlineStack>
              
              {/* Quick Test Mode - Direct ID Input */}
              {quickTestMode ? (
                <BlockStack gap="300">
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    if (quickTestId.trim()) {
                      handleQuickTest();
                    }
                  }}>
                    <InlineStack gap="200">
                      <div style={{ flex: 1 }}>
                        <TextField
                          label="Enter Customer ID"
                          value={quickTestId}
                          onChange={setQuickTestId}
                          placeholder="e.g., 7123456789012 or uuid"
                          helpText="Enter Shopify Customer ID or Database UUID (press Enter to load)"
                          autoComplete="off"
                        />
                      </div>
                      <Button
                        submit
                        variant="primary"
                        disabled={!quickTestId.trim()}
                      >
                        Load Customer
                      </Button>
                    </InlineStack>
                  </form>
                  
                  {/* Show help text if customer not found */}
                  {quickTestId && !selectedCustomer && customers.length === 0 && (
                    <Banner tone="warning">
                      <Text as="p">
                        Customer with ID "{quickTestId}" not found. This could mean:
                      </Text>
                      <ul style={{ marginTop: "8px", marginBottom: 0 }}>
                        <li>The customer doesn't exist in the database yet</li>
                        <li>You need to sync customers from Shopify first</li>
                        <li>The ID format might be incorrect</li>
                      </ul>
                    </Banner>
                  )}
                </BlockStack>
              ) : (
                /* Regular Search Mode */
                <TextField
                  label="Search customers"
                  value={searchValue}
                  onChange={handleSearch}
                  clearButton
                  onClearButtonClick={() => handleSearch("")}
                  prefix={<Icon source={SearchIcon} />}
                  placeholder="Search by email or customer ID"
                  autoComplete="off"
                />
              )}
              
              {/* Customer List - Only show in search mode */}
              {!quickTestMode && customers.length > 0 ? (
                <div style={{ maxHeight: "200px", overflowY: "scroll" }}>
                  <BlockStack gap="100">
                    {customers.map(customer => (
                      <div
                        key={customer.id}
                        onClick={() => handleSelectCustomer(customer.id)}
                        style={{ cursor: "pointer" }}
                      >
                        <Box
                          padding="200"
                          background={selectedCustomer?.id === customer.id ? "bg-surface-selected" : "bg-surface"}
                          borderRadius="100"
                        >
                        <InlineStack align="space-between">
                          <InlineStack gap="200">
                            <Icon source={PersonIcon} />
                            <BlockStack gap="0">
                              <Text variant="bodyMd" fontWeight="semibold" as="span">
                                {customer.email}
                              </Text>
                              <Text variant="bodySm" tone="subdued" as="span">
                                ID: {customer.shopifyCustomerId}
                              </Text>
                            </BlockStack>
                          </InlineStack>
                          <Badge tone="success">
                            {formatAmount(customer.storeCredit)}
                          </Badge>
                        </InlineStack>
                        </Box>
                      </div>
                    ))}
                  </BlockStack>
                </div>
              ) : !quickTestMode ? (
                <EmptyState
                  heading="No customers found"
                  image="https://cdn.shopify.com/s/files/1/0583/8520/4949/files/empty-state.svg"
                >
                  <p>Try adjusting your search or sync customers from Shopify.</p>
                </EmptyState>
              ) : null}
            </BlockStack>
          </Card>
        </Layout.Section>
        
        {/* Selected Customer Details */}
        {selectedCustomer && (
          <>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <BlockStack gap="200">
                      <Text variant="headingLg" as="h2">
                        {selectedCustomer.email}
                      </Text>
                      <InlineStack gap="200">
                        <Badge>{`ID: ${selectedCustomer.shopifyCustomerId}`}</Badge>
                        {selectedCustomer.currentTier && (
                          <Badge tone="info">
                            {`${selectedCustomer.currentTier.name} (${selectedCustomer.currentTier.cashbackPercent}% cashback)`}
                          </Badge>
                        )}
                      </InlineStack>
                    </BlockStack>
                    
                    <Box>
                      <BlockStack gap="200" align="end">
                        <Text variant="headingXl" as="h3">
                          {formatAmount(selectedCustomer.storeCredit)}
                        </Text>
                        <Text variant="bodySm" tone="subdued" as="p">
                          Current Balance
                        </Text>
                      </BlockStack>
                    </Box>
                  </InlineStack>
                  
                  <Divider />
                  
                  {/* Action Buttons */}
                  <InlineStack gap="200">
                    <Button
                      icon={PlusCircleIcon}
                      onClick={() => handleOpenAdjustModal("add")}
                      variant="primary"
                    >
                      Add Credit
                    </Button>
                    <Button
                      icon={MinusCircleIcon}
                      onClick={() => handleOpenAdjustModal("remove")}
                      tone="critical"
                    >
                      Remove Credit
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Layout.Section>
            
            {/* Credit History */}
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h3">
                    Transaction History
                  </Text>
                  
                  {creditHistory.length > 0 ? (
                    <DataTable
                      columnContentTypes={["text", "text", "numeric", "numeric", "text"]}
                      headings={[
                        "Date",
                        "Type",
                        "Amount",
                        "Balance",
                        "Details"
                      ]}
                      rows={creditHistory.map(transaction => [
                        formatDate(transaction.createdAt),
                        getTransactionBadge(transaction.type),
                        <Text 
                          variant="bodyMd" 
                          tone={parseFloat(transaction.amount) > 0 ? "success" : "critical"}
                          as="span"
                        >
                          {parseFloat(transaction.amount) > 0 ? "+" : ""}{formatAmount(transaction.amount)}
                        </Text>,
                        formatAmount(transaction.balance),
                        transaction.metadata?.reason || transaction.metadata?.description || "-"
                      ])}
                    />
                  ) : (
                    <EmptyState
                      heading="No transactions yet"
                      image="https://cdn.shopify.com/s/files/1/0583/8520/4949/files/empty-state.svg"
                    >
                      <p>Credit transactions will appear here.</p>
                    </EmptyState>
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>
          </>
        )}
      </Layout>
      
      {/* Adjustment Modal */}
      <Modal
        open={showAdjustModal}
        onClose={handleCloseAdjustModal}
        title={`${adjustmentType === "add" ? "Add" : "Remove"} Store Credit`}
        primaryAction={{
          content: adjustmentType === "add" ? "Add Credit" : "Remove Credit",
          onAction: handleSubmitAdjustment,
          disabled: !adjustmentAmount || !adjustmentReason || parseFloat(adjustmentAmount) <= 0,
          destructive: adjustmentType === "remove"
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: handleCloseAdjustModal
          }
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="Amount"
              type="number"
              value={adjustmentAmount}
              onChange={setAdjustmentAmount}
              prefix={getCurrencySymbol(shopSettings?.storeCurrency || "USD")}
              placeholder="0.00"
              min={0.01}
              step={0.01}
              autoComplete="off"
            />
            <TextField
              label="Reason"
              value={adjustmentReason}
              onChange={setAdjustmentReason}
              placeholder="e.g., Customer service compensation, Promotional credit"
              multiline={3}
              autoComplete="off"
            />
            {adjustmentType === "remove" && selectedCustomer && (
              <Banner tone="warning">
                <Text as="p">
                  Current balance: {formatAmount(selectedCustomer.storeCredit)}
                </Text>
                {parseFloat(adjustmentAmount) > parseFloat(selectedCustomer.storeCredit) && (
                  <Text as="p" tone="critical">
                    Amount exceeds current balance!
                  </Text>
                )}
              </Banner>
            )}
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

// Helper function to get currency symbol
function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    CAD: "C$",
    AUD: "A$",
    JPY: "¥",
    // Add more as needed
  };
  return symbols[currency] || "$";
}