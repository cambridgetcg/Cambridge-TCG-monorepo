/**
 * Feature Activation Banner Component
 *
 * Provides a consistent UX for enabling/disabling customer-facing reward features.
 * Shows feature status and provides one-click enable/disable actions.
 */

import { useFetcher } from "@remix-run/react";
import {
  Banner,
  Button,
  InlineStack,
  Text,
  Badge,
  Box,
  BlockStack,
  Card,
} from "@shopify/polaris";
import { CheckIcon, XIcon } from "~/utils/polaris-icons";

export type FeatureType = 'raffles' | 'mysteryBoxes' | 'challenges' | 'spinWheel' | 'scratchCards';

interface FeatureActivationBannerProps {
  feature: FeatureType;
  isEnabled: boolean;
  /** If points system is disabled, all features are disabled */
  pointsSystemEnabled: boolean;
  /** Custom title override */
  title?: string;
  /** Custom description for when feature is disabled */
  disabledDescription?: string;
  /** Custom description for when feature is enabled */
  enabledDescription?: string;
  /** Show as a card instead of a banner */
  variant?: 'banner' | 'card';
  /** Action endpoint to toggle feature */
  actionEndpoint?: string;
}

const FEATURE_LABELS: Record<FeatureType, { name: string; icon: string; description: string }> = {
  raffles: {
    name: 'Raffles',
    icon: '🎟️',
    description: 'Let customers enter raffles using points for a chance to win prizes.',
  },
  mysteryBoxes: {
    name: 'Mystery Boxes',
    icon: '🎁',
    description: 'Customers spend points to open mystery boxes and win random rewards.',
  },
  challenges: {
    name: 'Challenges',
    icon: '🏆',
    description: 'Set goals for customers to complete and earn bonus points or rewards.',
  },
  spinWheel: {
    name: 'Spin Wheel',
    icon: '🎡',
    description: 'Daily spin-to-win game where customers can earn rewards.',
  },
  scratchCards: {
    name: 'Scratch Cards',
    icon: '🎴',
    description: 'Interactive scratch cards that reveal instant rewards.',
  },
};

export function FeatureActivationBanner({
  feature,
  isEnabled,
  pointsSystemEnabled,
  title,
  disabledDescription,
  enabledDescription,
  variant = 'banner',
  actionEndpoint = '/app/rewards/config',
}: FeatureActivationBannerProps) {
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state === 'submitting';

  const featureInfo = FEATURE_LABELS[feature];
  const displayTitle = title || featureInfo.name;

  // If points system is disabled, show that first
  if (!pointsSystemEnabled) {
    return (
      <Banner
        title="Points System Required"
        tone="warning"
        action={{
          content: 'Enable Points System',
          url: '/app/rewards/config',
        }}
      >
        <p>
          The Points System must be enabled before you can use {featureInfo.name}.
          Enable it in Rewards Configuration to get started.
        </p>
      </Banner>
    );
  }

  const handleToggle = () => {
    const formData = new FormData();
    formData.append('intent', 'toggleFeature');
    formData.append('feature', feature);
    formData.append('enabled', (!isEnabled).toString());
    fetcher.submit(formData, { method: 'post', action: actionEndpoint });
  };

  if (variant === 'card') {
    return (
      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="center">
            <InlineStack gap="300" blockAlign="center">
              <Text as="span" variant="headingLg">{featureInfo.icon}</Text>
              <BlockStack gap="100">
                <Text variant="headingMd" as="h3">{displayTitle}</Text>
                <Text tone="subdued" as="p" variant="bodySm">
                  {isEnabled
                    ? enabledDescription || `${featureInfo.name} are enabled for your customers.`
                    : disabledDescription || featureInfo.description
                  }
                </Text>
              </BlockStack>
            </InlineStack>
            <InlineStack gap="300" blockAlign="center">
              <Badge tone={isEnabled ? 'success' : undefined}>
                {isEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
              <Button
                onClick={handleToggle}
                loading={isSubmitting}
                tone={isEnabled ? undefined : 'success'}
                variant={isEnabled ? 'secondary' : 'primary'}
              >
                {isEnabled ? 'Disable' : 'Enable'}
              </Button>
            </InlineStack>
          </InlineStack>
        </BlockStack>
      </Card>
    );
  }

  // Banner variant
  if (isEnabled) {
    return (
      <Banner
        title={`${displayTitle} Enabled`}
        tone="success"
        action={{
          content: 'Disable',
          onAction: handleToggle,
          loading: isSubmitting,
        }}
      >
        <p>
          {enabledDescription || `${featureInfo.name} are visible to your customers on your storefront.`}
        </p>
      </Banner>
    );
  }

  return (
    <Banner
      title={`Enable ${displayTitle}`}
      tone="info"
      action={{
        content: `Enable ${featureInfo.name}`,
        onAction: handleToggle,
        loading: isSubmitting,
      }}
    >
      <p>{disabledDescription || featureInfo.description}</p>
    </Banner>
  );
}

/**
 * Compact feature status indicator
 */
interface FeatureStatusIndicatorProps {
  feature: FeatureType;
  isEnabled: boolean;
}

export function FeatureStatusIndicator({ feature, isEnabled }: FeatureStatusIndicatorProps) {
  const featureInfo = FEATURE_LABELS[feature];

  return (
    <InlineStack gap="200" blockAlign="center">
      <Text as="span">{featureInfo.icon}</Text>
      <Text as="span" variant="bodyMd">{featureInfo.name}</Text>
      <Badge tone={isEnabled ? 'success' : undefined} size="small">
        {isEnabled ? 'On' : 'Off'}
      </Badge>
    </InlineStack>
  );
}

/**
 * Feature activation summary card showing all feature states
 */
interface FeatureActivationSummaryProps {
  features: Record<FeatureType, boolean>;
  pointsSystemEnabled: boolean;
}

export function FeatureActivationSummary({
  features,
  pointsSystemEnabled,
}: FeatureActivationSummaryProps) {
  const enabledCount = Object.values(features).filter(Boolean).length;
  const totalCount = Object.keys(features).length;

  if (!pointsSystemEnabled) {
    return (
      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="center">
            <Text variant="headingMd" as="h3">Customer Features</Text>
            <Badge tone="warning">Points System Disabled</Badge>
          </InlineStack>
          <Text tone="subdued" as="p">
            Enable the Points System to activate customer-facing features like raffles, mystery boxes, and challenges.
          </Text>
          <Button url="/app/rewards/config">Configure Points System</Button>
        </BlockStack>
      </Card>
    );
  }

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="headingMd" as="h3">Customer Features</Text>
          <Badge tone={enabledCount === totalCount ? 'success' : 'info'}>
            {enabledCount}/{totalCount} Active
          </Badge>
        </InlineStack>
        <BlockStack gap="200">
          {(Object.entries(features) as [FeatureType, boolean][]).map(([feature, enabled]) => (
            <FeatureStatusIndicator key={feature} feature={feature} isEnabled={enabled} />
          ))}
        </BlockStack>
        <Button url="/app/rewards/config" variant="plain">
          Manage Features
        </Button>
      </BlockStack>
    </Card>
  );
}
