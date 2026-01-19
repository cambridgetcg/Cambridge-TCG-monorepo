/**
 * UpgradePrompt - Reusable upgrade/subscription prompt components
 *
 * Provides consistent upgrade CTAs across the app with different variants:
 * - Banner: Full-width banner for page headers
 * - Card: Standalone card for sidebar or sections
 * - Inline: Compact inline prompt for feature lists
 * - Modal trigger: Button that opens upgrade modal
 */

import React from 'react';
import { useNavigate } from '@remix-run/react';
import {
  Banner,
  Card,
  Button,
  Text,
  BlockStack,
  InlineStack,
  Box,
  Badge,
  Icon,
  ProgressBar,
} from '@shopify/polaris';
import {
  LockIcon,
  StarIcon,
  ChartVerticalIcon,
  CreditCardIcon,
} from '~/utils/polaris-icons';

// ============================================
// TYPES
// ============================================

export type UpgradePromptVariant = 'banner' | 'card' | 'inline' | 'compact';

export type PlanTier = 'free' | 'pro' | 'max' | 'ultra';

export interface UpgradePromptProps {
  /** Visual variant */
  variant?: UpgradePromptVariant;
  /** Feature or module name that requires upgrade */
  feature?: string;
  /** Custom title */
  title?: string;
  /** Custom description */
  description?: string;
  /** Minimum plan required */
  requiredPlan?: PlanTier;
  /** Current user's plan */
  currentPlan?: string;
  /** Custom CTA text */
  ctaText?: string;
  /** Custom URL (defaults to /app/billing) */
  upgradeUrl?: string;
  /** Show dismiss button */
  dismissible?: boolean;
  /** Dismiss callback */
  onDismiss?: () => void;
  /** Banner tone for banner variant */
  tone?: 'info' | 'warning' | 'critical';
  /** Show plan comparison badge */
  showPlanBadge?: boolean;
}

export interface UsageUpgradePromptProps {
  /** Current usage count */
  current: number;
  /** Maximum limit */
  limit: number;
  /** Resource name (e.g., "orders", "customers", "tiers") */
  resource: string;
  /** Show when approaching limit (default: 80%) */
  warningThreshold?: number;
  /** Custom title */
  title?: string;
  /** Hide if under threshold */
  hideUnderThreshold?: boolean;
}

export interface SubscriptionCardProps {
  /** Current plan name */
  planName?: string;
  /** Plan status */
  status?: 'active' | 'trial' | 'cancelled' | 'past_due';
  /** Monthly price */
  price?: number;
  /** Billing interval */
  interval?: 'monthly' | 'annual';
  /** Current period end date */
  periodEnd?: string;
  /** Usage data */
  usage?: {
    current: number;
    limit: number;
    resource?: string;
  };
  /** Show manage button */
  showManageButton?: boolean;
  /** Compact mode */
  compact?: boolean;
}

// ============================================
// PLAN HELPERS
// ============================================

const PLAN_DETAILS: Record<PlanTier, { name: string; color: string; features: string[] }> = {
  free: {
    name: 'Free',
    color: '#6b7280',
    features: ['100 orders/month', '500 customers', 'Basic features'],
  },
  pro: {
    name: 'Pro',
    color: '#059669',
    features: ['500 orders/month', '2,000 customers', 'Advanced analytics', 'Batch operations'],
  },
  max: {
    name: 'Max',
    color: '#d97706',
    features: ['2,000 orders/month', 'Unlimited customers', 'Tier memberships', 'Priority support'],
  },
  ultra: {
    name: 'Ultra',
    color: '#7c3aed',
    features: ['Unlimited orders', 'All features', 'Dedicated support', 'Custom integrations'],
  },
};

function getPlanTier(planName?: string): PlanTier {
  if (!planName) return 'free';
  const lower = planName.toLowerCase();
  if (lower.includes('ultra')) return 'ultra';
  if (lower.includes('max')) return 'max';
  if (lower.includes('pro')) return 'pro';
  return 'free';
}

