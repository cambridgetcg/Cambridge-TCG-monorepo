import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
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
  Toast,
  Frame,
  DataTable,
  Divider,
  Modal,
  FormLayout,
  TextField,
  Select,
  ChoiceList,
  Checkbox,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getPointsConfig } from "../services/points-config.server";
import {
  getMysteryBox,
  updateMysteryBox,
  deleteMysteryBox,
  transitionStatus,
  addReward,
  updateReward,
  removeReward,
  validateProbabilities,
  type MysteryBoxStatus,
  type MysteryBoxRarity,
  type MysteryBoxRewardType,
} from "../services/mystery-box-management.server";
import { getRecentWinners } from "../services/mystery-box-open.server";
import {
  deliverReward,
  deliverAllPendingRewards,
  getDeliveryStats,
} from "../services/mystery-box-delivery.server";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface RewardData {
  id: string;
  name: string;
  description: string | null;
  rewardType: string;
  rewardValue: Record<string, unknown>;
  probability: number;
  rarity: string;
  quantity: number | null;
  quantityWon: number;
  position: number;
}

interface WinnerData {
  winnerId: string;
  customerEmail: string;
  rewardName: string;
  rarity: string;
  deliveryStatus: string;
  openedAt: string;
}

interface LoaderData {
  box: {
    id: string;
    name: string;
    description: string | null;
    imageUrl: string | null;
    status: string;
    openCost: number;
    maxOpensTotal: number | null;
    maxOpensPerCustomer: number;
    startsAt: string;
    endsAt: string;
    isPublic: boolean;
    totalOpens: number;
    uniqueOpeners: number;
    totalSpent: number;
  };
  rewards: RewardData[];
  recentWinners: WinnerData[];
  probabilityValidation: {
    valid: boolean;
    total: number;
    errors: string[];
  };
  deliveryStats: {
    total: number;
    pending: number;
    delivered: number;
    failed: number;
  };
  pointsConfig: {
    currencyName: string;
    currencyIcon: string;
    currencyPlural: string;
  };
}

interface ActionData {
  success: boolean;
  message?: string;
  error?: string;
  rewardId?: string;
}

// ============================================
// LOADER
// ============================================

