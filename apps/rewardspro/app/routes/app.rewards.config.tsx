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
import { FeatureTogglesList } from "~/components/DesignSystem/FeatureToggleCard";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getPointsConfig, updatePointsConfig } from "../services/points-config.server";
import { syncPointsConfigMetafield } from "../services/points-metafield-sync.server";
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
    console.log(`${LOG_PREFIX} db exists: ${!!db}, prisma.tier exists: ${!!db?.tier}`);

    console.log(`${LOG_PREFIX} Fetching config and tiers in parallel...`);
    const [config, tiers] = await Promise.all([
      getPointsConfig(shop),
      prisma.tier.findMany({
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
      console.error(`${LOG_PREFIX} Error message:`, error instanceof Error ? error.message : String(error));
      console.error(`${LOG_PREFIX} Error stack:`, error instanceof Error ? error.stack : 'No stack');
    }
    throw error;
  }
};

// ============================================
// ACTION
// ============================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
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

      // Sync points config to shop metafields for theme access
      // This allows theme blocks to read feature flags without API calls
      const syncResult = await syncPointsConfigMetafield(admin, shop);
      if (!syncResult.success) {
        console.warn("[PointsConfig] Metafield sync warning:", syncResult.error);
        // Don't fail the save - metafield sync is non-critical
      }

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

      await prisma.tier.update({
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
    isEnabled, currencyName, currencyNamePlural, iconValue,
    pointsExpire, expirationDays, expirationWarningDays,
    rafflesEnabled, mysteryBoxesEnabled, spinWheelEnabled, challengesEnabled,
    scratchCardsEnabled, givebackPoolsEnabled, dailySpinEnabled, dailySpinResetHour,
    premiumSpinCost, streakBonusEnabled, streakBonusMultiplier, submit
  ]);

  const dismissToast = useCallback(() => setToastActive(false), []);

  const hourOptions = Array.from({ length: 24 }, (_, i) => ({
    label: `${i.toString().padStart(2, "0")}:00`,
    value: i.toString(),
  }));

  return (
    <Frame>
      <Page
        title="Points Configuration"
        backAction={{ content: "Rewards", url: "/app/rewards" }}
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
                    {`${[rafflesEnabled, mysteryBoxesEnabled, spinWheelEnabled, challengesEnabled, scratchCardsEnabled, givebackPoolsEnabled].filter(Boolean).length}/6 Active`}
                  </Badge>
                </InlineStack>
                <Text tone="subdued" as="p">
                  Enable or disable individual engagement features
                </Text>
                <Divider />
                <FeatureTogglesList
                  toggles={[
                    {
                      id: 'raffles',
                      icon: GiftCardIcon,
                      title: 'Raffles',
                      description: 'Allow customers to enter raffles for prizes',
                      enabled: rafflesEnabled,
                      onChange: setRafflesEnabled,
                    },
                    {
                      id: 'mysteryBoxes',
                      icon: ConfettiIcon,
                      title: 'Mystery Boxes',
                      description: 'Offer mystery box rewards with tiered prizes',
                      enabled: mysteryBoxesEnabled,
                      onChange: setMysteryBoxesEnabled,
                    },
                    {
                      id: 'spinWheel',
                      icon: PlayIcon,
                      title: 'Spin Wheel',
                      description: 'Daily and premium spin wheel for rewards',
                      enabled: spinWheelEnabled,
                      onChange: setSpinWheelEnabled,
                    },
                    {
                      id: 'challenges',
                      icon: TargetIcon,
                      title: 'Challenges',
                      description: 'Create challenges for bonus points',
                      enabled: challengesEnabled,
                      onChange: setChallengesEnabled,
                    },
                    {
                      id: 'scratchCards',
                      icon: StarIcon,
                      title: 'Scratch Cards',
                      description: 'Instant-win scratch card rewards',
                      enabled: scratchCardsEnabled,
                      onChange: setScratchCardsEnabled,
                    },
                    {
                      id: 'givebackPools',
                      icon: HeartIcon,
                      title: 'Giveback Pools',
                      description: 'Let customers donate points to charity',
                      enabled: givebackPoolsEnabled,
                      onChange: setGivebackPoolsEnabled,
                    },
                  ]}
                />
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
