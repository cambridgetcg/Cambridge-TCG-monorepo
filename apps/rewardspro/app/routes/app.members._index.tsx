import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, defer } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useFetcher, useActionData, useSearchParams } from "@remix-run/react";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useToast } from "~/hooks/useToast";
import { v4 as uuidv4 } from "uuid";
import {
  Page,
  Card,
  IndexTable,
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
  Modal,
  Divider,
  Tooltip,
  Avatar,
  SkeletonBodyText,
  SkeletonDisplayText,
  Toast,
  Frame,
  FormLayout,
  Checkbox,
  ChoiceList,
  InlineGrid,
  Popover,
  Tag,
  useBreakpoints,
} from "@shopify/polaris";
import {
  SearchIcon,
  PersonIcon,
  RefreshIcon,
  ChartVerticalIcon,
  AlertTriangleIcon,
  InfoIcon,
  StarIcon,
  ExportIcon,
  FilterIcon,
} from "~/utils/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { formatCurrency } from "../utils/currency";
import {
  calculateAllCustomerTiers
} from "../services/tier-calculation.server";
import {
  assignCustomerToTier,
  hasManualOverride,
} from "../services/manual-tier-assignment.server";
import { updateCustomerToEffectiveTier } from "../services/tier-resolution.server";
import { syncCustomersInBackground } from "../services/background-customer-sync.server";
import { CustomerDetailModal } from "../components/CustomerDetailModal";
import { StoreCreditDisplay } from "../components/StoreCredit";
import {
  getTierStyle,
} from "../utils/tier-styles";
import { getEntitlements } from "../services/entitlements.server";
import { getShopSettings, getShopTiers, getTierDistribution } from "../services/shop-data-provider.server";
import { trackCashbackAdjusted } from "../services/klaviyo-events.server";
import {
  getCustomerOrderSummariesBatch,
  type ActivityStatus,
} from "../services/customer-order-summary.server";

// ============================================
// TYPE DEFINITIONS
// ============================================

// TierSource enum matches CustomerTierState.tierSource
type TierSource = 'MANUAL_OVERRIDE' | 'TIER_SUBSCRIPTION' | 'TIER_PURCHASE' | 'SPENDING_BASED' | 'NONE';

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
  tierSource?: TierSource;
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
  // Order summary metrics for customer management
  orderSummary?: {
    orderCount: number;
    totalSpent: number;
    averageOrderValue: number;
    lastOrderDate: string | null;
    daysSinceLastOrder: number | null;
    activityStatus: ActivityStatus;
  } | null;
}

