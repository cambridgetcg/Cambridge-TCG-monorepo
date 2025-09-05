import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Box,
  TextField,
  Select,
  Button,
  Badge,
  Checkbox,
  RadioButton,
  Divider,
} from "@shopify/polaris";
import { SaveIcon } from "@shopify/polaris-icons";
import { useState } from "react";

export const loader = async () => {
  // Mock settings data
  const settings = {
    general: {
      programName: "Rewards Pro",
      currency: "USD",
      timezone: "America/New_York",
      language: "en",
    },
    rewards: {
      enableCashback: true,
      minRedeemAmount: 10,
      maxRedeemAmount: 500,
      expirationDays: 365,
      enablePartialRedemption: true,
    },
    notifications: {
      emailEnabled: true,
      smsEnabled: false,
      welcomeEmail: true,
      tierUpgradeEmail: true,
      rewardEarnedEmail: true,
      expirationWarning: true,
    },
    advanced: {
      apiAccess: false,
      webhookUrl: "",
      debugMode: false,
      maintenanceMode: false,
    },
  };

  return json({ settings });
};

export default function DemoSettingsPage() {
  const { settings } = useLoaderData<typeof loader>();
  const [emailEnabled, setEmailEnabled] = useState(settings.notifications.emailEnabled);
  const [smsEnabled, setSmsEnabled] = useState(settings.notifications.smsEnabled);
  const [debugMode, setDebugMode] = useState(settings.advanced.debugMode);

  return (
    <Page
      title="Settings"
      primaryAction={
        <Button variant="primary" icon={SaveIcon}>
          Save Changes
        </Button>
      }
    >
      <Box paddingBlockEnd="2000">
      <Layout>
        {/* General Settings */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">General Settings</Text>
                <BlockStack gap="300">
                  <TextField
                    label="Program Name"
                    value={settings.general.programName}
                    autoComplete="off"
                    helpText="This name will be displayed to customers"
                  />
                  <InlineStack gap="300" align="start">
                    <Select
                      label="Currency"
                      options={[
                        { label: "USD - US Dollar", value: "USD" },
                        { label: "EUR - Euro", value: "EUR" },
                        { label: "GBP - British Pound", value: "GBP" },
                        { label: "CAD - Canadian Dollar", value: "CAD" },
                      ]}
                      value={settings.general.currency}
                    />
                    <Select
                      label="Timezone"
                      options={[
                        { label: "Eastern Time", value: "America/New_York" },
                        { label: "Pacific Time", value: "America/Los_Angeles" },
                        { label: "Central Time", value: "America/Chicago" },
                        { label: "UTC", value: "UTC" },
                      ]}
                      value={settings.general.timezone}
                    />
                    <Select
                      label="Language"
                      options={[
                        { label: "English", value: "en" },
                        { label: "Spanish", value: "es" },
                        { label: "French", value: "fr" },
                        { label: "German", value: "de" },
                      ]}
                      value={settings.general.language}
                    />
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        {/* Rewards Settings */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Rewards Configuration</Text>
                <BlockStack gap="300">
                  <Checkbox
                    label="Enable cashback rewards"
                    checked={settings.rewards.enableCashback}
                  />
                  <InlineStack gap="300" align="start">
                    <TextField
                      label="Minimum Redemption"
                      type="number"
                      value={settings.rewards.minRedeemAmount.toString()}
                      prefix="$"
                      autoComplete="off"
                      helpText="Minimum amount required to redeem rewards"
                    />
                    <TextField
                      label="Maximum Redemption"
                      type="number"
                      value={settings.rewards.maxRedeemAmount.toString()}
                      prefix="$"
                      autoComplete="off"
                      helpText="Maximum amount per redemption"
                    />
                    <TextField
                      label="Expiration Period"
                      type="number"
                      value={settings.rewards.expirationDays.toString()}
                      suffix="days"
                      autoComplete="off"
                      helpText="Days until rewards expire"
                    />
                  </InlineStack>
                  <Checkbox
                    label="Allow partial redemption of rewards"
                    checked={settings.rewards.enablePartialRedemption}
                    helpText="Customers can use part of their available rewards"
                  />
                </BlockStack>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        {/* Notification Settings */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Notifications</Text>
                <BlockStack gap="300">
                  <BlockStack gap="200">
                    <Text variant="bodyMd" fontWeight="semibold">Notification Channels</Text>
                    <Checkbox
                      label="Email notifications"
                      checked={emailEnabled}
                      onChange={setEmailEnabled}
                    />
                    <Checkbox
                      label="SMS notifications (Premium)"
                      checked={smsEnabled}
                      onChange={setSmsEnabled}
                    />
                  </BlockStack>
                  <Divider />
                  <BlockStack gap="200">
                    <Text variant="bodyMd" fontWeight="semibold">Email Types</Text>
                    <Checkbox
                      label="Welcome email for new members"
                      checked={settings.notifications.welcomeEmail}
                      disabled={!emailEnabled}
                    />
                    <Checkbox
                      label="Tier upgrade notifications"
                      checked={settings.notifications.tierUpgradeEmail}
                      disabled={!emailEnabled}
                    />
                    <Checkbox
                      label="Reward earned notifications"
                      checked={settings.notifications.rewardEarnedEmail}
                      disabled={!emailEnabled}
                    />
                    <Checkbox
                      label="Expiration warnings (30 days before)"
                      checked={settings.notifications.expirationWarning}
                      disabled={!emailEnabled}
                    />
                  </BlockStack>
                </BlockStack>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        {/* Advanced Settings */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h2">Advanced Settings</Text>
                  <Badge tone="warning">Developer Options</Badge>
                </InlineStack>
                <BlockStack gap="300">
                  <Checkbox
                    label="Enable API access"
                    checked={settings.advanced.apiAccess}
                    helpText="Allow external applications to access loyalty data via API"
                  />
                  <TextField
                    label="Webhook URL"
                    value={settings.advanced.webhookUrl}
                    placeholder="https://your-domain.com/webhook"
                    autoComplete="off"
                    helpText="Endpoint for receiving loyalty event notifications"
                  />
                  <Divider />
                  <Checkbox
                    label="Debug mode"
                    checked={debugMode}
                    onChange={setDebugMode}
                    helpText="Enable detailed logging for troubleshooting"
                  />
                  <Checkbox
                    label="Maintenance mode"
                    checked={settings.advanced.maintenanceMode}
                    helpText="Temporarily disable loyalty features for customers"
                  />
                </BlockStack>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        {/* Danger Zone */}
        <Layout.Section>
          <Card>
            <Box padding="400" background="bg-critical-subdued">
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2" tone="critical">Danger Zone</Text>
                <Text variant="bodySm" tone="subdued">
                  These actions are permanent and cannot be undone.
                </Text>
                <InlineStack gap="200">
                  <Button tone="critical">Reset All Settings</Button>
                  <Button tone="critical">Delete All Customer Data</Button>
                </InlineStack>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
      </Box>
    </Page>
  );
}