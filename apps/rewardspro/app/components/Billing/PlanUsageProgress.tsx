import {
  BlockStack,
  Box,
  InlineStack,
  ProgressBar,
  Text
} from "@shopify/polaris";
import type { UsageMetrics } from "~/constants/billing.constants";

interface PlanUsageProgressProps {
  usageMetrics: UsageMetrics;
  currentMonth?: string;
  showProjected?: boolean;
  compact?: boolean;
}

export function PlanUsageProgress({
  usageMetrics,
  currentMonth,
  compact = false
}: PlanUsageProgressProps) {
  const {
    currentUsage,
    planLimit,
    usagePercentage,
    progressTone
  } = usageMetrics;

  if (compact) {
    // Simplified view for dashboard
    return (
      <BlockStack gap="200">
        <InlineStack align="space-between">
          <Text as="span" variant="bodyMd">
            Orders used
          </Text>
          <Text as="span" variant="bodyMd" fontWeight="semibold">
            {currentUsage.toLocaleString()} / {planLimit.toLocaleString()}
          </Text>
        </InlineStack>
        <ProgressBar
          progress={usagePercentage}
          tone={progressTone as any}
          size="small"
        />
      </BlockStack>
    );
  }

  // Full view for billing pages
  return (
    <Box paddingBlockStart="400" paddingBlockEnd="400">
      <BlockStack gap="400">
        {currentMonth && (
          <Text as="p" variant="bodyMd" tone="subdued">
            Usage for {currentMonth}
          </Text>
        )}

        <Box>
          <InlineStack align="space-between" gap="200">
            <Text as="p" variant="bodyMd" tone="subdued">
              Plan limit
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              {planLimit.toLocaleString()} orders
            </Text>
          </InlineStack>
        </Box>

        {/* Progress Bar */}
        <Box>
          <div style={{ position: 'relative' }}>
            <ProgressBar
              progress={usagePercentage}
              tone={progressTone as any}
              size="small"
            />
          </div>
        </Box>

        {/* Usage Stats */}
        <InlineStack gap="400">
          <InlineStack gap="100">
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: progressTone === 'success'
                ? 'var(--p-color-bg-success)'
                : progressTone === 'warning'
                  ? 'var(--p-color-bg-warning)'
                  : 'var(--p-color-bg-critical)',
              marginTop: '4px'
            }} />
            <Text as="span" variant="bodyMd">
              Current: {currentUsage.toLocaleString()} orders
            </Text>
          </InlineStack>

        </InlineStack>
      </BlockStack>
    </Box>
  );
}
