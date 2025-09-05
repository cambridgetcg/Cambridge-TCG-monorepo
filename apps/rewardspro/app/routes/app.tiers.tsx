import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useSubmit, useNavigation } from "@remix-run/react";
export { ErrorBoundary } from "../components/ErrorBoundary";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Button,
  Modal,
  FormLayout,
  TextField,
  Select,
  Banner,
  InlineStack,
  BlockStack,
  Text,
  Badge,
  EmptyState,
  ProgressBar,
  Icon,
  Box,
  Divider,
  ButtonGroup,
  Tooltip,
  Grid,
  CalloutCard,
  SkeletonBodyText,
  SkeletonDisplayText,
} from "@shopify/polaris";
import {
  PlusIcon,
  EditIcon,
  DeleteIcon,
  StarFilledIcon,
  CashDollarFilledIcon,
  PersonSegmentIcon,
  ChartVerticalFilledIcon,
  InfoIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
} from "@shopify/polaris-icons";
import { useState, useCallback, useEffect, useMemo } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// ============= TYPES =============
type Tier = {
  id: string;
  shop: string;
  name: string;
  minSpend: number;
  cashbackPercent: number;
  evaluationPeriod: "ANNUAL" | "LIFETIME";
  createdAt: string;
};

type TierStats = {
  customerCount: number;
  totalRewards: number;
  avgOrderValue: number;
  projectedMonthlyRewards: number;
};

type LoaderData = {
  tiers: Tier[];
  shop: string;
  stats: {
    totalTiers: number;
    totalCustomers: number;
    totalRewardsDistributed: number;
    averageCashback: number;
    tierDistribution: Record<string, number>;
  };
};

// ============= TIER TEMPLATES =============
const TIER_TEMPLATES = [
  {
    name: "Starter Pack",
    description: "Perfect for new stores",
    tiers: [
      { name: "Bronze", minSpend: 0, cashbackPercent: 2, evaluationPeriod: "ANNUAL" as const },
      { name: "Silver", minSpend: 500, cashbackPercent: 3, evaluationPeriod: "ANNUAL" as const },
      { name: "Gold", minSpend: 1000, cashbackPercent: 5, evaluationPeriod: "ANNUAL" as const },
    ],
  },
  {
    name: "Premium Setup",
    description: "For established brands",
    tiers: [
      { name: "Member", minSpend: 0, cashbackPercent: 1, evaluationPeriod: "LIFETIME" as const },
      { name: "VIP", minSpend: 1000, cashbackPercent: 3, evaluationPeriod: "LIFETIME" as const },
      { name: "Elite", minSpend: 5000, cashbackPercent: 5, evaluationPeriod: "LIFETIME" as const },
      { name: "Platinum", minSpend: 10000, cashbackPercent: 7, evaluationPeriod: "LIFETIME" as const },
    ],
  },
  {
    name: "Simple Rewards",
    description: "Two-tier simplicity",
    tiers: [
      { name: "Regular", minSpend: 0, cashbackPercent: 2, evaluationPeriod: "ANNUAL" as const },
      { name: "Premium", minSpend: 750, cashbackPercent: 4, evaluationPeriod: "ANNUAL" as const },
    ],
  },
];

// ============= INPUT VALIDATION =============
const validateTierInput = (formData: FormData) => {
  const name = formData.get("name") as string;
  const minSpend = formData.get("minSpend") as string;
  const cashbackPercent = formData.get("cashbackPercent") as string;
  const evaluationPeriod = formData.get("evaluationPeriod") as string;

  const errors: string[] = [];

  // Name validation
  if (!name || name.trim().length === 0) {
    errors.push("Name is required");
  } else if (name.length > 50) {
    errors.push("Name must be less than 50 characters");
  } else if (!/^[a-zA-Z0-9\s-]+$/.test(name)) {
    errors.push("Name contains invalid characters");
  }

  // MinSpend validation
  const minSpendNum = Number(minSpend);
  if (isNaN(minSpendNum)) {
    errors.push("Minimum spend must be a number");
  } else if (minSpendNum < 0) {
    errors.push("Minimum spend cannot be negative");
  } else if (minSpendNum > 1000000) {
    errors.push("Minimum spend exceeds maximum allowed");
  }

  // Cashback validation
  const cashbackNum = Number(cashbackPercent);
  if (isNaN(cashbackNum)) {
    errors.push("Cashback percent must be a number");
  } else if (cashbackNum < 0 || cashbackNum > 100) {
    errors.push("Cashback percent must be between 0 and 100");
  }

  // Period validation
  if (!["ANNUAL", "LIFETIME"].includes(evaluationPeriod)) {
    errors.push("Invalid evaluation period");
  }

  if (errors.length > 0) {
    throw new Error(errors.join(", "));
  }

  return {
    name: name.trim(),
    minSpend: minSpendNum,
    cashbackPercent: cashbackNum,
    evaluationPeriod: evaluationPeriod as "ANNUAL" | "LIFETIME",
  };
};

