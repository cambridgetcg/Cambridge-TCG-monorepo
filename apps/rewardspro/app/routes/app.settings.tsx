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
  Text,
  Divider,
  Box,
  Badge,
  Modal,
  ProgressBar,
  Checkbox,
  Icon,
  Tabs,
} from "@shopify/polaris";
import {
  RefreshIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  InfoIcon,
} from "~/utils/polaris-icons";
import { useState, useCallback, useEffect } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { useNavigate } from "@remix-run/react";
import { createOrderSyncService } from "../services/order-sync.service";
import { CurrentPlanCard } from "~/components/Billing";
import { MANAGED_PLANS, PLAN_COMPARISON } from "~/constants/billing.constants";
import { countOrdersWithFallback, countOrdersDateExtraction, getOrCreateMonthlyCount } from "~/utils/order-count-strategies";
import { v4 as uuidv4 } from "uuid";

// ============= TYPES =============
type Currency = 
  | "USD" | "EUR" | "GBP" | "CAD" | "AUD" | "JPY" | "CHF" | "CNY" 
  | "SEK" | "NZD" | "NOK" | "MXN" | "SGD" | "HKD" | "KRW" | "TRY" 
  | "INR" | "RUB" | "BRL" | "ZAR" | "AED" | "PLN" | "DKK" | "THB" 
  | "IDR" | "HUF" | "CZK" | "ILS" | "CLP" | "PHP" | "RON" | "MYR";

type CurrencyDisplayType = "SYMBOL" | "CODE";

