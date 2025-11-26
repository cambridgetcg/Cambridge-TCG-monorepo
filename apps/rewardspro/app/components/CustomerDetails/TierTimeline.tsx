import {
  Box,
  BlockStack,
  InlineStack,
  Text,
  Badge,
} from '@shopify/polaris';

interface TierChangeLog {
  id: string;
  fromTierName: string | null;
  toTierName: string | null;
  changeType: string;
  triggerType: string;
  totalSpending: string | null;
  periodSpending: string | null;
  note: string | null;
  createdAt: string;
}

interface TierTimelineProps {
  logs: TierChangeLog[];
  formatAmount: (amount: string | number) => string;
  formatDate: (date: string) => string;
}

const changeTypeConfig: Record<string, {
  label: string;
  tone: 'success' | 'critical' | 'info' | 'attention';
  icon: string;
}> = {
  UPGRADE: { label: 'Upgraded', tone: 'success', icon: '↑' },
  DOWNGRADE: { label: 'Downgraded', tone: 'critical', icon: '↓' },
  INITIAL_ASSIGNMENT: { label: 'Joined', tone: 'info', icon: '★' },
  MANUAL: { label: 'Manual Change', tone: 'attention', icon: '✎' },
};

const triggerTypeLabels: Record<string, string> = {
  ORDER_COMPLETED: 'Order completed',
  MANUAL_ADJUSTMENT: 'Manual adjustment',
  SCHEDULED_EVALUATION: 'Scheduled evaluation',
  CUSTOMER_SYNC: 'Customer sync',
  INITIAL: 'Initial assignment',
};

export function TierTimeline({ logs, formatAmount, formatDate }: TierTimelineProps) {
  if (logs.length === 0) {
    return (
      <Box padding="400">
        <InlineStack gap="300" blockAlign="center">
          <Box
            background="bg-surface-secondary"
            padding="300"
            borderRadius="200"
          >
            <Text as="span" variant="headingMd">📊</Text>
          </Box>
          <BlockStack gap="100">
            <Text as="span" variant="headingSm">No tier changes yet</Text>
            <Text as="span" variant="bodySm" tone="subdued">
              Tier changes will be recorded as the customer progresses through loyalty tiers
            </Text>
          </BlockStack>
        </InlineStack>
      </Box>
    );
  }

  return (
    <BlockStack gap="0">
      {logs.map((log, index) => {
        const config = changeTypeConfig[log.changeType] || {
          label: log.changeType.replace(/_/g, ' '),
          tone: 'info' as const,
          icon: '•',
        };
        const isLast = index === logs.length - 1;

        return (
          <Box key={log.id} paddingBlockEnd={isLast ? '0' : '0'}>
            <InlineStack gap="400" wrap={false} blockAlign="start">
              {/* Timeline line and dot */}
              <Box minWidth="24px">
                <BlockStack gap="0" align="center">
                  {/* Dot */}
                  <Box
                    background={
                      config.tone === 'success' ? 'bg-fill-success' :
                      config.tone === 'critical' ? 'bg-fill-critical' :
                      config.tone === 'attention' ? 'bg-fill-caution' :
                      'bg-fill-info'
                    }
                    borderRadius="full"
                    minWidth="24px"
                    minHeight="24px"
                  >
                    <div style={{
                      width: '24px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '12px',
                      fontWeight: 'bold',
                    }}>
                      {config.icon}
                    </div>
                  </Box>
                  {/* Connecting line */}
                  {!isLast && (
                    <div style={{
                      width: '2px',
                      height: '60px',
                      backgroundColor: 'var(--p-color-border-secondary)',
                      marginTop: '4px',
                    }} />
                  )}
                </BlockStack>
              </Box>

              {/* Content */}
              <Box paddingBlockEnd="400" minWidth="0" width="100%">
                <BlockStack gap="200">
                  {/* Header */}
                  <InlineStack align="space-between" blockAlign="start" wrap={false}>
                    <InlineStack gap="200" blockAlign="center">
                      <Badge tone={config.tone}>
                        {config.label}
                      </Badge>
                      {log.toTierName && (
                        <Text as="span" variant="headingSm">
                          to {log.toTierName}
                        </Text>
                      )}
                    </InlineStack>
                    <Text as="span" variant="bodySm" tone="subdued">
                      {formatDate(log.createdAt)}
                    </Text>
                  </InlineStack>

                  {/* Tier transition */}
                  {log.fromTierName && log.toTierName && (
                    <InlineStack gap="200" blockAlign="center">
                      <Box
                        background="bg-surface-secondary"
                        padding="100"
                        borderRadius="100"
                      >
                        <Text as="span" variant="bodySm">
                          {log.fromTierName}
                        </Text>
                      </Box>
                      <Text as="span" tone="subdued">→</Text>
                      <Box
                        background={config.tone === 'success' ? 'bg-fill-success-secondary' : 'bg-fill-critical-secondary'}
                        padding="100"
                        borderRadius="100"
                      >
                        <Text as="span" variant="bodySm" fontWeight="semibold">
                          {log.toTierName}
                        </Text>
                      </Box>
                    </InlineStack>
                  )}

                  {/* Note */}
                  {log.note && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      {log.note}
                    </Text>
                  )}

                  {/* Metadata */}
                  <InlineStack gap="300">
                    <Text as="span" variant="bodySm" tone="subdued">
                      {triggerTypeLabels[log.triggerType] || log.triggerType.replace(/_/g, ' ').toLowerCase()}
                    </Text>
                    {log.totalSpending && (
                      <>
                        <Text as="span" variant="bodySm" tone="subdued">•</Text>
                        <Text as="span" variant="bodySm" tone="subdued">
                          Total spent: {formatAmount(log.totalSpending)}
                        </Text>
                      </>
                    )}
                  </InlineStack>
                </BlockStack>
              </Box>
            </InlineStack>
          </Box>
        );
      })}
    </BlockStack>
  );
}
