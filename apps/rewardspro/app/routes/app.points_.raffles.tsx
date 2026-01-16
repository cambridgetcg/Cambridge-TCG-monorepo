import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, Link } from "@remix-run/react";
import { useState, useCallback } from "react";
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

const LOG_PREFIX = "[app.points_.raffles]";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log(`${LOG_PREFIX} Loader starting...`);

  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Get points config to check if raffles are enabled
  const config = await getPointsConfig(shop);

  if (!config.isEnabled) {
    return json<LoaderData>({
      rafflesEnabled: false,
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

    await createRaffle({
      shop,
      name,
      startsAt,
      endsAt,
      entryCost,
    });

    return json({ success: true, message: "Raffle created successfully" });
  }

  if (intent === "delete") {
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
  const { rafflesEnabled, pointsConfig, raffles, stats } = useLoaderData<LoaderData>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

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
    setToastMessage("Raffle created successfully!");
    setToastActive(true);
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

  // If points system is not enabled
  if (!rafflesEnabled) {
    return (
      <Frame>
        <Page
          title="Raffles"
          backAction={{ content: "Points", url: "/app/points" }}
        >
          <Layout>
            <Layout.Section>
              <Banner tone="warning">
                <p>
                  Raffles require the Points Engagement System to be enabled.
                  <Link to="/app/points/config"> Enable it in settings</Link>.
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
                    url: "/app/points/config",
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
        url={`/app/points/raffles/${raffle.id}`}
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
        backAction={{ content: "Points", url: "/app/points" }}
        primaryAction={{
          content: "Create Raffle",
          icon: PlusIcon,
          onAction: () => setShowCreateModal(true),
        }}
      >
        <Layout>
          {/* Stats Cards */}
          <Layout.Section>
            <InlineStack gap="400" wrap={false}>
              <Box
                background="bg-surface"
                padding="400"
                borderRadius="200"
                borderWidth="025"
                borderColor="border"
                minWidth="150px"
              >
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Total Raffles
                  </Text>
                  <Text as="p" variant="headingLg" fontWeight="bold">
                    {stats.totalRaffles}
                  </Text>
                </BlockStack>
              </Box>
              <Box
                background="bg-surface"
                padding="400"
                borderRadius="200"
                borderWidth="025"
                borderColor="border"
                minWidth="150px"
              >
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Active Raffles
                  </Text>
                  <Text as="p" variant="headingLg" fontWeight="bold">
                    {stats.activeRaffles}
                  </Text>
                </BlockStack>
              </Box>
              <Box
                background="bg-surface"
                padding="400"
                borderRadius="200"
                borderWidth="025"
                borderColor="border"
                minWidth="150px"
              >
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Total Entries
                  </Text>
                  <Text as="p" variant="headingLg" fontWeight="bold">
                    {stats.totalEntries.toLocaleString()}
                  </Text>
                </BlockStack>
              </Box>
              <Box
                background="bg-surface"
                padding="400"
                borderRadius="200"
                borderWidth="025"
                borderColor="border"
                minWidth="150px"
              >
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Points Pool
                  </Text>
                  <Text as="p" variant="headingLg" fontWeight="bold">
                    {pointsConfig.currencyIcon} {stats.totalPrizePoolValue.toLocaleString()}
                  </Text>
                </BlockStack>
              </Box>
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
      </Page>
    </Frame>
  );
}
