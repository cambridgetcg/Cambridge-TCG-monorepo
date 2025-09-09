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
      // SECURITY: Always scope to shop to prevent cross-tenant access
      selectedCustomer = await db.customer.findFirst({
        where: {
          id: customerId,
          shop: session.shop // CRITICAL: Prevent cross-tenant access
        }
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
        // SECURITY: Scope tier query to shop
        const tier = selectedCustomer.currentTierId 
          ? await db.tier.findFirst({
              where: { 
                id: selectedCustomer.currentTierId,
                shop: session.shop // CRITICAL: Prevent cross-tenant access
              }
            })
          : null;
        
        // Fetch credit history
        // SECURITY: Scope ledger query to shop
        const ledgerEntries = await db.storeCreditLedger.findMany({
          where: { 
            customerId,
            shop: session.shop // CRITICAL: Prevent cross-tenant access
          },
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
          where: { 
            id: { in: customerTierIds as string[] },
            shop: session.shop // CRITICAL: Prevent cross-tenant access
          }
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
// ACTION - Handle credit adjustments and sync
// ============================================================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  
  const formData = await request.formData();
  const actionType = formData.get("actionType") as string;
  const customerId = formData.get("customerId") as string;
  const amountStr = formData.get("amount") as string || "0";
  const amount = parseFloat(amountStr);
  const reason = formData.get("reason") as string;
  const shopifyCustomerId = formData.get("shopifyCustomerId") as string;
  
  // Input validation for amount
  if (actionType !== "sync") {
    if (isNaN(amount) || !isFinite(amount)) {
      return json({
        success: false,
        error: "Invalid amount provided"
      });
    }
    
    if (amount < 0) {
      return json({
        success: false,
        error: "Amount cannot be negative"
      });
    }
    
    if (amount > 999999.99) {
      return json({
        success: false,
        error: "Amount exceeds maximum allowed value"
      });
    }
    
    // Validate reason for manual adjustments
    if ((actionType === "add" || actionType === "remove") && (!reason || reason.trim().length === 0)) {
      return json({
        success: false,
        error: "Reason is required for manual adjustments"
      });
    }
    
    if (reason && reason.length > 500) {
      return json({
        success: false,
        error: "Reason must be less than 500 characters"
      });
    }
  }
  
  // Handle sync action
  if (actionType === "sync") {
    if (!shopifyCustomerId) {
      return json({
        success: false,
        error: "Shopify Customer ID required for sync"
      });
    }
    
    try {
      // Clean up the customer ID - remove any gid:// prefix if present
      const cleanId = shopifyCustomerId.replace('gid://shopify/Customer/', '').trim();
      
      // Validate the ID is numeric
      if (!/^\d+$/.test(cleanId)) {
        return json({
          success: false,
          error: `Invalid Customer ID format: ${cleanId}. Please use numeric ID only.`
        });
      }
      
      console.log(`[Credit Sync] Starting sync for customer ID: ${cleanId}`);
      
      // GraphQL query to get store credit from Shopify
      const syncQuery = `#graphql
        query SyncCustomerStoreCredit($customerId: ID!) {
          customer(id: $customerId) {
            id
            email
            displayName
            storeCreditAccounts(first: 10) {
              edges {
                node {
                  id
                  balance {
                    amount
                    currencyCode
                  }
                }
              }
              pageInfo {
                hasNextPage
              }
            }
          }
        }
      `;
      
      // Always format as gid:// for GraphQL
      const gidCustomerId = `gid://shopify/Customer/${cleanId}`;
      
      console.log(`[Credit Sync] Querying Shopify with GID: ${gidCustomerId}`);
      
      const response = await admin.graphql(syncQuery, {
        variables: { customerId: gidCustomerId }
      });
      
      const responseJson = await response.json() as any;
      
      console.log(`[Credit Sync] GraphQL Response:`, JSON.stringify(responseJson, null, 2));
      
      if (responseJson.errors) {
        console.error(`[Credit Sync] GraphQL Errors:`, responseJson.errors);
        const errorMessage = responseJson.errors[0]?.message || 'Unknown error';
        return json({
          success: false,
          error: `GraphQL Error: ${errorMessage}. Customer ID used: ${cleanId}`
        });
      }
      
      const shopifyCustomer = responseJson.data?.customer;
      if (!shopifyCustomer) {
        console.error(`[Credit Sync] Customer not found in Shopify for ID: ${cleanId}`);
        return json({
          success: false,
          error: `Customer with ID ${cleanId} not found in Shopify. Please verify the ID is correct.`
        });
      }
      
      console.log(`[Credit Sync] Found customer: ${shopifyCustomer.email || shopifyCustomer.displayName}`);
      
      // Calculate total store credit from all accounts
      let totalStoreCredit = 0;
      const storeCreditAccounts = shopifyCustomer.storeCreditAccounts?.edges || [];
      
      console.log(`[Credit Sync] Found ${storeCreditAccounts.length} store credit account(s)`);
      
      for (const edge of storeCreditAccounts) {
        const balanceStr = edge.node.balance.amount || "0";
        const balance = parseFloat(balanceStr);
        const currency = edge.node.balance.currencyCode;
        
        console.log(`[Credit Sync] Account ${edge.node.id}: ${balanceStr} ${currency}`);
        
        // Validate balance is a valid number
        if (!isNaN(balance) && isFinite(balance) && balance >= 0) {
          totalStoreCredit += balance;
        } else {
          console.warn(`[Credit Sync] Invalid balance value from Shopify: ${balanceStr}`);
        }
      }
      
      console.log(`[Credit Sync] Total store credit: ${totalStoreCredit}`);
      
      // Extract clean Shopify ID (without gid:// prefix)
      const cleanShopifyId = gidCustomerId.replace('gid://shopify/Customer/', '');
      
      // Find or create customer in database
      // First try to find by shopifyCustomerId
      let dbCustomer = await db.customer.findFirst({
        where: {
          shop: session.shop,
          shopifyCustomerId: cleanShopifyId
        }
      });
      
      // If we have a customerId from the form, also try to find by that
      if (!dbCustomer && customerId) {
        dbCustomer = await db.customer.findFirst({
          where: {
            id: customerId,
            shop: session.shop
          }
        });
        
        // If found by ID but missing Shopify Customer ID, update it
        if (dbCustomer && !dbCustomer.shopifyCustomerId) {
          await db.customer.update({
            where: { id: dbCustomer.id },
            data: {
              shopifyCustomerId: cleanShopifyId,
              updatedAt: new Date()
            }
          });
        }
      }
      
      if (!dbCustomer) {
        // Create new customer if doesn't exist
        dbCustomer = await db.customer.create({
          data: {
            id: uuidv4(),
            shop: session.shop,
            shopifyCustomerId: cleanShopifyId,
            email: shopifyCustomer.email || shopifyCustomer.displayName || `customer_${cleanShopifyId}@shop.com`,
            storeCredit: totalStoreCredit,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        });
      } else {
        // Update existing customer
        const previousBalance = parseFloat(dbCustomer.storeCredit.toString());
        
        if (previousBalance !== totalStoreCredit) {
          // Create ledger entry for the sync
          await db.storeCreditLedger.create({
            data: {
              id: uuidv4(),
              customerId: dbCustomer.id,
              shop: session.shop,
              amount: totalStoreCredit - previousBalance,
              balance: totalStoreCredit,
              type: "SHOPIFY_SYNC",
              metadata: {
                previousBalance,
                syncedBalance: totalStoreCredit,
                shopifyAccounts: storeCreditAccounts.length,
                syncedAt: new Date().toISOString()
              },
              createdAt: new Date()
            }
          });
          
          // Update customer balance
          await db.customer.update({
            where: { id: dbCustomer.id },
            data: {
              storeCredit: totalStoreCredit,
              updatedAt: new Date()
            }
          });
        }
      }
      
      console.log(`[Credit Sync] Sync completed successfully for customer ${dbCustomer.id}`);
      
      return json({
        success: true,
        message: `Successfully synced store credit: ${formatCurrency(totalStoreCredit, null)} from ${storeCreditAccounts.length} account(s)`,
        newBalance: totalStoreCredit.toString(),
        customerId: dbCustomer.id
      });
    } catch (error) {
      console.error("[Credit Sync] Error syncing store credit:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return json({
        success: false,
        error: `Failed to sync store credit: ${errorMessage}`
      });
    }
  }
  
  // Handle add/remove actions with Shopify GraphQL
  if (actionType === "add" || actionType === "remove") {
    if (!customerId || amount === 0) {
      return json({
        success: false,
        error: "Invalid input data"
      });
    }
    
    try {
      // Fetch customer from database
      const customer = await db.customer.findFirst({
        where: { 
          id: customerId,
          shop: session.shop // CRITICAL: Prevent cross-tenant access
        }
      });
      
      if (!customer || !customer.shopifyCustomerId) {
        return json({
          success: false,
          error: "Customer not found or missing Shopify ID"
        });
      }
      
      // Get customer's store credit account from Shopify
      const accountQuery = `#graphql
        query GetStoreCreditAccount($customerId: ID!) {
          customer(id: $customerId) {
            id
            storeCreditAccounts(first: 1) {
              edges {
                node {
                  id
                  balance {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
      `;
      
      const gidCustomerId = `gid://shopify/Customer/${customer.shopifyCustomerId}`;
      const accountResponse = await admin.graphql(accountQuery, {
        variables: { customerId: gidCustomerId }
      });
      
      const accountData = await accountResponse.json() as any;
      
      if (accountData.errors) {
        console.error("GraphQL errors:", accountData.errors);
        return json({
          success: false,
          error: "Failed to fetch store credit account from Shopify"
        });
      }
      
      const storeCreditAccount = accountData.data?.customer?.storeCreditAccounts?.edges?.[0]?.node;
      
      if (!storeCreditAccount) {
        return json({
          success: false,
          error: "Customer does not have a store credit account in Shopify. Please create one first."
        });
      }
      
      // Get shop settings for currency
      const shopSettings = await db.shopSettings.findUnique({
        where: { shop: session.shop }
      });
      
      const currency = shopSettings?.storeCurrency || "USD";
      
      // Perform the credit/debit operation in Shopify
      if (actionType === "add") {
        // Add credit using storeCreditAccountCredit mutation
        const creditMutation = `#graphql
          mutation storeCreditAccountCredit($id: ID!, $creditInput: StoreCreditAccountCreditInput!) {
            storeCreditAccountCredit(id: $id, creditInput: $creditInput) {
              storeCreditAccountTransaction {
                amount {
                  amount
                  currencyCode
                }
                account {
                  id
                  balance {
                    amount
                    currencyCode
                  }
                }
              }
              userErrors {
                message
                field
              }
            }
          }
        `;
        
        const creditResponse = await admin.graphql(creditMutation, {
          variables: {
            id: gidCustomerId,
            creditInput: {
              creditAmount: {
                amount: amount.toFixed(2),
                currencyCode: currency
              }
            }
          }
        });
        
        const creditData = await creditResponse.json() as any;
        
        if (creditData.data?.storeCreditAccountCredit?.userErrors?.length > 0) {
          const errors = creditData.data.storeCreditAccountCredit.userErrors;
          console.error("Credit mutation errors:", errors);
          return json({
            success: false,
            error: errors[0].message || "Failed to add store credit"
          });
        }
        
        const newBalance = parseFloat(creditData.data?.storeCreditAccountCredit?.storeCreditAccountTransaction?.account?.balance?.amount || "0");
        
        // Update local database
        await db.storeCreditLedger.create({
          data: {
            id: uuidv4(),
            customerId,
            shop: session.shop,
            amount: amount,
            balance: newBalance,
            type: "MANUAL_ADJUSTMENT",
            metadata: {
              reason,
              adjustedBy: "admin",
              shopifyAccountId: storeCreditAccount.id,
              timestamp: new Date().toISOString()
            },
            createdAt: new Date()
          }
        });
        
        await db.customer.update({
          where: { id: customerId },
          data: {
            storeCredit: newBalance,
            updatedAt: new Date()
          }
        });
        
        return json({
          success: true,
          message: `Successfully added ${formatCurrency(amount, shopSettings)} to store credit`,
          newBalance: newBalance.toString()
        });
        
      } else {
        // Remove credit using storeCreditAccountDebit mutation
        const debitMutation = `#graphql
          mutation storeCreditAccountDebit($id: ID!, $debitInput: StoreCreditAccountDebitInput!) {
            storeCreditAccountDebit(id: $id, debitInput: $debitInput) {
              storeCreditAccountTransaction {
                amount {
                  amount
                  currencyCode
                }
                account {
                  id
                  balance {
                    amount
                    currencyCode
                  }
                }
              }
              userErrors {
                message
                field
              }
            }
          }
        `;
        
        const debitResponse = await admin.graphql(debitMutation, {
          variables: {
            id: storeCreditAccount.id,
            debitInput: {
              debitAmount: {
                amount: amount.toFixed(2),
                currencyCode: currency
              }
            }
          }
        });
        
        const debitData = await debitResponse.json() as any;
        
        if (debitData.data?.storeCreditAccountDebit?.userErrors?.length > 0) {
          const errors = debitData.data.storeCreditAccountDebit.userErrors;
          console.error("Debit mutation errors:", errors);
          return json({
            success: false,
            error: errors[0].message || "Failed to remove store credit"
          });
        }
        
        const newBalance = parseFloat(debitData.data?.storeCreditAccountDebit?.storeCreditAccountTransaction?.account?.balance?.amount || "0");
        
        // Update local database
        await db.storeCreditLedger.create({
          data: {
            id: uuidv4(),
            customerId,
            shop: session.shop,
            amount: -amount,
            balance: newBalance,
            type: "MANUAL_ADJUSTMENT",
            metadata: {
              reason,
              adjustedBy: "admin",
              shopifyAccountId: storeCreditAccount.id,
              timestamp: new Date().toISOString()
            },
            createdAt: new Date()
          }
        });
        
        await db.customer.update({
          where: { id: customerId },
          data: {
            storeCredit: newBalance,
            updatedAt: new Date()
          }
        });
        
        return json({
          success: true,
          message: `Successfully removed ${formatCurrency(amount, shopSettings)} from store credit`,
          newBalance: newBalance.toString()
        });
      }
      
    } catch (error) {
      console.error("Error adjusting credit:", error);
      return json({
        success: false,
        error: "Failed to adjust store credit: " + (error instanceof Error ? error.message : "Unknown error")
      });
    }
  }
  
  // If we get here, action type was not recognized
  return json({
    success: false,
    error: "Invalid action type"
  });
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
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncCustomerId, setSyncCustomerId] = useState("");
  
  const isLoading = navigation.state === "submitting" || navigation.state === "loading";
  const isSyncing = navigation.state === "submitting" && navigation.formData?.get("actionType") === "sync";
  
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
  
  // Handle sync modal
  const handleOpenSyncModal = useCallback(() => {
    // Use the Shopify Customer ID from the selected customer
    // If not available, allow manual entry
    if (selectedCustomer?.shopifyCustomerId) {
      // Ensure we don't have the gid:// prefix for display
      const cleanId = selectedCustomer.shopifyCustomerId.replace('gid://shopify/Customer/', '');
      setSyncCustomerId(cleanId);
    } else {
      setSyncCustomerId("");
    }
    setShowSyncModal(true);
  }, [selectedCustomer]);
  
  const handleCloseSyncModal = useCallback(() => {
    setShowSyncModal(false);
    setSyncCustomerId("");
  }, []);
  
  const handleSubmitSync = useCallback(() => {
    if (!syncCustomerId) return;
    
    const formData = new FormData();
    formData.append("actionType", "sync");
    // Pass the clean ID without gid:// prefix
    const cleanId = syncCustomerId.replace('gid://shopify/Customer/', '');
    formData.append("shopifyCustomerId", cleanId);
    
    // Also pass the database customer ID if available
    if (selectedCustomer?.id) {
      formData.append("customerId", selectedCustomer.id);
    }
    
    submit(formData, { method: "post" });
    handleCloseSyncModal();
  }, [syncCustomerId, selectedCustomer, submit, handleCloseSyncModal]);
  
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
              title={actionData.success 
                ? (navigation.formData?.get("actionType") === "sync" 
                  ? "Store credit synced successfully" 
                  : "Credit adjusted successfully")
                : "Operation failed"}
              tone={actionData.success ? "success" : "critical"}
              onDismiss={() => {}}
            >
              {actionData.success ? (
                <Text as="p">{(actionData as any).message}</Text>
              ) : (
                <Text as="p">{(actionData as any).error}</Text>
              )}
              {actionData.success && (actionData as any).customerId && (
                <Text as="p">
                  <Button
                    onClick={() => handleSelectCustomer((actionData as any).customerId)}
                    size="slim"
                    variant="plain"
                  >
                    View customer details
                  </Button>
                </Text>
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
                    <Button
                      icon={RefreshIcon}
                      onClick={handleOpenSyncModal}
                      loading={isSyncing}
                    >
                      Sync from Shopify
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
      
      {/* Sync Modal */}
      <Modal
        open={showSyncModal}
        onClose={handleCloseSyncModal}
        title="Sync Store Credit from Shopify"
        primaryAction={{
          content: "Sync Credit",
          onAction: handleSubmitSync,
          disabled: !syncCustomerId,
          loading: isSyncing
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: handleCloseSyncModal
          }
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="Shopify Customer ID"
              value={syncCustomerId}
              onChange={setSyncCustomerId}
              placeholder="e.g., 9224704164179"
              helpText="Enter the numeric Shopify Customer ID (without gid:// prefix)"
              autoComplete="off"
            />
            <Banner tone="info">
              <Text as="p">
                This will fetch the current store credit balance from Shopify and update the local database.
              </Text>
              <Text as="p">
                If the customer doesn't exist locally, they will be created.
              </Text>
            </Banner>
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