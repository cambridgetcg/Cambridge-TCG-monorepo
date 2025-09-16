import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useFetcher, useActionData } from "@remix-run/react";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import * as crypto from "crypto";
import {
  Page,
  Layout,
  Card,
  DataTable,
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
  SkeletonDisplayText,
  Toast,
  Frame,
  FormLayout,
  Checkbox,
} from "@shopify/polaris";
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
  ExportIcon,
  ImportIcon,
} from "@shopify/polaris-icons";
import {
  MetricCard,
  CustomerCard,
  TierProgressCard,
  LoadingSkeleton,
  StatsOverview,
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
        orderBy: { createdAt: 'desc' },
        take: 100, // Limit for performance
      }),
      db.tier.findMany({
        where: { shop },
        orderBy: { minSpend: 'asc' },
      }),
      db.shopSettings.findUnique({
        where: { shop },
      }),
      db.customer.count({
        where: { shop },
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
      const hasManualOverride = await hasManualOverride(customer.id);
      
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
        hasManualOverride,
        lastTierChange,
        createdAt: customer.createdAt.toISOString(),
        updatedAt: customer.updatedAt.toISOString(),
      };
    }));

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
      
      const result = await assignCustomerToTier(
        shop,
        customerId,
        tierId === "none" ? null : tierId,
        session.userId?.toString() || "admin",
        reason,
        { permanentOverride }
      );
      
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
      
      console.log(`[Customers] Calculating tier for customer ${customerId}`);
      const result = await calculateCustomerTier(shop, customerId, admin as any);
      
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
  
  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculatingCustomerId, setCalculatingCustomerId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [visibleRows, setVisibleRows] = useState<number[]>([]);
  const [toast, setToast] = useState<ToastState>({ active: false, content: '' });
  
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

  // Format currency helper
  const formatAmount = useCallback((amount: number) => {
    return formatCurrency(amount, data.shopSettings as any);
  }, [data.shopSettings]);

  // Handle search with debounce
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    
    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Set new timeout for search (debounce)
    searchTimeoutRef.current = setTimeout(() => {
      // Could trigger server-side search here
    }, 300);
  }, []);

  // Handle tier filter
  const handleTierFilter = useCallback((value: string) => {
    setTierFilter(value);
    // Reset visible rows to trigger re-animation
    setVisibleRows([]);
  }, []);

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
  const handleViewCustomer = useCallback((customerId: string) => {
    setSelectedCustomerId(customerId);
    setModalOpen(true);
  }, []);
  
  // Open manual tier assignment modal
  const handleManualTierAssignment = useCallback((customer: Customer) => {
    setManualTierCustomer(customer);
    setManualTierSelection(customer.currentTier?.id || "none");
    setManualTierReason("");
    setPermanentOverride(false);
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

  // Filter customers based on search and tier
  const filteredCustomers = useMemo(() => {
    return data.customers.filter(customer => {
      const matchesSearch = !searchQuery || 
        customer.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.shopifyCustomerId.includes(searchQuery);
      
      const matchesTier = tierFilter === "all" ||
        (tierFilter === "none" && !customer.currentTier) ||
        (customer.currentTier?.id === tierFilter);
      
      return matchesSearch && matchesTier;
    });
  }, [data.customers, searchQuery, tierFilter]);

  // Tier filter options
  const tierOptions = [
    { label: "All tiers", value: "all" },
    { label: "No tier", value: "none" },
    ...data.tiers.map(tier => ({
      label: `${tier.name} (${String(tier.cashbackPercent)}%)`,
      value: tier.id,
    })),
  ];

  // Animate table rows on mount/filter change
  useEffect(() => {
    if (filteredCustomers.length > 0) {
      setVisibleRows([]);
      filteredCustomers.forEach((_, index) => {
        setTimeout(() => {
          setVisibleRows(prev => [...prev, index]);
        }, index * 50); // Stagger by 50ms
      });
    }
  }, [filteredCustomers.length, tierFilter]);

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
      setVisibleRows(filteredCustomers.map((_, i) => i));
      isFirstRender.current = false;
    }
  }, []);

  // Table rows with enhanced UI and animations
  const rows = filteredCustomers.map((customer, index) => {
    const isVisible = visibleRows.includes(index);
    const isProcessing = calculatingCustomerId === customer.id;
    
    return [
      <div 
        style={{
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'translateX(0)' : 'translateX(-20px)',
          transition: `all 200ms ease-out`,
          width: '100%',
        }}
      >
        <InlineStack gap="200" align="start" blockAlign="start">
          <CustomerAvatar email={customer.email} />
          <BlockStack gap="050">
            <Text variant="bodyMd" fontWeight="medium" as="span">
              {customer.email}
            </Text>
            <Text variant="bodySm" tone="subdued" as="span">
              ID: {customer.shopifyCustomerId}
            </Text>
          </BlockStack>
        </InlineStack>
      </div>,
      <BlockStack gap="100">
        <InlineStack gap="100" align="center">
          {customer.currentTier ? (
            <>
              <TierIcon tierName={customer.currentTier.name} />
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
        {customer.lastTierChange?.triggerType === 'MANUAL_ADMIN' && (
          <Text variant="bodySm" tone="subdued" as="span">
            {customer.lastTierChange.note || 'Manually assigned'}
          </Text>
        )}
      </BlockStack>,
      <BlockStack gap="050">
        <Text variant="bodyMd" fontWeight="semibold" as="span">
          {formatAmount(customer.storeCredit)}
        </Text>
        <Text variant="bodySm" tone="subdued" as="span">
          Available
        </Text>
      </BlockStack>,
      <InlineStack gap="200">
        <Button size="slim" onClick={() => handleViewCustomer(customer.id)}>
          View
        </Button>
        <Tooltip content="Change tier manually">
          <Button 
            size="slim" 
            variant="plain" 
            onClick={() => handleManualTierAssignment(customer)}
            accessibilityLabel={`Manually assign tier for ${customer.email}`}
            icon={EditIcon}
          />
        </Tooltip>
        <Tooltip content="Recalculate tier">
          <Button 
            size="slim" 
            variant="plain" 
            onClick={() => handleCalculateSingle(customer.id)}
            loading={isProcessing}
            accessibilityLabel={`Recalculate tier for ${customer.email}`}
            icon={RefreshIcon}
          />
        </Tooltip>
      </InlineStack>
    ];
  });

  const isLoading = navigation.state === "submitting" || isCalculating;

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
      <Page
        title="Customers"
        primaryAction={{
          content: "Calculate all tiers",
          icon: RefreshIcon,
          onAction: handleCalculateAll,
          loading: isLoading,
        }}
        secondaryActions={[
          {
            content: "Sync from Shopify",
            icon: RefreshIcon,
            onAction: handleSyncCustomers,
            loading: isLoading,
          },
        ]}
      >
        <Layout>
          {/* Stats Overview */}
          <Layout.Section>
            <StatsOverview
              stats={[
                {
                  label: "Total Customers",
                  value: data.totalCustomers.toString(),
                  icon: PersonIcon,
                },
                {
                  label: "Active Tiers",
                  value: data.tiers.length.toString(),
                  icon: RewardIcon,
                },
                {
                  label: "With Store Credit",
                  value: data.customers.filter(c => c.storeCredit > 0).length.toString(),
                  icon: CashDollarIcon,
                },
                {
                  label: "Tier Coverage",
                  value: `${Math.round((data.customers.filter(c => c.currentTier).length / Math.max(data.totalCustomers, 1)) * 100)}%`,
                  icon: ChartVerticalIcon,
                },
              ]}
              loading={navigation.state === "loading"}
            />
          </Layout.Section>

          <Layout.Section>
            <BlockStack gap="600">
              {/* Loyalty Tiers Management */}
              <Card>
                <Box padding="400">
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <Text variant="headingLg" as="h2">
                        Loyalty Tiers
                      </Text>
                      <Button
                        primary
                        icon={PlusIcon}
                        onClick={() => {
                          setEditingTier(null);
                          setTierFormData({
                            name: "",
                            minSpend: "0",
                            cashbackPercent: "0",
                            evaluationPeriod: "ANNUAL",
                          });
                          setTierModalActive(true);
                        }}
                      >
                        Add Tier
                      </Button>
                    </InlineStack>

                    {data.tiers.length === 0 ? (
                      <EmptyState
                        heading="Start rewarding your customers"
                        action={{
                          content: "Create first tier",
                          onAction: () => {
                            setEditingTier(null);
                            setTierFormData({
                              name: "",
                              minSpend: "0",
                              cashbackPercent: "0",
                              evaluationPeriod: "ANNUAL",
                            });
                            setTierModalActive(true);
                          },
                        }}
                        image="https://cdn.shopify.com/s/files/1/0583/8520/4949/files/loyalty-empty-state.svg"
                      >
                        <p>Create loyalty tiers to automatically reward customers based on their spending.</p>
                      </EmptyState>
                    ) : (
                      <BlockStack gap="300">
                        {data.tiers
                          .sort((a, b) => a.minSpend - b.minSpend)
                          .map((tier, index) => {
                            const customerCount = data.tierDistribution[tier.id] || 0;
                            
                            return (
                              <Box key={tier.id} background="bg-surface" padding="0" borderRadius="200">
                                <InlineStack align="space-between" blockAlign="stretch" wrap={false}>
                                  {/* Tier Info Section */}
                                  <Box padding="400" minWidth="0">
                                    <InlineStack gap="400" align="start" blockAlign="start">
                                      {/* Icon */}
                                      <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: '40px',
                                        height: '40px',
                                        borderRadius: '8px',
                                        background: getTierStyle(tier.name).backgroundColor,
                                        border: `2px solid ${getTierStyle(tier.name).borderColor}`,
                                      }}>
                                        <Icon source={getTierStyle(tier.name).icon} tone="base" />
                                      </div>
                                      
                                      {/* Tier Details */}
                                      <BlockStack gap="200">
                                        <InlineStack gap="200" align="start">
                                          <Text variant="headingMd" as="h3">
                                            {tier.name}
                                          </Text>
                                          <Badge tone="success">
                                            {tier.cashbackPercent}% Cashback
                                          </Badge>
                                          {customerCount > 0 && (
                                            <Badge tone="info">
                                              {`${customerCount} ${customerCount === 1 ? 'customer' : 'customers'}`}
                                            </Badge>
                                          )}
                                        </InlineStack>
                                        
                                        <InlineStack gap="400" wrap={false}>
                                          <InlineStack gap="100">
                                            <Icon source={CashDollarIcon} tone="subdued" />
                                            <Text variant="bodyMd" as="span">
                                              <Text variant="bodyMd" fontWeight="semibold" as="span">
                                                {formatAmount(tier.minSpend)}
                                              </Text>
                                              {' min spend'}
                                            </Text>
                                          </InlineStack>
                                          
                                          <Box borderInlineStartWidth="025" borderColor="border">
                                            <Box paddingInlineStart="400">
                                              <InlineStack gap="100">
                                                <Icon source={CalendarIcon} tone="subdued" />
                                                <Text variant="bodyMd" tone="subdued" as="span">
                                                  {tier.evaluationPeriod === "ANNUAL" ? "Annual" : "Lifetime"}
                                                </Text>
                                              </InlineStack>
                                            </Box>
                                          </Box>
                                        </InlineStack>
                                      </BlockStack>
                                    </InlineStack>
                                  </Box>
                                  
                                  {/* Actions Section */}
                                  <Box background="bg-surface-secondary" borderRadius="200">
                                    <Box padding="400">
                                      <InlineStack gap="200">
                                        <Button
                                          size="slim"
                                          icon={EditIcon}
                                          onClick={() => {
                                            setEditingTier(tier);
                                            setTierFormData({
                                              name: tier.name,
                                              minSpend: tier.minSpend.toString(),
                                              cashbackPercent: tier.cashbackPercent.toString(),
                                              evaluationPeriod: tier.evaluationPeriod,
                                            });
                                            setTierModalActive(true);
                                          }}
                                        >
                                          Edit
                                        </Button>
                                        <Button
                                          size="slim"
                                          tone="critical"
                                          icon={DeleteIcon}
                                          onClick={() => {
                                            setDeletingTierId(tier.id);
                                            setDeleteConfirmActive(true);
                                          }}
                                          disabled={customerCount > 0}
                                        >
                                          Delete
                                        </Button>
                                      </InlineStack>
                                    </Box>
                                  </Box>
                                </InlineStack>
                              </Box>
                            );
                          })}
                      </BlockStack>
                    )}
                  </BlockStack>
                </Box>
              </Card>

              {/* Customer Management Module - Integrated with Search */}
              <Card>
                <Box padding="400">
                  <BlockStack gap="400">
                    {/* Header with title and actions */}
                    <InlineStack align="space-between">
                      <Text variant="headingLg" as="h2">
                        Customer Management
                      </Text>
                      <InlineStack gap="200">
                        <Button
                          icon={ExportIcon}
                          onClick={() => {
                            setToast({
                              active: true,
                              content: "Export feature coming soon!",
                              error: false,
                              duration: 3000,
                            });
                          }}
                        >
                          Export
                        </Button>
                      </InlineStack>
                    </InlineStack>

                    {/* Integrated Search and Filter Bar */}
                    <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                      <InlineStack gap="300" align="start" blockAlign="center">
                        <div style={{ flex: 1 }}>
                          <TextField
                            label="Search customers"
                            labelHidden
                            value={searchQuery}
                            onChange={handleSearch}
                            placeholder="Search by email or customer ID..."
                            prefix={<Icon source={SearchIcon} />}
                            clearButton
                            onClearButtonClick={() => handleSearch("")}
                            autoComplete="off"
                          />
                        </div>
                        <Select
                          label="Filter by tier"
                          labelHidden
                          options={tierOptions}
                          value={tierFilter}
                          onChange={handleTierFilter}
                        />
                      </InlineStack>
                    </Box>

                    {/* Results summary */}
                    {searchQuery || tierFilter !== "all" ? (
                      <InlineStack align="space-between">
                        <Text variant="bodySm" tone="subdued" as="span">
                          Showing {filteredCustomers.length} of {data.totalCustomers} customers
                        </Text>
                        {(searchQuery || tierFilter !== "all") && (
                          <Button
                            variant="plain"
                            onClick={() => {
                              handleSearch("");
                              handleTierFilter("all");
                            }}
                          >
                            Clear filters
                          </Button>
                        )}
                      </InlineStack>
                    ) : null}

                    {/* Sync Information Banner */}
                    {data.totalCustomers === 0 && (
                      <Banner
                        title="Import your customers from Shopify"
                        tone="info"
                        icon={InfoIcon}
                      >
                        <p>Click 'Sync from Shopify' to import all your existing customers. This will create customer profiles in the rewards system so you can track store credit and assign loyalty tiers.</p>
                      </Banner>
                    )}

                    {/* Customer Table */}
                    {isLoading && filteredCustomers.length === 0 ? (
                      <LoadingSkeleton type="table" lines={5} />
                    ) : filteredCustomers.length === 0 ? (
                      <EmptyState
                        heading={searchQuery || tierFilter !== "all" ? "No customers match your filters" : "No customers found"}
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                        action={
                          searchQuery || tierFilter !== "all" ? {
                            content: "Clear filters",
                            onAction: () => {
                              handleSearch("");
                              handleTierFilter("all");
                            }
                          } : {
                            content: "Sync from Shopify",
                            onAction: handleSyncCustomers,
                          }
                        }
                      >
                        <p>
                          {searchQuery || tierFilter !== "all" 
                            ? "Try adjusting your search or filter criteria."
                            : "Import your existing customers from Shopify to start tracking their rewards and tier status."}
                        </p>
                      </EmptyState>
                    ) : (
                      <DataTable
                        columnContentTypes={[
                          "text",
                          "text",
                          "numeric",
                          "text",
                        ]}
                        headings={[
                          "Customer",
                          "Current Tier",
                          "Store Credit",
                          "Actions",
                        ]}
                        rows={rows}
                        hoverable
                        truncate
                      />
                    )}
                  </BlockStack>
                </Box>
              </Card>

            </BlockStack>
          </Layout.Section>
        </Layout>

        {/* Customer Detail Modal */}
        {selectedCustomerId && (
          <CustomerDetailModal
            open={modalOpen}
            onClose={() => {
              setModalOpen(false);
              setSelectedCustomerId(null);
            }}
            customerId={selectedCustomerId}
            customerEmail={filteredCustomers.find(c => c.id === selectedCustomerId)?.email || ""}
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
                      <p>Previous manual assignment is active. Setting a new tier will replace it.</p>
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
                helpText="This will override automatic tier calculation"
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
              
              <Checkbox
                label="Permanent override"
                checked={permanentOverride}
                onChange={setPermanentOverride}
                helpText="When enabled, automatic tier recalculation will be disabled for this customer"
              />
              
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