// ============= RATE LIMITING =============
const rateLimitMap = new Map<string, number[]>();

const checkRateLimit = (shop: string) => {
  const now = Date.now();
  const windowMs = 60000; // 1 minute window
  const maxRequests = 20; // 20 requests per minute

  const key = shop;
  const timestamps = rateLimitMap.get(key) || [];
  
  // Remove old timestamps
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
    const { session } = await authenticate.admin(request);
    
    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;

    // Fetch tiers and related data
    const [tiers, customers, rewardEntries] = await Promise.all([
      db.tier.findMany({
        where: { shop },
        orderBy: { minSpend: "asc" },
      }),
      db.customer.findMany({
        where: { shop },
        select: { currentTierId: true },
      }).catch(() => []),
      db.storeCreditLedger.findMany({
        where: { shop, type: "CASHBACK_EARNED" },
        select: { amount: true },
      }).catch(() => []),
    ]);

    // Calculate tier distribution
    const tierDistribution: Record<string, number> = {};
    customers.forEach((customer) => {
      if (customer.currentTierId) {
        tierDistribution[customer.currentTierId] = (tierDistribution[customer.currentTierId] || 0) + 1;
      }
    });

    // Calculate total rewards
    const totalRewardsDistributed = rewardEntries.reduce(
      (sum, entry) => sum + parseFloat(entry.amount?.toString() || "0"),
      0
    );

    // Calculate average cashback
    const averageCashback = tiers.length > 0
      ? tiers.reduce((sum, tier) => sum + tier.cashbackPercent, 0) / tiers.length
      : 0;

    // Serialize dates to strings for JSON
    const serializedTiers = tiers.map(tier => ({
      ...tier,
      createdAt: tier.createdAt instanceof Date 
        ? tier.createdAt.toISOString() 
        : tier.createdAt,
    }));

    const stats = {
      totalTiers: tiers.length,
      totalCustomers: customers.length,
      totalRewardsDistributed,
      averageCashback: Math.round(averageCashback * 10) / 10,
      tierDistribution,
    };

    return json<LoaderData>({ tiers: serializedTiers, shop, stats });
  } catch (error) {
    console.error("Loader error:", error);
    throw new Response("Failed to load tiers", { status: 500 });
  }
};

