import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  Banner,
  BlockStack,
  Text,
  Box,
  InlineStack,
  Badge,
  Icon,
} from "@shopify/polaris";
import { CheckIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// ============= TYPES =============

type AutomationSettings = {
  autoCashbackProcessingEnabled: boolean;
  tierRecalculationEnabled: boolean;
  emailMarketingEnabled: boolean;
};

type LoaderData = {
  settings: AutomationSettings;
  shop: string;
};

// ============= LOADER =============

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Fetch current automation settings
  const shopSettings = await db.shopSettings.findUnique({
    where: { shop },
  });

  // If no settings exist, create them with defaults
  if (!shopSettings) {
    await db.shopSettings.upsert({
      where: { shop },
      create: {
        shop,
        storeName: shop,
        storeUrl: `https://${shop}`,
        autoCashbackProcessingEnabled: true,
        tierRecalculationEnabled: true,
        emailMarketingEnabled: false,
      },
      update: {},
    });
  }

  const settings: AutomationSettings = {
    autoCashbackProcessingEnabled: shopSettings?.autoCashbackProcessingEnabled ?? true,
    tierRecalculationEnabled: shopSettings?.tierRecalculationEnabled ?? true,
    emailMarketingEnabled: shopSettings?.emailMarketingEnabled ?? false,
  };

  return json<LoaderData>({ settings, shop });
};

// ============= ACTION =============

/**
 * SECURITY: Whitelist of allowed automation field names
 * This prevents property injection attacks where attackers could
 * modify arbitrary database fields by sending malicious field names.
 */
const ALLOWED_AUTOMATION_FIELDS = [
  'autoCashbackProcessingEnabled',
  'tierRecalculationEnabled',
  'emailMarketingEnabled',
] as const;

type AllowedAutomationField = typeof ALLOWED_AUTOMATION_FIELDS[number];

function isAllowedAutomationField(field: string): field is AllowedAutomationField {
  return ALLOWED_AUTOMATION_FIELDS.includes(field as AllowedAutomationField);
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const field = formData.get("field") as string;
  const enabled = formData.get("enabled") === "true";

  // SECURITY: Validate field is in allowed list (prevents property injection)
  if (!field || !isAllowedAutomationField(field)) {
    console.error(`[Automation Manager] SECURITY: Rejected invalid field name: "${field}"`);
    return json({
      success: false,
      error: `Invalid automation field: ${field}. Allowed fields: ${ALLOWED_AUTOMATION_FIELDS.join(', ')}`
    }, { status: 400 });
  }

  try {
    // Get current value for audit logging
    const currentSettings = await db.shopSettings.findUnique({
      where: { shop },
      select: { [field]: true }
    });

    // Update the specific automation setting (field is now validated)
    await db.shopSettings.update({
      where: { shop },
      data: {
        [field]: enabled,
      },
    });

    // Log the change for audit trail
    console.log(`[Automation Manager] Setting changed:`, {
      shop,
      field,
      previousValue: currentSettings?.[field as keyof typeof currentSettings],
      newValue: enabled,
      timestamp: new Date().toISOString()
    });

    return json({ success: true, field, enabled });
  } catch (error) {
    console.error('[Automation Manager] Error updating setting:', error);
    return json({ success: false, error: 'Failed to update automation setting' }, { status: 500 });
  }
};

// ============= COMPONENTS =============

interface AutomationCardProps {
  title: string;
  description: string;
  details: string[];
  enabled: boolean;
  onToggle: () => void;
  loading?: boolean;
  impact: 'high' | 'medium';
  icon: string;
}

