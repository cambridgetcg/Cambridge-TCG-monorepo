import { json, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, Form, useActionData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Button,
  Divider,
  Banner,
  EmptyState,
  Box,
} from "@shopify/polaris";
import { PlusIcon } from "@shopify/polaris-icons";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { v4 as uuidv4 } from "uuid";

// Predefined workflow templates
const WORKFLOW_TEMPLATES = {
  reengagement: {
    name: "Re-engagement Series",
    trigger: "win_back",
    description: "Automatically reach out to customers who haven't purchased in 60 days",
    delayDays: 0,
    steps: [
      { type: 'trigger', label: '60 days no buy', icon: '⏰' },
      { type: 'action', label: 'We Miss You', icon: '📧' },
      { type: 'wait', label: 'Wait 3 Days', icon: '⏳' },
      { type: 'condition', label: 'If: No Open', icon: '🔀' },
      { type: 'action', label: 'Special Offer', icon: '📧' },
      { type: 'action', label: 'Last Chance', icon: '📧' }
    ]
  },
  reward_expiry: {
    name: "Reward Expiry Alert",
    trigger: "points_expiry",
    description: "Remind customers about expiring rewards automatically",
    delayDays: 14,
    steps: [
      { type: 'trigger', label: '14 days to expiry', icon: '⚠️' },
      { type: 'action', label: 'Expiry Warning', icon: '📧' },
      { type: 'wait', label: 'Wait 7 Days', icon: '⏳' },
      { type: 'condition', label: 'If: Not Used', icon: '🔀' },
      { type: 'action', label: 'Final Reminder', icon: '📧' }
    ]
  },
  tier_upgrade: {
    name: "Tier Upgrade Motivation",
    trigger: "tier_upgrade",
    description: "Encourage customers close to the next tier",
    delayDays: 0,
    steps: [
      { type: 'trigger', label: 'Within 20% of next tier', icon: '🎯' },
      { type: 'action', label: 'Upgrade Incentive', icon: '📧' },
      { type: 'wait', label: 'Wait 5 Days', icon: '⏳' },
      { type: 'condition', label: 'If: Clicked', icon: '🔀' },
      { type: 'action', label: 'Add to VIP Segment', icon: '👑' }
    ]
  }
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Get existing automations
  let automations: any[] = [];
  try {
    automations = await db.emailAutomation.findMany({
      where: { shop },
      orderBy: { createdAt: 'desc' }
    });

    // Fetch template names separately
    const templateIds = automations.map(a => a.templateId).filter(Boolean);
    let templates: any[] = [];
    if (templateIds.length > 0) {
      templates = await db.emailTemplate.findMany({
        where: { id: { in: templateIds } },
      });
    }
    const templateMap = new Map(templates.map(t => [t.id, t]));

    automations = automations.map(a => ({
      ...a,
      template: templateMap.get(a.templateId) || { name: 'No template', subject: '' },
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }));
  } catch (e) {
    console.error("[Automation Workflows] Error fetching automations:", e);
  }

  return json({
    shop,
    automations,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create_from_template") {
    const templateKey = formData.get("templateKey") as string;
    const template = WORKFLOW_TEMPLATES[templateKey as keyof typeof WORKFLOW_TEMPLATES];

    if (!template) {
      return json({ error: "Invalid template" }, { status: 400 });
    }

    try {
      // First, create a basic email template for this automation
      const emailTemplate = await db.emailTemplate.create({
        data: {
          id: uuidv4(),
          shop,
          name: `${template.name} - Email`,
          type: template.trigger,
          subject: `${template.name}`,
          content: { blocks: [] }, // Required JSON field - empty block structure
          previewText: template.description,
          bodyHtml: `<p>This is an automated email for ${template.name}.</p>`,
          bodyText: `This is an automated email for ${template.name}.`,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Create the automation
      const automation = await db.emailAutomation.create({
        data: {
          id: uuidv4(),
          shop,
          name: template.name,
          trigger: template.trigger,
          templateId: emailTemplate.id,
          isEnabled: false, // Start as disabled so user can customize
          delayMinutes: template.delayDays * 24 * 60,
          conditions: JSON.stringify({ source: templateKey }),
          totalSent: 0,
          totalOpened: 0,
          totalClicked: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      return json({
        success: true,
        message: `"${template.name}" automation created! Click Edit to customize before enabling.`,
        automationId: automation.id
      });
    } catch (e: any) {
      console.error("[Automation Workflows] Error creating automation:", e);
      return json({ error: e.message }, { status: 500 });
    }
  }

  if (intent === "toggle") {
    const automationId = formData.get("automationId") as string;

    try {
      const automation = await db.emailAutomation.findFirst({
        where: { id: automationId, shop },
      });

      if (!automation) {
        return json({ error: "Automation not found" }, { status: 404 });
      }

      await db.emailAutomation.updateMany({
        where: { id: automationId, shop },
        data: {
          isEnabled: !automation.isEnabled,
          updatedAt: new Date(),
        },
      });

      return json({
        success: true,
        message: `Automation ${automation.isEnabled ? 'paused' : 'activated'}`
      });
    } catch (e: any) {
      return json({ error: e.message }, { status: 500 });
    }
  }

  return json({ error: "Unknown action" }, { status: 400 });
};

export default function AutomationWorkflows() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();

  return (
    <Page
      title="Automated Campaign Flows"
      subtitle="Create trigger-based email workflows"
      backAction={{ content: "Marketing", onAction: () => navigate("/app/marketing") }}
      primaryAction={{
        content: "Create Automation",
        icon: PlusIcon,
        onAction: () => navigate("/app/marketing/automation/create"),
      }}
    >
      <Layout>
        {actionData?.error && (
          <Layout.Section>
            <Banner tone="critical" title="Error">
              <p>{actionData.error}</p>
            </Banner>
          </Layout.Section>
        )}

        {actionData?.success && (
          <Layout.Section>
            <Banner tone="success" title="Success">
              <p>{actionData.message}</p>
            </Banner>
          </Layout.Section>
        )}

        {/* Pre-built Workflows Section */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h3">
                Recommended Workflows
              </Text>
              <Text variant="bodyMd" tone="subdued" as="p">
                Start with these proven automation flows. Click "Use This Template" to create an automation you can customize.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Re-engagement Series */}
        <Layout.Section>
          <WorkflowCard
            templateKey="reengagement"
            title={WORKFLOW_TEMPLATES.reengagement.name}
            status="recommended"
            description={WORKFLOW_TEMPLATES.reengagement.description}
            steps={WORKFLOW_TEMPLATES.reengagement.steps}
          />
        </Layout.Section>

        {/* Reward Expiry Workflow */}
        <Layout.Section>
          <WorkflowCard
            templateKey="reward_expiry"
            title={WORKFLOW_TEMPLATES.reward_expiry.name}
            status="recommended"
            description={WORKFLOW_TEMPLATES.reward_expiry.description}
            steps={WORKFLOW_TEMPLATES.reward_expiry.steps}
          />
        </Layout.Section>

        {/* Tier Upgrade Workflow */}
        <Layout.Section>
          <WorkflowCard
            templateKey="tier_upgrade"
            title={WORKFLOW_TEMPLATES.tier_upgrade.name}
            status="recommended"
            description={WORKFLOW_TEMPLATES.tier_upgrade.description}
            steps={WORKFLOW_TEMPLATES.tier_upgrade.steps}
          />
        </Layout.Section>

        {/* Active Automations */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd" as="h3">
                  Your Automations
                </Text>
                <Badge tone="info">{data.automations.length} total</Badge>
              </InlineStack>

              {data.automations.length === 0 ? (
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <Text as="p" tone="subdued" alignment="center">
                    No automations yet. Use a template above or create a custom automation.
                  </Text>
                </Box>
              ) : (
                <BlockStack gap="300">
                  {data.automations.map((automation, index) => (
                    <Box
                      key={automation.id}
                      padding="400"
                      background="bg-surface-secondary"
                      borderRadius="200"
                    >
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="100">
                          <InlineStack gap="200" blockAlign="center">
                            <Text variant="bodyMd" as="p" fontWeight="semibold">
                              {automation.name}
                            </Text>
                            <Badge tone={automation.isEnabled ? "success" : "info"}>
                              {automation.isEnabled ? "Active" : "Paused"}
                            </Badge>
                          </InlineStack>
                          <Text variant="bodySm" tone="subdued" as="p">
                            Template: {automation.template?.name || "None"} • Trigger: {automation.trigger}
                          </Text>
                          <Text variant="bodySm" tone="subdued" as="p">
                            Sent: {automation.totalSent} • Opened: {automation.totalOpened} • Clicked: {automation.totalClicked}
                          </Text>
                        </BlockStack>
                        <InlineStack gap="200">
                          <Button
                            size="slim"
                            onClick={() => navigate(`/app/marketing/automation/${automation.id}`)}
                          >
                            Edit
                          </Button>
                          <Form method="post">
                            <input type="hidden" name="intent" value="toggle" />
                            <input type="hidden" name="automationId" value={automation.id} />
                            <Button
                              size="slim"
                              variant={automation.isEnabled ? "secondary" : "primary"}
                              submit
                            >
                              {automation.isEnabled ? "Pause" : "Activate"}
                            </Button>
                          </Form>
                        </InlineStack>
                      </InlineStack>
                    </Box>
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

interface WorkflowStep {
  type: 'trigger' | 'action' | 'wait' | 'condition';
  label: string;
  icon: string;
}

interface WorkflowCardProps {
  templateKey: string;
  title: string;
  status: 'recommended' | 'active' | 'paused';
  description: string;
  steps: WorkflowStep[];
}

function WorkflowCard({ templateKey, title, status, description, steps }: WorkflowCardProps) {
  const navigate = useNavigate();

  return (
    <Card>
      <BlockStack gap="400">
        {/* Header */}
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="200">
            <Text variant="headingSm" as="h3" fontWeight="semibold">
              {title}
            </Text>
            <Text variant="bodySm" tone="subdued" as="p">
              {description}
            </Text>
          </BlockStack>
          <Badge tone={status === 'active' ? 'success' : status === 'paused' ? 'info' : 'attention'}>
            {status === 'recommended' ? 'Template' : status === 'active' ? 'Active' : 'Paused'}
          </Badge>
        </InlineStack>

        {/* Visual Workflow */}
        <div style={{
          padding: '16px',
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
          overflowX: 'auto'
        }}>
          <InlineStack gap="300" blockAlign="center">
            {steps.map((step, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <WorkflowNode step={step} />
                {index < steps.length - 1 && (
                  <div style={{
                    width: '32px',
                    height: '2px',
                    backgroundColor: '#c9cccf',
                    position: 'relative'
                  }}>
                    <div style={{
                      position: 'absolute',
                      right: '-4px',
                      top: '-3px',
                      width: '0',
                      height: '0',
                      borderLeft: '8px solid #c9cccf',
                      borderTop: '4px solid transparent',
                      borderBottom: '4px solid transparent'
                    }} />
                  </div>
                )}
              </div>
            ))}
          </InlineStack>
        </div>

        {/* Actions */}
        <InlineStack gap="200" align="end">
          <Button onClick={() => navigate(`/app/marketing/automation/create?template=${templateKey}`)}>
            Customize First
          </Button>
          <Form method="post">
            <input type="hidden" name="intent" value="create_from_template" />
            <input type="hidden" name="templateKey" value={templateKey} />
            <Button variant="primary" submit>
              Use This Template
            </Button>
          </Form>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

interface WorkflowNodeProps {
  step: WorkflowStep;
}

function WorkflowNode({ step }: WorkflowNodeProps) {
  const getNodeColor = () => {
    switch (step.type) {
      case 'trigger':
        return { bg: '#e8f5e9', border: '#4caf50' };
      case 'action':
        return { bg: '#e3f2fd', border: '#2196f3' };
      case 'wait':
        return { bg: '#fff3e0', border: '#ff9800' };
      case 'condition':
        return { bg: '#f3e5f5', border: '#9c27b0' };
      default:
        return { bg: '#f5f5f5', border: '#9e9e9e' };
    }
  };

  const colors = getNodeColor();

  return (
    <div style={{
      minWidth: '100px',
      padding: '12px',
      backgroundColor: colors.bg,
      border: `2px solid ${colors.border}`,
      borderRadius: '8px',
      textAlign: 'center'
    }}>
      <BlockStack gap="100">
        <div style={{ fontSize: '20px' }}>{step.icon}</div>
        <Text variant="bodySm" as="span" fontWeight="medium">
          {step.label}
        </Text>
      </BlockStack>
    </div>
  );
}
