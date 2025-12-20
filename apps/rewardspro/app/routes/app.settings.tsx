import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigation } from "@remix-run/react";
export { ErrorBoundary } from "../components/ErrorBoundary";
import {
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Select,
  RadioButton,
  Button,
  Banner,
  BlockStack,
  InlineStack,
  InlineGrid,
  Text,
  Divider,
  Box,
  Badge,
  Modal,
  Checkbox,
  Tabs,
  Toast,
  Frame,
  ProgressBar,
  Spinner,
} from "@shopify/polaris";
import { RefreshIcon } from "~/utils/polaris-icons";
import { useState, useCallback, useEffect, useRef } from "react";
import { useToast } from "~/hooks/useToast";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { useNavigate } from "@remix-run/react";
import { getCreditSyncStats } from "../services/credit-sync-job.server";
import { getCustomerSyncStats } from "../services/customer-sync-job.server";
import { getOrderSyncStats } from "../services/order-sync-job.server";
import { createOrderSyncService } from "../services/order-sync.service";
import { MANAGED_PLANS } from "~/constants/billing.constants";
import { countOrdersWithFallback, getOrCreateMonthlyCount } from "~/utils/order-count-strategies";
import { formatCurrency } from "~/utils/currency";
import { v4 as uuidv4 } from "uuid";

// ============= TYPES =============
type Currency = 
  | "USD" | "EUR" | "GBP" | "CAD" | "AUD" | "JPY" | "CHF" | "CNY" 
  | "SEK" | "NZD" | "NOK" | "MXN" | "SGD" | "HKD" | "KRW" | "TRY" 
  | "INR" | "RUB" | "BRL" | "ZAR" | "AED" | "PLN" | "DKK" | "THB" 
  | "IDR" | "HUF" | "CZK" | "ILS" | "CLP" | "PHP" | "RON" | "MYR";

type CurrencyDisplayType = "SYMBOL" | "CODE";

type RecalculationFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY";

type WidgetThemeMode = "LIGHT" | "DARK" | "CUSTOM";

type ShopSettings = {
  id: string;
  shop: string;
  storeName: string;
  storeUrl: string;
  storeCurrency: Currency;
  currencyDisplayType: CurrencyDisplayType;
  timezone: string;
  tierRecalculationFrequency: RecalculationFrequency;
  tierRecalculationEnabled: boolean;
  tierRecalculationLastRun: string | null;
  // Base Tier Settings
  autoAssignBaseTier: boolean;
  defaultBaseTierId: string | null;
  // Widget Theme Settings
  widgetThemeMode: WidgetThemeMode;
  widgetPrimaryColor: string | null;
  widgetBackgroundColor: string | null;
  widgetTextColor: string | null;
  widgetAccentColor: string | null;
  widgetBorderRadius: number | null;
  widgetFontFamily: string | null;
  // Store Business Metrics
  averageProfitMargin: number | null;
  averageCogsPercent: number | null;
  averageShippingCost: number | null;
  averageOrderValue: number | null;
  targetRoiPercent: number | null;
  metricsLastUpdated: string | null;
  createdAt: string;
  updatedAt: string;
};

type OrderStats = {
  orderCount: number;
  customerCount: number;
  totalCashback: number;
  lastSync: string | null;
  oldestOrder: string | null;
  newestOrder: string | null;
  discrepancies: number;
};

type BillingPlan = {
  id: string;
  shop: string;
  planName: string;
  status: string;
  monthlyPrice: number;
  usageCap: number | null;
  currentPeriodEnd: string | null;
  cap80AlertSent: boolean;
  cap90AlertSent: boolean;
  lastCapAlert: string | null;
  metadata: any;
  createdAt: string;
  updatedAt: string;
};

type TierOption = {
  id: string;
  name: string;
  minSpend: number;
};

type CreditSyncStats = {
  customersWithCredit: number;
  totalCreditBalance: number;
  lastSyncJob: {
    id: string;
    status: string;
    completedAt: string | null;
    updatedCount: number;
    totalImported: number;
  } | null;
};

type CustomerSyncStats = {
  totalCustomers: number;
  customersWithTier: number;
  customersInitialSynced: boolean;
  lastSyncJob: {
    id: string;
    status: string;
    completedAt: string | null;
    createdCount: number;
    updatedCount: number;
    processedCount: number;
  } | null;
};

type OrderSyncStats = {
  totalOrders: number;
  ordersWithCashback: number;
  totalCashbackAmount: number;
  dateRange: {
    oldest: string | null;
    newest: string | null;
  };
  lastSyncJob: {
    id: string;
    status: string;
    completedAt: string | null;
    createdCount: number;
    updatedCount: number;
    processedCount: number;
  } | null;
};

type LoaderData = {
  settings: ShopSettings;
  shop: string;
  shopifyTimezone?: string;
  orderStats?: OrderStats;
  // Tiers for base tier selection
  tiers: TierOption[];
  // Sync stats
  creditSyncStats: CreditSyncStats;
  customerSyncStats: CustomerSyncStats;
  orderSyncStats: OrderSyncStats;
  // Billing data
  currentPlan?: BillingPlan | null;
  activeSubscription?: any;
  monthlyOrderUsage?: {
    orderCount: number;
    planLimit: number;
    planName: string;
    projectedOrders: number;
  } | null;
  currentMonth?: string;
  daysRemaining?: number;
};

// ============= CONSTANTS =============
const CURRENCY_OPTIONS = [
  { label: "🇺🇸 US Dollar (USD)", value: "USD", symbol: "$" },
  { label: "🇪🇺 Euro (EUR)", value: "EUR", symbol: "€" },
  { label: "🇬🇧 British Pound (GBP)", value: "GBP", symbol: "£" },
  { label: "🇨🇦 Canadian Dollar (CAD)", value: "CAD", symbol: "C$" },
  { label: "🇦🇺 Australian Dollar (AUD)", value: "AUD", symbol: "A$" },
  { label: "🇯🇵 Japanese Yen (JPY)", value: "JPY", symbol: "¥" },
  { label: "🇨🇭 Swiss Franc (CHF)", value: "CHF", symbol: "CHF" },
  { label: "🇨🇳 Chinese Yuan (CNY)", value: "CNY", symbol: "¥" },
  { label: "🇸🇪 Swedish Krona (SEK)", value: "SEK", symbol: "kr" },
  { label: "🇳🇿 New Zealand Dollar (NZD)", value: "NZD", symbol: "NZ$" },
  { label: "🇳🇴 Norwegian Krone (NOK)", value: "NOK", symbol: "kr" },
  { label: "🇲🇽 Mexican Peso (MXN)", value: "MXN", symbol: "$" },
  { label: "🇸🇬 Singapore Dollar (SGD)", value: "SGD", symbol: "S$" },
  { label: "🇭🇰 Hong Kong Dollar (HKD)", value: "HKD", symbol: "HK$" },
  { label: "🇰🇷 South Korean Won (KRW)", value: "KRW", symbol: "₩" },
  { label: "🇹🇷 Turkish Lira (TRY)", value: "TRY", symbol: "₺" },
  { label: "🇮🇳 Indian Rupee (INR)", value: "INR", symbol: "₹" },
  { label: "🇷🇺 Russian Ruble (RUB)", value: "RUB", symbol: "₽" },
  { label: "🇧🇷 Brazilian Real (BRL)", value: "BRL", symbol: "R$" },
  { label: "🇿🇦 South African Rand (ZAR)", value: "ZAR", symbol: "R" },
  { label: "🇦🇪 UAE Dirham (AED)", value: "AED", symbol: "د.إ" },
  { label: "🇵🇱 Polish Zloty (PLN)", value: "PLN", symbol: "zł" },
  { label: "🇩🇰 Danish Krone (DKK)", value: "DKK", symbol: "kr" },
  { label: "🇹🇭 Thai Baht (THB)", value: "THB", symbol: "฿" },
  { label: "🇮🇩 Indonesian Rupiah (IDR)", value: "IDR", symbol: "Rp" },
  { label: "🇭🇺 Hungarian Forint (HUF)", value: "HUF", symbol: "Ft" },
  { label: "🇨🇿 Czech Koruna (CZK)", value: "CZK", symbol: "Kč" },
  { label: "🇮🇱 Israeli Shekel (ILS)", value: "ILS", symbol: "₪" },
  { label: "🇨🇱 Chilean Peso (CLP)", value: "CLP", symbol: "$" },
  { label: "🇵🇭 Philippine Peso (PHP)", value: "PHP", symbol: "₱" },
  { label: "🇷🇴 Romanian Leu (RON)", value: "RON", symbol: "lei" },
  { label: "🇲🇾 Malaysian Ringgit (MYR)", value: "MYR", symbol: "RM" },
];

// ============= HELPERS =============
const getCurrencySymbol = (currency: Currency): string => {
  const option = CURRENCY_OPTIONS.find(opt => opt.value === currency);
  return option?.symbol || currency;
};

const formatCurrencyExample = (currency: Currency, displayType: CurrencyDisplayType): string => {
  const symbol = getCurrencySymbol(currency);
  const amount = "100.00";
  
  if (displayType === "SYMBOL") {
    return `${symbol}${amount}`;
  } else {
    return `${currency} ${amount}`;
  }
};

// getCurrentTimeInTimezone function removed - timezone display simplified

const validateUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// Billing Helper Functions
const calculateDaysRemaining = (): number => {
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const diffTime = Math.abs(endOfMonth.getTime() - now.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

const getCurrentMonthName = (): string => {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  return months[new Date().getMonth()];
};

const calculateProjectedOrders = (currentOrders: number, daysRemaining: number): number => {
  const now = new Date();
  const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysPassed = totalDaysInMonth - daysRemaining;

  if (daysPassed === 0) return currentOrders;

  const dailyRate = currentOrders / daysPassed;
  return Math.ceil(dailyRate * totalDaysInMonth);
};

// ============= RATE LIMITING =============
const rateLimitMap = new Map<string, number[]>();

const checkRateLimit = (shop: string) => {
  const now = Date.now();
  const windowMs = 60000; // 1 minute window
  const maxRequests = 10; // 10 requests per minute for settings

  const key = `settings:${shop}`;
  const timestamps = rateLimitMap.get(key) || [];
  
  const recentTimestamps = timestamps.filter(t => now - t < windowMs);
  
  if (recentTimestamps.length >= maxRequests) {
    throw new Response("Too many requests. Please wait a moment.", { status: 429 });
  }
  
  recentTimestamps.push(now);
  rateLimitMap.set(key, recentTimestamps);
};

// ============= LOADER =============
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session, admin, billing } = await authenticate.admin(request);
    
    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;

    // Fetch shop details from Shopify to get timezone and currency
    let shopifyTimezone = "America/New_York"; // Default fallback
    let shopifyCurrency = "USD"; // Default fallback
    let shopName = shop.split('.')[0];
    
    try {
      const shopQuery = `#graphql
        query getShopDetails {
          shop {
            name
            currencyCode
            ianaTimezone
            url
            billingAddress {
              country
            }
          }
        }
      `;
      
      const response = await admin.graphql(shopQuery);
      const shopData = await response.json();
      
      if (shopData.data?.shop) {
        shopifyTimezone = shopData.data.shop.ianaTimezone || shopifyTimezone;
        shopifyCurrency = shopData.data.shop.currencyCode || shopifyCurrency;
        shopName = shopData.data.shop.name || shopName;
      }
    } catch (error) {
      console.error("Failed to fetch shop details from Shopify:", error);
      // Continue with defaults
    }

    // Try to fetch existing settings
    let settings = await db.shopSettings.findUnique({
      where: { shop },
    });

    // If no settings exist, create with Shopify defaults
    if (!settings) {
      const now = new Date();
      settings = await db.shopSettings.create({
        data: {
          id: crypto.randomUUID(),
          shop,
          storeName: shopName,
          storeUrl: `https://${shop}`,
          storeCurrency: shopifyCurrency as Currency,
          currencyDisplayType: "SYMBOL",
          timezone: shopifyTimezone,
          createdAt: now,
          updatedAt: now,
        },
      });
    } else {
      // Update timezone if it differs from Shopify
      if (settings.timezone !== shopifyTimezone) {
        settings = await db.shopSettings.update({
          where: { id: settings.id },
          data: {
            timezone: shopifyTimezone,
            updatedAt: new Date(),
          },
        });
      }
    }

    // Fetch tiers for base tier selection
    const tiers = await db.tier.findMany({
      where: { shop },
      select: {
        id: true,
        name: true,
        minSpend: true,
      },
      orderBy: { minSpend: 'asc' }
    });

    // Fetch order statistics
    let orderStats: OrderStats | undefined;
    try {
      const orderAggregates = await db.order.aggregate({
        where: { shop },
        _count: { id: true },
        _sum: { cashbackAmount: true },
        _max: { createdAt: true, shopifyCreatedAt: true },
        _min: { shopifyCreatedAt: true }
      });

      const customerCount = await db.customer.count({
        where: { shop }
      });

      // Check for discrepancies (simplified check)
      // Count orders that have been processed but have no ledger entries
      const processedOrders = await db.order.count({
        where: {
          shop,
          cashbackProcessed: true
        }
      });

      const ordersWithLedger = await db.storeCreditLedger.count({
        where: {
          shop,
          orderId: { not: null },
          type: 'CASHBACK_EARNED'
        }
      });

      const discrepancies = processedOrders - ordersWithLedger;

      orderStats = {
        orderCount: orderAggregates._count.id || 0,
        customerCount,
        totalCashback: Number(orderAggregates._sum.cashbackAmount || 0),
        lastSync: orderAggregates._max.createdAt?.toISOString() || null,
        oldestOrder: orderAggregates._min.shopifyCreatedAt?.toISOString() || null,
        newestOrder: orderAggregates._max.shopifyCreatedAt?.toISOString() || null,
        discrepancies: discrepancies
      };
    } catch (error) {
      console.error("Failed to fetch order statistics:", error);
      // Continue without order stats
    }

    // Fetch billing data
    const { FREE_PLAN, MONTHLY_PLAN, ANNUAL_PLAN } = await import("../shopify.server");

    let activeSubscription = null;
    if (billing) {
      try {
        const { hasActivePayment, appSubscriptions } = await billing.check({
          plans: [FREE_PLAN, MONTHLY_PLAN, ANNUAL_PLAN],
          isTest: process.env.NODE_ENV === 'development',
        });

        if (hasActivePayment && appSubscriptions?.length > 0) {
          activeSubscription = appSubscriptions[0];
        }
      } catch (error) {
        console.error("[Settings Page] Error checking subscription:", error);
      }
    }

    // Fetch billing subscription from database (new GraphQL billing)
    const billingSubscription = await db.billingSubscription.findUnique({
      where: { shop },
    }).catch(() => null); // Gracefully handle if table doesn't exist yet

    // Get monthly order usage
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const daysRemaining = calculateDaysRemaining();

    // Count orders using multiple strategies (like billing-v2 does)
    let orderCount = 0;
    let orderCountStrategy = "unknown";

    try {
      console.log(`[Settings Page] Attempting to count orders for ${shop} - ${getCurrentMonthName()} ${year}`);

      // Use countOrdersWithFallback which tries multiple strategies
      // Note: countOrdersDateExtraction removed - causes SerializationException with Aurora Data API
      const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
      const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

      const result = await countOrdersWithFallback(shop, startOfMonth, endOfMonth);
      orderCount = result.count;
      orderCountStrategy = result.strategy;

      // If still 0, try pre-aggregated count
      if (orderCount === 0) {
        console.log("[Settings Page] Trying pre-aggregated count");
        orderCount = await getOrCreateMonthlyCount(shop, year, month);
        orderCountStrategy = "PreAggregated";
      }
    } catch (error) {
      console.error("[Settings Page] Error counting orders:", error);
      // Fallback to simple total count
      orderCount = await db.order.count({ where: { shop } });
      orderCountStrategy = "TotalFallback";
    }

    // Determine plan based on active subscription using shared plan constants
    let planLimit = MANAGED_PLANS["RewardsPro Free"].ordersIncluded; // 100
    let planName = 'RewardsPro Free';

    // Map subscription names to plan constants
    if (activeSubscription?.name) {
      const planConfig = MANAGED_PLANS[activeSubscription.name];
      if (planConfig) {
        planLimit = planConfig.ordersIncluded;
        planName = activeSubscription.name;
      }
    }

    const projectedOrders = calculateProjectedOrders(orderCount, daysRemaining);

    const monthlyOrderUsage = {
      orderCount,
      planLimit,
      planName,
      projectedOrders,
      countStrategy: orderCountStrategy // Include which strategy worked
    };

    console.log(`[Settings Page] Final count: ${orderCount} using strategy: ${orderCountStrategy}`);

    // Serialize dates for JSON
    const serializedSettings = {
      ...settings,
      createdAt: settings.createdAt instanceof Date
        ? settings.createdAt.toISOString()
        : settings.createdAt,
      updatedAt: settings.updatedAt instanceof Date
        ? settings.updatedAt.toISOString()
        : settings.updatedAt,
    };

    // Serialize billing subscription (new GraphQL billing)
    const serializedPlan = billingSubscription ? {
      ...billingSubscription,
      planName: billingSubscription.planName || planName,
      cappedAmount: billingSubscription.cappedAmount ? Number(billingSubscription.cappedAmount) : null,
      balanceUsed: billingSubscription.balanceUsed ? Number(billingSubscription.balanceUsed) : 0,
      balanceRemaining: billingSubscription.balanceRemaining ? Number(billingSubscription.balanceRemaining) : null,
      currentPeriodEnd: billingSubscription.currentPeriodEnd instanceof Date
        ? billingSubscription.currentPeriodEnd.toISOString()
        : billingSubscription.currentPeriodEnd,
      createdAt: billingSubscription.createdAt instanceof Date
        ? billingSubscription.createdAt.toISOString()
        : String(billingSubscription.createdAt),
      updatedAt: billingSubscription.updatedAt instanceof Date
        ? billingSubscription.updatedAt.toISOString()
        : String(billingSubscription.updatedAt),
    } : null;

    // Serialize tiers (minSpend is Decimal)
    const serializedTiers = tiers.map(tier => ({
      id: tier.id,
      name: tier.name,
      minSpend: Number(tier.minSpend),
    }));

    // Fetch credit sync stats
    const creditSyncStatsRaw = await getCreditSyncStats(shop);
    const creditSyncStats: CreditSyncStats = {
      customersWithCredit: creditSyncStatsRaw.customersWithCredit,
      totalCreditBalance: creditSyncStatsRaw.totalCreditBalance,
      lastSyncJob: creditSyncStatsRaw.lastSyncJob ? {
        id: creditSyncStatsRaw.lastSyncJob.id,
        status: creditSyncStatsRaw.lastSyncJob.status,
        completedAt: creditSyncStatsRaw.lastSyncJob.completedAt?.toISOString() || null,
        updatedCount: creditSyncStatsRaw.lastSyncJob.updatedCount,
        totalImported: creditSyncStatsRaw.lastSyncJob.totalImported,
      } : null,
    };

    // Fetch customer sync stats
    const customerSyncStatsRaw = await getCustomerSyncStats(shop);
    const customerSyncStats: CustomerSyncStats = {
      totalCustomers: customerSyncStatsRaw.totalCustomers,
      customersWithTier: customerSyncStatsRaw.customersWithTier,
      customersInitialSynced: customerSyncStatsRaw.customersInitialSynced,
      lastSyncJob: customerSyncStatsRaw.lastSyncJob ? {
        id: customerSyncStatsRaw.lastSyncJob.id,
        status: customerSyncStatsRaw.lastSyncJob.status,
        completedAt: customerSyncStatsRaw.lastSyncJob.completedAt?.toISOString() || null,
        createdCount: customerSyncStatsRaw.lastSyncJob.createdCount,
        updatedCount: customerSyncStatsRaw.lastSyncJob.updatedCount,
        processedCount: customerSyncStatsRaw.lastSyncJob.processedCount,
      } : null,
    };

    // Fetch order sync stats
    const orderSyncStatsRaw = await getOrderSyncStats(shop);
    const orderSyncStats: OrderSyncStats = {
      totalOrders: orderSyncStatsRaw.totalOrders,
      ordersWithCashback: orderSyncStatsRaw.ordersWithCashback,
      totalCashbackAmount: orderSyncStatsRaw.totalCashbackAmount,
      dateRange: {
        oldest: orderSyncStatsRaw.dateRange.oldest?.toISOString() || null,
        newest: orderSyncStatsRaw.dateRange.newest?.toISOString() || null,
      },
      lastSyncJob: orderSyncStatsRaw.lastSyncJob ? {
        id: orderSyncStatsRaw.lastSyncJob.id,
        status: orderSyncStatsRaw.lastSyncJob.status,
        completedAt: orderSyncStatsRaw.lastSyncJob.completedAt?.toISOString() || null,
        createdCount: orderSyncStatsRaw.lastSyncJob.createdCount,
        updatedCount: orderSyncStatsRaw.lastSyncJob.updatedCount,
        processedCount: orderSyncStatsRaw.lastSyncJob.processedCount,
      } : null,
    };

    return json<LoaderData>({
      settings: serializedSettings as ShopSettings,
      shop,
      shopifyTimezone, // Pass Shopify's timezone to show it's synced
      orderStats,
      // Tiers for base tier selection
      tiers: serializedTiers,
      // Sync stats
      creditSyncStats,
      customerSyncStats,
      orderSyncStats,
      // Billing data
      currentPlan: serializedPlan,
      activeSubscription,
      monthlyOrderUsage,
      currentMonth: getCurrentMonthName(),
      daysRemaining,
    });
  } catch (error) {
    console.error("Settings loader error:", error);
    throw new Response("Failed to load settings", { status: 500 });
  }
};