function AutomationCard({
  title,
  description,
  details,
  enabled,
  onToggle,
  loading = false,
  impact,
  icon,
}: AutomationCardProps) {
  return (
    <Card>
      <BlockStack gap="400">
        {/* Header */}
        <InlineStack align="space-between" blockAlign="start">
          <InlineStack gap="300" blockAlign="center">
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: enabled ? '#dcfce7' : '#f3f4f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              transition: 'all 0.3s ease',
            }}>
              {icon}
            </div>
            <BlockStack gap="100">
              <InlineStack gap="200" blockAlign="center">
                <Text variant="headingMd" as="h3" fontWeight="semibold">
                  {title}
                </Text>
                <Badge tone={impact === 'high' ? 'critical' : 'attention'}>
                  {impact === 'high' ? 'High Impact' : 'Medium Impact'}
                </Badge>
              </InlineStack>
              <Text variant="bodySm" as="p" tone="subdued">
                {description}
              </Text>
            </BlockStack>
          </InlineStack>

          <button
            type="button"
            onClick={onToggle}
            disabled={loading}
            style={{
              padding: "10px 28px",
              borderRadius: "8px",
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: "600",
              fontSize: "14px",
              transition: "all 0.2s ease",
              backgroundColor: enabled ? "#22c55e" : "#6b7280",
              color: "white",
              minWidth: "110px",
              boxShadow: enabled
                ? "0 2px 4px rgba(34, 197, 94, 0.3)"
                : "0 2px 4px rgba(0, 0, 0, 0.1)",
              opacity: loading ? 0.7 : 1,
            }}
            onMouseOver={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = enabled
                  ? "0 4px 8px rgba(34, 197, 94, 0.4)"
                  : "0 4px 8px rgba(0, 0, 0, 0.15)";
              }
            }}
            onMouseOut={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = enabled
                  ? "0 2px 4px rgba(34, 197, 94, 0.3)"
                  : "0 2px 4px rgba(0, 0, 0, 0.1)";
              }
            }}
          >
            {loading ? "UPDATING..." : enabled ? "ENABLED" : "DISABLED"}
          </button>
        </InlineStack>

        {/* Status Indicator */}
        <Box
          padding="300"
          background={enabled ? "bg-fill-success-secondary" : "bg-fill-secondary"}
          borderRadius="200"
        >
          <InlineStack gap="200" blockAlign="center">
            {enabled && (
              <div style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                backgroundColor: '#22c55e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 8px rgba(34, 197, 94, 0.6)',
              }}>
                <Icon source={CheckIcon} tone="base" />
              </div>
            )}
            <Text variant="bodyMd" as="span" fontWeight="medium">
              {enabled ? "Automation is running" : "Automation is paused"}
            </Text>
          </InlineStack>
        </Box>

        {/* Details */}
        <BlockStack gap="200">
          <Text variant="bodySm" fontWeight="semibold" as="p">
            What this automation does:
          </Text>
          <ul style={{
            marginLeft: '20px',
            fontSize: '13px',
            color: '#6d7175',
            lineHeight: '1.6'
          }}>
            {details.map((detail, index) => (
              <li key={index}>
                <Text variant="bodySm" as="span" tone="subdued">
                  {detail}
                </Text>
              </li>
            ))}
          </ul>
        </BlockStack>
      </BlockStack>
    </Card>
  );
}

// ============= MAIN COMPONENT =============