type ShopSettings = {
  id: string;
  shop: string;
  storeName: string;
  storeUrl: string;
  storeCurrency: Currency;
  currencyDisplayType: CurrencyDisplayType;
  timezone: string;
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

type LoaderData = {
  settings: ShopSettings;
  shop: string;
  shopifyTimezone?: string;
  orderStats?: OrderStats;
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

// Note: MANAGED_PLANS and PLAN_COMPARISON are now imported from ~/constants/billing.constants
// Removing duplicated constants that have been moved to shared location

// Temporarily keeping old constants for reference (will be removed after testing)
const OLD_MANAGED_PLANS = {
  "RewardsPro Free": {
    name: "RewardsPro Free",
    displayName: "Free",
    price: 0,
    interval: "month",
    ordersIncluded: 200,
    overageRate: 0,
    features: [
      "200 orders per month",
      "All core features included",
      "Unlimited loyalty tiers",
      "Customer management",
      "Store credit tracking",
      "Basic analytics",
      "No credit card required",
      "Community support",
    ],
    recommended: false,
    isFree: true,
  },
  "RewardsPro Monthly": {
    name: "RewardsPro Monthly",
    displayName: "Pro",
    price: 49,
    interval: "month",
    ordersIncluded: 1000,
    overageRate: 0.01,
    features: [
      "1,000 orders included",
      "$0.01 per additional order",
      "Unlimited loyalty tiers",
      "Advanced analytics",
      "Custom email templates",
      "Priority support",
      "API access",
      "Webhook integrations",
    ],
    recommended: true,
    isFree: false,
  },
  "RewardsPro Annual": {
    name: "RewardsPro Annual",
    displayName: "Enterprise",
    price: 490,
    interval: "year",
    ordersIncluded: 12000,
    overageRate: 0.01,
    features: [
      "12,000 orders included (1,000/month)",
      "$0.01 per additional order",
      "Save ~17% compared to monthly",
      "All monthly features included",
      "Annual billing cycle",
      "Dedicated onboarding",
      "Quarterly business reviews",
      "Custom integrations support",
    ],
    recommended: false,
    isFree: false,
  },
};

// Plan comparison data for the comparison cards (old version - now using imported)
const OLD_PLAN_COMPARISON = {
  free: {
    name: "Starter plan",
    displayName: "Free",
    description: "Everything you need to create an on-brand program your customers will love.",
    price: 0,
    interval: "month",
    ordersIncluded: "Up to 200 monthly orders",
    overageInfo: "",
    recommended: true,
    popularFeatures: [
      "Points program",
      "Referral program",
      "Customizable emails",
      "Store credit tracking",
      "Basic reports",
      "Community support",
    ],
  },
  pro: {
    name: "Growth plan",
    displayName: "Pro",
    description: "Level up your loyalty program with extras like advanced analytics and priority support.",
    price: 49,
    interval: "month",
    ordersIncluded: "Includes 1,000 monthly orders",
    overageInfo: "$0.01 per additional order",
    recommended: false,
    popularFeatures: [
      "Full-feature loyalty hub",
      "Advanced analytics & reporting",
      "Custom email templates",
      "Priority support",
      "API access",
      "Unlimited integrations",
    ],
  },
  enterprise: {
    name: "Plus plan",
    displayName: "Enterprise",
    description: "Get the best of RewardsPro with more customization and reporting.",
    price: 490,
    interval: "year",
    ordersIncluded: "Includes 12,000 annual orders",
    overageInfo: "$0.01 per additional order",
    recommended: false,
    popularFeatures: [
      "Migration and launch plan",
      "30+ specialized reports",
      "API access & developer tools",
      "Priority support",
      "Quarterly program monitoring",
      "Security review support",
    ],
  },
};

// Timezone options removed - now automatically synced from Shopify

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
          entryType: 'CASHBACK_EARNED'
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

    // Fetch billing plan from database
    const billingPlan = await db.billingPlan.findUnique({
      where: { shop },
    });

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

      // Strategy 1: Try date extraction method (most reliable for month-based)
      try {
        orderCount = await countOrdersDateExtraction(shop, year, month);
        orderCountStrategy = "DateExtraction";
        console.log(`[Settings Page] Date extraction strategy succeeded: ${orderCount} orders`);
      } catch (error) {
        console.log("[Settings Page] Date extraction failed, trying fallback strategies");

        // Strategy 2: Try multiple strategies with fallback
        const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
        const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

        const result = await countOrdersWithFallback(shop, startOfMonth, endOfMonth);
        orderCount = result.count;
        orderCountStrategy = result.strategy;
      }

      // Strategy 3: If still 0, try pre-aggregated count
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

    // Determine plan based on active subscription
    let planLimit = 200; // Default for free plan
    let planName = 'RewardsPro Free';

    if (activeSubscription?.name === 'RewardsPro Monthly') {
      planLimit = 1000;
      planName = 'RewardsPro Monthly';
    } else if (activeSubscription?.name === 'RewardsPro Annual') {
      planLimit = 1000; // 12,000/year = 1,000/month average
      planName = 'RewardsPro Annual';
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

    // Serialize billing plan
    const serializedPlan = billingPlan ? {
      ...billingPlan,
      monthlyPrice: Number(billingPlan.monthlyPrice || 0),
      usageCap: billingPlan.usageCap ? Number(billingPlan.usageCap) : null,
      currentPeriodEnd: billingPlan.currentPeriodEnd instanceof Date
        ? billingPlan.currentPeriodEnd.toISOString()
        : billingPlan.currentPeriodEnd,
      lastCapAlert: billingPlan.lastCapAlert instanceof Date
        ? billingPlan.lastCapAlert.toISOString()
        : billingPlan.lastCapAlert,
      createdAt: billingPlan.createdAt instanceof Date
        ? billingPlan.createdAt.toISOString()
        : String(billingPlan.createdAt),
      updatedAt: billingPlan.updatedAt instanceof Date
        ? billingPlan.updatedAt.toISOString()
        : String(billingPlan.updatedAt),
    } : null;

    return json<LoaderData>({
      settings: serializedSettings as ShopSettings,
      shop,
      shopifyTimezone, // Pass Shopify's timezone to show it's synced
      orderStats,
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

    if (intent !== "update") {
      return json({ error: "Invalid action" }, { status: 400 });
    }

    // Extract and validate form data
    const storeName = formData.get("storeName") as string;
    const storeUrl = formData.get("storeUrl") as string;
    const storeCurrency = formData.get("storeCurrency") as Currency;
    const currencyDisplayType = formData.get("currencyDisplayType") as CurrencyDisplayType;
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
    const updatedSettings = await db.shopSettings.update({
      where: { shop },
      data: {
        storeName: storeName.trim(),
        storeUrl: storeUrl.trim(),
        storeCurrency,
        currencyDisplayType,
        // timezone is synced from Shopify, not updated here
        updatedAt: new Date(),
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
    currentPlan,
    activeSubscription,
    monthlyOrderUsage,
    currentMonth,
    daysRemaining
  } = useLoaderData<LoaderData>();
  const fetcher = useFetcher();
  const navigation = useNavigation();
  const navigate = useNavigate();

  // Tab state
  const [selectedTab, setSelectedTab] = useState(0);

  // Form state
  const [storeName, setStoreName] = useState(settings.storeName);
  const [storeUrl, setStoreUrl] = useState(settings.storeUrl);
  const [storeCurrency, setStoreCurrency] = useState<Currency>(settings.storeCurrency);
  const [currencyDisplayType, setCurrencyDisplayType] = useState<CurrencyDisplayType>(settings.currencyDisplayType);
  // Timezone is now read-only from Shopify
  const timezone = shopifyTimezone || settings.timezone;

  // Order sync state
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncRange, setSyncRange] = useState("365");
  const [reconcileLedger, setReconcileLedger] = useState(false);
  const [updateMetrics, setUpdateMetrics] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);

  // UI state
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Check for unsaved changes
  useEffect(() => {
    const hasChanges = 
      storeName !== settings.storeName ||
      storeUrl !== settings.storeUrl ||
      storeCurrency !== settings.storeCurrency ||
      currencyDisplayType !== settings.currencyDisplayType;
    
    setHasUnsavedChanges(hasChanges);
  }, [storeName, storeUrl, storeCurrency, currencyDisplayType, settings]);

  // Removed time display - timezone is now just shown as text

  // Handle form submission
  const handleSubmit = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "update");
    formData.append("storeName", storeName);
    formData.append("storeUrl", storeUrl);
    formData.append("storeCurrency", storeCurrency);
    formData.append("currencyDisplayType", currencyDisplayType);
    // Don't submit timezone - it's synced from Shopify

    fetcher.submit(formData, { method: "post" });
  }, [storeName, storeUrl, storeCurrency, currencyDisplayType, fetcher]);

  // Handle reset
  const handleReset = useCallback(() => {
    setStoreName(settings.storeName);
    setStoreUrl(settings.storeUrl);
    setStoreCurrency(settings.storeCurrency);
    setCurrencyDisplayType(settings.currencyDisplayType);
    // Timezone is read-only, no need to reset
  }, [settings]);

  // Handle order sync
  const handleStartSync = useCallback(() => {
    setIsSyncing(true);
    setSyncProgress(0);

    const formData = new FormData();
    formData.append("intent", "sync-orders");
    formData.append("syncRange", syncRange);
    formData.append("reconcile", String(reconcileLedger));
    formData.append("updateMetrics", String(updateMetrics));

    fetcher.submit(formData, { method: "post" });

    // Simulate progress (in production, use WebSockets or polling)
    const interval = setInterval(() => {
      setSyncProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        return prev + 10;
      });
    }, 2000);
  }, [syncRange, reconcileLedger, updateMetrics, fetcher]);

  // Handle billing upgrade
  const handleUpgrade = useCallback((planName?: string) => {
    fetcher.submit(
      {
        intent: "upgrade",
        plan: planName || "RewardsPro Monthly" // Default to monthly plan
      },
      { method: "post" }
    );
  }, [fetcher]);

  // Handle sync completion
  useEffect(() => {
    if (fetcher.data?.syncStarted && isSyncing) {
      setTimeout(() => {
        setSyncProgress(100);
        setTimeout(() => {
          setIsSyncing(false);
          setShowSyncModal(false);
          setSyncProgress(0);
          // Reload to update stats
          window.location.reload();
        }, 1000);
      }, 1000);
    }
  }, [fetcher.data, isSyncing]);

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
  const actionData = fetcher.data as { error?: string; success?: boolean } | undefined;
  const isLoading = navigation.state === "submitting" || fetcher.state === "submitting";

  // Reset unsaved changes flag on successful save
  useEffect(() => {
    if (actionData?.success) {
      setHasUnsavedChanges(false);
    }
  }, [actionData]);

  // Tab definitions
  const tabs = [
    {
      id: 'store-info',
      content: 'Store Information',
      panelID: 'store-info-panel',
    },
    {
      id: 'currency',
      content: 'Currency',
      panelID: 'currency-panel',
    },
    {
      id: 'timezone',
      content: 'Timezone',
      panelID: 'timezone-panel',
    },
    {
      id: 'data-sync',
      content: 'Data Sync',
      panelID: 'data-sync-panel',
    },
    {
      id: 'billing',
      content: 'Billing',
      panelID: 'billing-panel',
    },
  ];

  const handleTabChange = useCallback((selectedTabIndex: number) => {
    setSelectedTab(selectedTabIndex);
  }, []);

  return (
    <Page
      title="Store Settings"
      primaryAction={selectedTab !== 4 ? {
        content: "Save Settings",
        onAction: handleSubmit,
        loading: isLoading,
        disabled: !hasUnsavedChanges,
      } : undefined}
      secondaryActions={selectedTab !== 4 ? [
        {
          content: "Reset",
          onAction: handleReset,
          disabled: !hasUnsavedChanges,
        },
      ] : undefined}
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
                <p>Settings saved successfully!</p>
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
                  {/* Store Information Tab */}
                  {selectedTab === 0 && (
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">
                        Store Information
                      </Text>
                      <FormLayout>
                        <TextField
                          label="Store Name"
                          value={storeName}
                          onChange={setStoreName}
                          autoComplete="off"
                          helpText="The display name for your store"
                        />
                        <TextField
                          label="Store URL"
                          value={storeUrl}
                          onChange={setStoreUrl}
                          type="url"
                          autoComplete="off"
                          helpText="Your store's public URL"
                          error={storeUrl && !validateUrl(storeUrl) ? "Please enter a valid URL" : undefined}
                        />
                        <TextField
                          label="Shop Domain"
                          value={shop}
                          disabled
                          autoComplete="off"
                          helpText="This is your Shopify domain and cannot be changed"
                        />
                      </FormLayout>

                      <Divider />

                      <BlockStack gap="300">
                        <Text as="h3" variant="headingSm">
                          Settings Information
                        </Text>
                        <InlineStack gap="400">
                          <BlockStack gap="100">
                            <Text as="p" variant="bodySm" tone="subdued">
                              Created
                            </Text>
                            <Text as="p" variant="bodyMd">
                              {new Date(settings.createdAt).toLocaleDateString()}
                            </Text>
                          </BlockStack>
                          <BlockStack gap="100">
                            <Text as="p" variant="bodySm" tone="subdued">
                              Last Updated
                            </Text>
                            <Text as="p" variant="bodyMd">
                              {new Date(settings.updatedAt).toLocaleDateString()}
                            </Text>
                          </BlockStack>
                          <BlockStack gap="100">
                            <Text as="p" variant="bodySm" tone="subdued">
                              Settings ID
                            </Text>
                            <Badge tone="info">{`${settings.id.slice(0, 8)}...`}</Badge>
                          </BlockStack>
                        </InlineStack>
                      </BlockStack>
                    </BlockStack>
                  )}

                  {/* Currency Tab */}
                  {selectedTab === 1 && (
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">
                        Currency Settings
                      </Text>
                      <FormLayout>
                        <Select
                          label="Store Currency"
                          options={CURRENCY_OPTIONS}
                          value={storeCurrency}
                          onChange={(value) => setStoreCurrency(value as Currency)}
                          helpText="The primary currency for your store"
                        />

                        <BlockStack gap="200">
                          <Text as="p" variant="bodyMd">
                            Currency Display Format
                          </Text>
                          <RadioButton
                            label={`Symbol Format (${getCurrencySymbol(storeCurrency)}100.00)`}
                            checked={currencyDisplayType === "SYMBOL"}
                            id="symbol"
                            name="displayType"
                            onChange={() => setCurrencyDisplayType("SYMBOL")}
                          />
                          <RadioButton
                            label={`Code Format (${storeCurrency} 100.00)`}
                            checked={currencyDisplayType === "CODE"}
                            id="code"
                            name="displayType"
                            onChange={() => setCurrencyDisplayType("CODE")}
                          />
                        </BlockStack>

                        <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                          <BlockStack gap="200">
                            <Text as="p" variant="bodySm" tone="subdued">
                              Preview
                            </Text>
                            <Text as="p" variant="headingLg">
                              {formatCurrencyExample(storeCurrency, currencyDisplayType)}
                            </Text>
                          </BlockStack>
                        </Box>
                      </FormLayout>

                      <Divider />

                      <Text as="p" variant="bodyMd">
                        <strong>Note:</strong> Currency settings determine how prices and store credit are displayed to customers throughout your loyalty program.
                      </Text>
                    </BlockStack>
                  )}

                  {/* Timezone Tab */}
                  {selectedTab === 2 && (
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">
                        Timezone Settings
                      </Text>
                      <FormLayout>
                        <TextField
                          label="Store Timezone"
                          value={shopifyTimezone || timezone}
                          disabled
                          autoComplete="off"
                          helpText="Automatically synced from your Shopify store settings"
                        />
                      </FormLayout>

                      <Divider />

                      <BlockStack gap="200">
                        <Text as="p" variant="bodyMd">
                          <strong>About Timezone Settings:</strong>
                        </Text>
                        <Text as="p" variant="bodyMd">
                          Your timezone is automatically synchronized with your Shopify store settings and is used for:
                        </Text>
                        <Box paddingInlineStart="400">
                          <ul style={{ marginLeft: '20px' }}>
                            <li>Scheduling tier evaluations</li>
                            <li>Calculating time-based metrics</li>
                            <li>Displaying timestamps in reports</li>
                            <li>Processing daily analytics</li>
                          </ul>
                        </Box>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          To change your timezone, please update it in your Shopify admin settings.
                        </Text>
                      </BlockStack>
                    </BlockStack>
                  )}

                  {/* Data Sync Tab */}
                  {selectedTab === 3 && (
                    <BlockStack gap="400">
                      <BlockStack gap="200">
                        <Text variant="headingMd" as="h2">
                          Data Management
                        </Text>
                        <Text variant="bodyMd" tone="subdued">
                          Sync and manage your store's order data
                        </Text>
                      </BlockStack>

                      <Divider />

                      {/* Order Sync Status */}
                      <BlockStack gap="300">
                        <InlineStack align="space-between">
                          <BlockStack gap="200">
                            <Text variant="bodyMd" fontWeight="semibold">
                              Order History Sync
                            </Text>
                            {orderStats && (
                              <InlineStack gap="200">
                                <Badge tone={orderStats.orderCount > 0 ? "success" : "warning"}>
                                  {orderStats.orderCount} orders synced
                                </Badge>
                                {orderStats.lastSync && (
                                  <Text variant="bodySm" tone="subdued">
                                    Last sync: {formatDate(orderStats.lastSync)}
                                  </Text>
                                )}
                              </InlineStack>
                            )}
                          </BlockStack>

                          <InlineStack gap="200">
                            <Button
                              onClick={() => setShowSyncModal(true)}
                              disabled={isSyncing}
                              loading={isSyncing}
                              icon={RefreshIcon}
                            >
                              {isSyncing ? "Syncing..." : "Sync Orders"}
                            </Button>
                            <Button
                              variant="plain"
                              onClick={() => navigate("/app/orders-sync")}
                            >
                              Advanced Options
                            </Button>
                          </InlineStack>
                        </InlineStack>

                        {/* Quick Stats */}
                        {orderStats && (
                          <InlineStack gap="400">
                            <Text variant="bodySm">
                              <Text as="span" fontWeight="semibold">Customers:</Text> {orderStats.customerCount}
                            </Text>
                            <Text variant="bodySm">
                              <Text as="span" fontWeight="semibold">Date Range:</Text> {formatDateRange(orderStats.oldestOrder, orderStats.newestOrder)}
                            </Text>
                            <Text variant="bodySm">
                              <Text as="span" fontWeight="semibold">Total Cashback:</Text> ${orderStats.totalCashback.toFixed(2)}
                            </Text>
                          </InlineStack>
                        )}

                        {/* Discrepancies Warning */}
                        {orderStats && orderStats.discrepancies > 0 && (
                          <Banner tone="warning">
                            Found {orderStats.discrepancies} ledger discrepancies.
                            <Button variant="plain" onClick={() => navigate("/app/orders-sync")}>
                              Review & Fix
                            </Button>
                          </Banner>
                        )}

                        {/* No Orders Message */}
                        {(!orderStats || orderStats.orderCount === 0) && (
                          <Banner tone="info">
                            <p>
                              No orders synced yet. Sync your order history to enable fast tier calculations,
                              accurate cashback tracking, and complete order analytics.
                            </p>
                          </Banner>
                        )}
                      </BlockStack>
                    </BlockStack>
                  )}

                  {/* Billing Tab */}
                  {selectedTab === 4 && (
                    <BlockStack gap="600">
                      <CurrentPlanCard
                        activeSubscription={activeSubscription}
                        currentPlan={currentPlan}
                        monthlyOrderUsage={{
                          orderCount: monthlyOrderUsage?.orderCount || 0,
                          planLimit: monthlyOrderUsage?.planLimit || 200,
                          projectedOrders: monthlyOrderUsage?.projectedOrders || 0,
                          currentMonth: currentMonth
                        }}
                        showUpgradeButton={true}
                        showOverageBanner={true}
                        showCountStrategy={false}
                        showProjectedUsage={true}
                        onUpgrade={() => navigate("/app/billing/plans")}
                      />

                      <Divider />

                      {/* Downgrade Section */}
                      <BlockStack gap="400">
                        <Text variant="headingMd" as="h3">
                          Subscription Management
                        </Text>

                        {activeSubscription && activeSubscription.name !== "RewardsPro Free" ? (
                          <BlockStack gap="300">
                            <Text variant="bodyMd" tone="subdued">
                              Need to reduce costs? You can downgrade your subscription or switch to our free plan.
                            </Text>

                            <InlineStack gap="200">
                              <Button
                                variant="secondary"
                                onClick={() => navigate("/app/billing/plans")}
                              >
                                Change Plan
                              </Button>

                              {/* Show free plan option only for downgrades */}
                              <Button
                                variant="plain"
                                tone="critical"
                                onClick={() => {
                                  if (confirm("Are you sure you want to switch to the free plan? You will lose access to premium features.")) {
                                    fetcher.submit(
                                      { intent: "downgrade-to-free" },
                                      { method: "post" }
                                    );
                                  }
                                }}
                              >
                                Switch to Free Plan (100 orders/month)
                              </Button>
                            </InlineStack>

                            <Banner tone="info">
                              <Text variant="bodySm">
                                <strong>Free Plan includes:</strong> Up to 100 orders/month, 500 customers max, basic tier management, store credit system, and email support.
                              </Text>
                            </Banner>
                          </BlockStack>
                        ) : (
                          <BlockStack gap="300">
                            <Text variant="bodyMd">
                              You're currently on the free plan. Ready to grow?
                            </Text>
                            <Button
                              variant="primary"
                              onClick={() => navigate("/app/billing/plans")}
                            >
                              View Upgrade Options
                            </Button>
                          </BlockStack>
                        )}
                      </BlockStack>
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
          loading: isSyncing,
          disabled: isSyncing
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setShowSyncModal(false),
            disabled: isSyncing
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
              disabled={isSyncing}
            />

            <Checkbox
              label="Reconcile existing ledger entries"
              checked={reconcileLedger}
              onChange={setReconcileLedger}
              helpText="Check and fix any cashback discrepancies"
              disabled={isSyncing}
            />

            <Checkbox
              label="Update customer metrics"
              checked={updateMetrics}
              onChange={setUpdateMetrics}
              helpText="Recalculate totalSpent and orderCount"
              disabled={isSyncing}
            />

            {isSyncing && (
              <>
                <ProgressBar progress={syncProgress} tone="primary" />
                <Text variant="bodySm" tone="subdued">
                  Processing orders... This may take several minutes.
                </Text>
              </>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}