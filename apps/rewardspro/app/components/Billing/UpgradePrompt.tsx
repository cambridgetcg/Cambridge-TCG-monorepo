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
  Modal,
} from '@shopify/polaris';
import {
  LockIcon,
  StarIcon,
  ChartVerticalIcon,
  CreditCardIcon,
  ArrowUpIcon,
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
            <Icon source={IconComponent as any} tone="subdued" />
          </div>
          <BlockStack gap="100">
            <InlineStack gap="200" blockAlign="center">
              <Text variant="headingMd" as="h3">{feature}</Text>
              <Badge tone={getPlanBadgeTone(requiredPlan)}>{`${planDetails.name}+`}</Badge>
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

// ============================================
// LIMIT HINT - SUBTLE UPGRADE NUDGES
// ============================================

export type LimitHintVariant = 'inline' | 'badge' | 'tooltip' | 'contextual';

export interface LimitHintProps {
  /** Current usage count */
  current: number;
  /** Maximum limit for current plan */
  limit: number;
  /** Resource name (singular, e.g., "raffle", "campaign") */
  resource: string;
  /** What the next tier offers (optional, auto-calculated if not provided) */
  nextTierLimit?: number;
  /** Name of next tier (optional) */
  nextTierName?: string;
  /** Visual variant */
  variant?: LimitHintVariant;
  /** Show only when approaching limit (default: 60%) */
  showThreshold?: number;
  /** Always show regardless of threshold */
  alwaysShow?: boolean;
  /** Compact mode - smaller text */
  compact?: boolean;
}

/**
 * LimitHint - Provides subtle, subconscious upgrade nudges
 *
 * Shows usage context without being pushy. Designed to plant
 * the seed of "I could do more with a higher plan" without
 * interrupting the user's workflow.
 *
 * Variants:
 * - inline: Small progress bar with usage count
 * - badge: Compact badge showing "2/3"
 * - tooltip: Icon with hover tooltip
 * - contextual: Shows comparison with next tier
 */
export function LimitHint({
  current,
  limit,
  resource,
  nextTierLimit,
  nextTierName,
  variant = 'inline',
  showThreshold = 60,
  alwaysShow = false,
  compact = false,
}: LimitHintProps) {
  const navigate = useNavigate();

  // Calculate usage percentage
  const percentage = limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
  const isApproaching = percentage >= showThreshold;
  const isAtLimit = current >= limit;
  const remaining = Math.max(limit - current, 0);

  // Don't show if under threshold and not forced
  if (!alwaysShow && !isApproaching && percentage < showThreshold) {
    return null;
  }

  // Auto-calculate next tier info if not provided
  const upgradeTierName = nextTierName || 'Pro';
  const upgradeTierLimit = nextTierLimit || limit * 3; // Rough estimate

  // Color based on usage
  const getProgressColor = () => {
    if (isAtLimit) return '#dc2626'; // red
    if (percentage >= 80) return '#f59e0b'; // amber
    if (percentage >= 60) return '#eab308'; // yellow
    return '#22c55e'; // green
  };

  const getTone = (): 'success' | 'warning' | 'critical' | 'info' => {
    if (isAtLimit) return 'critical';
    if (percentage >= 80) return 'warning';
    if (percentage >= 60) return 'info';
    return 'success';
  };

  // Inline variant - small progress indicator
  if (variant === 'inline') {
    return (
      <Box
        paddingInline="300"
        paddingBlock="150"
        background={isAtLimit ? 'bg-surface-critical' : 'bg-surface-secondary'}
        borderRadius="200"
      >
        <InlineStack gap="300" blockAlign="center" wrap={false}>
          <div style={{
            width: compact ? '60px' : '80px',
            height: '6px',
            backgroundColor: '#e5e7eb',
            borderRadius: '3px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${percentage}%`,
              height: '100%',
              backgroundColor: getProgressColor(),
              borderRadius: '3px',
              transition: 'width 0.3s ease'
            }} />
          </div>
          <Text as="span" variant={compact ? 'bodySm' : 'bodyMd'} tone="subdued">
            {`${current}/${limit}`} {resource}{limit !== 1 ? 's' : ''}
          </Text>
          {isAtLimit && (
            <Button
              size="slim"
              variant="plain"
              icon={ArrowUpIcon}
              onClick={() => navigate('/app/billing')}
            >
              Upgrade
            </Button>
          )}
        </InlineStack>
      </Box>
    );
  }

  // Badge variant - compact count display
  if (variant === 'badge') {
    return (
      <InlineStack gap="200" blockAlign="center">
        <Badge tone={getTone()}>
          {`${current}/${limit}`}
        </Badge>
        {isAtLimit && (
          <Button
            size="slim"
            variant="plain"
            onClick={() => navigate('/app/billing')}
          >
            Upgrade
          </Button>
        )}
      </InlineStack>
    );
  }

  // Contextual variant - shows comparison with next tier
  if (variant === 'contextual') {
    return (
      <Box
        padding="300"
        background={isAtLimit ? 'bg-surface-critical' : 'bg-surface-secondary'}
        borderRadius="200"
      >
        <BlockStack gap="200">
          <InlineStack align="space-between" blockAlign="center">
            <InlineStack gap="200" blockAlign="center">
              <div style={{
                width: '100px',
                height: '6px',
                backgroundColor: '#e5e7eb',
                borderRadius: '3px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${percentage}%`,
                  height: '100%',
                  backgroundColor: getProgressColor(),
                  borderRadius: '3px'
                }} />
              </div>
              <Text as="span" variant="bodySm">
                {current} of {limit} {resource}{limit !== 1 ? 's' : ''} used
              </Text>
            </InlineStack>
            <Badge tone={getTone()}>
              {`${remaining} left`}
            </Badge>
          </InlineStack>

          {/* Subtle comparison with next tier */}
          {percentage >= 50 && (
            <InlineStack align="space-between" blockAlign="center">
              <Text as="span" variant="bodySm" tone="subdued">
                {upgradeTierName} includes {upgradeTierLimit} {resource}{upgradeTierLimit !== 1 ? 's' : ''}
              </Text>
              <Button
                size="slim"
                variant="plain"
                onClick={() => navigate('/app/billing')}
              >
                Compare plans
              </Button>
            </InlineStack>
          )}
        </BlockStack>
      </Box>
    );
  }

  // Tooltip variant - minimal with hover info (default fallback)
  return (
    <InlineStack gap="100" blockAlign="center">
      <div
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: getProgressColor()
        }}
        title={`${current}/${limit} ${resource}s used`}
      />
      <Text as="span" variant="bodySm" tone="subdued">
        {`${current}/${limit}`}
      </Text>
    </InlineStack>
  );
}

