/**
 * Raffle Bonus Settings
 *
 * Manages bonus configurations for raffles using existing Raffle model fields.
 * No separate table required - all settings stored directly on the Raffle.
 *
 * Features:
 * - Early Bird bonuses (first N entries get bonus multiplier)
 * - Daily free entries
 * - Streak bonuses (enabled/disabled)
 * - Lucky number bonuses (enabled/disabled)
 * - Activity feed (social proof)
 */

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
  Box,
  Toast,
  Frame,
  TextField,
  Select,
  FormLayout,
  Checkbox,
  Divider,
  InlineGrid,
  ProgressBar,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// ============================================
// TYPES
// ============================================

interface LoaderData {
  raffle: {
    id: string;
    name: string;
    status: string;
    totalEntries: number;
    // Bonus settings
    enableStreakBonuses: boolean;
    enableLuckyNumbers: boolean;
    enableActivityFeed: boolean;
    enableInstantWins: boolean;
    dailyFreeEntries: number;
    earlyBirdBonusPercent: number;
    earlyBirdEntryLimit: number;
  };
  // Calculated bonus status
  bonusStatus: {
    earlyBirdActive: boolean;
    earlyBirdRemaining: number;
    earlyBirdProgress: number;
  };
}

// ============================================
// LOADER
// ============================================

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const raffleId = params.id;

  if (!raffleId) {
    throw new Response("Raffle ID required", { status: 400 });
  }

  const raffle = await db.raffle.findFirst({
    where: { id: raffleId, shop },
    select: {
      id: true,
      name: true,
      status: true,
      totalEntries: true,
      enableStreakBonuses: true,
      enableLuckyNumbers: true,
      enableActivityFeed: true,
      enableInstantWins: true,
      dailyFreeEntries: true,
      earlyBirdBonusPercent: true,
      earlyBirdEntryLimit: true,
    },
  });

  if (!raffle) {
    throw new Response("Raffle not found", { status: 404 });
  }

  // Calculate early bird status
  const earlyBirdActive = raffle.earlyBirdEntryLimit > 0 &&
                          raffle.totalEntries < raffle.earlyBirdEntryLimit;
  const earlyBirdRemaining = Math.max(0, raffle.earlyBirdEntryLimit - raffle.totalEntries);
  const earlyBirdProgress = raffle.earlyBirdEntryLimit > 0
    ? Math.min(100, (raffle.totalEntries / raffle.earlyBirdEntryLimit) * 100)
    : 0;

  return json<LoaderData>({
    raffle: {
      id: raffle.id,
      name: raffle.name,
      status: raffle.status,
      totalEntries: raffle.totalEntries,
      enableStreakBonuses: raffle.enableStreakBonuses,
      enableLuckyNumbers: raffle.enableLuckyNumbers,
      enableActivityFeed: raffle.enableActivityFeed,
      enableInstantWins: raffle.enableInstantWins,
      dailyFreeEntries: raffle.dailyFreeEntries,
      earlyBirdBonusPercent: raffle.earlyBirdBonusPercent,
      earlyBirdEntryLimit: raffle.earlyBirdEntryLimit,
    },
    bonusStatus: {
      earlyBirdActive,
      earlyBirdRemaining,
      earlyBirdProgress,
    },
  });
};

// ============================================
// ACTION
// ============================================

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const raffleId = params.id;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (!raffleId) {
    return json({ success: false, error: "Raffle ID required" }, { status: 400 });
  }

  // Verify raffle belongs to shop
  const raffle = await db.raffle.findFirst({
    where: { id: raffleId, shop },
    select: { id: true },
  });

  if (!raffle) {
    return json({ success: false, error: "Raffle not found" }, { status: 404 });
  }

  try {
    if (intent === "save") {
      // Parse form values
      const enableStreakBonuses = formData.get("enableStreakBonuses") === "true";
      const enableLuckyNumbers = formData.get("enableLuckyNumbers") === "true";
      const enableActivityFeed = formData.get("enableActivityFeed") === "true";
      const enableInstantWins = formData.get("enableInstantWins") === "true";
      const dailyFreeEntries = parseInt(formData.get("dailyFreeEntries") as string) || 0;
      const earlyBirdBonusPercent = parseInt(formData.get("earlyBirdBonusPercent") as string) || 0;
      const earlyBirdEntryLimit = parseInt(formData.get("earlyBirdEntryLimit") as string) || 0;

      await db.raffle.update({
        where: { id: raffleId },
        data: {
          enableStreakBonuses,
          enableLuckyNumbers,
          enableActivityFeed,
          enableInstantWins,
          dailyFreeEntries,
          earlyBirdBonusPercent,
          earlyBirdEntryLimit,
        },
      });

      return json({ success: true, message: "Bonus settings saved" });
    }

    if (intent === "applyPreset") {
      const preset = formData.get("preset") as string;

      let settings: Record<string, boolean | number> = {};

      switch (preset) {
        case "engagement":
          // High engagement preset
          settings = {
            enableStreakBonuses: true,
            enableLuckyNumbers: true,
            enableActivityFeed: true,
            enableInstantWins: false,
            dailyFreeEntries: 1,
            earlyBirdBonusPercent: 50,
            earlyBirdEntryLimit: 100,
          };
          break;
        case "urgency":
          // Urgency-focused preset
          settings = {
            enableStreakBonuses: true,
            enableLuckyNumbers: false,
            enableActivityFeed: true,
            enableInstantWins: false,
            dailyFreeEntries: 0,
            earlyBirdBonusPercent: 100,
            earlyBirdEntryLimit: 50,
          };
          break;
        case "freeplay":
          // Free play to drive adoption
          settings = {
            enableStreakBonuses: true,
            enableLuckyNumbers: true,
            enableActivityFeed: true,
            enableInstantWins: false,
            dailyFreeEntries: 3,
            earlyBirdBonusPercent: 25,
            earlyBirdEntryLimit: 200,
          };
          break;
        case "minimal":
          // Minimal bonuses
          settings = {
            enableStreakBonuses: false,
            enableLuckyNumbers: false,
            enableActivityFeed: true,
            enableInstantWins: false,
            dailyFreeEntries: 0,
            earlyBirdBonusPercent: 0,
            earlyBirdEntryLimit: 0,
          };
          break;
        default:
          return json({ success: false, error: "Unknown preset" }, { status: 400 });
      }

      await db.raffle.update({
        where: { id: raffleId },
        data: settings,
      });

      return json({ success: true, message: `Applied ${preset} preset` });
    }

    return json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[bonus-settings] Action error:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "An error occurred",
    }, { status: 500 });
  }
};