const LOG_PREFIX = "[app.rewards.mystery-boxes.$id]";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  console.log(`${LOG_PREFIX} Loader starting for box: ${params.id}`);

  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    const boxId = params.id!;

    // Fetch box with rewards
    const box = await getMysteryBox(boxId, shop);

    if (!box) {
      throw new Response("Mystery box not found", { status: 404 });
    }

    // Fetch additional data in parallel
    const [config, recentWinners, deliveryStats] = await Promise.all([
      getPointsConfig(shop),
      getRecentWinners(boxId, shop, 10),
      getDeliveryStats(boxId, shop),
    ]);

    // Validate probabilities
    const probabilityValidation = validateProbabilities(box.rewards);

    return json<LoaderData>({
      box: {
        id: box.id,
        name: box.name,
        description: box.description,
        imageUrl: box.imageUrl,
        status: box.status,
        openCost: box.openCost,
        maxOpensTotal: box.maxOpensTotal,
        maxOpensPerCustomer: box.maxOpensPerCustomer,
        startsAt: box.startsAt.toISOString(),
        endsAt: box.endsAt.toISOString(),
        isPublic: box.isPublic,
        totalOpens: box.totalOpens,
        uniqueOpeners: box.uniqueOpeners,
        totalSpent: box.totalSpent,
      },
      rewards: box.rewards.map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        rewardType: r.rewardType,
        rewardValue: r.rewardValue as Record<string, unknown>,
        probability: Number(r.probability),
        rarity: r.rarity,
        quantity: r.quantity,
        quantityWon: r.quantityWon,
        position: r.position,
      })),
      recentWinners: recentWinners.map((w) => ({
        ...w,
        openedAt: w.openedAt.toISOString(),
      })),
      probabilityValidation,
      deliveryStats,
      pointsConfig: {
        currencyName: config.currencyName,
        currencyIcon: config.currencyIcon,
        currencyPlural: config.currencyNamePlural,
      },
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} LOADER ERROR:`, error);
    throw error;
  }
};

// ============================================
// ACTION
// ============================================

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const boxId = params.id!;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  console.log(`${LOG_PREFIX} Action: ${intent}`);

  try {
    // Box updates
    if (intent === "updateBox") {
      const name = formData.get("name") as string;
      const description = formData.get("description") as string;
      const openCost = parseInt(formData.get("openCost") as string);
      const maxOpensPerCustomer = parseInt(formData.get("maxOpensPerCustomer") as string);
      const maxOpensTotal = formData.get("maxOpensTotal") as string;
      const startsAt = formData.get("startsAt") as string;
      const endsAt = formData.get("endsAt") as string;
      const isPublic = formData.get("isPublic") === "true";

      await updateMysteryBox(boxId, shop, {
        name,
        description: description || null,
        openCost,
        maxOpensPerCustomer,
        maxOpensTotal: maxOpensTotal ? parseInt(maxOpensTotal) : null,
        startsAt: startsAt ? new Date(startsAt) : undefined,
        endsAt: endsAt ? new Date(endsAt) : undefined,
        isPublic,
      });

      return json<ActionData>({ success: true, message: "Box updated" });
    }

    // Status transitions
    if (intent === "updateStatus") {
      const newStatus = formData.get("status") as MysteryBoxStatus;
      await transitionStatus(boxId, shop, newStatus);
      return json<ActionData>({ success: true, message: `Status updated to ${newStatus}` });
    }

    // Delete box
    if (intent === "delete") {
      await deleteMysteryBox(boxId, shop);
      return redirect("/app/rewards/mystery-boxes");
    }

    // Add reward
    if (intent === "addReward") {
      const name = formData.get("rewardName") as string;
      const description = formData.get("rewardDescription") as string;
      const rewardType = formData.get("rewardType") as MysteryBoxRewardType;
      const probability = parseFloat(formData.get("probability") as string);
      const rarity = formData.get("rarity") as MysteryBoxRarity;
      const quantity = formData.get("quantity") as string;

      // Build reward value based on type
      let rewardValue: Record<string, unknown> = {};
      if (rewardType === "POINTS") {
        rewardValue = { amount: parseInt(formData.get("pointsAmount") as string) || 0 };
      } else if (rewardType === "DISCOUNT") {
        rewardValue = {
          type: formData.get("discountType") || "percentage",
          value: parseFloat(formData.get("discountValue") as string) || 0,
          maxUses: 1,
        };
      } else if (rewardType === "STORE_CREDIT") {
        rewardValue = { amount: parseInt(formData.get("creditAmount") as string) || 0 };
      } else if (rewardType === "NOTHING") {
        rewardValue = { message: "Better luck next time!" };
      }

      const reward = await addReward(boxId, shop, {
        name,
        description: description || undefined,
        rewardType,
        rewardValue,
        probability,
        rarity,
        quantity: quantity ? parseInt(quantity) : null,
      });

      return json<ActionData>({
        success: true,
        message: "Reward added",
        rewardId: reward.id,
      });
    }

    // Update reward
    if (intent === "updateReward") {
      const rewardId = formData.get("rewardId") as string;
      const name = formData.get("rewardName") as string;
      const probability = parseFloat(formData.get("probability") as string);
      const rarity = formData.get("rarity") as MysteryBoxRarity;
      const quantity = formData.get("quantity") as string;

      await updateReward(rewardId, shop, {
        name,
        probability,
        rarity,
        quantity: quantity ? parseInt(quantity) : null,
      });

      return json<ActionData>({ success: true, message: "Reward updated" });
    }

    // Remove reward
    if (intent === "removeReward") {
      const rewardId = formData.get("rewardId") as string;
      await removeReward(rewardId, shop);
      return json<ActionData>({ success: true, message: "Reward removed" });
    }

    // Deliver single reward
    if (intent === "deliverReward") {
      const winnerId = formData.get("winnerId") as string;
      const result = await deliverReward(winnerId, { admin });

      if (result.success) {
        return json<ActionData>({ success: true, message: "Reward delivered" });
      } else {
        return json<ActionData>({ success: false, error: result.error });
      }
    }

    // Deliver all pending
    if (intent === "deliverAllPending") {
      const result = await deliverAllPendingRewards(boxId, shop, admin);
      return json<ActionData>({
        success: true,
        message: `Delivered ${result.successful} rewards (${result.failed} failed, ${result.requiresManual} manual)`,
      });
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

export default function MysteryBoxDetail() {
  const {
    box,
    rewards,
    recentWinners,
    probabilityValidation,
    deliveryStats,
    pointsConfig,
  } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastError, setToastError] = useState(false);

  // Modals
  const [addRewardModalOpen, setAddRewardModalOpen] = useState(false);
  const [editBoxModalOpen, setEditBoxModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Form state for add reward
  const [rewardName, setRewardName] = useState("");
  const [rewardType, setRewardType] = useState<string>("POINTS");
  const [probability, setProbability] = useState("10");
  const [rarity, setRarity] = useState<string>("COMMON");
  const [quantity, setQuantity] = useState("");
  const [pointsAmount, setPointsAmount] = useState("100");
  const [discountType, setDiscountType] = useState("percentage");
  const [discountValue, setDiscountValue] = useState("10");
  const [creditAmount, setCreditAmount] = useState("500");

  // Form state for edit box
  const [editName, setEditName] = useState(box.name);
  const [editDescription, setEditDescription] = useState(box.description || "");
  const [editOpenCost, setEditOpenCost] = useState(box.openCost.toString());
  const [editMaxOpensPerCustomer, setEditMaxOpensPerCustomer] = useState(box.maxOpensPerCustomer.toString());
  const [editMaxOpensTotal, setEditMaxOpensTotal] = useState(box.maxOpensTotal?.toString() || "");
  const [editStartsAt, setEditStartsAt] = useState(box.startsAt.slice(0, 16));
  const [editEndsAt, setEditEndsAt] = useState(box.endsAt.slice(0, 16));
  const [editIsPublic, setEditIsPublic] = useState(box.isPublic);

  // Show toast on action completion
  useEffect(() => {
    if (actionData) {
      if (actionData.success) {
        setToastMessage(actionData.message || "Success");
        setToastError(false);
        setToastActive(true);
        if (actionData.rewardId) {
          setAddRewardModalOpen(false);
          resetRewardForm();
        }
        setEditBoxModalOpen(false);
      } else if (actionData.error) {
        setToastMessage(actionData.error);
        setToastError(true);
        setToastActive(true);
      }
    }
  }, [actionData]);

  const resetRewardForm = () => {
    setRewardName("");
    setRewardType("POINTS");
    setProbability("10");
    setRarity("COMMON");
    setQuantity("");
    setPointsAmount("100");
    setDiscountValue("10");
    setCreditAmount("500");
  };

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

  // Rarity badge helper
  const getRarityBadge = (rarity: string) => {
    const config: Record<string, { tone: any }> = {
      COMMON: { tone: undefined },
      UNCOMMON: { tone: "info" },
      RARE: { tone: "attention" },
      EPIC: { tone: "warning" },
      LEGENDARY: { tone: "success" },
    };
    return <Badge tone={config[rarity]?.tone}>{rarity}</Badge>;
  };

  // Delivery status badge
  const getDeliveryBadge = (status: string) => {
    const config: Record<string, { tone: any; label: string }> = {
      PENDING: { tone: "attention", label: "Pending" },
      PROCESSING: { tone: "info", label: "Processing" },
      DELIVERED: { tone: "success", label: "Delivered" },
      FAILED: { tone: "critical", label: "Failed" },
      CLAIMED: { tone: "success", label: "Claimed" },
    };
    const c = config[status] || { tone: "info", label: status };
    return <Badge tone={c.tone}>{c.label}</Badge>;
  };

  // Format number helper
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  // Handle status change
  const handleStatusChange = (newStatus: string) => {
    const formData = new FormData();
    formData.append("intent", "updateStatus");
    formData.append("status", newStatus);
    submit(formData, { method: "post" });
  };

  // Handle box update
  const handleBoxUpdate = () => {
    const formData = new FormData();
    formData.append("intent", "updateBox");
    formData.append("name", editName);
    formData.append("description", editDescription);
    formData.append("openCost", editOpenCost);
    formData.append("maxOpensPerCustomer", editMaxOpensPerCustomer);
    formData.append("maxOpensTotal", editMaxOpensTotal);
    formData.append("startsAt", editStartsAt);
    formData.append("endsAt", editEndsAt);
    formData.append("isPublic", editIsPublic.toString());
    submit(formData, { method: "post" });
  };

  // Handle add reward
  const handleAddReward = () => {
    const formData = new FormData();
    formData.append("intent", "addReward");
    formData.append("rewardName", rewardName);
    formData.append("rewardType", rewardType);
    formData.append("probability", probability);
    formData.append("rarity", rarity);
    formData.append("quantity", quantity);
    formData.append("pointsAmount", pointsAmount);
    formData.append("discountType", discountType);
    formData.append("discountValue", discountValue);
    formData.append("creditAmount", creditAmount);
    submit(formData, { method: "post" });
  };

  // Handle remove reward
  const handleRemoveReward = (rewardId: string) => {
    const formData = new FormData();
    formData.append("intent", "removeReward");
    formData.append("rewardId", rewardId);
    submit(formData, { method: "post" });
  };

  // Handle delete box
  const handleDelete = () => {
    const formData = new FormData();
    formData.append("intent", "delete");
    submit(formData, { method: "post" });
  };

  // Handle deliver all
  const handleDeliverAll = () => {
    const formData = new FormData();
    formData.append("intent", "deliverAllPending");
    submit(formData, { method: "post" });
  };

  // Valid status transitions
  const getAvailableTransitions = (currentStatus: string): string[] => {
    const transitions: Record<string, string[]> = {
      DRAFT: ["SCHEDULED", "CANCELLED"],
      SCHEDULED: ["ACTIVE", "DRAFT", "CANCELLED"],
      ACTIVE: ["CLOSED", "CANCELLED"],
      CLOSED: ["COMPLETED", "ACTIVE"],
      COMPLETED: [],
      CANCELLED: [],
    };
    return transitions[currentStatus] || [];
  };

  const availableTransitions = getAvailableTransitions(box.status);
  const canModify = box.status === "DRAFT" || box.status === "SCHEDULED";
  const canAddRewards = box.status !== "COMPLETED" && box.status !== "CANCELLED";

  // Rewards table rows
  const rewardRows = rewards.map((reward) => [
    reward.name,
    getRarityBadge(reward.rarity),
    `${reward.probability}%`,
    reward.rewardType,
    reward.quantity !== null ? `${reward.quantityWon}/${reward.quantity}` : `${reward.quantityWon}`,
    canModify ? (
      <Button
        key={reward.id}
        variant="plain"
        tone="critical"
        onClick={() => handleRemoveReward(reward.id)}
      >
        Remove
      </Button>
    ) : null,
  ]);

  // Winners table rows
  const winnerRows = recentWinners.map((winner) => [
    winner.customerEmail,
    winner.rewardName,
    getRarityBadge(winner.rarity),
    getDeliveryBadge(winner.deliveryStatus),
    new Date(winner.openedAt).toLocaleString(),
  ]);

  return (
    <Frame>
      <Page
        title={box.name}
        backAction={{ content: "Mystery Boxes", url: "/app/rewards/mystery-boxes" }}
        titleMetadata={getStatusBadge(box.status)}
        primaryAction={
          canModify
            ? {
                content: "Edit Box",
                onAction: () => setEditBoxModalOpen(true),
              }
            : undefined
        }
        secondaryActions={[
          ...(availableTransitions.length > 0
            ? availableTransitions.map((status) => ({
                content: `Set ${status.charAt(0) + status.slice(1).toLowerCase()}`,
                onAction: () => handleStatusChange(status),
                destructive: status === "CANCELLED",
              }))
            : []),
          ...(canModify
            ? [
                {
                  content: "Delete",
                  onAction: () => setDeleteConfirmOpen(true),
                  destructive: true,
                },
              ]
            : []),
        ]}
      >
        <Layout>
          {/* Probability Warning */}
          {!probabilityValidation.valid && (
            <Layout.Section>
              <Banner title="Probability Configuration Issue" tone="warning">
                <p>
                  {probabilityValidation.errors.join(". ")}
                  {" "}Total: {probabilityValidation.total.toFixed(2)}%
                </p>
              </Banner>
            </Layout.Section>
          )}

          {/* Stats */}
          <Layout.Section>
            <InlineStack gap="400" wrap>
              <Card>
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" as="p">Total Opens</Text>
                  <Text variant="headingLg" as="p">{formatNumber(box.totalOpens)}</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" as="p">Unique Customers</Text>
                  <Text variant="headingLg" as="p">{formatNumber(box.uniqueOpeners)}</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" as="p">{pointsConfig.currencyPlural} Spent</Text>
                  <Text variant="headingLg" as="p">
                    {pointsConfig.currencyIcon} {formatNumber(box.totalSpent)}
                  </Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued" as="p">Cost per Open</Text>
                  <Text variant="headingLg" as="p">
                    {pointsConfig.currencyIcon} {box.openCost}
                  </Text>
                </BlockStack>
              </Card>
            </InlineStack>
          </Layout.Section>

          {/* Box Details */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">Box Details</Text>
                <Divider />
                <InlineStack gap="400" wrap>
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued" as="p">Start Date</Text>
                    <Text as="p">{new Date(box.startsAt).toLocaleString()}</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued" as="p">End Date</Text>
                    <Text as="p">{new Date(box.endsAt).toLocaleString()}</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued" as="p">Max Opens/Customer</Text>
                    <Text as="p">{box.maxOpensPerCustomer}</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued" as="p">Max Total Opens</Text>
                    <Text as="p">{box.maxOpensTotal || "Unlimited"}</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued" as="p">Visibility</Text>
                    <Text as="p">{box.isPublic ? "Public" : "Private"}</Text>
                  </BlockStack>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Rewards */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h3">
                    Rewards ({rewards.length}) - Total: {probabilityValidation.total.toFixed(1)}%
                  </Text>
                  {canAddRewards && (
                    <Button onClick={() => setAddRewardModalOpen(true)}>Add Reward</Button>
                  )}
                </InlineStack>
                <Divider />
                {rewards.length > 0 ? (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text", "text", "text"]}
                    headings={["Name", "Rarity", "Probability", "Type", "Won", canModify ? "Action" : ""]}
                    rows={rewardRows}
                  />
                ) : (
                  <Text tone="subdued" as="p">No rewards configured. Add at least one reward to activate this box.</Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Recent Winners */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h3">
                    Recent Winners ({deliveryStats.total} total, {deliveryStats.pending} pending)
                  </Text>
                  {deliveryStats.pending > 0 && (
                    <Button onClick={handleDeliverAll} loading={isSubmitting}>
                      Deliver All Pending
                    </Button>
                  )}
                </InlineStack>
                <Divider />
                {recentWinners.length > 0 ? (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text", "text"]}
                    headings={["Customer", "Reward", "Rarity", "Status", "Opened"]}
                    rows={winnerRows}
                  />
                ) : (
                  <Text tone="subdued" as="p">No winners yet.</Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Add Reward Modal */}
        <Modal
          open={addRewardModalOpen}
          onClose={() => setAddRewardModalOpen(false)}
          title="Add Reward"
          primaryAction={{
            content: "Add Reward",
            onAction: handleAddReward,
            loading: isSubmitting,
            disabled: !rewardName || !probability,
          }}
          secondaryActions={[
            { content: "Cancel", onAction: () => setAddRewardModalOpen(false) },
          ]}
        >
          <Modal.Section>
            <FormLayout>
              <TextField
                label="Reward Name"
                value={rewardName}
                onChange={setRewardName}
                autoComplete="off"
                placeholder="50 Bonus Points"
              />
              <Select
                label="Reward Type"
                options={[
                  { label: "Points", value: "POINTS" },
                  { label: "Discount Code", value: "DISCOUNT" },
                  { label: "Store Credit", value: "STORE_CREDIT" },
                  { label: "Nothing (Consolation)", value: "NOTHING" },
                ]}
                value={rewardType}
                onChange={setRewardType}
              />
              {rewardType === "POINTS" && (
                <TextField
                  label="Points Amount"
                  type="number"
                  value={pointsAmount}
                  onChange={setPointsAmount}
                  autoComplete="off"
                />
              )}
              {rewardType === "DISCOUNT" && (
                <>
                  <Select
                    label="Discount Type"
                    options={[
                      { label: "Percentage", value: "percentage" },
                      { label: "Fixed Amount", value: "fixed" },
                    ]}
                    value={discountType}
                    onChange={setDiscountType}
                  />
                  <TextField
                    label={discountType === "percentage" ? "Percentage" : "Amount ($)"}
                    type="number"
                    value={discountValue}
                    onChange={setDiscountValue}
                    autoComplete="off"
                  />
                </>
              )}
              {rewardType === "STORE_CREDIT" && (
                <TextField
                  label="Amount (cents)"
                  type="number"
                  value={creditAmount}
                  onChange={setCreditAmount}
                  autoComplete="off"
                  helpText="500 = $5.00"
                />
              )}
              <TextField
                label="Probability (%)"
                type="number"
                value={probability}
                onChange={setProbability}
                autoComplete="off"
                helpText="All probabilities must sum to 100%"
              />
              <Select
                label="Rarity"
                options={[
                  { label: "Common (60-70%)", value: "COMMON" },
                  { label: "Uncommon (20-25%)", value: "UNCOMMON" },
                  { label: "Rare (8-12%)", value: "RARE" },
                  { label: "Epic (2-5%)", value: "EPIC" },
                  { label: "Legendary (0.5-2%)", value: "LEGENDARY" },
                ]}
                value={rarity}
                onChange={setRarity}
              />
              <TextField
                label="Quantity (optional)"
                type="number"
                value={quantity}
                onChange={setQuantity}
                autoComplete="off"
                placeholder="Unlimited"
                helpText="Leave empty for unlimited"
              />
            </FormLayout>
          </Modal.Section>
        </Modal>

        {/* Edit Box Modal */}
        <Modal
          open={editBoxModalOpen}
          onClose={() => setEditBoxModalOpen(false)}
          title="Edit Mystery Box"
          primaryAction={{
            content: "Save",
            onAction: handleBoxUpdate,
            loading: isSubmitting,
          }}
          secondaryActions={[
            { content: "Cancel", onAction: () => setEditBoxModalOpen(false) },
          ]}
        >
          <Modal.Section>
            <FormLayout>
              <TextField
                label="Box Name"
                value={editName}
                onChange={setEditName}
                autoComplete="off"
              />
              <TextField
                label="Description"
                value={editDescription}
                onChange={setEditDescription}
                autoComplete="off"
                multiline={3}
              />
              <TextField
                label={`Cost (${pointsConfig.currencyPlural})`}
                type="number"
                value={editOpenCost}
                onChange={setEditOpenCost}
                autoComplete="off"
              />
              <TextField
                label="Max Opens Per Customer"
                type="number"
                value={editMaxOpensPerCustomer}
                onChange={setEditMaxOpensPerCustomer}
                autoComplete="off"
              />
              <TextField
                label="Max Total Opens"
                type="number"
                value={editMaxOpensTotal}
                onChange={setEditMaxOpensTotal}
                autoComplete="off"
                placeholder="Unlimited"
              />
              <TextField
                label="Start Date"
                type="datetime-local"
                value={editStartsAt}
                onChange={setEditStartsAt}
                autoComplete="off"
              />
              <TextField
                label="End Date"
                type="datetime-local"
                value={editEndsAt}
                onChange={setEditEndsAt}
                autoComplete="off"
              />
              <Checkbox
                label="Public (visible to customers)"
                checked={editIsPublic}
                onChange={setEditIsPublic}
              />
            </FormLayout>
          </Modal.Section>
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          open={deleteConfirmOpen}
          onClose={() => setDeleteConfirmOpen(false)}
          title="Delete Mystery Box"
          primaryAction={{
            content: "Delete",
            onAction: handleDelete,
            destructive: true,
            loading: isSubmitting,
          }}
          secondaryActions={[
            { content: "Cancel", onAction: () => setDeleteConfirmOpen(false) },
          ]}
        >
          <Modal.Section>
            <Text as="p">
              Are you sure you want to delete &quot;{box.name}&quot;? This action cannot be undone.
              All rewards and winner records will be deleted.
            </Text>
          </Modal.Section>
        </Modal>

        {toastActive && (
          <Toast content={toastMessage} error={toastError} onDismiss={dismissToast} />
        )}
      </Page>
    </Frame>
  );
}
