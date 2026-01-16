import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
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
  Checkbox,
  Select,
  Divider,
  Toast,
  Frame,
  FormLayout,
  ChoiceList,
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getPointsConfig, updatePointsConfig } from "../services/points-config.server";
import type { PointsRoundingMode } from "@prisma/client";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface LoaderData {
  config: {
    isEnabled: boolean;
    currencyName: string;
    currencyNamePlural: string;
    currencyIcon: string;
    pointsPerDollar: number;
    roundingMode: PointsRoundingMode;
    pointsExpire: boolean;
    expirationDays: number;
    expirationWarningDays: number;
    rafflesEnabled: boolean;
    mysteryBoxesEnabled: boolean;
    spinWheelEnabled: boolean;
    challengesEnabled: boolean;
    scratchCardsEnabled: boolean;
    givebackPoolsEnabled: boolean;
    dailySpinEnabled: boolean;
    dailySpinResetHour: number;
    premiumSpinCost: number;
    streakBonusEnabled: boolean;
    streakBonusMultiplier: number;
  };
  tiers: Array<{
    id: string;
    name: string;
    pointsMultiplier: number | null;
    pointsLuckBonus: number | null;
    raffleEntryMultiplier: number | null;
  }>;
}

// ============================================
// LOADER
// ============================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [config, tiers] = await Promise.all([
    getPointsConfig(shop),
    db.tier.findMany({
      where: { shop },
      orderBy: { minSpend: "asc" },
      select: {
        id: true,
        name: true,
        pointsMultiplier: true,
        pointsLuckBonus: true,
        raffleEntryMultiplier: true,
      },
    }),
  ]);

  return json<LoaderData>({
    config,
    tiers: tiers.map((t) => ({
      id: t.id,
      name: t.name,
      pointsMultiplier: t.pointsMultiplier ? Number(t.pointsMultiplier) : null,
      pointsLuckBonus: t.pointsLuckBonus ? Number(t.pointsLuckBonus) : null,
      raffleEntryMultiplier: t.raffleEntryMultiplier ? Number(t.raffleEntryMultiplier) : null,
    })),
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

  if (intent === "save") {
    try {
      // Parse form data
      const isEnabled = formData.get("isEnabled") === "true";
      const currencyName = formData.get("currencyName") as string;
      const currencyNamePlural = formData.get("currencyNamePlural") as string;
      const currencyIcon = formData.get("currencyIcon") as string;
      const pointsPerDollar = parseInt(formData.get("pointsPerDollar") as string, 10);
      const roundingMode = formData.get("roundingMode") as PointsRoundingMode;
      const pointsExpire = formData.get("pointsExpire") === "true";
      const expirationDays = parseInt(formData.get("expirationDays") as string, 10);
      const expirationWarningDays = parseInt(formData.get("expirationWarningDays") as string, 10);

      // Feature toggles
      const rafflesEnabled = formData.get("rafflesEnabled") === "true";
      const mysteryBoxesEnabled = formData.get("mysteryBoxesEnabled") === "true";
      const spinWheelEnabled = formData.get("spinWheelEnabled") === "true";
      const challengesEnabled = formData.get("challengesEnabled") === "true";
      const scratchCardsEnabled = formData.get("scratchCardsEnabled") === "true";
      const givebackPoolsEnabled = formData.get("givebackPoolsEnabled") === "true";

      // Spin wheel settings
      const dailySpinEnabled = formData.get("dailySpinEnabled") === "true";
      const dailySpinResetHour = parseInt(formData.get("dailySpinResetHour") as string, 10);
      const premiumSpinCost = parseInt(formData.get("premiumSpinCost") as string, 10);

      // Streak settings
      const streakBonusEnabled = formData.get("streakBonusEnabled") === "true";
      const streakBonusMultiplier = parseFloat(formData.get("streakBonusMultiplier") as string);

      // Validate
      if (!currencyName || !currencyNamePlural) {
        return json({ success: false, error: "Currency name is required" }, { status: 400 });
      }

      if (pointsPerDollar < 1 || pointsPerDollar > 1000) {
        return json({ success: false, error: "Points per dollar must be between 1 and 1000" }, { status: 400 });
      }

      // Update config
      await updatePointsConfig(shop, {
        isEnabled,
        currencyName,
        currencyNamePlural,
        currencyIcon,
        pointsPerDollar,
        roundingMode,
        pointsExpire,
        expirationDays,
        expirationWarningDays,
        rafflesEnabled,
        mysteryBoxesEnabled,
        spinWheelEnabled,
        challengesEnabled,
        scratchCardsEnabled,
        givebackPoolsEnabled,
        dailySpinEnabled,
        dailySpinResetHour,
        premiumSpinCost,
        streakBonusEnabled,
        streakBonusMultiplier,
      });

      return json({ success: true, message: "Configuration saved" });
    } catch (error) {
      console.error("[PointsConfig] Error saving:", error);
      return json({ success: false, error: "Failed to save configuration" }, { status: 500 });
    }
  }

  if (intent === "updateTierMultiplier") {
    try {
      const tierId = formData.get("tierId") as string;
      const pointsMultiplier = parseFloat(formData.get("pointsMultiplier") as string);
      const pointsLuckBonus = parseFloat(formData.get("pointsLuckBonus") as string);
      const raffleEntryMultiplier = parseFloat(formData.get("raffleEntryMultiplier") as string);

      await db.tier.update({
        where: { id: tierId },
        data: {
          pointsMultiplier,
          pointsLuckBonus,
          raffleEntryMultiplier,
        },
      });

      return json({ success: true, message: "Tier multipliers updated" });
    } catch (error) {
      console.error("[PointsConfig] Error updating tier:", error);
      return json({ success: false, error: "Failed to update tier" }, { status: 500 });
    }
  }

  return json({ success: false, error: "Unknown action" }, { status: 400 });
};

// ============================================
// COMPONENT
// ============================================

export default function PointsConfiguration() {
  const { config, tiers } = useLoaderData<LoaderData>();
  const actionData = useActionData<{ success: boolean; message?: string; error?: string }>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Form state
  const [isEnabled, setIsEnabled] = useState(config.isEnabled);
  const [currencyName, setCurrencyName] = useState(config.currencyName);
  const [currencyNamePlural, setCurrencyNamePlural] = useState(config.currencyNamePlural);
  const [currencyIcon, setCurrencyIcon] = useState(config.currencyIcon);
  const [pointsPerDollar, setPointsPerDollar] = useState(config.pointsPerDollar.toString());
  const [roundingMode, setRoundingMode] = useState(config.roundingMode);
  const [pointsExpire, setPointsExpire] = useState(config.pointsExpire);
  const [expirationDays, setExpirationDays] = useState(config.expirationDays.toString());
  const [expirationWarningDays, setExpirationWarningDays] = useState(config.expirationWarningDays.toString());

  // Features
  const [rafflesEnabled, setRafflesEnabled] = useState(config.rafflesEnabled);
  const [mysteryBoxesEnabled, setMysteryBoxesEnabled] = useState(config.mysteryBoxesEnabled);
  const [spinWheelEnabled, setSpinWheelEnabled] = useState(config.spinWheelEnabled);
  const [challengesEnabled, setChallengesEnabled] = useState(config.challengesEnabled);
  const [scratchCardsEnabled, setScratchCardsEnabled] = useState(config.scratchCardsEnabled);
  const [givebackPoolsEnabled, setGivebackPoolsEnabled] = useState(config.givebackPoolsEnabled);

  // Spin wheel
  const [dailySpinEnabled, setDailySpinEnabled] = useState(config.dailySpinEnabled);
  const [dailySpinResetHour, setDailySpinResetHour] = useState(config.dailySpinResetHour.toString());
  const [premiumSpinCost, setPremiumSpinCost] = useState(config.premiumSpinCost.toString());

  // Streak
  const [streakBonusEnabled, setStreakBonusEnabled] = useState(config.streakBonusEnabled);
  const [streakBonusMultiplier, setStreakBonusMultiplier] = useState(config.streakBonusMultiplier.toString());

  // Toast
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastError, setToastError] = useState(false);

  useEffect(() => {
    if (actionData) {
      setToastMessage(actionData.message || actionData.error || "");
      setToastError(!actionData.success);
      setToastActive(true);
    }
  }, [actionData]);

  const handleSave = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "save");
    formData.append("isEnabled", isEnabled.toString());
    formData.append("currencyName", currencyName);
    formData.append("currencyNamePlural", currencyNamePlural);
    formData.append("currencyIcon", currencyIcon);
    formData.append("pointsPerDollar", pointsPerDollar);
    formData.append("roundingMode", roundingMode);
    formData.append("pointsExpire", pointsExpire.toString());
    formData.append("expirationDays", expirationDays);
    formData.append("expirationWarningDays", expirationWarningDays);
    formData.append("rafflesEnabled", rafflesEnabled.toString());
    formData.append("mysteryBoxesEnabled", mysteryBoxesEnabled.toString());
    formData.append("spinWheelEnabled", spinWheelEnabled.toString());
    formData.append("challengesEnabled", challengesEnabled.toString());
    formData.append("scratchCardsEnabled", scratchCardsEnabled.toString());
    formData.append("givebackPoolsEnabled", givebackPoolsEnabled.toString());
    formData.append("dailySpinEnabled", dailySpinEnabled.toString());
    formData.append("dailySpinResetHour", dailySpinResetHour);
    formData.append("premiumSpinCost", premiumSpinCost);
    formData.append("streakBonusEnabled", streakBonusEnabled.toString());
    formData.append("streakBonusMultiplier", streakBonusMultiplier);

    submit(formData, { method: "post" });
  }, [
    isEnabled, currencyName, currencyNamePlural, currencyIcon, pointsPerDollar,
    roundingMode, pointsExpire, expirationDays, expirationWarningDays,
    rafflesEnabled, mysteryBoxesEnabled, spinWheelEnabled, challengesEnabled,
    scratchCardsEnabled, givebackPoolsEnabled, dailySpinEnabled, dailySpinResetHour,
    premiumSpinCost, streakBonusEnabled, streakBonusMultiplier, submit
  ]);

  const dismissToast = useCallback(() => setToastActive(false), []);

  const roundingOptions = [
    { label: "Round Down (10.9 → 10)", value: "FLOOR" },
    { label: "Round Up (10.1 → 11)", value: "CEIL" },
    { label: "Standard Rounding (10.5 → 11)", value: "ROUND" },
  ];

  const hourOptions = Array.from({ length: 24 }, (_, i) => ({
    label: `${i.toString().padStart(2, "0")}:00`,
    value: i.toString(),
  }));

  const iconOptions = ["⭐", "💎", "🌟", "🪙", "💰", "🎁", "✨", "🏆"];

  return (
    <Frame>
      <Page
        title="Points Configuration"
        backAction={{ url: "/app/points" }}
        primaryAction={{
          content: "Save",
          onAction: handleSave,
          loading: isSubmitting,
        }}
      >
        <Layout>
          {/* Master Toggle */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">Points System</Text>
                    <Text tone="subdued" as="p">
                      Enable or disable the entire points engagement system
                    </Text>
                  </BlockStack>
                  <Button
                    variant={isEnabled ? "primary" : "secondary"}
                    onClick={() => setIsEnabled(!isEnabled)}
                  >
                    {isEnabled ? "Enabled" : "Disabled"}
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Currency Branding */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Currency Branding</Text>
                <Text tone="subdued" as="p">
                  Customize how points appear to your customers
                </Text>
                <Divider />
                <FormLayout>
                  <FormLayout.Group>
                    <TextField
                      label="Currency Name (Singular)"
                      value={currencyName}
                      onChange={setCurrencyName}
                      placeholder="Point"
                      autoComplete="off"
                    />
                    <TextField
                      label="Currency Name (Plural)"
                      value={currencyNamePlural}
                      onChange={setCurrencyNamePlural}
                      placeholder="Points"
                      autoComplete="off"
                    />
                  </FormLayout.Group>
                  <BlockStack gap="200">
                    <Text variant="bodyMd" as="p">Currency Icon</Text>
                    <InlineStack gap="200">
                      {iconOptions.map((icon) => (
                        <Button
                          key={icon}
                          variant={currencyIcon === icon ? "primary" : "secondary"}
                          onClick={() => setCurrencyIcon(icon)}
                        >
                          {icon}
                        </Button>
                      ))}
                    </InlineStack>
                  </BlockStack>
                </FormLayout>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Earning Rules */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Earning Rules</Text>
                <Text tone="subdued" as="p">
                  Configure how customers earn points on purchases
                </Text>
                <Divider />
                <FormLayout>
                  <FormLayout.Group>
                    <TextField
                      type="number"
                      label="Points per $1 spent"
                      value={pointsPerDollar}
                      onChange={setPointsPerDollar}
                      min={1}
                      max={1000}
                      autoComplete="off"
                      helpText="Base earning rate before tier multipliers"
                    />
                    <Select
                      label="Rounding Mode"
                      options={roundingOptions}
                      value={roundingMode}
                      onChange={(v) => setRoundingMode(v as PointsRoundingMode)}
                      helpText="How to handle fractional points"
                    />
                  </FormLayout.Group>
                </FormLayout>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Expiration Settings */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Expiration Settings</Text>
                <Divider />
                <Checkbox
                  label="Points expire"
                  checked={pointsExpire}
                  onChange={setPointsExpire}
                  helpText="Enable to have points expire after a certain period"
                />
                {pointsExpire && (
                  <FormLayout>
                    <FormLayout.Group>
                      <TextField
                        type="number"
                        label="Days until expiration"
                        value={expirationDays}
                        onChange={setExpirationDays}
                        min={30}
                        max={730}
                        autoComplete="off"
                      />
                      <TextField
                        type="number"
                        label="Warning days before expiry"
                        value={expirationWarningDays}
                        onChange={setExpirationWarningDays}
                        min={1}
                        max={90}
                        autoComplete="off"
                        helpText="Send reminder this many days before expiration"
                      />
                    </FormLayout.Group>
                  </FormLayout>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Feature Toggles */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Feature Toggles</Text>
                <Text tone="subdued" as="p">
                  Enable or disable individual features
                </Text>
                <Divider />
                <BlockStack gap="300">
                  <Checkbox
                    label="Raffles"
                    helpText="Allow customers to enter raffles for prizes"
                    checked={rafflesEnabled}
                    onChange={setRafflesEnabled}
                  />
                  <Checkbox
                    label="Mystery Boxes"
                    helpText="Offer mystery box rewards with tiered prizes"
                    checked={mysteryBoxesEnabled}
                    onChange={setMysteryBoxesEnabled}
                  />
                  <Checkbox
                    label="Spin Wheel"
                    helpText="Daily and premium spin wheel for rewards"
                    checked={spinWheelEnabled}
                    onChange={setSpinWheelEnabled}
                  />
                  <Checkbox
                    label="Challenges"
                    helpText="Create challenges for bonus points"
                    checked={challengesEnabled}
                    onChange={setChallengesEnabled}
                  />
                  <Checkbox
                    label="Scratch Cards"
                    helpText="Instant-win scratch card rewards"
                    checked={scratchCardsEnabled}
                    onChange={setScratchCardsEnabled}
                  />
                  <Checkbox
                    label="Giveback Pools"
                    helpText="Let customers donate points to charity"
                    checked={givebackPoolsEnabled}
                    onChange={setGivebackPoolsEnabled}
                  />
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Spin Wheel Settings */}
          {spinWheelEnabled && (
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">Spin Wheel Settings</Text>
                  <Divider />
                  <Checkbox
                    label="Enable free daily spin"
                    checked={dailySpinEnabled}
                    onChange={setDailySpinEnabled}
                  />
                  <FormLayout>
                    <FormLayout.Group>
                      <Select
                        label="Daily reset hour"
                        options={hourOptions}
                        value={dailySpinResetHour}
                        onChange={setDailySpinResetHour}
                        helpText="When the daily spin resets (in shop timezone)"
                      />
                      <TextField
                        type="number"
                        label="Premium spin cost"
                        value={premiumSpinCost}
                        onChange={setPremiumSpinCost}
                        min={0}
                        autoComplete="off"
                        suffix={currencyNamePlural.toLowerCase()}
                        helpText="Cost for additional spins"
                      />
                    </FormLayout.Group>
                  </FormLayout>
                </BlockStack>
              </Card>
            </Layout.Section>
          )}

          {/* Streak Bonus Settings */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Streak Bonus</Text>
                <Divider />
                <Checkbox
                  label="Enable streak bonus"
                  helpText="Reward customers for consecutive daily visits"
                  checked={streakBonusEnabled}
                  onChange={setStreakBonusEnabled}
                />
                {streakBonusEnabled && (
                  <TextField
                    type="number"
                    label="Bonus multiplier per day"
                    value={streakBonusMultiplier}
                    onChange={setStreakBonusMultiplier}
                    min={0.01}
                    max={1}
                    step={0.01}
                    autoComplete="off"
                    helpText="e.g., 0.1 = +10% bonus per streak day"
                  />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Tier Multipliers */}
          {tiers.length > 0 && (
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">Tier Multipliers</Text>
                  <Text tone="subdued" as="p">
                    Configure tier-specific bonuses for the points system.
                    Edit multipliers on the Tiers page.
                  </Text>
                  <Divider />
                  <BlockStack gap="300">
                    {tiers.map((tier) => (
                      <InlineStack key={tier.id} gap="400" align="space-between" wrap>
                        <Text variant="bodyMd" fontWeight="semibold" as="span">
                          {tier.name}
                        </Text>
                        <InlineStack gap="400">
                          <Text as="span" variant="bodySm">
                            Points: {tier.pointsMultiplier ?? 1}x
                          </Text>
                          <Text as="span" variant="bodySm">
                            Luck: +{tier.pointsLuckBonus ?? 0}%
                          </Text>
                          <Text as="span" variant="bodySm">
                            Raffle: {tier.raffleEntryMultiplier ?? 1}x
                          </Text>
                        </InlineStack>
                      </InlineStack>
                    ))}
                  </BlockStack>
                  <Button url="/app/tiers" variant="plain">
                    Edit tier multipliers
                  </Button>
                </BlockStack>
              </Card>
            </Layout.Section>
          )}
        </Layout>

        {toastActive && (
          <Toast
            content={toastMessage}
            onDismiss={dismissToast}
            error={toastError}
          />
        )}
      </Page>
    </Frame>
  );
}