// ============================================
// PAGE HEADER LIMIT STATUS
// ============================================

export interface PageLimitStatusProps {
  /** Current usage count */
  current: number;
  /** Maximum limit */
  limit: number;
  /** Resource name (singular) */
  resource: string;
  /** What action is limited (e.g., "create", "add") */
  action?: string;
  /** Next tier limit for comparison */
  nextTierLimit?: number;
  /** Next tier name */
  nextTierName?: string;
}

/**
 * PageLimitStatus - Shows limit status in page headers
 *
 * Designed to appear next to page titles or action buttons,
 * providing context about current usage without blocking actions.
 */
export function PageLimitStatus({
  current,
  limit,
  resource,
  action = 'create',
  nextTierLimit,
  nextTierName = 'Pro',
}: PageLimitStatusProps) {
  const navigate = useNavigate();
  const isAtLimit = current >= limit;
  const remaining = Math.max(limit - current, 0);
  const percentage = limit > 0 ? (current / limit) * 100 : 0;

  // Only show when at 50% or more
  if (percentage < 50) {
    return null;
  }

  const getMessage = () => {
    if (isAtLimit) {
      return `You've reached your ${resource} limit`;
    }
    if (remaining === 1) {
      return `You can ${action} 1 more ${resource}`;
    }
    return `You can ${action} ${remaining} more ${resource}s`;
  };

  return (
    <InlineStack gap="200" blockAlign="center">
      <Box
        paddingInline="200"
        paddingBlock="100"
        background={isAtLimit ? 'bg-surface-critical' : 'bg-surface-secondary'}
        borderRadius="150"
      >
        <Text as="span" variant="bodySm" tone={isAtLimit ? 'critical' : 'subdued'}>
          {getMessage()}
        </Text>
      </Box>
      {isAtLimit && nextTierLimit && (
        <Button
          size="slim"
          variant="plain"
          onClick={() => navigate('/app/billing')}
        >
          {`${nextTierName} allows ${nextTierLimit}`}
        </Button>
      )}
    </InlineStack>
  );
}

// ============================================
// CREATE BUTTON WITH LIMIT AWARENESS
// ============================================

export interface LimitAwareButtonProps {
  /** Current usage count */
  current: number;
  /** Maximum limit */
  limit: number;
  /** Resource name (singular) */
  resource: string;
  /** Button click handler (only called if within limit) */
  onClick: () => void;
  /** Button text */
  children: React.ReactNode;
  /** Button variant */
  variant?: 'primary' | 'secondary' | 'tertiary';
  /** Next tier info for upgrade messaging */
  nextTierLimit?: number;
  nextTierName?: string;
}

