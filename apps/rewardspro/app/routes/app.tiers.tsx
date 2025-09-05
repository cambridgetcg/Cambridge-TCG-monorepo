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
  Box,
  Divider,
  SkeletonBodyText,
  SkeletonDisplayText,
} from "@shopify/polaris";
import {
  PlusIcon,
  EditIcon,
  DeleteIcon,
} from "@shopify/polaris-icons";
import { useState, useCallback, useEffect } from "react";
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

type LoaderData = {
  tiers: Tier[];
  shop: string;
  stats: {
    totalTiers: number;
    totalCustomers: number;
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
    const [tiers, customers] = await Promise.all([
      db.tier.findMany({
        where: { shop },
        orderBy: { minSpend: "asc" },
      }),
      db.customer.findMany({
        where: { shop },
        select: { currentTierId: true },
      }).catch(() => []),
    ]);

    // Calculate tier distribution
    const tierDistribution: Record<string, number> = {};
    customers.forEach((customer) => {
      if (customer.currentTierId) {
        tierDistribution[customer.currentTierId] = (tierDistribution[customer.currentTierId] || 0) + 1;
      }
    });

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
  const rows = tiers.map((tier) => {
    const customerCount = stats.tierDistribution[tier.id] || 0;
    
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
        <Button size="slim" icon={EditIcon} onClick={() => handleModalOpen(tier)}>
          Edit
        </Button>
        {deleteConfirmId === tier.id ? (
          <InlineStack gap="100">
            <Button size="slim" variant="plain" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button size="slim" tone="critical" onClick={() => handleDelete(tier.id)}>
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
        {/* Key Metrics */}
        <Layout.Section>
          <InlineStack gap="400">
            <Card>
              <Box padding="400">
                <BlockStack gap="100">
                  <Text variant="headingLg" as="h3">{stats.totalTiers}</Text>
                  <Text variant="bodySm" tone="subdued" as="p">Active Tiers</Text>
                </BlockStack>
              </Box>
            </Card>
            
            <Card>
              <Box padding="400">
                <BlockStack gap="100">
                  <Text variant="headingLg" as="h3">{stats.totalCustomers}</Text>
                  <Text variant="bodySm" tone="subdued" as="p">Total Customers</Text>
                </BlockStack>
              </Box>
            </Card>
          </InlineStack>
        </Layout.Section>

        {/* Alerts and Messages */}
        {(actionData?.error || actionData?.success) && showBanner && (
          <Layout.Section>
            <Banner 
              tone={actionData.error ? "critical" : "success"} 
              onDismiss={() => setShowBanner(false)}
            >
              <p>{actionData.error || actionData.message || "Operation completed successfully"}</p>
            </Banner>
          </Layout.Section>
        )}

        {/* Main Content */}
        <Layout.Section>
          <Card>
            {tiers.length === 0 ? (
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
            ) : (
              <div style={{ 
                "--table-column-widths": "25% 18% 15% 17% 25%",
              } as React.CSSProperties}>
                <style>{`
                  .Polaris-DataTable__Table {
                    table-layout: fixed;
                  }
                  .Polaris-DataTable__Table th:nth-child(1),
                  .Polaris-DataTable__Table td:nth-child(1) {
                    width: 25%;
                  }
                  .Polaris-DataTable__Table th:nth-child(2),
                  .Polaris-DataTable__Table td:nth-child(2) {
                    width: 18%;
                  }
                  .Polaris-DataTable__Table th:nth-child(3),
                  .Polaris-DataTable__Table td:nth-child(3) {
                    width: 15%;
                  }
                  .Polaris-DataTable__Table th:nth-child(4),
                  .Polaris-DataTable__Table td:nth-child(4) {
                    width: 17%;
                  }
                  .Polaris-DataTable__Table th:nth-child(5),
                  .Polaris-DataTable__Table td:nth-child(5) {
                    width: 25%;
                  }
                `}</style>
                <DataTable
                  columnContentTypes={["text", "numeric", "numeric", "text", "text"]}
                  headings={[
                    "Tier Name",
                    "Min. Spend",
                    "Cashback",
                    "Period",
                    "Actions",
                  ]}
                  rows={rows}
                  hoverable
                />
              </div>
            )}
          </Card>
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
            </Text>
            
            {TIER_TEMPLATES.map((template) => (
              <Card key={template.name}>
                <Box padding="400">
                  <BlockStack gap="300">
                    <InlineStack align="space-between">
                      <BlockStack gap="100">
                        <Text variant="headingMd" as="h3">{template.name}</Text>
                        <Text variant="bodySm" tone="subdued" as="p">
                          {template.description}
                        </Text>
                      </BlockStack>
                      <Button onClick={() => handleApplyTemplate(template)}>
                        Apply
                      </Button>
                    </InlineStack>
                    
                    <Divider />
                    
                    <BlockStack gap="200">
                      {template.tiers.map((tier, index) => (
                        <InlineStack key={index} align="space-between">
                          <Text variant="bodySm" as="p">
                            <Text variant="bodySm" fontWeight="semibold" as="span">{tier.name}</Text> - ${tier.minSpend}+
                          </Text>
                          <Badge tone="info">{`${tier.cashbackPercent}%`}</Badge>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  </BlockStack>
                </Box>
              </Card>
            ))}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}