interface _LoaderData {
  // IMMEDIATE: Page shell + essential customers (renders instantly!)
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
  currentPlan: string;
  hasAnnualEval: boolean;
  customersData: {
    customers: Customer[];
    pagination: {
      currentPage: number;
      pageSize: number;
      totalPages: number;
      totalItems: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  };

  // DEFERRED: Enhanced metadata & stats (streams in after render)
  enhancedMetadata: Promise<{
    enhancedData: Record<string, {
      hasManualOverride: boolean;
      tierSource: TierSource;
      lastTierChange: any;
      membershipStatus: any;
      orderSummary: {
        orderCount: number;
        totalSpent: number;
        averageOrderValue: number;
        lastOrderDate: string | null;
        daysSinceLastOrder: number | null;
        activityStatus: ActivityStatus;
      } | null;
    }>;
  }>;
  statsData: Promise<{
    totalTiers: number;
    totalCustomers: number;
    tierDistribution: Record<string, number>;
  }>;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // ============================================
  // HELPER FUNCTIONS (defined inside loader to prevent client bundle issues)
  // ============================================

  /**
   * PHASE 1: Fetch essential fields only for immediate UI render (FASTEST)
   * Now uses database-level pagination - only fetches the customers we need!
   */
  function formatEssentialCustomersData(
    customers: any[],
    totalCount: number,
    page: number,
    pageSize: number
  ) {
    // Return minimal data needed to render the customer table
    const essentialCustomers = customers.map(customer => ({
      id: customer.id,
      shopifyCustomerId: customer.shopifyCustomerId,
      email: customer.email,
      storeCredit: parseFloat(String(customer.storeCredit ?? 0)),
      currentTier: customer.currentTier ? {
        id: customer.currentTier.id,
        name: customer.currentTier.name,
        cashbackPercent: customer.currentTier.cashbackPercent,
        minSpend: customer.currentTier.minSpend,
      } : null,
      createdAt: customer.createdAt instanceof Date
        ? customer.createdAt.toISOString()
        : customer.createdAt,
      updatedAt: customer.updatedAt instanceof Date
        ? customer.updatedAt.toISOString()
        : customer.updatedAt,
      // Placeholders for data that will stream in
      membershipStatus: {
        isPurchased: false,
        needsRenewal: false,
        expiresAt: null as string | null,
        daysRemaining: null as number | null,
      },
      hasManualOverride: false,
      tierSource: 'NONE' as TierSource,
      lastTierChange: null,
      orderSummary: null,
    }));

    const totalPages = Math.ceil(totalCount / pageSize);

    return {
      customers: essentialCustomers,
      pagination: {
        currentPage: page,
        pageSize,
        totalPages,
        totalItems: totalCount,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * OPTIMIZED: Fetch paginated customers with database-level filtering
   * Only fetches the customers needed for the current page (e.g., 25 instead of 10,000)
   */
  async function fetchPaginatedCustomers(
    shop: string,
    options: {
      searchQuery: string;
      tierFilter: string;
      page: number;
      pageSize: number;
      sortKey: string;
      sortDirection: string;
      creditMin?: string;
      creditMax?: string;
      hasOverride?: string;
      activityFilter?: string;
    }
  ) {
    const { searchQuery, tierFilter, page, pageSize, sortKey, sortDirection, creditMin, creditMax, hasOverride, activityFilter } = options;
    const offset = (page - 1) * pageSize;

    // Build where clause for filters
    const whereClause: any = { shop };

    // Tier filter
    if (tierFilter !== "all") {
      if (tierFilter === "none") {
        whereClause.currentTierId = null;
      } else {
        whereClause.currentTierId = tierFilter;
      }
    }

    // Search filter (case-insensitive)
    if (searchQuery) {
      whereClause.OR = [
        { email: { contains: searchQuery, mode: 'insensitive' } },
        { shopifyCustomerId: { contains: searchQuery, mode: 'insensitive' } },
        { firstName: { contains: searchQuery, mode: 'insensitive' } },
        { lastName: { contains: searchQuery, mode: 'insensitive' } },
      ];
    }

    // Credit range filter with validation
    if (creditMin || creditMax) {
      const minVal = creditMin ? parseFloat(creditMin) : null;
      const maxVal = creditMax ? parseFloat(creditMax) : null;

      // Validate and swap if min > max
      if (minVal !== null && maxVal !== null && minVal > maxVal) {
        whereClause.storeCredit = { gte: maxVal, lte: minVal };
      } else {
        whereClause.storeCredit = {};
        if (minVal !== null && !isNaN(minVal)) {
          whereClause.storeCredit.gte = minVal;
        }
        if (maxVal !== null && !isNaN(maxVal)) {
          whereClause.storeCredit.lte = maxVal;
        }
      }
    }

    // Manual override filter - query CustomerTierState first to get matching customer IDs
    // Note: Prisma relation filters are not supported by Data API adapter, so we use a two-step query
    if (hasOverride && hasOverride !== "all") {
      const tierStatesWithOverride = await prisma.customerTierState.findMany({
        where: {
          shop,
          hasManualOverride: hasOverride === "yes"
        },
        select: { customerId: true }
      });
      const customerIdsWithOverride = tierStatesWithOverride.map(ts => ts.customerId);

      if (customerIdsWithOverride.length === 0) {
        // No customers match the override filter - return empty result
        return { customers: [], totalCount: 0 };
      }

      // Add customer ID filter to whereClause
      whereClause.id = { in: customerIdsWithOverride };
    }

    // Activity filter - filter by customer order activity status
    if (activityFilter && activityFilter !== "all") {
      const now = new Date();
      const ACTIVITY_THRESHOLDS = {
        ACTIVE: 30, // Ordered within 30 days
        AT_RISK: 60, // Ordered 30-60 days ago
        NEW_CUSTOMER: 7, // Joined within 7 days
      };

      switch (activityFilter) {
        case "active":
          // Last order within 30 days
          whereClause.lastOrderDate = {
            gte: new Date(now.getTime() - ACTIVITY_THRESHOLDS.ACTIVE * 24 * 60 * 60 * 1000),
          };
          break;

        case "at_risk":
          // Last order 30-60 days ago
          whereClause.lastOrderDate = {
            lt: new Date(now.getTime() - ACTIVITY_THRESHOLDS.ACTIVE * 24 * 60 * 60 * 1000),
            gte: new Date(now.getTime() - ACTIVITY_THRESHOLDS.AT_RISK * 24 * 60 * 60 * 1000),
          };
          break;

        case "dormant":
          // Last order more than 60 days ago
          whereClause.lastOrderDate = {
            lt: new Date(now.getTime() - ACTIVITY_THRESHOLDS.AT_RISK * 24 * 60 * 60 * 1000),
          };
          break;

        case "new":
          // Joined within 7 days, no orders
          whereClause.orderCount = 0;
          whereClause.createdAt = {
            gte: new Date(now.getTime() - ACTIVITY_THRESHOLDS.NEW_CUSTOMER * 24 * 60 * 60 * 1000),
          };
          break;

        case "never_ordered":
          // No orders
          whereClause.orderCount = 0;
          break;
      }
    }

    // Execute both queries in parallel for maximum efficiency
    try {
      const [customers, totalCount] = await Promise.all([
        // Fetch only the customers for current page (using take/skip)
        prisma.customer.findMany({
          where: whereClause,
          include: { currentTier: true },
          orderBy: { [sortKey]: sortDirection as 'asc' | 'desc' },
          take: pageSize,
          skip: offset,
        }),
        // Get total count for pagination (single COUNT query)
        prisma.customer.count({
          where: whereClause,
        }),
      ]);

      return { customers, totalCount };
    } catch (error) {
      console.error('[Members Search] Query failed:', error);
      console.error('[Members Search] Where clause:', JSON.stringify(whereClause, null, 2));
      return { customers: [], totalCount: 0 };
    }
  }

  /**
   * PHASE 2: Fetch enhanced metadata (tier state, last tier change, order summary) - streams in after render
   *
   * UPDATED: Now uses CustomerTierState as single source of truth for:
   * - hasManualOverride (O(1) boolean lookup instead of TierChangeLog scan)
   * - tierSource (MANUAL_OVERRIDE, TIER_SUBSCRIPTION, TIER_PURCHASE, SPENDING_BASED, NONE)
   * - membershipStatus (from purchaseExpiresAt, subscriptionExpiresAt)
   * - orderSummary (order count, activity status, etc.)
   *
   * Still uses TierChangeLog for lastTierChange (audit trail)
   */
  async function fetchEnhancedCustomerMetadata(
    customerIds: string[],
    shop: string
  ) {
    if (customerIds.length === 0) {
      return { enhancedData: {} };
    }

    // Batch fetch CustomerTierState, TierChangeLog, and Order Summaries in parallel
    const [allTierStates, allTierChanges, orderSummariesMap] = await Promise.all([
      // Batch fetch CustomerTierState for all customers in ONE query (O(1) per customer)
      prisma.customerTierState.findMany({
        where: {
          customerId: { in: customerIds }
        }
      }),
      // Batch fetch most recent tier change log for each customer (for lastTierChange display)
      prisma.tierChangeLog.findMany({
        where: {
          customerId: { in: customerIds }
        },
        orderBy: { createdAt: 'desc' }
      }),
      // Batch fetch order summaries for all customers
      getCustomerOrderSummariesBatch(shop, customerIds),
    ]);

    // Create lookup map for O(1) access to tier states
    const tierStateByCustomer = new Map<string, typeof allTierStates[0]>();
    allTierStates.forEach(state => {
      tierStateByCustomer.set(state.customerId, state);
    });

    // Group tier changes by customer ID, keeping only the most recent one
    const lastTierChangeByCustomer = new Map<string, typeof allTierChanges[0]>();
    allTierChanges.forEach(change => {
      if (!lastTierChangeByCustomer.has(change.customerId)) {
        lastTierChangeByCustomer.set(change.customerId, change);
      }
    });

    // Process enhanced data for each customer
    const enhancedData: Record<string, any> = {};

    customerIds.forEach(customerId => {
      const tierState = tierStateByCustomer.get(customerId);
      const lastChange = lastTierChangeByCustomer.get(customerId);

      // Get last tier change from TierChangeLog (audit trail)
      const lastTierChange = lastChange ? {
        triggerType: lastChange.triggerType,
        createdAt: lastChange.createdAt instanceof Date
          ? lastChange.createdAt.toISOString()
          : lastChange.createdAt,
        note: lastChange.note || undefined,
      } : null;

      // Get override status directly from CustomerTierState (O(1) lookup!)
      let hasManualOverrideStatus = false;
      let tierSource: TierSource = 'NONE';

      if (tierState) {
        // Check if manual override is active and not expired
        if (tierState.hasManualOverride) {
          const expiry = tierState.manualOverrideExpiry;
          if (!expiry || new Date(expiry) > new Date()) {
            hasManualOverrideStatus = true;
          }
        }
        tierSource = (tierState.tierSource as TierSource) || 'NONE';
      }

      // Calculate membership status from CustomerTierState
      let membershipStatus = {
        isPurchased: false,
        needsRenewal: false,
        expiresAt: null as string | null,
        daysRemaining: null as number | null,
      };

      if (tierState) {
        const isPurchased = tierState.tierSource === 'TIER_PURCHASE' ||
                           tierState.tierSource === 'TIER_SUBSCRIPTION';

        // Determine expiry date based on tier source
        let expiryDate: Date | null = null;
        if (tierState.tierSource === 'TIER_PURCHASE' && tierState.purchaseExpiresAt) {
          expiryDate = new Date(tierState.purchaseExpiresAt);
        } else if (tierState.tierSource === 'TIER_SUBSCRIPTION' && tierState.subscriptionExpiresAt) {
          expiryDate = new Date(tierState.subscriptionExpiresAt);
        } else if (tierState.tierSource === 'MANUAL_OVERRIDE' && tierState.manualOverrideExpiry) {
          expiryDate = new Date(tierState.manualOverrideExpiry);
        }

        if (expiryDate) {
          const now = new Date();
          const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

          membershipStatus = {
            isPurchased,
            needsRenewal: daysRemaining <= 30 && daysRemaining > 0,
            expiresAt: expiryDate.toISOString(),
            daysRemaining: daysRemaining > 0 ? daysRemaining : null,
          };
        } else if (isPurchased || tierState.tierSource === 'MANUAL_OVERRIDE') {
          // Active membership with no expiry (permanent)
          membershipStatus = {
            isPurchased,
            needsRenewal: false,
            expiresAt: null,
            daysRemaining: null,
          };
        }
      }

      // Get order summary for this customer
      const orderSummary = orderSummariesMap.get(customerId);

      enhancedData[customerId] = {
        hasManualOverride: hasManualOverrideStatus,
        tierSource,
        lastTierChange,
        membershipStatus,
        orderSummary: orderSummary ? {
          orderCount: orderSummary.orderCount,
          totalSpent: orderSummary.totalSpent,
          averageOrderValue: orderSummary.averageOrderValue,
          lastOrderDate: orderSummary.lastOrderDate?.toISOString() || null,
          daysSinceLastOrder: orderSummary.daysSinceLastOrder,
          activityStatus: orderSummary.activityStatus,
        } : null,
      };
    });

    return { enhancedData };
  }

  // ============================================
  // INPUT VALIDATION CONSTANTS
  // ============================================
  const ALLOWED_SORT_KEYS = ['email', 'createdAt', 'storeCredit', 'currentTierId'] as const;
  const MAX_PAGE_SIZE = 200;
  const DEFAULT_PAGE_SIZE = 25;

  // ============================================
  // LOADER LOGIC
  // ============================================

  try {
    const { session } = await authenticate.admin(request);

    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;
    const url = new URL(request.url);
    const searchQuery = url.searchParams.get("search") || "";
    const tierFilter = url.searchParams.get("tier") || "all";

    // Validated pagination with bounds checking
    const rawPage = parseInt(url.searchParams.get("page") || "1");
    const rawPageSize = parseInt(url.searchParams.get("pageSize") || String(DEFAULT_PAGE_SIZE));
    const page = Math.max(1, isNaN(rawPage) ? 1 : rawPage);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, isNaN(rawPageSize) ? DEFAULT_PAGE_SIZE : rawPageSize));

    // Validated sort key (whitelist to prevent injection)
    const rawSortKey = url.searchParams.get("sortKey") || "createdAt";
    const sortKey = (ALLOWED_SORT_KEYS as readonly string[]).includes(rawSortKey) ? rawSortKey : "createdAt";
    const sortDirection = url.searchParams.get("sortDirection") || "desc";
    // Enhanced filter params
    const creditMin = url.searchParams.get("creditMin") || "";
    const creditMax = url.searchParams.get("creditMax") || "";
    const hasOverride = url.searchParams.get("hasOverride") || "all";
    const activityFilter = url.searchParams.get("activity") || "all";

    // ============================================
    // OPTIMIZED: Parallel fetch with database-level pagination
    // Only fetches the ~25 customers needed, not all 10,000+!
    // ============================================
    console.log('[Customers Loader] Shop:', shop);
    console.log('[Customers Loader] Search:', searchQuery, 'Tier:', tierFilter);
    console.log('[Customers Loader] Page:', page, 'PageSize:', pageSize);
    console.log('[Customers Loader] Filters - CreditMin:', creditMin, 'CreditMax:', creditMax, 'HasOverride:', hasOverride, 'Activity:', activityFilter);

    // Fetch shell data and paginated customers in parallel (CACHED via shop-data-provider)
    const [tiers, shopSettings, entitlements, paginatedResult] = await Promise.all([
      getShopTiers(shop), // CACHED
      getShopSettings(shop), // CACHED
      getEntitlements(shop),
      // NEW: Database-level pagination - only fetches customers for current page!
      fetchPaginatedCustomers(shop, {
        searchQuery,
        tierFilter,
        page,
        pageSize,
        sortKey,
        sortDirection,
        creditMin,
        creditMax,
        hasOverride,
        activityFilter,
      }),
    ]);

    const { customers, totalCount } = paginatedResult;

    console.log('[Customers Loader] Fetched', customers.length, 'customers (page', page, 'of', Math.ceil(totalCount / pageSize), ')');
    console.log('[Customers Loader] Total matching customers:', totalCount);

    // Get plan info from entitlements
    const currentPlan = entitlements.effectivePlan;
    const hasAnnualEval = entitlements.featureAnnualEval;

    // Serialize dates for tiers
    const serializedTiers = tiers.map(tier => ({
      ...tier,
      evaluationPeriod: (tier as any).evaluationPeriod || "ANNUAL",
      createdAt: tier.createdAt instanceof Date
        ? tier.createdAt.toISOString()
        : tier.createdAt,
    }));

    // ============================================
    // PHASE 1: Return essential customer data IMMEDIATELY (fastest render!)
    // ============================================
    const essentialCustomersData = formatEssentialCustomersData(
      customers,
      totalCount,
      page,
      pageSize
    );

    // ============================================
    // PHASE 2: Defer enhanced metadata (streams in after render)
    // ============================================
    const customerIds = customers.map(c => c.id);
    const enhancedMetadataPromise = fetchEnhancedCustomerMetadata(customerIds, shop);

    // ============================================
    // STATS: Synchronous, with defensive try/catch.
    //
    // Was deferred via defer() but the embedded Shopify admin iframe
    // sometimes terminates the streaming response before the deferred
    // chunks arrive — cards stayed stuck on skeleton. Inlining gives
    // ~10-50ms slower first-paint but reliable render.
    //
    // Wrapped in try/catch so a getTierDistribution failure doesn't 500
    // the whole page — falls back to empty distribution.
    // ============================================
    let statsData: { totalTiers: number; totalCustomers: number; tierDistribution: Record<string, number> } = {
      totalTiers: tiers.length,
      totalCustomers: 0,
      tierDistribution: {},
    };
    try {
      const tierDistData = await getTierDistribution(shop);
      statsData = {
        totalTiers: tiers.length,
        totalCustomers: tierDistData.totalCustomers,
        tierDistribution: tierDistData.tierDistribution,
      };
    } catch (err) {
      console.error('[Customers Loader] getTierDistribution failed (rendering with empty stats):', err);
    }

    return defer({
      // IMMEDIATE: Shell + essential customer data + stats (renders table + cards instantly!)
      tiers: serializedTiers,
      shopSettings: shopSettings ? {
        storeCurrency: shopSettings.storeCurrency,
        currencyDisplayType: shopSettings.currencyDisplayType,
      } : null,
      currentPlan,
      hasAnnualEval,
      customersData: essentialCustomersData,
      statsData,

      // DEFERRED: Per-customer enhanced metadata still streams (heavier)
      enhancedMetadata: enhancedMetadataPromise,
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
      // Get entitlements for server-side validation
      const entitlements = await getEntitlements(shop);

      switch (intent) {
        case "create": {
          const name = formData.get("name") as string;
          const minSpend = Number(formData.get("minSpend"));
          const cashbackPercent = Number(formData.get("cashbackPercent"));
          let evaluationPeriod = formData.get("evaluationPeriod") as "ANNUAL" | "LIFETIME";

          // Server-side enforcement: Force LIFETIME if user doesn't have annualEval feature
          if (evaluationPeriod === "ANNUAL" && !entitlements.featureAnnualEval) {
            evaluationPeriod = "LIFETIME";
          }

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
          const existing = await prisma.tier.findFirst({
            where: { shop, name: name.trim() },
          });

          if (existing) {
            return json({ error: `A tier named "${name}" already exists` }, { status: 400 });
          }

          // Create tier
          const storeName = shop.split('.')[0];
          const tierId = `${storeName}-${name.trim().toLowerCase().replace(/\s+/g, '-')}`;
          
          await prisma.tier.create({
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
          let evaluationPeriod = formData.get("evaluationPeriod") as "ANNUAL" | "LIFETIME";

          // Server-side enforcement: Force LIFETIME if user doesn't have annualEval feature
          if (evaluationPeriod === "ANNUAL" && !entitlements.featureAnnualEval) {
            evaluationPeriod = "LIFETIME";
          }

          if (!id) {
            return json({ error: "Tier ID is required" }, { status: 400 });
          }

          // Verify tier belongs to shop
          const existingTier = await prisma.tier.findFirst({
            where: { id, shop },
          });

          if (!existingTier) {
            return json({ error: "Tier not found" }, { status: 404 });
          }

          // Update tier
          await prisma.tier.update({
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
          const existingTier = await prisma.tier.findFirst({
            where: { id, shop },
          });

          if (!existingTier) {
            return json({ error: "Tier not found" }, { status: 404 });
          }

          // Check if customers are assigned to this tier
          const customerCount = await prisma.customer.count({
            where: { shop, currentTierId: id },
          });

          if (customerCount > 0) {
            return json({ 
              error: `Cannot delete tier with ${customerCount} assigned customers. Please reassign customers first.` 
            }, { status: 400 });
          }

          // Delete tier
          await prisma.tier.delete({
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
      console.log("[MANUAL TIER ASSIGNMENT] Admin User ID:", (session as any).userId?.toString() || "admin");
      console.log("[MANUAL TIER ASSIGNMENT] Shop:", shop);

      // Check current state before assignment
      const customerBefore = await prisma.customer.findFirst({
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
        (session as any).userId?.toString() || "admin",
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
      const customerAfter = await prisma.customer.findFirst({
        where: { id: customerId, shop },
        include: { currentTier: true }
      });
      console.log("[MANUAL TIER ASSIGNMENT] Current tier after assignment:", customerAfter?.currentTier?.name || "None");

      // Check the tier change log entry
      const latestLog = await prisma.tierChangeLog.findFirst({
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
      // Sync customers from Shopify using background sync service
      console.log("[Customers] Starting customer sync from Shopify");

      try {
        // Use the background sync service function
        await syncCustomersInBackground(shop, admin);

        // Get updated customer count
        const totalCustomers = await prisma.customer.count({
          where: { shop }
        });

        // Check sync status from shop settings
        const shopSettings = await prisma.shopSettings.findUnique({
          where: { shop }
        });

        return json({
          success: true,
          message: `Sync complete! Total customers in database: ${totalCustomers}`,
          results: {
            total: totalCustomers,
            syncCompleted: shopSettings?.customersInitialSynced || false,
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
        const transactions = await prisma.storeCreditLedger.findMany({
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
        // OPTIMIZED: Fetch customer with tier in single query to avoid separate tier fetch for Klaviyo
        const customer = await prisma.customer.findFirst({
          where: {
            id: customerId,
            shop: session.shop
          },
          include: { currentTier: true }
        });

        if (!customer || !customer.shopifyCustomerId) {
          return json({ success: false, message: "Customer not found or missing Shopify ID" });
        }

        // Get shop settings for currency
        const shopSettings = await prisma.shopSettings.findUnique({
          where: { shop: session.shop }
        });

        const currency = shopSettings?.storeCurrency || "USD";
        const _gidCustomerId = `gid://shopify/Customer/${customer.shopifyCustomerId}`;

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
          await prisma.storeCreditLedger.create({
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
          await prisma.customer.update({
            where: { id: customerId },
            data: {
              storeCredit: result.balance || newBalance,
              updatedAt: new Date()
            }
          });

          // Track Klaviyo event for cashback adjustment
          // OPTIMIZED: Use customer.currentTier from included relation instead of separate query
          try {
            await trackCashbackAdjusted(session.shop, customer, {
              amount,
              type: "ADDITION",
              reason,
              newBalance: result.balance || newBalance,
            });
          } catch (e) {
            console.error("[Klaviyo] Failed to track cashback adjustment:", e);
            // Don't fail the request if Klaviyo tracking fails
          }

          // Fetch updated transactions to return with response
          const updatedTransactions = await prisma.storeCreditLedger.findMany({
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
          await prisma.storeCreditLedger.create({
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
          await prisma.customer.update({
            where: { id: customerId },
            data: {
              storeCredit: newBalance,
              updatedAt: new Date()
            }
          });

          // Track Klaviyo event for cashback removal
          // OPTIMIZED: Use customer.currentTier from included relation instead of separate query
          try {
            await trackCashbackAdjusted(session.shop, customer, {
              amount,
              type: "REMOVAL",
              reason,
              newBalance,
            });
          } catch (e) {
            console.error("[Klaviyo] Failed to track cashback adjustment:", e);
            // Don't fail the request if Klaviyo tracking fails
          }

          // Fetch updated transactions to return with response
          const updatedTransactions = await prisma.storeCreditLedger.findMany({
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

    if (intent === "adjustPoints") {
      const customerId = formData.get("customerId") as string;
      const actionType = formData.get("actionType") as "add" | "remove";
      const amount = parseInt(formData.get("amount") as string || "0", 10);
      const reason = formData.get("reason") as string;

      if (!customerId || !actionType || isNaN(amount) || amount <= 0 || !reason) {
        return json({ success: false, message: "Invalid input data" });
      }

      try {
        const customer = await prisma.customer.findFirst({
          where: {
            id: customerId,
            shop: session.shop
          }
        });

        if (!customer) {
          return json({ success: false, message: "Customer not found" });
        }

        const { adjustPoints, getPointsBalance, getTransactionHistory } = await import("~/services/points-ledger.server");

        // Pre-check balance for removals with user-friendly error
        if (actionType === "remove") {
          const currentBalance = await getPointsBalance(customerId, session.shop);
          if (amount > currentBalance.available) {
            return json({
              success: false,
              message: `Cannot remove ${amount.toLocaleString()} points. Customer only has ${currentBalance.available.toLocaleString()} points available.`
            });
          }
        }

        const signedAmount = actionType === "add" ? amount : -amount;
        await adjustPoints(session.shop, customerId, signedAmount, reason, "admin");

        // Fetch updated balance and transactions
        const [updatedBalance, updatedHistory] = await Promise.all([
          getPointsBalance(customerId, session.shop),
          getTransactionHistory(customerId, session.shop, { limit: 50 }),
        ]);

        // Send points email notification (non-blocking)
        try {
          if (customer.email) {
            const { getCurrencyBranding } = await import("~/services/points-config.server");
            const { sendPointsEarnedEmail, sendPointsRedeemedEmail: _sendPointsRedeemedEmail } = await import("~/services/email-notifications.server");
            const branding = await getCurrencyBranding(session.shop);

            if (actionType === "add") {
              sendPointsEarnedEmail(session.shop, {
                customerId,
                email: customer.email,
                firstName: customer.firstName,
                pointsEarned: amount,
                totalBalance: updatedBalance.available,
                currencyName: branding.name,
                currencyIcon: branding.icon,
              }).catch((e: any) => console.error("[Points] Email notification failed:", e));
            }
          }
        } catch (emailError) {
          // Email is non-critical — don't block the points adjustment response
          console.error("[Points] Email notification setup error:", emailError);
        }

        return json({
          success: true,
          message: `Successfully ${actionType === "add" ? "added" : "removed"} ${amount.toLocaleString()} points`,
          newBalance: updatedBalance.available,
          newLifetime: updatedBalance.lifetime,
          transactions: updatedHistory.transactions.map(t => ({
            id: t.id,
            amount: t.amount,
            balance: t.balance,
            type: t.type,
            description: t.description,
            createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
            expiresAt: t.expiresAt instanceof Date ? t.expiresAt.toISOString() : t.expiresAt,
            metadata: t.metadata,
          }))
        });

      } catch (error) {
        console.error("[Points] Error adjusting points:", error);
        return json({
          success: false,
          message: "Failed to adjust points: " + (error instanceof Error ? error.message : "Unknown error")
        });
      }
    }

    if (intent === "syncCredit") {
      const customerId = formData.get("customerId") as string;

      if (!customerId) {
        return json({ success: false, message: "Customer ID required" });
      }

      try {
        const customer = await prisma.customer.findFirst({
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
          await prisma.storeCreditLedger.create({
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
          await prisma.customer.update({
            where: { id: customerId },
            data: {
              storeCredit: totalCredit,
              updatedAt: new Date()
            }
          });
        }

        // Fetch updated transactions to return with response
        const updatedTransactions = await prisma.storeCreditLedger.findMany({
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

    // Intent: Refund to Store Credit - Creates an official Shopify refund
    if (intent === "refundToStoreCredit") {
      const customerId = formData.get("customerId") as string;
      const orderId = formData.get("orderId") as string;
      const amount = parseFloat(formData.get("amount") as string || "0");
      const reason = formData.get("reason") as string || "Refund to store credit";

      // Validate inputs
      if (!customerId || !orderId || isNaN(amount) || amount <= 0) {
        return json({ success: false, message: "Invalid input data: customer, order, and amount are required" });
      }

      try {
        // Fetch customer from database
        const customer = await prisma.customer.findFirst({
          where: {
            id: customerId,
            shop: session.shop
          }
        });

        if (!customer || !customer.shopifyCustomerId) {
          return json({ success: false, message: "Customer not found or missing Shopify ID" });
        }

        // Get shop settings for currency
        const shopSettings = await prisma.shopSettings.findUnique({
          where: { shop: session.shop }
        });

        const currency = shopSettings?.storeCurrency || "USD";

        // Import the store credit service
        const { createStoreCreditService } = await import("~/services/shopify-store-credit.service");
        const storeCreditService = createStoreCreditService(admin, session.shop);

        // Create the refund to store credit via Shopify
        const result = await storeCreditService.refundToStoreCredit(
          orderId,
          amount,
          currency,
          reason
        );

        if (!result.success) {
          return json({
            success: false,
            message: result.error || "Failed to create refund to store credit"
          });
        }

        // Update local database - the refund adds to store credit balance
        const currentBalance = parseFloat(customer.storeCredit.toString());
        const newBalance = currentBalance + amount;

        // Create ledger entry for the refund
        await prisma.storeCreditLedger.create({
          data: {
            id: uuidv4(),
            customerId,
            shop: session.shop,
            amount: amount,
            balance: newBalance,
            type: "REFUND_CREDIT",
            shopifyOrderId: orderId,
            metadata: {
              reason,
              refundId: result.refundId,
              orderName: result.orderName,
              refundType: "STORE_CREDIT",
              adjustedBy: "admin",
              syncStatus: 'SYNCED',
              syncedAt: new Date().toISOString()
            },
            createdAt: new Date()
          }
        });

        // Update customer balance
        await prisma.customer.update({
          where: { id: customerId },
          data: {
            storeCredit: newBalance,
            updatedAt: new Date()
          }
        });

        // Fetch updated transactions to return with response
        const updatedTransactions = await prisma.storeCreditLedger.findMany({
          where: {
            customerId,
            shop: session.shop
          },
          orderBy: { createdAt: 'desc' },
          take: 50
        });

        return json({
          success: true,
          message: `Successfully created refund of ${formatCurrency(amount, shopSettings)} to store credit for order ${result.orderName}`,
          newBalance: newBalance.toString(),
          refundId: result.refundId,
          orderName: result.orderName,
          transactions: updatedTransactions.map(t => ({
            ...t,
            amount: t.amount.toString(),
            balance: t.balance.toString(),
            createdAt: t.createdAt.toISOString()
          }))
        });

      } catch (error) {
        console.error("[Credit] Error creating refund to store credit:", error);
        return json({
          success: false,
          message: "Failed to create refund: " + (error instanceof Error ? error.message : "Unknown error")
        });
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
      const customerBefore = await prisma.customer.findFirst({
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
      const recentLogs = await prisma.tierChangeLog.findMany({
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

      // Check for active tier purchases
      console.log("[TIER RECALCULATION] Checking tier purchases...");
      const tierPurchases = await prisma.tierPurchase.findMany({
        where: {
          customerId,
          shop,
          status: 'ACTIVE',
          OR: [
            { endDate: null },
            { endDate: { gte: new Date() } }
          ]
        },
        include: { tier: true }
      });
      console.log(`[TIER RECALCULATION] Found ${tierPurchases.length} active tier purchases`);
      if (tierPurchases.length > 0) {
        tierPurchases.forEach((purchase, idx) => {
          console.log(`  [Purchase ${idx + 1}]:`, {
            tierName: purchase.tier.name,
            status: purchase.status,
            endDate: purchase.endDate,
            purchasePrice: purchase.purchasePrice.toString(),
            currency: purchase.currency
          });
        });
      }

      // Check for active tier subscriptions
      console.log("[TIER RECALCULATION] Checking tier subscriptions...");
      const tierSubscriptions = await prisma.tierSubscription.findMany({
        where: {
          customerId,
          shop,
          status: 'ACTIVE'
        },
        include: { tier: true }
      });
      console.log(`[TIER RECALCULATION] Found ${tierSubscriptions.length} active tier subscriptions`);
      if (tierSubscriptions.length > 0) {
        tierSubscriptions.forEach((subscription, idx) => {
          console.log(`  [Subscription ${idx + 1}]:`, {
            tierName: subscription.tier.name,
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd,
            billingInterval: subscription.billingInterval,
            finalPrice: subscription.finalPrice.toString()
          });
        });
      }

      // Use tier resolution system (checks ALL sources: manual, subscription, purchase, spending)
      console.log("[TIER RECALCULATION] Calling tier resolution system...");
      const result = await updateCustomerToEffectiveTier(shop, customerId, {
        triggeredBy: 'MANUAL_RECALCULATION',
        orderId: undefined
      });

      console.log("[TIER RECALCULATION] Resolution result:", {
        changed: result.changed,
        previousTierId: result.previousTierId,
        newTierId: result.newTierId,
        source: result.source,
        success: result.success
      });

      // Check state after recalculation
      const customerAfter = await prisma.customer.findFirst({
        where: { id: customerId, shop },
        include: { currentTier: true }
      });
      console.log("[TIER RECALCULATION] Current tier after recalculation:", customerAfter?.currentTier?.name || "None");

      // Check override status AFTER recalculation
      const hasOverrideAfter = await hasManualOverride(customerId);
      console.log("[TIER RECALCULATION] Has manual override AFTER recalc:", hasOverrideAfter);

      // Check if a new log entry was created
      const latestLog = await prisma.tierChangeLog.findFirst({
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

      // OPTIMIZED: Batch tier name lookups into single query instead of 2 separate queries
      let previousTierName = 'None';
      let newTierName = 'None';

      const tierIds = [result.previousTierId, result.newTierId].filter((id): id is string => !!id);
      if (tierIds.length > 0) {
        const tiers = await prisma.tier.findMany({
          where: { id: { in: tierIds } },
          select: { id: true, name: true }
        });
        const tierMap = new Map(tiers.map(t => [t.id, t.name]));
        previousTierName = result.previousTierId ? tierMap.get(result.previousTierId) || 'None' : 'None';
        newTierName = result.newTierId ? tierMap.get(result.newTierId) || 'None' : 'None';
      }

      return json({
        success: true,
        message: result.changed
          ? `Tier updated from ${previousTierName} to ${newTierName} (Source: ${result.source})`
          : `Tier unchanged (${newTierName}, Source: ${result.source})`,
        result
      });
    }

    if (action === "recalculate-all") {
      console.log("========================================");
      console.log("[RECALCULATE ALL] Starting bulk tier recalculation");
      console.log("[RECALCULATE ALL] Shop:", shop);
      console.log("========================================");

      // OPTIMIZED: Get all customers with their current tier in single query
      // This eliminates N separate tier lookups during processing
      const allCustomers = await prisma.customer.findMany({
        where: { shop },
        include: { currentTier: true },
        orderBy: { email: 'asc' }
      });

      console.log(`[RECALCULATE ALL] Found ${allCustomers.length} customers to process`);

      const results = {
        total: allCustomers.length,
        processed: 0,
        changed: 0,
        unchanged: 0,
        errors: 0,
        details: [] as Array<{
          customerId: string;
          email: string;
          success: boolean;
          changed: boolean;
          previousTier: string | null;
          newTier: string | null;
          newTierId: string | null;
          source: string;
          error?: string;
        }>
      };

      // Process each customer - collect newTierIds for batch lookup later
      for (const customer of allCustomers) {
        try {
          console.log(`[RECALCULATE ALL] Processing customer ${results.processed + 1}/${allCustomers.length}: ${customer.email}`);

          // OPTIMIZED: Use tier from included relation instead of separate query
          const previousTierName = customer.currentTier?.name || null;

          // Run tier resolution
          const result = await updateCustomerToEffectiveTier(shop, customer.id, {
            triggeredBy: 'BULK_RECALCULATION',
            orderId: undefined
          });

          results.processed++;
          if (result.changed) {
            results.changed++;
          } else {
            results.unchanged++;
          }

          // Store newTierId for batch lookup later instead of individual queries
          results.details.push({
            customerId: customer.id,
            email: customer.email,
            success: result.success,
            changed: result.changed,
            previousTier: previousTierName,
            newTier: null, // Will be filled in batch lookup
            newTierId: result.newTierId || null,
            source: result.source
          });

        } catch (error) {
          results.errors++;
          results.processed++;
          console.error(`  ❌ Error processing ${customer.email}:`, error);

          results.details.push({
            customerId: customer.id,
            email: customer.email,
            success: false,
            changed: false,
            previousTier: null,
            newTier: null,
            newTierId: null,
            source: 'ERROR',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // OPTIMIZED: Batch fetch all tier names at once instead of N individual queries
      const allNewTierIds = [...new Set(results.details.map(d => d.newTierId).filter((id): id is string => !!id))];
      const tierNameMap = new Map<string, string>();
      if (allNewTierIds.length > 0) {
        const tiers = await prisma.tier.findMany({
          where: { id: { in: allNewTierIds } },
          select: { id: true, name: true }
        });
        tiers.forEach(t => tierNameMap.set(t.id, t.name));
      }

      // Fill in tier names and log results
      for (const detail of results.details) {
        detail.newTier = detail.newTierId ? tierNameMap.get(detail.newTierId) || null : null;
        if (detail.success) {
          if (detail.changed) {
            console.log(`  ✅ Changed: ${detail.previousTier || 'None'} → ${detail.newTier || 'None'} (${detail.source})`);
          } else {
            console.log(`  ⚪ Unchanged: ${detail.newTier || 'None'} (${detail.source})`);
          }
        }
      }

      console.log("========================================");
      console.log("[RECALCULATE ALL] Bulk recalculation complete");
      console.log(`[RECALCULATE ALL] Total: ${results.total}`);
      console.log(`[RECALCULATE ALL] Processed: ${results.processed}`);
      console.log(`[RECALCULATE ALL] Changed: ${results.changed}`);
      console.log(`[RECALCULATE ALL] Unchanged: ${results.unchanged}`);
      console.log(`[RECALCULATE ALL] Errors: ${results.errors}`);
      console.log("========================================");

      return json({
        success: true,
        message: `Recalculated ${results.processed} customers: ${results.changed} changed, ${results.unchanged} unchanged, ${results.errors} errors`,
        results
      });
    }

    // Bulk tier assignment
    if (action === "bulk-tier-assignment") {
      const MAX_BULK_OPERATION_SIZE = 500;
      const customerIds = JSON.parse(formData.get("customerIds") as string || "[]");
      const tierId = formData.get("tierId") as string;

      if (!Array.isArray(customerIds) || customerIds.length === 0) {
        return json({ success: false, message: "No customers selected" }, { status: 400 });
      }

      // Validate bulk operation size to prevent timeouts and resource exhaustion
      if (customerIds.length > MAX_BULK_OPERATION_SIZE) {
        return json({
          success: false,
          message: `Too many customers selected. Maximum is ${MAX_BULK_OPERATION_SIZE} per operation.`
        }, { status: 400 });
      }

      console.log(`[BULK TIER] Assigning tier ${tierId} to ${customerIds.length} customers`);

      // BATCHED PROCESSING: Process in batches of 50 for better performance
      const BATCH_SIZE = 50;
      let successCount = 0;
      let errorCount = 0;
      const failedIds: string[] = [];

      // Process customers in batches with parallel execution within each batch
      for (let i = 0; i < customerIds.length; i += BATCH_SIZE) {
        const batch = customerIds.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(customerIds.length / BATCH_SIZE);
        console.log(`[BULK TIER] Processing batch ${batchNum}/${totalBatches} (${batch.length} customers)`);

        // Execute batch in parallel
        const results = await Promise.allSettled(
          batch.map(async (customerId: string) => {
            await assignCustomerToTier(
              shop,
              customerId,
              tierId === "none" ? null : tierId,
              (session as any).userId?.toString() || "admin",
              "Bulk tier assignment",
              { permanentOverride: false }
            );
            return customerId;
          })
        );

        // Tally results
        for (const result of results) {
          if (result.status === "fulfilled") {
            successCount++;
          } else {
            errorCount++;
            // Track failed IDs for error reporting
            const failedId = batch[results.indexOf(result)];
            failedIds.push(failedId);
            console.error(`[BULK TIER] Error assigning tier to ${failedId}:`, result.reason);
          }
        }
      }

      console.log(`[BULK TIER] Complete: ${successCount} success, ${errorCount} failed`);

      return json({
        success: errorCount === 0,
        message: `Tier assigned to ${successCount} customers${errorCount > 0 ? ` (${errorCount} failed)` : ""}`,
        failedIds: failedIds.length > 0 ? failedIds : undefined
      });
    }

    // Bulk credit adjustment
    if (action === "bulk-credit-adjustment") {
      const MAX_BULK_OPERATION_SIZE = 500;
      const MAX_CREDIT_ADJUSTMENT = 10000; // $10,000 cap per adjustment
      const customerIds = JSON.parse(formData.get("customerIds") as string || "[]");
      const amount = parseFloat(formData.get("amount") as string || "0");
      const operation = formData.get("operation") as "add" | "subtract" | "set";

      if (!Array.isArray(customerIds) || customerIds.length === 0) {
        return json({ success: false, message: "No customers selected" }, { status: 400 });
      }

      // Validate bulk operation size to prevent timeouts and resource exhaustion
      if (customerIds.length > MAX_BULK_OPERATION_SIZE) {
        return json({
          success: false,
          message: `Too many customers selected. Maximum is ${MAX_BULK_OPERATION_SIZE} per operation.`
        }, { status: 400 });
      }

      if (isNaN(amount) || amount <= 0) {
        return json({ success: false, message: "Invalid amount" }, { status: 400 });
      }

      // Cap credit adjustment amount to prevent accidental large adjustments
      if (amount > MAX_CREDIT_ADJUSTMENT) {
        return json({
          success: false,
          message: `Credit adjustment amount exceeds maximum of $${MAX_CREDIT_ADJUSTMENT.toLocaleString()}. Please contact support for larger adjustments.`
        }, { status: 400 });
      }

      console.log(`[BULK CREDIT] ${operation} ${amount} for ${customerIds.length} customers`);

      // BATCHED PROCESSING: Process in batches of 25 (smaller due to API calls)
      const BATCH_SIZE = 25;
      let successCount = 0;
      let errorCount = 0;
      const failedIds: string[] = [];

      // Get shop settings for currency (single query, not per customer)
      const shopSettings = await prisma.shopSettings.findUnique({
        where: { shop }
      });
      const currency = shopSettings?.storeCurrency || "USD";

      // Import the store credit service once
      const { createStoreCreditService } = await import("~/services/shopify-store-credit.service");
      const storeCreditService = createStoreCreditService(admin, shop);

      // Pre-fetch ALL customers in one batch query instead of N individual queries
      const allCustomers = await prisma.customer.findMany({
        where: {
          id: { in: customerIds },
          shop
        }
      });
      const customerMap = new Map(allCustomers.map(c => [c.id, c]));

      // Process helper function for a single customer
      async function processCustomerCredit(customerId: string): Promise<{ success: boolean; customerId: string }> {
        const customer = customerMap.get(customerId);

        if (!customer || !customer.shopifyCustomerId) {
          return { success: false, customerId };
        }

        const currentBalance = parseFloat(customer.storeCredit.toString());
        let newBalance: number;
        let adjustmentAmount: number;

        if (operation === "add") {
          adjustmentAmount = amount;
          newBalance = currentBalance + amount;
          await storeCreditService.issueStoreCredit(
            customer.shopifyCustomerId,
            amount,
            currency,
            "Bulk credit addition"
          );
        } else if (operation === "subtract") {
          adjustmentAmount = -amount;
          newBalance = Math.max(0, currentBalance - amount);
          await storeCreditService.debitStoreCredit(
            customer.shopifyCustomerId,
            Math.min(amount, currentBalance),
            currency,
            "Bulk credit subtraction"
          );
        } else {
          // Set to exact amount
          const diff = amount - currentBalance;
          adjustmentAmount = diff;
          newBalance = amount;
          if (diff > 0) {
            await storeCreditService.issueStoreCredit(
              customer.shopifyCustomerId,
              diff,
              currency,
              "Bulk credit adjustment (set)"
            );
          } else if (diff < 0) {
            await storeCreditService.debitStoreCredit(
              customer.shopifyCustomerId,
              Math.min(-diff, currentBalance),
              currency,
              "Bulk credit adjustment (set)"
            );
          }
        }

        // ATOMIC: Update local database within transaction for data integrity
        // Both customer update and ledger entry succeed or fail together
        await prisma.$transaction(async (tx) => {
          await tx.customer.update({
            where: { id: customerId },
            data: {
              storeCredit: newBalance,
              updatedAt: new Date()
            }
          });

          await tx.storeCreditLedger.create({
            data: {
              id: uuidv4(),
              customerId,
              shop,
              amount: adjustmentAmount,
              balance: newBalance,
              type: "MANUAL_ADJUSTMENT",
              metadata: {
                reason: `Bulk ${operation} adjustment`,
                adjustedBy: "admin",
                bulkOperation: true,
                syncStatus: 'SYNCED',
                syncedAt: new Date().toISOString()
              },
              createdAt: new Date()
            }
          });
        });

        return { success: true, customerId };
      }

      // Process customers in batches with parallel execution within each batch
      for (let i = 0; i < customerIds.length; i += BATCH_SIZE) {
        const batch = customerIds.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(customerIds.length / BATCH_SIZE);
        console.log(`[BULK CREDIT] Processing batch ${batchNum}/${totalBatches} (${batch.length} customers)`);

        // Execute batch in parallel
        const results = await Promise.allSettled(
          batch.map((customerId: string) => processCustomerCredit(customerId))
        );

        // Tally results
        for (let j = 0; j < results.length; j++) {
          const result = results[j];
          if (result.status === "fulfilled" && result.value.success) {
            successCount++;
          } else {
            errorCount++;
            failedIds.push(batch[j]);
            if (result.status === "rejected") {
              console.error(`[BULK CREDIT] Error adjusting credit for ${batch[j]}:`, result.reason);
            }
          }
        }
      }

      console.log(`[BULK CREDIT] Complete: ${successCount} success, ${errorCount} failed`);

      return json({
        success: errorCount === 0,
        message: `Credit adjusted for ${successCount} customers${errorCount > 0 ? ` (${errorCount} failed)` : ""}`,
        failedIds: failedIds.length > 0 ? failedIds : undefined
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

function _TierIcon({ tierName }: { tierName: string }) {
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

function _CustomerAvatar({ email }: { email: string }) {
  const initials = email.substring(0, 2).toUpperCase();
  return (
    <Avatar customer size="md" initials={initials} />
  );
}

/**
 * Mobile-optimised vertical card row for the member list.
 * Used in place of IndexTable when the viewport is below the `sm` breakpoint
 * (~640px). Stacks customer info, tier/activity badges, store credit, and
 * action buttons on separate lines so nothing gets squeezed.
 */
function CustomerMobileCard({
  customer,
  shopSettings,
  onView,
  onViewOrders,
  onAssignTier,
}: {
  customer: Customer;
  shopSettings: any;
  onView: () => void;
  onViewOrders: () => void;
  onAssignTier: () => void;
}) {
  const initials = (customer.email || '?').substring(0, 2).toUpperCase();
  const summary = customer.orderSummary;
  const activityLabel =
    summary?.activityStatus === 'active' ? 'Active' :
    summary?.activityStatus === 'at_risk' ? 'At Risk' :
    summary?.activityStatus === 'dormant' ? 'Dormant' :
    summary?.activityStatus === 'new' ? 'New' :
    summary ? 'No Orders' : null;
  const activityTone =
    summary?.activityStatus === 'active' ? 'success' :
    summary?.activityStatus === 'at_risk' ? 'warning' :
    summary?.activityStatus === 'dormant' ? 'critical' :
    summary?.activityStatus === 'new' ? 'info' :
    'attention';

  return (
    <Card padding="0">
      <Box padding="300">
        <BlockStack gap="300">
          {/* Header: avatar + email + ID — taps to open detail */}
          <button
            type="button"
            onClick={onView}
            style={{
              all: 'unset',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              width: '100%',
            }}
          >
            <Avatar customer size="md" initials={initials} />
            <BlockStack gap="050">
              <Text variant="bodyMd" fontWeight="semibold" as="span">
                {customer.email}
              </Text>
              <Text variant="bodySm" tone="subdued" as="span">
                ID: {customer.shopifyCustomerId}
              </Text>
            </BlockStack>
          </button>

          {/* Badges row */}
          <InlineStack gap="200" wrap>
            {customer.currentTier ? (
              <Badge tone={customer.membershipStatus?.isPurchased ? 'info' : 'success'}>
                {customer.currentTier.name}
              </Badge>
            ) : (
              <Badge tone="attention">No tier</Badge>
            )}
            {activityLabel && (
              <Badge tone={activityTone as any}>{activityLabel}</Badge>
            )}
            {customer.hasManualOverride && (
              <Badge tone="info">Manual</Badge>
            )}
            {customer.membershipStatus?.needsRenewal && (
              <Badge tone="warning">{`Expires ${customer.membershipStatus.daysRemaining}d`}</Badge>
            )}
          </InlineStack>

          {/* Metrics row: store credit + order count */}
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="050">
              <Text variant="bodySm" tone="subdued" as="span">Store credit</Text>
              <StoreCreditDisplay
                amount={customer.storeCredit}
                shopSettings={shopSettings}
                size="small"
              />
            </BlockStack>
            {summary && (
              <BlockStack gap="050" align="end">
                <Text variant="bodySm" tone="subdued" as="span">Orders</Text>
                <Text variant="bodyMd" fontWeight="semibold" as="span">
                  {summary.orderCount}
                </Text>
              </BlockStack>
            )}
          </InlineStack>

          {/* Action buttons — full width, primary action prominent */}
          <InlineStack gap="200">
            <div style={{ flex: 1 }}>
              <Button onClick={onViewOrders} fullWidth>Orders</Button>
            </div>
            <div style={{ flex: 1 }}>
              <Button onClick={onAssignTier} variant="primary" fullWidth>
                Assign Tier
              </Button>
            </div>
          </InlineStack>
        </BlockStack>
      </Box>
    </Card>
  );
}

// ============================================
// SKELETON LOADING STATE
// ============================================

function _CustomersTableSkeleton() {
  return (
    <Box padding="400">
      <BlockStack gap="400">
        <SkeletonDisplayText size="small" />
        <SkeletonBodyText lines={10} />
      </BlockStack>
    </Box>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

// Customer Table Content Component (receives resolved data)
function CustomersTableContent({
  customers,
  pagination,
  shopSettings,
  tiers: _tiers,
  isCalculating,
  calculatingCustomerId,
  handleViewCustomer,
  handleManualTierAssignment,
  handleCalculateSingle: _handleCalculateSingle,
  selectedResources,
  onSelectionChange,
  onBulkTierAssignment,
  onBulkCreditAdjustment,
  onExportSelected,
  density = 'comfortable',
}: {
  customers: Customer[];
  pagination: any;
  shopSettings: any;
  tiers: any[];
  isCalculating: boolean;
  calculatingCustomerId: string | null;
  handleViewCustomer: (id: string, tabIndex?: number) => void;
  handleManualTierAssignment: (customer: Customer) => void;
  handleCalculateSingle: (customerId: string) => void;
  selectedResources: string[];
  onSelectionChange: (selectionType: "single" | "page" | "all", isSelecting: boolean, selection?: string) => void;
  onBulkTierAssignment: () => void;
  onBulkCreditAdjustment: () => void;
  onExportSelected: () => void;
  density?: 'compact' | 'comfortable';
}) {
  const navigation = useNavigation();
  const [visibleRows, setVisibleRows] = useState<number[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();

  const resourceName = {
    singular: 'customer',
    plural: 'customers',
  };

  // Pagination handlers
  const handlePreviousPage = useCallback(() => {
    if (pagination?.hasPrevPage) {
      const newParams = new URLSearchParams(searchParams);
      newParams.set("page", String(pagination.currentPage - 1));
      setSearchParams(newParams);
    }
  }, [pagination, searchParams, setSearchParams]);

  const handleNextPage = useCallback(() => {
    if (pagination?.hasNextPage) {
      const newParams = new URLSearchParams(searchParams);
      newParams.set("page", String(pagination.currentPage + 1));
      setSearchParams(newParams);
    }
  }, [pagination, searchParams, setSearchParams]);

  // Stagger animation on mount
  useEffect(() => {
    if (customers.length > 0) {
      const timers: NodeJS.Timeout[] = [];
      customers.forEach((_, index) => {
        const timer = setTimeout(() => {
          setVisibleRows(prev => [...prev, index]);
        }, index * 30);
        timers.push(timer);
      });
      return () => timers.forEach(clearTimeout);
    }
  }, [customers.length]);

  const rowMarkup = customers.map((customer, index) => {
    const isVisible = visibleRows.includes(index);
    const _isProcessing = calculatingCustomerId === customer.id;

    return (
      <IndexTable.Row
        id={customer.id}
        key={customer.id}
        position={index}
        selected={selectedResources.includes(customer.id)}
        onClick={() => handleViewCustomer(customer.id)}
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
                <Badge tone={customer.membershipStatus?.isPurchased ? "info" : "success"}>
                  {`${customer.currentTier.name}`}
                </Badge>
              ) : (
                <Badge tone="attention">No tier</Badge>
              )}
            </InlineStack>
            {customer.membershipStatus?.isPurchased && customer.membershipStatus.needsRenewal && (
              <InlineStack gap="100">
                <Icon source={AlertTriangleIcon} tone="warning" />
                <Text variant="bodySm" tone="caution" as="span">
                  Expires in {customer.membershipStatus.daysRemaining} days
                </Text>
              </InlineStack>
            )}
            {customer.hasManualOverride && (
              <InlineStack gap="100">
                <Icon source={InfoIcon} tone="info" />
                <Text variant="bodySm" tone="subdued" as="span">
                  Manual
                </Text>
              </InlineStack>
            )}
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <BlockStack gap="100">
            {customer.orderSummary ? (
              <>
                <InlineStack gap="200" align="start">
                  <Badge tone={
                    customer.orderSummary.activityStatus === 'active' ? 'success' :
                    customer.orderSummary.activityStatus === 'at_risk' ? 'warning' :
                    customer.orderSummary.activityStatus === 'dormant' ? 'critical' :
                    customer.orderSummary.activityStatus === 'new' ? 'info' :
                    'attention'
                  }>
                    {customer.orderSummary.activityStatus === 'active' ? 'Active' :
                     customer.orderSummary.activityStatus === 'at_risk' ? 'At Risk' :
                     customer.orderSummary.activityStatus === 'dormant' ? 'Dormant' :
                     customer.orderSummary.activityStatus === 'new' ? 'New' :
                     'No Orders'}
                  </Badge>
                </InlineStack>
                <Text variant="bodySm" tone="subdued" as="span">
                  {customer.orderSummary.orderCount} order{customer.orderSummary.orderCount !== 1 ? 's' : ''}
                  {customer.orderSummary.lastOrderDate && customer.orderSummary.daysSinceLastOrder !== null && (
                    <> · {customer.orderSummary.daysSinceLastOrder === 0 ? 'Today' :
                          customer.orderSummary.daysSinceLastOrder === 1 ? '1 day ago' :
                          `${customer.orderSummary.daysSinceLastOrder}d ago`}</>
                  )}
                </Text>
              </>
            ) : (
              <Text variant="bodySm" tone="subdued" as="span">—</Text>
            )}
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div style={{ textAlign: 'right' }}>
            <StoreCreditDisplay
              amount={customer.storeCredit}
              shopSettings={shopSettings}
              size="small"
            />
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="200" align="end">
            <Button
              size="slim"
              variant="plain"
              onClick={() => {
                handleViewCustomer(customer.id, 2); // 2 = Orders tab
              }}
            >
              Orders
            </Button>
            <Button
              size="slim"
              onClick={() => {
                handleManualTierAssignment(customer);
              }}
            >
              Assign Tier
            </Button>
          </InlineStack>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  const isLoading = navigation.state === "loading" || navigation.state === "submitting" || isCalculating;

  const emptyStateMarkup = (
    <EmptyState
      heading="No customers found"
      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
    >
      <p>No customers match your search criteria.</p>
    </EmptyState>
  );

  // Switch to vertical card list on small + medium viewports — IndexTable's
  // condensed mode still renders horizontally and feels cramped on phones
  // and small tablets. Polaris breakpoints: sm = 490px, md = 768px.
  // Use mdDown so cards render up to 767px (covers all phones + portrait
  // tablets); IndexTable resumes at 768px+.
  const breakpoints = useBreakpoints();
  const isMobile = breakpoints.mdDown;

  return (
    <>
      <Divider />
      {/* Density-mode CSS: compact tightens IndexTable cell padding ~40%. */}
      <style>{`
        .members-density-compact .Polaris-IndexTable__TableCell {
          padding-block: 8px !important;
          padding-inline: 12px !important;
        }
        .members-density-compact .Polaris-IndexTable__TableHeading {
          padding-block: 8px !important;
        }
      `}</style>
      <Box>
        <div className={density === 'compact' ? 'members-density-compact' : ''}>
        {customers.length === 0 ? (
          <Box padding="400">
            {emptyStateMarkup}
          </Box>
        ) : isMobile ? (
          <BlockStack gap="200">
            {customers.map((customer) => (
              <CustomerMobileCard
                key={customer.id}
                customer={customer}
                shopSettings={shopSettings}
                onView={() => handleViewCustomer(customer.id)}
                onViewOrders={() => handleViewCustomer(customer.id, 2)}
                onAssignTier={() => handleManualTierAssignment(customer)}
              />
            ))}
          </BlockStack>
        ) : (
          <IndexTable
            resourceName={resourceName}
            itemCount={customers.length}
            headings={[
              { title: 'Customer' },
              { title: 'Tier' },
              { title: 'Activity' },
              { title: 'Store Credit', alignment: 'end' },
              { title: 'Actions', alignment: 'end' },
            ]}
            loading={isLoading}
            selectable={true}
            selectedItemsCount={selectedResources.length}
            onSelectionChange={(selectionType: any, isSelecting: any, selection: any) => {
              onSelectionChange(selectionType, isSelecting, selection);
            }}
            bulkActions={[
              {
                content: 'Assign Tier',
                onAction: onBulkTierAssignment,
              },
              {
                content: 'Adjust Credit',
                onAction: onBulkCreditAdjustment,
              },
              {
                content: 'Export Selected',
                onAction: onExportSelected,
              },
            ]}
          >
            {rowMarkup}
          </IndexTable>
        )}
        </div>
      </Box>

      {/* Bottom pagination */}
      {pagination && pagination.totalPages > 1 && (
        <>
          <Divider />
          <Box padding="400">
            <InlineStack align="center" gap="300">
              <Button
                accessibilityLabel="Previous page"
                onClick={handlePreviousPage}
                disabled={!pagination.hasPrevPage}
                size="slim"
              >
                Previous
              </Button>
              <InlineStack gap="200" blockAlign="center">
                <Text variant="bodySm" as="span" tone="subdued">Page</Text>
                <Badge tone="info">{pagination.currentPage}</Badge>
                <Text variant="bodySm" as="span" tone="subdued">of {pagination.totalPages}</Text>
              </InlineStack>
              <Button
                accessibilityLabel="Next page"
                onClick={handleNextPage}
                disabled={!pagination.hasNextPage}
                size="slim"
              >
                Next
              </Button>
            </InlineStack>
          </Box>
        </>
      )}
    </>
  );
}

export default function Customers() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const _navigation = useNavigation();
  const fetcher = useFetcher();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // State - Initialize from URL params
  const [_searchQuery, _setSearchQuery] = useState(searchParams.get("search") || "");
  const [tierFilter, setTierFilter] = useState(searchParams.get("tier") || "all");
  const [queryValue, setQueryValue] = useState(searchParams.get("search") || "");
  const [pageSize, setPageSize] = useState(parseInt(searchParams.get("pageSize") || "25"));
  const [density, setDensity] = useState<'compact' | 'comfortable'>(() => {
    if (typeof window === 'undefined') return 'comfortable';
    return (window.localStorage.getItem('rewardspro:members:density') as 'compact' | 'comfortable') || 'comfortable';
  });
  const handleDensityChange = useCallback((next: 'compact' | 'comfortable') => {
    setDensity(next);
    try { window.localStorage.setItem('rewardspro:members:density', next); } catch { /* private browsing */ }
  }, []);
  const [isCalculating, _setIsCalculating] = useState(false);
  const [calculatingCustomerId, setCalculatingCustomerId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitialTab, setModalInitialTab] = useState(0);
  const [_visibleRows, _setVisibleRows] = useState<number[]>([]);
  const { toast, showInfo, showSuccess, showError, hideToast } = useToast();

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

  // Enhanced customer data state (from deferred promise)
  const [enhancedCustomers, setEnhancedCustomers] = useState<Customer[]>([]);
  const [enhancedDataLoaded, setEnhancedDataLoaded] = useState(false);

  // Stats data state (from deferred promise)
  const [statsData, setStatsData] = useState<{
    totalTiers: number;
    totalCustomers: number;
    tierDistribution: Record<string, number>;
    totalStoreCredit?: number;
  } | null>(null);
  const [statsLoaded, setStatsLoaded] = useState(false);

  // Bulk selection state
  const [selectedResources, setSelectedResources] = useState<string[]>([]);
  const [bulkTierModalActive, setBulkTierModalActive] = useState(false);
  const [bulkCreditModalActive, setBulkCreditModalActive] = useState(false);
  const [bulkTierSelection, setBulkTierSelection] = useState<string>("");
  const [bulkCreditAmount, setBulkCreditAmount] = useState("");
  const [bulkCreditOperation, setBulkCreditOperation] = useState<"add" | "subtract" | "set">("add");
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Enhanced filter state
  const [creditMinFilter, setCreditMinFilter] = useState(searchParams.get("creditMin") || "");
  const [creditMaxFilter, setCreditMaxFilter] = useState(searchParams.get("creditMax") || "");
  const [hasOverrideFilter, setHasOverrideFilter] = useState(searchParams.get("hasOverride") || "all");
  const [activityFilter, setActivityFilter] = useState(searchParams.get("activity") || "all");
  const [showFilters, setShowFilters] = useState(false);

  // Animation refs
  const _tableRef = useRef<HTMLDivElement>(null);
  const _isFirstRender = useRef(true);

  // Get current page from URL params
  const _currentPage = parseInt(searchParams.get("page") || "1");

  // Use enhanced customers if loaded, otherwise fall back to base customers
  // NOTE: Must be defined before callbacks that use it (handleSelectionChange)
  const displayCustomers = enhancedDataLoaded
    ? enhancedCustomers
    : (data.customersData?.customers || []);

  // Format currency helper
  const _formatAmount = useCallback((amount: number) => {
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
    const newTier = value[0] || "all";
    setTierFilter(newTier); // Update local state
    const newParams = new URLSearchParams(searchParams);
    if (newTier !== "all") {
      newParams.set("tier", newTier);
    } else {
      newParams.delete("tier");
    }
    newParams.set("page", "1"); // Reset to page 1 on filter change
    setSearchParams(newParams);
  }, [searchParams, setSearchParams]);

  // Handle clear all filters
  const handleClearAll = useCallback(() => {
    setQueryValue("");
    setTierFilter("all");
    setCreditMinFilter("");
    setCreditMaxFilter("");
    setHasOverrideFilter("all");
    setActivityFilter("all");
    const newParams = new URLSearchParams();
    newParams.set("pageSize", String(pageSize));
    setSearchParams(newParams);
  }, [pageSize, setSearchParams]);

  // Handle credit range filter
  const handleCreditRangeChange = useCallback((min: string, max: string) => {
    setCreditMinFilter(min);
    setCreditMaxFilter(max);
    const newParams = new URLSearchParams(searchParams);
    if (min) {
      newParams.set("creditMin", min);
    } else {
      newParams.delete("creditMin");
    }
    if (max) {
      newParams.set("creditMax", max);
    } else {
      newParams.delete("creditMax");
    }
    newParams.set("page", "1");
    setSearchParams(newParams);
  }, [searchParams, setSearchParams]);

  // Handle override filter
  const handleOverrideFilterChange = useCallback((value: string) => {
    setHasOverrideFilter(value);
    const newParams = new URLSearchParams(searchParams);
    if (value !== "all") {
      newParams.set("hasOverride", value);
    } else {
      newParams.delete("hasOverride");
    }
    newParams.set("page", "1");
    setSearchParams(newParams);
  }, [searchParams, setSearchParams]);

  // Handle activity filter
  const handleActivityFilterChange = useCallback((value: string) => {
    setActivityFilter(value);
    const newParams = new URLSearchParams(searchParams);
    if (value !== "all") {
      newParams.set("activity", value);
    } else {
      newParams.delete("activity");
    }
    newParams.set("page", "1");
    setSearchParams(newParams);
  }, [searchParams, setSearchParams]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (tierFilter !== "all") count++;
    if (creditMinFilter) count++;
    if (creditMaxFilter) count++;
    if (hasOverrideFilter !== "all") count++;
    if (activityFilter !== "all") count++;
    return count;
  }, [tierFilter, creditMinFilter, creditMaxFilter, hasOverrideFilter, activityFilter]);

  // Handle page size change
  const handlePageSizeChange = useCallback((value: string) => {
    setPageSize(parseInt(value)); // Update local state
    const newParams = new URLSearchParams(searchParams);
    newParams.set("pageSize", value);
    newParams.set("page", "1"); // Reset to page 1
    setSearchParams(newParams);
  }, [searchParams, setSearchParams]);


  // Calculate all tiers - fire and forget pattern
  const _handleCalculateAll = useCallback(() => {
    // Show immediate feedback without blocking UI
    showInfo("Tier calculation started for all customers. This runs in the background.");

    const formData = new FormData();
    formData.append("action", "calculate-all");
    submit(formData, { method: "post" });
  }, [submit, showInfo]);

  // Sync customers from Shopify - fire and forget pattern
  const handleSyncCustomers = useCallback(() => {
    // Show immediate feedback without blocking UI
    showInfo("Customer sync started. This runs in the background and may take a few minutes.");

    const formData = new FormData();
    formData.append("action", "sync-customers");
    submit(formData, { method: "post" });
  }, [submit, showInfo]);

  // Shared CSV download helper - handles fetch, blob creation, and download trigger
  const downloadCSV = useCallback(async (
    exportUrl: string,
    progressMessage: string,
    successMessage: string,
    errorMessage: string
  ) => {
    try {
      showInfo(progressMessage);
      const response = await fetch(exportUrl);

      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      // Check for export limit warning from headers
      const exportLimit = response.headers.get('X-Export-Limit');
      const plan = response.headers.get('X-Plan');

      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch ? filenameMatch[1] : `members-export-${new Date().toISOString().split('T')[0]}.csv`;

      // Create blob from response and trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      // Show success with export limit info if applicable
      if (exportLimit && exportLimit !== 'Infinity' && plan) {
        showSuccess(`${successMessage} (${plan} plan limit: ${parseInt(exportLimit).toLocaleString()} rows)`);
      } else {
        showSuccess(successMessage);
      }
    } catch (error) {
      console.error('[CSV Export] Error:', error);
      showError(errorMessage);
    }
  }, [showSuccess, showError, showInfo]);

  // Export customers to CSV (using fetch to maintain session context)
  const handleExportCSV = useCallback(async () => {
    // Build export URL with current filters
    const exportParams = new URLSearchParams();
    if (tierFilter !== "all") {
      exportParams.set("tier", tierFilter);
    }
    if (queryValue) {
      exportParams.set("search", queryValue);
    }

    const exportUrl = `/api/members/export?${exportParams.toString()}`;
    await downloadCSV(
      exportUrl,
      "Preparing export...",
      "Export completed successfully.",
      "Failed to export CSV. Please try again."
    );
  }, [tierFilter, queryValue, downloadCSV]);

  // Export selected customers to CSV
  const handleExportSelected = useCallback(async () => {
    if (selectedResources.length === 0) {
      showError("No customers selected");
      return;
    }

    const exportUrl = `/api/members/export?ids=${selectedResources.join(",")}`;
    await downloadCSV(
      exportUrl,
      `Exporting ${selectedResources.length} selected customers...`,
      `Successfully exported ${selectedResources.length} customers.`,
      "Failed to export selected customers. Please try again."
    );
  }, [selectedResources, showError, downloadCSV]);

  // Handle bulk selection change
  const handleSelectionChange = useCallback((
    selectionType: "single" | "page" | "all",
    isSelecting: boolean,
    selection?: string
  ) => {
    if (selectionType === "single" && selection) {
      setSelectedResources(prev =>
        isSelecting
          ? [...prev, selection]
          : prev.filter(id => id !== selection)
      );
    } else if (selectionType === "page") {
      const pageIds = displayCustomers.map((c: any) => c.id);
      setSelectedResources(prev =>
        isSelecting
          ? [...new Set([...prev, ...pageIds])]
          : prev.filter(id => !pageIds.includes(id))
      );
    } else if (selectionType === "all") {
      // For "all" we only select current page since we don't have all IDs loaded
      const pageIds = displayCustomers.map((c: any) => c.id);
      setSelectedResources(isSelecting ? pageIds : []);
    }
  }, [displayCustomers]);

  // Open bulk tier assignment modal
  const handleBulkTierAssignment = useCallback(() => {
    setBulkTierSelection("");
    setBulkTierModalActive(true);
  }, []);

  // Submit bulk tier assignment
  const handleSubmitBulkTier = useCallback(async () => {
    if (!bulkTierSelection) {
      showError("Please select a tier");
      return;
    }
    if (selectedResources.length === 0) {
      showError("No customers selected");
      return;
    }

    setBulkProcessing(true);
    const formData = new FormData();
    formData.append("action", "bulk-tier-assignment");
    formData.append("customerIds", JSON.stringify(selectedResources));
    formData.append("tierId", bulkTierSelection);

    submit(formData, { method: "post" });
    setBulkTierModalActive(false);
    setBulkProcessing(false);
    setSelectedResources([]);
  }, [bulkTierSelection, selectedResources, submit, showError]);

  // Open bulk credit adjustment modal
  const handleBulkCreditAdjustment = useCallback(() => {
    setBulkCreditAmount("");
    setBulkCreditOperation("add");
    setBulkCreditModalActive(true);
  }, []);

  // Submit bulk credit adjustment
  const handleSubmitBulkCredit = useCallback(async () => {
    const amount = parseFloat(bulkCreditAmount);
    if (isNaN(amount) || amount <= 0) {
      showError("Please enter a valid amount");
      return;
    }
    if (selectedResources.length === 0) {
      showError("No customers selected");
      return;
    }

    setBulkProcessing(true);
    const formData = new FormData();
    formData.append("action", "bulk-credit-adjustment");
    formData.append("customerIds", JSON.stringify(selectedResources));
    formData.append("amount", bulkCreditAmount);
    formData.append("operation", bulkCreditOperation);

    submit(formData, { method: "post" });
    setBulkCreditModalActive(false);
    setBulkProcessing(false);
    setSelectedResources([]);
  }, [bulkCreditAmount, bulkCreditOperation, selectedResources, submit, showError]);

  // Clear selection
  const _handleClearSelection = useCallback(() => {
    setSelectedResources([]);
  }, []);

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
      showError("Please provide a reason for the manual tier change");
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
  }, [manualTierCustomer, manualTierSelection, manualTierReason, permanentOverride, submit, showError]);

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


  // Handle fetcher response for single customer
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && calculatingCustomerId) {
      setCalculatingCustomerId(null);

      const data = fetcher.data as Record<string, any>;
      if (data.success) {
        showSuccess(data.message ? String(data.message) : 'Success');
      } else {
        showError(data.message ? String(data.message) : 'Error');
      }
    }
  }, [fetcher.state, fetcher.data, calculatingCustomerId, showSuccess, showError]);

  // Handle action results for bulk operations - completion feedback
  useEffect(() => {
    if (!actionData) return;
    const ad = actionData as any;

    // Check if we have sync results
    if ('results' in ad && ad.results &&
        typeof ad.results === 'object') {

      // Check for sync completion (new format)
      if ('total' in ad.results && 'syncCompleted' in ad.results) {
        const results = ad.results as { total: number; syncCompleted: boolean };
        showSuccess(ad.message || `Sync complete! Total customers: ${results.total}`);
      }
      // Check for calculate-all results
      else if ('total' in ad.results && 'changed' in ad.results) {
        const results = ad.results as { total: number; changed: number; errors: number };
        if (results.errors > 0) {
          showError(ad.message || `Calculation completed with errors: ${results.errors}`);
        } else {
          showSuccess(ad.message || `Calculated tiers for ${results.total} customers. ${results.changed} tiers updated.`);
        }
      }
      // Legacy format support (old sync results)
      else if ('imported' in ad.results && 'updated' in ad.results && 'errors' in ad.results) {
        const results = ad.results as { imported: number; updated: number; errors: number; total: number; details: any[] };
        if (results.errors > 0) {
          showError(`Sync complete with errors! Imported: ${results.imported}, Updated: ${results.updated}, Errors: ${results.errors}`);
        } else {
          showSuccess(`Sync complete! Imported: ${results.imported}, Updated: ${results.updated}`);
        }
      }
      // Check for recalculate-all results
      else if ('processed' in ad.results && 'changed' in ad.results) {
        const results = ad.results as { processed: number; changed: number; unchanged: number; errors: number };
        if (results.errors > 0) {
          showError(ad.message || `Recalculation completed with ${results.errors} errors`);
        } else {
          showSuccess(ad.message || `Recalculated ${results.processed} customers: ${results.changed} changed`);
        }
      }
    } else if (ad.success && ad.message) {
      // Other successful operations with message
      showSuccess(ad.message as string);
    } else if (!ad.success && ad.message) {
      // Error operations
      showError(ad.message as string);
    }
  }, [actionData, showSuccess, showError]);

  // Resolve deferred enhanced metadata and merge with customers
  useEffect(() => {
    const baseCustomers = data.customersData?.customers || [];

    // If we have a deferred enhancedMetadata promise, resolve it
    if (data.enhancedMetadata && typeof data.enhancedMetadata.then === 'function') {
      setEnhancedDataLoaded(false);

      data.enhancedMetadata
        .then((result: { enhancedData: Record<string, any> }) => {
          const { enhancedData } = result;

          // Merge enhanced data with base customers
          const merged = baseCustomers.map(customer => ({
            ...customer,
            hasManualOverride: enhancedData[customer.id]?.hasManualOverride ?? false,
            tierSource: enhancedData[customer.id]?.tierSource ?? 'NONE',
            lastTierChange: enhancedData[customer.id]?.lastTierChange ?? null,
            membershipStatus: enhancedData[customer.id]?.membershipStatus ?? {
              isPurchased: false,
              needsRenewal: false,
              expiresAt: null,
              daysRemaining: null,
            },
            orderSummary: enhancedData[customer.id]?.orderSummary ?? null,
          }));

          setEnhancedCustomers(merged as any);
          setEnhancedDataLoaded(true);
        })
        .catch((error: Error) => {
          console.error('Failed to load enhanced metadata:', error);
          // Fall back to base customers with placeholders
          setEnhancedCustomers(baseCustomers as any);
          setEnhancedDataLoaded(true);
        });
    } else {
      // No deferred data, use base customers
      setEnhancedCustomers(baseCustomers as any);
      setEnhancedDataLoaded(true);
    }
  }, [data.customersData?.customers, data.enhancedMetadata]);

  // Resolve stats data — supports both Promise (legacy deferred) and
  // synchronous object (current). Loader now returns sync; the Promise
  // branch is kept defensively in case defer() is reintroduced later.
  useEffect(() => {
    const sd = data.statsData as any;
    if (!sd) {
      setStatsLoaded(true);
      return;
    }
    if (typeof sd.then === 'function') {
      setStatsLoaded(false);
      (sd as Promise<any>)
        .then((result) => {
          setStatsData(result);
          setStatsLoaded(true);
        })
        .catch((error: Error) => {
          console.error('Failed to load stats data:', error);
          setStatsLoaded(true);
        });
    } else {
      setStatsData(sd);
      setStatsLoaded(true);
    }
  }, [data.statsData]);

  // Customer count display helper (using deferred data pattern)
  const getCustomerCountText = (customersData: any) => {
    if (!customersData?.pagination) return '0';
    const { currentPage, pageSize, totalItems } = customersData.pagination;
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, totalItems);
    return start > totalItems ? `${totalItems}` : `${start} - ${end} of ${totalItems}`;
  };

  // Toast markup
  const toastMarkup = toast.active ? (
    <Toast
      content={toast.content}
      error={toast.error}
      duration={toast.duration}
      onDismiss={hideToast}
    />
  ) : null;

  return (
    <Frame>
      <Page
        title="Customers"
        subtitle="Manage customer tiers and store credit"
        secondaryActions={[
          {
            content: "Export CSV",
            icon: ExportIcon,
            onAction: handleExportCSV,
          },
          {
            content: "Sync Customers",
            icon: RefreshIcon,
            onAction: handleSyncCustomers,
          }
        ]}
      >
        {/* Quick Stats Summary Cards */}
        <Box paddingBlockEnd="400">
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
            {/* Total Members Card */}
            <Card>
              <Box padding="400">
                <BlockStack gap="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="bodySm" tone="subdued" as="p">Total Members</Text>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'var(--p-color-bg-fill-info)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Icon source={PersonIcon} tone="info" />
                    </div>
                  </InlineStack>
                  {statsLoaded && statsData ? (
                    <Text variant="headingLg" as="p" fontWeight="bold">
                      {statsData.totalCustomers.toLocaleString()}
                    </Text>
                  ) : (
                    <SkeletonDisplayText size="medium" />
                  )}
                </BlockStack>
              </Box>
            </Card>

            {/* Active Tiers Card */}
            <Card>
              <Box padding="400">
                <BlockStack gap="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="bodySm" tone="subdued" as="p">Active Tiers</Text>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'var(--p-color-bg-fill-success)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Icon source={ChartVerticalIcon} tone="success" />
                    </div>
                  </InlineStack>
                  <Text variant="headingLg" as="p" fontWeight="bold">
                    {data.tiers.length}
                  </Text>
                  {statsLoaded && statsData && data.tiers.length > 0 && (
                    <Box paddingBlockStart="100">
                      <InlineStack gap="100" wrap={false}>
                        {data.tiers.slice(0, 4).map((tier, _index) => {
                          const count = statsData.tierDistribution[tier.id] || 0;
                          const percentage = statsData.totalCustomers > 0
                            ? Math.round((count / statsData.totalCustomers) * 100)
                            : 0;
                          const style = getTierStyle(tier.name);
                          return (
                            <Tooltip key={tier.id} content={`${tier.name}: ${count} (${percentage}%)`}>
                              <div style={{
                                flex: Math.max(percentage, 5),
                                height: '6px',
                                borderRadius: '3px',
                                background: (style as any).badgeColor || style.borderColor,
                                minWidth: '8px',
                              }} />
                            </Tooltip>
                          );
                        })}
                      </InlineStack>
                    </Box>
                  )}
                </BlockStack>
              </Box>
            </Card>

            {/* Tier Distribution Card */}
            <Card>
              <Box padding="400">
                <BlockStack gap="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="bodySm" tone="subdued" as="p">Top Tier Members</Text>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'var(--p-color-bg-fill-warning)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Icon source={StarIcon} tone="warning" />
                    </div>
                  </InlineStack>
                  {statsLoaded && statsData ? (
                    <>
                      {(() => {
                        // Find top tier (highest minSpend with customers)
                        const topTier = data.tiers
                          .filter(t => (statsData.tierDistribution[t.id] || 0) > 0)
                          .sort((a, b) => b.minSpend - a.minSpend)[0];
                        const topTierCount = topTier ? statsData.tierDistribution[topTier.id] || 0 : 0;
                        return (
                          <>
                            <Text variant="headingLg" as="p" fontWeight="bold">
                              {topTierCount.toLocaleString()}
                            </Text>
                            {topTier && (
                              <Text variant="bodySm" tone="subdued" as="p">
                                in {topTier.name} tier
                              </Text>
                            )}
                          </>
                        );
                      })()}
                    </>
                  ) : (
                    <SkeletonDisplayText size="medium" />
                  )}
                </BlockStack>
              </Box>
            </Card>

            {/* No Tier Members Card */}
            <Card>
              <Box padding="400">
                <BlockStack gap="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="bodySm" tone="subdued" as="p">Without Tier</Text>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'var(--p-color-bg-fill-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Icon source={AlertTriangleIcon} tone="subdued" />
                    </div>
                  </InlineStack>
                  {statsLoaded && statsData ? (
                    <>
                      {(() => {
                        const tieredCount = Object.values(statsData.tierDistribution).reduce((a, b) => a + b, 0);
                        const noTierCount = statsData.totalCustomers - tieredCount;
                        const percentage = statsData.totalCustomers > 0
                          ? Math.round((noTierCount / statsData.totalCustomers) * 100)
                          : 0;
                        return (
                          <>
                            <Text variant="headingLg" as="p" fontWeight="bold">
                              {noTierCount.toLocaleString()}
                            </Text>
                            <Text variant="bodySm" tone="subdued" as="p">
                              {percentage}% of members
                            </Text>
                          </>
                        );
                      })()}
                    </>
                  ) : (
                    <SkeletonDisplayText size="medium" />
                  )}
                </BlockStack>
              </Box>
            </Card>
          </InlineGrid>
        </Box>

        <Card padding="0">
          <Box padding="400">
            <BlockStack gap="400">
              {/* Header with count, density toggle, page size selector — wraps on narrow viewports */}
              <InlineStack align="space-between" blockAlign="center" wrap>
                <InlineStack gap="200" align="start" blockAlign="center">
                  <Text variant="headingMd" as="h3">
                    Customers
                  </Text>
                  <Badge>
                    {getCustomerCountText(data.customersData)}
                  </Badge>
                </InlineStack>

                <InlineStack gap="200" blockAlign="center" wrap>
                  {/* Density toggle — local-only preference, persists in localStorage */}
                  <Tooltip content={density === 'compact' ? 'Switch to comfortable rows' : 'Switch to compact rows'}>
                    <Button
                      onClick={() => handleDensityChange(density === 'compact' ? 'comfortable' : 'compact')}
                      size="slim"
                      variant={density === 'compact' ? 'primary' : 'tertiary'}
                    >
                      {density === 'compact' ? 'Compact' : 'Comfortable'}
                    </Button>
                  </Tooltip>
                  <Select
                    label="Items per page"
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
              </InlineStack>

              {/* Search and Filters — wraps on narrow viewports so the
                  tier select + filter button don't push off-screen. */}
              <InlineStack gap="300" align="start" blockAlign="center" wrap>
                <div style={{ flex: '1 1 240px', maxWidth: '400px', minWidth: 0 }}>
                  <TextField
                    label=""
                    placeholder="Search by name, email, or ID"
                    value={queryValue}
                    onChange={handleSearch}
                    clearButton
                    onClearButtonClick={handleQueryValueRemove}
                    prefix={<Icon source={SearchIcon} />}
                    autoComplete="off"
                  />
                </div>
                <Select
                  label=""
                  options={[
                    { label: "All Tiers", value: "all" },
                    { label: "No Tier", value: "none" },
                    ...data.tiers.map(tier => ({
                      label: `${tier.name} (${tier.cashbackPercent}%)`,
                      value: tier.id,
                    })),
                  ]}
                  value={tierFilter}
                  onChange={(value) => handleFiltersChange([value])}
                />
                <Popover
                  active={showFilters}
                  activator={
                    <Button
                      onClick={() => setShowFilters(!showFilters)}
                      icon={FilterIcon}
                      disclosure={showFilters ? "up" : "down"}
                    >
                      {`More Filters${activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}`}
                    </Button>
                  }
                  onClose={() => setShowFilters(false)}
                  sectioned
                >
                  <Box padding="300" minWidth="320px">
                    <BlockStack gap="400">
                      {/* Store Credit Range */}
                      <BlockStack gap="200">
                        <Text variant="headingSm" as="h3">Store Credit Range</Text>
                        <InlineStack gap="200" blockAlign="center">
                          <Box width="120px">
                            <TextField
                              label=""
                              type="number"
                              value={creditMinFilter}
                              onChange={(value) => handleCreditRangeChange(value, creditMaxFilter)}
                              placeholder="Min"
                              prefix="$"
                              autoComplete="off"
                            />
                          </Box>
                          <Text as="span" tone="subdued">to</Text>
                          <Box width="120px">
                            <TextField
                              label=""
                              type="number"
                              value={creditMaxFilter}
                              onChange={(value) => handleCreditRangeChange(creditMinFilter, value)}
                              placeholder="Max"
                              prefix="$"
                              autoComplete="off"
                            />
                          </Box>
                        </InlineStack>
                      </BlockStack>

                      <Divider />

                      {/* Manual Override Filter */}
                      <BlockStack gap="200">
                        <Text variant="headingSm" as="h3">Manual Override</Text>
                        <ChoiceList
                          title=""
                          choices={[
                            { label: "All customers", value: "all" },
                            { label: "With manual override", value: "yes" },
                            { label: "Without manual override", value: "no" },
                          ]}
                          selected={[hasOverrideFilter]}
                          onChange={([value]) => handleOverrideFilterChange(value)}
                        />
                      </BlockStack>

                      {/* Activity Filter */}
                      <BlockStack gap="200">
                        <Text variant="bodyMd" fontWeight="semibold" as="p">
                          Customer Activity
                        </Text>
                        <ChoiceList
                          title=""
                          titleHidden
                          choices={[
                            { label: "All activity levels", value: "all" },
                            { label: "Active (ordered in 30 days)", value: "active" },
                            { label: "At Risk (30-60 days)", value: "at_risk" },
                            { label: "Dormant (60+ days)", value: "dormant" },
                            { label: "New (no orders yet)", value: "new" },
                            { label: "Never ordered", value: "never_ordered" },
                          ]}
                          selected={[activityFilter]}
                          onChange={([value]) => handleActivityFilterChange(value)}
                        />
                      </BlockStack>

                      <Divider />

                      {/* Apply/Clear Buttons */}
                      <InlineStack gap="200" align="end">
                        <Button onClick={() => {
                          setCreditMinFilter("");
                          setCreditMaxFilter("");
                          setHasOverrideFilter("all");
                          setActivityFilter("all");
                          handleCreditRangeChange("", "");
                          handleOverrideFilterChange("all");
                          handleActivityFilterChange("all");
                        }} variant="plain">
                          Reset filters
                        </Button>
                        <Button onClick={() => setShowFilters(false)} variant="primary">
                          Done
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </Box>
                </Popover>
                {(queryValue || activeFilterCount > 0) && (
                  <Button onClick={handleClearAll} variant="plain">
                    Clear all
                  </Button>
                )}
              </InlineStack>

              {/* Active Filter Tags */}
              {activeFilterCount > 0 && (
                <InlineStack gap="200" wrap>
                  {tierFilter !== "all" && (
                    <Tag onRemove={() => handleFiltersChange(["all"])}>
                      Tier: {tierFilter === "none" ? "No Tier" : data.tiers.find(t => t.id === tierFilter)?.name || tierFilter}
                    </Tag>
                  )}
                  {creditMinFilter && (
                    <Tag onRemove={() => handleCreditRangeChange("", creditMaxFilter)}>
                      Min Credit: ${creditMinFilter}
                    </Tag>
                  )}
                  {creditMaxFilter && (
                    <Tag onRemove={() => handleCreditRangeChange(creditMinFilter, "")}>
                      Max Credit: ${creditMaxFilter}
                    </Tag>
                  )}
                  {hasOverrideFilter !== "all" && (
                    <Tag onRemove={() => handleOverrideFilterChange("all")}>
                      Override: {hasOverrideFilter === "yes" ? "Has Override" : "No Override"}
                    </Tag>
                  )}
                  {activityFilter !== "all" && (
                    <Tag onRemove={() => handleActivityFilterChange("all")}>
                      Activity: {activityFilter === "active" ? "Active" :
                                 activityFilter === "at_risk" ? "At Risk" :
                                 activityFilter === "dormant" ? "Dormant" :
                                 activityFilter === "new" ? "New" :
                                 activityFilter === "never_ordered" ? "Never Ordered" : activityFilter}
                    </Tag>
                  )}
                </InlineStack>
              )}
            </BlockStack>
          </Box>

        {/* Customer Table - Now loads immediately with enhanced data streaming in! */}
        <CustomersTableContent
          customers={displayCustomers as Customer[]}
          pagination={data.customersData?.pagination}
          shopSettings={data.shopSettings}
          tiers={data.tiers}
          isCalculating={isCalculating}
          calculatingCustomerId={calculatingCustomerId}
          handleViewCustomer={handleViewCustomer}
          handleManualTierAssignment={handleManualTierAssignment}
          handleCalculateSingle={handleCalculateSingle}
          selectedResources={selectedResources}
          onSelectionChange={handleSelectionChange}
          onBulkTierAssignment={handleBulkTierAssignment}
          onBulkCreditAdjustment={handleBulkCreditAdjustment}
          onExportSelected={handleExportSelected}
          density={density}
        />
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
            customerEmail=""
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
                options={
                  data.hasAnnualEval
                    ? [
                        { label: "Annual (resets yearly)", value: "ANNUAL" },
                        { label: "Lifetime (cumulative)", value: "LIFETIME" },
                      ]
                    : [
                        { label: "Lifetime (cumulative)", value: "LIFETIME" },
                      ]
                }
                value={tierFormData.evaluationPeriod}
                onChange={(value) => setTierFormData({ ...tierFormData, evaluationPeriod: value as "ANNUAL" | "LIFETIME" })}
                helpText={
                  !data.hasAnnualEval
                    ? "Annual evaluation period is only available on Ultra plan and above. Upgrade to unlock this feature."
                    : "Choose how tier status is calculated: annually reset or lifetime cumulative"
                }
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

        {/* Bulk Tier Assignment Modal */}
        <Modal
          open={bulkTierModalActive}
          onClose={() => {
            setBulkTierModalActive(false);
            setBulkTierSelection("");
          }}
          title={`Assign Tier to ${selectedResources.length} Customers`}
          primaryAction={{
            content: bulkProcessing ? "Assigning..." : "Assign Tier",
            onAction: handleSubmitBulkTier,
            disabled: !bulkTierSelection || bulkProcessing,
            loading: bulkProcessing,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => {
                setBulkTierModalActive(false);
                setBulkTierSelection("");
              },
            },
          ]}
        >
          <Modal.Section>
            <FormLayout>
              <Banner tone="info">
                <Text as="p" variant="bodySm">
                  This will assign the selected tier to {selectedResources.length} customers.
                  Any existing manual overrides will be replaced.
                </Text>
              </Banner>
              <Select
                label="Select Tier"
                options={[
                  { label: "-- Select a tier --", value: "" },
                  { label: "No tier (remove from program)", value: "none" },
                  ...data.tiers.map(tier => ({
                    label: `${tier.name} (${tier.cashbackPercent}% cashback)`,
                    value: tier.id,
                  })),
                ]}
                value={bulkTierSelection}
                onChange={setBulkTierSelection}
              />
            </FormLayout>
          </Modal.Section>
        </Modal>

        {/* Bulk Credit Adjustment Modal */}
        <Modal
          open={bulkCreditModalActive}
          onClose={() => {
            setBulkCreditModalActive(false);
            setBulkCreditAmount("");
            setBulkCreditOperation("add");
          }}
          title={`Adjust Credit for ${selectedResources.length} Customers`}
          primaryAction={{
            content: bulkProcessing ? "Processing..." : "Adjust Credit",
            onAction: handleSubmitBulkCredit,
            disabled: !bulkCreditAmount || parseFloat(bulkCreditAmount) <= 0 || bulkProcessing,
            loading: bulkProcessing,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => {
                setBulkCreditModalActive(false);
                setBulkCreditAmount("");
              },
            },
          ]}
        >
          <Modal.Section>
            <FormLayout>
              <Banner tone="info">
                <Text as="p" variant="bodySm">
                  This will adjust the store credit for {selectedResources.length} customers.
                </Text>
              </Banner>
              <Select
                label="Operation"
                options={[
                  { label: "Add credit", value: "add" },
                  { label: "Subtract credit", value: "subtract" },
                  { label: "Set to exact amount", value: "set" },
                ]}
                value={bulkCreditOperation}
                onChange={(value) => setBulkCreditOperation(value as "add" | "subtract" | "set")}
              />
              <TextField
                label="Amount"
                type="number"
                value={bulkCreditAmount}
                onChange={setBulkCreditAmount}
                prefix="$"
                autoComplete="off"
                helpText={
                  bulkCreditOperation === "add"
                    ? "Amount to add to each customer's credit"
                    : bulkCreditOperation === "subtract"
                    ? "Amount to subtract from each customer's credit"
                    : "Set each customer's credit to this exact amount"
                }
              />
            </FormLayout>
          </Modal.Section>
        </Modal>

        {/* Bottom spacer to prevent content from touching the bottom */}
        <div style={{ height: '80px', width: '100%' }} aria-hidden="true" />
      </Page>
      
      {/* Toast notifications */}
      {toastMarkup}
      
      {/* Page animations handled by PageAnimation system - see app/components/PageAnimation */}
    </Frame>
  );
}