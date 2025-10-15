/**
 * Feature Gate Components
 *
 * UI components for feature gating and upgrade prompts.
 * Automatically shows/hides features based on plan access.
 */

import { type ReactNode } from "react";
import {
  Banner,
  Box,
  Button,
  Card,
  Text,
  InlineStack,
  BlockStack,
  Icon,
  Badge,
} from "@shopify/polaris";
import {
  LockIcon,
  PlanIcon,
  CircleAlertIcon,
} from "@shopify/polaris-icons";
import { useNavigate } from "@remix-run/react";
import { Feature, type PlanTier, getFeatureMetadata, UPGRADE_PATH } from "~/constants/features";
import { useFeatureAccess } from "~/hooks/useFeatureAccess";

// ============================================================================
// Types
// ============================================================================

export interface FeatureGateProps {
  /**
   * Feature required to access this content
   */
  feature: Feature;

  /**
   * Content to show if access is granted
   */
  children: ReactNode;

  /**
   * Optional feature name for upgrade prompt (defaults to metadata name)
   */
  featureName?: string;

  /**
   * Content to show if access is denied (defaults to upgrade prompt)
   */
  fallback?: ReactNode;

  /**
   * Whether to show upgrade prompt when access denied (default: true)
   */
  showUpgradePrompt?: boolean;

  /**
   * Size of the upgrade prompt (default: 'medium')
   */
  upgradePromptSize?: 'small' | 'medium' | 'large';
}

export interface UpgradePromptProps {
  /**
   * Feature that requires upgrade
   */
  feature: Feature;

  /**
   * Optional feature name (defaults to metadata name)
   */
  featureName?: string;

  /**
   * Size of the prompt (default: 'medium')
   */
  size?: 'small' | 'medium' | 'large';

  /**
   * Optional custom message
   */
  message?: string;

  /**
   * Optional current plan tier (will be fetched if not provided)
   */
  currentPlan?: PlanTier;
}

// ============================================================================
// Feature Gate Component
// ============================================================================

/**
 * Conditionally render content based on feature access
 *
 * Shows children if access is granted, otherwise shows upgrade prompt or custom fallback.
 *
 * @example
 * // Basic usage - shows upgrade prompt if no access
 * <FeatureGate feature={Feature.EXPORT_DATA}>
 *   <ExportButton />
 * </FeatureGate>
 *
 * @example
 * // Custom fallback
 * <FeatureGate
 *   feature={Feature.ADVANCED_ANALYTICS}
 *   fallback={<Text as="p">Upgrade to Pro for advanced analytics</Text>}
 * >
 *   <AnalyticsDashboard />
 * </FeatureGate>
 *
 * @example
 * // No upgrade prompt (just hide content)
 * <FeatureGate feature={Feature.API_ACCESS} showUpgradePrompt={false}>
 *   <ApiKeySection />
 * </FeatureGate>
 */
export function FeatureGate({
  feature,
  children,
  featureName,
  fallback,
  showUpgradePrompt = true,
  upgradePromptSize = 'medium',
}: FeatureGateProps) {
  const access = useFeatureAccess(feature);

  // Access granted - show children
  if (access.hasAccess) {
    return <>{children}</>;
  }

  // Access denied - show fallback or upgrade prompt
  if (fallback) {
    return <>{fallback}</>;
  }

  if (showUpgradePrompt) {
    return (
      <UpgradePrompt
        feature={feature}
        featureName={featureName}
        size={upgradePromptSize}
        currentPlan={access.currentPlan}
      />
    );
  }

  // Hide completely if no prompt
  return null;
}

// ============================================================================
// Upgrade Prompt Component
// ============================================================================

/**
 * Display an upgrade prompt for a premium feature
 *
 * Shows feature information and upgrade button.
 *
 * @example
 * // Inline prompt
 * <UpgradePrompt feature={Feature.EXPORT_DATA} size="small" />
 *
 * @example
 * // Banner prompt
 * <UpgradePrompt
 *   feature={Feature.ADVANCED_ANALYTICS}
 *   size="large"
 *   message="Unlock detailed insights about your loyalty program"
 * />
 */
