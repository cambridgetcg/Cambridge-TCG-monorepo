import { Card, BlockStack, Text, Banner, ProgressBar, InlineStack, Icon } from "@shopify/polaris";
import { CheckCircleIcon, RefreshIcon, AlertTriangleIcon } from "~/utils/polaris-icons";

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface SyncStatus {
  status: 'IDLE' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  lastSyncAt?: Date | string;
  errorMessage?: string | null;
  recordsProcessed?: number;
}

export interface AutoSyncStatusProps {
  syncStatus: SyncStatus | null;
  onRetry?: () => void;
}

// ============================================
// COMPONENT
// ============================================

export function AutoSyncStatus({ syncStatus, onRetry }: AutoSyncStatusProps) {
  // Don't show anything if sync is completed or doesn't exist
  if (!syncStatus || syncStatus.status === 'COMPLETED' || syncStatus.status === 'IDLE') {
    return null;
  }

  const isRunning = syncStatus.status === 'RUNNING';
  const isFailed = syncStatus.status === 'FAILED';

  return (
    <Card>
      <BlockStack gap="300">
        {isRunning && (
          <Banner
            title="Syncing your data..."
            tone="info"
          >
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                We're importing your customers and orders from Shopify. This may take a few minutes depending on your store size.
                You can continue using the app while this completes in the background.
              </Text>
              <ProgressBar progress={75} tone="primary" size="small" animated />
              <InlineStack gap="200" align="start">
                <Icon source={RefreshIcon} tone="info" />
                <Text as="p" variant="bodySm" tone="subdued">
                  {syncStatus.recordsProcessed
                    ? `${syncStatus.recordsProcessed} records processed so far...`
                    : 'Processing your data...'}
                </Text>
              </InlineStack>
            </BlockStack>
          </Banner>
        )}

        {isFailed && (
          <Banner
            title="Data sync failed"
            tone="warning"
            action={{
              content: "Retry sync",
              onAction: onRetry
            }}
          >
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd">
                We encountered an issue while syncing your data from Shopify.
                {syncStatus.errorMessage && ` Error: ${syncStatus.errorMessage}`}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                You can manually sync your data from the Customers and Orders pages, or click "Retry sync" to try again.
              </Text>
            </BlockStack>
          </Banner>
        )}
      </BlockStack>
    </Card>
  );
}
