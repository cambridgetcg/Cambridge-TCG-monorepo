import { json } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useActionData, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Button,
  Banner,
  Box,
  Icon,
  Tooltip,
  Tabs,
} from "@shopify/polaris";
import {
  ClockIcon,
  PlayIcon,
  PauseCircleIcon,
  EditIcon,
  DeleteIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { v4 as uuidv4 } from "uuid";
import { guardInHouseRoute } from "~/services/marketing-mode.server";
import { useState, useCallback } from "react";

// ============================================
// AUTOMATION TEMPLATES - Merchant Focused
// ============================================

const AUTOMATION_TEMPLATES = {
  welcome: {
    id: "welcome",
    name: "Welcome New Members",
    description: "Greet new loyalty program members and explain their benefits",
    trigger: "customer_create",
    triggerLabel: "When a customer joins",
    expectedResult: "Higher engagement from day one",
    icon: "👋",
    difficulty: "easy",
    estimatedSetup: "2 min",
    avgOpenRate: "45%",
  },
  tier_upgrade: {
    id: "tier_upgrade",
    name: "Tier Upgrade Celebration",
    description: "Congratulate customers when they reach a new tier",
    trigger: "tier_change",
    triggerLabel: "When customer upgrades tier",
    expectedResult: "Increased loyalty and repeat purchases",
    icon: "🎉",
    difficulty: "easy",
    estimatedSetup: "2 min",
    avgOpenRate: "52%",
  },
  win_back: {
    id: "win_back",
    name: "Win Back Inactive Customers",
    description: "Re-engage customers who haven't purchased recently",
    trigger: "inactive_60_days",
    triggerLabel: "After 60 days of no orders",
    expectedResult: "Recover lost customers",
    icon: "💌",
    difficulty: "medium",
    estimatedSetup: "5 min",
    avgOpenRate: "28%",
  },
  birthday: {
    id: "birthday",
    name: "Birthday Rewards",
    description: "Send special birthday wishes with an exclusive offer",
    trigger: "birthday",
    triggerLabel: "On customer's birthday",
    expectedResult: "Personal touch increases loyalty",
    icon: "🎂",
    difficulty: "easy",
    estimatedSetup: "3 min",
    avgOpenRate: "48%",
  },
  cashback_reminder: {
    id: "cashback_reminder",
    name: "Cashback Balance Reminder",
    description: "Remind customers about their available store credit",
    trigger: "cashback_earned",
    triggerLabel: "When cashback is earned",
    expectedResult: "Drive repeat purchases",
    icon: "💰",
    difficulty: "easy",
    estimatedSetup: "2 min",
    avgOpenRate: "38%",
  },
  tier_milestone: {
    id: "tier_milestone",
    name: "Tier Progress Nudge",
    description: "Encourage customers who are close to the next tier",
    trigger: "near_tier_upgrade",
    triggerLabel: "When 80% to next tier",
    expectedResult: "Motivate spending to reach next tier",
    icon: "🎯",
    difficulty: "medium",
    estimatedSetup: "4 min",
    avgOpenRate: "35%",
  },
};

// ============================================
// LOADER
// ============================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Guard: Redirect Klaviyo mode users to main Marketing Hub
  const guardRedirect = await guardInHouseRoute(shop);
  if (guardRedirect) return guardRedirect;

  // Get existing automations with stats
  let automations: any[] = [];
  try {
    automations = await prisma.emailAutomation.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
    });

    // Fetch template names separately
    const templateIds = automations.map((a) => a.templateId).filter(Boolean);
    let templates: any[] = [];
    if (templateIds.length > 0) {
      templates = await prisma.emailTemplate.findMany({
        where: { id: { in: templateIds } },
      });
    }
    const templateMap = new Map(templates.map((t) => [t.id, t]));

    automations = automations.map((a) => ({
      ...a,
      template: templateMap.get(a.templateId) || null,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }));
  } catch (e) {
    console.error("[Automation Workflows] Error fetching automations:", e);
  }

  // Calculate stats
  const activeCount = automations.filter((a) => a.isEnabled).length;
  const totalSent = automations.reduce((sum, a) => sum + (a.totalSent || 0), 0);
  const totalOpened = automations.reduce((sum, a) => sum + (a.totalOpened || 0), 0);

  return json({
    shop,
    automations,
    stats: {
      total: automations.length,
      active: activeCount,
      paused: automations.length - activeCount,
      totalSent,
      totalOpened,
      openRate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0,
    },
  });
};

