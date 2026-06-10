/**
 * Marketing Choice Modal
 *
 * Full-page modal that presents merchants with the choice between:
 * - In-House Marketing (SendGrid campaigns, templates, automations)
 * - Klaviyo Integration (profile sync, events, external flows)
 *
 * Shown when a merchant first visits the Marketing Hub and hasn't
 * chosen their preferred marketing platform.
 */

import { useState } from "react";
import {
  Modal,
  BlockStack,
  InlineGrid,
  Card,
  Text,
  Button,
  Badge,
  Icon,
  Box,
  InlineStack,
  Divider,
  Banner,
} from "@shopify/polaris";
import {
  EmailIcon,
  AutomationIcon,
  TargetIcon,
  ChartLineIcon,
  CheckCircleIcon,
  ExternalIcon,
} from "@shopify/polaris-icons";

// ============================================
// TYPES
// ============================================

export interface MarketingChoiceModalProps {
  open: boolean;
  isKlaviyoConnected: boolean;
  onSelect: (mode: "INHOUSE" | "KLAVIYO") => void;
  onDismiss: () => void;
  loading?: boolean;
}

// ============================================
// FEATURE LIST COMPONENT
// ============================================

function FeatureList({ features }: { features: string[] }) {
  return (
    <BlockStack gap="200">
      {features.map((feature, index) => (
        <InlineStack key={index} gap="200" blockAlign="start">
          <div style={{ flexShrink: 0, marginTop: 2 }}>
            <Icon source={CheckCircleIcon} tone="success" />
          </div>
          <Text as="span" variant="bodyMd">
            {feature}
          </Text>
        </InlineStack>
      ))}
    </BlockStack>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function MarketingChoiceModal({
  open,
  isKlaviyoConnected,
  onSelect,
  onDismiss,
  loading = false,
}: MarketingChoiceModalProps) {
  const [selectedMode, setSelectedMode] = useState<"INHOUSE" | "KLAVIYO" | null>(null);

  const handleSelect = (mode: "INHOUSE" | "KLAVIYO") => {
    setSelectedMode(mode);
    onSelect(mode);
  };

  return (
    <Modal
      open={open}
      onClose={onDismiss}
      title="Choose Your Marketing Platform"
      size="large"
      footer={
        <InlineStack align="end">
          <Button onClick={onDismiss} disabled={loading}>
            I'll decide later
          </Button>
        </InlineStack>
      }
    >
      <Modal.Section>
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd" tone="subdued">
            Select how you want to manage email marketing for your loyalty program.
            You can switch between platforms later in Settings.
          </Text>

          <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
            {/* In-House Option */}
            <Card background="bg-surface-secondary">
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        backgroundColor: "#5C6AC4",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "white",
                      }}
                    >
                      <Icon source={EmailIcon} />
                    </div>
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingMd">
                        In-House Marketing
                      </Text>
                      <Text as="span" variant="bodySm" tone="subdued">
                        Powered by SendGrid
                      </Text>
                    </BlockStack>
                  </InlineStack>
                </InlineStack>

                <Text as="p" variant="bodyMd">
                  Build and send email campaigns directly from RewardsPro.
                  Everything you need in one place.
                </Text>

                <Divider />

                <FeatureList
                  features={[
                    "Visual campaign builder",
                    "Pre-built email templates",
                    "Automated tier notifications",
                    "Points expiry reminders",
                    "Built-in analytics",
                    "Custom sending domain",
                  ]}
                />

                <Box
                  padding="300"
                  background="bg-surface-info"
                  borderRadius="200"
                >
                  <InlineStack gap="200" blockAlign="center">
                    <Icon source={TargetIcon} tone="info" />
                    <Text as="span" variant="bodySm">
                      Best for: Getting started quickly with all-in-one simplicity
                    </Text>
                  </InlineStack>
                </Box>

                <Button
                  variant="primary"
                  size="large"
                  fullWidth
                  onClick={() => handleSelect("INHOUSE")}
                  loading={loading && selectedMode === "INHOUSE"}
                  disabled={loading}
                >
                  Get Started with In-House
                </Button>
              </BlockStack>
            </Card>

            {/* Klaviyo Option */}
            <Card background="bg-surface-secondary">
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        backgroundColor: "#000000",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {/* Klaviyo "K" logo approximation */}
                      <Text as="span" variant="headingMd" tone="text-inverse">
                        K
                      </Text>
                    </div>
                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="h3" variant="headingMd">
                          Klaviyo Integration
                        </Text>
                        <Badge tone="magic">Advanced</Badge>
                      </InlineStack>
                      <Text as="span" variant="bodySm" tone="subdued">
                        External platform
                      </Text>
                    </BlockStack>
                  </InlineStack>
                </InlineStack>

                <Text as="p" variant="bodyMd">
                  Connect your Klaviyo account for powerful automation
                  and advanced segmentation capabilities.
                </Text>

                <Divider />

                <FeatureList
                  features={[
                    "20+ RewardsPro events synced",
                    "25+ customer attributes",
                    "Advanced segmentation",
                    "A/B testing built-in",
                    "SMS + Email campaigns",
                    "Klaviyo's full feature set",
                  ]}
                />

                <Box
                  padding="300"
                  background="bg-surface-warning"
                  borderRadius="200"
                >
                  <InlineStack gap="200" blockAlign="center">
                    <Icon source={AutomationIcon} tone="warning" />
                    <Text as="span" variant="bodySm">
                      Best for: Power users already using Klaviyo
                    </Text>
                  </InlineStack>
                </Box>

                {isKlaviyoConnected ? (
                  <Button
                    variant="primary"
                    size="large"
                    fullWidth
                    onClick={() => handleSelect("KLAVIYO")}
                    loading={loading && selectedMode === "KLAVIYO"}
                    disabled={loading}
                  >
                    Use Klaviyo
                  </Button>
                ) : (
                  <BlockStack gap="200">
                    <Button
                      variant="primary"
                      size="large"
                      fullWidth
                      onClick={() => handleSelect("KLAVIYO")}
                      loading={loading && selectedMode === "KLAVIYO"}
                      disabled={loading}
                      icon={ExternalIcon}
                    >
                      Connect Klaviyo Account
                    </Button>
                    <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                      You'll be redirected to connect your Klaviyo account
                    </Text>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </InlineGrid>

          <Banner tone="info">
            <Text as="p" variant="bodySm">
              Not sure which to choose? Start with <strong>In-House Marketing</strong> for
              simplicity. You can always switch to Klaviyo later if you need advanced features.
            </Text>
          </Banner>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

export default MarketingChoiceModal;
