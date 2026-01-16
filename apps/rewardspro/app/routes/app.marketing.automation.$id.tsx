import { json, LoaderFunctionArgs, ActionFunctionArgs, redirect } from "@remix-run/node";
import { useLoaderData, useNavigate, useActionData, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  TextField,
  Select,
  Banner,
  Divider,
  Box,
  Icon,
  Tooltip,
  ProgressBar,
  Modal,
} from "@shopify/polaris";
import {
  ClockIcon,
  EditIcon,
  DeleteIcon,
  PlayIcon,
  PauseCircleIcon,
  EmailIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ViewIcon,
} from "@shopify/polaris-icons";
import { useState, useCallback } from "react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { sanitizeEmailHtml } from "~/utils/html-sanitizer";

// ============================================
// TYPES
// ============================================

interface Automation {
  id: string;
  name: string;
  trigger: string;
  templateId: string | null;
  isEnabled: boolean;
  delayMinutes: number;
  conditions: any;
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  createdAt: string;
  updatedAt: string;
}

interface Template {
  id: string;
  name: string;
  subject: string;
  previewText: string | null;
  bodyHtml: string | null;
}

// ============================================
// TRIGGER CONFIGURATION
// ============================================

const TRIGGER_CONFIG: Record<string, {
  label: string;
  description: string;
  icon: string;
  category: string;
}> = {
  customer_create: {
    label: "New Customer Joins",
    description: "Sends when a customer creates an account or first purchases",
    icon: "👋",
    category: "Onboarding",
  },
  welcome: {
    label: "Welcome Email",
    description: "Sends to welcome new loyalty program members",
    icon: "👋",
    category: "Onboarding",
  },
  tier_upgrade: {
    label: "Tier Upgrade",
    description: "Sends when a customer advances to a higher tier",
    icon: "🎉",
    category: "Tier Changes",
  },
  tier_change: {
    label: "Tier Change",
    description: "Sends when a customer's tier changes (up or down)",
    icon: "🔄",
    category: "Tier Changes",
  },
  tier_downgrade: {
    label: "Tier Downgrade",
    description: "Sends when a customer drops to a lower tier",
    icon: "📉",
    category: "Tier Changes",
  },
  points_expiry: {
    label: "Points Expiring",
    description: "Sends when a customer's points are about to expire",
    icon: "⏰",
    category: "Reminders",
  },
  birthday: {
    label: "Birthday",
    description: "Sends on the customer's birthday",
    icon: "🎂",
    category: "Special Events",
  },
  win_back: {
    label: "Win Back (Inactive)",
    description: "Sends to customers who haven't purchased recently",
    icon: "💌",
    category: "Re-engagement",
  },
  inactive_60_days: {
    label: "Inactive 60 Days",
    description: "Sends after 60 days of no purchases",
    icon: "💌",
    category: "Re-engagement",
  },
  post_purchase: {
    label: "Post Purchase",
    description: "Sends after a customer completes a purchase",
    icon: "🛍️",
    category: "Transactional",
  },
  cashback_earned: {
    label: "Cashback Earned",
    description: "Sends when a customer earns cashback from a purchase",
    icon: "💰",
    category: "Rewards",
  },
  near_tier_upgrade: {
    label: "Near Tier Upgrade",
    description: "Sends when a customer is close to the next tier",
    icon: "🎯",
    category: "Motivation",
  },
};

const DELAY_OPTIONS = [
  { label: "Immediately", value: "0" },
  { label: "1 hour", value: "60" },
  { label: "6 hours", value: "360" },
  { label: "1 day", value: "1440" },
  { label: "3 days", value: "4320" },
  { label: "7 days", value: "10080" },
  { label: "14 days", value: "20160" },
  { label: "30 days", value: "43200" },
];

