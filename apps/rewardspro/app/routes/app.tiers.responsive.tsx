import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, defer } from "@remix-run/node";
import { useLoaderData, useFetcher, useSubmit, useNavigation } from "@remix-run/react";
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
  Box,
  Divider,
  SkeletonBodyText,
  SkeletonDisplayText,
  InlineGrid,
  MediaCard,
  IndexTable,
  useIndexResourceState,
  useBreakpoints,
} from "@shopify/polaris";
import {
  PlusIcon,
  EditIcon,
  DeleteIcon,
} from "@shopify/polaris-icons";
import { useState, useCallback, useEffect, Suspense, useMemo } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { detectDevice, getDataLimits } from "../utils/device-detection.server";
import { 
  useResizeObserver, 
  useHydrated, 
  useIntersectionObserver 
} from "../hooks/useResponsive";
import "../styles/responsive.css";

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

type LoaderData = {
  tiers: Tier[];
  shop: string;
  stats: {
    totalTiers: number;
    totalCustomers: number;
    tierDistribution: Record<string, number>;
  };
  device: {
    type: "mobile" | "tablet" | "desktop";
    isMobile: boolean;
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

  if (!name || name.trim().length === 0) {
    errors.push("Name is required");
  } else if (name.length > 50) {
    errors.push("Name must be less than 50 characters");
  }

  const minSpendNum = Number(minSpend);
  if (isNaN(minSpendNum) || minSpendNum < 0) {
    errors.push("Valid minimum spend is required");
  }

  const cashbackNum = Number(cashbackPercent);
  if (isNaN(cashbackNum) || cashbackNum < 0 || cashbackNum > 100) {
    errors.push("Cashback must be between 0 and 100");
  }

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

// ============= LOADER WITH DEVICE DETECTION =============
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    
    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;
    
    // Device detection for responsive data loading
    const device = detectDevice(request);
    const limits = getDataLimits(device);

    // Fetch tiers and related data
    const [tiers, customers] = await Promise.all([
      db.tier.findMany({
        where: { shop },
        orderBy: { minSpend: "asc" },
      }),
      db.customer.findMany({
        where: { shop },
        select: { currentTierId: true },
        take: limits.itemsPerPage, // Limit based on device
      }).catch(() => []),
    ]);

    // Calculate tier distribution
    const tierDistribution: Record<string, number> = {};
    customers.forEach((customer) => {
      if (customer.currentTierId) {
        tierDistribution[customer.currentTierId] = (tierDistribution[customer.currentTierId] || 0) + 1;
      }
    });

    // Serialize dates
    const serializedTiers = tiers.map(tier => ({
      ...tier,
      createdAt: tier.createdAt instanceof Date 
        ? tier.createdAt.toISOString() 
        : tier.createdAt,
    }));

    const stats = {
      totalTiers: tiers.length,
      totalCustomers: customers.length,
      tierDistribution,
    };

    // Return data with device info
    return json<LoaderData>({ 
      tiers: serializedTiers, 
      shop, 
      stats,
      device: {
        type: device.type,
        isMobile: device.isMobile,
      }
    });
  } catch (error) {
    console.error("Loader error:", error);
    throw new Response("Failed to load tiers", { status: 500 });
  }
};

