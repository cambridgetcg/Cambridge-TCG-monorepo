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
  Select,
  Banner,
  InlineStack,
  BlockStack,
  Text,
  Badge,
  Box,
  Modal,
  FormLayout,
  Divider,
  Toast,
  Frame,
  Icon,
  EmptyState,
} from "@shopify/polaris";
import {
  GiftCardIcon,
  PlusIcon,
  EditIcon,
  ConfettiIcon,
} from "~/utils/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { formatCurrency } from "../utils/currency";
import { getTierStyle } from "../utils/tier-styles";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface Tier {
  id: string;
  name: string;
  cashbackPercent: number;
  minSpend: number;
}

interface TierGiftCardSettings {
  id: string;
  tierId: string;
  templateSuffix: string | null;
  bonusPercent: number;
  canBundleWithCard: boolean;
  bundlePrice: number | null;
}

interface GiftCardBundle {
  id: string;
  name: string;
  tierId: string | null;
  tierName: string | null;
  bundleType: string;
  giftCardValue: number;
  membershipDuration: string | null;
  price: number;
  isActive: boolean;
}

interface GiftCardConfig {
  id: string;
  enableTierBranding: boolean;
  enableTierBonuses: boolean;
  enableMembershipGifts: boolean;
  defaultTemplateSuffix: string | null;
}

interface LoaderData {
  config: GiftCardConfig | null;
  tiers: Tier[];
  tierSettings: Record<string, TierGiftCardSettings>;
  bundles: GiftCardBundle[];
  shopSettings: {
    storeCurrency: string;
    currencyDisplayType: string;
  } | null;
}