/**
 * LimitAwareButton - Create button that handles limit state
 *
 * When within limit: Normal button
 * When at limit: Changes to upgrade prompt
 */
export function LimitAwareButton({
  current,
  limit,
  resource,
  onClick,
  children,
  variant = 'primary',
  nextTierLimit,
  nextTierName = 'Pro',
}: LimitAwareButtonProps) {
  const navigate = useNavigate();
  const isAtLimit = current >= limit;
  const remaining = Math.max(limit - current, 0);

  if (isAtLimit) {
    return (
      <InlineStack gap="200" blockAlign="center">
        <Button
          variant={variant}
          onClick={() => navigate('/app/billing')}
        >
          Upgrade to Add More
        </Button>
        <Text as="span" variant="bodySm" tone="subdued">
          {nextTierName} allows {nextTierLimit || limit * 3} {resource}s
        </Text>
      </InlineStack>
    );
  }

  return (
    <InlineStack gap="300" blockAlign="center">
      <Button variant={variant} onClick={onClick}>
        {children as string}
      </Button>
      {remaining <= 2 && remaining > 0 && (
        <Text as="span" variant="bodySm" tone="subdued">
          {remaining} slot{remaining !== 1 ? 's' : ''} remaining
        </Text>
      )}
    </InlineStack>
  );
}

// ============================================
// LIMIT EXCEEDED MODAL
// ============================================

export interface LimitExceededModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Close handler */
  onClose: () => void;
  /** Resource that was limited */
  resource: string;
  /** Current count */
  current: number;
  /** Maximum limit for current plan */
  limit: number;
  /** Current plan name */
  currentPlan?: string;
  /** Action that was attempted */
  action?: string;
  /** Custom title */
  title?: string;
}

// Plan upgrade incentives - what each upgrade offers
// Prices from app/constants/billing.constants.ts
// Limits from PLAN_COMPARISON in same file
const UPGRADE_INCENTIVES: Record<string, {
  name: string;
  price: string;
  incentives: {
    mysteryBoxes: number;
    raffles: number;
    challenges: number;
    campaigns: number;
    automationFlows: number;
  };
  highlight: string;
}> = {
  pro: {
    name: 'Pro',
    price: '$39/mo',
    incentives: {
      mysteryBoxes: 2,
      raffles: 3,
      challenges: 5,
      campaigns: 5,
      automationFlows: 5,
    },
    highlight: 'Perfect for growing stores',
  },
  max: {
    name: 'Max',
    price: '$149/mo',
    incentives: {
      mysteryBoxes: 5,
      raffles: 10,
      challenges: 15,
      campaigns: 25,
      automationFlows: 20,
    },
    highlight: 'Best for scaling businesses',
  },
  ultra: {
    name: 'Ultra',
    price: '$499/mo',
    incentives: {
      mysteryBoxes: 999999,
      raffles: 999999,
      challenges: 999999,
      campaigns: 999999,
      automationFlows: 999999,
    },
    highlight: 'Unlimited everything',
  },
};

// Map resource names to incentive keys
const RESOURCE_TO_INCENTIVE_KEY: Record<string, keyof typeof UPGRADE_INCENTIVES['pro']['incentives']> = {
  'mystery box': 'mysteryBoxes',
  'mystery boxes': 'mysteryBoxes',
  'active mystery box': 'mysteryBoxes',
  'active mystery boxes': 'mysteryBoxes',
  'raffle': 'raffles',
  'raffles': 'raffles',
  'active raffle': 'raffles',
  'active raffles': 'raffles',
  'challenge': 'challenges',
  'challenges': 'challenges',
  'active challenge': 'challenges',
  'active challenges': 'challenges',
  'campaign': 'campaigns',
  'campaigns': 'campaigns',
  'automation flow': 'automationFlows',
  'automation flows': 'automationFlows',
  'automation': 'automationFlows',
};

/**
 * LimitExceededModal - Shows when user hits a rate limit during an action
 *
 * Provides clear messaging about what happened and incentives to upgrade.
 * Designed to convert limit encounters into upgrade opportunities.
 */
