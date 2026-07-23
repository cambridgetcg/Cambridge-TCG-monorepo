import { json, ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
import { useToast } from "~/hooks/useToast";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  TextField,
  Button,
  Text,
  InlineStack,
  FormLayout,
  Checkbox,
  Select,
  Toast,
  Banner,
  Divider,
  Badge,
  Box,
  Modal,
  Icon,
  List,
  Collapsible,
  ProgressBar,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  RefreshIcon,
  DeleteIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { getMarketingModeInfo, switchMarketingMode } from "~/services/marketing-mode.server";
import { getEmailUsageStats } from "~/services/email-usage-control.server";
import type { MarketingHubMode } from "@prisma/client";
import { LimitHint } from "~/components/Billing/UpgradePrompt";

// ============================================
// TYPES
// ============================================

interface DnsRecord {
  type: string;
  host: string;
  data: string;
  valid: boolean;
}

interface SendGridDomain {
  id: string;
  domain: string;
  subdomain: string | null;
  status: string;
  sendgridDnsRecords: {
    dkim1?: DnsRecord;
    dkim2?: DnsRecord;
    mail_cname?: DnsRecord;
  } | null;
  dkimVerified: boolean;
  spfVerified: boolean;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
}

// ============================================
// LOADER
// ============================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Get email settings or create default
  const emailSettings = await prisma.emailSettings.findUnique({
    where: { shop },
  });

  // Get shop settings for defaults
  const shopSettings = await prisma.shopSettings.findUnique({
    where: { shop },
  });

  // Get all domains for this shop
  const domains = await prisma.sendGridDomain.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });

  // Get active custom domain if exists
  let customDomain = null;
  if (emailSettings?.customDomainId) {
    customDomain = await prisma.sendGridDomain.findFirst({
      where: { id: emailSettings.customDomainId, shop },
    });
  }

  // Check if SendGrid is configured
  const sendgridConfigured = !!process.env.SENDGRID_API_KEY;

  // Get marketing mode info
  const marketingModeInfo = await getMarketingModeInfo(shop);

  // Get email usage stats
  const emailUsageStats = await getEmailUsageStats(shop);

  return json({
    shop,
    emailSettings,
    customDomain,
    shopSettings,
    domains,
    sendgridConfigured,
    marketingModeInfo,
    emailUsageStats,
  });
};

// ============================================
// ACTION
// ============================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "saveSettings") {
    const senderName = formData.get("senderName") as string;
    const senderEmail = formData.get("senderEmail") as string;
    const replyToEmail = (formData.get("replyToEmail") as string) || null;
    const primaryColor = formData.get("primaryColor") as string;
    const secondaryColor = formData.get("secondaryColor") as string;
    const fontFamily = formData.get("fontFamily") as string;
    const includeUnsubscribe = formData.get("includeUnsubscribe") === "true";
    const includePhysicalAddress =
      formData.get("includePhysicalAddress") === "true";
    const gdprEnabled = formData.get("gdprEnabled") === "true";
    const footerText = formData.get("footerText") as string;
    const dailyLimit = parseInt(formData.get("dailyLimit") as string);
    const hourlyLimit = parseInt(formData.get("hourlyLimit") as string);
    const preferredTime = formData.get("preferredTime") as string;
    const timezone = formData.get("timezone") as string;

    const brandColors = { primary: primaryColor, secondary: secondaryColor };
    const typography = { fontFamily };
    const footerContent = { text: footerText };
    const sendTimePrefs = { preferredTime, timezone, dailyLimit, hourlyLimit };

    // Upsert settings
    await prisma.emailSettings.upsert({
      where: { shop },
      create: {
        shop,
        senderName,
        senderEmail,
        replyToEmail,
        brandColors,
        typography,
        footerContent,
        includeUnsubscribe,
        includePhysicalAddress,
        gdprEnabled,
        sendTimePrefs,
      },
      update: {
        senderName,
        senderEmail,
        replyToEmail,
        brandColors,
        typography,
        footerContent,
        includeUnsubscribe,
        includePhysicalAddress,
        gdprEnabled,
        sendTimePrefs,
      },
    });

    return json({ success: true, message: "Settings saved successfully!" });
  }

  if (intent === "switchPlatform") {
    const mode = formData.get("mode") as MarketingHubMode;

    if (!mode || !["INHOUSE", "KLAVIYO"].includes(mode)) {
      return json({ success: false, message: "Invalid platform" }, { status: 400 });
    }

    const result = await switchMarketingMode(shop, mode);

    if (!result.success) {
      return json({ success: false, message: result.error || "Failed to switch platform" }, { status: 400 });
    }

    return json({
      success: true,
      message: mode === "KLAVIYO"
        ? "Switched to Klaviyo! Your in-house campaigns have been archived."
        : "Switched to In-House Marketing!"
    });
  }

  return json({ success: false, message: "Invalid request" }, { status: 400 });
};