function getPlanBadgeTone(plan: PlanTier): 'info' | 'success' | 'attention' | 'warning' {
  switch (plan) {
    case 'free': return 'info';
    case 'pro': return 'success';
    case 'max': return 'attention';
    case 'ultra': return 'warning';
    default: return 'info';
  }
}

// ============================================
// UPGRADE PROMPT COMPONENT
// ============================================

export function UpgradePrompt({
  variant = 'banner',
  feature,
  title,
  description,
  requiredPlan = 'pro',
  currentPlan,
  ctaText = 'Upgrade Now',
  upgradeUrl = '/app/billing',
  dismissible = false,
  onDismiss,
  tone = 'info',
  showPlanBadge = true,
}: UpgradePromptProps) {
  const navigate = useNavigate();
  const planDetails = PLAN_DETAILS[requiredPlan];

  const defaultTitle = feature
    ? `Unlock ${feature}`
    : `Upgrade to ${planDetails.name}`;

  const defaultDescription = feature
    ? `${feature} requires ${planDetails.name} plan or higher.`
    : `Get access to more features with ${planDetails.name}.`;

  const handleUpgrade = () => {
    navigate(upgradeUrl);
  };

  // Banner variant
  if (variant === 'banner') {
    return (
      <Banner
        tone={tone}
        onDismiss={dismissible ? onDismiss : undefined}
        action={{ content: ctaText, onAction: handleUpgrade }}
      >
        <InlineStack gap="200" blockAlign="center">
          {showPlanBadge && <Badge tone={getPlanBadgeTone(requiredPlan)}>{planDetails.name}</Badge>}
          <Text as="span" fontWeight="semibold">{title || defaultTitle}</Text>
          <Text as="span" tone="subdued">{description || defaultDescription}</Text>
        </InlineStack>
      </Banner>
    );
  }

  // Card variant
  if (variant === 'card') {
    return (
      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="center">
            <InlineStack gap="200" blockAlign="center">
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: `${planDetails.color}15`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Icon source={StarIcon} tone="base" />
              </div>
              <BlockStack gap="050">
                <Text variant="headingMd" as="h3">{title || defaultTitle}</Text>
                <Text variant="bodySm" tone="subdued" as="p">{description || defaultDescription}</Text>
              </BlockStack>
            </InlineStack>
            {showPlanBadge && <Badge tone={getPlanBadgeTone(requiredPlan)}>{planDetails.name}</Badge>}
          </InlineStack>

          <BlockStack gap="200">
            <Text variant="bodySm" fontWeight="semibold" as="p">Included in {planDetails.name}:</Text>
            <InlineStack gap="200" wrap>
              {planDetails.features.slice(0, 3).map((feat, i) => (
                <Badge key={i} tone="success">{feat}</Badge>
              ))}
            </InlineStack>
          </BlockStack>

          <Button variant="primary" onClick={handleUpgrade}>{ctaText}</Button>
        </BlockStack>
      </Card>
    );
  }

  // Inline variant
  if (variant === 'inline') {
    return (
      <Box
        padding="300"
        background="bg-surface-secondary"
        borderRadius="200"
        borderColor="border"
        borderWidth="025"
      >
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Icon source={LockIcon} tone="subdued" />
            <Text as="span" tone="subdued">{title || defaultTitle}</Text>
            {showPlanBadge && <Badge tone={getPlanBadgeTone(requiredPlan)}>{planDetails.name}</Badge>}
          </InlineStack>
          <Button size="slim" onClick={handleUpgrade}>{ctaText}</Button>
        </InlineStack>
      </Box>
    );
  }

  // Compact variant
  return (
    <InlineStack gap="200" blockAlign="center">
      <Icon source={LockIcon} tone="subdued" />
      <Text as="span" variant="bodySm" tone="subdued">{title || `Requires ${planDetails.name}`}</Text>
      <Button size="slim" variant="plain" onClick={handleUpgrade}>{ctaText}</Button>
    </InlineStack>
  );
}

