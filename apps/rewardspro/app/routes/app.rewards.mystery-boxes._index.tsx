import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  Button,
  Banner,
  InlineStack,
  BlockStack,
  Text,
  Badge,
  EmptyState,
  Toast,
  DataTable,
  Divider,
  Modal,
  FormLayout,
  TextField,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getPointsConfig, getEnabledFeatures, updatePointsConfig } from "../services/points-config.server";
import {
  getMysteryBoxes,
  getMysteryBoxStats,
  createMysteryBox,
  deleteMysteryBox,
  transitionStatus,
  type MysteryBoxStatus,
} from "../services/mystery-box-management.server";
import { checkLimitAccess } from "~/utils/require-feature.server";
import {
  atomicWithinLimit,
  LimitExceededError,
} from "~/utils/atomic-limit-control.server";
import prisma from "~/db.server";
import { UsageUpgradePrompt, LimitHint, PageLimitStatus, LimitExceededModal } from "~/components/Billing/UpgradePrompt";
import { ModuleStatsCard } from "~/components/DesignSystem/ModuleStatsCard";
import { PointsIcon, DEFAULT_ICON_CONFIG } from "~/components/PointsIcon";
import type { CurrencyIconType } from "~/services/points-config.server";
// NOTE: Rate-based gating - all features enabled for all plans, only limits differentiate

// ============================================
// TYPE DEFINITIONS
// ============================================

interface LoaderData {
  mysteryBoxesEnabled: boolean;
  // Rate-based gating: all features enabled, only limits differentiate plans
  limitAccess: {
    canCreate: boolean;
    current: number;
    max: number;
    message?: string;
  };
  pointsConfig: {
    currencyName: string;
    currencyPlural: string;
    iconType: CurrencyIconType;
    iconId: string;
    iconColor: string;
  };
  boxes: Array<{
    id: string;
    name: string;
    status: string;
    openCost: number;
    totalOpens: number;
    maxOpensTotal: number | null;
    uniqueOpeners: number;
    startsAt: string;
    endsAt: string;
    rewardCount: number;
  }>;
  stats: {
    totalBoxes: number;
    activeBoxes: number;
    totalOpens: number;
    totalPointsSpent: number;
  };
}

interface ActionData {
  success: boolean;
  message?: string;
  error?: string;
  boxId?: string;
  // Limit exceeded info for upgrade modal
  code?: string;
  limit?: string;
  currentCount?: number;
  maxLimit?: number;
  currentPlan?: string;
}

// ============================================
// LOADER
// ============================================

const LOG_PREFIX = "[app.rewards.mystery-boxes]";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log(`${LOG_PREFIX} Loader starting...`);

  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    console.log(`${LOG_PREFIX} Authenticated for shop: ${shop}`);

    // Rate-based gating: all features enabled, check limits only
    // Count active mystery boxes for limit check
    const activeBoxCount = await prisma.mysteryBox.count({
      where: { shop, status: 'ACTIVE' },
    });

    // Check limit access (rate-based gating)
    const limitAccess = await checkLimitAccess(shop, 'maxActiveMysteryBoxes', activeBoxCount);

    // Fetch config and features
    const [config, features] = await Promise.all([
      getPointsConfig(shop),
      getEnabledFeatures(shop),
    ]);

    // Fetch actual mystery boxes and stats
    const [boxes, stats] = await Promise.all([
      getMysteryBoxes(shop, { includeRewards: true }),
      getMysteryBoxStats(shop),
    ]);

    return json<LoaderData>({
      mysteryBoxesEnabled: features.mysteryBoxes,
      // Rate-based gating: only limits, no feature access check
      limitAccess: {
        canCreate: limitAccess.hasAccess,
        current: activeBoxCount,
        max: limitAccess.error?.maxLimit ?? 999999,
        message: limitAccess.error?.message,
      },
      pointsConfig: {
        currencyName: config.currencyName,
        currencyPlural: config.currencyNamePlural,
        // Use default vector icon config (emoji system deprecated)
        iconType: DEFAULT_ICON_CONFIG.iconType,
        iconId: DEFAULT_ICON_CONFIG.iconId,
        iconColor: DEFAULT_ICON_CONFIG.iconColor,
      },
      boxes: boxes.map((box: any) => ({
        id: box.id,
        name: box.name,
        status: box.status,
        openCost: box.openCost,
        totalOpens: box.totalOpens,
        maxOpensTotal: box.maxOpensTotal,
        uniqueOpeners: box.uniqueOpeners,
        startsAt: box.startsAt.toISOString(),
        endsAt: box.endsAt.toISOString(),
        rewardCount: box.rewards?.length || 0,
      })),
      stats,
    });
  } catch (error) {
    // Auth redirects (302 to /auth/login) are expected behavior, not errors
    if (error instanceof Response) {
      const status = error.status;
      const location = error.headers.get("Location");

      if (status >= 300 && status < 400) {
        console.log(`${LOG_PREFIX} Auth redirect: status=${status}, location=${location}`);
        throw error;
      }

      console.error(`${LOG_PREFIX} LOADER ERROR (Response): status=${status}`);
    } else {
      console.error(`${LOG_PREFIX} LOADER ERROR:`, error);
    }
    throw error;
  }
};