// ============================================
// COMPONENT
// ============================================

// Domain API response types
interface DomainApiResponse {
  success: boolean;
  message?: string;
  error?: string;
  domainId?: string;
  dnsRecords?: any;
  verified?: boolean;
  results?: any;
}

interface TestEmailResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export default function EmailSettings() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const domainFetcher = useFetcher<DomainApiResponse>();
  const testEmailFetcher = useFetcher<TestEmailResponse>();

  // Initialize form state
  const [formValues, setFormValues] = useState({
    senderName:
      data.emailSettings?.senderName || data.shopSettings?.storeName || "",
    senderEmail: data.emailSettings?.senderEmail || "",
    replyToEmail: data.emailSettings?.replyToEmail || "",
    primaryColor:
      (data.emailSettings?.brandColors as any)?.primary || "#5C6AC4",
    secondaryColor:
      (data.emailSettings?.brandColors as any)?.secondary || "#F4F6F8",
    fontFamily: (data.emailSettings?.typography as any)?.fontFamily || "Inter",
    includeUnsubscribe: data.emailSettings?.includeUnsubscribe ?? true,
    includePhysicalAddress: data.emailSettings?.includePhysicalAddress ?? true,
    gdprEnabled: data.emailSettings?.gdprEnabled ?? true,
    footerText:
      (data.emailSettings?.footerContent as any)?.text ||
      `© ${new Date().getFullYear()} ${data.shopSettings?.storeName}. All rights reserved.`,
    dailyLimit: (data.emailSettings?.sendTimePrefs as any)?.dailyLimit || 1000,
    hourlyLimit: (data.emailSettings?.sendTimePrefs as any)?.hourlyLimit || 100,
    preferredTime:
      (data.emailSettings?.sendTimePrefs as any)?.preferredTime || "10:00",
    timezone:
      (data.emailSettings?.sendTimePrefs as any)?.timezone || "America/New_York",
  });

  // Standardized toast notifications
  const { toast, showSuccess, showError, hideToast } = useToast();

  // Domain setup state
  const [setupDomainModalOpen, setSetupDomainModalOpen] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [newSubdomain, setNewSubdomain] = useState("mail");
  const [testEmail, setTestEmail] = useState("");
  const [dnsInstructionsOpen, setDnsInstructionsOpen] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (fetcher.data?.success) {
      showSuccess(fetcher.data.message || "Settings saved!");
    }
  }, [fetcher.data, showSuccess]);

  useEffect(() => {
    if (domainFetcher.data) {
      if (domainFetcher.data.success) {
        showSuccess(domainFetcher.data.message || "Operation successful!");
        setSetupDomainModalOpen(false);
        setNewDomain("");
      } else {
        showError(domainFetcher.data.error || "Operation failed");
      }
    }
  }, [domainFetcher.data, showSuccess, showError]);

  useEffect(() => {
    if (testEmailFetcher.data) {
      if (testEmailFetcher.data.success) {
        showSuccess(testEmailFetcher.data.message || "Test email sent!");
      } else {
        showError(testEmailFetcher.data.error || "Failed to send");
      }
    }
  }, [testEmailFetcher.data, showSuccess, showError]);

  const handleChange =
    (field: string) => (value: string | boolean | number) => {
      setFormValues({ ...formValues, [field]: value });
    };

  const handleSubmit = () => {
    const formData = new FormData();
    formData.append("intent", "saveSettings");
    Object.entries(formValues).forEach(([key, value]) => {
      formData.append(key, String(value));
    });
    fetcher.submit(formData, { method: "post" });
  };

  const handleSetupDomain = () => {
    const formData = new FormData();
    formData.append("intent", "setup");
    formData.append("domain", newDomain);
    formData.append("subdomain", newSubdomain);
    domainFetcher.submit(formData, {
      method: "post",
      action: "/api/email/domain",
    });
  };

  const handleVerifyDomain = (domainId: string) => {
    const formData = new FormData();
    formData.append("intent", "verify");
    formData.append("domainId", domainId);
    domainFetcher.submit(formData, {
      method: "post",
      action: "/api/email/domain",
    });
  };

  const handleActivateDomain = (domainId: string) => {
    const formData = new FormData();
    formData.append("intent", "activate");
    formData.append("domainId", domainId);
    domainFetcher.submit(formData, {
      method: "post",
      action: "/api/email/domain",
    });
  };

  const handleDeactivateDomain = () => {
    const formData = new FormData();
    formData.append("intent", "deactivate");
    domainFetcher.submit(formData, {
      method: "post",
      action: "/api/email/domain",
    });
  };

  const handleDeleteDomain = (domainId: string) => {
    if (!confirm("Are you sure you want to delete this domain?")) return;
    const formData = new FormData();
    formData.append("intent", "delete");
    formData.append("domainId", domainId);
    domainFetcher.submit(formData, {
      method: "post",
      action: "/api/email/domain",
    });
  };

  const handleSendTestEmail = () => {
    if (!testEmail) return;
    const formData = new FormData();
    formData.append("email", testEmail);
    testEmailFetcher.submit(formData, {
      method: "post",
      action: "/api/email/test",
    });
  };

  const [switchPlatformModalOpen, setSwitchPlatformModalOpen] = useState(false);
  const [platformToSwitch, setPlatformToSwitch] = useState<"INHOUSE" | "KLAVIYO" | null>(null);

  const isSaving = fetcher.state === "submitting";
  const isDomainLoading = domainFetcher.state !== "idle";
  const isTestEmailSending = testEmailFetcher.state !== "idle";

  const currentSendingMode = data.emailSettings?.sendingMode || "SHARED";
  const activeDomain = data.customDomain;
  const currentMarketingMode = data.marketingModeInfo.mode;
  const isKlaviyoConnected = data.marketingModeInfo.isKlaviyoConnected;

  const handleSwitchPlatform = useCallback(() => {
    if (!platformToSwitch) return;
    const formData = new FormData();
    formData.append("intent", "switchPlatform");
    formData.append("mode", platformToSwitch);
    fetcher.submit(formData, { method: "post" });
    setSwitchPlatformModalOpen(false);
  }, [platformToSwitch, fetcher]);

  const openSwitchModal = useCallback((mode: "INHOUSE" | "KLAVIYO") => {
    setPlatformToSwitch(mode);
    setSwitchPlatformModalOpen(true);
  }, []);

  const timezoneOptions = [
    { label: "Eastern Time (ET)", value: "America/New_York" },
    { label: "Central Time (CT)", value: "America/Chicago" },
    { label: "Mountain Time (MT)", value: "America/Denver" },
    { label: "Pacific Time (PT)", value: "America/Los_Angeles" },
    { label: "UTC", value: "UTC" },
    { label: "London (GMT)", value: "Europe/London" },
    { label: "Paris (CET)", value: "Europe/Paris" },
    { label: "Tokyo (JST)", value: "Asia/Tokyo" },
    { label: "Sydney (AEST)", value: "Australia/Sydney" },
  ];

  const fontOptions = [
    { label: "Inter", value: "Inter" },
    { label: "Helvetica", value: "Helvetica" },
    { label: "Arial", value: "Arial" },
    { label: "Georgia", value: "Georgia" },
    { label: "Times New Roman", value: "Times New Roman" },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "VERIFIED":
        return <Badge tone="success">Verified</Badge>;
      case "DNS_PENDING":
        return <Badge tone="warning">DNS Pending</Badge>;
      case "VERIFYING":
        return <Badge tone="info">Verifying...</Badge>;
      case "FAILED":
        return <Badge tone="critical">Failed</Badge>;
      default:
        return <Badge>Pending</Badge>;
    }
  };

  return (
    <>
      <Page
        title="Email Settings"
        subtitle="Configure sender, domain authentication, and compliance settings"
        backAction={{ content: "Marketing Hub", url: "/app/marketing" }}
      >
        <Layout>
          {/* SendGrid Status */}
          {!data.sendgridConfigured && (
            <Layout.Section>
              <Banner tone="warning" title="SendGrid Not Configured">
                <p>
                  Add your SENDGRID_API_KEY to environment variables to enable
                  email sending.
                </p>
              </Banner>
            </Layout.Section>
          )}

          {/* Marketing Platform */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h3">
                    Marketing Platform
                  </Text>
                  {currentMarketingMode === "KLAVIYO" ? (
                    <Badge tone="magic">Klaviyo</Badge>
                  ) : currentMarketingMode === "INHOUSE" ? (
                    <Badge tone="success">In-House</Badge>
                  ) : (
                    <Badge tone="info">Not Configured</Badge>
                  )}
                </InlineStack>

                {currentMarketingMode === "KLAVIYO" ? (
                  <Banner tone="info">
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm">
                        You're using <strong>Klaviyo</strong> for marketing automation.
                        RewardsPro syncs customer profiles and events to Klaviyo where you build flows and campaigns.
                      </Text>
                      <InlineStack gap="200">
                        <Button
                          size="slim"
                          onClick={() => openSwitchModal("INHOUSE")}
                        >
                          Switch to In-House Marketing
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </Banner>
                ) : currentMarketingMode === "INHOUSE" ? (
                  <Banner tone="success">
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm">
                        You're using <strong>In-House Marketing</strong> powered by SendGrid.
                        Create campaigns, templates, and automations directly in RewardsPro.
                      </Text>
                      {isKlaviyoConnected && (
                        <InlineStack gap="200">
                          <Button
                            size="slim"
                            onClick={() => openSwitchModal("KLAVIYO")}
                          >
                            Switch to Klaviyo
                          </Button>
                        </InlineStack>
                      )}
                    </BlockStack>
                  </Banner>
                ) : (
                  <Banner tone="warning">
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm">
                        You haven't chosen a marketing platform yet. Visit the Marketing Hub to get started.
                      </Text>
                    </BlockStack>
                  </Banner>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Email Usage Stats */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h3">
                    Email Usage
                  </Text>
                  <Badge tone={data.emailUsageStats.percentage >= 90 ? "critical" : data.emailUsageStats.percentage >= 75 ? "warning" : "success"}>
                    {data.emailUsageStats.planName}
                  </Badge>
                </InlineStack>

                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text as="p" variant="bodyMd">
                      {data.emailUsageStats.limit >= 999999
                        ? `${data.emailUsageStats.totalEmails.toLocaleString()} emails sent this month`
                        : `${data.emailUsageStats.totalEmails.toLocaleString()} of ${data.emailUsageStats.limit.toLocaleString()} emails used`}
                    </Text>
                    {data.emailUsageStats.limit < 999999 && (
                      <Text as="p" variant="bodyMd" tone="subdued">
                        {data.emailUsageStats.remaining.toLocaleString()} remaining
                      </Text>
                    )}
                  </InlineStack>

                  {data.emailUsageStats.limit < 999999 && (
                    <ProgressBar
                      progress={data.emailUsageStats.percentage}
                      size="small"
                      tone={(data.emailUsageStats.percentage >= 90 ? "critical" : "primary") as any}
                    />
                  )}
                </BlockStack>

                {data.emailUsageStats.isLocked && (
                  <Banner tone="critical" title="Email Sending Paused">
                    <p>Your email sending is currently paused. Contact support for assistance.</p>
                  </Banner>
                )}

                {data.emailUsageStats.percentage >= 90 && data.emailUsageStats.limit < 999999 && !data.emailUsageStats.isLocked && (
                  <Banner tone="warning" title="Approaching Email Limit">
                    <p>
                      You've used {data.emailUsageStats.percentage}% of your monthly email allowance.
                      Consider upgrading your plan for more emails.
                    </p>
                  </Banner>
                )}

                {/* Subtle contextual hint when at 50%+ but below 90% warning threshold */}
                {data.emailUsageStats.percentage >= 50 && data.emailUsageStats.percentage < 90 && data.emailUsageStats.limit < 999999 && (
                  <LimitHint
                    current={data.emailUsageStats.totalEmails}
                    limit={data.emailUsageStats.limit}
                    resource="email"
                    variant="contextual"
                    showThreshold={50}
                    nextTierLimit={data.emailUsageStats.limit * 4}
                    nextTierName="Pro"
                  />
                )}

                <Divider />

                <BlockStack gap="200">
                  <Text variant="headingSm" as="h4">
                    Usage Breakdown
                  </Text>
                  <InlineStack gap="600">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">Campaign</Text>
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        {data.emailUsageStats.campaignEmails.toLocaleString()}
                      </Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">Automation</Text>
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        {data.emailUsageStats.automationEmails.toLocaleString()}
                      </Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">Transactional</Text>
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        {data.emailUsageStats.transactionalEmails.toLocaleString()}
                      </Text>
                    </BlockStack>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Current Sending Mode */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h3">
                    Sending Domain
                  </Text>
                  {currentSendingMode === "SHARED" ? (
                    <Badge tone="info">Shared Domain</Badge>
                  ) : (
                    <Badge tone="success">Custom Domain</Badge>
                  )}
                </InlineStack>

                {currentSendingMode === "SHARED" ? (
                  <Banner tone="info">
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm">
                        Emails are sent from{" "}
                        <strong>rewards@rewardspro.io</strong> with your store
                        name. Recipients will see "via rewardspro.io" in some
                        email clients.
                      </Text>
                      <Text as="p" variant="bodySm">
                        Set up a custom domain for better deliverability and
                        professional branding.
                      </Text>
                    </BlockStack>
                  </Banner>
                ) : (
                  <Banner tone="success">
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm">
                        Emails are sent from your verified domain:{" "}
                        <strong>{activeDomain?.domain}</strong>
                      </Text>
                      <InlineStack gap="200">
                        <Button
                          size="slim"
                          onClick={handleDeactivateDomain}
                          loading={isDomainLoading}
                        >
                          Switch to Shared Domain
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </Banner>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Domain Authentication */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h3">
                    Custom Domains
                  </Text>
                  <Button
                    variant="primary"
                    onClick={() => setSetupDomainModalOpen(true)}
                  >
                    Add Domain
                  </Button>
                </InlineStack>

                {data.domains.length === 0 ? (
                  <Box
                    padding="600"
                    background="bg-surface-secondary"
                    borderRadius="200"
                  >
                    <BlockStack gap="200" inlineAlign="center">
                      <Text as="p" tone="subdued">
                        No custom domains configured
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Add your own domain for branded email sending with
                        better deliverability
                      </Text>
                    </BlockStack>
                  </Box>
                ) : (
                  <BlockStack gap="300">
                    {data.domains.map((domain: SendGridDomain) => (
                      <Box
                        key={domain.id}
                        padding="400"
                        background="bg-surface-secondary"
                        borderRadius="200"
                      >
                        <BlockStack gap="300">
                          <InlineStack
                            align="space-between"
                            blockAlign="center"
                          >
                            <BlockStack gap="100">
                              <InlineStack gap="200" blockAlign="center">
                                <Text as="span" fontWeight="semibold">
                                  {domain.subdomain
                                    ? `${domain.subdomain}.${domain.domain}`
                                    : domain.domain}
                                </Text>
                                {getStatusBadge(domain.status)}
                                {data.emailSettings?.customDomainId ===
                                  domain.id && (
                                  <Badge tone="success">Active</Badge>
                                )}
                              </InlineStack>
                              {domain.lastError && (
                                <Text as="p" variant="bodySm" tone="critical">
                                  {domain.lastError}
                                </Text>
                              )}
                            </BlockStack>
                            <InlineStack gap="200">
                              {domain.status === "DNS_PENDING" && (
                                <Button
                                  size="slim"
                                  icon={RefreshIcon}
                                  onClick={() => handleVerifyDomain(domain.id)}
                                  loading={isDomainLoading}
                                >
                                  Verify DNS
                                </Button>
                              )}
                              {domain.status === "VERIFIED" &&
                                data.emailSettings?.customDomainId !==
                                  domain.id && (
                                  <Button
                                    size="slim"
                                    variant="primary"
                                    onClick={() =>
                                      handleActivateDomain(domain.id)
                                    }
                                    loading={isDomainLoading}
                                  >
                                    Activate
                                  </Button>
                                )}
                              <Button
                                size="slim"
                                icon={DeleteIcon}
                                tone="critical"
                                onClick={() => handleDeleteDomain(domain.id)}
                                loading={isDomainLoading}
                              />
                            </InlineStack>
                          </InlineStack>

                          {/* DNS Records Collapsible */}
                          {domain.sendgridDnsRecords && (
                            <>
                              <Button
                                variant="plain"
                                onClick={() =>
                                  setDnsInstructionsOpen(
                                    dnsInstructionsOpen === domain.id
                                      ? null
                                      : domain.id
                                  )
                                }
                                icon={
                                  dnsInstructionsOpen === domain.id
                                    ? ChevronUpIcon
                                    : ChevronDownIcon
                                }
                              >
                                {dnsInstructionsOpen === domain.id
                                  ? "Hide"
                                  : "Show"}{" "}
                                DNS Records
                              </Button>
                              <Collapsible
                                open={dnsInstructionsOpen === domain.id}
                                id={`dns-${domain.id}`}
                              >
                                <Box padding="400" background="bg-surface">
                                  <BlockStack gap="300">
                                    <Text as="p" variant="bodySm">
                                      Add these DNS records to your domain
                                      provider:
                                    </Text>
                                    <DnsRecordTable
                                      records={domain.sendgridDnsRecords}
                                    />
                                  </BlockStack>
                                </Box>
                              </Collapsible>
                            </>
                          )}

                          {/* Verification Status */}
                          <InlineStack gap="400">
                            <InlineStack gap="100" blockAlign="center">
                              <Icon
                                source={
                                  domain.dkimVerified
                                    ? CheckCircleIcon
                                    : XCircleIcon
                                }
                                tone={
                                  domain.dkimVerified ? "success" : "subdued"
                                }
                              />
                              <Text as="span" variant="bodySm">
                                DKIM
                              </Text>
                            </InlineStack>
                            <InlineStack gap="100" blockAlign="center">
                              <Icon
                                source={
                                  domain.spfVerified
                                    ? CheckCircleIcon
                                    : XCircleIcon
                                }
                                tone={domain.spfVerified ? "success" : "subdued"}
                              />
                              <Text as="span" variant="bodySm">
                                SPF
                              </Text>
                            </InlineStack>
                            {domain.verifiedAt && (
                              <Text as="span" variant="bodySm" tone="subdued">
                                Verified{" "}
                                {new Date(domain.verifiedAt).toLocaleDateString()}
                              </Text>
                            )}
                          </InlineStack>
                        </BlockStack>
                      </Box>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Sender Configuration */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">
                  Sender Configuration
                </Text>

                <FormLayout>
                  <TextField
                    label="From Name"
                    value={formValues.senderName}
                    onChange={handleChange("senderName")}
                    helpText="The name that appears in the 'From' field"
                    autoComplete="off"
                  />

                  <FormLayout.Group>
                    <TextField
                      label="From Email"
                      type="email"
                      value={formValues.senderEmail}
                      onChange={handleChange("senderEmail")}
                      helpText={
                        currentSendingMode === "CUSTOM_DOMAIN"
                          ? "Must match your verified domain"
                          : "Will be used as Reply-To in shared mode"
                      }
                      autoComplete="email"
                    />

                    <TextField
                      label="Reply-To Email"
                      type="email"
                      value={formValues.replyToEmail}
                      onChange={handleChange("replyToEmail")}
                      helpText="Where replies are sent (optional)"
                      autoComplete="email"
                    />
                  </FormLayout.Group>
                </FormLayout>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Test Email */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">
                  Test Email
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Send a test email to verify your configuration is working
                  correctly.
                </Text>
                <InlineStack gap="300" blockAlign="end">
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="Email Address"
                      type="email"
                      value={testEmail}
                      onChange={setTestEmail}
                      placeholder="you@example.com"
                      autoComplete="email"
                    />
                  </div>
                  <Button
                    onClick={handleSendTestEmail}
                    loading={isTestEmailSending}
                    disabled={!testEmail || !data.sendgridConfigured}
                  >
                    Send Test
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Brand Customization */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">
                  Brand Customization
                </Text>

                <FormLayout>
                  <FormLayout.Group>
                    <div>
                      <Text as="p" variant="bodyMd">Primary Color</Text>
                      <InlineStack gap="200" blockAlign="center">
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            backgroundColor: formValues.primaryColor,
                            borderRadius: 4,
                            border: "1px solid var(--p-color-border)",
                          }}
                        />
                        <TextField
                          label="Primary color"
                          labelHidden
                          value={formValues.primaryColor}
                          onChange={handleChange("primaryColor")}
                          autoComplete="off"
                          placeholder="#5C6AC4"
                        />
                      </InlineStack>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Main brand color for buttons and links
                      </Text>
                    </div>

                    <div>
                      <Text as="p" variant="bodyMd">Secondary Color</Text>
                      <InlineStack gap="200" blockAlign="center">
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            backgroundColor: formValues.secondaryColor,
                            borderRadius: 4,
                            border: "1px solid var(--p-color-border)",
                          }}
                        />
                        <TextField
                          label="Secondary color"
                          labelHidden
                          value={formValues.secondaryColor}
                          onChange={handleChange("secondaryColor")}
                          autoComplete="off"
                          placeholder="#F4F6F8"
                        />
                      </InlineStack>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Background and accent color
                      </Text>
                    </div>
                  </FormLayout.Group>

                  <Select
                    label="Font Family"
                    options={fontOptions}
                    value={formValues.fontFamily}
                    onChange={handleChange("fontFamily")}
                  />
                </FormLayout>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Compliance */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">
                  Compliance
                </Text>

                <BlockStack gap="300">
                  <Checkbox
                    label="Include unsubscribe link"
                    checked={formValues.includeUnsubscribe}
                    onChange={handleChange("includeUnsubscribe")}
                    helpText="Required by CAN-SPAM Act"
                  />

                  <Checkbox
                    label="Add physical address"
                    checked={formValues.includePhysicalAddress}
                    onChange={handleChange("includePhysicalAddress")}
                    helpText="Required by CAN-SPAM Act"
                  />

                  <Checkbox
                    label="GDPR consent tracking"
                    checked={formValues.gdprEnabled}
                    onChange={handleChange("gdprEnabled")}
                    helpText="Track and honor consent for EU customers"
                  />

                  <Divider />

                  <TextField
                    label="Footer Text"
                    value={formValues.footerText}
                    onChange={handleChange("footerText")}
                    multiline={2}
                    helpText="Copyright and legal text in email footer"
                    autoComplete="off"
                  />
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Send Controls */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">
                  Send Controls
                </Text>

                <FormLayout>
                  <FormLayout.Group>
                    <TextField
                      label="Daily Limit"
                      type="number"
                      value={String(formValues.dailyLimit)}
                      onChange={(v) =>
                        handleChange("dailyLimit")(parseInt(v) || 0)
                      }
                      helpText="Maximum emails per day"
                      autoComplete="off"
                      min="1"
                    />

                    <TextField
                      label="Hourly Limit"
                      type="number"
                      value={String(formValues.hourlyLimit)}
                      onChange={(v) =>
                        handleChange("hourlyLimit")(parseInt(v) || 0)
                      }
                      helpText="Maximum emails per hour"
                      autoComplete="off"
                      min="1"
                    />
                  </FormLayout.Group>

                  <FormLayout.Group>
                    <TextField
                      label="Preferred Send Time"
                      type="time"
                      value={formValues.preferredTime}
                      onChange={handleChange("preferredTime")}
                      helpText="Default time for scheduled emails"
                      autoComplete="off"
                    />

                    <Select
                      label="Timezone"
                      options={timezoneOptions}
                      value={formValues.timezone}
                      onChange={handleChange("timezone")}
                    />
                  </FormLayout.Group>
                </FormLayout>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Save Button */}
          <Layout.Section>
            <Card>
              <InlineStack align="end">
                <Button
                  variant="primary"
                  onClick={handleSubmit}
                  loading={isSaving}
                >
                  Save Settings
                </Button>
              </InlineStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>

      {/* Setup Domain Modal */}
      <Modal
        open={setupDomainModalOpen}
        onClose={() => setSetupDomainModalOpen(false)}
        title="Add Custom Domain"
        primaryAction={{
          content: "Set Up Domain",
          onAction: handleSetupDomain,
          loading: isDomainLoading,
          disabled: !newDomain,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setSetupDomainModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="p">
              Enter your domain to set up branded email sending. You'll need to
              add DNS records to complete verification.
            </Text>
            <TextField
              label="Domain"
              value={newDomain}
              onChange={setNewDomain}
              placeholder="example.com"
              autoComplete="off"
              helpText="Your root domain (not including subdomain)"
            />
            <TextField
              label="Subdomain"
              value={newSubdomain}
              onChange={setNewSubdomain}
              placeholder="mail"
              autoComplete="off"
              helpText="Emails will be sent from subdomain.yourdomain.com"
            />
            <Banner tone="info">
              <Text as="p" variant="bodySm">
                After setup, you'll receive DNS records (CNAME) to add to your
                domain provider. Verification usually takes 24-48 hours.
              </Text>
            </Banner>
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Switch Platform Modal */}
      <Modal
        open={switchPlatformModalOpen}
        onClose={() => setSwitchPlatformModalOpen(false)}
        title={platformToSwitch === "KLAVIYO" ? "Switch to Klaviyo?" : "Switch to In-House Marketing?"}
        primaryAction={{
          content: "Switch Platform",
          onAction: handleSwitchPlatform,
          loading: isSaving,
          destructive: platformToSwitch === "KLAVIYO",
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setSwitchPlatformModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {platformToSwitch === "KLAVIYO" ? (
              <>
                <Banner tone="warning">
                  <Text as="p" variant="bodySm">
                    Switching to Klaviyo will:
                  </Text>
                  <List type="bullet">
                    <List.Item>Archive all draft and scheduled campaigns</List.Item>
                    <List.Item>Disable all in-house automations</List.Item>
                    <List.Item>Your sent campaigns and analytics will be preserved</List.Item>
                  </List>
                </Banner>
                <Text as="p">
                  You'll manage all email campaigns and flows directly in Klaviyo.
                  RewardsPro will sync customer data and events to power your Klaviyo automations.
                </Text>
              </>
            ) : (
              <>
                <Text as="p">
                  You'll use RewardsPro's built-in email campaigns, templates, and automations
                  powered by SendGrid.
                </Text>
                <Text as="p" tone="subdued">
                  Your Klaviyo integration will remain connected for data sync,
                  but you'll build campaigns here instead of in Klaviyo.
                </Text>
              </>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Toast */}
      {toast.active && (
        <Toast
          content={toast.content}
          error={toast.error}
          onDismiss={hideToast}
        />
      )}
    </>
  );
}

// ============================================
// DNS RECORD TABLE COMPONENT
// ============================================

function DnsRecordTable({
  records,
}: {
  records: {
    dkim1?: DnsRecord;
    dkim2?: DnsRecord;
    mail_cname?: DnsRecord;
  };
}) {
  const allRecords = [
    records.dkim1 && { name: "DKIM 1", ...records.dkim1 },
    records.dkim2 && { name: "DKIM 2", ...records.dkim2 },
    records.mail_cname && { name: "Mail CNAME", ...records.mail_cname },
  ].filter(Boolean);

  return (
    <BlockStack gap="200">
      {allRecords.map((record: any, index: number) => (
        <Box
          key={index}
          padding="300"
          background="bg-surface-secondary"
          borderRadius="100"
        >
          <BlockStack gap="100">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="span" fontWeight="semibold" variant="bodySm">
                {record.name}
              </Text>
              <Icon
                source={record.valid ? CheckCircleIcon : ClockIcon}
                tone={record.valid ? "success" : "subdued"}
              />
            </InlineStack>
            <Text as="p" variant="bodySm" tone="subdued">
              Type: <strong>{record.type}</strong>
            </Text>
            <Text as="p" variant="bodySm" breakWord>
              Host: <code style={{ fontSize: "11px" }}>{record.host}</code>
            </Text>
            <Text as="p" variant="bodySm" breakWord>
              Value: <code style={{ fontSize: "11px" }}>{record.data}</code>
            </Text>
          </BlockStack>
        </Box>
      ))}
    </BlockStack>
  );
}