// ============= ACTION =============
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    // Authenticate
    const { session } = await authenticate.admin(request);
    
    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;
    
    // Rate limiting
    checkRateLimit(shop);

    const formData = await request.formData();
    const intent = formData.get("intent") as string;

    switch (intent) {
      case "create": {
        const data = validateTierInput(formData);
        
        // Check for duplicate name
        const existing = await db.tier.findFirst({
          where: { 
            shop,
            name: data.name,
          },
        });

        if (existing) {
          return json(
            { error: `A tier named "${data.name}" already exists` },
            { status: 400 }
          );
        }

        // Check for conflicting minSpend
        const conflicting = await db.tier.findFirst({
          where: {
            shop,
            minSpend: data.minSpend,
          },
        });

        if (conflicting) {
          return json(
            { error: `A tier with minimum spend ${data.minSpend} already exists` },
            { status: 400 }
          );
        }

        // Extract store name from shop domain
        const storeName = shop.split('.')[0];
        
        // Create tier ID
        const tierId = `${storeName}-${data.name.toLowerCase().replace(/\s+/g, '-')}`;
        
        const newTier = await db.tier.create({
          data: {
            id: tierId,
            shop,
            ...data,
          },
        });

        return json({ success: true, tier: newTier });
      }

      case "update": {
        const id = formData.get("id") as string;
        
        if (!id) {
          return json({ error: "Tier ID is required" }, { status: 400 });
        }

        const data = validateTierInput(formData);

        // Verify tier belongs to shop
        const existingTier = await db.tier.findFirst({
          where: { id, shop },
        });

        if (!existingTier) {
          return json({ error: "Tier not found" }, { status: 404 });
        }

        // Check for duplicate name (excluding current tier)
        const duplicateName = await db.tier.findFirst({
          where: {
            shop,
            name: data.name,
            NOT: { id },
          },
        });

        if (duplicateName) {
          return json(
            { error: `A tier named "${data.name}" already exists` },
            { status: 400 }
          );
        }

        const updatedTier = await db.tier.update({
          where: { id },
          data,
        });

        return json({ success: true, tier: updatedTier });
      }

      case "delete": {
        const id = formData.get("id") as string;
        
        if (!id) {
          return json({ error: "Tier ID is required" }, { status: 400 });
        }

        // Verify tier belongs to shop
        const tier = await db.tier.findFirst({
          where: { id, shop },
        });

        if (!tier) {
          return json({ error: "Tier not found" }, { status: 404 });
        }

        await db.tier.delete({
          where: { id },
        });

        return json({ success: true, deletedId: id });
      }

      case "bulk-create": {
        const tiersJson = formData.get("tiers") as string;
        const tiers = JSON.parse(tiersJson);
        
        const storeName = shop.split('.')[0];
        const createdTiers = [];
        
        for (const tierData of tiers) {
          // Check for duplicates
          const existing = await db.tier.findFirst({
            where: { 
              shop,
              OR: [
                { name: tierData.name },
                { minSpend: tierData.minSpend },
              ],
            },
          });

          if (!existing) {
            const tierId = `${storeName}-${tierData.name.toLowerCase().replace(/\s+/g, '-')}`;
            const newTier = await db.tier.create({
              data: {
                id: tierId,
                shop,
                ...tierData,
              },
            });
            createdTiers.push(newTier);
          }
        }

        return json({ 
          success: true, 
          message: `Created ${createdTiers.length} tiers`,
          tiers: createdTiers,
        });
      }

      default:
        return json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Action error:", error);
    
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
export default function TiersPage() {
  const { tiers, stats } = useLoaderData<LoaderData>();
  const fetcher = useFetcher();
  const submit = useSubmit();
  const navigation = useNavigation();
  
  const [modalActive, setModalActive] = useState(false);
  const [editingTier, setEditingTier] = useState<Tier | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [templateModalActive, setTemplateModalActive] = useState(false);
  
  // Form state
  const [name, setName] = useState("");
  const [minSpend, setMinSpend] = useState("");
  const [cashbackPercent, setCashbackPercent] = useState("");
  const [evaluationPeriod, setEvaluationPeriod] = useState<"ANNUAL" | "LIFETIME">("ANNUAL");
  
  const [formErrors, setFormErrors] = useState<string[]>([]);

  const isLoading = navigation.state === "loading";
  const isSaving = fetcher.state === "submitting";

  // Calculate tier insights
  const tierInsights = useMemo(() => {
    if (tiers.length === 0) return null;

    const sortedTiers = [...tiers].sort((a, b) => a.minSpend - b.minSpend);
    const gaps: number[] = [];
    
    for (let i = 1; i < sortedTiers.length; i++) {
      gaps.push(sortedTiers[i].minSpend - sortedTiers[i - 1].minSpend);
    }

    const avgGap = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
    const maxCashback = Math.max(...tiers.map(t => t.cashbackPercent));
    const minCashback = Math.min(...tiers.map(t => t.cashbackPercent));

    return {
      avgGap: Math.round(avgGap),
      maxCashback,
      minCashback,
      hasGoodProgression: gaps.every(gap => gap >= 100 && gap <= 5000),
      recommendation: gaps.some(gap => gap > 5000) 
        ? "Consider adding intermediate tiers to smooth progression"
        : gaps.some(gap => gap < 100)
        ? "Tiers are very close together - consider wider gaps"
        : "Tier progression looks good",
    };
  }, [tiers]);

  // Handle modal open/close
  const handleModalOpen = useCallback((tier?: Tier) => {
    if (tier) {
      setEditingTier(tier);
      setName(tier.name);
      setMinSpend(tier.minSpend.toString());
      setCashbackPercent(tier.cashbackPercent.toString());
      setEvaluationPeriod(tier.evaluationPeriod);
    } else {
      setEditingTier(null);
      setName("");
      setMinSpend("");
      setCashbackPercent("");
      setEvaluationPeriod("ANNUAL");
    }
    setFormErrors([]);
    setModalActive(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setModalActive(false);
    setEditingTier(null);
    setFormErrors([]);
  }, []);

  // Handle form submission
  const handleSubmit = useCallback(() => {
    const errors: string[] = [];
    
    // Client-side validation
    if (!name.trim()) errors.push("Name is required");
    if (!minSpend || Number(minSpend) < 0) errors.push("Valid minimum spend is required");
    if (!cashbackPercent || Number(cashbackPercent) < 0 || Number(cashbackPercent) > 100) {
      errors.push("Cashback must be between 0 and 100");
    }

    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }

    const formData = new FormData();
    formData.append("intent", editingTier ? "update" : "create");
    if (editingTier) {
      formData.append("id", editingTier.id);
    }
    formData.append("name", name);
    formData.append("minSpend", minSpend);
    formData.append("cashbackPercent", cashbackPercent);
    formData.append("evaluationPeriod", evaluationPeriod);

    fetcher.submit(formData, { method: "post" });
    handleModalClose();
  }, [name, minSpend, cashbackPercent, evaluationPeriod, editingTier, fetcher, handleModalClose]);

  // Handle delete
  const handleDelete = useCallback((id: string) => {
    const formData = new FormData();
    formData.append("intent", "delete");
    formData.append("id", id);
    submit(formData, { method: "post" });
    setDeleteConfirmId(null);
  }, [submit]);

  // Handle template application
  const handleApplyTemplate = useCallback((template: typeof TIER_TEMPLATES[0]) => {
    const formData = new FormData();
    formData.append("intent", "bulk-create");
    formData.append("tiers", JSON.stringify(template.tiers));
    fetcher.submit(formData, { method: "post" });
    setTemplateModalActive(false);
  }, [fetcher]);

  // Prepare table data
  const rows = tiers.map((tier, index) => {
    const customerCount = stats.tierDistribution[tier.id] || 0;
    const previousTier = index > 0 ? tiers[index - 1] : null;
    const spendGap = previousTier ? tier.minSpend - previousTier.minSpend : 0;
    const cashbackIncrease = previousTier ? tier.cashbackPercent - previousTier.cashbackPercent : 0;
    
    return [
      <Box>
        <BlockStack gap="100">
          <InlineStack align="space-between" blockAlign="center" gap="200">
            <Text variant="bodyMd" fontWeight="semibold" as="span">{tier.name}</Text>
            {customerCount > 0 && (
              <Badge tone="info">{`${customerCount} customers`}</Badge>
            )}
          </InlineStack>
          {previousTier && (
            <Text variant="bodySm" tone="subdued" as="span">
              +${spendGap.toLocaleString()} from {previousTier.name}
            </Text>
          )}
        </BlockStack>
      </Box>,
      <BlockStack gap="100">
        <Text variant="bodyMd" as="span">${tier.minSpend.toLocaleString()}</Text>
        {index === 0 && (
          <Badge tone="success">{`Entry Level`}</Badge>
        )}
      </BlockStack>,
      <BlockStack gap="100">
        <InlineStack gap="200" blockAlign="center">
          <Text variant="bodyMd" as="span">{tier.cashbackPercent}%</Text>
          <ProgressBar progress={tier.cashbackPercent} size="small" />
        </InlineStack>
        {cashbackIncrease > 0 && (
          <Badge tone="success">{`+${cashbackIncrease}%`}</Badge>
        )}
      </BlockStack>,
      <Badge tone={tier.evaluationPeriod === "ANNUAL" ? "info" : "success"}>
        {tier.evaluationPeriod}
      </Badge>,
      <ButtonGroup>
        <Button size="slim" icon={EditIcon} onClick={() => handleModalOpen(tier)}>
          Edit
        </Button>
        {deleteConfirmId === tier.id ? (
          <>
            <Button size="slim" tone="critical" onClick={() => handleDelete(tier.id)}>
              Confirm Delete
            </Button>
            <Button size="slim" variant="plain" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button 
            size="slim" 
            variant="plain" 
            tone="critical" 
            icon={DeleteIcon}
            onClick={() => setDeleteConfirmId(tier.id)}
          >
            Delete
          </Button>
        )}
      </ButtonGroup>,
    ];
  });

  // Show success/error messages
  const actionData = fetcher.data as { error?: string; success?: boolean; message?: string } | undefined;
  const [showBanner, setShowBanner] = useState(true);
  
  // Reset banner visibility when new action data comes in
  useEffect(() => {
    if (actionData) {
      setShowBanner(true);
    }
  }, [actionData]);

  // Loading state
  if (isLoading) {
    return (
      <Page title="Loyalty Tiers">
        <Layout>
          <Layout.Section>
            <Card>
              <SkeletonDisplayText size="small" />
              <SkeletonBodyText lines={5} />
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }
  
  return (
    <Page
      title="Loyalty Tiers"
      primaryAction={{
        content: "Add Tier",
        icon: PlusIcon,
        onAction: () => handleModalOpen(),
      }}
      secondaryActions={
        tiers.length === 0 
          ? [{
              content: "Use Template",
              onAction: () => setTemplateModalActive(true),
            }]
          : undefined
      }
    >
      <Layout>
        {/* Statistics Cards */}
        <Layout.Section>
          <Grid>
            <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 3, lg: 3}}>
              <Card>
                <InlineStack align="space-between">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h3">{stats.totalTiers}</Text>
                    <Text variant="bodySm" tone="subdued" as="p">Active Tiers</Text>
                    {stats.totalTiers > 0 && (
                      <Text variant="bodySm" as="p">
                        {Object.values(stats.tierDistribution).filter(count => count > 0).length} with customers
                      </Text>
                    )}
                  </BlockStack>
                  <Icon source={StarFilledIcon} tone="base" />
                </InlineStack>
              </Card>
            </Grid.Cell>
            
            <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 3, lg: 3}}>
              <Card>
                <InlineStack align="space-between">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h3">{stats.totalCustomers}</Text>
                    <Text variant="bodySm" tone="subdued" as="p">Total Customers</Text>
                    {stats.totalCustomers > 0 && tiers.length > 0 && (
                      <Text variant="bodySm" as="p">
                        {Math.round(stats.totalCustomers / tiers.length)} avg per tier
                      </Text>
                    )}
                  </BlockStack>
                  <Icon source={PersonSegmentIcon} tone="base" />
                </InlineStack>
              </Card>
            </Grid.Cell>
            
            <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 3, lg: 3}}>
              <Card>
                <InlineStack align="space-between">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h3">{stats.averageCashback}%</Text>
                    <Text variant="bodySm" tone="subdued" as="p">Avg Cashback</Text>
                    {tierInsights && (
                      <Text variant="bodySm" as="p">
                        {tierInsights.minCashback}% - {tierInsights.maxCashback}% range
                      </Text>
                    )}
                  </BlockStack>
                  <Icon source={CashDollarFilledIcon} tone="base" />
                </InlineStack>
              </Card>
            </Grid.Cell>
            
            <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 3, lg: 3}}>
              <Card>
                <InlineStack align="space-between">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h3">
                      ${stats.totalRewardsDistributed.toLocaleString()}
                    </Text>
                    <Text variant="bodySm" tone="subdued" as="p">Total Rewards</Text>
                    {stats.totalRewardsDistributed > 0 && stats.totalCustomers > 0 && (
                      <Text variant="bodySm" as="p">
                        ${Math.round(stats.totalRewardsDistributed / stats.totalCustomers)} per customer
                      </Text>
                    )}
                  </BlockStack>
                  <Icon source={ChartVerticalFilledIcon} tone="base" />
                </InlineStack>
              </Card>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* Alerts and Messages */}
        <Layout.Section>
          <BlockStack gap="400">
            {actionData?.error && showBanner && (
              <Banner tone="critical" onDismiss={() => setShowBanner(false)}>
                <p>{actionData.error}</p>
              </Banner>
            )}
            {actionData?.success && showBanner && (
              <Banner tone="success" icon={CheckCircleIcon} onDismiss={() => setShowBanner(false)}>
                <p>{actionData.message || `Tier ${editingTier ? "updated" : "created"} successfully!`}</p>
              </Banner>
            )}
            
            {tierInsights && !tierInsights.hasGoodProgression && (
              <CalloutCard
                title="Tier Progression Insight"
                illustration="https://cdn.shopify.com/s/files/1/0583/8520/4949/files/chart-illustration.svg"
                primaryAction={{
                  content: "Review Tiers",
                  onAction: () => {},
                }}
              >
                <Text variant="bodyMd" as="p">{tierInsights.recommendation}</Text>
              </CalloutCard>
            )}
          </BlockStack>
        </Layout.Section>

        {/* Main Content */}
        <Layout.Section>
          <Card>
            {tiers.length === 0 ? (
              <EmptyState
                heading="Start rewarding your customers"
                action={{
                  content: "Create first tier",
                  icon: PlusIcon,
                  onAction: () => handleModalOpen(),
                }}
                secondaryAction={{
                  content: "Use a template",
                  onAction: () => setTemplateModalActive(true),
                }}
                image="https://cdn.shopify.com/s/files/1/0583/8520/4949/files/loyalty-empty-state.svg"
              >
                <Text variant="bodyMd" as="p">
                  Create loyalty tiers to automatically reward customers based on their spending. 
                  Customers earn cashback and move up tiers as they shop more.
                </Text>
              </EmptyState>
            ) : (
              <BlockStack gap="400">
                {/* Tier Progression Visualization */}
                <Box padding="400" borderRadius="200" background="bg-surface-secondary">
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="headingSm" as="h3">Tier Progression</Text>
                      <Badge tone="success">{`${tiers.length} Active Tiers`}</Badge>
                    </InlineStack>
                    <InlineStack gap="100" wrap={false} blockAlign="center">
                      {tiers.map((tier, index) => (
                        <>
                          <Box key={tier.id} minWidth="140px">
                            <BlockStack gap="100">
                              <Box 
                                padding="300" 
                                borderRadius="200" 
                                background={
                                  index === 0 
                                    ? "bg-fill-success-secondary" 
                                    : index === tiers.length - 1 
                                    ? "bg-fill-warning-secondary"
                                    : "bg-fill-info-secondary"
                                }
                              >
                                <BlockStack gap="100">
                                  <Text variant="bodyMd" alignment="center" fontWeight="bold" as="p">
                                    {tier.name}
                                  </Text>
                                  <InlineStack align="center" gap="100">
                                    <Badge tone={index === 0 ? "success" : "info"}>
                                      {`${tier.cashbackPercent}%`}
                                    </Badge>
                                    {stats.tierDistribution[tier.id] > 0 && (
                                      <Badge tone="attention">
                                        {`${stats.tierDistribution[tier.id]} members`}
                                      </Badge>
                                    )}
                                  </InlineStack>
                                </BlockStack>
                              </Box>
                              <Text variant="bodySm" alignment="center" tone="subdued" as="p">
                                Spend ${tier.minSpend.toLocaleString()}+
                              </Text>
                              {tier.evaluationPeriod === "ANNUAL" && (
                                <Text variant="bodySm" alignment="center" tone="subdued" as="p">
                                  per year
                                </Text>
                              )}
                            </BlockStack>
                          </Box>
                          {index < tiers.length - 1 && (
                            <Box key={`arrow-${index}`} paddingInline="100">
                              <Text variant="headingLg" tone="subdued" as="span">→</Text>
                            </Box>
                          )}
                        </>
                      ))}
                    </InlineStack>
                    {tierInsights && (
                      <Box padding="200" borderRadius="100" background="bg-fill-tertiary">
                        <InlineStack align="space-between" blockAlign="center">
                          <Text variant="bodySm" as="p">
                            <Icon source={InfoIcon} tone="base" /> {tierInsights.recommendation}
                          </Text>
                        </InlineStack>
                      </Box>
                    )}
                  </BlockStack>
                </Box>

                <Divider />
                
                {/* Data Table */}
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text"]}
                  headings={[
                    "Tier Name",
                    "Min Spend",
                    "Cashback",
                    "Period",
                    "Actions",
                  ]}
                  rows={rows}
                  hoverable
                />
              </BlockStack>
            )}
          </Card>
        </Layout.Section>

        {/* Sidebar */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            {/* Quick Actions */}
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">
                  Quick Actions
                </Text>
                <Button fullWidth onClick={() => setTemplateModalActive(true)}>
                  Browse Templates
                </Button>
                {tiers.length > 0 && (
                  <Button fullWidth variant="plain">
                    Export Tier Data
                  </Button>
                )}
              </BlockStack>
            </Card>

            {/* Recommended Next Tier */}
            {tiers.length > 0 && tierInsights && (
              <Card>
                <BlockStack gap="300">
                  <InlineStack gap="200" blockAlign="center">
                    <Icon source={StarFilledIcon} tone="warning" />
                    <Text variant="headingMd" as="h2">
                      Recommended Next Tier
                    </Text>
                  </InlineStack>
                  
                  <BlockStack gap="200">
                    {tiers.length < 5 && tierInsights.avgGap > 500 && (
                      <Box padding="200" borderRadius="100" background="bg-fill-info-secondary">
                        <BlockStack gap="100">
                          <Text variant="bodyMd" fontWeight="semibold" as="p">
                            Add Intermediate Tier
                          </Text>
                          <Text variant="bodySm" tone="subdued" as="p">
                            Consider adding a tier between ${Math.round(tiers[0].minSpend + tierInsights.avgGap / 2)} - ${Math.round(tiers[tiers.length - 1].minSpend - tierInsights.avgGap / 2)}
                          </Text>
                          <Text variant="bodySm" as="p">
                            Cashback: {Math.round((tierInsights.minCashback + tierInsights.maxCashback) / 2)}%
                          </Text>
                        </BlockStack>
                      </Box>
                    )}
                    
                    {tiers.length === 1 && (
                      <Box padding="200" borderRadius="100" background="bg-fill-success-secondary">
                        <BlockStack gap="100">
                          <Text variant="bodyMd" fontWeight="semibold" as="p">
                            Add Premium Tier
                          </Text>
                          <Text variant="bodySm" tone="subdued" as="p">
                            Create a VIP tier at $1000+ with {tiers[0].cashbackPercent + 2}% cashback
                          </Text>
                        </BlockStack>
                      </Box>
                    )}
                    
                    {tierInsights.maxCashback < 5 && (
                      <Box padding="200" borderRadius="100" background="bg-fill-warning-secondary">
                        <BlockStack gap="100">
                          <Text variant="bodyMd" fontWeight="semibold" as="p">
                            Boost Top Tier Rewards
                          </Text>
                          <Text variant="bodySm" tone="subdued" as="p">
                            Consider increasing your highest tier to 5-7% cashback to incentivize big spenders
                          </Text>
                        </BlockStack>
                      </Box>
                    )}
                  </BlockStack>
                </BlockStack>
              </Card>
            )}

            {/* Help Card */}
            <Card>
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Icon source={InfoIcon} tone="base" />
                  <Text variant="headingMd" as="h2">
                    How Tiers Work
                  </Text>
                </InlineStack>
                
                <BlockStack gap="200">
                  <Box>
                    <Text variant="bodyMd" fontWeight="semibold" as="p">
                      Annual Period
                    </Text>
                    <Text variant="bodySm" tone="subdued" as="p">
                      Based on spending in the last 12 months. Customers can move up or down.
                    </Text>
                  </Box>
                  
                  <Box>
                    <Text variant="bodyMd" fontWeight="semibold" as="p">
                      Lifetime Period
                    </Text>
                    <Text variant="bodySm" tone="subdued" as="p">
                      Based on all-time spending. Customers never move down.
                    </Text>
                  </Box>
                  
                  <Box>
                    <Text variant="bodyMd" fontWeight="semibold" as="p">
                      Best Practices
                    </Text>
                    <Text variant="bodySm" tone="subdued" as="p">
                      • Start with 3-4 tiers for simplicity
                      <br />• Space tiers evenly for smooth progression
                      <br />• Increase rewards gradually (2-3% jumps)
                      <br />• Use round numbers for spending thresholds
                    </Text>
                  </Box>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Insights Card */}
            {tierInsights && tiers.length > 0 && (
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">
                    Tier Insights
                  </Text>
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text variant="bodySm" tone="subdued" as="p">Avg. Tier Gap</Text>
                      <Text variant="bodySm" as="p">${tierInsights.avgGap}</Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text variant="bodySm" tone="subdued" as="p">Cashback Range</Text>
                      <Text variant="bodySm" as="p">{tierInsights.minCashback}% - {tierInsights.maxCashback}%</Text>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>

      {/* Create/Edit Modal */}
      <Modal
        open={modalActive}
        onClose={handleModalClose}
        title={editingTier ? "Edit Tier" : "Create New Tier"}
        primaryAction={{
          content: editingTier ? "Update" : "Create",
          onAction: handleSubmit,
          loading: isSaving,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: handleModalClose,
          },
        ]}
      >
        <Modal.Section>
          {formErrors.length > 0 && (
            <Box paddingBlockEnd="400">
              <Banner tone="critical" icon={AlertTriangleIcon}>
                <BlockStack gap="200">
                  {formErrors.map((error, i) => (
                    <Text key={i} variant="bodyMd" as="p">
                      {error}
                    </Text>
                  ))}
                </BlockStack>
              </Banner>
            </Box>
          )}
          
          <FormLayout>
            <TextField
              label="Tier Name"
              value={name}
              onChange={setName}
              autoComplete="off"
              helpText="E.g., Bronze, Silver, Gold"
              placeholder="Enter tier name"
            />
            
            <TextField
              label="Minimum Spend"
              value={minSpend}
              onChange={setMinSpend}
              type="number"
              min="0"
              autoComplete="off"
              helpText="Minimum amount customer must spend to reach this tier"
              placeholder="0"
              prefix="$"
            />
            
            <TextField
              label="Cashback Percentage"
              value={cashbackPercent}
              onChange={setCashbackPercent}
              type="number"
              min="0"
              max="100"
              autoComplete="off"
              helpText="Percentage of order value returned as store credit"
              placeholder="5"
              suffix="%"
            />
            
            <Select
              label="Evaluation Period"
              options={[
                { label: "Annual (12 months rolling)", value: "ANNUAL" },
                { label: "Lifetime (all-time spending)", value: "LIFETIME" },
              ]}
              value={evaluationPeriod}
              onChange={(value) => setEvaluationPeriod(value as "ANNUAL" | "LIFETIME")}
              helpText="How customer spending is calculated for tier qualification"
            />
          </FormLayout>

          {/* Preview */}
          {(name || minSpend || cashbackPercent) && (
            <Box paddingBlockStart="400">
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3">Preview</Text>
                  <Divider />
                  <InlineStack align="space-between">
                    <Text variant="bodyMd" fontWeight="semibold" as="p">
                      {name || "Tier Name"}
                    </Text>
                    <Badge>{evaluationPeriod}</Badge>
                  </InlineStack>
                  <Text variant="bodySm" tone="subdued" as="p">
                    Customers who spend ${minSpend || "0"}+ will earn {cashbackPercent || "0"}% cashback
                  </Text>
                </BlockStack>
              </Card>
            </Box>
          )}
        </Modal.Section>
      </Modal>

      {/* Template Modal */}
      <Modal
        open={templateModalActive}
        onClose={() => setTemplateModalActive(false)}
        title="Choose a Template"
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setTemplateModalActive(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text variant="bodyMd" as="p">
              Select a pre-configured tier structure to get started quickly. 
              You can customize the tiers after applying the template.
            </Text>
            
            {TIER_TEMPLATES.map((template) => (
              <Card key={template.name}>
                <BlockStack gap="300">
                  <InlineStack align="space-between">
                    <div>
                      <Text variant="headingMd" as="h3">{template.name}</Text>
                      <Text variant="bodySm" tone="subdued" as="p">
                        {template.description}
                      </Text>
                    </div>
                    <Button onClick={() => handleApplyTemplate(template)}>
                      Apply
                    </Button>
                  </InlineStack>
                  
                  <Divider />
                  
                  <BlockStack gap="200">
                    {template.tiers.map((tier, index) => (
                      <InlineStack key={index} align="space-between">
                        <Text variant="bodySm" as="p">
                          <strong>{tier.name}</strong> - ${tier.minSpend}+
                        </Text>
                        <Badge tone="info">{`${tier.cashbackPercent}%`}</Badge>
                      </InlineStack>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Card>
            ))}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}