// ============================================
// LOADER
// ============================================

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const { id } = params;

  if (!id) {
    throw new Response("Automation ID required", { status: 400 });
  }

  // Fetch automation
  let automation: Automation | null = null;
  try {
    const dbAutomation = await db.emailAutomation.findFirst({
      where: { id, shop },
    });

    if (!dbAutomation) {
      throw new Response("Automation not found", { status: 404 });
    }

    automation = {
      id: dbAutomation.id,
      name: dbAutomation.name,
      trigger: dbAutomation.trigger,
      templateId: dbAutomation.templateId,
      isEnabled: dbAutomation.isEnabled,
      delayMinutes: dbAutomation.delayMinutes,
      conditions: dbAutomation.conditions,
      totalSent: dbAutomation.totalSent,
      totalOpened: dbAutomation.totalOpened,
      totalClicked: dbAutomation.totalClicked,
      createdAt: dbAutomation.createdAt.toISOString(),
      updatedAt: dbAutomation.updatedAt.toISOString(),
    };
  } catch (e: any) {
    if (e instanceof Response) throw e;
    console.error("[Automation Detail] Error:", e);
    throw new Response("Error loading automation", { status: 500 });
  }

  // Fetch all templates for dropdown
  let templates: Template[] = [];
  try {
    const dbTemplates = await db.emailTemplate.findMany({
      where: { shop },
      orderBy: { name: "asc" },
    });
    templates = dbTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      subject: t.subject || "",
      previewText: t.previewText,
      bodyHtml: t.bodyHtml,
    }));
  } catch (e) {
    console.log("[Automation Detail] Could not load templates");
  }

  // Get selected template details
  let selectedTemplate: Template | null = null;
  if (automation.templateId) {
    selectedTemplate = templates.find((t) => t.id === automation.templateId) || null;
  }

  return json({ automation, templates, selectedTemplate });
};