// ============================================
// COMPONENT
// ============================================

export default function RaffleBonusSettings() {
  const { raffle, bonusStatus } = useLoaderData<LoaderData>();
  const actionData = useActionData<{ success: boolean; message?: string; error?: string }>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Toast state
  const [showToast, setShowToast] = useState(false);
  const [toastContent, setToastContent] = useState("");
  const [toastError, setToastError] = useState(false);

  // Form state
  const [form, setForm] = useState({
    enableStreakBonuses: raffle.enableStreakBonuses,
    enableLuckyNumbers: raffle.enableLuckyNumbers,
    enableActivityFeed: raffle.enableActivityFeed,
    enableInstantWins: raffle.enableInstantWins,
    dailyFreeEntries: raffle.dailyFreeEntries.toString(),
    earlyBirdBonusPercent: raffle.earlyBirdBonusPercent.toString(),
    earlyBirdEntryLimit: raffle.earlyBirdEntryLimit.toString(),
  });

  // Handle action result
  useEffect(() => {
    if (actionData) {
      setToastContent(actionData.success ? actionData.message || "Success" : actionData.error || "Error");
      setToastError(!actionData.success);
      setShowToast(true);
    }
  }, [actionData]);

  // Save settings
  const handleSave = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "save");
    formData.append("enableStreakBonuses", form.enableStreakBonuses.toString());
    formData.append("enableLuckyNumbers", form.enableLuckyNumbers.toString());
    formData.append("enableActivityFeed", form.enableActivityFeed.toString());
    formData.append("enableInstantWins", form.enableInstantWins.toString());
    formData.append("dailyFreeEntries", form.dailyFreeEntries);
    formData.append("earlyBirdBonusPercent", form.earlyBirdBonusPercent);
    formData.append("earlyBirdEntryLimit", form.earlyBirdEntryLimit);
    submit(formData, { method: "post" });
  }, [form, submit]);

  // Apply preset
  const applyPreset = useCallback((preset: string) => {
    const formData = new FormData();
    formData.append("intent", "applyPreset");
    formData.append("preset", preset);
    submit(formData, { method: "post" });
  }, [submit]);

  // Check if form has changes
  const hasChanges =
    form.enableStreakBonuses !== raffle.enableStreakBonuses ||
    form.enableLuckyNumbers !== raffle.enableLuckyNumbers ||
    form.enableActivityFeed !== raffle.enableActivityFeed ||
    form.enableInstantWins !== raffle.enableInstantWins ||
    form.dailyFreeEntries !== raffle.dailyFreeEntries.toString() ||
    form.earlyBirdBonusPercent !== raffle.earlyBirdBonusPercent.toString() ||
    form.earlyBirdEntryLimit !== raffle.earlyBirdEntryLimit.toString();

  return (
    <Frame>
      <Page
        title="Bonus Settings"
        subtitle={raffle.name}
        backAction={{ content: "Back to Raffle", url: `/app/rewards/raffles/${raffle.id}` }}
        primaryAction={{
          content: "Save Settings",
          onAction: handleSave,
          loading: isSubmitting,
          disabled: !hasChanges,
        }}
      >
        <Layout>
          {/* Status Banner */}
          <Layout.Section>
            {bonusStatus.earlyBirdActive ? (
              <Banner tone="success">
                <BlockStack gap="200">
                  <Text as="p" fontWeight="semibold">
                    Early Bird Bonus Active!
                  </Text>
                  <Text as="p">
                    {bonusStatus.earlyBirdRemaining} spots remaining for {raffle.earlyBirdBonusPercent}% bonus entries
                  </Text>
                  <Box paddingBlockStart="100">
                    <ProgressBar progress={bonusStatus.earlyBirdProgress} size="small" />
                  </Box>
                </BlockStack>
              </Banner>
            ) : raffle.earlyBirdEntryLimit > 0 ? (
              <Banner tone="info">
                <Text as="p">Early bird bonus has been claimed by the first {raffle.earlyBirdEntryLimit} entries.</Text>
              </Banner>
            ) : null}
          </Layout.Section>

          {/* Quick Presets */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Quick Presets</Text>
                <Text as="p" tone="subdued">
                  Apply a preset configuration to quickly set up bonuses
                </Text>
                <InlineStack gap="300" wrap={false}>
                  <Button onClick={() => applyPreset("engagement")} disabled={isSubmitting}>
                    High Engagement
                  </Button>
                  <Button onClick={() => applyPreset("urgency")} disabled={isSubmitting}>
                    Urgency Focus
                  </Button>
                  <Button onClick={() => applyPreset("freeplay")} disabled={isSubmitting}>
                    Free Play
                  </Button>
                  <Button onClick={() => applyPreset("minimal")} disabled={isSubmitting}>
                    Minimal
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Early Bird Settings */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h2">Early Bird Bonus</Text>
                  {bonusStatus.earlyBirdActive && <Badge tone="success">Active</Badge>}
                </InlineStack>
                <Text as="p" tone="subdued">
                  Reward the first customers who enter with bonus entries
                </Text>
                <Divider />
                <FormLayout>
                  <InlineGrid columns={2} gap="400">
                    <TextField
                      label="Bonus Percentage"
                      type="number"
                      value={form.earlyBirdBonusPercent}
                      onChange={(v) => setForm({ ...form, earlyBirdBonusPercent: v })}
                      suffix="%"
                      helpText="Extra entries as percentage (50 = +50% entries)"
                      min={0}
                      max={200}
                      autoComplete="off"
                    />
                    <TextField
                      label="Entry Limit"
                      type="number"
                      value={form.earlyBirdEntryLimit}
                      onChange={(v) => setForm({ ...form, earlyBirdEntryLimit: v })}
                      helpText="First N entries get the bonus (0 = disabled)"
                      min={0}
                      autoComplete="off"
                    />
                  </InlineGrid>
                </FormLayout>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Daily Free Entries */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Daily Free Entries</Text>
                <Text as="p" tone="subdued">
                  Allow customers to get free entries each day to drive engagement
                </Text>
                <Divider />
                <FormLayout>
                  <TextField
                    label="Free Entries Per Day"
                    type="number"
                    value={form.dailyFreeEntries}
                    onChange={(v) => setForm({ ...form, dailyFreeEntries: v })}
                    helpText="Number of free entries each customer can claim daily (0 = disabled)"
                    min={0}
                    max={10}
                    autoComplete="off"
                  />
                </FormLayout>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Psychology Features */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Engagement Features</Text>
                <Text as="p" tone="subdued">
                  Enable psychology-driven features to boost participation
                </Text>
                <Divider />
                <FormLayout>
                  <Checkbox
                    label="Streak Bonuses"
                    helpText="Reward customers who enter multiple days in a row"
                    checked={form.enableStreakBonuses}
                    onChange={(v) => setForm({ ...form, enableStreakBonuses: v })}
                  />
                  <Checkbox
                    label="Lucky Numbers"
                    helpText="Award bonus entries for special entry numbers (7th, 77th, etc.)"
                    checked={form.enableLuckyNumbers}
                    onChange={(v) => setForm({ ...form, enableLuckyNumbers: v })}
                  />
                  <Checkbox
                    label="Activity Feed"
                    helpText="Show real-time entry activity to create social proof"
                    checked={form.enableActivityFeed}
                    onChange={(v) => setForm({ ...form, enableActivityFeed: v })}
                  />
                  <Checkbox
                    label="Instant Wins"
                    helpText="Allow micro-prizes during entry purchase (coming soon)"
                    checked={form.enableInstantWins}
                    onChange={(v) => setForm({ ...form, enableInstantWins: v })}
                    disabled
                  />
                </FormLayout>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Current Status */}
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">Current Status</Text>
                <Divider />
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">Total Entries</Text>
                  <Text as="span" fontWeight="semibold">{raffle.totalEntries}</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">Raffle Status</Text>
                  <Badge tone={raffle.status === "ACTIVE" ? "success" : "info"}>
                    {raffle.status}
                  </Badge>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">Early Bird</Text>
                  <Badge tone={bonusStatus.earlyBirdActive ? "success" : "info"}>
                    {bonusStatus.earlyBirdActive ? "Active" : "Completed"}
                  </Badge>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Toast */}
        {showToast && (
          <Toast
            content={toastContent}
            error={toastError}
            onDismiss={() => setShowToast(false)}
          />
        )}
      </Page>
    </Frame>
  );
}
