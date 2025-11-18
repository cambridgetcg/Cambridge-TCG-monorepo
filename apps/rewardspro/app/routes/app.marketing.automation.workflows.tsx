import { json, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
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
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Get existing automations
  const automations = await db.emailAutomation.findMany({
    where: { shop },
    include: {
      template: {
        select: {
          name: true,
          subject: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return json({
    shop,
    automations,
  });
};

export default function AutomationWorkflows() {
  const data = useLoaderData<typeof loader>();

  return (
    <Page
      title="Automated Campaign Flows"
      subtitle="Create trigger-based email workflows"
      backAction={{ content: "Marketing", url: "/app/marketing" }}
      primaryAction={{
        content: "Create Automation",
        url: "/app/marketing/automation/create"
      }}
    >
      <Layout>
        {/* Pre-built Workflows Section */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h3">
                Recommended Workflows
              </Text>
              <Text variant="bodyMd" tone="subdued" as="p">
                Start with these proven automation flows based on analytics insights
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Re-engagement Series */}
        <Layout.Section>
          <WorkflowCard
            title="Re-engagement Series (from Analytics)"
            status="recommended"
            description="Automatically reach out to customers who haven't purchased in 60 days"
            steps={[
              {
                type: 'trigger',
                label: '60 days no buy',
                icon: '⏰'
              },
              {
                type: 'action',
                label: 'We Miss You',
                icon: '📧'
              },
              {
                type: 'wait',
                label: 'Wait 3 Days',
                icon: '⏳'
              },
              {
                type: 'condition',
                label: 'If: No Open',
                icon: '🔀'
              },
              {
                type: 'action',
                label: 'Special Offer',
                icon: '📧'
              },
              {
                type: 'action',
                label: 'Last Chance',
                icon: '📧'
              }
            ]}
          />
        </Layout.Section>

        {/* Reward Expiry Workflow */}
        <Layout.Section>
          <WorkflowCard
            title="Reward Expiry Alert"
            status="recommended"
            description="Remind customers about expiring rewards automatically"
            steps={[
              {
                type: 'trigger',
                label: '14 days to expiry',
                icon: '⚠️'
              },
              {
                type: 'action',
                label: 'Expiry Warning',
                icon: '📧'
              },
              {
                type: 'wait',
                label: 'Wait 7 Days',
                icon: '⏳'
              },
              {
                type: 'condition',
                label: 'If: Not Used',
                icon: '🔀'
              },
              {
                type: 'action',
                label: 'Final Reminder',
                icon: '📧'
              }
            ]}
          />
        </Layout.Section>

        {/* Tier Upgrade Workflow */}
        <Layout.Section>
          <WorkflowCard
            title="Tier Upgrade Motivation"
            status="recommended"
            description="Encourage customers close to the next tier"
            steps={[
              {
                type: 'trigger',
                label: 'Within 20% of next tier',
                icon: '🎯'
              },
              {
                type: 'action',
                label: 'Upgrade Incentive',
                icon: '📧'
              },
              {
                type: 'wait',
                label: 'Wait 5 Days',
                icon: '⏳'
              },
              {
                type: 'condition',
                label: 'If: Clicked',
                icon: '🔀'
              },
              {
                type: 'action',
                label: 'Add to VIP Segment',
                icon: '👑'
              }
            ]}
          />
        </Layout.Section>

        {/* Active Automations */}
        {data.automations.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">
                  Your Active Automations
                </Text>

                <BlockStack gap="200">
                  {data.automations.map((automation, index) => (
                    <div key={automation.id}>
                      {index > 0 && <Divider />}
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="100">
                          <Text variant="bodyMd" as="p" fontWeight="medium">
                            {automation.name}
                          </Text>
                          <Text variant="bodySm" tone="subdued" as="p">
                            Template: {automation.template.name}
                          </Text>
                          <Text variant="bodySm" tone="subdued" as="p">
                            Sent: {automation.totalSent} • Opened: {automation.totalOpened} • Clicked: {automation.totalClicked}
                          </Text>
                        </BlockStack>
                        <Badge tone={automation.isEnabled ? "success" : "info"}>
                          {automation.isEnabled ? "Active" : "Paused"}
                        </Badge>
                      </InlineStack>
                    </div>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
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
  title: string;
  status: 'recommended' | 'active' | 'paused';
  description: string;
  steps: WorkflowStep[];
}

function WorkflowCard({ title, status, description, steps }: WorkflowCardProps) {
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
            {status === 'recommended' ? 'Recommended' : status === 'active' ? 'Active' : 'Paused'}
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
          <Button>Customize</Button>
          <Button variant="primary">Activate Workflow</Button>
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
