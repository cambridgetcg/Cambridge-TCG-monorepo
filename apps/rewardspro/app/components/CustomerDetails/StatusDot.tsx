import { InlineStack, Text } from '@shopify/polaris';

type StatusTone = 'success' | 'warning' | 'critical' | 'info' | 'subdued';

interface StatusDotProps {
  status: string;
  type: 'financial' | 'fulfillment';
  showLabel?: boolean;
}

const financialStatusMap: Record<string, { tone: StatusTone; label: string }> = {
  PAID: { tone: 'success', label: 'Paid' },
  AUTHORIZED: { tone: 'info', label: 'Authorized' },
  PENDING: { tone: 'warning', label: 'Pending' },
  PARTIALLY_PAID: { tone: 'warning', label: 'Partial' },
  PARTIALLY_REFUNDED: { tone: 'warning', label: 'Partial Refund' },
  REFUNDED: { tone: 'critical', label: 'Refunded' },
  VOIDED: { tone: 'critical', label: 'Voided' },
  EXPIRED: { tone: 'subdued', label: 'Expired' },
};

const fulfillmentStatusMap: Record<string, { tone: StatusTone; label: string }> = {
  FULFILLED: { tone: 'success', label: 'Fulfilled' },
  UNFULFILLED: { tone: 'subdued', label: 'Unfulfilled' },
  PARTIALLY_FULFILLED: { tone: 'warning', label: 'Partial' },
  SCHEDULED: { tone: 'info', label: 'Scheduled' },
  ON_HOLD: { tone: 'warning', label: 'On Hold' },
  IN_PROGRESS: { tone: 'info', label: 'In Progress' },
};

const toneColors: Record<StatusTone, string> = {
  success: '#22c55e',
  warning: '#eab308',
  critical: '#ef4444',
  info: '#3b82f6',
  subdued: '#9ca3af',
};

export function StatusDot({ status, type, showLabel = true }: StatusDotProps) {
  const statusMap = type === 'financial' ? financialStatusMap : fulfillmentStatusMap;
  const normalizedStatus = status?.toUpperCase().replace(/ /g, '_') || '';
  const config = statusMap[normalizedStatus] || { tone: 'subdued' as StatusTone, label: status || 'Unknown' };

  return (
    <InlineStack gap="100" blockAlign="center" wrap={false}>
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: toneColors[config.tone],
          flexShrink: 0,
        }}
      />
      {showLabel && (
        <Text as="span" variant="bodySm" tone="subdued">
          {config.label}
        </Text>
      )}
    </InlineStack>
  );
}

// Helper to get just the label for a status
export function getStatusLabel(status: string, type: 'financial' | 'fulfillment'): string {
  const statusMap = type === 'financial' ? financialStatusMap : fulfillmentStatusMap;
  const normalizedStatus = status?.toUpperCase().replace(/ /g, '_') || '';
  return statusMap[normalizedStatus]?.label || status || 'Unknown';
}