export function LimitExceededModal({
  open,
  onClose,
  resource,
  current,
  limit,
  currentPlan = 'Free',
  action = 'create',
  title,
}: LimitExceededModalProps) {
  const navigate = useNavigate();
  const currentTier = getPlanTier(currentPlan);

  // Determine the upgrade path
  const getNextTier = (): 'pro' | 'max' | 'ultra' => {
    if (currentTier === 'free') return 'pro';
    if (currentTier === 'pro') return 'max';
    return 'ultra';
  };

  const nextTier = getNextTier();
  const upgradeInfo = UPGRADE_INCENTIVES[nextTier];

  // Get the specific incentive for this resource
  const resourceKey = RESOURCE_TO_INCENTIVE_KEY[resource.toLowerCase()] || 'mysteryBoxes';
  const nextTierLimit = upgradeInfo.incentives[resourceKey];

  // Format the limit for display
  const formatLimit = (n: number) => n >= 999999 ? 'Unlimited' : n.toString();

  const handleUpgrade = () => {
    navigate('/app/billing');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title || `${resource.charAt(0).toUpperCase() + resource.slice(1)} Limit Reached`}
      primaryAction={{
        content: `Upgrade to ${upgradeInfo.name}`,
        onAction: handleUpgrade,
      }}
      secondaryActions={[
        {
          content: 'Maybe Later',
          onAction: onClose,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          {/* Current status */}
          <Box
            padding="400"
            background="bg-surface-critical"
            borderRadius="200"
          >
            <BlockStack gap="200">
              <InlineStack gap="200" blockAlign="center">
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: '#fee2e2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Text as="span" variant="headingLg">🚫</Text>
                </div>
                <BlockStack gap="050">
                  <Text variant="headingMd" as="h3">
                    You've used all {limit} {resource}{limit !== 1 ? 's' : ''} on your plan
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    Your {currentPlan} plan includes {limit} {resource}{limit !== 1 ? 's' : ''}.
                    Upgrade to {action} more.
                  </Text>
                </BlockStack>
              </InlineStack>
            </BlockStack>
          </Box>

          {/* Upgrade incentive */}
          <Box
            padding="400"
            background="bg-surface-success"
            borderRadius="200"
          >
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <Badge tone="success">{upgradeInfo.name}</Badge>
                  <Text variant="headingMd" as="h3">
                    Get {formatLimit(nextTierLimit)} {resource}{nextTierLimit !== 1 ? 's' : ''}
                  </Text>
                </InlineStack>
                <Text variant="bodyMd" fontWeight="semibold" as="span">
                  {upgradeInfo.price}
                </Text>
              </InlineStack>

              <Text variant="bodySm" tone="success" as="p">
                {upgradeInfo.highlight}
              </Text>

              {/* All incentives for this tier */}
              <Box paddingBlockStart="200">
                <Text variant="bodySm" fontWeight="semibold" as="p">
                  What's included in {upgradeInfo.name}:
                </Text>
                <Box paddingBlockStart="200">
                  <InlineStack gap="200" wrap>
                    <Badge tone="info">{`${formatLimit(upgradeInfo.incentives.mysteryBoxes)} Mystery Boxes`}</Badge>
                    <Badge tone="info">{`${formatLimit(upgradeInfo.incentives.raffles)} Raffles`}</Badge>
                    <Badge tone="info">{`${formatLimit(upgradeInfo.incentives.challenges)} Challenges`}</Badge>
                    <Badge tone="info">{`${formatLimit(upgradeInfo.incentives.campaigns)} Campaigns`}</Badge>
                  </InlineStack>
                </Box>
              </Box>
            </BlockStack>
          </Box>

          {/* Social proof / urgency */}
          <Box
            padding="300"
            background="bg-surface-secondary"
            borderRadius="200"
          >
            <InlineStack gap="200" blockAlign="center">
              <Text as="span" variant="headingLg">💡</Text>
              <Text variant="bodySm" as="p">
                <strong>Pro tip:</strong> Stores using multiple gamification features see
                <strong> 2.3x higher customer retention</strong> on average.
              </Text>
            </InlineStack>
          </Box>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

// ============================================
// LIMIT EXCEEDED TOAST WITH UPGRADE LINK
// ============================================

export interface LimitExceededToastInfo {
  /** Resource that was limited */
  resource: string;
  /** Current count */
  current: number;
  /** Maximum limit */
  limit: number;
  /** Current plan */
  currentPlan: string;
}

/**
 * Helper to get toast content for limit exceeded errors
 */
export function getLimitExceededToastContent(info: LimitExceededToastInfo): {
  content: string;
  action?: { content: string; url: string };
} {
  return {
    content: `${info.resource.charAt(0).toUpperCase() + info.resource.slice(1)} limit reached (${info.current}/${info.limit})`,
    action: {
      content: 'Upgrade',
      url: '/app/billing',
    },
  };
}