// ============= ACTION =============
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { session, admin, billing } = await authenticate.admin(request);

    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;

    // Get active subscription for downgrade handling
    let activeSubscription = null;
    if (billing) {
      try {
        const { appSubscriptions } = await billing.check({
          plans: [],
          isTest: process.env.NODE_ENV === 'development',
        });
        activeSubscription = appSubscriptions?.[0];
      } catch (err) {
        console.log("[Settings Action] Could not fetch active subscription");
      }
    }
    
    // Rate limiting
    checkRateLimit(shop);

    const formData = await request.formData();
    const intent = formData.get("intent") as string;

    // Handle order sync
    if (intent === "sync-orders") {
      const syncRange = formData.get("syncRange") as string;
      const reconcile = formData.get("reconcile") === "true";
      const updateMetrics = formData.get("updateMetrics") === "true";

      try {
        // Calculate date range
        let startDate = new Date();
        if (syncRange === "30") {
          startDate.setDate(startDate.getDate() - 30);
        } else if (syncRange === "90") {
          startDate.setDate(startDate.getDate() - 90);
        } else if (syncRange === "365") {
          startDate.setFullYear(startDate.getFullYear() - 1);
        } else {
          startDate = new Date("2020-01-01"); // Or shop creation date
        }

        // Create sync service
        const syncService = await createOrderSyncService(admin, shop, {
          batchSize: 50,
          startDate,
          endDate: new Date(),
          onProgress: (progress) => {
            console.log(`Order sync progress: ${progress.processed}/${progress.total}`);
          }
        });

        // Start sync (in production, use job queue)
        syncService.syncAllOrders()
          .then(result => {
            console.log("Order sync completed:", result.message);
          })
          .catch(error => {
            console.error("Order sync failed:", error);
          });

        return json({
          success: true,
          message: "Order sync started in background. This may take several minutes.",
          syncStarted: true
        });
      } catch (error) {
        console.error("Failed to start order sync:", error);
        return json({
          error: error instanceof Error ? error.message : "Failed to start sync"
        }, { status: 500 });
      }
    }

    // Handle sync status check
    if (intent === "check-sync-status") {
      // In production, this would check a job queue or database
      return json({
        inProgress: false,
        progress: 100
      });
    }

    // Handle billing upgrade
    if (intent === "upgrade") {
      const planName = formData.get("plan") as string;

      if (!billing) {
        return json({ error: "Billing not configured" }, { status: 500 });
      }

      try {
        // Import plan names
        const { FREE_PLAN, MONTHLY_PLAN, ANNUAL_PLAN } = await import("../shopify.server");

        // Determine which plan to request
        let requestPlan = MONTHLY_PLAN; // Default to monthly
        if (planName === "RewardsPro Annual") {
          requestPlan = ANNUAL_PLAN;
        } else if (planName === "RewardsPro Free") {
          requestPlan = FREE_PLAN;
        }

        // Request the billing plan
        const billingResponse = await billing.request({
          plan: requestPlan,
          isTest: process.env.NODE_ENV === 'development',
          returnUrl: `${process.env.SHOPIFY_APP_URL}/app/settings`,
        });

        // This will return a redirect response to Shopify's billing page
        return billingResponse;
      } catch (billingError: any) {
        // If billing.request throws a Response, return it
        if (billingError instanceof Response) {
          console.log("[Settings Action] Billing request returned Response, forwarding it");
          return billingError;
        }

        console.error("[Settings Action] Error requesting plan:", billingError);
        return json({ error: "Failed to request billing plan" }, { status: 500 });
      }
    }

    // Handle subscription cancellation
    if (intent === "cancel-subscription") {
      if (!admin) {
        return json({ error: "Admin context not available" }, { status: 500 });
      }

      try {
        console.log(`[Settings Action] ${shop} cancelling subscription`);

        // Import and use GraphQL billing service
        const { GraphQLBillingService } = await import("~/services/billing/graphql-billing.service");
        const billingService = new GraphQLBillingService(admin);

        // Cancel subscription via GraphQL
        const result = await billingService.cancelSubscription(shop);

        if (!result.success) {
          return json({
            error: result.error || "Failed to cancel subscription"
          }, { status: 500 });
        }

        // Log the cancellation
        await db.billingAuditLog.create({
          data: {
            id: uuidv4(),
            shop,
            action: "cancel-subscription",
            planName: "Cancelled",
            success: true,
            ipAddress: request.headers.get("x-forwarded-for") || "unknown",
            userAgent: request.headers.get("user-agent") || "unknown",
            attemptedAt: new Date()
          }
        });

        return json({
          success: true,
          message: "Subscription cancelled successfully. You will be downgraded to the Free plan at the end of your billing period."
        });
      } catch (error: any) {
        console.error("[Settings Action] Error cancelling subscription:", error);
        return json({
          error: "Failed to cancel subscription. Please try again."
        }, { status: 500 });
      }
    }

    // Handle downgrade to free plan
    if (intent === "downgrade-to-free") {
      if (!billing) {
        return json({ error: "Billing not configured" }, { status: 500 });
      }

      try {
        console.log(`[Settings Action] ${shop} downgrading to Free plan`);

        // Cancel current subscription if exists
        if (activeSubscription) {
          await billing.cancel({
            subscriptionId: activeSubscription.id,
            prorate: true
          }).catch((err: any) => {
            console.log("[Settings Action] No active subscription to cancel or already on free plan");
          });
        }

        // Log the downgrade
        await db.billingAuditLog.create({
          data: {
            id: uuidv4(),
            shop,
            action: "downgrade-to-free",
            planName: "RewardsPro Free",
            success: true,
            ipAddress: request.headers.get("x-forwarded-for") || "unknown",
            userAgent: request.headers.get("user-agent") || "unknown",
            attemptedAt: new Date()
          }
        });

        return json({
          success: true,
          message: "Successfully switched to Free plan"
        });
      } catch (error: any) {
        console.error("[Settings Action] Error downgrading to free:", error);
        return json({
          error: "Failed to downgrade to free plan. Please try again."
        }, { status: 500 });
      }
    }

    // Handle manual tier recalculation
    if (intent === "recalculate-tiers") {
      try {
        console.log(`[Settings Action] ${shop} triggering manual tier recalculation`);

        // Import the tier management service
        const { recalculateTiersForAllCustomers } = await import("~/services/tier-management.server");

        // Trigger recalculation (runs in background)
        const result = await recalculateTiersForAllCustomers(shop);

        // Update last run timestamp
        await db.shopSettings.update({
          where: { shop },
          data: {
            tierRecalculationLastRun: new Date(),
            updatedAt: new Date(),
          },
        });

        console.log(`[Settings Action] Recalculation completed: ${result.processed} customers processed`);

        return json({
          recalculationComplete: true,
          success: true,
          message: `Tier recalculation completed: ${result.upgraded} upgraded, ${result.downgraded} downgraded, ${result.unchanged} unchanged`,
          result
        });
      } catch (error: any) {
        console.error("[Settings Action] Error recalculating tiers:", error);
        return json({
          recalculationComplete: true,
          success: false,
          error: "Failed to recalculate tiers. Please try again."
        }, { status: 500 });
      }
    }

    // Handle fetch Shopify currency
    if (intent === "fetch-shopify-currency") {
      try {
        console.log(`[Settings Action] ${shop} fetching Shopify store currency`);

        const shopQuery = `#graphql
          query getShopCurrency {
            shop {
              name
              currencyCode
              ianaTimezone
              url
            }
          }
        `;
        const response = await admin.graphql(shopQuery);
        const shopData = await response.json();

        if (shopData.errors) {
          console.error("[Settings Action] GraphQL errors fetching currency:", shopData.errors);
          return json({
            fetchCurrencyComplete: true,
            success: false,
            error: "Failed to fetch currency from Shopify"
          }, { status: 500 });
        }

        const shopDetails = shopData.data?.shop || {};
        const shopifyCurrency = shopDetails.currencyCode || "UNKNOWN";

        // Get current settings for comparison
        const currentSettings = await db.shopSettings.findUnique({
          where: { shop },
          select: { storeCurrency: true }
        });

        console.log(`[Settings Action] Shopify reports currency: ${shopifyCurrency}, Current setting: ${currentSettings?.storeCurrency}`);

        return json({
          fetchCurrencyComplete: true,
          success: true,
          shopifyCurrency,
          currentCurrency: currentSettings?.storeCurrency || "NOT_SET",
          shopName: shopDetails.name,
          timezone: shopDetails.ianaTimezone,
          message: shopifyCurrency === currentSettings?.storeCurrency
            ? `Currency matches: ${shopifyCurrency}`
            : `Shopify currency (${shopifyCurrency}) differs from current setting (${currentSettings?.storeCurrency})`
        });
      } catch (error: any) {
        console.error("[Settings Action] Error fetching Shopify currency:", error);
        return json({
          fetchCurrencyComplete: true,
          success: false,
          error: "Failed to fetch currency from Shopify. Please try again."
        }, { status: 500 });
      }
    }

    if (intent !== "update") {
      return json({ error: "Invalid action" }, { status: 400 });
    }

    // Extract and validate form data
    const storeName = formData.get("storeName") as string;
    const storeUrl = formData.get("storeUrl") as string;
    const storeCurrency = formData.get("storeCurrency") as Currency;
    const currencyDisplayType = formData.get("currencyDisplayType") as CurrencyDisplayType;
    const tierRecalculationEnabled = formData.get("tierRecalculationEnabled") === "true";
    const tierRecalculationFrequency = formData.get("tierRecalculationFrequency") as "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY";
    // Base tier settings
    const autoAssignBaseTier = formData.get("autoAssignBaseTier") === "true";
    const defaultBaseTierIdRaw = formData.get("defaultBaseTierId") as string;
    const defaultBaseTierId = defaultBaseTierIdRaw === "" || defaultBaseTierIdRaw === "auto" ? null : defaultBaseTierIdRaw;
    // Widget theme settings
    const widgetThemeMode = formData.get("widgetThemeMode") as "LIGHT" | "DARK" | "CUSTOM";
    const widgetPrimaryColor = formData.get("widgetPrimaryColor") as string;
    const widgetBackgroundColor = formData.get("widgetBackgroundColor") as string;
    const widgetTextColor = formData.get("widgetTextColor") as string;
    const widgetAccentColor = formData.get("widgetAccentColor") as string;
    const widgetBorderRadius = parseInt(formData.get("widgetBorderRadius") as string) || 12;
    const widgetFontFamily = formData.get("widgetFontFamily") as string;

    // DEBUG: Log widget theme settings being saved
    console.log("[Settings] Widget theme settings to save:", {
      widgetThemeMode,
      widgetPrimaryColor,
      widgetBackgroundColor,
      widgetTextColor,
      widgetAccentColor,
      widgetBorderRadius,
      widgetFontFamily
    });
    // Store business metrics
    const averageProfitMarginStr = formData.get("averageProfitMargin") as string;
    const averageCogsPercentStr = formData.get("averageCogsPercent") as string;
    const averageShippingCostStr = formData.get("averageShippingCost") as string;
    const averageOrderValueStr = formData.get("averageOrderValue") as string;
    const targetRoiPercentStr = formData.get("targetRoiPercent") as string;

    const averageProfitMargin = averageProfitMarginStr ? parseFloat(averageProfitMarginStr) : null;
    const averageCogsPercent = averageCogsPercentStr ? parseFloat(averageCogsPercentStr) : null;
    const averageShippingCost = averageShippingCostStr ? parseFloat(averageShippingCostStr) : null;
    const averageOrderValue = averageOrderValueStr ? parseFloat(averageOrderValueStr) : null;
    const targetRoiPercent = targetRoiPercentStr ? parseFloat(targetRoiPercentStr) : null;
    // Timezone is now synced from Shopify and not editable

    // Validation
    const errors: string[] = [];

    if (!storeName || storeName.trim().length === 0) {
      errors.push("Store name is required");
    } else if (storeName.length > 100) {
      errors.push("Store name must be less than 100 characters");
    }

    if (!storeUrl || !validateUrl(storeUrl)) {
      errors.push("Valid store URL is required");
    }

    if (!CURRENCY_OPTIONS.some(opt => opt.value === storeCurrency)) {
      errors.push("Invalid currency selected");
    }

    if (!["SYMBOL", "CODE"].includes(currencyDisplayType)) {
      errors.push("Invalid currency display type");
    }

    if (errors.length > 0) {
      return json({ error: errors.join(", ") }, { status: 400 });
    }

    // Update settings (timezone stays as-is, synced from Shopify)
    const now = new Date();
    const updatedSettings = await db.shopSettings.update({
      where: { shop },
      data: {
        storeName: storeName.trim(),
        storeUrl: storeUrl.trim(),
        storeCurrency,
        currencyDisplayType,
        tierRecalculationEnabled,
        tierRecalculationFrequency,
        // Base tier settings
        autoAssignBaseTier,
        defaultBaseTierId,
        // Widget theme settings
        widgetThemeMode,
        widgetPrimaryColor,
        widgetBackgroundColor,
        widgetTextColor,
        widgetAccentColor,
        widgetBorderRadius,
        widgetFontFamily,
        // Store business metrics
        averageProfitMargin,
        averageCogsPercent,
        averageShippingCost,
        averageOrderValue,
        targetRoiPercent,
        metricsLastUpdated: (averageProfitMargin !== null || averageCogsPercent !== null ||
                            averageShippingCost !== null || averageOrderValue !== null ||
                            targetRoiPercent !== null) ? now : undefined,
        // timezone is synced from Shopify, not updated here
        updatedAt: now,
      },
    });

    return json({ 
      success: true, 
      settings: updatedSettings 
    });
  } catch (error) {
    console.error("Settings action error:", error);
    
    if (error instanceof Response) {
      throw error;
    }
    
    if (error instanceof Error) {
      return json({ error: error.message }, { status: 400 });
    }
    
    return json({ error: "An unexpected error occurred" }, { status: 500 });
  }
};