export function UpgradePrompt({
  feature,
  featureName,
  size = 'medium',
  message,
  currentPlan = 'free',
}: UpgradePromptProps) {
  const navigate = useNavigate();
  const metadata = getFeatureMetadata(feature);
  const displayName = featureName || metadata.name;
  const requiredPlan = metadata.minimumPlan;
  const upgradeTier = UPGRADE_PATH[currentPlan];

  const handleUpgrade = () => {
    navigate(`/app/billing/plans?highlight=${requiredPlan}`);
  };

  // Small size - inline banner
  if (size === 'small') {
    return (
      <Banner
        tone="info"
        onDismiss={undefined}
      >
        <InlineStack gap="200" align="space-between" blockAlign="center">
          <Box>
            <Text as="span" variant="bodyMd" fontWeight="medium">
              {displayName}
            </Text>
            <Text as="span" variant="bodySm" tone="subdued">
              {' '}requires {requiredPlan.toUpperCase()} plan
            </Text>
          </Box>
          <Button size="slim" onClick={handleUpgrade}>
            Upgrade
          </Button>
        </InlineStack>
      </Banner>
    );
  }

  // Medium size - card
  if (size === 'medium') {
    return (
      <Card>
        <BlockStack gap="400">
          <InlineStack gap="200" align="start">
            <div style={{ color: 'var(--p-color-icon-info)' }}>
              <Icon source={LockIcon} />
            </div>
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd" fontWeight="semibold">
                {displayName}
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                {message || metadata.description}
              </Text>
              <InlineStack gap="200" align="start" blockAlign="center">
                <Badge tone="info">
                  {requiredPlan.toUpperCase()} plan required
                </Badge>
                {upgradeTier && (
                  <Text as="span" variant="bodySm" tone="subdued">
                    Upgrade to {upgradeTier.toUpperCase()} to unlock this feature
                  </Text>
                )}
              </InlineStack>
            </BlockStack>
          </InlineStack>
          <InlineStack gap="200" align="start">
            <Button onClick={handleUpgrade} icon={PlanIcon}>
              View Plans
            </Button>
          </InlineStack>
        </BlockStack>
      </Card>
    );
  }

  // Large size - prominent card
  return (
    <Card>
      <BlockStack gap="500">
        <Box
          paddingBlock="800"
          paddingInline="400"
          borderBlockEndWidth="025"
          borderColor="border"
        >
          <InlineStack gap="300" align="center" blockAlign="center">
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'var(--p-color-bg-surface-info)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--p-color-icon-info)',
              }}
            >
              <Icon source={LockIcon} />
            </div>
            <BlockStack gap="100">
              <Text as="h2" variant="headingLg" fontWeight="bold">
                {displayName}
              </Text>
              <Badge tone="info" size="large">
                {requiredPlan.toUpperCase()} PLAN REQUIRED
              </Badge>
            </BlockStack>
          </InlineStack>
        </Box>

        <Box paddingInline="400" paddingBlockEnd="500">
          <BlockStack gap="400">
            <Text as="p" variant="bodyLg">
              {message || metadata.description}
            </Text>

            {upgradeTier && (
              <Banner tone="info">
                <Text as="p" variant="bodyMd">
                  You're currently on the <strong>{currentPlan.toUpperCase()}</strong> plan.
                  Upgrade to <strong>{upgradeTier.toUpperCase()}</strong> or higher to access this feature.
                </Text>
              </Banner>
            )}

            <InlineStack gap="300" align="start">
              <Button onClick={handleUpgrade} variant="primary" icon={PlanIcon}>
                View Upgrade Options
              </Button>
              <Button url="/app" variant="plain">
                Go to Dashboard
              </Button>
            </InlineStack>
          </BlockStack>
        </Box>
      </BlockStack>
    </Card>
  );
}

// ============================================================================
// Upgrade Banner Component
// ============================================================================

export interface UpgradeBannerProps {
  /**
   * Feature that requires upgrade
   */
  feature: Feature;

  /**
   * Optional custom message
   */
  message?: string;

  /**
   * Whether banner is dismissible
   */
  dismissible?: boolean;

  /**
   * Callback when dismissed
   */
  onDismiss?: () => void;
}

/**
 * Display a banner prompting upgrade for a feature
 *
 * Useful for showing upgrade prompts at the top of pages.
 *
 * @example
 * function MyPage() {
 *   const [showBanner, setShowBanner] = useState(true);
 *   const access = useFeatureAccess(Feature.ADVANCED_ANALYTICS);
 *
 *   return (
 *     <>
 *       {!access.hasAccess && showBanner && (
 *         <UpgradeBanner
 *           feature={Feature.ADVANCED_ANALYTICS}
 *           dismissible
 *           onDismiss={() => setShowBanner(false)}
 *         />
 *       )}
 *       <Page title="Analytics">
 *         ...
 *       </Page>
 *     </>
 *   );
 * }
 */
export function UpgradeBanner({
  feature,
  message,
  dismissible = false,
  onDismiss,
}: UpgradeBannerProps) {
  const navigate = useNavigate();
  const metadata = getFeatureMetadata(feature);
  const requiredPlan = metadata.minimumPlan;

  const handleUpgrade = () => {
    navigate(`/app/billing/plans?highlight=${requiredPlan}`);
  };

  return (
    <Banner
      tone="info"
      onDismiss={dismissible ? onDismiss : undefined}
    >
      <BlockStack gap="200">
        <InlineStack gap="200" align="start" blockAlign="center">
          <Icon source={CircleAlertIcon} />
          <Text as="span" variant="bodyMd" fontWeight="semibold">
            {metadata.name} requires {requiredPlan.toUpperCase()} plan
          </Text>
        </InlineStack>
        {message && (
          <Text as="p" variant="bodyMd">
            {message}
          </Text>
        )}
        <InlineStack gap="200" align="start">
          <Button size="slim" onClick={handleUpgrade}>
            Upgrade Now
          </Button>
        </InlineStack>
      </BlockStack>
    </Banner>
  );
}
