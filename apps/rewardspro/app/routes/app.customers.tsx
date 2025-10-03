import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useFetcher, useActionData, useSearchParams } from "@remix-run/react";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import * as crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  useIndexResourceState,
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
  Popover,
  ActionList,
  SkeletonDisplayText,
  Toast,
  Frame,
  FormLayout,
  Checkbox,
  ChoiceList,
} from "@shopify/polaris";
import { MenuHorizontalIcon } from "@shopify/polaris-icons";
import {
  SearchIcon,
  PersonIcon,
  RefreshIcon,
  ChartVerticalIcon,
  RewardIcon,
  CashDollarIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  InfoIcon,
  StarIcon,
  CheckIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  PlusIcon,
  EditIcon,
  DeleteIcon,
  CalendarIcon,
  ImportIcon,
} from "~/utils/polaris-icons";
import {
  MetricCard,
  CustomerCard,
  TierProgressCard,
  LoadingSkeleton,
} from "../components/DesignSystem";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { formatCurrency } from "../utils/currency";
import { 
  calculateCustomerTier, 
  calculateTiersForCustomers,
  calculateAllCustomerTiers 
} from "../services/tier-calculation.server";
import {
  assignCustomerToTier,
  hasManualOverride,
  getTierHistory
} from "../services/manual-tier-assignment.server";
import { checkTierMembershipExpiry } from "../services/tier-product-purchase.server";
import { CustomerDetailModal } from "../components/CustomerDetailModal";
import { TierBadge } from "../components/TierBadge";
import { StoreCreditDisplay } from "../components/StoreCredit";
import { 
  getTierStyle, 
  formatTierName,
  getTierEmoji,
  getTierGradientCSS,
  getTierTextColor
} from "../utils/tier-styles";

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
  hasManualOverride?: boolean;
  lastTierChange?: {
    triggerType: string;
    createdAt: string;
    note?: string;
  } | null;
  membershipStatus?: {
    isPurchased: boolean;
    needsRenewal: boolean;
    expiresAt: string | null;
    daysRemaining: number | null;
  };
}