export default function AutomationManager() {
  const { settings } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [automationStates, setAutomationStates] = useState(settings);
  const [lastUpdated, setLastUpdated] = useState<{
    automation: string;
    enabled: boolean;
    timestamp: number;
  } | null>(null);

  // Update local state when fetcher completes
  useEffect(() => {
    if (fetcher.data?.success && 'field' in fetcher.data && 'enabled' in fetcher.data) {
      const field = fetcher.data.field as keyof AutomationSettings;
      const enabled = fetcher.data.enabled as boolean;
      setAutomationStates(prev => ({
        ...prev,
        [field]: enabled
      }));
      setLastUpdated({
        automation: getAutomationName(field),
        enabled: enabled,
        timestamp: Date.now(),
      });
    }
  }, [fetcher.data]);

  const handleToggle = useCallback((field: keyof AutomationSettings) => {
    const newValue = !automationStates[field];
    fetcher.submit(
      { field, enabled: String(newValue) },
      { method: "post" }
    );
  }, [automationStates, fetcher]);

  const getAutomationName = (field: string) => {
    switch (field) {
      case 'autoCashbackProcessingEnabled':
        return 'Cashback Processing';
      case 'tierRecalculationEnabled':
        return 'Tier Calculation';
      case 'emailMarketingEnabled':
        return 'Marketing Optimization';
      default:
        return field;
    }
  };

  const isLoading = fetcher.state === "submitting";

  // Count enabled automations
  const enabledCount = Object.values(automationStates).filter(Boolean).length;
  const totalCount = Object.keys(automationStates).length;

  return (
    <Page
      title="Automation Manager"
      subtitle="Control core automation processes for your loyalty program"
      backAction={{ content: "Settings", url: "/app/settings" }}
    >
      <Layout>
        {/* Status Banner */}
        {lastUpdated && (
          <Layout.Section>
            <Banner
              tone={lastUpdated.enabled ? "success" : "info"}
              title={`${lastUpdated.automation} ${lastUpdated.enabled ? 'enabled' : 'disabled'}`}
              onDismiss={() => setLastUpdated(null)}
            >
              <p>
                Changes have been saved. {lastUpdated.enabled
                  ? 'The automation will now run automatically.'
                  : 'This automation is now paused and will not run.'}
              </p>
            </Banner>
          </Layout.Section>
        )}

        {/* Summary Card */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text variant="headingMd" as="h2">
                    Automation Status
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    {enabledCount} of {totalCount} automations running
                  </Text>
                </BlockStack>
                <InlineStack gap="200" blockAlign="center">
                  <Badge tone="success">{enabledCount} Active</Badge>
                  <Badge>{totalCount - enabledCount} Paused</Badge>
                </InlineStack>
              </InlineStack>

              {/* Progress Bar */}
              <Box>
                <div style={{
                  width: '100%',
                  height: '8px',
                  backgroundColor: '#e5e7eb',
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${(enabledCount / totalCount) * 100}%`,
                    height: '100%',
                    backgroundColor: '#22c55e',
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Info Banner */}
        <Layout.Section>
          <Banner tone="info">
            <p>
              These automations help manage your loyalty program efficiently. You can enable or disable
              each automation based on your business needs. Changes take effect immediately.
            </p>
          </Banner>
        </Layout.Section>

        {/* Automation Cards */}
        <Layout.Section>
          <BlockStack gap="400">
            {/* Cashback Processing */}
            <AutomationCard
              title="Cashback Processing"
              description="Automatically calculate and credit cashback rewards when orders are fulfilled"
              details={[
                "Monitors order webhooks (orders/paid, orders/fulfilled)",
                "Calculates cashback based on customer's tier percentage",
                "Credits store credit to customer account automatically",
                "Handles refunds and adjustments",
                "Sends notification emails to customers",
              ]}
              enabled={automationStates.autoCashbackProcessingEnabled}
              onToggle={() => handleToggle('autoCashbackProcessingEnabled')}
              loading={isLoading}
              impact="high"
              icon="💰"
            />

            {/* Tier Calculation */}
            <AutomationCard
              title="Tier Calculation"
              description="Automatically recalculate customer tiers based on spending thresholds"
              details={[
                "Runs scheduled tier recalculation (daily/weekly/monthly)",
                "Tracks customer lifetime spending and order history",
                "Upgrades customers to higher tiers when thresholds are met",
                "Downgrades customers based on tier evaluation period",
                "Triggers tier change webhooks and notifications",
              ]}
              enabled={automationStates.tierRecalculationEnabled}
              onToggle={() => handleToggle('tierRecalculationEnabled')}
              loading={isLoading}
              impact="high"
              icon="🎯"
            />

            {/* Marketing Optimization */}
            <AutomationCard
              title="Marketing Optimization"
              description="AI-powered marketing recommendations and automated campaign triggers"
              details={[
                "Analyzes customer behavior to generate recommendations",
                "Identifies inactive customers for re-engagement campaigns",
                "Detects tier upgrade opportunities",
                "Alerts about expiring rewards and credits",
                "Tracks VIP customers at risk of churn",
              ]}
              enabled={automationStates.emailMarketingEnabled}
              onToggle={() => handleToggle('emailMarketingEnabled')}
              loading={isLoading}
              impact="medium"
              icon="📊"
            />
          </BlockStack>
        </Layout.Section>

        {/* Warning Card */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">
                ⚠️ Important Notes
              </Text>
              <BlockStack gap="200">
                <Box>
                  <Text variant="bodySm" as="p">
                    <strong>Cashback Processing:</strong> If disabled, you'll need to manually process cashback
                    for customer orders. This may lead to customer dissatisfaction if not handled promptly.
                  </Text>
                </Box>
                <Box>
                  <Text variant="bodySm" as="p">
                    <strong>Tier Calculation:</strong> If disabled, customers won't automatically move between
                    tiers. You can still manually assign tiers from the Customers page.
                  </Text>
                </Box>
                <Box>
                  <Text variant="bodySm" as="p">
                    <strong>Marketing Optimization:</strong> If disabled, you won't receive automated marketing
                    recommendations, but you can still create campaigns manually.
                  </Text>
                </Box>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