// ============= COMPONENT =============
export default function SettingsPage() {
  const {
    settings,
    shop,
    shopifyTimezone,
    orderStats,
    tiers,
    creditSyncStats,
    customerSyncStats,
    orderSyncStats,
    currentPlan,
    activeSubscription,
    monthlyOrderUsage,
    currentMonth,
    daysRemaining
  } = useLoaderData<LoaderData>();
  const fetcher = useFetcher();
  const currencyFetcher = useFetcher();
  const navigation = useNavigation();
  const navigate = useNavigate();

  // Toast notifications
  const { toast, showInfo, showSuccess, showError, hideToast } = useToast();

  // Tab state
  const [selectedTab, setSelectedTab] = useState(0);

  // Form state
  const [storeName, setStoreName] = useState(settings.storeName);
  const [storeUrl, setStoreUrl] = useState(settings.storeUrl);
  const [storeCurrency, setStoreCurrency] = useState<Currency>(settings.storeCurrency);
  const [currencyDisplayType, setCurrencyDisplayType] = useState<CurrencyDisplayType>(settings.currencyDisplayType);
  // Timezone is now read-only from Shopify
  const timezone = shopifyTimezone || settings.timezone;

  // Tier recalculation state
  const [tierRecalculationEnabled, setTierRecalculationEnabled] = useState(settings.tierRecalculationEnabled);
  const [tierRecalculationFrequency, setTierRecalculationFrequency] = useState<RecalculationFrequency>(settings.tierRecalculationFrequency);
  const [showRecalculateModal, setShowRecalculateModal] = useState(false);

  // Currency fetch state
  const [isFetchingCurrency, setIsFetchingCurrency] = useState(false);
  const [shopifyCurrencyResult, setShopifyCurrencyResult] = useState<{
    shopifyCurrency: string;
    currentCurrency: string;
    message: string;
  } | null>(null);

  // Base tier settings state
  const [autoAssignBaseTier, setAutoAssignBaseTier] = useState(settings.autoAssignBaseTier ?? true);
  const [defaultBaseTierId, setDefaultBaseTierId] = useState<string>(settings.defaultBaseTierId || "");

  // Credit sync state
  interface CreditSyncJob {
    jobId: string;
    status: string;
    progress: {
      processedCount: number;
      totalCustomers: number | null;
      updatedCount: number;
      skippedCount: number;
      errorCount: number;
      percentComplete: number;
      totalImported: number;
    };
    hasMore: boolean;
    error?: string;
  }
  const [creditSyncJob, setCreditSyncJob] = useState<CreditSyncJob | null>(null);
  const [isCreditSyncStarting, setIsCreditSyncStarting] = useState(false);
  const [isCreditSyncPolling, setIsCreditSyncPolling] = useState(false);
  const creditSyncPollingRef = useRef<NodeJS.Timeout | null>(null);
  const creditSyncProcessingRef = useRef(false);

  // Customer sync state
  interface CustomerSyncJob {
    jobId: string;
    status: string;
    progress: {
      processedCount: number;
      totalCustomers: number | null;
      createdCount: number;
      updatedCount: number;
      skippedCount: number;
      errorCount: number;
      percentComplete: number;
    };
    hasMore: boolean;
    error?: string;
    retryAfterMs?: number;
    startedAt?: string;
  }
  const [customerSyncJob, setCustomerSyncJob] = useState<CustomerSyncJob | null>(null);
  const [isCustomerSyncStarting, setIsCustomerSyncStarting] = useState(false);
  const [isCustomerSyncPolling, setIsCustomerSyncPolling] = useState(false);
  const customerSyncPollingRef = useRef<NodeJS.Timeout | null>(null);
  const customerSyncProcessingRef = useRef(false);

  // Widget theme state
  const [widgetThemeMode, setWidgetThemeMode] = useState<WidgetThemeMode>(settings.widgetThemeMode || "LIGHT");
  const [widgetPrimaryColor, setWidgetPrimaryColor] = useState(settings.widgetPrimaryColor || "#5C6AC4");
  const [widgetBackgroundColor, setWidgetBackgroundColor] = useState(settings.widgetBackgroundColor || "#FFFFFF");
  const [widgetTextColor, setWidgetTextColor] = useState(settings.widgetTextColor || "#212B36");
  const [widgetAccentColor, setWidgetAccentColor] = useState(settings.widgetAccentColor || "#008060");
  const [widgetBorderRadius, setWidgetBorderRadius] = useState(settings.widgetBorderRadius || 12);
  const [widgetFontFamily, setWidgetFontFamily] = useState(settings.widgetFontFamily || "inherit");

  // Store business metrics state
  const [averageProfitMargin, setAverageProfitMargin] = useState<string>(
    settings.averageProfitMargin?.toString() || ""
  );
  const [averageCogsPercent, setAverageCogsPercent] = useState<string>(
    settings.averageCogsPercent?.toString() || ""
  );
  const [averageShippingCost, setAverageShippingCost] = useState<string>(
    settings.averageShippingCost?.toString() || ""
  );
  const [averageOrderValue, setAverageOrderValue] = useState<string>(
    settings.averageOrderValue?.toString() || ""
  );
  const [targetRoiPercent, setTargetRoiPercent] = useState<string>(
    settings.targetRoiPercent?.toString() || ""
  );

  // Order sync state
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncRange, setSyncRange] = useState("365");
  const [reconcileLedger, setReconcileLedger] = useState(false);
  const [updateMetrics, setUpdateMetrics] = useState(true);

  // Credit sync modal state
  const [showCreditSyncModal, setShowCreditSyncModal] = useState(false);

  // UI state
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Calculate ETA for customer sync
  const getCustomerSyncETA = useCallback(() => {
    if (!customerSyncJob || !customerSyncJob.startedAt || !customerSyncJob.progress.totalCustomers) {
      return null;
    }

    const processed = customerSyncJob.progress.processedCount;
    const total = customerSyncJob.progress.totalCustomers;

    if (processed === 0) return null;

    const elapsed = Date.now() - new Date(customerSyncJob.startedAt).getTime();
    const msPerCustomer = elapsed / processed;
    const remaining = total - processed;
    const etaMs = msPerCustomer * remaining;

    const minutes = Math.ceil(etaMs / 60000);
    if (minutes > 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `~${hours}h ${mins}m remaining`;
    }
    return `~${minutes}m remaining`;
  }, [customerSyncJob]);


  // Check for unsaved changes
  useEffect(() => {
    const hasChanges =
      storeName !== settings.storeName ||
      storeUrl !== settings.storeUrl ||
      storeCurrency !== settings.storeCurrency ||
      currencyDisplayType !== settings.currencyDisplayType ||
      tierRecalculationEnabled !== settings.tierRecalculationEnabled ||
      tierRecalculationFrequency !== settings.tierRecalculationFrequency ||
      autoAssignBaseTier !== (settings.autoAssignBaseTier ?? true) ||
      defaultBaseTierId !== (settings.defaultBaseTierId || "") ||
      widgetThemeMode !== (settings.widgetThemeMode || "LIGHT") ||
      widgetPrimaryColor !== (settings.widgetPrimaryColor || "#5C6AC4") ||
      widgetBackgroundColor !== (settings.widgetBackgroundColor || "#FFFFFF") ||
      widgetTextColor !== (settings.widgetTextColor || "#212B36") ||
      widgetAccentColor !== (settings.widgetAccentColor || "#008060") ||
      widgetBorderRadius !== (settings.widgetBorderRadius || 12) ||
      widgetFontFamily !== (settings.widgetFontFamily || "inherit") ||
      averageProfitMargin !== (settings.averageProfitMargin?.toString() || "") ||
      averageCogsPercent !== (settings.averageCogsPercent?.toString() || "") ||
      averageShippingCost !== (settings.averageShippingCost?.toString() || "") ||
      averageOrderValue !== (settings.averageOrderValue?.toString() || "") ||
      targetRoiPercent !== (settings.targetRoiPercent?.toString() || "");

    setHasUnsavedChanges(hasChanges);
  }, [storeName, storeUrl, storeCurrency, currencyDisplayType, tierRecalculationEnabled, tierRecalculationFrequency, autoAssignBaseTier, defaultBaseTierId, widgetThemeMode, widgetPrimaryColor, widgetBackgroundColor, widgetTextColor, widgetAccentColor, widgetBorderRadius, widgetFontFamily, averageProfitMargin, averageCogsPercent, averageShippingCost, averageOrderValue, targetRoiPercent, settings]);

  // Handle currency fetch response
  useEffect(() => {
    if (currencyFetcher.state === "loading") {
      setIsFetchingCurrency(true);
    } else if (currencyFetcher.state === "idle" && currencyFetcher.data) {
      setIsFetchingCurrency(false);
      const data = currencyFetcher.data as {
        fetchCurrencyComplete?: boolean;
        success?: boolean;
        shopifyCurrency?: string;
        currentCurrency?: string;
        message?: string;
        error?: string;
      };
      if (data.fetchCurrencyComplete) {
        if (data.success) {
          setShopifyCurrencyResult({
            shopifyCurrency: data.shopifyCurrency || "UNKNOWN",
            currentCurrency: data.currentCurrency || "NOT_SET",
            message: data.message || ""
          });
          if (data.shopifyCurrency === data.currentCurrency) {
            showSuccess("Currency matches Shopify store settings");
          } else {
            showInfo(`Shopify currency: ${data.shopifyCurrency}`);
          }
        } else {
          showError(data.error || "Failed to fetch currency");
        }
      }
    }
  }, [currencyFetcher.state, currencyFetcher.data, showSuccess, showInfo, showError]);

  // Fetch Shopify currency handler
  const handleFetchShopifyCurrency = useCallback(() => {
    setShopifyCurrencyResult(null);
    const formData = new FormData();
    formData.append("intent", "fetch-shopify-currency");
    currencyFetcher.submit(formData, { method: "post" });
  }, [currencyFetcher]);

  // Removed time display - timezone is now just shown as text

  // Handle form submission
  const handleSubmit = useCallback(() => {
    console.log("[Settings UI] handleSubmit called with widgetThemeMode:", widgetThemeMode);
    console.log("[Settings UI] Full theme state:", {
      widgetThemeMode,
      widgetPrimaryColor,
      widgetBackgroundColor,
      widgetTextColor,
      widgetAccentColor
    });

    const formData = new FormData();
    formData.append("intent", "update");
    formData.append("storeName", storeName);
    formData.append("storeUrl", storeUrl);
    formData.append("storeCurrency", storeCurrency);
    formData.append("currencyDisplayType", currencyDisplayType);
    formData.append("tierRecalculationEnabled", String(tierRecalculationEnabled));
    formData.append("tierRecalculationFrequency", tierRecalculationFrequency);
    // Base tier settings
    formData.append("autoAssignBaseTier", String(autoAssignBaseTier));
    formData.append("defaultBaseTierId", defaultBaseTierId || "");
    // Widget theme settings
    formData.append("widgetThemeMode", widgetThemeMode);
    formData.append("widgetPrimaryColor", widgetPrimaryColor);
    formData.append("widgetBackgroundColor", widgetBackgroundColor);
    formData.append("widgetTextColor", widgetTextColor);
    formData.append("widgetAccentColor", widgetAccentColor);
    formData.append("widgetBorderRadius", String(widgetBorderRadius));
    formData.append("widgetFontFamily", widgetFontFamily);
    // Store business metrics
    formData.append("averageProfitMargin", averageProfitMargin);
    formData.append("averageCogsPercent", averageCogsPercent);
    formData.append("averageShippingCost", averageShippingCost);
    formData.append("averageOrderValue", averageOrderValue);
    formData.append("targetRoiPercent", targetRoiPercent);
    // Don't submit timezone - it's synced from Shopify

    fetcher.submit(formData, { method: "post" });
  }, [storeName, storeUrl, storeCurrency, currencyDisplayType, tierRecalculationEnabled, tierRecalculationFrequency, autoAssignBaseTier, defaultBaseTierId, widgetThemeMode, widgetPrimaryColor, widgetBackgroundColor, widgetTextColor, widgetAccentColor, widgetBorderRadius, widgetFontFamily, averageProfitMargin, averageCogsPercent, averageShippingCost, averageOrderValue, targetRoiPercent, fetcher]);

  // Handle reset
  const handleReset = useCallback(() => {
    setStoreName(settings.storeName);
    setStoreUrl(settings.storeUrl);
    setStoreCurrency(settings.storeCurrency);
    setCurrencyDisplayType(settings.currencyDisplayType);
    setTierRecalculationEnabled(settings.tierRecalculationEnabled);
    setTierRecalculationFrequency(settings.tierRecalculationFrequency);
    // Base tier settings reset
    setAutoAssignBaseTier(settings.autoAssignBaseTier ?? true);
    setDefaultBaseTierId(settings.defaultBaseTierId || "");
    // Widget theme reset
    setWidgetThemeMode(settings.widgetThemeMode || "LIGHT");
    setWidgetPrimaryColor(settings.widgetPrimaryColor || "#5C6AC4");
    setWidgetBackgroundColor(settings.widgetBackgroundColor || "#FFFFFF");
    setWidgetTextColor(settings.widgetTextColor || "#212B36");
    setWidgetAccentColor(settings.widgetAccentColor || "#008060");
    setWidgetBorderRadius(settings.widgetBorderRadius || 12);
    setWidgetFontFamily(settings.widgetFontFamily || "inherit");
    // Store metrics reset
    setAverageProfitMargin(settings.averageProfitMargin?.toString() || "");
    setAverageCogsPercent(settings.averageCogsPercent?.toString() || "");
    setAverageShippingCost(settings.averageShippingCost?.toString() || "");
    setAverageOrderValue(settings.averageOrderValue?.toString() || "");
    setTargetRoiPercent(settings.targetRoiPercent?.toString() || "");
    // Timezone is read-only, no need to reset
  }, [settings]);

  // Handle order sync - fire and forget pattern
  const handleStartSync = useCallback(() => {
    // Close modal immediately
    setShowSyncModal(false);

    // Show immediate feedback
    showInfo("Order sync started. You can continue working while this runs in the background.");

    // Submit without blocking UI
    const formData = new FormData();
    formData.append("intent", "sync-orders");
    formData.append("syncRange", syncRange);
    formData.append("reconcile", String(reconcileLedger));
    formData.append("updateMetrics", String(updateMetrics));

    fetcher.submit(formData, { method: "post" });
  }, [syncRange, reconcileLedger, updateMetrics, fetcher, showInfo]);


  // Handle manual tier recalculation
  const handleManualRecalculation = useCallback(() => {
    setShowRecalculateModal(true);
  }, []);

  // Confirm and execute tier recalculation
  const confirmRecalculation = useCallback(() => {
    setShowRecalculateModal(false);

    // Show immediate feedback - fire and forget pattern
    showInfo("Tier recalculation started. This runs in the background and may take several minutes.");

    // Submit without blocking UI
    fetcher.submit(
      { intent: "recalculate-tiers" },
      { method: "post" }
    );
  }, [fetcher, showInfo]);

  // Credit sync polling cleanup
  useEffect(() => {
    return () => {
      if (creditSyncPollingRef.current) {
        clearTimeout(creditSyncPollingRef.current);
      }
    };
  }, []);

  // Process credit sync batches when polling is active
  useEffect(() => {
    if (!isCreditSyncPolling || !creditSyncJob?.jobId || creditSyncProcessingRef.current) return;

    const processNextBatch = async () => {
      if (creditSyncProcessingRef.current) return;
      creditSyncProcessingRef.current = true;

      try {
        const response = await fetch('/api/credit-sync/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: creditSyncJob.jobId })
        });

        const result = await response.json();
        setCreditSyncJob(result);

        if (result.hasMore && result.status === 'IN_PROGRESS') {
          // Schedule next batch after a short delay
          creditSyncPollingRef.current = setTimeout(() => {
            creditSyncProcessingRef.current = false;
            // This will trigger the useEffect again
            setCreditSyncJob(prev => prev ? { ...prev } : null);
          }, 500);
        } else {
          // Sync completed or failed
          setIsCreditSyncPolling(false);
          if (result.status === 'COMPLETED') {
            showSuccess(`Store credit sync complete: ${result.progress.updatedCount} customers updated`);
          } else if (result.status === 'FAILED') {
            showError(`Store credit sync failed: ${result.error || 'Unknown error'}`);
          }
        }
      } catch (error) {
        console.error('Error processing credit sync batch:', error);
        setIsCreditSyncPolling(false);
        showError('Network error during credit sync');
      } finally {
        creditSyncProcessingRef.current = false;
      }
    };

    processNextBatch();
  }, [isCreditSyncPolling, creditSyncJob?.jobId, creditSyncJob?.progress.processedCount, showSuccess, showError]);

  // Handle start credit sync
  const handleStartCreditSync = useCallback(async () => {
    setShowCreditSyncModal(false);
    setIsCreditSyncStarting(true);
    showInfo("Store credit sync started...");

    try {
      const response = await fetch('/api/credit-sync/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggeredBy: 'manual' })
      });

      const result = await response.json();
      setCreditSyncJob(result);

      if (result.success && result.hasMore) {
        setIsCreditSyncPolling(true);
      } else if (!result.success) {
        showError(result.error || "Failed to start credit sync");
      }
    } catch (error) {
      console.error('Error starting credit sync:', error);
      showError("Failed to start credit sync. Please try again.");
    } finally {
      setIsCreditSyncStarting(false);
    }
  }, [showInfo, showError]);

  // Handle cancel credit sync
  const handleCancelCreditSync = useCallback(async () => {
    if (!creditSyncJob?.jobId) return;

    try {
      await fetch('/api/credit-sync/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', jobId: creditSyncJob.jobId })
      });

      setIsCreditSyncPolling(false);
      setCreditSyncJob(prev => prev ? { ...prev, status: 'CANCELLED', hasMore: false } : null);
      showInfo("Store credit sync cancelled");
    } catch (error) {
      console.error('Error cancelling credit sync:', error);
    }
  }, [creditSyncJob?.jobId, showInfo]);

  const isCreditSyncing = isCreditSyncPolling || isCreditSyncStarting;

  // Customer sync polling cleanup
  useEffect(() => {
    return () => {
      if (customerSyncPollingRef.current) {
        clearTimeout(customerSyncPollingRef.current);
      }
    };
  }, []);

  // Process customer sync batches when polling is active
  useEffect(() => {
    if (!isCustomerSyncPolling || !customerSyncJob?.jobId || customerSyncProcessingRef.current) return;

    const processNextBatch = async () => {
      if (customerSyncProcessingRef.current) return;
      customerSyncProcessingRef.current = true;

      try {
        const response = await fetch('/api/customer-sync/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: customerSyncJob.jobId })
        });

        const result = await response.json();
        setCustomerSyncJob(result);

        if (result.hasMore && result.status === 'IN_PROGRESS') {
          // Schedule next batch after a short delay
          customerSyncPollingRef.current = setTimeout(() => {
            customerSyncProcessingRef.current = false;
            // This will trigger the useEffect again
            setCustomerSyncJob(prev => prev ? { ...prev } : null);
          }, 500);
        } else {
          // Sync completed or failed
          setIsCustomerSyncPolling(false);
          if (result.status === 'COMPLETED') {
            showSuccess(`Customer sync complete: ${result.progress.createdCount} created, ${result.progress.updatedCount} updated`);
          } else if (result.status === 'FAILED') {
            showError(`Customer sync failed: ${result.error || 'Unknown error'}`);
          }
        }
      } catch (error) {
        console.error('Error processing customer sync batch:', error);
        setIsCustomerSyncPolling(false);
        showError('Network error during customer sync');
      } finally {
        customerSyncProcessingRef.current = false;
      }
    };

    processNextBatch();
  }, [isCustomerSyncPolling, customerSyncJob?.jobId, customerSyncJob?.progress?.processedCount, showSuccess, showError]);

  // Handle start customer sync
  const handleStartCustomerSync = useCallback(async () => {
    setIsCustomerSyncStarting(true);
    showInfo("Customer sync started...");

    try {
      const response = await fetch('/api/customer-sync/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggeredBy: 'manual' })
      });

      const result = await response.json();
      setCustomerSyncJob(result);

      if (result.success && result.hasMore) {
        setIsCustomerSyncPolling(true);
      } else if (!result.success) {
        showError(result.error || "Failed to start customer sync");
      }
    } catch (error) {
      console.error('Error starting customer sync:', error);
      showError("Failed to start customer sync. Please try again.");
    } finally {
      setIsCustomerSyncStarting(false);
    }
  }, [showInfo, showError]);

  // Handle cancel customer sync
  const handleCancelCustomerSync = useCallback(async () => {
    if (!customerSyncJob?.jobId) return;

    try {
      await fetch('/api/customer-sync/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', jobId: customerSyncJob.jobId })
      });

      setIsCustomerSyncPolling(false);
      setCustomerSyncJob(prev => prev ? { ...prev, status: 'CANCELLED', hasMore: false } : null);
      showInfo("Customer sync cancelled");
    } catch (error) {
      console.error('Error cancelling customer sync:', error);
    }
  }, [customerSyncJob?.jobId, showInfo]);

  const isCustomerSyncing = isCustomerSyncPolling || isCustomerSyncStarting;

  // Calculate next scheduled run based on frequency and last run
  const calculateNextRun = useCallback((lastRun: string | null, frequency: RecalculationFrequency): string => {
    if (!lastRun) return "Next daily cron run";

    const lastRunDate = new Date(lastRun);
    const nextRun = new Date(lastRunDate);

    switch (frequency) {
      case 'DAILY':
        nextRun.setDate(nextRun.getDate() + 1);
        break;
      case 'WEEKLY':
        nextRun.setDate(nextRun.getDate() + 7);
        break;
      case 'MONTHLY':
        nextRun.setDate(nextRun.getDate() + 30);
        break;
      case 'QUARTERLY':
        nextRun.setDate(nextRun.getDate() + 90);
        break;
    }

    return nextRun.toLocaleDateString();
  }, []);

  // Handle sync completion feedback
  useEffect(() => {
    const data = fetcher.data as {
      syncStarted?: boolean;
      success?: boolean;
      message?: string;
      error?: string;
    } | undefined;

    if (data?.syncStarted) {
      if (data.success) {
        showSuccess(data.message || "Order sync completed successfully.");
      }
    }
  }, [fetcher.data, showSuccess]);

  // Format date helper
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString();
  };

  // Format date range helper
  const formatDateRange = (oldest: string | null, newest: string | null) => {
    if (!oldest || !newest) return "No orders";
    return `${formatDate(oldest)} - ${formatDate(newest)}`;
  };

  // Show success/error messages
  const actionData = fetcher.data as { error?: string; success?: boolean; message?: string } | undefined;
  const isLoading = navigation.state === "submitting" || fetcher.state === "submitting";

  // Reset unsaved changes flag on successful save
  useEffect(() => {
    if (actionData?.success) {
      setHasUnsavedChanges(false);
    }
  }, [actionData]);

  // Handle recalculation completion feedback
  useEffect(() => {
    const data = fetcher.data as {
      recalculationComplete?: boolean;
      success?: boolean;
      message?: string;
      error?: string;
    } | undefined;

    if (data?.recalculationComplete) {
      if (data.success) {
        showSuccess(data.message || "Tier recalculation completed successfully.");
      } else {
        showError(data.error || "Tier recalculation failed. Please try again.");
      }
    }
  }, [fetcher.data, showSuccess, showError]);

  // Tab definitions - consolidated for better UX
  const tabs = [
    {
      id: 'general',
      content: 'General',
      panelID: 'general-panel',
    },
    {
      id: 'data-sync',
      content: 'Data & Sync',
      panelID: 'data-sync-panel',
    },
    {
      id: 'tier-automation',
      content: 'Tier Automation',
      panelID: 'tier-automation-panel',
    },
    {
      id: 'store-metrics',
      content: 'Store Metrics',
      panelID: 'store-metrics-panel',
    },
    {
      id: 'widget-theme',
      content: 'Widget Theme',
      panelID: 'widget-theme-panel',
    },
  ];

  const handleTabChange = useCallback((selectedTabIndex: number) => {
    setSelectedTab(selectedTabIndex);
  }, []);

  return (
    <Frame>
      <Page
        title="Store Settings"
        primaryAction={{
          content: "Save Settings",
          onAction: handleSubmit,
          loading: isLoading,
          disabled: !hasUnsavedChanges,
        }}
        secondaryActions={[
          {
            content: "Reset",
            onAction: handleReset,
            disabled: !hasUnsavedChanges,
          },
        ]}
      >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {/* Status Messages */}
            {actionData?.error && (
              <Banner tone="critical">
                <p>{actionData.error}</p>
              </Banner>
            )}
            {actionData?.success && (
              <Banner tone="success">
                <p>{actionData.message || "Settings saved successfully!"}</p>
              </Banner>
            )}
            {hasUnsavedChanges && (
              <Banner tone="warning">
                <p>You have unsaved changes</p>
              </Banner>
            )}

            {/* Tabbed Interface */}
            <Card>
              <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
                <Box padding="400">
                  {/* General Tab - Store Info, Currency, Timezone combined */}
                  {selectedTab === 0 && (
                    <BlockStack gap="500">
                      {/* Store Information Section */}
                      <BlockStack gap="300">
                        <Text as="h2" variant="headingMd">Store Information</Text>
                        <FormLayout>
                          <FormLayout.Group>
                            <TextField
                              label="Store Name"
                              value={storeName}
                              onChange={setStoreName}
                              autoComplete="off"
                              helpText="Display name for your store"
                            />
                            <TextField
                              label="Store URL"
                              value={storeUrl}
                              onChange={setStoreUrl}
                              type="url"
                              autoComplete="off"
                              error={storeUrl && !validateUrl(storeUrl) ? "Please enter a valid URL" : undefined}
                            />
                          </FormLayout.Group>
                          <FormLayout.Group>
                            <TextField
                              label="Shop Domain"
                              value={shop}
                              disabled
                              autoComplete="off"
                              helpText="Your Shopify domain (read-only)"
                            />
                            <TextField
                              label="Timezone"
                              value={shopifyTimezone || timezone}
                              disabled
                              autoComplete="off"
                              helpText="Synced from Shopify settings"
                            />
                          </FormLayout.Group>
                        </FormLayout>
                      </BlockStack>

                      <Divider />

                      {/* Currency Section */}
                      <BlockStack gap="300">
                        <Text as="h2" variant="headingMd">Currency</Text>
                        <FormLayout>
                          <FormLayout.Group>
                            <Select
                              label="Store Currency"
                              options={CURRENCY_OPTIONS}
                              value={storeCurrency}
                              onChange={(value) => setStoreCurrency(value as Currency)}
                            />
                            <BlockStack gap="200">
                              <Text as="p" variant="bodyMd">Display Format</Text>
                              <InlineStack gap="400">
                                <RadioButton
                                  label={`${getCurrencySymbol(storeCurrency)}100.00`}
                                  checked={currencyDisplayType === "SYMBOL"}
                                  id="symbol"
                                  name="displayType"
                                  onChange={() => setCurrencyDisplayType("SYMBOL")}
                                />
                                <RadioButton
                                  label={`${storeCurrency} 100.00`}
                                  checked={currencyDisplayType === "CODE"}
                                  id="code"
                                  name="displayType"
                                  onChange={() => setCurrencyDisplayType("CODE")}
                                />
                              </InlineStack>
                            </BlockStack>
                          </FormLayout.Group>
                        </FormLayout>
                        <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                          <InlineStack gap="200" blockAlign="center">
                            <Text as="span" variant="bodySm" tone="subdued">Preview:</Text>
                            <Text as="span" variant="headingMd">
                              {formatCurrencyExample(storeCurrency, currencyDisplayType)}
                            </Text>
                          </InlineStack>
                        </Box>

                        {/* Fetch Shopify Currency Button */}
                        <Box paddingBlockStart="200">
                          <InlineStack gap="300" blockAlign="center">
                            <Button
                              onClick={handleFetchShopifyCurrency}
                              loading={isFetchingCurrency}
                              disabled={isFetchingCurrency}
                              size="slim"
                            >
                              Fetch Shopify Store Currency
                            </Button>
                            {shopifyCurrencyResult && (
                              <InlineStack gap="200" blockAlign="center">
                                <Badge tone={shopifyCurrencyResult.shopifyCurrency === shopifyCurrencyResult.currentCurrency ? "success" : "warning"}>
                                  Shopify: {shopifyCurrencyResult.shopifyCurrency}
                                </Badge>
                                <Badge tone="info">
                                  Current: {shopifyCurrencyResult.currentCurrency}
                                </Badge>
                                {shopifyCurrencyResult.shopifyCurrency !== shopifyCurrencyResult.currentCurrency && (
                                  <Text as="span" variant="bodySm" tone="caution">
                                    Mismatch detected
                                  </Text>
                                )}
                              </InlineStack>
                            )}
                          </InlineStack>
                        </Box>
                      </BlockStack>

                      <Divider />

                      {/* Settings Metadata */}
                      <InlineStack gap="600" align="start">
                        <BlockStack gap="100">
                          <Text as="p" variant="bodySm" tone="subdued">Created</Text>
                          <Text as="p" variant="bodyMd">{new Date(settings.createdAt).toLocaleDateString()}</Text>
                        </BlockStack>
                        <BlockStack gap="100">
                          <Text as="p" variant="bodySm" tone="subdued">Last Updated</Text>
                          <Text as="p" variant="bodyMd">{new Date(settings.updatedAt).toLocaleDateString()}</Text>
                        </BlockStack>
                        <BlockStack gap="100">
                          <Text as="p" variant="bodySm" tone="subdued">Settings ID</Text>
                          <Badge tone="info">{settings.id.slice(0, 8)}</Badge>
                        </BlockStack>
                      </InlineStack>
                    </BlockStack>
                  )}

                  {/* Data Sync Tab - Stats Dashboard Layout */}
                  {selectedTab === 1 && (
                    <BlockStack gap="500">
                      <BlockStack gap="200">
                        <Text variant="headingMd" as="h2">Data Synchronization</Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Sync customers, orders, and store credit from Shopify
                        </Text>
                      </BlockStack>

                      {/* Stats Summary Grid */}
                      <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
                        {/* Customers Stat */}
                        <Card>
                          <BlockStack gap="200">
                            <InlineStack align="space-between" blockAlign="center">
                              <Text as="span" variant="bodySm" tone="subdued">Customers</Text>
                              <Badge
                                tone={customerSyncStats.customersInitialSynced ? "success" : "warning"}
                                size="small"
                              >
                                {customerSyncStats.customersInitialSynced ? "Synced" : "Pending"}
                              </Badge>
                            </InlineStack>
                            <Text as="p" variant="headingXl">{customerSyncStats.totalCustomers.toLocaleString()}</Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {customerSyncStats.customersWithTier} with tier assigned
                            </Text>
                          </BlockStack>
                        </Card>

                        {/* Orders Stat */}
                        <Card>
                          <BlockStack gap="200">
                            <InlineStack align="space-between" blockAlign="center">
                              <Text as="span" variant="bodySm" tone="subdued">Orders</Text>
                              <Badge
                                tone={orderSyncStats.totalOrders > 0 ? "success" : "warning"}
                                size="small"
                              >
                                {orderSyncStats.totalOrders > 0 ? "Synced" : "Pending"}
                              </Badge>
                            </InlineStack>
                            <Text as="p" variant="headingXl">{orderSyncStats.totalOrders.toLocaleString()}</Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {formatCurrency(orderSyncStats.totalCashbackAmount, { storeCurrency, currencyDisplayType })} cashback earned
                            </Text>
                          </BlockStack>
                        </Card>

                        {/* Store Credit Stat */}
                        <Card>
                          <BlockStack gap="200">
                            <InlineStack align="space-between" blockAlign="center">
                              <Text as="span" variant="bodySm" tone="subdued">Store Credit</Text>
                              <Badge
                                tone={creditSyncStats.customersWithCredit > 0 ? "success" : "info"}
                                size="small"
                              >
                                {creditSyncStats.customersWithCredit > 0 ? "Active" : "None"}
                              </Badge>
                            </InlineStack>
                            <Text as="p" variant="headingXl">{formatCurrency(creditSyncStats.totalCreditBalance, { storeCurrency, currencyDisplayType })}</Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {creditSyncStats.customersWithCredit} customers with credit
                            </Text>
                          </BlockStack>
                        </Card>
                      </InlineGrid>

                      {/* Sync Actions */}
                      <Card>
                        <BlockStack gap="400">
                          <Text as="h3" variant="headingSm">Sync Actions</Text>

                          <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
                            {/* Customer Sync Action */}
                            <Box
                              padding="400"
                              background="bg-surface-secondary"
                              borderRadius="200"
                            >
                              <BlockStack gap="300">
                                <BlockStack gap="100">
                                  <Text as="span" variant="bodyMd" fontWeight="semibold">Customers</Text>
                                  <Text as="span" variant="bodySm" tone="subdued">
                                    Import customer data and assign loyalty tiers
                                  </Text>
                                </BlockStack>
                                <InlineStack gap="200">
                                  <Button
                                    onClick={handleStartCustomerSync}
                                    icon={RefreshIcon}
                                    disabled={isCustomerSyncing}
                                    loading={isCustomerSyncStarting}
                                    size="slim"
                                    fullWidth
                                  >
                                    Sync Customers
                                  </Button>
                                  {isCustomerSyncing && (
                                    <Button
                                      onClick={handleCancelCustomerSync}
                                      tone="critical"
                                      variant="plain"
                                      size="slim"
                                    >
                                      Cancel
                                    </Button>
                                  )}
                                </InlineStack>
                                {customerSyncJob && customerSyncJob.status === 'IN_PROGRESS' && (
                                  <BlockStack gap="100">
                                    <ProgressBar progress={customerSyncJob.progress.percentComplete} size="small" />
                                    <InlineStack align="space-between">
                                      <Text as="span" variant="bodySm" tone="subdued">
                                        {customerSyncJob.progress.processedCount} / {customerSyncJob.progress.totalCustomers || '?'} customers
                                      </Text>
                                      {getCustomerSyncETA() && (
                                        <Text as="span" variant="bodySm" tone="subdued">
                                          {getCustomerSyncETA()}
                                        </Text>
                                      )}
                                    </InlineStack>
                                  </BlockStack>
                                )}
                              </BlockStack>
                            </Box>

                            {/* Order Sync Action */}
                            <Box
                              padding="400"
                              background="bg-surface-secondary"
                              borderRadius="200"
                            >
                              <BlockStack gap="300">
                                <BlockStack gap="100">
                                  <Text as="span" variant="bodyMd" fontWeight="semibold">Orders</Text>
                                  <Text as="span" variant="bodySm" tone="subdued">
                                    Import order history for spending calculations
                                  </Text>
                                </BlockStack>
                                <Button
                                  onClick={() => setShowSyncModal(true)}
                                  icon={RefreshIcon}
                                  size="slim"
                                  fullWidth
                                >
                                  Sync Orders
                                </Button>
                              </BlockStack>
                            </Box>

                            {/* Credit Sync Action */}
                            <Box
                              padding="400"
                              background="bg-surface-secondary"
                              borderRadius="200"
                            >
                              <BlockStack gap="300">
                                <BlockStack gap="100">
                                  <Text as="span" variant="bodyMd" fontWeight="semibold">Store Credit</Text>
                                  <Text as="span" variant="bodySm" tone="subdued">
                                    Import existing Shopify credit balances
                                  </Text>
                                </BlockStack>
                                <InlineStack gap="200">
                                  <Button
                                    onClick={() => setShowCreditSyncModal(true)}
                                    icon={RefreshIcon}
                                    disabled={isCreditSyncing}
                                    loading={isCreditSyncStarting}
                                    size="slim"
                                    fullWidth
                                  >
                                    Sync Credit
                                  </Button>
                                  {isCreditSyncing && (
                                    <Button
                                      onClick={handleCancelCreditSync}
                                      tone="critical"
                                      variant="plain"
                                      size="slim"
                                    >
                                      Cancel
                                    </Button>
                                  )}
                                </InlineStack>
                                {creditSyncJob && creditSyncJob.status === 'IN_PROGRESS' && (
                                  <ProgressBar progress={creditSyncJob.progress.percentComplete} size="small" />
                                )}
                              </BlockStack>
                            </Box>
                          </InlineGrid>
                        </BlockStack>
                      </Card>

                      {/* Status Banners */}
                      {customerSyncJob && customerSyncJob.status === 'COMPLETED' && (
                        <Banner tone="success" onDismiss={() => setCustomerSyncJob(null)}>
                          <Text as="p" variant="bodySm">
                            Customer sync completed: {customerSyncJob.progress.createdCount} created, {customerSyncJob.progress.updatedCount} updated
                          </Text>
                        </Banner>
                      )}
                      {customerSyncJob && customerSyncJob.status === 'FAILED' && (
                        <Banner tone="critical" onDismiss={() => setCustomerSyncJob(null)}>
                          <Text as="p" variant="bodySm">
                            Customer sync failed: {customerSyncJob.error || 'Unknown error'}
                          </Text>
                        </Banner>
                      )}
                      {customerSyncJob && customerSyncJob.error?.includes('Rate limited') && customerSyncJob.status === 'IN_PROGRESS' && (
                        <Banner tone="warning">
                          <Text as="p" variant="bodySm">
                            Shopify rate limit reached. The sync will automatically retry in a few seconds.
                          </Text>
                        </Banner>
                      )}
                      {creditSyncJob && creditSyncJob.status === 'COMPLETED' && (
                        <Banner tone="success" onDismiss={() => setCreditSyncJob(null)}>
                          <Text as="p" variant="bodySm">
                            Store credit sync completed: {creditSyncJob.progress.updatedCount} customers updated,
                            {formatCurrency(creditSyncJob.progress.totalImported, { storeCurrency, currencyDisplayType })} imported.
                          </Text>
                        </Banner>
                      )}
                      {creditSyncJob && creditSyncJob.status === 'FAILED' && (
                        <Banner tone="critical" onDismiss={() => setCreditSyncJob(null)}>
                          <Text as="p" variant="bodySm">
                            Store credit sync failed: {creditSyncJob.error || 'Unknown error'}
                          </Text>
                        </Banner>
                      )}
                      {!customerSyncStats.customersInitialSynced && (
                        <Banner tone="warning">
                          <Text as="p" variant="bodySm">
                            Initial customer sync required. This imports your existing customers and assigns them to loyalty tiers.
                          </Text>
                        </Banner>
                      )}
                      {orderStats && orderStats.discrepancies > 0 && (
                        <Banner tone="warning">
                          Found {orderStats.discrepancies} ledger discrepancies.
                          <Button variant="plain" onClick={() => navigate("/app/orders-sync")}>
                            Review & Fix
                          </Button>
                        </Banner>
                      )}

                      {/* Last Sync Info */}
                      <Box paddingBlockStart="200">
                        <InlineStack gap="400" align="center">
                          <Text as="span" variant="bodySm" tone="subdued">
                            Last customer sync: {customerSyncStats.lastSyncJob?.completedAt
                              ? formatDate(customerSyncStats.lastSyncJob.completedAt)
                              : "Never"}
                          </Text>
                          <Text as="span" variant="bodySm" tone="subdued">|</Text>
                          <Text as="span" variant="bodySm" tone="subdued">
                            Last order sync: {orderSyncStats.lastSyncJob?.completedAt
                              ? formatDate(orderSyncStats.lastSyncJob.completedAt)
                              : "Never"}
                          </Text>
                          <Text as="span" variant="bodySm" tone="subdued">|</Text>
                          <Text as="span" variant="bodySm" tone="subdued">
                            Last credit sync: {creditSyncStats.lastSyncJob?.completedAt
                              ? formatDate(creditSyncStats.lastSyncJob.completedAt)
                              : "Never"}
                          </Text>
                        </InlineStack>
                      </Box>
                    </BlockStack>
                  )}

                  {/* Tier Automation Tab */}
                  {selectedTab === 2 && (
                    <BlockStack gap="500">
                      <BlockStack gap="200">
                        <Text as="h2" variant="headingMd">Automatic Tier Recalculation</Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Automatically recalculate customer tiers based on their spending to ensure accurate tier assignments.
                        </Text>
                      </BlockStack>

                      <FormLayout>
                        <Checkbox
                          label="Enable automatic tier recalculation"
                          checked={tierRecalculationEnabled}
                          onChange={setTierRecalculationEnabled}
                          helpText="Tiers will be recalculated automatically based on your selected frequency"
                        />

                        {tierRecalculationEnabled && (
                          <Select
                            label="Recalculation Frequency"
                            options={[
                              { label: 'Daily', value: 'DAILY' },
                              { label: 'Weekly (Recommended)', value: 'WEEKLY' },
                              { label: 'Monthly', value: 'MONTHLY' },
                              { label: 'Quarterly', value: 'QUARTERLY' },
                            ]}
                            value={tierRecalculationFrequency}
                            onChange={(value) => setTierRecalculationFrequency(value as RecalculationFrequency)}
                          />
                        )}
                      </FormLayout>

                      {/* Last Run Info & Manual Trigger */}
                      <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                        <InlineStack align="space-between" blockAlign="center">
                          <BlockStack gap="100">
                            <Text as="span" variant="bodyMd" fontWeight="semibold">Manual Recalculation</Text>
                            {settings.tierRecalculationLastRun ? (
                              <Text as="span" variant="bodySm" tone="subdued">
                                Last run: {formatDate(settings.tierRecalculationLastRun)} • Next: {calculateNextRun(settings.tierRecalculationLastRun, tierRecalculationFrequency)}
                              </Text>
                            ) : (
                              <Text as="span" variant="bodySm" tone="subdued">Never run</Text>
                            )}
                          </BlockStack>
                          <Button
                            onClick={handleManualRecalculation}
                            icon={RefreshIcon}
                          >
                            Recalculate Now
                          </Button>
                        </InlineStack>
                      </Box>

                      <Banner tone="info">
                        <Text as="p" variant="bodyMd">
                          Recalculation respects manual tier overrides, uses your tier's evaluation period (Annual/Lifetime),
                          includes a grace period before downgrades, and logs all changes.
                        </Text>
                      </Banner>

                      <Divider />

                      {/* Default Base Tier Section */}
                      <BlockStack gap="200">
                        <Text as="h2" variant="headingMd">Default Customer Tier</Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Automatically assign a base tier to new customers who don't qualify for any other tier.
                          This ensures all customers participate in the loyalty program from day one.
                        </Text>
                      </BlockStack>

                      <FormLayout>
                        <Checkbox
                          label="Enable automatic base tier assignment"
                          checked={autoAssignBaseTier}
                          onChange={setAutoAssignBaseTier}
                          helpText="New customers will be assigned a base tier if they don't qualify for any higher tier"
                        />

                        {autoAssignBaseTier && (
                          <Select
                            label="Default tier for new customers"
                            options={[
                              { label: 'Auto-detect (lowest minSpend tier)', value: '' },
                              ...tiers.map(t => ({
                                label: `${t.name} (min spend: ${formatCurrency(t.minSpend, { storeCurrency, currencyDisplayType })})`,
                                value: t.id
                              }))
                            ]}
                            value={defaultBaseTierId}
                            onChange={setDefaultBaseTierId}
                            helpText="Select a specific tier or let the system auto-detect the appropriate base tier"
                          />
                        )}
                      </FormLayout>

                      {autoAssignBaseTier && (
                        <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                          <BlockStack gap="200">
                            <Text as="span" variant="bodySm" fontWeight="semibold">
                              Tier Priority (highest to lowest):
                            </Text>
                            <Text as="span" variant="bodySm" tone="subdued">
                              Manual Override → Subscription → Purchase → Spending-Based → Default Base Tier
                            </Text>
                            <Text as="span" variant="bodySm" tone="subdued">
                              The base tier only applies when no other tier source qualifies.
                            </Text>
                          </BlockStack>
                        </Box>
                      )}

                      {tiers.length === 0 && (
                        <Banner tone="warning">
                          <Text as="p" variant="bodyMd">
                            No tiers configured yet. Create tiers in the Loyalty Tiers section before enabling base tier assignment.
                          </Text>
                        </Banner>
                      )}

                      {/* Recalculate Confirmation Modal */}
                      <Modal
                        open={showRecalculateModal}
                        onClose={() => setShowRecalculateModal(false)}
                        title="Recalculate All Customer Tiers"
                        primaryAction={{
                          content: "Recalculate",
                          onAction: confirmRecalculation,
                          destructive: false,
                        }}
                        secondaryActions={[
                          {
                            content: "Cancel",
                            onAction: () => setShowRecalculateModal(false),
                          },
                        ]}
                      >
                        <Modal.Section>
                          <BlockStack gap="300">
                            <Text as="p" variant="bodyMd">
                              This will recalculate tiers for all customers in your store based on their spending history.
                            </Text>
                            <Text as="p" variant="bodyMd" tone="subdued">
                              This may take several minutes depending on the number of customers. Manual tier overrides will be preserved.
                            </Text>
                          </BlockStack>
                        </Modal.Section>
                      </Modal>
                    </BlockStack>
                  )}

                  {/* Store Metrics Tab */}
                  {selectedTab === 3 && (
                    <BlockStack gap="500">
                      <BlockStack gap="200">
                        <Text as="h2" variant="headingMd">Store Business Metrics</Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Configure your store's financial metrics to enable accurate ROI and profitability calculations in analytics.
                        </Text>
                      </BlockStack>

                      <FormLayout>
                        <FormLayout.Group>
                          <TextField
                            label="Average Profit Margin"
                            type="number"
                            value={averageProfitMargin}
                            onChange={setAverageProfitMargin}
                            suffix="%"
                            min={0}
                            max={100}
                            autoComplete="off"
                            helpText="Your average profit margin after COGS (e.g., 45 for 45%)"
                          />
                          <TextField
                            label="Average COGS"
                            type="number"
                            value={averageCogsPercent}
                            onChange={setAverageCogsPercent}
                            suffix="%"
                            min={0}
                            max={100}
                            autoComplete="off"
                            helpText="Cost of goods sold as % of revenue (e.g., 55 for 55%)"
                          />
                        </FormLayout.Group>

                        <FormLayout.Group>
                          <TextField
                            label="Average Shipping Cost"
                            type="number"
                            value={averageShippingCost}
                            onChange={setAverageShippingCost}
                            prefix={getCurrencySymbol(storeCurrency)}
                            min={0}
                            autoComplete="off"
                            helpText="Average shipping cost per order"
                          />
                          <TextField
                            label="Average Order Value"
                            type="number"
                            value={averageOrderValue}
                            onChange={setAverageOrderValue}
                            prefix={getCurrencySymbol(storeCurrency)}
                            min={0}
                            autoComplete="off"
                            helpText="Your historical average order value"
                          />
                        </FormLayout.Group>

                        <TextField
                          label="Target ROI"
                          type="number"
                          value={targetRoiPercent}
                          onChange={setTargetRoiPercent}
                          suffix="%"
                          min={0}
                          autoComplete="off"
                          helpText="Your target return on investment for the loyalty program (e.g., 200 for 200% ROI)"
                        />
                      </FormLayout>

                      {/* Metrics Summary */}
                      {(averageProfitMargin || averageCogsPercent || averageOrderValue) && (
                        <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                          <BlockStack gap="300">
                            <Text as="p" variant="bodySm" tone="subdued">Metrics Summary</Text>
                            <InlineStack gap="600">
                              {averageProfitMargin && (
                                <BlockStack gap="100">
                                  <Text as="span" variant="bodySm" tone="subdued">Profit Margin</Text>
                                  <Text as="span" variant="headingSm">{averageProfitMargin}%</Text>
                                </BlockStack>
                              )}
                              {averageCogsPercent && (
                                <BlockStack gap="100">
                                  <Text as="span" variant="bodySm" tone="subdued">COGS</Text>
                                  <Text as="span" variant="headingSm">{averageCogsPercent}%</Text>
                                </BlockStack>
                              )}
                              {averageOrderValue && (
                                <BlockStack gap="100">
                                  <Text as="span" variant="bodySm" tone="subdued">Avg Order</Text>
                                  <Text as="span" variant="headingSm">{formatCurrency(averageOrderValue, { storeCurrency, currencyDisplayType })}</Text>
                                </BlockStack>
                              )}
                              {targetRoiPercent && (
                                <BlockStack gap="100">
                                  <Text as="span" variant="bodySm" tone="subdued">Target ROI</Text>
                                  <Text as="span" variant="headingSm">{targetRoiPercent}%</Text>
                                </BlockStack>
                              )}
                            </InlineStack>
                            {settings.metricsLastUpdated && (
                              <Text as="p" variant="bodySm" tone="subdued">
                                Last updated: {new Date(settings.metricsLastUpdated).toLocaleDateString()}
                              </Text>
                            )}
                          </BlockStack>
                        </Box>
                      )}

                      <Banner tone="info">
                        <Text as="p" variant="bodyMd">
                          These metrics are used to calculate loyalty program ROI, cashback profitability, and tier effectiveness in analytics.
                          Leave fields empty if you don't have the data yet.
                        </Text>
                      </Banner>
                    </BlockStack>
                  )}

                  {/* Widget Theme Tab */}
                  {selectedTab === 4 && (
                    <BlockStack gap="500">
                      <BlockStack gap="200">
                        <Text as="h2" variant="headingMd">Widget Theme</Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Customize the appearance of the customer loyalty widget on your storefront.
                        </Text>
                      </BlockStack>

                      {/* Theme Mode Selection */}
                      <InlineStack gap="300">
                        {[
                          { mode: "LIGHT" as const, icon: "☀️", label: "Light", bg: "#FFFFFF", textColor: "#212B36" },
                          { mode: "DARK" as const, icon: "🌙", label: "Dark", bg: "#1A1A2E", textColor: "#F4F4F5" },
                          { mode: "CUSTOM" as const, icon: "🎨", label: "Custom", bg: "linear-gradient(135deg, #5C6AC4 0%, #008060 100%)", textColor: "#FFFFFF" },
                        ].map(({ mode, icon, label, bg, textColor }) => (
                          <div
                            key={mode}
                            onClick={() => {
                              console.log("[Settings UI] Theme mode clicked:", mode);
                              setWidgetThemeMode(mode);
                              if (mode === "LIGHT") {
                                setWidgetPrimaryColor("#5C6AC4");
                                setWidgetBackgroundColor("#FFFFFF");
                                setWidgetTextColor("#212B36");
                                setWidgetAccentColor("#008060");
                              } else if (mode === "DARK") {
                                console.log("[Settings UI] Setting DARK preset colors");
                                setWidgetPrimaryColor("#9CA3FF");
                                setWidgetBackgroundColor("#1A1A2E");
                                setWidgetTextColor("#F4F4F5");
                                setWidgetAccentColor("#34D399");
                              }
                            }}
                            style={{
                              cursor: "pointer",
                              padding: "16px 24px",
                              border: widgetThemeMode === mode ? "2px solid #5C6AC4" : "2px solid #E1E3E5",
                              borderRadius: "8px",
                              textAlign: "center",
                              background: bg,
                              flex: 1,
                            }}
                          >
                            <BlockStack gap="100" inlineAlign="center">
                              <span style={{ fontSize: "20px" }}>{icon}</span>
                              <Text as="span" variant="bodySm" fontWeight={widgetThemeMode === mode ? "semibold" : "regular"}>
                                <span style={{ color: textColor }}>{label}</span>
                              </Text>
                            </BlockStack>
                          </div>
                        ))}
                      </InlineStack>

                      {/* Custom Color Options */}
                      {widgetThemeMode === "CUSTOM" && (
                        <FormLayout>
                          <FormLayout.Group>
                            <TextField
                              label="Primary"
                              value={widgetPrimaryColor}
                              onChange={setWidgetPrimaryColor}
                              prefix={<div style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: widgetPrimaryColor, border: "1px solid #DFE3E8" }} />}
                              autoComplete="off"
                            />
                            <TextField
                              label="Background"
                              value={widgetBackgroundColor}
                              onChange={setWidgetBackgroundColor}
                              prefix={<div style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: widgetBackgroundColor, border: "1px solid #DFE3E8" }} />}
                              autoComplete="off"
                            />
                            <TextField
                              label="Text"
                              value={widgetTextColor}
                              onChange={setWidgetTextColor}
                              prefix={<div style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: widgetTextColor, border: "1px solid #DFE3E8" }} />}
                              autoComplete="off"
                            />
                            <TextField
                              label="Accent"
                              value={widgetAccentColor}
                              onChange={setWidgetAccentColor}
                              prefix={<div style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: widgetAccentColor, border: "1px solid #DFE3E8" }} />}
                              autoComplete="off"
                            />
                          </FormLayout.Group>
                          <FormLayout.Group>
                            <Select
                              label="Border Radius"
                              options={[
                                { label: "None", value: "0" },
                                { label: "Small", value: "4" },
                                { label: "Medium", value: "8" },
                                { label: "Large", value: "12" },
                                { label: "Rounded", value: "24" },
                              ]}
                              value={String(widgetBorderRadius)}
                              onChange={(value) => setWidgetBorderRadius(parseInt(value))}
                            />
                            <Select
                              label="Font"
                              options={[
                                { label: "Inherit from Theme", value: "inherit" },
                                { label: "System Default", value: "system-ui" },
                                { label: "Inter", value: "Inter, sans-serif" },
                              ]}
                              value={widgetFontFamily}
                              onChange={setWidgetFontFamily}
                            />
                          </FormLayout.Group>
                        </FormLayout>
                      )}

                      {/* Compact Preview */}
                      <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                        <BlockStack gap="300">
                          <Text as="p" variant="bodySm" tone="subdued">Preview</Text>
                          <div
                            style={{
                              backgroundColor: widgetBackgroundColor,
                              borderRadius: `${widgetBorderRadius}px`,
                              padding: "16px",
                              fontFamily: widgetFontFamily,
                              color: widgetTextColor,
                              border: "1px solid #E1E3E5",
                              maxWidth: "320px"
                            }}
                          >
                            <InlineStack align="space-between" blockAlign="center">
                              <BlockStack gap="100">
                                <span style={{ color: widgetTextColor, fontWeight: 600, fontSize: "14px" }}>Gold Member</span>
                                <span style={{ color: widgetAccentColor, fontWeight: 700, fontSize: "20px" }}>{formatCurrency(125.50, { storeCurrency, currencyDisplayType })}</span>
                              </BlockStack>
                              <div style={{
                                backgroundColor: widgetPrimaryColor,
                                color: "#FFF",
                                padding: "4px 10px",
                                borderRadius: `${Math.min(widgetBorderRadius, 8)}px`,
                                fontSize: "11px",
                                fontWeight: 600
                              }}>
                                5% Cashback
                              </div>
                            </InlineStack>
                            <div style={{ marginTop: "12px" }}>
                              <div style={{
                                backgroundColor: widgetThemeMode === "DARK" ? "rgba(255,255,255,0.1)" : "#E1E3E5",
                                borderRadius: "4px",
                                height: "6px",
                                overflow: "hidden"
                              }}>
                                <div style={{ backgroundColor: widgetPrimaryColor, width: "63%", height: "100%" }} />
                              </div>
                            </div>
                          </div>
                        </BlockStack>
                      </Box>
                    </BlockStack>
                  )}
                </Box>
              </Tabs>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      {/* Order Sync Modal */}
      <Modal
        open={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        title="Sync Order History"
        primaryAction={{
          content: "Start Sync",
          onAction: handleStartSync,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setShowSyncModal(false),
          }
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Banner tone="info">
              <p>This will import all paid orders from your Shopify store to enable:</p>
              <ul style={{ marginLeft: "20px", marginTop: "8px" }}>
                <li>Fast tier calculations</li>
                <li>Accurate cashback tracking</li>
                <li>Complete order analytics</li>
              </ul>
            </Banner>

            <Select
              label="Date Range"
              options={[
                { label: "Last 30 days", value: "30" },
                { label: "Last 90 days", value: "90" },
                { label: "Last year", value: "365" },
                { label: "All time", value: "all" }
              ]}
              value={syncRange}
              onChange={setSyncRange}
            />

            <Checkbox
              label="Reconcile existing ledger entries"
              checked={reconcileLedger}
              onChange={setReconcileLedger}
              helpText="Check and fix any cashback discrepancies"
            />

            <Checkbox
              label="Update customer metrics"
              checked={updateMetrics}
              onChange={setUpdateMetrics}
              helpText="Recalculate totalSpent and orderCount"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Store Credit Sync Modal */}
      <Modal
        open={showCreditSyncModal}
        onClose={() => setShowCreditSyncModal(false)}
        title="Sync Store Credit"
        primaryAction={{
          content: "Start Sync",
          onAction: handleStartCreditSync,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setShowCreditSyncModal(false),
          }
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Banner tone="info">
              <p>This will import existing Shopify store credit balances for all customers.</p>
            </Banner>

            <BlockStack gap="200">
              <Text as="p" variant="bodyMd">
                The sync will:
              </Text>
              <ul style={{ marginLeft: "20px", marginTop: "4px" }}>
                <li>Fetch store credit balances from Shopify</li>
                <li>Update customer records with current balances</li>
                <li>Track imported amounts for reconciliation</li>
              </ul>
            </BlockStack>

            <Banner tone="warning">
              <Text as="p" variant="bodySm">
                Use this when first installing the app or to reconcile discrepancies between Shopify and your loyalty program.
              </Text>
            </Banner>
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Toast notification */}
      {toast.active && (
        <Toast
          content={toast.content}
          error={toast.error}
          duration={toast.duration}
          onDismiss={hideToast}
        />
      )}
      </Page>
    </Frame>
  );
}