interface LoaderData {
  customers: Customer[];
  tiers: Array<{
    id: string;
    name: string;
    minSpend: number;
    cashbackPercent: number;
    evaluationPeriod: "ANNUAL" | "LIFETIME";
    createdAt: string;
  }>;
  shopSettings: {
    storeCurrency: string;
    currencyDisplayType: string;
  } | null;
  totalCustomers: number;
  tierDistribution: Record<string, number>;
  stats: {
    totalTiers: number;
    totalCustomers: number;
    tierDistribution: Record<string, number>;
  };
  pagination: {
    currentPage: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

interface ToastState {
  active: boolean;
  content: string;
  error?: boolean;
  duration?: number;
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
    const page = parseInt(url.searchParams.get("page") || "1");
    const pageSize = parseInt(url.searchParams.get("pageSize") || "25");
    const sortKey = url.searchParams.get("sortKey") || "createdAt";
    const sortDirection = url.searchParams.get("sortDirection") || "desc";

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
        orderBy: { [sortKey]: sortDirection as 'asc' | 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.tier.findMany({
        where: { shop },
        orderBy: { minSpend: 'asc' },
      }),
      db.shopSettings.findUnique({
        where: { shop },
      }),
      db.customer.count({
        where: whereClause,
      }),
    ]);

    // Calculate tier distribution
    const tierDistribution: Record<string, number> = {};
    const allCustomers = await db.customer.findMany({
      where: { shop },
      select: { currentTierId: true },
    });
    
    allCustomers.forEach((customer) => {
      if (customer.currentTierId) {
        tierDistribution[customer.currentTierId] = (tierDistribution[customer.currentTierId] || 0) + 1;
      }
    });

    // Serialize dates for tiers
    const serializedTiers = tiers.map(tier => ({
      ...tier,
      evaluationPeriod: (tier as any).evaluationPeriod || "ANNUAL" as "ANNUAL",
      createdAt: tier.createdAt instanceof Date 
        ? tier.createdAt.toISOString() 
        : tier.createdAt,
    }));

    const stats = {
      totalTiers: tiers.length,
      totalCustomers: totalCount,
      tierDistribution,
    };

    // Format customers for display with membership status
    const formattedCustomers = await Promise.all(customers.map(async customer => {
      // Check tier membership status (purchased or manual)
      const membershipStatus = await checkTierMembershipExpiry(customer.id);
      
      // Check if customer has manual override
      const hasManualOverrideStatus = await hasManualOverride(customer.id);
      
      // Get tier history for last change
      const tierHistory = await getTierHistory(customer.id, 1);
      const lastTierChange = tierHistory.length > 0 ? {
        triggerType: tierHistory[0].triggerType,
        createdAt: tierHistory[0].createdAt.toISOString(),
        note: tierHistory[0].note || undefined,
      } : null;
      
      return {
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
        // Add membership status
        membershipStatus: {
          isPurchased: membershipStatus.isPurchased,
          needsRenewal: membershipStatus.needsRenewal,
          expiresAt: membershipStatus.expiresAt?.toISOString() || null,
          daysRemaining: membershipStatus.daysRemaining,
        },
        hasManualOverride: hasManualOverrideStatus,
        lastTierChange,
        createdAt: customer.createdAt.toISOString(),
        updatedAt: customer.updatedAt.toISOString(),
      };
    }));

    const totalPages = Math.ceil(totalCount / pageSize);

    return json({
      customers: formattedCustomers,
      tiers: serializedTiers,
      shopSettings: shopSettings ? {
        storeCurrency: shopSettings.storeCurrency,
        currencyDisplayType: shopSettings.currencyDisplayType,
      } : null,
      totalCustomers: totalCount,
      tierDistribution,
      stats,
      pagination: {
        currentPage: page,
        pageSize,
        totalPages,
        totalItems: totalCount,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
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
    const intent = formData.get("intent") as string;
    const shop = session.shop;

    // Handle tier management actions
    if (intent === "create" || intent === "update" || intent === "delete") {
      switch (intent) {
        case "create": {
          const name = formData.get("name") as string;
          const minSpend = Number(formData.get("minSpend"));
          const cashbackPercent = Number(formData.get("cashbackPercent"));
          const evaluationPeriod = formData.get("evaluationPeriod") as "ANNUAL" | "LIFETIME";

          // Validate inputs
          if (!name || name.trim().length === 0) {
            return json({ error: "Name is required" }, { status: 400 });
          }
          if (isNaN(minSpend) || minSpend < 0) {
            return json({ error: "Invalid minimum spend" }, { status: 400 });
          }
          if (isNaN(cashbackPercent) || cashbackPercent < 0 || cashbackPercent > 100) {
            return json({ error: "Cashback must be between 0 and 100" }, { status: 400 });
          }

          // Check for duplicate
          const existing = await db.tier.findFirst({
            where: { shop, name: name.trim() },
          });

          if (existing) {
            return json({ error: `A tier named "${name}" already exists` }, { status: 400 });
          }

          // Create tier
          const storeName = shop.split('.')[0];
          const tierId = `${storeName}-${name.trim().toLowerCase().replace(/\s+/g, '-')}`;
          
          await db.tier.create({
            data: {
              id: tierId,
              shop,
              name: name.trim(),
              minSpend,
              cashbackPercent,
              evaluationPeriod,
            },
          });

          return json({ success: true, message: "Tier created successfully" });
        }

        case "update": {
          const id = formData.get("id") as string;
          const name = formData.get("name") as string;
          const minSpend = Number(formData.get("minSpend"));
          const cashbackPercent = Number(formData.get("cashbackPercent"));
          const evaluationPeriod = formData.get("evaluationPeriod") as "ANNUAL" | "LIFETIME";

          if (!id) {
            return json({ error: "Tier ID is required" }, { status: 400 });
          }

          // Verify tier belongs to shop
          const existingTier = await db.tier.findFirst({
            where: { id, shop },
          });

          if (!existingTier) {
            return json({ error: "Tier not found" }, { status: 404 });
          }

          // Update tier
          await db.tier.update({
            where: { id },
            data: {
              name: name.trim(),
              minSpend,
              cashbackPercent,
              evaluationPeriod,
            },
          });

          return json({ success: true, message: "Tier updated successfully" });
        }

        case "delete": {
          const id = formData.get("id") as string;

          if (!id) {
            return json({ error: "Tier ID is required" }, { status: 400 });
          }

          // Verify tier belongs to shop
          const existingTier = await db.tier.findFirst({
            where: { id, shop },
          });

          if (!existingTier) {
            return json({ error: "Tier not found" }, { status: 404 });
          }

          // Check if customers are assigned to this tier
          const customerCount = await db.customer.count({
            where: { shop, currentTierId: id },
          });

          if (customerCount > 0) {
            return json({ 
              error: `Cannot delete tier with ${customerCount} assigned customers. Please reassign customers first.` 
            }, { status: 400 });
          }

          // Delete tier
          await db.tier.delete({
            where: { id },
          });

          return json({ success: true, message: "Tier deleted successfully" });
        }
      }
    }
    
    // Manual tier assignment
    if (action === "manual-tier-assignment") {
      const customerId = formData.get("customerId") as string;
      const tierId = formData.get("tierId") as string | null;
      const reason = formData.get("reason") as string;
      const permanentOverride = formData.get("permanentOverride") === "true";

      console.log("========================================");
      console.log("[MANUAL TIER ASSIGNMENT] Starting manual tier assignment");
      console.log("[MANUAL TIER ASSIGNMENT] Customer ID:", customerId);
      console.log("[MANUAL TIER ASSIGNMENT] New Tier ID:", tierId);
      console.log("[MANUAL TIER ASSIGNMENT] Permanent Override:", permanentOverride);
      console.log("[MANUAL TIER ASSIGNMENT] Reason:", reason);
      console.log("[MANUAL TIER ASSIGNMENT] Admin User ID:", session.userId?.toString() || "admin");
      console.log("[MANUAL TIER ASSIGNMENT] Shop:", shop);

      // Check current state before assignment
      const customerBefore = await db.customer.findFirst({
        where: { id: customerId, shop },
        include: { currentTier: true }
      });
      console.log("[MANUAL TIER ASSIGNMENT] Current tier before assignment:", customerBefore?.currentTier?.name || "None");

      // Check existing override status
      const hasExistingOverride = await hasManualOverride(customerId);
      console.log("[MANUAL TIER ASSIGNMENT] Has existing override:", hasExistingOverride);

      const result = await assignCustomerToTier(
        shop,
        customerId,
        tierId === "none" ? null : tierId,
        session.userId?.toString() || "admin",
        reason,
        { permanentOverride }
      );

      console.log("[MANUAL TIER ASSIGNMENT] Assignment result:", {
        success: result.success,
        previousTier: result.previousTierName,
        newTier: result.newTierName,
        error: result.error,
        message: result.message
      });

      // Verify the assignment was saved
      const customerAfter = await db.customer.findFirst({
        where: { id: customerId, shop },
        include: { currentTier: true }
      });
      console.log("[MANUAL TIER ASSIGNMENT] Current tier after assignment:", customerAfter?.currentTier?.name || "None");

      // Check the tier change log entry
      const latestLog = await db.tierChangeLog.findFirst({
        where: { customerId },
        orderBy: { createdAt: 'desc' }
      });
      console.log("[MANUAL TIER ASSIGNMENT] Latest tier change log:", {
        triggerType: latestLog?.triggerType,
        metadata: latestLog?.metadata,
        toTierName: latestLog?.toTierName,
        createdAt: latestLog?.createdAt
      });

      // Verify override status after assignment
      const hasOverrideAfter = await hasManualOverride(customerId);
      console.log("[MANUAL TIER ASSIGNMENT] Has override after assignment:", hasOverrideAfter);
      console.log("========================================");

      if (result.success) {
        return json({
          success: true,
          message: result.message || "Tier manually assigned successfully"
        });
      } else {
        return json({
          error: result.error || "Failed to assign tier"
        }, { status: 400 });
      }
    }

    if (action === "sync-customers") {
      // Sync customers from Shopify using minimal query
      console.log("[Customers] Starting customer sync from Shopify");
      
      try {
        // Minimal GraphQL query - only essential fields for Prisma schema
        const customersQuery = `
          query getCustomers($first: Int!, $after: String) {
            customers(first: $first, after: $after) {
              edges {
                cursor
                node {
                  id
                  email
                  displayName
                  createdAt
                  updatedAt
                }
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
        let totalImported = 0;
        let totalUpdated = 0;
        let totalErrors = 0;
        const processedCustomers = [];
        
        while (hasNextPage) {
          const response = await admin.graphql(customersQuery, {
            variables: {
              first: 250, // Max allowed per request
              after: cursor,
            },
          });
          
          const result = await response.json() as any;
          
          if (result.errors) {
            console.error("[Customers] GraphQL errors:", result.errors);
            throw new Error("GraphQL query failed");
          }
          
          const customers = result.data.customers;
          
          // Process each customer
          for (const edge of customers.edges) {
            const shopifyCustomer = edge.node;
            const shopifyId = shopifyCustomer.id.split('/').pop(); // Extract ID from gid://shopify/Customer/9224704098643
            
            try {
              // Check if customer already exists
              const existingCustomer = await db.customer.findFirst({
                where: {
                  shop,
                  shopifyCustomerId: shopifyId,
                },
              });
              
              if (!existingCustomer) {
                // Create new customer with minimal required fields
                const newCustomer = await db.customer.create({
                  data: {
                    id: crypto.randomUUID(),
                    shop,
                    shopifyCustomerId: shopifyId,
                    email: shopifyCustomer.email || `customer${shopifyId}@placeholder.com`, // Fallback email if null
                    storeCredit: 0, // Default to 0
                    createdAt: new Date(shopifyCustomer.createdAt),
                    updatedAt: new Date(shopifyCustomer.updatedAt),
                  },
                });
                
                totalImported++;
                processedCustomers.push({
                  shopifyId,
                  email: newCustomer.email,
                  displayName: shopifyCustomer.displayName || "No name",
                  status: "imported",
                });
                
                console.log(`[Customers] Imported customer ${shopifyId} (${shopifyCustomer.email})`);
              } else {
                // Update existing customer only if email has changed
                if (shopifyCustomer.email && shopifyCustomer.email !== existingCustomer.email) {
                  await db.customer.update({
                    where: { id: existingCustomer.id },
                    data: {
                      email: shopifyCustomer.email,
                      updatedAt: new Date(shopifyCustomer.updatedAt),
                    },
                  });
                  
                  totalUpdated++;
                  processedCustomers.push({
                    shopifyId,
                    email: shopifyCustomer.email,
                    displayName: shopifyCustomer.displayName || "No name",
                    status: "updated",
                  });
                  
                  console.log(`[Customers] Updated customer ${shopifyId} email`);
                } else {
                  processedCustomers.push({
                    shopifyId,
                    email: existingCustomer.email,
                    displayName: shopifyCustomer.displayName || "No name",
                    status: "skipped (no changes)",
                  });
                }
              }
            } catch (customerError) {
              console.error(`[Customers] Error processing customer ${shopifyId}:`, customerError);
              totalErrors++;
              processedCustomers.push({
                shopifyId,
                email: shopifyCustomer.email || "Unknown",
                displayName: shopifyCustomer.displayName || "No name",
                status: "error",
              });
            }
          }
          
          hasNextPage = customers.pageInfo.hasNextPage;
          cursor = customers.pageInfo.endCursor;
          
          // Log progress
          console.log(`[Customers] Processed batch. Total so far - Imported: ${totalImported}, Updated: ${totalUpdated}, Errors: ${totalErrors}`);
        }
        
        return json({
          success: true,
          message: `Sync complete! Imported ${totalImported} new customers, updated ${totalUpdated} existing customers${totalErrors > 0 ? `, ${totalErrors} errors` : ''}.`,
          results: {
            imported: totalImported,
            updated: totalUpdated,
            errors: totalErrors,
            total: totalImported + totalUpdated,
            details: processedCustomers.slice(0, 50), // Return first 50 for display
          },
        });
      } catch (error) {
        console.error("[Customers] Sync error:", error);
        return json({
          success: false,
          message: `Failed to sync customers: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }

    // Store Credit Management Actions
    if (intent === "loadTransactions") {
      const customerId = formData.get("customerId") as string;

      if (!customerId) {
        return json({ success: false, message: "Customer ID required" });
      }

      try {
        const transactions = await db.storeCreditLedger.findMany({
          where: {
            customerId,
            shop: session.shop
          },
          orderBy: { createdAt: 'desc' },
          take: 50
        });

        return json({
          success: true,
          transactions: transactions.map(t => ({
            ...t,
            amount: t.amount.toString(),
            balance: t.balance.toString(),
            createdAt: t.createdAt.toISOString()
          }))
        });
      } catch (error) {
        console.error("[Credit] Error loading transactions:", error);
        return json({ success: false, message: "Failed to load transactions" });
      }
    }

    if (intent === "adjustCredit") {
      const customerId = formData.get("customerId") as string;
      const actionType = formData.get("actionType") as "add" | "remove";
      const amount = parseFloat(formData.get("amount") as string || "0");
      const reason = formData.get("reason") as string;

      // Validate inputs
      if (!customerId || !actionType || isNaN(amount) || amount <= 0 || !reason) {
        return json({ success: false, message: "Invalid input data" });
      }

      try {
        // Fetch customer from database
        const customer = await db.customer.findFirst({
          where: {
            id: customerId,
            shop: session.shop
          }
        });

        if (!customer || !customer.shopifyCustomerId) {
          return json({ success: false, message: "Customer not found or missing Shopify ID" });
        }

        // Get shop settings for currency
        const shopSettings = await db.shopSettings.findUnique({
          where: { shop: session.shop }
        });

        const currency = shopSettings?.storeCurrency || "USD";
        const gidCustomerId = `gid://shopify/Customer/${customer.shopifyCustomerId}`;

        // Perform the credit/debit operation in Shopify
        if (actionType === "add") {
          // Import the store credit service
          const { createStoreCreditService } = await import("~/services/shopify-store-credit.service");
          const storeCreditService = createStoreCreditService(admin, session.shop);

          // Issue store credit via Shopify
          const result = await storeCreditService.issueStoreCredit(
            customer.shopifyCustomerId,
            amount,
            currency,
            reason
          );

          if (!result.success) {
            return json({
              success: false,
              message: result.error || "Failed to add store credit"
            });
          }

          // Update local database
          const currentBalance = parseFloat(customer.storeCredit.toString());
          const newBalance = currentBalance + amount;

          // Create ledger entry with Shopify transaction ID
          // Create ledger entry - store sync info in metadata
          // to avoid column missing errors in Aurora Data API
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
                shopifyBalance: result.balance,
                // Store sync info in metadata since columns may not exist
                shopifyTransactionId: result.transactionId,
                syncStatus: 'SYNCED',
                syncedAt: new Date().toISOString()
              },
              createdAt: new Date()
            }
          });

          // Update customer balance
          await db.customer.update({
            where: { id: customerId },
            data: {
              storeCredit: result.balance || newBalance,
              updatedAt: new Date()
            }
          });

          // Fetch updated transactions to return with response
          const updatedTransactions = await db.storeCreditLedger.findMany({
            where: {
              customerId,
              shop: session.shop
            },
            orderBy: { createdAt: 'desc' },
            take: 50
          });

          return json({
            success: true,
            message: `Successfully added ${formatCurrency(amount, shopSettings)} to store credit`,
            newBalance: (result.balance || newBalance).toString(),
            transactions: updatedTransactions.map(t => ({
              ...t,
              amount: t.amount.toString(),
              balance: t.balance.toString(),
              createdAt: t.createdAt.toISOString()
            }))
          });

        } else {
          // Remove credit using debit mutation
          const { createStoreCreditService } = await import("~/services/shopify-store-credit.service");
          const storeCreditService = createStoreCreditService(admin, session.shop);

          // Debit store credit via custom method
          const result = await storeCreditService.debitStoreCredit(
            customer.shopifyCustomerId,
            amount,
            currency,
            reason
          );

          if (!result.success) {
            return json({
              success: false,
              message: result.error || "Failed to remove store credit"
            });
          }

          // Update local database
          const newBalance = result.balance || Math.max(0, parseFloat(customer.storeCredit.toString()) - amount);

          // Create debit ledger entry - store sync info in metadata
          // to avoid column missing errors in Aurora Data API
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
                shopifyBalance: newBalance,
                // Store sync info in metadata since columns may not exist
                shopifyTransactionId: result.transactionId,
                syncStatus: 'SYNCED',
                syncedAt: new Date().toISOString()
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

          // Fetch updated transactions to return with response
          const updatedTransactions = await db.storeCreditLedger.findMany({
            where: {
              customerId,
              shop: session.shop
            },
            orderBy: { createdAt: 'desc' },
            take: 50
          });

          return json({
            success: true,
            message: `Successfully removed ${formatCurrency(amount, shopSettings)} from store credit`,
            newBalance: newBalance.toString(),
            transactions: updatedTransactions.map(t => ({
              ...t,
              amount: t.amount.toString(),
              balance: t.balance.toString(),
              createdAt: t.createdAt.toISOString()
            }))
          });
        }

      } catch (error) {
        console.error("[Credit] Error adjusting credit:", error);
        return json({
          success: false,
          message: "Failed to adjust credit: " + (error instanceof Error ? error.message : "Unknown error")
        });
      }
    }

    if (intent === "syncCredit") {
      const customerId = formData.get("customerId") as string;

      if (!customerId) {
        return json({ success: false, message: "Customer ID required" });
      }

      try {
        const customer = await db.customer.findFirst({
          where: { id: customerId, shop: session.shop }
        });

        if (!customer || !customer.shopifyCustomerId) {
          return json({ success: false, message: "Customer not found or missing Shopify ID" });
        }

        // Query Shopify for store credit
        const syncQuery = `#graphql
          query SyncCustomerStoreCredit($customerId: ID!) {
            customer(id: $customerId) {
              id
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
              }
            }
          }
        `;

        const gidCustomerId = `gid://shopify/Customer/${customer.shopifyCustomerId}`;
        const response = await admin.graphql(syncQuery, {
          variables: { customerId: gidCustomerId }
        });

        const responseJson = await response.json() as any;

        if (responseJson.errors) {
          return json({ success: false, message: "Failed to sync from Shopify" });
        }

        // Calculate total from all accounts
        let totalCredit = 0;
        const accounts = responseJson.data?.customer?.storeCreditAccounts?.edges || [];

        for (const edge of accounts) {
          const balance = parseFloat(edge.node.balance.amount || "0");
          if (!isNaN(balance)) totalCredit += balance;
        }

        const previousBalance = parseFloat(customer.storeCredit.toString());

        if (previousBalance !== totalCredit) {
          // Create sync ledger entry
          await db.storeCreditLedger.create({
            data: {
              id: uuidv4(),
              customerId,
              shop: session.shop,
              amount: totalCredit - previousBalance,
              balance: totalCredit,
              type: "SHOPIFY_SYNC",
              metadata: {
                previousBalance,
                syncedBalance: totalCredit,
                shopifyAccounts: accounts.length
              },
              createdAt: new Date()
            }
          });

          // Update customer balance
          await db.customer.update({
            where: { id: customerId },
            data: {
              storeCredit: totalCredit,
              updatedAt: new Date()
            }
          });
        }

        // Fetch updated transactions to return with response
        const updatedTransactions = await db.storeCreditLedger.findMany({
          where: {
            customerId,
            shop: session.shop
          },
          orderBy: { createdAt: 'desc' },
          take: 50
        });

        return json({
          success: true,
          message: `Synced successfully: ${formatCurrency(totalCredit, null)} from ${accounts.length} account(s)`,
          newBalance: totalCredit.toString(),
          transactions: updatedTransactions.map(t => ({
            ...t,
            amount: t.amount.toString(),
            balance: t.balance.toString(),
            createdAt: t.createdAt.toISOString()
          }))
        });
      } catch (error) {
        console.error("[Credit] Error syncing credit:", error);
        return json({ success: false, message: "Failed to sync store credit" });
      }
    }

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
    
    if (action === "calculate-single") {
      // Calculate tier for a single customer
      const customerId = formData.get("customerId") as string;

      console.log("========================================");
      console.log("[TIER RECALCULATION] Starting tier recalculation");
      console.log("[TIER RECALCULATION] Customer ID:", customerId);
      console.log("[TIER RECALCULATION] Shop:", shop);

      // Check current state before recalculation
      const customerBefore = await db.customer.findFirst({
        where: { id: customerId, shop },
        include: { currentTier: true }
      });
      console.log("[TIER RECALCULATION] Current tier before recalculation:", customerBefore?.currentTier?.name || "None");
      console.log("[TIER RECALCULATION] Customer spending:", {
        totalSpent: customerBefore?.totalSpent.toString(),
        netSpent: customerBefore?.netSpent.toString(),
        orderCount: customerBefore?.orderCount
      });

      // Check override status BEFORE recalculation
      const hasOverrideBefore = await hasManualOverride(customerId);
      console.log("[TIER RECALCULATION] Has manual override BEFORE recalc:", hasOverrideBefore);

      // Get recent tier change logs
      const recentLogs = await db.tierChangeLog.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        take: 3
      });
      console.log("[TIER RECALCULATION] Recent tier change logs (last 3):");
      recentLogs.forEach((log, idx) => {
        console.log(`  [${idx + 1}]`, {
          triggerType: log.triggerType,
          toTierName: log.toTierName,
          metadata: log.metadata,
          createdAt: log.createdAt,
          note: log.note
        });
      });

