/**
 * Klaviyo Integration Settings
 *
 * Allows merchants to:
 * - Connect their Klaviyo account
 * - Select email provider mode (SendGrid, Klaviyo, Hybrid)
 * - Configure automation event triggers
 * - Manage sync settings
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useSearchParams } from "@remix-run/react";
import { useState, useEffect, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  TextField,
  Button,
  Text,
  Select,
  Checkbox,
  Banner,
  Badge,
  Divider,
  Box,
  Frame,
  Toast,
  FormLayout,
  Icon,
  Collapsible,
  List,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  XCircleIcon,
  RefreshIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { KlaviyoService } from "~/services/klaviyo.server";
import type { EmailProvider } from "@prisma/client";

// ============================================
// TYPES
// ============================================

interface LoaderData {
  shop: string;
  emailSettings: {
    emailProvider: EmailProvider;
    klaviyoEnabled: boolean;
    klaviyoApiKey: string | null;
    klaviyoPublicKey: string | null;
    klaviyoDefaultListId: string | null;
    klaviyoSyncProfiles: boolean;
    klaviyoSyncEvents: boolean;
    klaviyoLastSyncAt: Date | null;
    klaviyoSyncStatus: string | null;
    klaviyoOAuthConnected: boolean;
  } | null;
  isOAuthConfigured: boolean;
  automationSettings: {
    automationsEnabled: boolean;
    sendCustomerEnrolled: boolean;
    sendCustomerBirthday: boolean;
    sendCustomerAnniversary: boolean;
    sendOrderPlaced: boolean;
    sendCashbackEarned: boolean;
    sendCashbackRedeemed: boolean;
    sendTierUpgraded: boolean;
    sendTierDowngraded: boolean;
    sendTierUpgradeNear: boolean;
    sendVipAchieved: boolean;
    sendPointsExpiring: boolean;
    sendBalanceReminder: boolean;
    sendWinBack: boolean;
    pointsExpiryWarningDays: number[];
    balanceReminderDays: number;
    winBackTriggerDays: number[];
    tierNudgeThreshold: number;
    expiryReminderCooldownDays: number;
    balanceReminderCooldownDays: number;
    winBackCooldownDays: number;
    tierNudgeCooldownDays: number;
  } | null;
  klaviyoLists: Array<{ id: string; name: string }>;
  profileCount: number;
  eventCount: number;
}

// ============================================
// LOADER
// ============================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    console.log("[Klaviyo] Loader starting for shop:", shop);

    // Check if OAuth is configured
    const { isOAuthConfigured } = await import("~/services/klaviyo-oauth.server");
    const oauthConfigured = isOAuthConfigured();

    // Get email settings
    console.log("[Klaviyo] Fetching email settings...");
    const emailSettings = await db.emailSettings.findUnique({
      where: { shop },
      select: {
        emailProvider: true,
        klaviyoEnabled: true,
        klaviyoApiKey: true,
        klaviyoPublicKey: true,
        klaviyoDefaultListId: true,
        klaviyoSyncProfiles: true,
        klaviyoSyncEvents: true,
        klaviyoLastSyncAt: true,
        klaviyoSyncStatus: true,
        klaviyoOAuthConnected: true,
      },
    });

    // Get automation settings
    console.log("[Klaviyo] Fetching automation settings...");
    let automationSettings = null;
    try {
      automationSettings = await db.klaviyoAutomationSettings.findUnique({
        where: { shop },
      });
    } catch (error) {
      console.error("[Klaviyo] Error fetching automation settings:", error);
      // Continue without automation settings if table doesn't exist
    }

    // Get Klaviyo lists if API key is configured
    let klaviyoLists: Array<{ id: string; name: string }> = [];
    if (emailSettings?.klaviyoApiKey) {
      try {
        const klaviyo = new KlaviyoService({
          apiKey: emailSettings.klaviyoApiKey,
        });
        klaviyoLists = await klaviyo.getLists();
      } catch (error) {
        console.error("[Klaviyo] Failed to fetch Klaviyo lists:", error);
      }
    }

    // Get sync stats - wrap in try-catch since tables may not exist
    console.log("[Klaviyo] Fetching sync stats...");
    let profileCount = 0;
    let eventCount = 0;
    try {
      profileCount = await db.klaviyoProfile.count({ where: { shop } });
    } catch (error) {
      console.error("[Klaviyo] Error fetching profile count:", error);
    }
    try {
      eventCount = await db.klaviyoEvent.count({
        where: { shop, status: "SENT" },
      });
    } catch (error) {
      console.error("[Klaviyo] Error fetching event count:", error);
    }

    console.log("[Klaviyo] Loader completed successfully");
    return Response.json({
      shop,
      emailSettings,
      automationSettings,
      klaviyoLists,
      profileCount,
      eventCount,
      isOAuthConfigured: oauthConfigured,
    });
  } catch (error) {
    console.error("[Klaviyo] Loader error:", error);
    // Return safe defaults so page can still render
    return Response.json({
      shop,
      emailSettings: null,
      automationSettings: null,
      klaviyoLists: [],
      profileCount: 0,
      eventCount: 0,
      isOAuthConfigured: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// ============================================
// ACTION
// ============================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "saveConnection") {
    const emailProvider = formData.get("emailProvider") as EmailProvider;
    const klaviyoApiKey = formData.get("klaviyoApiKey") as string;
    const klaviyoPublicKey = formData.get("klaviyoPublicKey") as string;
    const klaviyoDefaultListId = formData.get("klaviyoDefaultListId") as string;
    const klaviyoSyncProfiles = formData.get("klaviyoSyncProfiles") === "true";
    const klaviyoSyncEvents = formData.get("klaviyoSyncEvents") === "true";

    // Validate API key if provided
    if (klaviyoApiKey) {
      try {
        const klaviyo = new KlaviyoService({ apiKey: klaviyoApiKey });
        const isValid = await klaviyo.validateApiKey();
        if (!isValid) {
          return Response.json(
            { success: false, error: "Invalid Klaviyo API key" },
            { status: 400 }
          );
        }
      } catch (error) {
        return Response.json(
          { success: false, error: "Failed to validate Klaviyo API key" },
          { status: 400 }
        );
      }
    }

    await db.emailSettings.upsert({
      where: { shop },
      create: {
        shop,
        emailProvider,
        klaviyoEnabled: emailProvider !== "SENDGRID",
        klaviyoApiKey: klaviyoApiKey || null,
        klaviyoPublicKey: klaviyoPublicKey || null,
        klaviyoDefaultListId: klaviyoDefaultListId || null,
        klaviyoSyncProfiles,
        klaviyoSyncEvents,
      },
      update: {
        emailProvider,
        klaviyoEnabled: emailProvider !== "SENDGRID",
        klaviyoApiKey: klaviyoApiKey || null,
        klaviyoPublicKey: klaviyoPublicKey || null,
        klaviyoDefaultListId: klaviyoDefaultListId || null,
        klaviyoSyncProfiles,
        klaviyoSyncEvents,
      },
    });

    return Response.json({ success: true, message: "Connection settings saved!" });
  }

  if (intent === "saveAutomation") {
    const automationsEnabled = formData.get("automationsEnabled") === "true";
    const sendCustomerEnrolled = formData.get("sendCustomerEnrolled") === "true";
    const sendCustomerBirthday = formData.get("sendCustomerBirthday") === "true";
    const sendCustomerAnniversary = formData.get("sendCustomerAnniversary") === "true";
    const sendOrderPlaced = formData.get("sendOrderPlaced") === "true";
    const sendCashbackEarned = formData.get("sendCashbackEarned") === "true";
    const sendCashbackRedeemed = formData.get("sendCashbackRedeemed") === "true";
    const sendTierUpgraded = formData.get("sendTierUpgraded") === "true";
    const sendTierDowngraded = formData.get("sendTierDowngraded") === "true";
    const sendTierUpgradeNear = formData.get("sendTierUpgradeNear") === "true";
    const sendVipAchieved = formData.get("sendVipAchieved") === "true";
    const sendPointsExpiring = formData.get("sendPointsExpiring") === "true";
    const sendBalanceReminder = formData.get("sendBalanceReminder") === "true";
    const sendWinBack = formData.get("sendWinBack") === "true";

    const tierNudgeThreshold = parseInt(formData.get("tierNudgeThreshold") as string) || 80;
    const balanceReminderDays = parseInt(formData.get("balanceReminderDays") as string) || 30;
    const expiryReminderCooldownDays = parseInt(formData.get("expiryReminderCooldownDays") as string) || 7;
    const balanceReminderCooldownDays = parseInt(formData.get("balanceReminderCooldownDays") as string) || 14;
    const winBackCooldownDays = parseInt(formData.get("winBackCooldownDays") as string) || 30;
    const tierNudgeCooldownDays = parseInt(formData.get("tierNudgeCooldownDays") as string) || 14;

    await db.klaviyoAutomationSettings.upsert({
      where: { shop },
      create: {
        id: crypto.randomUUID(),
        shop,
        automationsEnabled,
        sendCustomerEnrolled,
        sendCustomerBirthday,
        sendCustomerAnniversary,
        sendOrderPlaced,
        sendCashbackEarned,
        sendCashbackRedeemed,
        sendTierUpgraded,
        sendTierDowngraded,
        sendTierUpgradeNear,
        sendVipAchieved,
        sendPointsExpiring,
        sendBalanceReminder,
        sendWinBack,
        tierNudgeThreshold,
        balanceReminderDays,
        expiryReminderCooldownDays,
        balanceReminderCooldownDays,
        winBackCooldownDays,
        tierNudgeCooldownDays,
      },
      update: {
        automationsEnabled,
        sendCustomerEnrolled,
        sendCustomerBirthday,
        sendCustomerAnniversary,
        sendOrderPlaced,
        sendCashbackEarned,
        sendCashbackRedeemed,
        sendTierUpgraded,
        sendTierDowngraded,
        sendTierUpgradeNear,
        sendVipAchieved,
        sendPointsExpiring,
        sendBalanceReminder,
        sendWinBack,
        tierNudgeThreshold,
        balanceReminderDays,
        expiryReminderCooldownDays,
        balanceReminderCooldownDays,
        winBackCooldownDays,
        tierNudgeCooldownDays,
      },
    });

    return Response.json({ success: true, message: "Automation settings saved!" });
  }

  if (intent === "testConnection") {
    const settings = await db.emailSettings.findUnique({
      where: { shop },
      select: { klaviyoApiKey: true },
    });

    if (!settings?.klaviyoApiKey) {
      return Response.json(
        { success: false, error: "Klaviyo API key not configured" },
        { status: 400 }
      );
    }

    try {
      const klaviyo = new KlaviyoService({ apiKey: settings.klaviyoApiKey });
      const isValid = await klaviyo.validateApiKey();
      return Response.json({
        success: isValid,
        message: isValid ? "Connection successful!" : "Connection failed",
      });
    } catch (error) {
      return Response.json(
        { success: false, error: "Failed to connect to Klaviyo" },
        { status: 500 }
      );
    }
  }

  if (intent === "disconnectOAuth") {
    const { disconnectKlaviyoOAuth } = await import("~/services/klaviyo-oauth.server");
    await disconnectKlaviyoOAuth(shop);
    return Response.json({
      success: true,
      message: "Klaviyo OAuth disconnected",
    });
  }

  return Response.json({ success: false, error: "Invalid intent" }, { status: 400 });
};

// ============================================
// COMPONENT
// ============================================

export default function KlaviyoSettings() {
  const data = useLoaderData<LoaderData>();
  const fetcher = useFetcher<{ success: boolean; message?: string; error?: string }>();
  const [searchParams] = useSearchParams();

  // Check for OAuth connection success/error
  const justConnected = searchParams.get("connected") === "true";
  const oauthError = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Connection form state
  const [emailProvider, setEmailProvider] = useState<EmailProvider>(
    data.emailSettings?.emailProvider || "SENDGRID"
  );
  const [klaviyoApiKey, setKlaviyoApiKey] = useState(
    data.emailSettings?.klaviyoApiKey || ""
  );
  const [klaviyoPublicKey, setKlaviyoPublicKey] = useState(
    data.emailSettings?.klaviyoPublicKey || ""
  );
  const [klaviyoDefaultListId, setKlaviyoDefaultListId] = useState(
    data.emailSettings?.klaviyoDefaultListId || ""
  );
  const [klaviyoSyncProfiles, setKlaviyoSyncProfiles] = useState(
    data.emailSettings?.klaviyoSyncProfiles ?? true
  );
  const [klaviyoSyncEvents, setKlaviyoSyncEvents] = useState(
    data.emailSettings?.klaviyoSyncEvents ?? true
  );

  // Automation form state
  const [automationsEnabled, setAutomationsEnabled] = useState(
    data.automationSettings?.automationsEnabled ?? false
  );
  const [eventToggles, setEventToggles] = useState({
    sendCustomerEnrolled: data.automationSettings?.sendCustomerEnrolled ?? true,
    sendCustomerBirthday: data.automationSettings?.sendCustomerBirthday ?? true,
    sendCustomerAnniversary: data.automationSettings?.sendCustomerAnniversary ?? true,
    sendOrderPlaced: data.automationSettings?.sendOrderPlaced ?? true,
    sendCashbackEarned: data.automationSettings?.sendCashbackEarned ?? true,
    sendCashbackRedeemed: data.automationSettings?.sendCashbackRedeemed ?? true,
    sendTierUpgraded: data.automationSettings?.sendTierUpgraded ?? true,
    sendTierDowngraded: data.automationSettings?.sendTierDowngraded ?? true,
    sendTierUpgradeNear: data.automationSettings?.sendTierUpgradeNear ?? true,
    sendVipAchieved: data.automationSettings?.sendVipAchieved ?? true,
    sendPointsExpiring: data.automationSettings?.sendPointsExpiring ?? true,
    sendBalanceReminder: data.automationSettings?.sendBalanceReminder ?? true,
    sendWinBack: data.automationSettings?.sendWinBack ?? true,
  });
  const [cooldownSettings, setCooldownSettings] = useState({
    tierNudgeThreshold: data.automationSettings?.tierNudgeThreshold ?? 80,
    balanceReminderDays: data.automationSettings?.balanceReminderDays ?? 30,
    expiryReminderCooldownDays: data.automationSettings?.expiryReminderCooldownDays ?? 7,
    balanceReminderCooldownDays: data.automationSettings?.balanceReminderCooldownDays ?? 14,
    winBackCooldownDays: data.automationSettings?.winBackCooldownDays ?? 30,
    tierNudgeCooldownDays: data.automationSettings?.tierNudgeCooldownDays ?? 14,
  });

  // UI state
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastError, setToastError] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (fetcher.data) {
      if (fetcher.data.success) {
        setToastMessage(fetcher.data.message || "Saved!");
        setToastError(false);
      } else {
        setToastMessage(fetcher.data.error || "Failed");
        setToastError(true);
      }
      setToastActive(true);
    }
  }, [fetcher.data]);

  const handleSaveConnection = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "saveConnection");
    formData.append("emailProvider", emailProvider);
    formData.append("klaviyoApiKey", klaviyoApiKey);
    formData.append("klaviyoPublicKey", klaviyoPublicKey);
    formData.append("klaviyoDefaultListId", klaviyoDefaultListId);
    formData.append("klaviyoSyncProfiles", String(klaviyoSyncProfiles));
    formData.append("klaviyoSyncEvents", String(klaviyoSyncEvents));
    fetcher.submit(formData, { method: "post" });
  }, [emailProvider, klaviyoApiKey, klaviyoPublicKey, klaviyoDefaultListId, klaviyoSyncProfiles, klaviyoSyncEvents, fetcher]);

  const handleSaveAutomation = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "saveAutomation");
    formData.append("automationsEnabled", String(automationsEnabled));
    Object.entries(eventToggles).forEach(([key, value]) => {
      formData.append(key, String(value));
    });
    Object.entries(cooldownSettings).forEach(([key, value]) => {
      formData.append(key, String(value));
    });
    fetcher.submit(formData, { method: "post" });
  }, [automationsEnabled, eventToggles, cooldownSettings, fetcher]);

  const handleTestConnection = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "testConnection");
    fetcher.submit(formData, { method: "post" });
  }, [fetcher]);

  const isSaving = fetcher.state === "submitting";

  const providerOptions = [
    { label: "SendGrid Only", value: "SENDGRID" },
    { label: "Klaviyo Only", value: "KLAVIYO" },
    { label: "Hybrid (SendGrid for transactional, Klaviyo for marketing)", value: "HYBRID" },
  ];

  const listOptions = [
    { label: "None", value: "" },
    ...data.klaviyoLists.map((list) => ({
      label: list.name,
      value: list.id,
    })),
  ];

  const eventGroups = [
    {
      title: "Customer Events",
      events: [
        { key: "sendCustomerEnrolled", label: "Customer Enrolled" },
        { key: "sendCustomerBirthday", label: "Customer Birthday" },
        { key: "sendCustomerAnniversary", label: "Membership Anniversary" },
      ],
    },
    {
      title: "Transaction Events",
      events: [
        { key: "sendOrderPlaced", label: "Order Placed" },
        { key: "sendCashbackEarned", label: "Cashback Earned" },
        { key: "sendCashbackRedeemed", label: "Cashback Redeemed" },
      ],
    },
    {
      title: "Tier Events",
      events: [
        { key: "sendTierUpgraded", label: "Tier Upgraded" },
        { key: "sendTierDowngraded", label: "Tier Downgraded" },
        { key: "sendTierUpgradeNear", label: "Close to Next Tier" },
        { key: "sendVipAchieved", label: "VIP Status Achieved" },
      ],
    },
    {
      title: "Engagement Events",
      events: [
        { key: "sendPointsExpiring", label: "Points Expiring Soon" },
        { key: "sendBalanceReminder", label: "Unused Balance Reminder" },
        { key: "sendWinBack", label: "Win-Back Campaign" },
      ],
    },
  ];

  return (
    <Frame>
      <Page
        title="Klaviyo Integration"
        subtitle="Connect Klaviyo for advanced email marketing automation"
        backAction={{ content: "Marketing Hub", url: "/app/marketing" }}
      >
        <Layout>
          {/* OAuth Success/Error Banners */}
          {justConnected && (
            <Layout.Section>
              <Banner tone="success" onDismiss={() => window.history.replaceState({}, '', '/app/marketing/klaviyo')}>
                Successfully connected to Klaviyo! Your account is now linked.
              </Banner>
            </Layout.Section>
          )}
          {oauthError && (
            <Layout.Section>
              <Banner tone="critical" onDismiss={() => window.history.replaceState({}, '', '/app/marketing/klaviyo')}>
                Failed to connect to Klaviyo: {errorDescription || oauthError}
              </Banner>
            </Layout.Section>
          )}

          {/* Connection Status */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h3">
                    Connection Status
                  </Text>
                  {data.emailSettings?.klaviyoOAuthConnected ? (
                    <Badge tone="success">Connected (OAuth)</Badge>
                  ) : data.emailSettings?.klaviyoEnabled && data.emailSettings?.klaviyoApiKey ? (
                    <Badge tone="success">Connected (API Key)</Badge>
                  ) : (
                    <Badge tone="warning">Not Connected</Badge>
                  )}
                </InlineStack>

                <InlineStack gap="400">
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued">Profiles Synced</Text>
                    <Text variant="headingLg" as="p">{data.profileCount.toLocaleString()}</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued">Events Sent</Text>
                    <Text variant="headingLg" as="p">{data.eventCount.toLocaleString()}</Text>
                  </BlockStack>
                  {data.emailSettings?.klaviyoLastSyncAt && (
                    <BlockStack gap="100">
                      <Text variant="bodySm" tone="subdued">Last Sync</Text>
                      <Text variant="bodyMd" as="p">
                        {new Date(data.emailSettings.klaviyoLastSyncAt).toLocaleDateString()}
                      </Text>
                    </BlockStack>
                  )}
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Connection Settings */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">
                  Connection Settings
                </Text>

                <FormLayout>
                  <Select
                    label="Email Provider"
                    options={providerOptions}
                    value={emailProvider}
                    onChange={(value) => setEmailProvider(value as EmailProvider)}
                    helpText="Choose how to send emails to your customers"
                  />

                  {emailProvider !== "SENDGRID" && (
                    <>
                      {/* OAuth Connection (Preferred) */}
                      {data.isOAuthConfigured && (
                        <Box paddingBlockEnd="400">
                          <BlockStack gap="300">
                            <Text variant="headingSm" as="h4">
                              Connect with OAuth (Recommended)
                            </Text>
                            {data.emailSettings?.klaviyoOAuthConnected ? (
                              <InlineStack gap="300" blockAlign="center">
                                <Badge tone="success">
                                  <InlineStack gap="100" blockAlign="center">
                                    <Icon source={CheckCircleIcon} />
                                    Connected via OAuth
                                  </InlineStack>
                                </Badge>
                                <Button
                                  variant="plain"
                                  tone="critical"
                                  onClick={() => {
                                    // Disconnect OAuth
                                    const fetcher = document.createElement("form");
                                    fetcher.method = "POST";
                                    fetcher.innerHTML = '<input type="hidden" name="intent" value="disconnectOAuth" />';
                                    document.body.appendChild(fetcher);
                                    fetcher.submit();
                                  }}
                                >
                                  Disconnect
                                </Button>
                              </InlineStack>
                            ) : (
                              <BlockStack gap="200">
                                <Text as="p" tone="subdued">
                                  Securely connect your Klaviyo account with one click. OAuth tokens auto-refresh for uninterrupted service.
                                </Text>
                                <Button
                                  url="/app/marketing/klaviyo/connect"
                                  variant="primary"
                                >
                                  Connect to Klaviyo
                                </Button>
                              </BlockStack>
                            )}
                          </BlockStack>
                          <Box paddingBlockStart="400">
                            <Divider />
                          </Box>
                        </Box>
                      )}

                      {/* API Key (Legacy/Fallback) */}
                      {!data.emailSettings?.klaviyoOAuthConnected && (
                        <>
                          <Text variant="headingSm" as="h4">
                            {data.isOAuthConfigured ? "Or use API Key (Legacy)" : "API Key Connection"}
                          </Text>
                          <TextField
                            label="Klaviyo Private API Key"
                            value={klaviyoApiKey}
                            onChange={setKlaviyoApiKey}
                            type="password"
                            autoComplete="off"
                            helpText="Find this in Klaviyo → Settings → API Keys"
                          />
                        </>
                      )}

                      <TextField
                        label="Klaviyo Public API Key (Site ID)"
                        value={klaviyoPublicKey}
                        onChange={setKlaviyoPublicKey}
                        autoComplete="off"
                        helpText="6-character site ID for client-side tracking (optional)"
                      />

                      <Select
                        label="Default List"
                        options={listOptions}
                        value={klaviyoDefaultListId}
                        onChange={setKlaviyoDefaultListId}
                        helpText="Customers will be added to this list when enrolled"
                      />

                      <Checkbox
                        label="Sync customer profiles to Klaviyo"
                        checked={klaviyoSyncProfiles}
                        onChange={setKlaviyoSyncProfiles}
                      />

                      <Checkbox
                        label="Send events to Klaviyo"
                        checked={klaviyoSyncEvents}
                        onChange={setKlaviyoSyncEvents}
                      />
                    </>
                  )}
                </FormLayout>

                <InlineStack gap="200">
                  <Button
                    variant="primary"
                    onClick={handleSaveConnection}
                    loading={isSaving}
                  >
                    Save Connection Settings
                  </Button>
                  {emailProvider !== "SENDGRID" && klaviyoApiKey && (
                    <Button onClick={handleTestConnection} loading={isSaving}>
                      Test Connection
                    </Button>
                  )}
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Automation Settings */}
          {emailProvider !== "SENDGRID" && (
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingMd" as="h3">
                      Automation Events
                    </Text>
                    <Checkbox
                      label="Enable automations"
                      checked={automationsEnabled}
                      onChange={setAutomationsEnabled}
                    />
                  </InlineStack>

                  {automationsEnabled && (
                    <>
                      <Banner tone="info">
                        <p>
                          These events trigger Klaviyo flows. Create flows in Klaviyo that
                          trigger on "RewardsPro [Event Name]" metrics.
                        </p>
                      </Banner>

                      {eventGroups.map((group) => (
                        <BlockStack gap="200" key={group.title}>
                          <Text variant="headingSm" as="h4">
                            {group.title}
                          </Text>
                          <InlineStack gap="400" wrap>
                            {group.events.map((event) => (
                              <Checkbox
                                key={event.key}
                                label={event.label}
                                checked={eventToggles[event.key as keyof typeof eventToggles]}
                                onChange={(checked) =>
                                  setEventToggles((prev) => ({
                                    ...prev,
                                    [event.key]: checked,
                                  }))
                                }
                              />
                            ))}
                          </InlineStack>
                        </BlockStack>
                      ))}

                      <Divider />

                      <Button
                        onClick={() => setAdvancedOpen(!advancedOpen)}
                        disclosure={advancedOpen ? "up" : "down"}
                        variant="plain"
                      >
                        Advanced Settings
                      </Button>

                      <Collapsible open={advancedOpen} id="advanced-settings">
                        <Box paddingBlockStart="200">
                          <FormLayout>
                            <TextField
                              label="Tier nudge threshold (%)"
                              type="number"
                              value={String(cooldownSettings.tierNudgeThreshold)}
                              onChange={(value) =>
                                setCooldownSettings((prev) => ({
                                  ...prev,
                                  tierNudgeThreshold: parseInt(value) || 80,
                                }))
                              }
                              suffix="%"
                              helpText="Send 'Close to Next Tier' when customer reaches this progress"
                            />

                            <TextField
                              label="Balance reminder after (days)"
                              type="number"
                              value={String(cooldownSettings.balanceReminderDays)}
                              onChange={(value) =>
                                setCooldownSettings((prev) => ({
                                  ...prev,
                                  balanceReminderDays: parseInt(value) || 30,
                                }))
                              }
                              suffix="days"
                              helpText="Days of inactivity before sending balance reminder"
                            />

                            <TextField
                              label="Expiry reminder cooldown (days)"
                              type="number"
                              value={String(cooldownSettings.expiryReminderCooldownDays)}
                              onChange={(value) =>
                                setCooldownSettings((prev) => ({
                                  ...prev,
                                  expiryReminderCooldownDays: parseInt(value) || 7,
                                }))
                              }
                              suffix="days"
                              helpText="Minimum days between expiry reminders"
                            />

                            <TextField
                              label="Balance reminder cooldown (days)"
                              type="number"
                              value={String(cooldownSettings.balanceReminderCooldownDays)}
                              onChange={(value) =>
                                setCooldownSettings((prev) => ({
                                  ...prev,
                                  balanceReminderCooldownDays: parseInt(value) || 14,
                                }))
                              }
                              suffix="days"
                              helpText="Minimum days between balance reminders"
                            />

                            <TextField
                              label="Win-back cooldown (days)"
                              type="number"
                              value={String(cooldownSettings.winBackCooldownDays)}
                              onChange={(value) =>
                                setCooldownSettings((prev) => ({
                                  ...prev,
                                  winBackCooldownDays: parseInt(value) || 30,
                                }))
                              }
                              suffix="days"
                              helpText="Minimum days between win-back emails"
                            />

                            <TextField
                              label="Tier nudge cooldown (days)"
                              type="number"
                              value={String(cooldownSettings.tierNudgeCooldownDays)}
                              onChange={(value) =>
                                setCooldownSettings((prev) => ({
                                  ...prev,
                                  tierNudgeCooldownDays: parseInt(value) || 14,
                                }))
                              }
                              suffix="days"
                              helpText="Minimum days between tier nudge reminders"
                            />
                          </FormLayout>
                        </Box>
                      </Collapsible>

                      <Button
                        variant="primary"
                        onClick={handleSaveAutomation}
                        loading={isSaving}
                      >
                        Save Automation Settings
                      </Button>
                    </>
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>
          )}

          {/* Help Section */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">
                  Setting Up Klaviyo Flows
                </Text>

                <Text as="p" tone="subdued">
                  After connecting Klaviyo, create flows that trigger on RewardsPro events:
                </Text>

                <List>
                  <List.Item>Go to Klaviyo → Flows → Create Flow</List.Item>
                  <List.Item>Choose "Metric" as the trigger type</List.Item>
                  <List.Item>Search for "RewardsPro" metrics (e.g., "RewardsPro Order Placed")</List.Item>
                  <List.Item>Design your email sequence using the event properties</List.Item>
                </List>

                <Banner>
                  <p>
                    <strong>Available Event Properties:</strong> customer_id, tier_name,
                    cashback_balance, lifetime_spend, order_id, cashback_earned, and more.
                  </p>
                </Banner>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>

      {toastActive && (
        <Toast
          content={toastMessage}
          error={toastError}
          onDismiss={() => setToastActive(false)}
          duration={4000}
        />
      )}
    </Frame>
  );
}
