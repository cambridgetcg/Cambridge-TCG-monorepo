import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData, Link } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  Button,
  TextField,
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
  ResourceList,
  ResourceItem,
  Avatar,
  Filters,
} from "@shopify/polaris";
import {
  PlusIcon,
  DeleteIcon,
  EditIcon,
} from "~/utils/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { TierBadge } from "../components/TierBadge";
import { getTierStyle } from "../utils/tier-styles";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface Tier {
  id: string;
  name: string;
  description: string | null;
  cashbackPercent: number;
  minSpend: number;
  benefits: string[];
  color: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count: {
    tierProducts: number;
    customers: number;
  };
}

interface LoaderData {
  tiers: Tier[];
  shopSettings: {
    storeCurrency: string;
  } | null;
}

// ============================================
// LOADER
// ============================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Fetch all tiers with counts
  const tiers = await db.tier.findMany({
    where: { shop },
    include: {
      _count: {
        select: {
          tierProducts: true,
          customers: true,
        },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  // Fetch shop settings for currency
  const shopSettings = await db.shopSettings.findUnique({
    where: { shop },
    select: { storeCurrency: true },
  });

  return json<LoaderData>({
    tiers: tiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      description: tier.description,
      cashbackPercent: tier.cashbackPercent?.toNumber() ?? 0,
      minSpend: tier.minSpend?.toNumber() ?? 0,
      benefits: (tier.benefits as string[]) || [],
      color: tier.color,
      icon: tier.icon,
      sortOrder: tier.sortOrder,
      isActive: tier.isActive,
      createdAt: tier.createdAt.toISOString(),
      updatedAt: tier.updatedAt.toISOString(),
      _count: tier._count,
    })),
    shopSettings,
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
    const description = formData.get("description") as string;
    const cashbackPercent = parseFloat(formData.get("cashbackPercent") as string) || 0;
    const minSpend = parseFloat(formData.get("minSpend") as string) || 0;
    const benefitsRaw = formData.get("benefits") as string;
    const benefits = benefitsRaw ? benefitsRaw.split("\n").filter((b) => b.trim()) : [];
    const color = formData.get("color") as string || null;

    // Get max sort order
    const maxSortOrder = await db.tier.aggregate({
      where: { shop },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxSortOrder._max.sortOrder || 0) + 1;

    const tier = await db.tier.create({
      data: {
        shop,
        name,
        description: description || null,
        cashbackPercent,
        minSpend,
        benefits,
        color,
        sortOrder,
        isActive: true,
      },
    });

    return json({ success: true, message: "Tier created successfully", tier });
  }

  if (intent === "update") {
    const tierId = formData.get("tierId") as string;
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const cashbackPercent = parseFloat(formData.get("cashbackPercent") as string) || 0;
    const minSpend = parseFloat(formData.get("minSpend") as string) || 0;
    const benefitsRaw = formData.get("benefits") as string;
    const benefits = benefitsRaw ? benefitsRaw.split("\n").filter((b) => b.trim()) : [];
    const color = formData.get("color") as string || null;
    const isActive = formData.get("isActive") === "true";

    const tier = await db.tier.update({
      where: { id: tierId },
      data: {
        name,
        description: description || null,
        cashbackPercent,
        minSpend,
        benefits,
        color,
        isActive,
      },
    });

    return json({ success: true, message: "Tier updated successfully", tier });
  }

  if (intent === "delete") {
    const tierId = formData.get("tierId") as string;

    // Check for linked tier products
    const tierProductCount = await db.tierProduct.count({
      where: { tierId },
    });

    if (tierProductCount > 0) {
      return json({
        success: false,
        error: `Cannot delete tier with ${tierProductCount} linked tier product(s). Please delete the tier products first.`,
      });
    }

    // Check for assigned customers
    const customerCount = await db.customerTierState.count({
      where: { effectiveTierId: tierId },
    });

    if (customerCount > 0) {
      return json({
        success: false,
        error: `Cannot delete tier with ${customerCount} assigned customers. Please reassign customers first.`,
      });
    }

    await db.tier.delete({
      where: { id: tierId },
    });

    return json({ success: true, message: "Tier deleted successfully" });
  }

  return json({ success: false, error: "Unknown action" });
};

// ============================================
// COMPONENT
// ============================================

export default function TiersPage() {
  const { tiers, shopSettings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastError, setToastError] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCashbackPercent, setFormCashbackPercent] = useState("0");
  const [formMinSpend, setFormMinSpend] = useState("0");
  const [formBenefits, setFormBenefits] = useState("");
  const [formColor, setFormColor] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);

  const isSubmitting = navigation.state === "submitting";

  // Handle action response
  useEffect(() => {
    if (actionData) {
      if (actionData.success) {
        setToastMessage(actionData.message || "Success");
        setToastError(false);
        setCreateModalOpen(false);
        setEditModalOpen(false);
        setDeleteModalOpen(false);
        resetForm();
      } else if (actionData.error) {
        setToastMessage(actionData.error);
        setToastError(true);
      }
      setToastActive(true);
    }
  }, [actionData]);

  const resetForm = useCallback(() => {
    setFormName("");
    setFormDescription("");
    setFormCashbackPercent("0");
    setFormMinSpend("0");
    setFormBenefits("");
    setFormColor("");
    setFormIsActive(true);
    setSelectedTier(null);
  }, []);

  const openCreateModal = useCallback(() => {
    resetForm();
    setCreateModalOpen(true);
  }, [resetForm]);

  const openEditModal = useCallback((tier: Tier) => {
    setSelectedTier(tier);
    setFormName(tier.name);
    setFormDescription(tier.description || "");
    setFormCashbackPercent(tier.cashbackPercent.toString());
    setFormMinSpend(tier.minSpend.toString());
    setFormBenefits(tier.benefits.join("\n"));
    setFormColor(tier.color || "");
    setFormIsActive(tier.isActive);
    setEditModalOpen(true);
  }, []);

  const openDeleteModal = useCallback((tier: Tier) => {
    setSelectedTier(tier);
    setDeleteModalOpen(true);
  }, []);

  const handleCreate = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "create");
    formData.append("name", formName);
    formData.append("description", formDescription);
    formData.append("cashbackPercent", formCashbackPercent);
    formData.append("minSpend", formMinSpend);
    formData.append("benefits", formBenefits);
    formData.append("color", formColor);
    submit(formData, { method: "post" });
  }, [formName, formDescription, formCashbackPercent, formMinSpend, formBenefits, formColor, submit]);

  const handleUpdate = useCallback(() => {
    if (!selectedTier) return;
    const formData = new FormData();
    formData.append("intent", "update");
    formData.append("tierId", selectedTier.id);
    formData.append("name", formName);
    formData.append("description", formDescription);
    formData.append("cashbackPercent", formCashbackPercent);
    formData.append("minSpend", formMinSpend);
    formData.append("benefits", formBenefits);
    formData.append("color", formColor);
    formData.append("isActive", formIsActive.toString());
    submit(formData, { method: "post" });
  }, [selectedTier, formName, formDescription, formCashbackPercent, formMinSpend, formBenefits, formColor, formIsActive, submit]);

  const handleDelete = useCallback(() => {
    if (!selectedTier) return;
    const formData = new FormData();
    formData.append("intent", "delete");
    formData.append("tierId", selectedTier.id);
    submit(formData, { method: "post" });
  }, [selectedTier, submit]);

  const currency = shopSettings?.storeCurrency || "USD";

  return (
    <Frame>
      <Page
        title="Membership Tiers"
        subtitle="Manage your loyalty program tier definitions"
        primaryAction={{
          content: "Create Tier",
          icon: PlusIcon,
          onAction: openCreateModal,
        }}
      >
        <Layout>
          <Layout.Section>
            {tiers.length === 0 ? (
              <Card>
                <EmptyState
                  heading="Create your first membership tier"
                  action={{
                    content: "Create Tier",
                    onAction: openCreateModal,
                  }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>
                    Membership tiers allow you to reward your most loyal customers
                    with exclusive benefits and higher cashback rates.
                  </p>
                </EmptyState>
              </Card>
            ) : (
              <Card padding="0">
                <ResourceList
                  resourceName={{ singular: "tier", plural: "tiers" }}
                  items={tiers}
                  renderItem={(tier) => {
                    const style = getTierStyle(tier.name);
                    return (
                      <ResourceItem
                        id={tier.id}
                        onClick={() => openEditModal(tier)}
                        shortcutActions={[
                          {
                            content: "Edit",
                            icon: EditIcon,
                            onAction: () => openEditModal(tier),
                          },
                          {
                            content: "Delete",
                            icon: DeleteIcon,
                            destructive: true,
                            onAction: () => openDeleteModal(tier),
                          },
                        ]}
                      >
                        <InlineStack align="space-between" blockAlign="center">
                          <InlineStack gap="400" blockAlign="center">
                            <div
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: 8,
                                background: style.gradient,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "white",
                                fontWeight: 600,
                                fontSize: 16,
                              }}
                            >
                              {tier.name.charAt(0).toUpperCase()}
                            </div>
                            <BlockStack gap="100">
                              <InlineStack gap="200" blockAlign="center">
                                <Text variant="bodyMd" fontWeight="semibold" as="span">
                                  {tier.name}
                                </Text>
                                {!tier.isActive && (
                                  <Badge tone="subdued">Inactive</Badge>
                                )}
                              </InlineStack>
                              <Text variant="bodySm" tone="subdued" as="span">
                                {tier.cashbackPercent}% cashback • Min spend: {currency} {tier.minSpend.toLocaleString()}
                              </Text>
                            </BlockStack>
                          </InlineStack>
                          <InlineStack gap="300">
                            <BlockStack gap="100" inlineAlign="end">
                              <Text variant="bodySm" tone="subdued" as="span">
                                {tier._count.customers} customers
                              </Text>
                              <Text variant="bodySm" tone="subdued" as="span">
                                {tier._count.tierProducts} products
                              </Text>
                            </BlockStack>
                          </InlineStack>
                        </InlineStack>
                      </ResourceItem>
                    );
                  }}
                />
              </Card>
            )}

            <Box paddingBlockStart="400">
              <InlineStack align="center">
                <Link to="/app/tier-products">
                  <Button>Manage Tier Products →</Button>
                </Link>
              </InlineStack>
            </Box>
          </Layout.Section>
        </Layout>

        {/* Create Modal */}
        <Modal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          title="Create Membership Tier"
          primaryAction={{
            content: "Create",
            onAction: handleCreate,
            loading: isSubmitting,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setCreateModalOpen(false),
            },
          ]}
        >
          <Modal.Section>
            <FormLayout>
              <TextField
                label="Tier Name"
                value={formName}
                onChange={setFormName}
                placeholder="e.g., Gold, Premium, VIP"
                autoComplete="off"
              />
              <TextField
                label="Description"
                value={formDescription}
                onChange={setFormDescription}
                placeholder="Optional description"
                multiline={2}
                autoComplete="off"
              />
              <InlineStack gap="400">
                <TextField
                  label="Cashback %"
                  value={formCashbackPercent}
                  onChange={setFormCashbackPercent}
                  type="number"
                  suffix="%"
                  autoComplete="off"
                />
                <TextField
                  label="Min Spend Required"
                  value={formMinSpend}
                  onChange={setFormMinSpend}
                  type="number"
                  prefix={currency}
                  autoComplete="off"
                />
              </InlineStack>
              <TextField
                label="Benefits (one per line)"
                value={formBenefits}
                onChange={setFormBenefits}
                multiline={4}
                placeholder="Free shipping on all orders&#10;Early access to sales&#10;Exclusive discounts"
                autoComplete="off"
              />
              <TextField
                label="Color (hex)"
                value={formColor}
                onChange={setFormColor}
                placeholder="#FFD700"
                autoComplete="off"
              />
            </FormLayout>
          </Modal.Section>
        </Modal>

        {/* Edit Modal */}
        <Modal
          open={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          title={`Edit ${selectedTier?.name || "Tier"}`}
          primaryAction={{
            content: "Save",
            onAction: handleUpdate,
            loading: isSubmitting,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setEditModalOpen(false),
            },
          ]}
        >
          <Modal.Section>
            <FormLayout>
              <TextField
                label="Tier Name"
                value={formName}
                onChange={setFormName}
                autoComplete="off"
              />
              <TextField
                label="Description"
                value={formDescription}
                onChange={setFormDescription}
                multiline={2}
                autoComplete="off"
              />
              <InlineStack gap="400">
                <TextField
                  label="Cashback %"
                  value={formCashbackPercent}
                  onChange={setFormCashbackPercent}
                  type="number"
                  suffix="%"
                  autoComplete="off"
                />
                <TextField
                  label="Min Spend Required"
                  value={formMinSpend}
                  onChange={setFormMinSpend}
                  type="number"
                  prefix={currency}
                  autoComplete="off"
                />
              </InlineStack>
              <TextField
                label="Benefits (one per line)"
                value={formBenefits}
                onChange={setFormBenefits}
                multiline={4}
                autoComplete="off"
              />
              <TextField
                label="Color (hex)"
                value={formColor}
                onChange={setFormColor}
                placeholder="#FFD700"
                autoComplete="off"
              />
            </FormLayout>
          </Modal.Section>
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          open={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          title="Delete Tier"
          primaryAction={{
            content: "Delete",
            destructive: true,
            onAction: handleDelete,
            loading: isSubmitting,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setDeleteModalOpen(false),
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              <Text as="p">
                Are you sure you want to delete the <strong>{selectedTier?.name}</strong> tier?
              </Text>
              {selectedTier && (selectedTier._count.customers > 0 || selectedTier._count.tierProducts > 0) && (
                <Banner tone="warning">
                  <p>
                    This tier has {selectedTier._count.customers} customers and{" "}
                    {selectedTier._count.tierProducts} tier products. You must reassign
                    customers and delete tier products before deleting this tier.
                  </p>
                </Banner>
              )}
              <Text as="p" tone="subdued">
                This action cannot be undone.
              </Text>
            </BlockStack>
          </Modal.Section>
        </Modal>

        {/* Toast */}
        {toastActive && (
          <Toast
            content={toastMessage}
            error={toastError}
            onDismiss={() => setToastActive(false)}
          />
        )}
      </Page>
    </Frame>
  );
}