      console.log("[TIER RECALCULATION] Calling calculateCustomerTier...");
      const result = await calculateCustomerTier(shop, customerId, admin as any);

      console.log("[TIER RECALCULATION] Calculation result:", {
        changed: result.changed,
        previousTier: result.previousTierName,
        newTier: result.newTierName,
        totalSpending: result.totalSpending,
        error: result.error
      });

      // Check state after recalculation
      const customerAfter = await db.customer.findFirst({
        where: { id: customerId, shop },
        include: { currentTier: true }
      });
      console.log("[TIER RECALCULATION] Current tier after recalculation:", customerAfter?.currentTier?.name || "None");

      // Check override status AFTER recalculation
      const hasOverrideAfter = await hasManualOverride(customerId);
      console.log("[TIER RECALCULATION] Has manual override AFTER recalc:", hasOverrideAfter);

      // Check if a new log entry was created
      const latestLog = await db.tierChangeLog.findFirst({
        where: { customerId },
        orderBy: { createdAt: 'desc' }
      });
      console.log("[TIER RECALCULATION] Latest tier change log after recalc:", {
        triggerType: latestLog?.triggerType,
        metadata: latestLog?.metadata,
        toTierName: latestLog?.toTierName,
        createdAt: latestLog?.createdAt,
        note: latestLog?.note
      });
      console.log("========================================");

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
  const style = getTierStyle(tierName);
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '24px',
      height: '24px',
      borderRadius: '50%',
      background: style.backgroundColor,
      border: `1px solid ${style.borderColor}`,
    }}>
      <Icon source={style.icon} tone="base" />
    </div>
  );
}

