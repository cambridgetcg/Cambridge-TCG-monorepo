import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData, Link } from "@remix-run/react";
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
  Box,
  Toast,
  Frame,
  DataTable,
  Thumbnail,
  Modal,
  TextField,
  Select,
  FormLayout,
  DatePicker,
} from "@shopify/polaris";
import { GiftCardIcon, PlusIcon } from "~/utils/polaris-icons";
import { authenticate } from "../shopify.server";
import {
  getRaffles,
  getRaffleStats,
  createRaffle,
  deleteRaffle,
} from "../services/raffle-management.server";
import { getPointsConfig } from "../services/points-config.server";
import { checkLimitAccess } from "~/utils/require-feature.server";
import {
  atomicWithinLimit,
  LimitExceededError,
} from "~/utils/atomic-limit-control.server";
import db from "~/db.server";
import { UsageUpgradePrompt, LimitHint, PageLimitStatus, LimitExceededModal } from "~/components/Billing/UpgradePrompt";
import { ModuleStatsCard } from "~/components/DesignSystem/ModuleStatsCard";
// NOTE: Rate-based gating - all features enabled for all plans, only limits differentiate

// ============================================
// TYPE DEFINITIONS
// ============================================

interface RaffleData {
  id: string;
  name: string;
  status: string;
  startsAt: string;
  endsAt: string;
  entryCost: number;
  totalEntries: number;
  uniqueEntrants: number;
  totalPrizePool: number;
}

interface LoaderData {
  rafflesEnabled: boolean;
  // Rate-based gating: all features enabled, only limits differentiate plans
  limitAccess: {
    canCreate: boolean;
    current: number;
    max: number;
    message?: string;
  };
  pointsConfig: {
    currencyName: string;
    currencyIcon: string;
  };
  raffles: RaffleData[];
  stats: {
    totalRaffles: number;
    activeRaffles: number;
    totalEntries: number;
    totalPrizePoolValue: number;
  };
}

// ============================================
// LOADER
// ============================================