// ============================================
// USAGE UPGRADE PROMPT
// ============================================

export function UsageUpgradePrompt({
  current,
  limit,
  resource,
  warningThreshold = 80,
  title,
  hideUnderThreshold = false,
}: UsageUpgradePromptProps) {
  const navigate = useNavigate();
  const percentage = limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
  const isWarning = percentage >= warningThreshold;
  const isExceeded = current >= limit;

  if (hideUnderThreshold && !isWarning) {
    return null;
  }

  const tone = isExceeded ? 'critical' : isWarning ? 'warning' : 'success';
  const progressTone = isExceeded ? 'critical' : isWarning ? 'highlight' : 'primary';

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="headingMd" as="h3">
            {title || `${resource.charAt(0).toUpperCase() + resource.slice(1)} Usage`}
          </Text>
          <Badge tone={tone}>
            {isExceeded ? 'Limit Reached' : isWarning ? 'Approaching Limit' : 'On Track'}
          </Badge>
        </InlineStack>

        <BlockStack gap="200">
          <InlineStack align="space-between">
            <Text as="span" variant="bodySm" tone="subdued">
              {current.toLocaleString()} / {limit.toLocaleString()} {resource}
            </Text>
            <Text as="span" variant="bodySm" fontWeight="semibold">
              {percentage.toFixed(0)}%
            </Text>
          </InlineStack>
          <ProgressBar progress={percentage} tone={progressTone} size="small" />
        </BlockStack>

        {isWarning && (
          <Banner tone={tone} action={{ content: 'Upgrade Plan', onAction: () => navigate('/app/billing') }}>
            {isExceeded
              ? `You've reached your ${resource} limit. Upgrade to continue.`
              : `You're approaching your ${resource} limit. Consider upgrading.`}
          </Banner>
        )}
      </BlockStack>
    </Card>
  );
}

// ============================================
// SUBSCRIPTION CARD
// ============================================

