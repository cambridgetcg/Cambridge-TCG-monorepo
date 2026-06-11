/**
 * Feature Gate Components
 * Restricts access to features based on billing plan
 */

import { Banner, Button, InlineStack, Text, Box, BlockStack, Badge } from "@shopify/polaris";
import { LockIcon } from "~/utils/polaris-icons";
import type { ReactNode } from "react";

interface FeatureGateProps {
  hasAccess: boolean;
  children: ReactNode;
  feature: string;
  upgradeMessage?: string;
  upgradeUrl?: string;
  fallback?: ReactNode;
}

/**
 * Feature Gate - Shows content only if user has access
 * Otherwise shows upgrade prompt
 */
export function FeatureGate({
  hasAccess,
  children,
  feature,
  upgradeMessage,
  upgradeUrl = "/app/billing",
  fallback,
}: FeatureGateProps) {
  if (hasAccess) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <Box padding="400">
      <Banner
        title={`Upgrade to unlock ${feature}`}
        tone="info"
        action={{
          content: "Upgrade Plan",
          url: upgradeUrl,
        }}
      >
        <Text as="p">{upgradeMessage || `This feature requires a higher plan.`}</Text>
      </Banner>
    </Box>
  );
}

interface LockedFeatureProps {
  feature: string;
  upgradeMessage: string;
  upgradeUrl?: string;
  tone?: "info" | "warning";
}

/**
 * Locked Feature Banner - Shows when a feature is not available
 */
export function LockedFeature({
  feature,
  upgradeMessage,
  upgradeUrl = "/app/billing",
  tone = "info",
}: LockedFeatureProps) {
  return (
    <Banner
      title={feature}
      tone={tone}
      icon={LockIcon}
      action={{
        content: "Upgrade Plan",
        url: upgradeUrl,
      }}
    >
      <Text as="p">{upgradeMessage}</Text>
    </Banner>
  );
}

interface LimitReachedProps {
  type: "tiers" | "customers" | "orders";
  current: number;
  max: number;
  upgradeMessage: string;
  upgradeUrl?: string;
}

/**
 * Limit Reached - Shows when a usage limit has been hit
 */
export function LimitReached({
  type,
  current,
  max,
  upgradeMessage,
  upgradeUrl = "/app/billing",
}: LimitReachedProps) {
  return (
    <Banner
      title={`${type.charAt(0).toUpperCase() + type.slice(1)} limit reached`}
      tone="warning"
      action={{
        content: "Upgrade Plan",
        url: upgradeUrl,
      }}
    >
      <BlockStack gap="200">
        <Text as="p">
          You've reached your plan limit of {max} {type}.
        </Text>
        <Text as="p" tone="subdued">
          Current usage: {current} / {max}
        </Text>
        <Text as="p">{upgradeMessage}</Text>
      </BlockStack>
    </Banner>
  );
}

interface UsageMeterProps {
  label: string;
  current: number;
  max: number;
  showUpgrade?: boolean;
  upgradeUrl?: string;
}

/**
 * Usage Meter - Shows current usage vs limit
 */
export function UsageMeter({
  label,
  current,
  max,
  showUpgrade = false,
  upgradeUrl = "/app/billing",
}: UsageMeterProps) {
  const percentage = max === Infinity ? 0 : Math.round((current / max) * 100);
  const isNearLimit = percentage >= 80;
  const atLimit = percentage >= 100;

  return (
    <BlockStack gap="200">
      <InlineStack align="space-between" blockAlign="center">
        <Text as="span" variant="bodyMd" fontWeight="semibold">
          {label}
        </Text>
        {max === Infinity ? (
          <Badge tone="success">Unlimited</Badge>
        ) : (
          <Text as="span" variant="bodySm" tone={atLimit ? "critical" : isNearLimit ? "caution" : "subdued"}>
            {current} / {max}
          </Text>
        )}
      </InlineStack>

      {max !== Infinity && (
        <Box
          background="bg-surface-secondary"
          borderRadius="100"
          minHeight="0.5rem"
          width="100%"
        >
          <Box
            background={atLimit ? "bg-fill-critical" : isNearLimit ? "bg-fill-caution" : "bg-fill-success"}
            borderRadius="100"
            minHeight="0.5rem"
            width={`${Math.min(percentage, 100)}%`}
          />
        </Box>
      )}

      {showUpgrade && isNearLimit && !atLimit && (
        <Text as="p" variant="bodySm" tone="caution">
          You're approaching your limit.{" "}
          <Button url={upgradeUrl} variant="plain">
            Upgrade to get more
          </Button>
        </Text>
      )}

      {showUpgrade && atLimit && (
        <Text as="p" variant="bodySm" tone="critical">
          You've reached your limit.{" "}
          <Button url={upgradeUrl} variant="plain">
            Upgrade now
          </Button>
        </Text>
      )}
    </BlockStack>
  );
}

interface PlanBadgeProps {
  plan: string;
  size?: "small" | "medium";
}

/**
 * Plan Badge - Shows current plan
 */
export function PlanBadge({ plan, size = "medium" }: PlanBadgeProps) {
  const getTone = (planName: string) => {
    if (planName.includes("Free")) return "info";
    if (planName.includes("Pro") || planName.includes("Starter")) return "success";
    if (planName.includes("Max") || planName.includes("Growth")) return "attention";
    if (planName.includes("Ultra")) return "warning";
    if (planName.includes("Enterprise")) return "magic";
    return "info";
  };

  return (
    <Badge tone={getTone(plan)} size={size}>
      {plan}
    </Badge>
  );
}

interface DisabledFeatureProps {
  children: ReactNode;
  reason: string;
  showTooltip?: boolean;
}

/**
 * Disabled Feature - Visually disables content with tooltip
 */
export function DisabledFeature({ children, reason, showTooltip = true }: DisabledFeatureProps) {
  return (
    <div
      style={{
        opacity: 0.5,
        pointerEvents: "none",
        position: "relative",
      }}
      title={showTooltip ? reason : undefined}
    >
      {children}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          cursor: "not-allowed",
          pointerEvents: "auto",
        }}
        title={reason}
      />
    </div>
  );
}