// ============================================
// ACTION
// ============================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Rate-based model: All plans can use automations (limits differentiate)
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create_automation") {
    const templateId = formData.get("templateId") as string;
    const template = AUTOMATION_TEMPLATES[templateId as keyof typeof AUTOMATION_TEMPLATES];

    if (!template) {
      return json({ error: "Invalid template" }, { status: 400 });
    }

    try {
      // Create email template
      const emailTemplate = await prisma.emailTemplate.create({
        data: {
          id: uuidv4(),
          shop,
          name: `${template.name} - Email`,
          type: template.trigger,
          subject: getDefaultSubject(template.id),
          content: { blocks: [] },
          previewText: template.description,
          bodyHtml: getDefaultEmailHtml(template.id),
          bodyText: getDefaultEmailText(template.id),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Create automation
      const automation = await prisma.emailAutomation.create({
        data: {
          id: uuidv4(),
          shop,
          name: template.name,
          trigger: template.trigger,
          templateId: emailTemplate.id,
          isEnabled: false,
          delayMinutes: 0,
          conditions: { templateSource: templateId },
          totalSent: 0,
          totalOpened: 0,
          totalClicked: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      return json({
        success: true,
        message: `"${template.name}" automation created! Enable it when you're ready.`,
        automationId: automation.id,
      });
    } catch (e: any) {
      console.error("[Automation Workflows] Error creating automation:", e);
      return json({ error: e.message }, { status: 500 });
    }
  }

  if (intent === "toggle") {
    const automationId = formData.get("automationId") as string;

    try {
      const automation = await prisma.emailAutomation.findFirst({
        where: { id: automationId, shop },
      });

      if (!automation) {
        return json({ error: "Automation not found" }, { status: 404 });
      }

      await prisma.emailAutomation.updateMany({
        where: { id: automationId, shop },
        data: {
          isEnabled: !automation.isEnabled,
          updatedAt: new Date(),
        },
      });

      return json({
        success: true,
        message: automation.isEnabled
          ? "Automation paused"
          : "Automation activated! It will now run automatically.",
      });
    } catch (e: any) {
      return json({ error: e.message }, { status: 500 });
    }
  }

  if (intent === "delete") {
    const automationId = formData.get("automationId") as string;

    try {
      await prisma.emailAutomation.deleteMany({
        where: { id: automationId, shop },
      });

      return json({
        success: true,
        message: "Automation deleted",
      });
    } catch (e: any) {
      return json({ error: e.message }, { status: 500 });
    }
  }

  return json({ error: "Unknown action" }, { status: 400 });
};

// ============================================
// HELPERS
// ============================================

function getDefaultSubject(templateId: string): string {
  switch (templateId) {
    case "welcome":
      return "Welcome to our rewards program! 🎉";
    case "tier_upgrade":
      return "Congratulations! You've been upgraded! 🏆";
    case "win_back":
      return "We miss you! Here's something special...";
    case "birthday":
      return "Happy Birthday! 🎂 A gift just for you";
    case "cashback_reminder":
      return "You have store credit waiting! 💰";
    case "tier_milestone":
      return "You're so close to the next tier! 🎯";
    default:
      return "A message from us";
  }
}

function getDefaultEmailHtml(templateId: string): string {
  const templates: Record<string, string> = {
    welcome: `<p>Welcome to our loyalty program! We're excited to have you.</p>
<p>As a member, you'll earn cashback on every purchase. The more you shop, the more you earn!</p>
<p>Start shopping today and watch your rewards grow.</p>`,
    tier_upgrade: `<p>Congratulations on reaching a new tier!</p>
<p>You've worked hard to get here, and now you'll enjoy even better rewards.</p>
<p>Your new benefits are waiting - check them out!</p>`,
    win_back: `<p>We noticed it's been a while since your last visit.</p>
<p>We'd love to see you again! Here's a special offer just for you.</p>
<p>Come back and discover what's new.</p>`,
    birthday: `<p>Happy Birthday! 🎂</p>
<p>We hope you have an amazing day filled with joy and celebration.</p>
<p>As a birthday gift, we've got something special waiting for you.</p>`,
    cashback_reminder: `<p>Great news! You have store credit available.</p>
<p>Don't let it go unused - treat yourself to something special.</p>
<p>Shop now and put your rewards to work!</p>`,
    tier_milestone: `<p>You're almost there!</p>
<p>Just a little more and you'll reach the next tier with even better rewards.</p>
<p>Keep going - you're so close!</p>`,
  };
  return templates[templateId] || "<p>Thank you for being a valued customer.</p>";
}

function getDefaultEmailText(templateId: string): string {
  return getDefaultEmailHtml(templateId).replace(/<[^>]*>/g, "").trim();
}

// ============================================
// COMPONENT
// ============================================

export default function AutomationWorkflows() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const submit = useSubmit();
  const [selectedTab, setSelectedTab] = useState(0);

  const handleTabChange = useCallback((selectedTabIndex: number) => {
    setSelectedTab(selectedTabIndex);
  }, []);

  const handleCreateAutomation = (templateId: string) => {
    const formData = new FormData();
    formData.append("intent", "create_automation");
    formData.append("templateId", templateId);
    submit(formData, { method: "post" });
  };

  const handleToggle = (automationId: string) => {
    const formData = new FormData();
    formData.append("intent", "toggle");
    formData.append("automationId", automationId);
    submit(formData, { method: "post" });
  };

  const handleDelete = (automationId: string) => {
    if (confirm("Are you sure you want to delete this automation?")) {
      const formData = new FormData();
      formData.append("intent", "delete");
      formData.append("automationId", automationId);
      submit(formData, { method: "post" });
    }
  };

  // Check which templates are already in use
  const usedTemplates = new Set(
    data.automations.map((a: any) => (a.conditions as any)?.templateSource).filter(Boolean)
  );

  const tabs = [
    {
      id: "active",
      content: `My Automations (${data.stats.total})`,
      panelID: "active-automations",
    },
    {
      id: "templates",
      content: "Add New",
      panelID: "automation-templates",
    },
  ];

  return (
    <Page
      title="Email Automations"
      subtitle="Set up automated emails that send themselves"
      backAction={{ content: "Marketing", onAction: () => navigate("/app/marketing") }}
    >
      <Layout>
        {/* Feedback Banners */}
        {(actionData as any)?.error && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => {}}>
              {(actionData as any).error}
            </Banner>
          </Layout.Section>
        )}

        {(actionData as any)?.success && (
          <Layout.Section>
            <Banner tone="success" onDismiss={() => {}}>
              {(actionData as any).message}
            </Banner>
          </Layout.Section>
        )}

        {/* Stats Overview */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd" as="h2">
                  Performance Overview
                </Text>
                {data.stats.totalSent > 0 && (
                  <Badge tone="success">{`${data.stats.openRate}% open rate`}</Badge>
                )}
              </InlineStack>

              <InlineStack gap="800" wrap={false}>
                <BlockStack gap="100">
                  <Text variant="headingXl" as="p" fontWeight="bold">
                    {data.stats.active}
                  </Text>
                  <Text variant="bodySm" as="span" tone="subdued">
                    Active automations
                  </Text>
                </BlockStack>

                <BlockStack gap="100">
                  <Text variant="headingXl" as="p" fontWeight="bold">
                    {data.stats.totalSent.toLocaleString()}
                  </Text>
                  <Text variant="bodySm" as="span" tone="subdued">
                    Emails sent
                  </Text>
                </BlockStack>

                <BlockStack gap="100">
                  <Text variant="headingXl" as="p" fontWeight="bold">
                    {data.stats.totalOpened.toLocaleString()}
                  </Text>
                  <Text variant="bodySm" as="span" tone="subdued">
                    Emails opened
                  </Text>
                </BlockStack>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Tabs: My Automations / Add New */}
        <Layout.Section>
          <Card padding="0">
            <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
              <Box padding="400">
                {/* TAB: My Automations */}
                {selectedTab === 0 && (
                  <BlockStack gap="400">
                    {data.automations.length === 0 ? (
                      <Box padding="800" background="bg-surface-secondary" borderRadius="200">
                        <BlockStack gap="300" inlineAlign="center">
                          <Text variant="headingMd" as="p" alignment="center">
                            No automations yet
                          </Text>
                          <Text variant="bodyMd" as="p" tone="subdued" alignment="center">
                            Get started by adding your first automation from our templates.
                          </Text>
                          <Button variant="primary" onClick={() => setSelectedTab(1)}>
                            Browse Templates
                          </Button>
                        </BlockStack>
                      </Box>
                    ) : (
                      <BlockStack gap="300">
                        {data.automations.map((automation: any) => (
                          <AutomationCard
                            key={automation.id}
                            automation={automation}
                            onToggle={() => handleToggle(automation.id)}
                            onEdit={() => navigate(`/app/marketing/automation/${automation.id}`)}
                            onDelete={() => handleDelete(automation.id)}
                          />
                        ))}
                      </BlockStack>
                    )}
                  </BlockStack>
                )}

                {/* TAB: Add New */}
                {selectedTab === 1 && (
                  <BlockStack gap="400">
                    <Text variant="bodyMd" as="p" tone="subdued">
                      Choose a template to get started. Each automation can be customized after creation.
                    </Text>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))",
                        gap: "16px",
                      }}
                    >
                      {Object.values(AUTOMATION_TEMPLATES).map((template) => (
                        <TemplateCard
                          key={template.id}
                          template={template}
                          isUsed={usedTemplates.has(template.id)}
                          onCreate={() => handleCreateAutomation(template.id)}
                        />
                      ))}
                    </div>
                  </BlockStack>
                )}
              </Box>
            </Tabs>
          </Card>
        </Layout.Section>

        {/* Help Section */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">
                How automations work
              </Text>
              <BlockStack gap="200">
                <InlineStack gap="300" blockAlign="start">
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: "#E3F2FD",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#1976D2",
                      flexShrink: 0,
                    }}
                  >
                    1
                  </div>
                  <BlockStack gap="100">
                    <Text variant="bodyMd" as="p" fontWeight="semibold">
                      Choose a trigger
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      Select when the email should be sent (e.g., when a customer joins, upgrades tier, etc.)
                    </Text>
                  </BlockStack>
                </InlineStack>

                <InlineStack gap="300" blockAlign="start">
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: "#E3F2FD",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#1976D2",
                      flexShrink: 0,
                    }}
                  >
                    2
                  </div>
                  <BlockStack gap="100">
                    <Text variant="bodyMd" as="p" fontWeight="semibold">
                      Customize the email
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      Edit the subject line, content, and design to match your brand
                    </Text>
                  </BlockStack>
                </InlineStack>

                <InlineStack gap="300" blockAlign="start">
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: "#E3F2FD",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#1976D2",
                      flexShrink: 0,
                    }}
                  >
                    3
                  </div>
                  <BlockStack gap="100">
                    <Text variant="bodyMd" as="p" fontWeight="semibold">
                      Activate and relax
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      Turn it on and the emails will send automatically. Track performance anytime.
                    </Text>
                  </BlockStack>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

