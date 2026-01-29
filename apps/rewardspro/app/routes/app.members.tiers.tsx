import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData, Link } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  Button,
  TextField,
  Select,
  Banner,
  InlineStack,
  BlockStack,
  Text,
  Badge,
  EmptyState,
  Box,
  Modal,
  FormLayout,
  Divider,
  Toast,
  Frame,
  Icon,
} from "@shopify/polaris";
import {
  PlusIcon,
  DeleteIcon,
  EditIcon,
  CashDollarIcon,
  CalendarIcon,
  PackageIcon,
} from "~/utils/polaris-icons";
import { authenticate } from "../shopify.server";
import { useToast } from "~/hooks/useToast";
import {
  atomicTierCreate,
  LimitExceededError,
} from "~/utils/atomic-limit-control.server";
import db from "../db.server";
import { formatCurrency } from "../utils/currency";
import { getTierStyle } from "../utils/tier-styles";
import { getEntitlements } from "../services/entitlements.server";
import { TierEmptyStateV1B } from "../components/TierEmptyStateVariations";
import { checkLimitAccess } from "~/utils/require-feature.server";
import { LimitHint, PageLimitStatus } from "~/components/Billing/UpgradePrompt";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface Tier {
  id: string;
  name: string;
  cashbackPercent: number;
  minSpend: number;
  evaluationPeriod: "ANNUAL" | "LIFETIME";
}

interface LoaderData {
  tiers: Tier[];
  shopSettings: {
    storeCurrency: string;
    currencyDisplayType: string;
  } | null;
  tierDistribution: Record<string, number>;
  hasAnnualEval: boolean;
  limitAccess: {
    canCreate: boolean;
    current: number;
    max: number;
    message?: string;
  };
}

// ============================================
// LOADER
// ============================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Fetch entitlements for feature flags
  const entitlements = await getEntitlements(shop);
  const hasAnnualEval = entitlements.featureAnnualEval;

  // Check tier limit for rate-based gating
  const tierCount = await db.tier.count({ where: { shop } });
  const limitAccess = await checkLimitAccess(shop, 'maxTiers', tierCount);

  // Fetch tiers and settings
  // DATA API COMPATIBLE: groupBy is not supported by Aurora Data API adapter
  // Instead, fetch only currentTierId and count in memory
  const [tiers, shopSettings, customersWithTiers] = await Promise.all([
    db.tier.findMany({
      where: { shop },
      orderBy: { minSpend: "asc" },
    }),
    db.shopSettings.findUnique({
      where: { shop },
    }),
    // Fetch only tierId field for counting - works with Data API
    db.customer.findMany({
      where: { shop },
      select: { currentTierId: true },
    }),
  ]);

  // Count tier distribution in memory
  const tierDistribution: Record<string, number> = {};
  for (const customer of customersWithTiers) {
    if (customer.currentTierId) {
      tierDistribution[customer.currentTierId] = (tierDistribution[customer.currentTierId] || 0) + 1;
    }
  }

  return json<LoaderData>({
    tiers: tiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      cashbackPercent: tier.cashbackPercent ?? 0,
      minSpend: tier.minSpend ?? 0,
      evaluationPeriod: (tier.evaluationPeriod as "ANNUAL" | "LIFETIME") || "LIFETIME",
    })),
    shopSettings: shopSettings
      ? {
          storeCurrency: shopSettings.storeCurrency,
          currencyDisplayType: shopSettings.currencyDisplayType,
        }
      : null,
    tierDistribution,
    hasAnnualEval,
    limitAccess: {
      canCreate: limitAccess.hasAccess,
      current: tierCount,
      max: limitAccess.error?.maxLimit ?? 999999,
      message: limitAccess.error?.message,
    },
  });
};