export function SubscriptionCard({
  planName = 'Free',
  status = 'active',
  price = 0,
  interval = 'monthly',
  periodEnd,
  usage,
  showManageButton = true,
  compact = false,
}: SubscriptionCardProps) {
  const navigate = useNavigate();
  const planTier = getPlanTier(planName);
  const planDetails = PLAN_DETAILS[planTier];

  const statusBadge = {
    active: { tone: 'success' as const, label: 'Active' },
    trial: { tone: 'info' as const, label: 'Trial' },
    cancelled: { tone: 'warning' as const, label: 'Cancelled' },
    past_due: { tone: 'critical' as const, label: 'Past Due' },
  }[status];

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (compact) {
    return (
      <Box
        padding="300"
        background="bg-surface-secondary"
        borderRadius="200"
      >
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: `${planDetails.color}20`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Icon source={CreditCardIcon} tone="base" />
            </div>
            <BlockStack gap="0">
              <Text variant="bodyMd" fontWeight="semibold" as="span">{planName}</Text>
              <Text variant="bodySm" tone="subdued" as="span">
                {price > 0 ? `$${price}/${interval === 'annual' ? 'year' : 'mo'}` : 'Free'}
              </Text>
            </BlockStack>
          </InlineStack>
          <InlineStack gap="200" blockAlign="center">
            <Badge tone={statusBadge.tone}>{statusBadge.label}</Badge>
            {showManageButton && (
              <Button size="slim" onClick={() => navigate('/app/billing')}>Manage</Button>
            )}
          </InlineStack>
        </InlineStack>
      </Box>
    );
  }

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
              background: `linear-gradient(135deg, ${planDetails.color}20, ${planDetails.color}40)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Icon source={CreditCardIcon} tone="base" />
            </div>
            <BlockStack gap="050">
              <InlineStack gap="200" blockAlign="center">
                <Text variant="headingMd" as="h3">{planName}</Text>
                <Badge tone={statusBadge.tone}>{statusBadge.label}</Badge>
              </InlineStack>
              <Text variant="bodySm" tone="subdued" as="p">
                {price > 0
                  ? `$${price}/${interval === 'annual' ? 'year' : 'month'}`
                  : 'No charge'}
                {periodEnd && ` · Renews ${formatDate(periodEnd)}`}
              </Text>
            </BlockStack>
          </InlineStack>
        </InlineStack>

        {/* Usage */}
        {usage && (
          <>
            <Box borderBlockStartWidth="025" borderColor="border" paddingBlockStart="400">
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text as="span" variant="bodySm" tone="subdued">
                    {usage.resource || 'Orders'} this period
                  </Text>
                  <Text as="span" variant="bodySm" fontWeight="semibold">
                    {usage.current.toLocaleString()} / {usage.limit === Infinity ? '∞' : usage.limit.toLocaleString()}
                  </Text>
                </InlineStack>
                {usage.limit !== Infinity && (
                  <ProgressBar
                    progress={Math.min((usage.current / usage.limit) * 100, 100)}
                    tone={usage.current >= usage.limit ? 'critical' : usage.current >= usage.limit * 0.8 ? 'highlight' : 'primary'}
                    size="small"
                  />
                )}
              </BlockStack>
            </Box>
          </>
        )}

        {/* Actions */}
        {showManageButton && (
          <InlineStack gap="200">
            <Button onClick={() => navigate('/app/billing')}>Manage Subscription</Button>
            {planTier !== 'ultra' && (
              <Button variant="primary" onClick={() => navigate('/app/billing')}>Upgrade Plan</Button>
            )}
          </InlineStack>
        )}
      </BlockStack>
    </Card>
  );
}

// ============================================
// FEATURE LOCKED CARD
// ============================================

export interface FeatureLockedCardProps {
  /** Feature name */
  feature: string;
  /** Feature description */
  description: string;
  /** Icon to show */
  icon?: React.ComponentType<any>;
  /** Required plan */
  requiredPlan?: PlanTier;
  /** Bullet points of what's included */
  benefits?: string[];
}

export function FeatureLockedCard({
  feature,
  description,
  icon: IconComponent = ChartVerticalIcon,
  requiredPlan = 'pro',
  benefits = [],
}: FeatureLockedCardProps) {
  const navigate = useNavigate();
  const planDetails = PLAN_DETAILS[requiredPlan];

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack gap="300" blockAlign="start">
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            backgroundColor: '#f3f4f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Icon source={IconComponent} tone="subdued" />
          </div>
          <BlockStack gap="100">
            <InlineStack gap="200" blockAlign="center">
              <Text variant="headingMd" as="h3">{feature}</Text>
              <Badge tone={getPlanBadgeTone(requiredPlan)}>{planDetails.name}+</Badge>
            </InlineStack>
            <Text variant="bodySm" tone="subdued" as="p">{description}</Text>
          </BlockStack>
        </InlineStack>

        {benefits.length > 0 && (
          <Box
            padding="300"
            background="bg-surface-secondary"
            borderRadius="200"
          >
            <BlockStack gap="200">
              <Text variant="bodySm" fontWeight="semibold" as="p">What you'll get:</Text>
              {benefits.map((benefit, i) => (
                <InlineStack key={i} gap="200" blockAlign="center">
                  <div style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: planDetails.color,
                  }} />
                  <Text variant="bodySm" as="span">{benefit}</Text>
                </InlineStack>
              ))}
            </BlockStack>
          </Box>
        )}

        <Button variant="primary" onClick={() => navigate('/app/billing')}>
          Upgrade to {planDetails.name}
        </Button>
      </BlockStack>
    </Card>
  );
}