// ============= ACTION (same as before) =============
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    
    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;
    const formData = await request.formData();
    const intent = formData.get("intent") as string;

    switch (intent) {
      case "create": {
        const data = validateTierInput(formData);
        
        const existing = await db.tier.findFirst({
          where: { 
            shop,
            OR: [
              { name: data.name },
              { minSpend: data.minSpend },
            ]
          },
        });

        if (existing) {
          return json(
            { error: `A tier with that name or spend amount already exists` },
            { status: 400 }
          );
        }

        const storeName = shop.split('.')[0];
        const tierId = `${storeName}-${data.name.toLowerCase().replace(/\s+/g, '-')}`;
        
        await db.tier.create({
          data: {
            id: tierId,
            shop,
            ...data,
          },
        });

        return json({ success: true });
      }

      case "update": {
        const id = formData.get("id") as string;
        if (!id) {
          return json({ error: "Tier ID is required" }, { status: 400 });
        }

        const data = validateTierInput(formData);

        const existingTier = await db.tier.findFirst({
          where: { id, shop },
        });

        if (!existingTier) {
          return json({ error: "Tier not found" }, { status: 404 });
        }

        await db.tier.update({
          where: { id },
          data,
        });

        return json({ success: true });
      }

      case "delete": {
        const id = formData.get("id") as string;
        if (!id) {
          return json({ error: "Tier ID is required" }, { status: 400 });
        }

        const tier = await db.tier.findFirst({
          where: { id, shop },
        });

        if (!tier) {
          return json({ error: "Tier not found" }, { status: 404 });
        }

        await db.tier.delete({
          where: { id },
        });

        return json({ success: true });
      }

      case "bulk-create": {
        const tiersJson = formData.get("tiers") as string;
        const tiers = JSON.parse(tiersJson);
        
        const storeName = shop.split('.')[0];
        
        for (const tierData of tiers) {
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
            await db.tier.create({
              data: {
                id: tierId,
                shop,
                ...tierData,
              },
            });
          }
        }

        return json({ success: true });
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

// ============= RESPONSIVE COMPONENTS =============

// Mobile tier card component
function MobileTierCard({ 
  tier, 
  customerCount, 
  onEdit, 
  onDelete 
}: { 
  tier: Tier; 
  customerCount: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="card-responsive">
      <Card>
        <Box padding={{ xs: "300", sm: "400" }}>
          <BlockStack gap="300">
            <InlineStack align="space-between" wrap={false}>
              <Text variant="headingMd" as="h3">{tier.name}</Text>
              {customerCount > 0 && (
                <Badge tone="info">{`${customerCount} customers`}</Badge>
              )}
            </InlineStack>
            
            <BlockStack gap="200">
              <InlineGrid
                columns={{ xs: "1fr", sm: "1fr 1fr 1fr" }}
                gap="400"
              >
                <BlockStack gap="050">
                  <Text variant="bodySm" tone="subdued" as="p">Min. Spend</Text>
                  <Text variant="bodyMd" fontWeight="semibold" as="p">
                    ${tier.minSpend.toLocaleString()}
                  </Text>
                </BlockStack>
                <BlockStack gap="050">
                  <Text variant="bodySm" tone="subdued" as="p">Cashback</Text>
                  <Text variant="bodyMd" fontWeight="semibold" as="p">
                    {tier.cashbackPercent}%
                  </Text>
                </BlockStack>
                <BlockStack gap="050">
                  <Text variant="bodySm" tone="subdued" as="p">Period</Text>
                  <Text variant="bodyMd" fontWeight="semibold" as="p">
                    {tier.evaluationPeriod === "ANNUAL" ? "Annual" : "Lifetime"}
                  </Text>
                </BlockStack>
              </InlineGrid>
            </BlockStack>
            
            <div className="button-group-responsive">
              <Button fullWidth onClick={onEdit} icon={EditIcon}>
                Edit Tier
              </Button>
              <Button fullWidth variant="plain" tone="critical" onClick={onDelete}>
                Delete
              </Button>
            </div>
          </BlockStack>
        </Box>
      </Card>
    </div>
  );
}

// Desktop table row component (unchanged from before)
function DesktopTierRow({ 
  tier, 
  customerCount, 
  onEdit, 
  onDelete,
  deleteConfirmId,
  setDeleteConfirmId 
}: any) {
  return [
    <BlockStack gap="050">
      <Text variant="bodyMd" fontWeight="semibold" as="span">{tier.name}</Text>
      {customerCount > 0 && (
        <Text variant="bodySm" tone="subdued" as="span">{`${customerCount} customers`}</Text>
      )}
    </BlockStack>,
    <Text variant="bodyMd" as="span">${tier.minSpend.toLocaleString()}</Text>,
    <Text variant="bodyMd" as="span">{tier.cashbackPercent}%</Text>,
    <Text variant="bodyMd" as="span">
      {tier.evaluationPeriod === "ANNUAL" ? "Annual" : "Lifetime"}
    </Text>,
    <InlineStack gap="200" align="end">
      <Button size="slim" icon={EditIcon} onClick={onEdit}>
        Edit
      </Button>
      {deleteConfirmId === tier.id ? (
        <InlineStack gap="100">
          <Button size="slim" variant="plain" onClick={() => setDeleteConfirmId(null)}>
            Cancel
          </Button>
          <Button size="slim" tone="critical" onClick={onDelete}>
            Confirm
          </Button>
        </InlineStack>
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
    </InlineStack>,
  ];
}

// ============= MAIN COMPONENT =============
export default function ResponsiveTiersPage() {
  const { tiers, stats, device } = useLoaderData<LoaderData>();
  const fetcher = useFetcher();
  const submit = useSubmit();
  const navigation = useNavigation();
  
  // Polaris breakpoints hook
  const { smUp, mdUp, lgUp, xlUp } = useBreakpoints();
  
  // Check if component is hydrated (client-side)
  const hydrated = useHydrated();
  
  // Resize observer for smooth transitions
  const { ref: pageRef, dimensions } = useResizeObserver<HTMLDivElement>();
  
  // State
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

  // Handlers
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

  const handleSubmit = useCallback(() => {
    const errors: string[] = [];
    
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

  const handleDelete = useCallback((id: string) => {
    const formData = new FormData();
    formData.append("intent", "delete");
    formData.append("id", id);
    submit(formData, { method: "post" });
    setDeleteConfirmId(null);
  }, [submit]);

  const handleApplyTemplate = useCallback((template: typeof TIER_TEMPLATES[0]) => {
    const formData = new FormData();
    formData.append("intent", "bulk-create");
    formData.append("tiers", JSON.stringify(template.tiers));
    fetcher.submit(formData, { method: "post" });
    setTemplateModalActive(false);
  }, [fetcher]);

  // Action feedback
  const actionData = fetcher.data as { error?: string; success?: boolean } | undefined;
  const [showBanner, setShowBanner] = useState(true);
  
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
              <Box padding="400">
                <SkeletonDisplayText size="small" />
                <Box paddingBlockStart="200">
                  <SkeletonBodyText lines={5} />
                </Box>
              </Box>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  // Determine which layout to use based on breakpoints
  const isMobileView = !hydrated || !mdUp;
  const isTabletView = hydrated && mdUp && !lgUp;
  const isDesktopView = hydrated && lgUp;
  
  // Memoize tier cards for performance
  const tierCards = useMemo(() => {
    return tiers.map((tier) => (
      <MobileTierCard
        key={tier.id}
        tier={tier}
        customerCount={stats.tierDistribution[tier.id] || 0}
        onEdit={() => handleModalOpen(tier)}
        onDelete={() => handleDelete(tier.id)}
      />
    ));
  }, [tiers, stats.tierDistribution, handleModalOpen, handleDelete]);

  return (
    <div ref={pageRef} className="smooth-resize">
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
        {/* Responsive Metrics Section */}
        <Layout.Section>
          <div className="smooth-grid">
            <InlineGrid 
              columns={{
                xs: "1fr",
                sm: "1fr 1fr",
                md: "1fr 1fr",
                lg: "1fr 1fr",
                xl: "1fr 1fr"
              }}
              gap="400"
            >
              <Card>
                <Box padding={{ xs: "300", sm: "400" }}>
                  <BlockStack gap="100">
                    <Text 
                      variant="headingLg" 
                      as="h3"
                    >
                      {stats.totalTiers}
                    </Text>
                    <Text variant="bodySm" tone="subdued" as="p">
                      Active Tiers
                    </Text>
                  </BlockStack>
                </Box>
              </Card>
              
              <Card>
                <Box padding={{ xs: "300", sm: "400" }}>
                  <BlockStack gap="100">
                    <Text 
                      variant="headingLg" 
                      as="h3"
                    >
                      {stats.totalCustomers}
                    </Text>
                    <Text variant="bodySm" tone="subdued" as="p">
                      Total Customers
                    </Text>
                  </BlockStack>
                </Box>
              </Card>
            </InlineGrid>
          </div>
        </Layout.Section>

        {/* Alerts */}
        {(actionData?.error || actionData?.success) && showBanner && (
          <Layout.Section>
            <Banner 
              tone={actionData.error ? "critical" : "success"} 
              onDismiss={() => setShowBanner(false)}
            >
              <p>{actionData.error || "Operation completed successfully"}</p>
            </Banner>
          </Layout.Section>
        )}

        {/* Main Content - Responsive */}
        <Layout.Section>
          {tiers.length === 0 ? (
            <Card>
              <EmptyState
                heading="Start rewarding your customers"
                action={{
                  content: "Create first tier",
                  onAction: () => handleModalOpen(),
                }}
                secondaryAction={{
                  content: "Use a template",
                  onAction: () => setTemplateModalActive(true),
                }}
                image="https://cdn.shopify.com/s/files/1/0583/8520/4949/files/loyalty-empty-state.svg"
              >
                <p>Create loyalty tiers to automatically reward customers based on their spending.</p>
              </EmptyState>
            </Card>
          ) : (
            <>
              {/* Mobile View - Cards */}
              {isMobileView && (
                <div className="mobile-card-stack smooth-layout content-auto">
                  <BlockStack gap="300">
                    {tierCards}
                  </BlockStack>
                </div>
              )}

              {/* Tablet View - Grid */}
              {isTabletView && (
                <div className="tablet-grid smooth-grid content-auto">
                  {tierCards}
                </div>
              )}

              {/* Desktop View - Table */}
              {isDesktopView && (
                <Card>
                  <div className="responsive-table smooth-layout">
                    <DataTable
                      columnContentTypes={["text", "numeric", "numeric", "text", "text"]}
                      headings={[
                        "Tier Name",
                        "Min. Spend",
                        "Cashback",
                        "Period",
                        "Actions",
                      ]}
                      rows={tiers.map((tier) => 
                        DesktopTierRow({
                          tier,
                          customerCount: stats.tierDistribution[tier.id] || 0,
                          onEdit: () => handleModalOpen(tier),
                          onDelete: () => handleDelete(tier.id),
                          deleteConfirmId,
                          setDeleteConfirmId,
                        })
                      )}
                      hoverable
                    />
                  </div>
                </Card>
              )}
            </>
          )}
        </Layout.Section>
      </Layout>

      {/* Create/Edit Modal - Responsive */}
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
              <Banner tone="critical">
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
            />
            
            <TextField
              label="Minimum Spend"
              value={minSpend}
              onChange={setMinSpend}
              type="number"
              min="0"
              autoComplete="off"
              helpText="Minimum amount to reach this tier"
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
              helpText="Percentage returned as store credit"
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
              helpText="How spending is calculated for tier qualification"
            />
          </FormLayout>
        </Modal.Section>
      </Modal>

      {/* Template Modal - Responsive */}
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
            </Text>
            
            {TIER_TEMPLATES.map((template) => (
              <MediaCard
                key={template.name}
                title={template.name}
                primaryAction={{
                  content: 'Apply Template',
                  onAction: () => handleApplyTemplate(template),
                }}
                description={template.description}
              >
                <BlockStack gap="200">
                  {template.tiers.map((tier, index) => (
                    <InlineStack key={index} align="space-between">
                      <Text variant="bodySm" as="p">
                        <Text variant="bodySm" fontWeight="semibold" as="span">
                          {tier.name}
                        </Text> - ${tier.minSpend}+
                      </Text>
                      <Badge tone="info">{`${tier.cashbackPercent}%`}</Badge>
                    </InlineStack>
                  ))}
                </BlockStack>
              </MediaCard>
            ))}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
    </div>
  );
}