// ============================================
// ACTION
// ============================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create") {
    const name = formData.get("name") as string;
    const minSpend = Number(formData.get("minSpend"));
    const cashbackPercent = Number(formData.get("cashbackPercent"));
    const evaluationPeriod = formData.get("evaluationPeriod") as "ANNUAL" | "LIFETIME";

    // Validate inputs first (before transaction)
    if (!name || name.trim().length === 0) {
      return json({ error: "Name is required" }, { status: 400 });
    }
    if (isNaN(minSpend) || minSpend < 0) {
      return json({ error: "Invalid minimum spend" }, { status: 400 });
    }
    if (isNaN(cashbackPercent) || cashbackPercent < 0 || cashbackPercent > 100) {
      return json({ error: "Cashback must be between 0 and 100" }, { status: 400 });
    }

    // Check for duplicate (before transaction to fail fast)
    const existing = await db.tier.findFirst({
      where: { shop, name: name.trim() },
    });

    if (existing) {
      return json({ error: `A tier named "${name}" already exists` }, { status: 400 });
    }

    // Generate tier ID
    const storeName = shop.split(".")[0];
    const tierId = `${storeName}-${name.trim().toLowerCase().replace(/\s+/g, "-")}`;

    // Atomic tier creation with limit check
    // This prevents TOCTOU race conditions where two concurrent requests
    // could both pass the limit check and create tiers exceeding the limit
    try {
      await atomicTierCreate(shop, {
        id: tierId,
        name: name.trim(),
        minSpend,
        cashbackPercent,
        evaluationPeriod,
      });
    } catch (error) {
      if (error instanceof LimitExceededError) {
        return error.toJsonResponse();
      }
      throw error;
    }

    return json({ success: true, message: "Tier created successfully" });
  }

  if (intent === "update") {
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

    await db.tier.update({
      where: { id },
      data: {
        name: name.trim(),
        minSpend,
        cashbackPercent,
        evaluationPeriod,
        updatedAt: new Date(),
      },
    });

    return json({ success: true, message: "Tier updated successfully" });
  }

  if (intent === "delete") {
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
        error: `Cannot delete tier with ${customerCount} assigned customers. Please reassign customers first.`,
      }, { status: 400 });
    }

    // Check if tier products are linked to this tier
    let tierProductCount = 0;
    try {
      tierProductCount = await (db as any).tierProduct.count({
        where: { shop, tierId: id },
      });
    } catch (e) {
      // TierProduct table may not exist in all environments
    }

    if (tierProductCount > 0) {
      return json({
        error: `Cannot delete tier with ${tierProductCount} linked tier products. Please delete the products first.`,
      }, { status: 400 });
    }

    await db.tier.delete({
      where: { id },
    });

    return json({ success: true, message: "Tier deleted successfully" });
  }

  return json({ error: "Unknown action" }, { status: 400 });
};

// ============================================
// COMPONENT
// ============================================

