import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData, useFetcher } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
import { useAuthenticatedFetch } from "../components/AuthenticatedFetch";
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
  Badge,
  Icon,
} from "@shopify/polaris";
import {
  GiftCardIcon,
  ConfettiIcon,
  TargetIcon,
  PlayIcon,
  StarIcon,
  HeartIcon,
} from "~/utils/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getPointsConfig, updatePointsConfig } from "../services/points-config.server";
import type { PointsRoundingMode } from "@prisma/client";
import type { CurrencyIconType } from "../services/points-config.server";
import { IconPicker, type IconPickerValue } from "../components/IconPicker";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface LoaderData {
  config: {
    isEnabled: boolean;
    currencyName: string;
    currencyNamePlural: string;
    currencyIcon: string;
    // Enhanced icon system fields - DISABLED until migration applied
    // currencyIconType: CurrencyIconType;
    // currencyIconUrl: string | null;
    // currencyIconId: string | null;
    // currencyIconColor: string | null;
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

const LOG_PREFIX = "[app.rewards.config]";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const startTime = Date.now();
  console.log(`${LOG_PREFIX} Loader starting...`);

  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    console.log(`${LOG_PREFIX} Authenticated for shop: ${shop}`);

    // Verify db models exist
    console.log(`${LOG_PREFIX} db exists: ${!!db}, db.tier exists: ${!!db?.tier}`);

    console.log(`${LOG_PREFIX} Fetching config and tiers in parallel...`);
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

    console.log(`${LOG_PREFIX} Data fetched in ${Date.now() - startTime}ms`);
    console.log(`${LOG_PREFIX} Config loaded, tiers count: ${tiers.length}`);

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
  } catch (error) {
    console.error(`${LOG_PREFIX} LOADER ERROR:`, error);
    console.error(`${LOG_PREFIX} Error message:`, error instanceof Error ? error.message : String(error));
    console.error(`${LOG_PREFIX} Error stack:`, error instanceof Error ? error.stack : 'No stack');
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

  if (intent === "save") {
    try {
      // Parse form data
      const isEnabled = formData.get("isEnabled") === "true";
      const currencyName = formData.get("currencyName") as string;
      const currencyNamePlural = formData.get("currencyNamePlural") as string;
      const currencyIcon = formData.get("currencyIcon") as string;

      // Enhanced icon system fields - DISABLED until migration applied
      // const currencyIconType = (formData.get("currencyIconType") as CurrencyIconType) || "emoji";
      // const currencyIconUrl = formData.get("currencyIconUrl") as string | null;
      // const currencyIconId = formData.get("currencyIconId") as string | null;
      // const currencyIconColor = formData.get("currencyIconColor") as string | null;

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
        // Enhanced icon system fields - DISABLED until migration applied
        // currencyIconType,
        // currencyIconUrl: currencyIconUrl || null,
        // currencyIconId: currencyIconId || null,
        // currencyIconColor: currencyIconColor || null,
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

  // Enhanced icon state - using defaults until migration applied
  const [iconValue, setIconValue] = useState<IconPickerValue>({
    iconType: "emoji", // config.currencyIconType - DISABLED
    iconEmoji: config.currencyIcon,
    iconUrl: null, // config.currencyIconUrl - DISABLED
    iconId: null, // config.currencyIconId - DISABLED
    iconColor: null, // config.currencyIconColor - DISABLED
  });

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

  // File upload
  const [uploadError, setUploadError] = useState<string | null>(null);
  const authFetch = useAuthenticatedFetch();

  const handleIconUpload = useCallback(async (file: File): Promise<string | null> => {
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await authFetch("/api/upload-icon", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        setUploadError(result.error || "Upload failed");
        return null;
      }

      return result.url;
    } catch (error: any) {
      console.error("[PointsConfig] Upload error:", error);
      setUploadError(error.message || "Failed to upload file");
      return null;
    }
  }, [authFetch]);

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

    // Enhanced icon system - only emoji icon enabled until migration applied
    formData.append("currencyIcon", iconValue.iconEmoji);
    // formData.append("currencyIconType", iconValue.iconType);
    // if (iconValue.iconUrl) formData.append("currencyIconUrl", iconValue.iconUrl);
    // if (iconValue.iconId) formData.append("currencyIconId", iconValue.iconId);
    // if (iconValue.iconColor) formData.append("currencyIconColor", iconValue.iconColor);

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
    isEnabled, currencyName, currencyNamePlural, iconValue, pointsPerDollar,
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

  return (
    <Frame>
      <Page
        title="Points Configuration"
        backAction={{ url: "/app/rewards" }}
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
                </FormLayout>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Currency Icon - Enhanced IconPicker */}
          <Layout.Section>
            <IconPicker
              value={iconValue}
              onChange={setIconValue}
              onUpload={handleIconUpload}
              uploadError={uploadError}
            />
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
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h2">Feature Toggles</Text>
                  <Badge tone={[rafflesEnabled, mysteryBoxesEnabled, spinWheelEnabled, challengesEnabled, scratchCardsEnabled, givebackPoolsEnabled].filter(Boolean).length === 6 ? 'success' : 'info'}>
                    {[rafflesEnabled, mysteryBoxesEnabled, spinWheelEnabled, challengesEnabled, scratchCardsEnabled, givebackPoolsEnabled].filter(Boolean).length}/6 Active
                  </Badge>
                </InlineStack>
                <Text tone="subdued" as="p">
                  Enable or disable individual engagement features
                </Text>
                <Divider />
                <BlockStack gap="200">
                  {/* Raffles */}
                  <div style={{
                    padding: '12px 16px',
                    backgroundColor: '#fafafa',
                    borderRadius: '8px',
                    border: '1px solid #e1e3e5'
                  }}>
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="300" blockAlign="center">
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '8px',
                          backgroundColor: rafflesEnabled ? '#e3f1df' : '#f1f1f1',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'background-color 0.15s ease'
                        }}>
                          <Icon source={GiftCardIcon} tone={rafflesEnabled ? 'success' : 'subdued'} />
                        </div>
                        <BlockStack gap="050">
                          <Text variant="bodyMd" fontWeight="semibold" as="span">Raffles</Text>
                          <Text variant="bodySm" tone="subdued" as="span">Allow customers to enter raffles for prizes</Text>
                        </BlockStack>
                      </InlineStack>
                      <InlineStack gap="300" blockAlign="center">
                        <Badge tone={rafflesEnabled ? 'success' : undefined}>
                          {rafflesEnabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                        <div
                          style={{
                            width: '52px',
                            height: '28px',
                            borderRadius: '14px',
                            backgroundColor: rafflesEnabled ? '#008060' : '#8c9196',
                            position: 'relative',
                            cursor: 'pointer',
                            transition: 'background-color 0.15s ease'
                          }}
                          onClick={() => setRafflesEnabled(!rafflesEnabled)}
                        >
                          <div style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            backgroundColor: 'white',
                            position: 'absolute',
                            top: '2px',
                            left: rafflesEnabled ? '26px' : '2px',
                            transition: 'left 0.15s ease',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                          }} />
                        </div>
                      </InlineStack>
                    </InlineStack>
                  </div>

                  {/* Mystery Boxes */}
                  <div style={{
                    padding: '12px 16px',
                    backgroundColor: '#fafafa',
                    borderRadius: '8px',
                    border: '1px solid #e1e3e5'
                  }}>
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="300" blockAlign="center">
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '8px',
                          backgroundColor: mysteryBoxesEnabled ? '#e3f1df' : '#f1f1f1',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'background-color 0.15s ease'
                        }}>
                          <Icon source={ConfettiIcon} tone={mysteryBoxesEnabled ? 'success' : 'subdued'} />
                        </div>
                        <BlockStack gap="050">
                          <Text variant="bodyMd" fontWeight="semibold" as="span">Mystery Boxes</Text>
                          <Text variant="bodySm" tone="subdued" as="span">Offer mystery box rewards with tiered prizes</Text>
                        </BlockStack>
                      </InlineStack>
                      <InlineStack gap="300" blockAlign="center">
                        <Badge tone={mysteryBoxesEnabled ? 'success' : undefined}>
                          {mysteryBoxesEnabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                        <div
                          style={{
                            width: '52px',
                            height: '28px',
                            borderRadius: '14px',
                            backgroundColor: mysteryBoxesEnabled ? '#008060' : '#8c9196',
                            position: 'relative',
                            cursor: 'pointer',
                            transition: 'background-color 0.15s ease'
                          }}
                          onClick={() => setMysteryBoxesEnabled(!mysteryBoxesEnabled)}
                        >
                          <div style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            backgroundColor: 'white',
                            position: 'absolute',
                            top: '2px',
                            left: mysteryBoxesEnabled ? '26px' : '2px',
                            transition: 'left 0.15s ease',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                          }} />
                        </div>
                      </InlineStack>
                    </InlineStack>
                  </div>

                  {/* Spin Wheel */}
                  <div style={{
                    padding: '12px 16px',
                    backgroundColor: '#fafafa',
                    borderRadius: '8px',
                    border: '1px solid #e1e3e5'
                  }}>
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="300" blockAlign="center">
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '8px',
                          backgroundColor: spinWheelEnabled ? '#e3f1df' : '#f1f1f1',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'background-color 0.15s ease'
                        }}>
                          <Icon source={PlayIcon} tone={spinWheelEnabled ? 'success' : 'subdued'} />
                        </div>
                        <BlockStack gap="050">
                          <Text variant="bodyMd" fontWeight="semibold" as="span">Spin Wheel</Text>
                          <Text variant="bodySm" tone="subdued" as="span">Daily and premium spin wheel for rewards</Text>
                        </BlockStack>
                      </InlineStack>
                      <InlineStack gap="300" blockAlign="center">
                        <Badge tone={spinWheelEnabled ? 'success' : undefined}>
                          {spinWheelEnabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                        <div
                          style={{
                            width: '52px',
                            height: '28px',
                            borderRadius: '14px',
                            backgroundColor: spinWheelEnabled ? '#008060' : '#8c9196',
                            position: 'relative',
                            cursor: 'pointer',
                            transition: 'background-color 0.15s ease'
                          }}
                          onClick={() => setSpinWheelEnabled(!spinWheelEnabled)}
                        >
                          <div style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            backgroundColor: 'white',
                            position: 'absolute',
                            top: '2px',
                            left: spinWheelEnabled ? '26px' : '2px',
                            transition: 'left 0.15s ease',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                          }} />
                        </div>
                      </InlineStack>
                    </InlineStack>
                  </div>

                  {/* Challenges */}
                  <div style={{
                    padding: '12px 16px',
                    backgroundColor: '#fafafa',
                    borderRadius: '8px',
                    border: '1px solid #e1e3e5'
                  }}>
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="300" blockAlign="center">
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '8px',
                          backgroundColor: challengesEnabled ? '#e3f1df' : '#f1f1f1',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'background-color 0.15s ease'
                        }}>
                          <Icon source={TargetIcon} tone={challengesEnabled ? 'success' : 'subdued'} />
                        </div>
                        <BlockStack gap="050">
                          <Text variant="bodyMd" fontWeight="semibold" as="span">Challenges</Text>
                          <Text variant="bodySm" tone="subdued" as="span">Create challenges for bonus points</Text>
                        </BlockStack>
                      </InlineStack>
                      <InlineStack gap="300" blockAlign="center">
                        <Badge tone={challengesEnabled ? 'success' : undefined}>
                          {challengesEnabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                        <div
                          style={{
                            width: '52px',
                            height: '28px',
                            borderRadius: '14px',
                            backgroundColor: challengesEnabled ? '#008060' : '#8c9196',
                            position: 'relative',
                            cursor: 'pointer',
                            transition: 'background-color 0.15s ease'
                          }}
                          onClick={() => setChallengesEnabled(!challengesEnabled)}
                        >
                          <div style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            backgroundColor: 'white',
                            position: 'absolute',
                            top: '2px',
                            left: challengesEnabled ? '26px' : '2px',
                            transition: 'left 0.15s ease',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                          }} />
                        </div>
                      </InlineStack>
                    </InlineStack>
                  </div>

                  {/* Scratch Cards */}
                  <div style={{
                    padding: '12px 16px',
                    backgroundColor: '#fafafa',
                    borderRadius: '8px',
                    border: '1px solid #e1e3e5'
                  }}>
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="300" blockAlign="center">
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '8px',
                          backgroundColor: scratchCardsEnabled ? '#e3f1df' : '#f1f1f1',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'background-color 0.15s ease'
                        }}>
                          <Icon source={StarIcon} tone={scratchCardsEnabled ? 'success' : 'subdued'} />
                        </div>
                        <BlockStack gap="050">
                          <Text variant="bodyMd" fontWeight="semibold" as="span">Scratch Cards</Text>
                          <Text variant="bodySm" tone="subdued" as="span">Instant-win scratch card rewards</Text>
                        </BlockStack>
                      </InlineStack>
                      <InlineStack gap="300" blockAlign="center">
                        <Badge tone={scratchCardsEnabled ? 'success' : undefined}>
                          {scratchCardsEnabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                        <div
                          style={{
                            width: '52px',
                            height: '28px',
                            borderRadius: '14px',
                            backgroundColor: scratchCardsEnabled ? '#008060' : '#8c9196',
                            position: 'relative',
                            cursor: 'pointer',
                            transition: 'background-color 0.15s ease'
                          }}
                          onClick={() => setScratchCardsEnabled(!scratchCardsEnabled)}
                        >
                          <div style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            backgroundColor: 'white',
                            position: 'absolute',
                            top: '2px',
                            left: scratchCardsEnabled ? '26px' : '2px',
                            transition: 'left 0.15s ease',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                          }} />
                        </div>
                      </InlineStack>
                    </InlineStack>
                  </div>

                  {/* Giveback Pools */}
                  <div style={{
                    padding: '12px 16px',
                    backgroundColor: '#fafafa',
                    borderRadius: '8px',
                    border: '1px solid #e1e3e5'
                  }}>
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="300" blockAlign="center">
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '8px',
                          backgroundColor: givebackPoolsEnabled ? '#e3f1df' : '#f1f1f1',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'background-color 0.15s ease'
                        }}>
                          <Icon source={HeartIcon} tone={givebackPoolsEnabled ? 'success' : 'subdued'} />
                        </div>
                        <BlockStack gap="050">
                          <Text variant="bodyMd" fontWeight="semibold" as="span">Giveback Pools</Text>
                          <Text variant="bodySm" tone="subdued" as="span">Let customers donate points to charity</Text>
                        </BlockStack>
                      </InlineStack>
                      <InlineStack gap="300" blockAlign="center">
                        <Badge tone={givebackPoolsEnabled ? 'success' : undefined}>
                          {givebackPoolsEnabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                        <div
                          style={{
                            width: '52px',
                            height: '28px',
                            borderRadius: '14px',
                            backgroundColor: givebackPoolsEnabled ? '#008060' : '#8c9196',
                            position: 'relative',
                            cursor: 'pointer',
                            transition: 'background-color 0.15s ease'
                          }}
                          onClick={() => setGivebackPoolsEnabled(!givebackPoolsEnabled)}
                        >
                          <div style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            backgroundColor: 'white',
                            position: 'absolute',
                            top: '2px',
                            left: givebackPoolsEnabled ? '26px' : '2px',
                            transition: 'left 0.15s ease',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                          }} />
                        </div>
                      </InlineStack>
                    </InlineStack>
                  </div>
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
                  <Button url="/app/members/tiers" variant="plain">
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