function CustomerAvatar({ email }: { email: string }) {
  const initials = email.substring(0, 2).toUpperCase();
  return (
    <Avatar customer size="md" initials={initials} />
  );
}


// ============================================
// MAIN COMPONENT
// ============================================

export default function Customers() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const fetcher = useFetcher();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // State - Initialize from URL params
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [tierFilter, setTierFilter] = useState(searchParams.get("tier") || "all");
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [queryValue, setQueryValue] = useState(searchParams.get("search") || "");
  const [pageSize, setPageSize] = useState(parseInt(searchParams.get("pageSize") || "25"));
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculatingCustomerId, setCalculatingCustomerId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitialTab, setModalInitialTab] = useState(0);
  const [visibleRows, setVisibleRows] = useState<number[]>([]);
  const [toast, setToast] = useState<ToastState>({ active: false, content: '' });
  const [activePopover, setActivePopover] = useState<string | null>(null);
  
  // Tier management states
  const [tierModalActive, setTierModalActive] = useState(false);
  const [editingTier, setEditingTier] = useState<any>(null);
  const [deleteConfirmActive, setDeleteConfirmActive] = useState(false);
  const [deletingTierId, setDeletingTierId] = useState<string | null>(null);
  const [tierFormData, setTierFormData] = useState({
    name: "",
    minSpend: "0",
    cashbackPercent: "0",
    evaluationPeriod: "ANNUAL" as "ANNUAL" | "LIFETIME",
  });
  
  // Manual tier assignment modal state
  const [manualTierModalActive, setManualTierModalActive] = useState(false);
  const [manualTierCustomer, setManualTierCustomer] = useState<Customer | null>(null);
  const [manualTierSelection, setManualTierSelection] = useState<string>("");
  const [manualTierReason, setManualTierReason] = useState("");
  const [permanentOverride, setPermanentOverride] = useState(false);
  
  // Animation refs
  const tableRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  // Get current page from URL params
  const currentPage = parseInt(searchParams.get("page") || "1");

  // Format currency helper
  const formatAmount = useCallback((amount: number) => {
    return formatCurrency(amount, data.shopSettings as any);
  }, [data.shopSettings]);

  // Handle search with URL update
  const handleSearch = useCallback((value: string) => {
    setQueryValue(value);
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set("search", value);
    } else {
      newParams.delete("search");
    }
    newParams.set("page", "1"); // Reset to page 1 on search
    setSearchParams(newParams);
  }, [searchParams, setSearchParams]);

  // Handle query clear
  const handleQueryValueRemove = useCallback(() => {
    setQueryValue("");
    const newParams = new URLSearchParams(searchParams);
    newParams.delete("search");
    newParams.set("page", "1");
    setSearchParams(newParams);
  }, [searchParams, setSearchParams]);

  // Handle tier filter with URL update
  const handleFiltersChange = useCallback((value: string[]) => {
    const newParams = new URLSearchParams(searchParams);
    if (value.length > 0 && value[0] !== "all") {
      newParams.set("tier", value[0]);
    } else {
      newParams.delete("tier");
    }
    newParams.set("page", "1"); // Reset to page 1 on filter change
    setSearchParams(newParams);
  }, [searchParams, setSearchParams]);

  // Handle page size change
  const handlePageSizeChange = useCallback((value: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("pageSize", value);
    newParams.set("page", "1"); // Reset to page 1
    setSearchParams(newParams);
  }, [searchParams, setSearchParams]);

  // Handle pagination
  const handlePreviousPage = useCallback(() => {
    if (data.pagination.hasPrevPage) {
      const newParams = new URLSearchParams(searchParams);
      newParams.set("page", String(currentPage - 1));
      setSearchParams(newParams);
    }
  }, [currentPage, data.pagination.hasPrevPage, searchParams, setSearchParams]);

  const handleNextPage = useCallback(() => {
    if (data.pagination.hasNextPage) {
      const newParams = new URLSearchParams(searchParams);
      newParams.set("page", String(currentPage + 1));
      setSearchParams(newParams);
    }
  }, [currentPage, data.pagination.hasNextPage, searchParams, setSearchParams]);

  // Calculate all tiers with better feedback
  const handleCalculateAll = useCallback(() => {
    setIsCalculating(true);
    
    // Show processing toast
    setToast({
      active: true,
      content: `Processing ${data.totalCustomers} customers...`,
      duration: 60000, // Long duration for processing
    });
    
    const formData = new FormData();
    formData.append("action", "calculate-all");
    submit(formData, { method: "post" });
  }, [data.totalCustomers, submit]);

  // Sync customers from Shopify
  const handleSyncCustomers = useCallback(() => {
    setIsCalculating(true);
    setToast({
      active: true,
      content: "Syncing customers from Shopify...",
      duration: 60000, // Long duration for sync
    });
    
    const formData = new FormData();
    formData.append("action", "sync-customers");
    submit(formData, { method: "post" });
  }, [submit]);

  // Calculate single customer tier with inline feedback
  const handleCalculateSingle = useCallback((customerId: string) => {
    setCalculatingCustomerId(customerId);
    const formData = new FormData();
    formData.append("action", "calculate-single");
    formData.append("customerId", customerId);
    fetcher.submit(formData, { method: "post" });
  }, [fetcher]);

  // Open customer detail modal
  const handleViewCustomer = useCallback((customerId: string, tabIndex: number = 0) => {
    setSelectedCustomerId(customerId);
    setModalInitialTab(tabIndex);
    setModalOpen(true);
  }, []);

  // Toggle actions popover
  const togglePopover = useCallback((customerId: string) => {
    setActivePopover(activePopover === customerId ? null : customerId);
  }, [activePopover]);

  // Open manual tier assignment modal
  const handleManualTierAssignment = useCallback((customer: Customer) => {
    setManualTierCustomer(customer);
    setManualTierSelection(customer.currentTier?.id || "none");
    setManualTierReason("");
    // Pre-check "permanent override" if customer already has one
    // This makes it clear that the override will continue unless unchecked
    setPermanentOverride(customer.hasManualOverride || false);
    setManualTierModalActive(true);
  }, []);
  
  // Submit manual tier assignment
  const handleSubmitManualTier = useCallback(() => {
    if (!manualTierCustomer || !manualTierReason.trim()) {
      setToast({
        active: true,
        content: "Please provide a reason for the manual tier change",
      });
      return;
    }
    
    const formData = new FormData();
    formData.append("action", "manual-tier-assignment");
    formData.append("customerId", manualTierCustomer.id);
    formData.append("tierId", manualTierSelection);
    formData.append("reason", manualTierReason);
    formData.append("permanentOverride", permanentOverride.toString());
    
    submit(formData, { method: "post" });
    setManualTierModalActive(false);
  }, [manualTierCustomer, manualTierSelection, manualTierReason, permanentOverride, submit]);

  // Tier management handlers
  const handleSaveTier = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", editingTier ? "update" : "create");
    if (editingTier) {
      formData.append("id", editingTier.id);
    }
    formData.append("name", tierFormData.name);
    formData.append("minSpend", tierFormData.minSpend);
    formData.append("cashbackPercent", tierFormData.cashbackPercent);
    formData.append("evaluationPeriod", tierFormData.evaluationPeriod);
    
    submit(formData, { method: "post" });
    setTierModalActive(false);
    setEditingTier(null);
  }, [editingTier, tierFormData, submit]);

  const handleDeleteTier = useCallback(() => {
    if (deletingTierId) {
      const formData = new FormData();
      formData.append("intent", "delete");
      formData.append("id", deletingTierId);
      
      submit(formData, { method: "post" });
      setDeleteConfirmActive(false);
      setDeletingTierId(null);
    }
  }, [deletingTierId, submit]);

  // Use resource state for table selection
  const resourceName = {
    singular: 'customer',
    plural: 'customers',
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange, clearSelection } =
    useIndexResourceState(data.customers);

  // Filter options for IndexFilters
  const filters = [
    {
      key: 'tier',
      label: 'Tier',
      filter: (
        <ChoiceList
          title="Tier"
          titleHidden
          choices={[
            { label: 'All tiers', value: 'all' },
            { label: 'No tier', value: 'none' },
            ...data.tiers.map(tier => ({
              label: `${tier.name} (${String(tier.cashbackPercent)}%)`,
              value: tier.id,
            })),
          ]}
          selected={tierFilter ? [tierFilter] : []}
          onChange={handleFiltersChange}
          allowMultiple={false}
        />
      ),
      shortcut: true,
    },
  ];

  // Applied filters for IndexFilters
  const appliedFilters = tierFilter && tierFilter !== 'all' ? [
    {
      key: 'tier',
      label: tierFilter === 'none' ? 'No tier' : data.tiers.find(t => t.id === tierFilter)?.name || tierFilter,
      onRemove: () => {
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('tier');
        setSearchParams(newParams);
      },
    },
  ] : [];


  // Animate table rows on mount/filter change
  useEffect(() => {
    if (data.customers.length > 0) {
      setVisibleRows([]);
      data.customers.forEach((_, index) => {
        setTimeout(() => {
          setVisibleRows(prev => [...prev, index]);
        }, index * 30); // Stagger by 30ms
      });
    }
  }, [data.customers.length, tierFilter]);

  // Handle fetcher response for single customer
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && calculatingCustomerId) {
      setCalculatingCustomerId(null);
      
      const data = fetcher.data as Record<string, any>;
      if (data.success) {
        setToast({
          active: true,
          content: data.message ? String(data.message) : 'Success',
          error: false,
          duration: 4000,
        });
      } else {
        setToast({
          active: true,
          content: data.message ? String(data.message) : 'Error',
          error: true,
          duration: 4000,
        });
      }
    }
  }, [fetcher.state, fetcher.data, calculatingCustomerId]);

  // Handle action results for bulk operations
  useEffect(() => {
    if (navigation.state === "idle" && isCalculating) {
      setIsCalculating(false);
      
      // Check if we have sync results
      if (actionData && 'results' in actionData && actionData.results && 
          typeof actionData.results === 'object' && 
          'imported' in actionData.results && 
          'updated' in actionData.results && 
          'errors' in actionData.results) {
        // Sync customers completed
        const results = actionData.results as { imported: number; updated: number; errors: number; total: number; details: any[] };
        setToast({
          active: true,
          content: `Sync complete! Imported: ${results.imported}, Updated: ${results.updated}${results.errors ? `, Errors: ${results.errors}` : ''}`,
          error: results.errors > 0,
          duration: 8000,
        });
      } else if (navigation.formData) {
        // Other operations
        setToast({
          active: true,
          content: "Tier calculation complete!",
          error: false,
          duration: 5000,
        });
      }
    }
  }, [navigation.state, isCalculating, navigation.formData, actionData]);

  // Skip animations on first render for performance
  useEffect(() => {
    if (isFirstRender.current) {
      setVisibleRows(data.customers.map((_, i) => i));
      isFirstRender.current = false;
    }
  }, []);

  // Bulk actions for selected customers
  const bulkActions = [
    {
      content: 'Calculate tiers',
      onAction: () => {
        // Handle bulk tier calculation
      },
    },
  ];

  // Table rows for IndexTable
  const rowMarkup = data.customers.map((customer, index) => {
    const isVisible = visibleRows.includes(index);
    const isProcessing = calculatingCustomerId === customer.id;

    return (
      <IndexTable.Row
        id={customer.id}
        key={customer.id}
        selected={selectedResources.includes(customer.id)}
        position={index}
      >
        <IndexTable.Cell>
          <div
            style={{
              opacity: isVisible ? 1 : 0,
              transform: isVisible ? 'translateX(0)' : 'translateX(-20px)',
              transition: `all 200ms ease-out`,
            }}
          >
            <BlockStack gap="050">
              <Text variant="bodyMd" fontWeight="medium" as="span">
                {customer.email}
              </Text>
              <Text variant="bodySm" tone="subdued" as="span">
                ID: {customer.shopifyCustomerId}
              </Text>
            </BlockStack>
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <BlockStack gap="100">
            <InlineStack gap="200" align="start">
              {customer.currentTier ? (
                <>
                  <Badge tone={customer.membershipStatus?.isPurchased ? "info" : "success"}>
                    {`${customer.currentTier.name}`}
                  </Badge>
                  <Text variant="bodySm" tone="subdued" as="span">
                    {String(customer.currentTier.cashbackPercent)}%
                  </Text>
                </>
              ) : (
                <Badge tone="attention">No tier</Badge>
              )}
            </InlineStack>
            {customer.membershipStatus?.isPurchased && (
              <InlineStack gap="100" align="center">
                <Icon source={CheckCircleIcon} />
                <Text variant="bodySm" tone="subdued" as="span">
                  Purchased
                </Text>
                {customer.membershipStatus.expiresAt && (
                  <>
                    {customer.membershipStatus.needsRenewal ? (
                      <Badge tone="attention">
                        {customer.membershipStatus.daysRemaining} days left
                      </Badge>
                    ) : (
                      <Text variant="bodySm" tone="subdued" as="span">
                        {customer.membershipStatus.daysRemaining ?
                          `${customer.membershipStatus.daysRemaining} days` :
                          'Lifetime'}
                      </Text>
                    )}
                  </>
                )}
              </InlineStack>
            )}
            {customer.hasManualOverride && (
              <InlineStack gap="100" align="center">
                <Icon source={EditIcon} />
                <Text variant="bodySm" tone="critical" as="span">
                  Manual
                </Text>
              </InlineStack>
            )}
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div style={{ textAlign: 'right' }}>
            <StoreCreditDisplay
              amount={customer.storeCredit}
              shopSettings={data.shopSettings}
              size="small"
            />
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="200" align="end">
            <Button size="slim" onClick={() => handleViewCustomer(customer.id)}>
              View
            </Button>
            <Popover
              active={activePopover === customer.id}
              activator={
                <Button
                  size="slim"
                  icon={MenuHorizontalIcon}
                  variant="tertiary"
                  onClick={() => togglePopover(customer.id)}
                  accessibilityLabel={`More actions for ${customer.email}`}
                />
              }
              autofocusTarget="first-node"
              onClose={() => setActivePopover(null)}
            >
              <ActionList
                actionRole="menuitem"
                sections={[
                  {
                    items: [
                      {
                        content: "Manage Store Credit",
                        icon: CashDollarIcon,
                        onAction: () => {
                          handleViewCustomer(customer.id, 1);
                          setActivePopover(null);
                        }
                      },
                      {
                        content: "Change Tier",
                        icon: EditIcon,
                        onAction: () => {
                          handleManualTierAssignment(customer);
                          setActivePopover(null);
                        }
                      },
                      {
                        content: "Recalculate Tier",
                        icon: RefreshIcon,
                        disabled: isProcessing,
                        onAction: () => {
                          handleCalculateSingle(customer.id);
                          setActivePopover(null);
                        }
                      }
                    ]
                  }
                ]}
              />
            </Popover>
          </InlineStack>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  const isLoading = navigation.state === "loading" || navigation.state === "submitting" || isCalculating;

  // Empty state markup
  const emptyStateMarkup = (
    <EmptyState
      heading="No customers found"
      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
      action={{ content: 'Sync from Shopify', onAction: handleSyncCustomers }}
    >
      <p>Sync your customers from Shopify to start managing loyalty tiers.</p>
    </EmptyState>
  );

  // Toast markup
  const toastMarkup = toast.active ? (
    <Toast 
      content={toast.content}
      error={toast.error}
      duration={toast.duration}
      onDismiss={() => setToast({ ...toast, active: false })}
    />
  ) : null;

  return (
    <Frame>
      <Page>
        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              {/* Header with count and page size selector - Orders style */}
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="300" blockAlign="center">
                  <Text variant="headingLg" as="h2">Customers</Text>
                  <Text variant="bodySm" tone="subdued" as="span">
                    {((currentPage - 1) * pageSize) + 1 > data.pagination.totalItems ?
                      data.pagination.totalItems :
                      `${((currentPage - 1) * pageSize) + 1} - ${Math.min(currentPage * pageSize, data.pagination.totalItems)}`
                    } of {data.pagination.totalItems}
                </Text>
              </InlineStack>

              <Select
                label=""
                labelHidden
                options={[
                  { label: '25 per page', value: '25' },
                  { label: '50 per page', value: '50' },
                  { label: '100 per page', value: '100' },
                  { label: '200 per page', value: '200' },
                ]}
                value={String(pageSize)}
                onChange={handlePageSizeChange}
              />
            </InlineStack>

            {/* Search bar - simplified like orders */}
            <TextField
              placeholder="Search by customer email or ID"
              value={queryValue}
              onChange={handleSearch}
              clearButton
              onClearButtonClick={handleQueryValueRemove}
              prefix={<Icon source={SearchIcon} />}
              autoComplete="off"
            />
          </BlockStack>
        </Box>

        <Divider />

        {/* Customer IndexTable */}
        <Box>
          {data.customers.length === 0 ? (
            <Box padding="400">
              {emptyStateMarkup}
            </Box>
          ) : (
            <IndexTable
              resourceName={resourceName}
              itemCount={data.customers.length}
              selectedItemsCount={
                allResourcesSelected ? 'All' : selectedResources.length
              }
              onSelectionChange={handleSelectionChange}
              bulkActions={bulkActions}
              headings={[
                { title: 'Customer' },
                { title: 'Tier' },
                { title: 'Store Credit', alignment: 'end' },
                { title: 'Actions', alignment: 'end' },
              ]}
              loading={isLoading}
            >
              {rowMarkup}
            </IndexTable>
          )}
        </Box>

        {/* Bottom pagination */}
        {data.pagination.totalPages > 1 && (
          <>
            <Divider />
            <Box padding="400">
              <InlineStack align="center">
                <Button
                  accessibilityLabel="Previous page"
                  onClick={handlePreviousPage}
                  disabled={!data.pagination.hasPrevPage}
                >
                  Previous
                </Button>
                <Text variant="bodySm" as="span">
                  Page {currentPage} of {data.pagination.totalPages}
                </Text>
                <Button
                  accessibilityLabel="Next page"
                  onClick={handleNextPage}
                  disabled={!data.pagination.hasNextPage}
                >
                  Next
                </Button>
              </InlineStack>
            </Box>
          </>
        )}
      </Card>

        {/* Customer Detail Modal */}
        {selectedCustomerId && (
          <CustomerDetailModal
            open={modalOpen}
            onClose={() => {
              setModalOpen(false);
              setSelectedCustomerId(null);
              setModalInitialTab(0);
            }}
            customerId={selectedCustomerId}
            customerEmail={data.customers.find(c => c.id === selectedCustomerId)?.email || ""}
            initialTab={modalInitialTab}
          />
        )}

        {/* Tier Create/Edit Modal */}
        <Modal
          open={tierModalActive}
          onClose={() => {
            setTierModalActive(false);
            setEditingTier(null);
          }}
          title={editingTier ? "Edit Tier" : "Create New Tier"}
          primaryAction={{
            content: "Save",
            onAction: handleSaveTier,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => {
                setTierModalActive(false);
                setEditingTier(null);
              },
            },
          ]}
        >
          <Modal.Section>
            <FormLayout>
              <TextField
                label="Tier Name"
                value={tierFormData.name}
                onChange={(value) => setTierFormData({ ...tierFormData, name: value })}
                placeholder="e.g., Bronze, Silver, Gold"
                autoComplete="off"
              />
              
              <TextField
                label="Minimum Spend"
                type="number"
                value={tierFormData.minSpend}
                onChange={(value) => setTierFormData({ ...tierFormData, minSpend: value })}
                prefix={data.shopSettings?.storeCurrency || "USD"}
                helpText="Minimum spending amount to qualify for this tier"
                autoComplete="off"
              />
              
              <TextField
                label="Cashback Percentage"
                type="number"
                value={tierFormData.cashbackPercent}
                onChange={(value) => setTierFormData({ ...tierFormData, cashbackPercent: value })}
                suffix="%"
                helpText="Percentage of order value earned as store credit"
                autoComplete="off"
              />
              
              <Select
                label="Evaluation Period"
                options={[
                  { label: "Annual (resets yearly)", value: "ANNUAL" },
                  { label: "Lifetime (cumulative)", value: "LIFETIME" },
                ]}
                value={tierFormData.evaluationPeriod}
                onChange={(value) => setTierFormData({ ...tierFormData, evaluationPeriod: value as "ANNUAL" | "LIFETIME" })}
              />
            </FormLayout>
          </Modal.Section>
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          open={deleteConfirmActive}
          onClose={() => {
            setDeleteConfirmActive(false);
            setDeletingTierId(null);
          }}
          title="Delete Tier"
          primaryAction={{
            content: "Delete",
            destructive: true,
            onAction: handleDeleteTier,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => {
                setDeleteConfirmActive(false);
                setDeletingTierId(null);
              },
            },
          ]}
        >
          <Modal.Section>
            <Text as="p">
              Are you sure you want to delete this tier? This action cannot be undone.
            </Text>
          </Modal.Section>
        </Modal>
        
        {/* Manual Tier Assignment Modal */}
        <Modal
          open={manualTierModalActive}
          onClose={() => {
            setManualTierModalActive(false);
            setManualTierCustomer(null);
            setManualTierReason("");
            setPermanentOverride(false);
          }}
          title="Manually Assign Tier"
          primaryAction={{
            content: "Assign Tier",
            onAction: handleSubmitManualTier,
            disabled: !manualTierReason.trim(),
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => {
                setManualTierModalActive(false);
                setManualTierCustomer(null);
              },
            },
          ]}
        >
          <Modal.Section>
            <FormLayout>
              {manualTierCustomer && (
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <BlockStack gap="100">
                      <Text variant="headingMd" as="h3">
                        Customer
                      </Text>
                      <Text variant="bodyMd" as="p">
                        {manualTierCustomer.email}
                      </Text>
                    </BlockStack>
                    {manualTierCustomer.currentTier && (
                      <BlockStack gap="100">
                        <Text variant="headingMd" as="h3">
                          Current Tier
                        </Text>
                        <Badge tone="success">
                          {manualTierCustomer.currentTier.name}
                        </Badge>
                      </BlockStack>
                    )}
                  </InlineStack>
                  
                  {manualTierCustomer.hasManualOverride && (
                    <Banner
                      title="This customer has a manual tier override"
                      tone="warning"
                      icon={AlertTriangleIcon}
                    >
                      <BlockStack gap="200">
                        <Text as="p" variant="bodySm">
                          This customer currently has a permanent manual override preventing automatic tier recalculation.
                        </Text>
                        <Text as="p" variant="bodySm" fontWeight="semibold">
                          Assigning a new tier will replace the existing override with your new settings below.
                        </Text>
                      </BlockStack>
                    </Banner>
                  )}

                  <Divider />
                </BlockStack>
              )}

              <Select
                label="Select New Tier"
                options={[
                  { label: "No tier (remove from program)", value: "none" },
                  ...data.tiers.map(tier => ({
                    label: `${tier.name} (${tier.cashbackPercent}% cashback)`,
                    value: tier.id,
                  })),
                ]}
                value={manualTierSelection}
                onChange={setManualTierSelection}
                helpText={manualTierCustomer?.hasManualOverride
                  ? "Choose a new tier for this customer (will replace current override)"
                  : "This will override automatic tier calculation"}
              />

              <TextField
                label="Reason for Change"
                value={manualTierReason}
                onChange={setManualTierReason}
                multiline={3}
                helpText="Required: Document why this manual change is being made"
                placeholder="e.g., VIP customer upgrade, promotional offer, customer service resolution"
                autoComplete="off"
              />

              <BlockStack gap="200">
                <Checkbox
                  label={manualTierCustomer?.hasManualOverride
                    ? "Keep permanent override active"
                    : "Set as permanent override"}
                  checked={permanentOverride}
                  onChange={setPermanentOverride}
                  helpText={permanentOverride
                    ? "Automatic tier recalculation will remain disabled for this customer"
                    : "Allow automatic tier recalculation after this change"}
                />

                {manualTierCustomer?.hasManualOverride && !permanentOverride && (
                  <Banner
                    title="Override will be removed"
                    tone="info"
                  >
                    <Text as="p" variant="bodySm">
                      By unchecking "Keep permanent override", this customer's tier can be automatically recalculated in the future based on their spending.
                    </Text>
                  </Banner>
                )}

                {permanentOverride && (
                  <Banner
                    title="Override will continue"
                    tone="warning"
                  >
                    <Text as="p" variant="bodySm">
                      The new tier assignment will remain permanent until manually changed again. Automatic recalculation will stay disabled.
                    </Text>
                  </Banner>
                )}
              </BlockStack>
              
              <Banner
                title="Manual Assignment Impact"
                tone="info"
                icon={InfoIcon}
              >
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm">
                    • Customer will immediately receive the selected tier's benefits
                  </Text>
                  <Text as="p" variant="bodySm">
                    • Change will be logged in the tier history with your admin ID
                  </Text>
                  <Text as="p" variant="bodySm">
                    • {permanentOverride 
                      ? "Automatic recalculation will be disabled until manually re-enabled" 
                      : "Tier may change automatically based on future spending"}
                  </Text>
                </BlockStack>
              </Banner>
            </FormLayout>
          </Modal.Section>
        </Modal>
        
        {/* Bottom spacer to prevent content from touching the bottom */}
        <div style={{ height: '80px', width: '100%' }} aria-hidden="true" />
      </Page>
      
      {/* Toast notifications */}
      {toastMarkup}
      
      {/* CSS for animations */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @media (prefers-reduced-motion: reduce) {
          * {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </Frame>
  );
}