// ============================================
// ACTION
// ============================================

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const { id } = params;

  if (!id) {
    return json({ error: "Automation ID required" }, { status: 400 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "delete") {
    try {
      await db.emailAutomation.deleteMany({
        where: { id, shop },
      });
      return redirect("/app/marketing/automation/workflows");
    } catch (e: any) {
      return json({ error: e.message }, { status: 500 });
    }
  }

  if (intent === "update") {
    const name = formData.get("name") as string;
    const trigger = formData.get("trigger") as string;
    const templateId = formData.get("templateId") as string;
    const delayMinutes = parseInt(formData.get("delayMinutes") as string) || 0;

    if (!name || !trigger) {
      return json({ error: "Name and trigger are required" }, { status: 400 });
    }

    try {
      await db.emailAutomation.updateMany({
        where: { id, shop },
        data: {
          name,
          trigger,
          templateId: templateId || null,
          delayMinutes,
          updatedAt: new Date(),
        },
      });
      return json({ success: true, message: "Changes saved successfully" });
    } catch (e: any) {
      return json({ error: e.message }, { status: 500 });
    }
  }

  if (intent === "toggle") {
    try {
      const automation = await db.emailAutomation.findFirst({
        where: { id, shop },
      });

      if (!automation) {
        return json({ error: "Automation not found" }, { status: 404 });
      }

      const newState = !automation.isEnabled;
      await db.emailAutomation.updateMany({
        where: { id, shop },
        data: {
          isEnabled: newState,
          updatedAt: new Date(),
        },
      });

      return json({
        success: true,
        message: newState
          ? "Automation activated! It will now send emails automatically."
          : "Automation paused. No emails will be sent until reactivated.",
        newState,
      });
    } catch (e: any) {
      return json({ error: e.message }, { status: 500 });
    }
  }

  return json({ error: "Unknown action" }, { status: 400 });
};

// ============================================
// COMPONENT
// ============================================

export default function AutomationDetail() {
  const { automation, templates, selectedTemplate } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const submit = useSubmit();

  // Form state
  const [name, setName] = useState(automation.name);
  const [trigger, setTrigger] = useState(automation.trigger);
  const [templateId, setTemplateId] = useState(automation.templateId || "");
  const [delayMinutes, setDelayMinutes] = useState(automation.delayMinutes.toString());
  const [isEnabled, setIsEnabled] = useState(automation.isEnabled);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Track changes
  const handleChange = useCallback((setter: (v: any) => void) => (value: any) => {
    setter(value);
    setHasChanges(true);
  }, []);

  // Update enabled state when action completes
  if (actionData?.success && actionData?.newState !== undefined && actionData.newState !== isEnabled) {
    setIsEnabled(actionData.newState);
  }

  const handleSave = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "update");
    formData.append("name", name);
    formData.append("trigger", trigger);
    formData.append("templateId", templateId);
    formData.append("delayMinutes", delayMinutes);
    submit(formData, { method: "post" });
    setHasChanges(false);
  }, [name, trigger, templateId, delayMinutes, submit]);

  const handleToggle = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "toggle");
    submit(formData, { method: "post" });
  }, [submit]);

  const handleDelete = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "delete");
    submit(formData, { method: "post" });
  }, [submit]);

  // Get trigger info
  const triggerInfo = TRIGGER_CONFIG[trigger] || {
    label: trigger,
    description: "Custom trigger",
    icon: "📧",
    category: "Custom",
  };

  // Calculate stats
  const openRate = automation.totalSent > 0
    ? Math.round((automation.totalOpened / automation.totalSent) * 100)
    : 0;
  const clickRate = automation.totalOpened > 0
    ? Math.round((automation.totalClicked / automation.totalOpened) * 100)
    : 0;

  // Get current template for preview
  const currentTemplate = templates.find((t) => t.id === templateId);

  // Trigger options for select
  const triggerOptions = Object.entries(TRIGGER_CONFIG).map(([value, config]) => ({
    label: `${config.icon} ${config.label}`,
    value,
  }));

  return (
    <Page
      title={automation.name}
      titleMetadata={
        <Badge tone={isEnabled ? "success" : "info"}>
          {isEnabled ? "Active" : "Paused"}
        </Badge>
      }
      backAction={{
        content: "Automations",
        onAction: () => navigate("/app/marketing/automation/workflows"),
      }}
      primaryAction={{
        content: hasChanges ? "Save Changes" : (isEnabled ? "Pause" : "Activate"),
        icon: hasChanges ? undefined : (isEnabled ? PauseCircleIcon : PlayIcon),
        onAction: hasChanges ? handleSave : handleToggle,
        variant: hasChanges ? "primary" : (isEnabled ? "secondary" : "primary"),
      }}
      secondaryActions={[
        ...(hasChanges ? [{
          content: isEnabled ? "Pause" : "Activate",
          icon: isEnabled ? PauseCircleIcon : PlayIcon,
          onAction: handleToggle,
        }] : []),
        {
          content: "Delete",
          icon: DeleteIcon,
          destructive: true,
          onAction: () => setDeleteModalOpen(true),
        },
      ]}
    >
      <Layout>
        {/* Feedback Banners */}
        {actionData?.error && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => {}}>
              {actionData.error}
            </Banner>
          </Layout.Section>
        )}

        {actionData?.success && (
          <Layout.Section>
            <Banner tone="success" onDismiss={() => {}}>
              {actionData.message}
            </Banner>
          </Layout.Section>
        )}

        {/* Status Warning */}
        {!isEnabled && (
          <Layout.Section>
            <Banner tone="warning">
              <p>This automation is paused. Activate it to start sending emails automatically.</p>
            </Banner>
          </Layout.Section>
        )}

        {/* No Template Warning */}
        {!templateId && (
          <Layout.Section>
            <Banner tone="warning">
              <p>No email template selected. Select a template below to configure what gets sent.</p>
            </Banner>
          </Layout.Section>
        )}

        {/* Performance Stats */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Performance
                </Text>
                {automation.totalSent > 0 && (
                  <Text as="span" variant="bodySm" tone="subdued">
                    Last 30 days
                  </Text>
                )}
              </InlineStack>

              {automation.totalSent === 0 ? (
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <InlineStack gap="300" blockAlign="center" align="center">
                    <Icon source={AlertCircleIcon} tone="subdued" />
                    <Text as="p" tone="subdued">
                      No emails sent yet. {isEnabled ? "Data will appear after the first trigger." : "Activate to start sending."}
                    </Text>
                  </InlineStack>
                </Box>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "24px" }}>
                  <BlockStack gap="100">
                    <Text as="p" variant="heading2xl" fontWeight="bold">
                      {automation.totalSent.toLocaleString()}
                    </Text>
                    <Text as="span" variant="bodySm" tone="subdued">
                      Emails Sent
                    </Text>
                  </BlockStack>

                  <BlockStack gap="100">
                    <Text as="p" variant="heading2xl" fontWeight="bold">
                      {automation.totalOpened.toLocaleString()}
                    </Text>
                    <Text as="span" variant="bodySm" tone="subdued">
                      Opened
                    </Text>
                  </BlockStack>

                  <BlockStack gap="100">
                    <Text as="p" variant="heading2xl" fontWeight="bold">
                      {openRate}%
                    </Text>
                    <Text as="span" variant="bodySm" tone="subdued">
                      Open Rate
                    </Text>
                    <ProgressBar progress={openRate} size="small" tone="primary" />
                  </BlockStack>

                  <BlockStack gap="100">
                    <Text as="p" variant="heading2xl" fontWeight="bold">
                      {clickRate}%
                    </Text>
                    <Text as="span" variant="bodySm" tone="subdued">
                      Click Rate
                    </Text>
                    <ProgressBar progress={clickRate} size="small" tone="success" />
                  </BlockStack>
                </div>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Main Content - Two Column Layout */}
        <Layout.Section>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            {/* Left Column - Settings */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Automation Settings
                </Text>

                <TextField
                  label="Name"
                  value={name}
                  onChange={handleChange(setName)}
                  autoComplete="off"
                  helpText="Internal name for this automation"
                />

                <Divider />

                {/* Trigger Section */}
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    Trigger
                  </Text>

                  <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                    <InlineStack gap="300" blockAlign="start">
                      <div style={{ fontSize: "28px", lineHeight: 1 }}>{triggerInfo.icon}</div>
                      <BlockStack gap="100">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          {triggerInfo.label}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {triggerInfo.description}
                        </Text>
                        <Badge tone="info">{triggerInfo.category}</Badge>
                      </BlockStack>
                    </InlineStack>
                  </Box>

                  <Select
                    label="Change trigger"
                    labelHidden
                    options={triggerOptions}
                    value={trigger}
                    onChange={handleChange(setTrigger)}
                  />
                </BlockStack>

                <Divider />

                {/* Timing Section */}
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    Timing
                  </Text>

                  <Select
                    label="Send email"
                    options={DELAY_OPTIONS}
                    value={delayMinutes}
                    onChange={handleChange(setDelayMinutes)}
                    helpText="How long after the trigger before sending the email"
                  />

                  <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                    <InlineStack gap="200" blockAlign="center">
                      <Icon source={ClockIcon} tone="subdued" />
                      <Text as="span" variant="bodySm" tone="subdued">
                        {delayMinutes === "0"
                          ? "Email sends immediately when triggered"
                          : `Email sends ${DELAY_OPTIONS.find((o) => o.value === delayMinutes)?.label.toLowerCase()} after trigger`}
                      </Text>
                    </InlineStack>
                  </Box>
                </BlockStack>

                <Divider />

                {/* Metadata */}
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodySm" tone="subdued">
                      Created
                    </Text>
                    <Text as="span" variant="bodySm">
                      {formatDate(automation.createdAt)}
                    </Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodySm" tone="subdued">
                      Last updated
                    </Text>
                    <Text as="span" variant="bodySm">
                      {formatDate(automation.updatedAt)}
                    </Text>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Right Column - Email Template */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Email Template
                  </Text>
                  {currentTemplate && (
                    <Button
                      size="slim"
                      icon={EditIcon}
                      onClick={() => navigate(`/app/marketing/templates/${templateId}`)}
                    >
                      Edit Template
                    </Button>
                  )}
                </InlineStack>

                <Select
                  label="Select template"
                  labelHidden
                  options={[
                    { label: "— Select a template —", value: "" },
                    ...templates.map((t) => ({ label: t.name, value: t.id })),
                  ]}
                  value={templateId}
                  onChange={handleChange(setTemplateId)}
                />

                {currentTemplate ? (
                  <BlockStack gap="300">
                    {/* Email Preview Header */}
                    <Box
                      padding="300"
                      background="bg-surface-secondary"
                      borderRadius="200"
                      borderWidth="025"
                      borderColor="border"
                    >
                      <BlockStack gap="200">
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={EmailIcon} tone="subdued" />
                          <Text as="p" variant="bodySm" fontWeight="semibold">
                            {currentTemplate.subject || "No subject"}
                          </Text>
                        </InlineStack>
                        {currentTemplate.previewText && (
                          <Text as="p" variant="bodySm" tone="subdued">
                            {currentTemplate.previewText}
                          </Text>
                        )}
                      </BlockStack>
                    </Box>

                    {/* Email Body Preview */}
                    <Box
                      padding="400"
                      background="bg-surface"
                      borderRadius="200"
                      borderWidth="025"
                      borderColor="border"
                    >
                      <div
                        style={{
                          maxHeight: "300px",
                          overflow: "auto",
                          fontSize: "13px",
                          lineHeight: "1.5",
                          color: "#374151",
                        }}
                      >
                        {currentTemplate.bodyHtml ? (
                          // SECURITY: Sanitize HTML to prevent XSS attacks
                          <div
                            dangerouslySetInnerHTML={{
                              __html: sanitizeEmailHtml(extractEmailContent(currentTemplate.bodyHtml)),
                            }}
                          />
                        ) : (
                          <Text as="p" tone="subdued" alignment="center">
                            No content preview available
                          </Text>
                        )}
                      </div>
                    </Box>

                    {/* Template Actions */}
                    <InlineStack gap="200">
                      <Button
                        size="slim"
                        icon={ViewIcon}
                        url={`/app/marketing/templates/${templateId}`}
                      >
                        View Full Template
                      </Button>
                    </InlineStack>
                  </BlockStack>
                ) : (
                  <Box padding="800" background="bg-surface-secondary" borderRadius="200">
                    <BlockStack gap="300" inlineAlign="center">
                      <Icon source={EmailIcon} tone="subdued" />
                      <Text as="p" tone="subdued" alignment="center">
                        No template selected
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                        Select a template above or create a new one
                      </Text>
                      <Button
                        onClick={() => navigate("/app/marketing/templates/new")}
                      >
                        Create New Template
                      </Button>
                    </BlockStack>
                  </Box>
                )}
              </BlockStack>
            </Card>
          </div>
        </Layout.Section>

        {/* How It Works */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                How this automation works
              </Text>

              <InlineStack gap="400" wrap={false}>
                <Box padding="300" background="bg-surface-secondary" borderRadius="200" minWidth="200px">
                  <BlockStack gap="200" inlineAlign="center">
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        background: "#E3F2FD",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "20px",
                      }}
                    >
                      {triggerInfo.icon}
                    </div>
                    <Text as="p" variant="bodySm" fontWeight="semibold" alignment="center">
                      Trigger
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                      {triggerInfo.label}
                    </Text>
                  </BlockStack>
                </Box>

                <div style={{ display: "flex", alignItems: "center" }}>
                  <Text as="span" tone="subdued">→</Text>
                </div>

                <Box padding="300" background="bg-surface-secondary" borderRadius="200" minWidth="200px">
                  <BlockStack gap="200" inlineAlign="center">
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        background: "#FFF3E0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon source={ClockIcon} tone="warning" />
                    </div>
                    <Text as="p" variant="bodySm" fontWeight="semibold" alignment="center">
                      Wait
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                      {delayMinutes === "0"
                        ? "No delay"
                        : DELAY_OPTIONS.find((o) => o.value === delayMinutes)?.label}
                    </Text>
                  </BlockStack>
                </Box>

                <div style={{ display: "flex", alignItems: "center" }}>
                  <Text as="span" tone="subdued">→</Text>
                </div>

                <Box padding="300" background="bg-surface-secondary" borderRadius="200" minWidth="200px">
                  <BlockStack gap="200" inlineAlign="center">
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        background: "#E8F5E9",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon source={EmailIcon} tone="success" />
                    </div>
                    <Text as="p" variant="bodySm" fontWeight="semibold" alignment="center">
                      Send Email
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                      {currentTemplate?.name || "No template"}
                    </Text>
                  </BlockStack>
                </Box>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete automation?"
        primaryAction={{
          content: "Delete",
          destructive: true,
          onAction: handleDelete,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setDeleteModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p">
              Are you sure you want to delete "{automation.name}"?
            </Text>
            <Text as="p" tone="subdued">
              This will permanently remove the automation and all its settings. The email template will not be deleted.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

// ============================================
// HELPERS
// ============================================

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function extractEmailContent(html: string): string {
  // Try to extract just the main content from email HTML
  // Remove doctype, html, head, body wrapper and just get the content
  const contentMatch = html.match(/<td[^>]*style="padding:\s*\d+px[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
  if (contentMatch) {
    return contentMatch[1];
  }

  // Fallback: strip outer wrapper but keep content
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    return bodyMatch[1];
  }

  return html;
}