export default function TiersPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();

  // Modal states
  const [tierModalActive, setTierModalActive] = useState(false);
  const [editingTier, setEditingTier] = useState<Tier | null>(null);
  const [deleteConfirmActive, setDeleteConfirmActive] = useState(false);
  const [deletingTierId, setDeletingTierId] = useState<string | null>(null);

  // Form state
  const [tierFormData, setTierFormData] = useState({
    name: "",
    minSpend: "0",
    cashbackPercent: "0",
    evaluationPeriod: data.hasAnnualEval ? "ANNUAL" : "LIFETIME" as "ANNUAL" | "LIFETIME",
  });

  // Standardized toast notifications
  const { toast, showSuccess, showError, hideToast } = useToast();

  const isSubmitting = navigation.state === "submitting";

  // Handle action response
  useEffect(() => {
    if (actionData) {
      if ("success" in actionData && actionData.success) {
        showSuccess(actionData.message || "Success");
        setTierModalActive(false);
        setDeleteConfirmActive(false);
        setEditingTier(null);
        setDeletingTierId(null);
      } else if ("error" in actionData) {
        showError(actionData.error || "An error occurred");
      }
    }
  }, [actionData, showSuccess, showError]);

  // Format currency helper
  const formatAmount = useCallback(
    (amount: number) => {
      return formatCurrency(amount, data.shopSettings as any);
    },
    [data.shopSettings]
  );

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
  }, [editingTier, tierFormData, submit]);

  const handleDeleteTier = useCallback(() => {
    if (deletingTierId) {
      const formData = new FormData();
      formData.append("intent", "delete");
      formData.append("id", deletingTierId);

      submit(formData, { method: "post" });
    }
  }, [deletingTierId, submit]);

  const openCreateModal = useCallback(() => {
    setEditingTier(null);
    setTierFormData({
      name: "",
      minSpend: "0",
      cashbackPercent: "0",
      evaluationPeriod: data.hasAnnualEval ? "ANNUAL" : "LIFETIME",
    });
    setTierModalActive(true);
  }, [data.hasAnnualEval]);

  const openEditModal = useCallback((tier: Tier) => {
    setEditingTier(tier);
    setTierFormData({
      name: tier.name,
      minSpend: tier.minSpend.toString(),
      cashbackPercent: tier.cashbackPercent.toString(),
      evaluationPeriod: tier.evaluationPeriod,
    });
    setTierModalActive(true);
  }, []);

  const openDeleteModal = useCallback((tierId: string) => {
    setDeletingTierId(tierId);
    setDeleteConfirmActive(true);
  }, []);

  return (
    <Frame>
      <Page
        title="Loyalty Tiers"
        subtitle="Define membership tiers with spending thresholds and cashback rates"
        backAction={{ url: "/app/members", content: "Members" }}
        primaryAction={{
          content: "Create Tier",
          icon: PlusIcon,
          onAction: openCreateModal,
        }}
      >
        <Layout>
          {/* Subtle limit status hint (shows when 50%+ used) */}
          <Layout.Section>
            <PageLimitStatus
              current={data.limitAccess.current}
              limit={data.limitAccess.max}
              resource="tier"
              action="create"
              nextTierLimit={data.limitAccess.max * 2}
              nextTierName="Pro"
            />
          </Layout.Section>

          {/* Loyalty Tiers Management */}
          <Layout.Section>
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  {data.tiers.length === 0 ? (
                    <TierEmptyStateV1B onCreateTier={openCreateModal} />
                  ) : (
                    <BlockStack gap="300">
                      {data.tiers
                        .sort((a, b) => a.minSpend - b.minSpend)
                        .map((tier) => {
                          const customerCount = data.tierDistribution[tier.id] || 0;

                          return (
                            <Box
                              key={tier.id}
                              background="bg-surface"
                              padding="0"
                              borderRadius="200"
                            >
                              <InlineStack
                                align="space-between"
                                blockAlign="stretch"
                                wrap={false}
                              >
                                {/* Tier Info Section */}
                                <Box padding="400" minWidth="0">
                                  <InlineStack gap="400" align="start" blockAlign="start">
                                    {/* Icon */}
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        width: "40px",
                                        height: "40px",
                                        borderRadius: "8px",
                                        background: getTierStyle(tier.name).backgroundColor,
                                        border: `2px solid ${getTierStyle(tier.name).borderColor}`,
                                      }}
                                    >
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
                                            {customerCount}{" "}
                                            {customerCount === 1 ? "customer" : "customers"}
                                          </Badge>
                                        )}
                                      </InlineStack>

                                      <InlineStack gap="400" wrap={false}>
                                        <InlineStack gap="100">
                                          <Icon source={CashDollarIcon} tone="subdued" />
                                          <Text variant="bodyMd" as="span">
                                            <Text
                                              variant="bodyMd"
                                              fontWeight="semibold"
                                              as="span"
                                            >
                                              {formatAmount(tier.minSpend)}
                                            </Text>
                                            {" min spend"}
                                          </Text>
                                        </InlineStack>

                                        <Box borderInlineStartWidth="025" borderColor="border">
                                          <Box paddingInlineStart="400">
                                            <InlineStack gap="100">
                                              <Icon source={CalendarIcon} tone="subdued" />
                                              <Text variant="bodyMd" tone="subdued" as="span">
                                                {tier.evaluationPeriod === "ANNUAL"
                                                  ? "Annual"
                                                  : "Lifetime"}
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
                                        onClick={() => openEditModal(tier)}
                                      >
                                        Edit
                                      </Button>
                                      <Button
                                        size="slim"
                                        tone="critical"
                                        icon={DeleteIcon}
                                        onClick={() => openDeleteModal(tier.id)}
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
          </Layout.Section>

          {/* Information Banner */}
          <Layout.Section>
            <Banner title="Sell tier memberships as products" tone="info" icon={PackageIcon}>
              <BlockStack gap="200">
                <p>
                  Create Shopify products that customers can purchase to gain access to
                  specific loyalty tiers. These products can be one-time purchases or
                  recurring subscriptions.
                </p>
                <Link to="/app/members/products">
                  <Button>Manage Tier Products</Button>
                </Link>
              </BlockStack>
            </Banner>
          </Layout.Section>
        </Layout>

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
            loading: isSubmitting,
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
                onChange={(value) =>
                  setTierFormData({ ...tierFormData, cashbackPercent: value })
                }
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
                    : [{ label: "Lifetime (cumulative)", value: "LIFETIME" }]
                }
                value={tierFormData.evaluationPeriod}
                onChange={(value) =>
                  setTierFormData({
                    ...tierFormData,
                    evaluationPeriod: value as "ANNUAL" | "LIFETIME",
                  })
                }
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
            loading: isSubmitting,
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

        {/* Toast */}
        {toast.active && (
          <Toast
            content={toast.content}
            error={toast.error}
            onDismiss={hideToast}
          />
        )}
      </Page>
    </Frame>
  );
}