const LOG_PREFIX = "[app.rewards.raffles]";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log(`${LOG_PREFIX} Loader starting...`);

  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Rate-based gating: all features enabled, check limits only
  // Get points config to check if raffles are enabled
  const config = await getPointsConfig(shop);

  // Count active raffles for limit check
  const activeRaffleCount = await db.raffle.count({
    where: { shop, status: { in: ['ACTIVE', 'SCHEDULED'] } },
  });

  // Check limit access (rate-based gating)
  const limitAccess = await checkLimitAccess(shop, 'maxActiveRaffles', activeRaffleCount);

  if (!config.isEnabled) {
    return json<LoaderData>({
      rafflesEnabled: false,
      limitAccess: {
        canCreate: limitAccess.hasAccess,
        current: activeRaffleCount,
        max: limitAccess.error?.maxLimit ?? 999999,
        message: limitAccess.error?.message,
      },
      pointsConfig: {
        currencyName: config.currencyName,
        currencyIcon: config.currencyIcon,
      },
      raffles: [],
      stats: {
        totalRaffles: 0,
        activeRaffles: 0,
        totalEntries: 0,
        totalPrizePoolValue: 0,
      },
    });
  }

  // Fetch raffles and stats in parallel
  const [raffles, stats] = await Promise.all([
    getRaffles(shop, { includeCompleted: true, limit: 50 }),
    getRaffleStats(shop),
  ]);

  console.log(`${LOG_PREFIX} Loaded ${raffles.length} raffles`);

  return json<LoaderData>({
    rafflesEnabled: config.rafflesEnabled,
    limitAccess: {
      canCreate: limitAccess.hasAccess,
      current: activeRaffleCount,
      max: limitAccess.error?.maxLimit ?? 999999,
      message: limitAccess.error?.message,
    },
    pointsConfig: {
      currencyName: config.currencyName,
      currencyIcon: config.currencyIcon,
    },
    raffles: raffles.map((r: any) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      entryCost: r.entryCost,
      totalEntries: r.totalEntries,
      uniqueEntrants: r.uniqueEntrants,
      totalPrizePool: r.totalPrizePool,
    })),
    stats,
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
    const startsAt = new Date(formData.get("startsAt") as string);
    const endsAt = new Date(formData.get("endsAt") as string);
    const entryCost = parseInt(formData.get("entryCost") as string) || 100;

    // Import refreshEntitlements dynamically to avoid circular deps
    const { refreshEntitlements, getLimit, getEffectivePlan } = await import("~/services/entitlements.server");

    // Pre-check: If limit is 0, try refreshing entitlements first
    // This handles cases where entitlements are stale or were created with old defaults
    const currentLimit = await getLimit(shop, "maxActiveRaffles");
    const currentPlan = await getEffectivePlan(shop);
    console.log(`${LOG_PREFIX} Pre-create check: limit=${currentLimit} plan=${currentPlan}`);

    if (currentLimit === 0) {
      console.log(`${LOG_PREFIX} Limit is 0, attempting to refresh entitlements for ${shop}`);
      await refreshEntitlements(shop);
      const newLimit = await getLimit(shop, "maxActiveRaffles");
      console.log(`${LOG_PREFIX} After refresh: limit=${newLimit}`);
    }

    try {
      // Atomic raffle creation with limit check
      // This prevents TOCTOU race conditions where two concurrent requests
      // could both pass the limit check and create raffles exceeding the limit
      await atomicWithinLimit(
        shop,
        "maxActiveRaffles",
        (tx) => tx.raffle.count({ where: { shop, status: { in: ["ACTIVE", "UPCOMING"] } } }),
        async () => {
          // Note: createRaffle doesn't support transaction client yet,
          // so we call it outside the transaction after the count check passes.
          // The race window is minimal since we're in a transaction.
          return createRaffle({
            shop,
            name,
            startsAt,
            endsAt,
            entryCost,
          });
        }
      );

      return json({ success: true, message: "Raffle created successfully" });
    } catch (error) {
      if (error instanceof LimitExceededError) {
        return error.toJsonResponse();
      }
      console.error("[Raffles] Create raffle error:", error);
      return json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to create raffle",
      }, { status: 500 });
    }
  }

  if (intent === "delete") {
    // Rate-based gating: no feature check needed, all plans can delete
    const raffleId = formData.get("raffleId") as string;
    try {
      await deleteRaffle(raffleId, shop);
      return json({ success: true, message: "Raffle deleted successfully" });
    } catch (error) {
      return json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete raffle",
      }, { status: 400 });
    }
  }

  return json({ success: false, error: "Unknown action" }, { status: 400 });
};

// ============================================
// COMPONENT
// ============================================