// ============================================
// LOADER
// ============================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Fetch all data in parallel
  const [config, tiers, tierSettingsArray, bundlesRaw, shopSettings] = await Promise.all([
    db.giftCardConfig.findUnique({ where: { shop } }),
    db.tier.findMany({
      where: { shop },
      orderBy: { minSpend: "asc" },
    }),
    db.tierGiftCardSettings.findMany({ where: { shop } }),
    db.giftCardBundle.findMany({
      where: { shop },
      include: { tier: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.shopSettings.findUnique({ where: { shop } }),
  ]);

  // Convert tier settings array to lookup map
  const tierSettings: Record<string, TierGiftCardSettings> = {};
  for (const setting of tierSettingsArray) {
    tierSettings[setting.tierId] = {
      id: setting.id,
      tierId: setting.tierId,
      templateSuffix: setting.templateSuffix,
      bonusPercent: Number(setting.bonusPercent) || 0,
      canBundleWithCard: setting.canBundleWithCard,
      bundlePrice: setting.bundlePrice ? Number(setting.bundlePrice) : null,
    };
  }

  // Transform bundles
  const bundles: GiftCardBundle[] = bundlesRaw.map((b) => ({
    id: b.id,
    name: b.name,
    tierId: b.tierId,
    tierName: b.tier?.name || null,
    bundleType: b.bundleType,
    giftCardValue: Number(b.giftCardValue),
    membershipDuration: b.membershipDuration,
    price: Number(b.price),
    isActive: b.isActive,
  }));

  return json<LoaderData>({
    config: config
      ? {
          id: config.id,
          enableTierBranding: config.enableTierBranding,
          enableTierBonuses: config.enableTierBonuses,
          enableMembershipGifts: config.enableMembershipGifts,
          defaultTemplateSuffix: config.defaultTemplateSuffix,
        }
      : null,
    tiers: tiers.map((t) => ({
      id: t.id,
      name: t.name,
      cashbackPercent: t.cashbackPercent ?? 0,
      minSpend: t.minSpend ?? 0,
    })),
    tierSettings,
    bundles,
    shopSettings: shopSettings
      ? {
          storeCurrency: shopSettings.storeCurrency,
          currencyDisplayType: shopSettings.currencyDisplayType,
        }
      : null,
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

  // ---- SAVE CONFIG ----
  if (intent === "saveConfig") {
    const enableTierBranding = formData.get("enableTierBranding") === "true";
    const enableTierBonuses = formData.get("enableTierBonuses") === "true";
    const enableMembershipGifts = formData.get("enableMembershipGifts") === "true";
    const defaultTemplateSuffix = (formData.get("defaultTemplateSuffix") as string) || null;

    await db.giftCardConfig.upsert({
      where: { shop },
      update: {
        enableTierBranding,
        enableTierBonuses,
        enableMembershipGifts,
        defaultTemplateSuffix,
      },
      create: {
        shop,
        enableTierBranding,
        enableTierBonuses,
        enableMembershipGifts,
        defaultTemplateSuffix,
      },
    });

    return json({ success: true, message: "Settings saved successfully" });
  }

  // ---- SAVE TIER SETTINGS ----
  if (intent === "saveTierSettings") {
    const tierId = formData.get("tierId") as string;
    const templateSuffix = (formData.get("templateSuffix") as string) || null;
    const bonusPercent = Number(formData.get("bonusPercent")) || 0;
    const canBundleWithCard = formData.get("canBundleWithCard") === "true";

    // Validate tier belongs to shop
    const tier = await db.tier.findFirst({ where: { id: tierId, shop } });
    if (!tier) {
      return json({ error: "Tier not found" }, { status: 404 });
    }

    // Validate bonus percent
    if (bonusPercent < 0 || bonusPercent > 100) {
      return json({ error: "Bonus must be between 0 and 100" }, { status: 400 });
    }

    await db.tierGiftCardSettings.upsert({
      where: { tierId },
      update: {
        templateSuffix,
        bonusPercent,
        canBundleWithCard,
      },
      create: {
        shop,
        tierId,
        templateSuffix,
        bonusPercent,
        canBundleWithCard,
      },
    });

    return json({ success: true, message: `${tier.name} settings saved` });
  }

  // ---- CREATE BUNDLE ----
  if (intent === "createBundle") {
    const name = formData.get("name") as string;
    const tierId = formData.get("tierId") as string;
    const bundleType = formData.get("bundleType") as string;
    const giftCardValue = Number(formData.get("giftCardValue")) || 0;
    const membershipDuration = formData.get("membershipDuration") as string;
    const price = Number(formData.get("price")) || 0;

    // Validate inputs
    if (!name || name.trim().length === 0) {
      return json({ error: "Bundle name is required" }, { status: 400 });
    }
    if (!tierId) {
      return json({ error: "Tier is required" }, { status: 400 });
    }
    if (price <= 0) {
      return json({ error: "Price must be greater than 0" }, { status: 400 });
    }

    // Validate tier belongs to shop
    const tier = await db.tier.findFirst({ where: { id: tierId, shop } });
    if (!tier) {
      return json({ error: "Tier not found" }, { status: 404 });
    }

    await db.giftCardBundle.create({
      data: {
        shop,
        name: name.trim(),
        tierId,
        bundleType: bundleType as "VALUE_ONLY" | "MEMBERSHIP_ONLY" | "VALUE_PLUS_MEMBERSHIP",
        giftCardValue,
        membershipDuration: membershipDuration || null,
        price,
        isActive: true,
      },
    });

    return json({ success: true, message: "Bundle created successfully" });
  }

  // ---- UPDATE BUNDLE ----
  if (intent === "updateBundle") {
    const id = formData.get("id") as string;
    const name = formData.get("name") as string;
    const bundleType = formData.get("bundleType") as string;
    const giftCardValue = Number(formData.get("giftCardValue")) || 0;
    const membershipDuration = formData.get("membershipDuration") as string;
    const price = Number(formData.get("price")) || 0;
    const isActive = formData.get("isActive") === "true";

    // Validate bundle belongs to shop
    const bundle = await db.giftCardBundle.findFirst({ where: { id, shop } });
    if (!bundle) {
      return json({ error: "Bundle not found" }, { status: 404 });
    }

    await db.giftCardBundle.update({
      where: { id },
      data: {
        name: name.trim(),
        bundleType: bundleType as "VALUE_ONLY" | "MEMBERSHIP_ONLY" | "VALUE_PLUS_MEMBERSHIP",
        giftCardValue,
        membershipDuration: membershipDuration || null,
        price,
        isActive,
      },
    });

    return json({ success: true, message: "Bundle updated successfully" });
  }

  // ---- DELETE BUNDLE ----
  if (intent === "deleteBundle") {
    const id = formData.get("id") as string;

    // Validate bundle belongs to shop
    const bundle = await db.giftCardBundle.findFirst({ where: { id, shop } });
    if (!bundle) {
      return json({ error: "Bundle not found" }, { status: 404 });
    }

    await db.giftCardBundle.delete({ where: { id } });

    return json({ success: true, message: "Bundle deleted" });
  }

  return json({ error: "Unknown action" }, { status: 400 });
};

// ============================================
// COMPONENT
// ============================================

export default function GiftCardsConfigPage() {
  const { config, tiers, tierSettings, bundles, shopSettings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const isSubmitting = navigation.state === "submitting";
  const currency = shopSettings?.storeCurrency || "USD";

  // Toast state
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastError, setToastError] = useState(false);

  // Config state
  const [enableTierBranding, setEnableTierBranding] = useState(config?.enableTierBranding ?? true);
  const [enableTierBonuses, setEnableTierBonuses] = useState(config?.enableTierBonuses ?? false);
  const [enableMembershipGifts, setEnableMembershipGifts] = useState(
    config?.enableMembershipGifts ?? true
  );
  const [defaultTemplateSuffix, setDefaultTemplateSuffix] = useState(
    config?.defaultTemplateSuffix || ""
  );

  // Tier settings modal
  const [tierModalActive, setTierModalActive] = useState(false);
  const [editingTier, setEditingTier] = useState<Tier | null>(null);
  const [tierTemplateValue, setTierTemplateValue] = useState("");
  const [tierBonusValue, setTierBonusValue] = useState("0");
  const [tierCanBundle, setTierCanBundle] = useState(true);

  // Bundle modal
  const [bundleModalActive, setBundleModalActive] = useState(false);
  const [editingBundle, setEditingBundle] = useState<GiftCardBundle | null>(null);
  const [bundleName, setBundleName] = useState("");
  const [bundleTierId, setBundleTierId] = useState("");
  const [bundleType, setBundleType] = useState("VALUE_PLUS_MEMBERSHIP");
  const [bundleGiftCardValue, setBundleGiftCardValue] = useState("50");
  const [bundleMembershipDuration, setBundleMembershipDuration] = useState("MONTHLY");
  const [bundlePrice, setBundlePrice] = useState("99");
  const [bundleIsActive, setBundleIsActive] = useState(true);

  // Handle action responses
  useEffect(() => {
    if (actionData) {
      if ("success" in actionData && actionData.success) {
        setToastMessage(actionData.message || "Success");
        setToastError(false);
        setTierModalActive(false);
        setBundleModalActive(false);
      } else if ("error" in actionData) {
        setToastMessage(actionData.error || "An error occurred");
        setToastError(true);
      }
      setToastActive(true);
    }
  }, [actionData]);

  // Save configuration
  const handleSaveConfig = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "saveConfig");
    formData.append("enableTierBranding", enableTierBranding.toString());
    formData.append("enableTierBonuses", enableTierBonuses.toString());
    formData.append("enableMembershipGifts", enableMembershipGifts.toString());
    formData.append("defaultTemplateSuffix", defaultTemplateSuffix);
    submit(formData, { method: "post" });
  }, [enableTierBranding, enableTierBonuses, enableMembershipGifts, defaultTemplateSuffix, submit]);

  // Open tier settings modal
  const openTierModal = useCallback(
    (tier: Tier) => {
      setEditingTier(tier);
      const settings = tierSettings[tier.id];
      setTierTemplateValue(settings?.templateSuffix || "");
      setTierBonusValue(String(settings?.bonusPercent || 0));
      setTierCanBundle(settings?.canBundleWithCard ?? true);
      setTierModalActive(true);
    },
    [tierSettings]
  );

  // Save tier settings
  const handleSaveTierSettings = useCallback(() => {
    if (!editingTier) return;
    const formData = new FormData();
    formData.append("intent", "saveTierSettings");
    formData.append("tierId", editingTier.id);
    formData.append("templateSuffix", tierTemplateValue);
    formData.append("bonusPercent", tierBonusValue);
    formData.append("canBundleWithCard", tierCanBundle.toString());
    submit(formData, { method: "post" });
  }, [editingTier, tierTemplateValue, tierBonusValue, tierCanBundle, submit]);

  // Open bundle modal
  const openCreateBundleModal = useCallback(() => {
    setEditingBundle(null);
    setBundleName("");
    setBundleTierId(tiers[0]?.id || "");
    setBundleType("VALUE_PLUS_MEMBERSHIP");
    setBundleGiftCardValue("50");
    setBundleMembershipDuration("MONTHLY");
    setBundlePrice("99");
    setBundleIsActive(true);
    setBundleModalActive(true);
  }, [tiers]);

  const openEditBundleModal = useCallback((bundle: GiftCardBundle) => {
    setEditingBundle(bundle);
    setBundleName(bundle.name);
    setBundleTierId(bundle.tierId || "");
    setBundleType(bundle.bundleType);
    setBundleGiftCardValue(String(bundle.giftCardValue));
    setBundleMembershipDuration(bundle.membershipDuration || "MONTHLY");
    setBundlePrice(String(bundle.price));
    setBundleIsActive(bundle.isActive);
    setBundleModalActive(true);
  }, []);

  // Save bundle
  const handleSaveBundle = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", editingBundle ? "updateBundle" : "createBundle");
    if (editingBundle) {
      formData.append("id", editingBundle.id);
    }
    formData.append("name", bundleName);
    formData.append("tierId", bundleTierId);
    formData.append("bundleType", bundleType);
    formData.append("giftCardValue", bundleGiftCardValue);
    formData.append("membershipDuration", bundleMembershipDuration);
    formData.append("price", bundlePrice);
    formData.append("isActive", bundleIsActive.toString());
    submit(formData, { method: "post" });
  }, [
    editingBundle,
    bundleName,
    bundleTierId,
    bundleType,
    bundleGiftCardValue,
    bundleMembershipDuration,
    bundlePrice,
    bundleIsActive,
    submit,
  ]);

  // Delete bundle
  const handleDeleteBundle = useCallback(
    (id: string) => {
      if (!confirm("Are you sure you want to delete this bundle?")) return;
      const formData = new FormData();
      formData.append("intent", "deleteBundle");
      formData.append("id", id);
      submit(formData, { method: "post" });
    },
    [submit]
  );

  // No tiers setup
  if (tiers.length === 0) {
    return (
      <Frame>
        <Page title="Gift Cards">
          <Layout>
            <Layout.Section>
              <Card>
                <EmptyState
                  heading="Set up tiers first"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  action={{
                    content: "Create Tiers",
                    url: "/app/members/tiers",
                  }}
                >
                  <p>
                    Gift card tier integration requires at least one tier to be configured. Create
                    your membership tiers first, then return here to set up tier-branded gift cards.
                  </p>
                </EmptyState>
              </Card>
            </Layout.Section>
          </Layout>
        </Page>
      </Frame>
    );
  }

  const bundleTypeOptions = [
    { label: "Value + Membership", value: "VALUE_PLUS_MEMBERSHIP" },
    { label: "Membership Only", value: "MEMBERSHIP_ONLY" },
    { label: "Value Only", value: "VALUE_ONLY" },
  ];

  const durationOptions = [
    { label: "1 Month", value: "MONTHLY" },
    { label: "3 Months", value: "QUARTERLY" },
    { label: "1 Year", value: "ANNUAL" },
    { label: "Lifetime", value: "LIFETIME" },
  ];

  const tierOptions = tiers.map((t) => ({ label: t.name, value: t.id }));

  return (
    <Frame>
      <Page
        title="Gift Cards"
        subtitle="Configure tier-branded gift cards and membership bundles"
        primaryAction={{
          content: "Save Settings",
          onAction: handleSaveConfig,
          loading: isSubmitting,
        }}
      >
        <Layout>
          {/* Feature Toggles */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Gift Card Features
                </Text>
                <Text tone="subdued" as="p">
                  Enable the gift card features you want to offer your customers.
                </Text>
                <Divider />

                {/* Tier Branding Toggle */}
                <FeatureToggle
                  icon={GiftCardIcon}
                  title="Tier-Branded Gift Cards"
                  description="Gift cards display the purchaser's tier design (Gold, Platinum, etc.)"
                  enabled={enableTierBranding}
                  onToggle={() => setEnableTierBranding(!enableTierBranding)}
                />

                {/* Tier Bonuses Toggle */}
                <FeatureToggle
                  icon={ConfettiIcon}
                  title="Tier Purchase Bonuses"
                  description="Higher tier members get bonus value when buying gift cards"
                  enabled={enableTierBonuses}
                  onToggle={() => setEnableTierBonuses(!enableTierBonuses)}
                />

                {/* Membership Gifts Toggle */}
                <FeatureToggle
                  icon={GiftCardIcon}
                  title="Membership Gift Cards"
                  description="Allow customers to gift tier memberships with gift cards"
                  enabled={enableMembershipGifts}
                  onToggle={() => setEnableMembershipGifts(!enableMembershipGifts)}
                />
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Per-Tier Settings */}
          {enableTierBranding && (
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <BlockStack gap="100">
                      <Text variant="headingMd" as="h2">
                        Tier Gift Card Settings
                      </Text>
                      <Text tone="subdued" as="p">
                        Configure branding and bonuses for each tier.
                      </Text>
                    </BlockStack>
                  </InlineStack>
                  <Divider />

                  {tiers.map((tier) => {
                    const settings = tierSettings[tier.id];
                    const tierStyle = getTierStyle(tier.name);

                    return (
                      <div
                        key={tier.id}
                        style={{
                          padding: "12px 16px",
                          backgroundColor: "#fafafa",
                          borderRadius: "8px",
                          border: "1px solid #e1e3e5",
                        }}
                      >
                        <InlineStack align="space-between" blockAlign="center">
                          <InlineStack gap="300" blockAlign="center">
                            <div
                              style={{
                                width: "40px",
                                height: "40px",
                                borderRadius: "8px",
                                backgroundColor: tierStyle.backgroundColor,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Icon source={GiftCardIcon} tone="base" />
                            </div>
                            <BlockStack gap="050">
                              <Text variant="bodyMd" fontWeight="semibold" as="span">
                                {tier.name}
                              </Text>
                              <Text variant="bodySm" tone="subdued" as="span">
                                {settings?.templateSuffix
                                  ? `Template: gift_card.${settings.templateSuffix}.liquid`
                                  : "Using default template"}
                                {enableTierBonuses && settings?.bonusPercent
                                  ? ` • +${settings.bonusPercent}% bonus`
                                  : ""}
                              </Text>
                            </BlockStack>
                          </InlineStack>

                          <Button
                            variant="plain"
                            icon={EditIcon}
                            onClick={() => openTierModal(tier)}
                          >
                            Configure
                          </Button>
                        </InlineStack>
                      </div>
                    );
                  })}
                </BlockStack>
              </Card>
            </Layout.Section>
          )}

          {/* Membership Bundles */}
          {enableMembershipGifts && (
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <BlockStack gap="100">
                      <Text variant="headingMd" as="h2">
                        Membership Gift Bundles
                      </Text>
                      <Text tone="subdued" as="p">
                        Pre-configured gift cards that include tier memberships.
                      </Text>
                    </BlockStack>
                    <Button icon={PlusIcon} onClick={openCreateBundleModal}>
                      Create Bundle
                    </Button>
                  </InlineStack>
                  <Divider />

                  {bundles.length === 0 ? (
                    <Box padding="400">
                      <BlockStack gap="200" inlineAlign="center">
                        <Text tone="subdued" as="p">
                          No bundles created yet. Create your first membership gift bundle.
                        </Text>
                        <Button onClick={openCreateBundleModal}>Create Bundle</Button>
                      </BlockStack>
                    </Box>
                  ) : (
                    bundles.map((bundle) => (
                      <div
                        key={bundle.id}
                        style={{
                          padding: "12px 16px",
                          backgroundColor: bundle.isActive ? "#fafafa" : "#f1f1f1",
                          borderRadius: "8px",
                          border: "1px solid #e1e3e5",
                        }}
                      >
                        <InlineStack align="space-between" blockAlign="center">
                          <BlockStack gap="100">
                            <InlineStack gap="200" blockAlign="center">
                              <Text variant="bodyMd" fontWeight="semibold" as="span">
                                {bundle.name}
                              </Text>
                              <Badge tone={bundle.isActive ? "success" : undefined}>
                                {bundle.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </InlineStack>
                            <Text variant="bodySm" tone="subdued" as="span">
                              {bundle.tierName || "No Tier"} •{" "}
                              {bundle.bundleType === "VALUE_PLUS_MEMBERSHIP"
                                ? `${formatCurrency(bundle.giftCardValue, { storeCurrency: currency })} + Membership`
                                : bundle.bundleType === "MEMBERSHIP_ONLY"
                                  ? "Membership Only"
                                  : `${formatCurrency(bundle.giftCardValue, { storeCurrency: currency })} Value`}{" "}
                              •{" "}
                              {bundle.membershipDuration === "MONTHLY"
                                ? "1 Month"
                                : bundle.membershipDuration === "QUARTERLY"
                                  ? "3 Months"
                                  : bundle.membershipDuration === "ANNUAL"
                                    ? "1 Year"
                                    : "Lifetime"}
                            </Text>
                          </BlockStack>

                          <InlineStack gap="200" blockAlign="center">
                            <Text variant="bodyMd" fontWeight="semibold" as="span">
                              {formatCurrency(bundle.price, { storeCurrency: currency })}
                            </Text>
                            <Button
                              variant="plain"
                              icon={EditIcon}
                              onClick={() => openEditBundleModal(bundle)}
                            />
                          </InlineStack>
                        </InlineStack>
                      </div>
                    ))
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>
          )}

          {/* Info Banner */}
          <Layout.Section>
            <Banner tone="info">
              <p>
                <strong>Theme Templates:</strong> To use tier-branded gift cards, create Liquid
                templates in your theme at <code>templates/gift_card.[tier].liquid</code> (e.g.,{" "}
                <code>gift_card.gold.liquid</code>). The template suffix configured here will be
                passed to Shopify when creating gift cards.
              </p>
            </Banner>
          </Layout.Section>
        </Layout>

        {/* Tier Settings Modal */}
        <Modal
          open={tierModalActive}
          onClose={() => setTierModalActive(false)}
          title={`${editingTier?.name} Gift Card Settings`}
          primaryAction={{
            content: "Save",
            onAction: handleSaveTierSettings,
            loading: isSubmitting,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setTierModalActive(false),
            },
          ]}
        >
          <Modal.Section>
            <FormLayout>
              <TextField
                label="Template Suffix"
                value={tierTemplateValue}
                onChange={setTierTemplateValue}
                placeholder="gold"
                helpText={
                  tierTemplateValue
                    ? `Uses template: gift_card.${tierTemplateValue}.liquid`
                    : "Leave empty to use default gift card template"
                }
                autoComplete="off"
              />

              {enableTierBonuses && (
                <TextField
                  label="Bonus Percent"
                  type="number"
                  value={tierBonusValue}
                  onChange={setTierBonusValue}
                  suffix="%"
                  helpText={`${editingTier?.name} members get ${tierBonusValue}% extra value when purchasing gift cards`}
                  autoComplete="off"
                />
              )}

              <Select
                label="Allow Membership Bundling"
                options={[
                  { label: "Yes - Can bundle with gift cards", value: "true" },
                  { label: "No - Cannot be gifted", value: "false" },
                ]}
                value={tierCanBundle ? "true" : "false"}
                onChange={(v) => setTierCanBundle(v === "true")}
                helpText="Whether this tier can be included in membership gift bundles"
              />
            </FormLayout>
          </Modal.Section>
        </Modal>

        {/* Bundle Modal */}
        <Modal
          open={bundleModalActive}
          onClose={() => setBundleModalActive(false)}
          title={editingBundle ? "Edit Bundle" : "Create Membership Bundle"}
          primaryAction={{
            content: "Save",
            onAction: handleSaveBundle,
            loading: isSubmitting,
          }}
          secondaryActions={
            editingBundle
              ? [
                  {
                    content: "Delete",
                    destructive: true,
                    onAction: () => {
                      setBundleModalActive(false);
                      handleDeleteBundle(editingBundle.id);
                    },
                  },
                  {
                    content: "Cancel",
                    onAction: () => setBundleModalActive(false),
                  },
                ]
              : [
                  {
                    content: "Cancel",
                    onAction: () => setBundleModalActive(false),
                  },
                ]
          }
        >
          <Modal.Section>
            <FormLayout>
              <TextField
                label="Bundle Name"
                value={bundleName}
                onChange={setBundleName}
                placeholder="Gold 3-Month Gift"
                autoComplete="off"
              />

              <Select
                label="Tier"
                options={tierOptions}
                value={bundleTierId}
                onChange={setBundleTierId}
                disabled={!!editingBundle}
                helpText={editingBundle ? "Tier cannot be changed after creation" : ""}
              />

              <Select
                label="Bundle Type"
                options={bundleTypeOptions}
                value={bundleType}
                onChange={setBundleType}
              />

              {bundleType !== "MEMBERSHIP_ONLY" && (
                <TextField
                  label="Gift Card Value"
                  type="number"
                  value={bundleGiftCardValue}
                  onChange={setBundleGiftCardValue}
                  prefix={currency}
                  autoComplete="off"
                />
              )}

              {bundleType !== "VALUE_ONLY" && (
                <Select
                  label="Membership Duration"
                  options={durationOptions}
                  value={bundleMembershipDuration}
                  onChange={setBundleMembershipDuration}
                />
              )}

              <TextField
                label="Price"
                type="number"
                value={bundlePrice}
                onChange={setBundlePrice}
                prefix={currency}
                helpText="The price customers pay for this bundle"
                autoComplete="off"
              />

              {editingBundle && (
                <Select
                  label="Status"
                  options={[
                    { label: "Active", value: "true" },
                    { label: "Inactive", value: "false" },
                  ]}
                  value={bundleIsActive ? "true" : "false"}
                  onChange={(v) => setBundleIsActive(v === "true")}
                />
              )}
            </FormLayout>
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

// ============================================
// FEATURE TOGGLE COMPONENT
// ============================================

function FeatureToggle({
  icon,
  title,
  description,
  enabled,
  onToggle,
}: {
  icon: React.ComponentType;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      style={{
        padding: "12px 16px",
        backgroundColor: "#fafafa",
        borderRadius: "8px",
        border: "1px solid #e1e3e5",
      }}
    >
      <InlineStack align="space-between" blockAlign="center">
        <InlineStack gap="300" blockAlign="center">
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "8px",
              backgroundColor: enabled ? "#e3f1df" : "#f1f1f1",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon source={icon} tone={enabled ? "success" : "subdued"} />
          </div>
          <BlockStack gap="050">
            <Text variant="bodyMd" fontWeight="semibold" as="span">
              {title}
            </Text>
            <Text variant="bodySm" tone="subdued" as="span">
              {description}
            </Text>
          </BlockStack>
        </InlineStack>

        <InlineStack gap="300" blockAlign="center">
          <Badge tone={enabled ? "success" : undefined}>{enabled ? "Enabled" : "Disabled"}</Badge>
          <button
            type="button"
            onClick={onToggle}
            style={{
              width: "44px",
              height: "24px",
              borderRadius: "12px",
              backgroundColor: enabled ? "#008060" : "#b5b5b5",
              border: "none",
              cursor: "pointer",
              position: "relative",
              transition: "background-color 0.2s",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: "2px",
                left: enabled ? "22px" : "2px",
                width: "20px",
                height: "20px",
                borderRadius: "10px",
                backgroundColor: "#fff",
                transition: "left 0.2s",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }}
            />
          </button>
        </InlineStack>
      </InlineStack>
    </div>
  );
}