// ============================================
// ACTION
// ============================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  console.log(`${LOG_PREFIX} Action: ${intent}`);

  try {
    if (intent === "enableFeature") {
      // Rate-based gating: all plans can enable
      await updatePointsConfig(shop, { mysteryBoxesEnabled: true });
      return json<ActionData>({ success: true, message: "Mystery Boxes enabled" });
    }

    if (intent === "disableFeature") {
      await updatePointsConfig(shop, { mysteryBoxesEnabled: false });
      return json<ActionData>({ success: true, message: "Mystery Boxes disabled" });
    }

    if (intent === "create") {
      const name = formData.get("name") as string;
      const openCost = parseInt(formData.get("openCost") as string) || 100;
      const maxOpensPerCustomer = parseInt(formData.get("maxOpensPerCustomer") as string) || 5;
      const maxOpensTotal = formData.get("maxOpensTotal") as string;
      const startsAt = new Date(formData.get("startsAt") as string);
      const endsAt = new Date(formData.get("endsAt") as string);

      if (!name) {
        return json<ActionData>({ success: false, error: "Name is required" }, { status: 400 });
      }

      // Import refreshEntitlements dynamically to avoid circular deps
      const { refreshEntitlements, getLimit, getEffectivePlan } = await import("~/services/entitlements.server");

      // Pre-check: If limit is 0, try refreshing entitlements first
      // This handles cases where entitlements are stale or were created with old defaults
      const currentLimit = await getLimit(shop, "maxActiveMysteryBoxes");
      const currentPlan = await getEffectivePlan(shop);
      console.log(`${LOG_PREFIX} Pre-create check: limit=${currentLimit} plan=${currentPlan}`);

      if (currentLimit === 0) {
        console.log(`${LOG_PREFIX} Limit is 0, attempting to refresh entitlements for ${shop}`);
        await refreshEntitlements(shop);
        const newLimit = await getLimit(shop, "maxActiveMysteryBoxes");
        console.log(`${LOG_PREFIX} After refresh: limit=${newLimit}`);
      }

      try {
        // Atomic mystery box creation with limit check
        // This prevents TOCTOU race conditions where two concurrent requests
        // could both pass the limit check and create boxes exceeding the limit
        const box = await atomicWithinLimit(
          shop,
          "maxActiveMysteryBoxes",
          (tx) => tx.mysteryBox.count({ where: { shop, status: 'ACTIVE' } }),
          async () => {
            return createMysteryBox({
              shop,
              name,
              openCost,
              maxOpensPerCustomer,
              maxOpensTotal: maxOpensTotal ? parseInt(maxOpensTotal) : null,
              startsAt,
              endsAt,
            });
          }
        );

        return json<ActionData>({
          success: true,
          message: "Mystery box created",
          boxId: box.id,
        });
      } catch (error) {
        if (error instanceof LimitExceededError) {
          return error.toJsonResponse();
        }
        throw error;
      }
    }

    if (intent === "delete") {
      // Rate-based gating: no feature check needed
      const boxId = formData.get("boxId") as string;
      await deleteMysteryBox(boxId, shop);
      return json<ActionData>({ success: true, message: "Mystery box deleted" });
    }

    if (intent === "updateStatus") {
      // Rate-based gating: no feature check needed
      const boxId = formData.get("boxId") as string;
      const newStatus = formData.get("status") as MysteryBoxStatus;
      await transitionStatus(boxId, shop, newStatus);
      return json<ActionData>({ success: true, message: `Status updated to ${newStatus}` });
    }

    return json<ActionData>({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error(`${LOG_PREFIX} ACTION ERROR:`, error);
    return json<ActionData>(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
};

// ============================================
// COMPONENT
// ============================================

export default function MysteryBoxes() {
  // Rate-based gating: all features enabled, only limits differentiate plans
  const { mysteryBoxesEnabled, limitAccess, pointsConfig, boxes, stats } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastError, setToastError] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [limitExceededModalOpen, setLimitExceededModalOpen] = useState(false);

  // Form state for create modal
  const [formName, setFormName] = useState("");
  const [formOpenCost, setFormOpenCost] = useState("100");
  const [formMaxOpensPerCustomer, setFormMaxOpensPerCustomer] = useState("5");
  const [formMaxOpensTotal, setFormMaxOpensTotal] = useState("");
  const [formStartsAt, setFormStartsAt] = useState("");
  const [formEndsAt, setFormEndsAt] = useState("");

  // Show toast on action completion, or limit exceeded modal
  useEffect(() => {
    if (actionData) {
      if (actionData.success) {
        setToastMessage(actionData.message || "Success");
        setToastError(false);
        setToastActive(true);
        if (actionData.boxId) {
          setCreateModalOpen(false);
          // Reset form
          setFormName("");
          setFormOpenCost("100");
          setFormMaxOpensPerCustomer("5");
          setFormMaxOpensTotal("");
          setFormStartsAt("");
          setFormEndsAt("");
        }
      } else if (actionData.code === 'LIMIT_EXCEEDED') {
        // Show upgrade modal instead of toast for limit exceeded
        setCreateModalOpen(false);
        setLimitExceededModalOpen(true);
      } else if (actionData.error) {
        setToastMessage(actionData.error);
        setToastError(true);
        setToastActive(true);
      }
    }
  }, [actionData]);

  const handleEnableFeature = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "enableFeature");
    submit(formData, { method: "post" });
  }, [submit]);

  const handleDisableFeature = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "disableFeature");
    submit(formData, { method: "post" });
  }, [submit]);

  const handleCreateSubmit = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "create");
    formData.append("name", formName);
    formData.append("openCost", formOpenCost);
    formData.append("maxOpensPerCustomer", formMaxOpensPerCustomer);
    formData.append("maxOpensTotal", formMaxOpensTotal);
    formData.append("startsAt", formStartsAt || new Date().toISOString());
    formData.append("endsAt", formEndsAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());
    submit(formData, { method: "post" });
  }, [submit, formName, formOpenCost, formMaxOpensPerCustomer, formMaxOpensTotal, formStartsAt, formEndsAt]);

  const dismissToast = useCallback(() => setToastActive(false), []);

  // Status badge helper
  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { tone: any; label: string }> = {
      DRAFT: { tone: "info", label: "Draft" },
      SCHEDULED: { tone: "attention", label: "Scheduled" },
      ACTIVE: { tone: "success", label: "Active" },
      CLOSED: { tone: "warning", label: "Closed" },
      COMPLETED: { tone: "info", label: "Completed" },
      CANCELLED: { tone: "critical", label: "Cancelled" },
    };
    const config = statusConfig[status] || { tone: "info", label: status };
    return <Badge tone={config.tone}>{config.label}</Badge>;
  };

  // Format number helper
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  // Set default dates for form
  const openCreateModal = useCallback(() => {
    const now = new Date();
    const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    setFormStartsAt(now.toISOString().slice(0, 16));
    setFormEndsAt(thirtyDaysLater.toISOString().slice(0, 16));
    setCreateModalOpen(true);
  }, []);

  // Rate-based gating: all plans have access to mystery boxes, limits differentiate

  // If feature not enabled, show setup prompt
  if (!mysteryBoxesEnabled) {
    return (
      <>
        <Page
          title="Mystery Boxes"
          backAction={{ content: "Rewards", url: "/app/rewards" }}
        >
          <Layout>
            <Layout.Section>
              <Card>
                <EmptyState
                  heading="Enable Mystery Boxes"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  action={{
                    content: "Enable Mystery Boxes",
                    onAction: handleEnableFeature,
                    loading: isSubmitting,
                  }}
                  secondaryAction={{
                    content: "Learn More",
                    url: "https://docs.rewardspro.io/features/mystery-boxes",
                    external: true,
                  }}
                >
                  <BlockStack gap="200">
                    <p>
                      Create exciting mystery boxes that customers can open using their points.
                      Each box contains randomized rewards with configurable probabilities.
                    </p>
                    <Text variant="bodySm" tone="subdued" as="p">
                      Rewards can include bonus points, discount codes, store credit, free products, or custom prizes.
                    </Text>
                  </BlockStack>
                </EmptyState>
              </Card>
            </Layout.Section>
          </Layout>
        </Page>
        {toastActive && (
          <Toast content={toastMessage} error={toastError} onDismiss={dismissToast} />
        )}

        {/* Limit Exceeded Upgrade Modal */}
        <LimitExceededModal
          open={limitExceededModalOpen}
          onClose={() => setLimitExceededModalOpen(false)}
          resource="active mystery box"
          current={actionData?.currentCount || limitAccess.current}
          limit={actionData?.maxLimit || limitAccess.max}
          currentPlan={actionData?.currentPlan || 'Free'}
          action="create"
        />
      </>
    );
  }

  // Feature enabled but no boxes yet
  if (boxes.length === 0) {
    return (
      <>
        <Page
          title="Mystery Boxes"
          backAction={{ content: "Rewards", url: "/app/rewards" }}
          primaryAction={{
            content: "Create Mystery Box",
            onAction: openCreateModal,
          }}
          secondaryActions={[
            {
              content: "Disable Feature",
              onAction: handleDisableFeature,
              destructive: true,
            },
          ]}
        >
          <Layout>
            <Layout.Section>
              <Banner
                title="Mystery Boxes feature is enabled"
                tone="success"
              >
                <p>
                  Create your first mystery box to let customers spend {pointsConfig.currencyPlural.toLowerCase()} for a chance to win exciting rewards.
                </p>
              </Banner>
            </Layout.Section>

            <Layout.Section>
              <Card>
                <EmptyState
                  heading="Create your first Mystery Box"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  action={{
                    content: "Create Mystery Box",
                    onAction: openCreateModal,
                  }}
                >
                  <BlockStack gap="200">
                    <p>
                      Mystery boxes are a fun way to gamify your rewards program.
                      Customers spend points to open boxes and receive randomized rewards.
                    </p>
                    <Text variant="bodySm" tone="subdued" as="p">
                      Configure reward tiers (Common, Uncommon, Rare, Epic, Legendary) with different probabilities.
                    </Text>
                  </BlockStack>
                </EmptyState>
              </Card>
            </Layout.Section>

            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h3">How Mystery Boxes Work</Text>
                  <Divider />
                  <BlockStack gap="300">
                    <InlineStack gap="400" align="start">
                      <Text variant="headingLg" as="span">1.</Text>
                      <BlockStack gap="100">
                        <Text variant="bodyMd" fontWeight="semibold" as="p">Create a Box</Text>
                        <Text variant="bodySm" tone="subdued" as="p">
                          Set the name, cost in {pointsConfig.currencyPlural.toLowerCase()}, and availability window.
                        </Text>
                      </BlockStack>
                    </InlineStack>
                    <InlineStack gap="400" align="start">
                      <Text variant="headingLg" as="span">2.</Text>
                      <BlockStack gap="100">
                        <Text variant="bodyMd" fontWeight="semibold" as="p">Add Rewards</Text>
                        <Text variant="bodySm" tone="subdued" as="p">
                          Configure rewards with different rarities and probabilities (must sum to 100%).
                        </Text>
                      </BlockStack>
                    </InlineStack>
                    <InlineStack gap="400" align="start">
                      <Text variant="headingLg" as="span">3.</Text>
                      <BlockStack gap="100">
                        <Text variant="bodyMd" fontWeight="semibold" as="p">Activate</Text>
                        <Text variant="bodySm" tone="subdued" as="p">
                          Publish the box and customers can open it instantly for a random reward.
                        </Text>
                      </BlockStack>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        </Page>

        {/* Create Modal - shared by all views */}
        <Modal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          title="Create Mystery Box"
          primaryAction={{
            content: "Create",
            onAction: handleCreateSubmit,
            loading: isSubmitting,
            disabled: !formName,
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
                label="Box Name"
                value={formName}
                onChange={setFormName}
                autoComplete="off"
                placeholder="Golden Mystery Box"
              />
              <TextField
                label={`Cost (${pointsConfig.currencyPlural})`}
                type="number"
                value={formOpenCost}
                onChange={setFormOpenCost}
                autoComplete="off"
                helpText={`How many ${pointsConfig.currencyPlural.toLowerCase()} to open this box`}
              />
              <TextField
                label="Max Opens Per Customer"
                type="number"
                value={formMaxOpensPerCustomer}
                onChange={setFormMaxOpensPerCustomer}
                autoComplete="off"
              />
              <TextField
                label="Max Total Opens (optional)"
                type="number"
                value={formMaxOpensTotal}
                onChange={setFormMaxOpensTotal}
                autoComplete="off"
                placeholder="Unlimited"
                helpText="Leave empty for unlimited"
              />
              <TextField
                label="Start Date"
                type="datetime-local"
                value={formStartsAt}
                onChange={setFormStartsAt}
                autoComplete="off"
              />
              <TextField
                label="End Date"
                type="datetime-local"
                value={formEndsAt}
                onChange={setFormEndsAt}
                autoComplete="off"
              />
            </FormLayout>
          </Modal.Section>
        </Modal>

        {toastActive && (
          <Toast content={toastMessage} error={toastError} onDismiss={dismissToast} />
        )}

        {/* Limit Exceeded Upgrade Modal */}
        <LimitExceededModal
          open={limitExceededModalOpen}
          onClose={() => setLimitExceededModalOpen(false)}
          resource="active mystery box"
          current={actionData?.currentCount || limitAccess.current}
          limit={actionData?.maxLimit || limitAccess.max}
          currentPlan={actionData?.currentPlan || 'Free'}
          action="create"
        />
      </>
    );
  }

  // Boxes exist - show list view
  const rows = boxes.map((box) => [
    box.name,
    getStatusBadge(box.status),
    <InlineStack key={`cost-${box.id}`} gap="100" blockAlign="center">
      <PointsIcon iconType={pointsConfig.iconType} iconId={pointsConfig.iconId} iconColor={pointsConfig.iconColor} size={14} />
      <span>{formatNumber(box.openCost)}</span>
    </InlineStack>,
    `${formatNumber(box.totalOpens)}${box.maxOpensTotal ? ` / ${formatNumber(box.maxOpensTotal)}` : ""}`,
    formatNumber(box.uniqueOpeners),
    new Date(box.endsAt).toLocaleDateString(),
    <Button key={box.id} variant="plain" url={`/app/rewards/mystery-boxes/${box.id}`}>
      Edit
    </Button>,
  ]);

  return (
    <>
      <Page
        title="Mystery Boxes"
        backAction={{ content: "Rewards", url: "/app/rewards" }}
        primaryAction={{
          content: "Create Mystery Box",
          onAction: openCreateModal,
        }}
        secondaryActions={[
          {
            content: "Disable Feature",
            onAction: handleDisableFeature,
            destructive: true,
          },
        ]}
      >
        <Layout>
          {/* Subtle limit status hint (shows when 50%+ used) */}
          <Layout.Section>
            <PageLimitStatus
              current={limitAccess.current}
              limit={limitAccess.max}
              resource="mystery box"
              action="create"
              nextTierLimit={limitAccess.max * 3}
              nextTierName="Pro"
            />
          </Layout.Section>

          {/* Usage Warning - shows when at limit */}
          {!limitAccess.canCreate && (
            <Layout.Section>
              <UsageUpgradePrompt
                current={limitAccess.current}
                limit={limitAccess.max}
                resource="active mystery boxes"
                title="Active Mystery Box Limit"
                hideUnderThreshold={false}
              />
            </Layout.Section>
          )}

          {/* Stats Cards */}
          <Layout.Section>
            <InlineStack gap="400" wrap>
              <div style={{ flex: '1 1 150px', minWidth: '150px' }}>
                <ModuleStatsCard
                  label="Total Boxes"
                  value={stats.totalBoxes}
                />
              </div>
              <div style={{ flex: '1 1 150px', minWidth: '150px' }}>
                <ModuleStatsCard
                  label="Active"
                  value={stats.activeBoxes}
                >
                  <LimitHint
                    current={limitAccess.current}
                    limit={limitAccess.max}
                    resource="active box"
                    variant="inline"
                    showThreshold={50}
                    compact
                    nextTierLimit={limitAccess.max * 3}
                    nextTierName="Pro"
                  />
                </ModuleStatsCard>
              </div>
              <div style={{ flex: '1 1 150px', minWidth: '150px' }}>
                <ModuleStatsCard
                  label="Total Opens"
                  value={formatNumber(stats.totalOpens)}
                />
              </div>
              <div style={{ flex: '1 1 150px', minWidth: '150px' }}>
                <ModuleStatsCard
                  label={`${pointsConfig.currencyPlural} Spent`}
                  value={formatNumber(stats.totalPointsSpent)}
                />
              </div>
            </InlineStack>
          </Layout.Section>

          {/* Boxes Table */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">All Mystery Boxes</Text>
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text", "text", "text"]}
                  headings={["Name", "Status", "Cost", "Opens", "Customers", "Ends", "Action"]}
                  rows={rows}
                />
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Create Modal */}
        <Modal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          title="Create Mystery Box"
          primaryAction={{
            content: "Create",
            onAction: handleCreateSubmit,
            loading: isSubmitting,
            disabled: !formName,
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
                label="Box Name"
                value={formName}
                onChange={setFormName}
                autoComplete="off"
                placeholder="Golden Mystery Box"
              />
              <TextField
                label={`Cost (${pointsConfig.currencyPlural})`}
                type="number"
                value={formOpenCost}
                onChange={setFormOpenCost}
                autoComplete="off"
                helpText={`How many ${pointsConfig.currencyPlural.toLowerCase()} to open this box`}
              />
              <TextField
                label="Max Opens Per Customer"
                type="number"
                value={formMaxOpensPerCustomer}
                onChange={setFormMaxOpensPerCustomer}
                autoComplete="off"
              />
              <TextField
                label="Max Total Opens (optional)"
                type="number"
                value={formMaxOpensTotal}
                onChange={setFormMaxOpensTotal}
                autoComplete="off"
                placeholder="Unlimited"
                helpText="Leave empty for unlimited"
              />
              <TextField
                label="Start Date"
                type="datetime-local"
                value={formStartsAt}
                onChange={setFormStartsAt}
                autoComplete="off"
              />
              <TextField
                label="End Date"
                type="datetime-local"
                value={formEndsAt}
                onChange={setFormEndsAt}
                autoComplete="off"
              />
            </FormLayout>
          </Modal.Section>
        </Modal>

        {toastActive && (
          <Toast content={toastMessage} error={toastError} onDismiss={dismissToast} />
        )}

        {/* Limit Exceeded Upgrade Modal */}
        <LimitExceededModal
          open={limitExceededModalOpen}
          onClose={() => setLimitExceededModalOpen(false)}
          resource="active mystery box"
          current={actionData?.currentCount || limitAccess.current}
          limit={actionData?.maxLimit || limitAccess.max}
          currentPlan={actionData?.currentPlan || 'Free'}
          action="create"
        />
      </Page>
    </>
  );
}