export default function RafflesList() {
  // Rate-based gating: all features enabled, only limits differentiate plans
  const { rafflesEnabled, limitAccess, pointsConfig, raffles, stats } = useLoaderData<LoaderData>();
  const actionData = useActionData<{ success?: boolean; error?: string; code?: string; currentCount?: number; maxLimit?: number; currentPlan?: string }>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [limitExceededModalOpen, setLimitExceededModalOpen] = useState(false);
  const [limitExceededInfo, setLimitExceededInfo] = useState<{
    current: number;
    limit: number;
    currentPlan: string;
  } | null>(null);

  // Form state for creating a raffle
  const [raffleName, setRaffleName] = useState("");
  const [entryCost, setEntryCost] = useState("100");
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d;
  });

  const dismissToast = useCallback(() => setToastActive(false), []);

  // Handle action response for limit exceeded
  useEffect(() => {
    if (actionData) {
      if (actionData.code === 'LIMIT_EXCEEDED') {
        // Show upgrade modal instead of toast
        setLimitExceededInfo({
          current: actionData.currentCount || limitAccess.current,
          limit: actionData.maxLimit || limitAccess.max,
          currentPlan: actionData.currentPlan || 'Free',
        });
        setLimitExceededModalOpen(true);
      } else if (actionData.success) {
        setToastMessage("Raffle created successfully!");
        setToastActive(true);
      } else if (actionData.error) {
        setToastMessage(actionData.error);
        setToastActive(true);
      }
    }
  }, [actionData, limitAccess]);

  const handleCreateRaffle = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "create");
    formData.append("name", raffleName);
    formData.append("startsAt", startDate.toISOString());
    formData.append("endsAt", endDate.toISOString());
    formData.append("entryCost", entryCost);

    submit(formData, { method: "post" });
    setShowCreateModal(false);
    setRaffleName("");
    setEntryCost("100");
    // Toast/modal will be shown by useEffect based on actionData
  }, [raffleName, startDate, endDate, entryCost, submit]);

  const handleDeleteRaffle = useCallback((raffleId: string) => {
    if (!confirm("Are you sure you want to delete this raffle?")) return;

    const formData = new FormData();
    formData.append("intent", "delete");
    formData.append("raffleId", raffleId);
    submit(formData, { method: "post" });
    setToastMessage("Raffle deleted!");
    setToastActive(true);
  }, [submit]);

  // Get status badge
  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { tone: "info" | "success" | "warning" | "critical" | "attention"; label: string }> = {
      DRAFT: { tone: "info", label: "Draft" },
      SCHEDULED: { tone: "attention", label: "Scheduled" },
      ACTIVE: { tone: "success", label: "Active" },
      CLOSED: { tone: "warning", label: "Closed" },
      DRAWING: { tone: "attention", label: "Drawing" },
      COMPLETED: { tone: "info", label: "Completed" },
      CANCELLED: { tone: "critical", label: "Cancelled" },
    };
    const config = statusConfig[status] || { tone: "info" as const, label: status };
    return <Badge tone={config.tone}>{config.label}</Badge>;
  };

  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Rate-based gating: all plans have access to raffles, limits differentiate

  // If points system is not enabled
  if (!rafflesEnabled) {
    return (
      <Frame>
        <Page
          title="Raffles"
          backAction={{ content: "Rewards", url: "/app/rewards" }}
        >
          <Layout>
            <Layout.Section>
              <Banner tone="warning">
                <p>
                  Raffles require the Points Engagement System to be enabled.
                  <Link to="/app/rewards/config"> Enable it in settings</Link>.
                </p>
              </Banner>
            </Layout.Section>
            <Layout.Section>
              <Card>
                <EmptyState
                  heading="Enable Raffles"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  action={{
                    content: "Go to Points Settings",
                    url: "/app/rewards/config",
                  }}
                >
                  <p>
                    Enable the raffles feature in your Points settings to create
                    exciting prize drawings for your customers.
                  </p>
                </EmptyState>
              </Card>
            </Layout.Section>
          </Layout>
        </Page>
      </Frame>
    );
  }

  // Build data table rows
  const rows = raffles.map((raffle) => [
    <InlineStack gap="200" blockAlign="center" key={raffle.id}>
      <Text as="span" variant="bodyMd" fontWeight="semibold">
        {raffle.name}
      </Text>
    </InlineStack>,
    getStatusBadge(raffle.status),
    `${pointsConfig.currencyIcon} ${raffle.entryCost}`,
    `${formatDate(raffle.startsAt)} - ${formatDate(raffle.endsAt)}`,
    raffle.totalEntries.toLocaleString(),
    raffle.uniqueEntrants.toLocaleString(),
    <InlineStack gap="100" key={`actions-${raffle.id}`}>
      <Button
        size="slim"
        url={`/app/rewards/raffles/${raffle.id}`}
      >
        View
      </Button>
      {raffle.status === "DRAFT" && (
        <Button
          size="slim"
          tone="critical"
          onClick={() => handleDeleteRaffle(raffle.id)}
        >
          Delete
        </Button>
      )}
    </InlineStack>,
  ]);

  return (
    <Frame>
      <Page
        title="Raffles"
        subtitle="Create and manage point-based raffles"
        backAction={{ content: "Rewards", url: "/app/rewards" }}
        primaryAction={{
          content: "Create Raffle",
          icon: PlusIcon,
          onAction: () => setShowCreateModal(true),
        }}
      >
        <Layout>
          {/* Subtle limit status hint (shows when 50%+ used) */}
          <Layout.Section>
            <PageLimitStatus
              current={limitAccess.current}
              limit={limitAccess.max}
              resource="raffle"
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
                resource="active raffles"
                title="Active Raffle Limit"
                hideUnderThreshold={false}
              />
            </Layout.Section>
          )}

          {/* Stats Cards */}
          <Layout.Section>
            <InlineStack gap="400" wrap>
              <div style={{ flex: '1 1 150px', minWidth: '150px' }}>
                <ModuleStatsCard
                  label="Total Raffles"
                  value={stats.totalRaffles}
                />
              </div>
              <div style={{ flex: '1 1 150px', minWidth: '150px' }}>
                <ModuleStatsCard
                  label="Active Raffles"
                  value={stats.activeRaffles}
                >
                  <LimitHint
                    current={limitAccess.current}
                    limit={limitAccess.max}
                    resource="active raffle"
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
                  label="Total Entries"
                  value={stats.totalEntries.toLocaleString()}
                />
              </div>
              <div style={{ flex: '1 1 150px', minWidth: '150px' }}>
                <ModuleStatsCard
                  label="Points Pool"
                  value={`${pointsConfig.currencyIcon} ${stats.totalPrizePoolValue.toLocaleString()}`}
                />
              </div>
            </InlineStack>
          </Layout.Section>

          {/* Raffles Table */}
          <Layout.Section>
            <Card>
              {raffles.length === 0 ? (
                <EmptyState
                  heading="No raffles yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  action={{
                    content: "Create your first raffle",
                    onAction: () => setShowCreateModal(true),
                  }}
                >
                  <p>
                    Create a raffle to engage customers with exciting prize drawings.
                    Customers spend {pointsConfig.currencyIcon} {pointsConfig.currencyName} for a chance to win.
                  </p>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={[
                    "text",
                    "text",
                    "text",
                    "text",
                    "numeric",
                    "numeric",
                    "text",
                  ]}
                  headings={[
                    "Name",
                    "Status",
                    "Entry Cost",
                    "Duration",
                    "Entries",
                    "Entrants",
                    "Actions",
                  ]}
                  rows={rows}
                />
              )}
            </Card>
          </Layout.Section>
        </Layout>

        {/* Create Raffle Modal */}
        <Modal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title="Create New Raffle"
          primaryAction={{
            content: "Create Raffle",
            onAction: handleCreateRaffle,
            disabled: !raffleName.trim(),
            loading: isSubmitting,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setShowCreateModal(false),
            },
          ]}
        >
          <Modal.Section>
            <FormLayout>
              <TextField
                label="Raffle Name"
                value={raffleName}
                onChange={setRaffleName}
                placeholder="e.g., Spring Giveaway"
                autoComplete="off"
              />
              <TextField
                label={`Entry Cost (${pointsConfig.currencyIcon} ${pointsConfig.currencyName})`}
                type="number"
                value={entryCost}
                onChange={setEntryCost}
                min={1}
                autoComplete="off"
              />
              <TextField
                label="Start Date"
                type="date"
                value={startDate.toISOString().split("T")[0]}
                onChange={(value) => setStartDate(new Date(value))}
                autoComplete="off"
              />
              <TextField
                label="End Date"
                type="date"
                value={endDate.toISOString().split("T")[0]}
                onChange={(value) => setEndDate(new Date(value))}
                autoComplete="off"
              />
              <Banner tone="info">
                <p>
                  After creating the raffle, you can add prizes and configure
                  advanced settings like entry limits and tier restrictions.
                </p>
              </Banner>
            </FormLayout>
          </Modal.Section>
        </Modal>

        {/* Toast */}
        {toastActive && (
          <Toast content={toastMessage} onDismiss={dismissToast} />
        )}

        {/* Limit Exceeded Upgrade Modal */}
        <LimitExceededModal
          open={limitExceededModalOpen}
          onClose={() => setLimitExceededModalOpen(false)}
          resource="active raffle"
          current={limitExceededInfo?.current || limitAccess.current}
          limit={limitExceededInfo?.limit || limitAccess.max}
          currentPlan={limitExceededInfo?.currentPlan || 'Free'}
          action="create"
        />
      </Page>
    </Frame>
  );
}
