import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
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
  Divider,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getPointsConfig, getEnabledFeatures, updatePointsConfig } from "../services/points-config.server";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface LoaderData {
  mysteryBoxesEnabled: boolean;
  pointsConfig: {
    currencyName: string;
    currencyIcon: string;
    currencyPlural: string;
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

// ============================================
// LOADER
// ============================================

const LOG_PREFIX = "[app.points_.mystery-boxes]";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log(`${LOG_PREFIX} Loader starting...`);

  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    console.log(`${LOG_PREFIX} Authenticated for shop: ${shop}`);

    // Fetch config and features
    const [config, features] = await Promise.all([
      getPointsConfig(shop),
      getEnabledFeatures(shop),
    ]);

    // TODO: Fetch actual mystery boxes when service layer is implemented
    // For now, return empty state
    const boxes: LoaderData["boxes"] = [];
    const stats: LoaderData["stats"] = {
      totalBoxes: 0,
      activeBoxes: 0,
      totalOpens: 0,
      totalPointsSpent: 0,
    };

    return json<LoaderData>({
      mysteryBoxesEnabled: features.mysteryBoxes,
      pointsConfig: {
        currencyName: config.currencyName,
        currencyIcon: config.currencyIcon,
        currencyPlural: config.currencyNamePlural,
      },
      boxes,
      stats,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} LOADER ERROR:`, error);
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
      await updatePointsConfig(shop, { mysteryBoxesEnabled: true });
      return json({ success: true, message: "Mystery Boxes enabled" });
    }

    if (intent === "disableFeature") {
      await updatePointsConfig(shop, { mysteryBoxesEnabled: false });
      return json({ success: true, message: "Mystery Boxes disabled" });
    }

    // TODO: Add create, update, delete actions when service layer is implemented

    return json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error(`${LOG_PREFIX} ACTION ERROR:`, error);
    return json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
};

// ============================================
// COMPONENT
// ============================================

export default function MysteryBoxes() {
  const { mysteryBoxesEnabled, pointsConfig, boxes, stats } = useLoaderData<LoaderData>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const handleEnableFeature = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "enableFeature");
    submit(formData, { method: "post" });
    setToastMessage("Mystery Boxes enabled");
    setToastActive(true);
  }, [submit]);

  const handleDisableFeature = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "disableFeature");
    submit(formData, { method: "post" });
    setToastMessage("Mystery Boxes disabled");
    setToastActive(true);
  }, [submit]);

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

  // If feature not enabled, show setup prompt
  if (!mysteryBoxesEnabled) {
    return (
      <Frame>
        <Page
          title="Mystery Boxes"
          backAction={{ content: "Points", url: "/app/points" }}
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
      </Frame>
    );
  }

  // Feature enabled but no boxes yet
  if (boxes.length === 0) {
    return (
      <Frame>
        <Page
          title="Mystery Boxes"
          backAction={{ content: "Points", url: "/app/points" }}
          primaryAction={{
            content: "Create Mystery Box",
            url: "/app/points/mystery-boxes/new",
            disabled: true, // TODO: Enable when create page is implemented
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
                    url: "/app/points/mystery-boxes/new",
                    disabled: true, // TODO: Enable when create page is implemented
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

          {toastActive && (
            <Toast content={toastMessage} onDismiss={dismissToast} />
          )}
        </Page>
      </Frame>
    );
  }

  // Boxes exist - show list view
  const rows = boxes.map((box) => [
    box.name,
    getStatusBadge(box.status),
    `${pointsConfig.currencyIcon} ${formatNumber(box.openCost)}`,
    `${formatNumber(box.totalOpens)}${box.maxOpensTotal ? ` / ${formatNumber(box.maxOpensTotal)}` : ""}`,
    formatNumber(box.uniqueOpeners),
    new Date(box.endsAt).toLocaleDateString(),
    <Button key={box.id} variant="plain" url={`/app/points/mystery-boxes/${box.id}`}>
      Edit
    </Button>,
  ]);

  return (
    <Frame>
      <Page
        title="Mystery Boxes"
        backAction={{ content: "Points", url: "/app/points" }}
        primaryAction={{
          content: "Create Mystery Box",
          url: "/app/points/mystery-boxes/new",
          disabled: true, // TODO: Enable when create page is implemented
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
          {/* Stats Cards */}
          <Layout.Section>
            <InlineStack gap="400" wrap>
              <Card>
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" as="p">Total Boxes</Text>
                  <Text variant="headingLg" as="p">{stats.totalBoxes}</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" as="p">Active</Text>
                  <Text variant="headingLg" as="p">{stats.activeBoxes}</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" as="p">Total Opens</Text>
                  <Text variant="headingLg" as="p">{formatNumber(stats.totalOpens)}</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" as="p">{pointsConfig.currencyPlural} Spent</Text>
                  <Text variant="headingLg" as="p">
                    {pointsConfig.currencyIcon} {formatNumber(stats.totalPointsSpent)}
                  </Text>
                </BlockStack>
              </Card>
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

        {toastActive && (
          <Toast content={toastMessage} onDismiss={dismissToast} />
        )}
      </Page>
    </Frame>
  );
}