// ============================================
// AUTOMATION CARD COMPONENT
// ============================================

interface AutomationCardProps {
  automation: any;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function AutomationCard({ automation, onToggle, onEdit, onDelete }: AutomationCardProps) {
  const openRate =
    automation.totalSent > 0
      ? Math.round((automation.totalOpened / automation.totalSent) * 100)
      : 0;

  return (
    <Box
      padding="400"
      background={automation.isEnabled ? "bg-surface-success" : "bg-surface-secondary"}
      borderRadius="200"
      borderWidth="025"
      borderColor={automation.isEnabled ? "border-success" : "border"}
    >
      <InlineStack align="space-between" blockAlign="start">
        <BlockStack gap="200">
          <InlineStack gap="200" blockAlign="center">
            <Text variant="headingSm" as="h3">
              {automation.name}
            </Text>
            <Badge tone={automation.isEnabled ? "success" : "info"}>
              {automation.isEnabled ? "Active" : "Paused"}
            </Badge>
          </InlineStack>

          <Text variant="bodySm" as="p" tone="subdued">
            Trigger: {formatTriggerName(automation.trigger)}
          </Text>

          {automation.totalSent > 0 && (
            <InlineStack gap="400">
              <Text variant="bodySm" as="span" tone="subdued">
                {automation.totalSent.toLocaleString()} sent
              </Text>
              <Text variant="bodySm" as="span" tone="subdued">
                {openRate}% opened
              </Text>
              <Text variant="bodySm" as="span" tone="subdued">
                {automation.totalClicked.toLocaleString()} clicked
              </Text>
            </InlineStack>
          )}
        </BlockStack>

        <InlineStack gap="200">
          <Tooltip content={automation.isEnabled ? "Pause" : "Activate"}>
            <Button
              icon={automation.isEnabled ? PauseCircleIcon : PlayIcon}
              onClick={onToggle}
              variant={automation.isEnabled ? "secondary" : "primary"}
              size="slim"
            />
          </Tooltip>
          <Tooltip content="Edit">
            <Button icon={EditIcon} onClick={onEdit} variant="secondary" size="slim" />
          </Tooltip>
          <Tooltip content="Delete">
            <Button icon={DeleteIcon} onClick={onDelete} variant="secondary" tone="critical" size="slim" />
          </Tooltip>
        </InlineStack>
      </InlineStack>
    </Box>
  );
}

// ============================================
// TEMPLATE CARD COMPONENT
// ============================================

interface TemplateCardProps {
  template: (typeof AUTOMATION_TEMPLATES)[keyof typeof AUTOMATION_TEMPLATES];
  isUsed: boolean;
  onCreate: () => void;
}

function TemplateCard({ template, isUsed, onCreate }: TemplateCardProps) {
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="start">
          <InlineStack gap="200" blockAlign="center">
            <span style={{ fontSize: 24 }}>{template.icon}</span>
            <Text variant="headingSm" as="h3">
              {template.name}
            </Text>
          </InlineStack>
          {isUsed && <Badge tone="info">Added</Badge>}
        </InlineStack>

        <Text variant="bodySm" as="p" tone="subdued">
          {template.description}
        </Text>

        <Box padding="200" background="bg-surface-secondary" borderRadius="100">
          <InlineStack gap="200" blockAlign="center">
            <Icon source={ClockIcon} tone="subdued" />
            <Text variant="bodySm" as="span" tone="subdued">
              {template.triggerLabel}
            </Text>
          </InlineStack>
        </Box>

        <InlineStack gap="200">
          <Badge tone="success">{`${template.avgOpenRate} avg. open rate`}</Badge>
          <Badge>{`${template.estimatedSetup} setup`}</Badge>
        </InlineStack>

        <Button
          variant={isUsed ? "secondary" : "primary"}
          onClick={onCreate}
          fullWidth
          disabled={isUsed}
        >
          {isUsed ? "Already Added" : "Add This Automation"}
        </Button>
      </BlockStack>
    </Card>
  );
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatTriggerName(trigger: string): string {
  const triggerNames: Record<string, string> = {
    customer_create: "New customer joins",
    tier_change: "Customer upgrades tier",
    inactive_60_days: "60 days inactive",
    birthday: "Customer birthday",
    cashback_earned: "Cashback earned",
    near_tier_upgrade: "Near next tier",
    win_back: "Win back inactive",
    points_expiry: "Points expiring",
  };
  return triggerNames[trigger] || trigger;
}
