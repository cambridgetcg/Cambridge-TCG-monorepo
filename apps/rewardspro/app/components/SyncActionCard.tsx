/**
 * SyncActionCard - Unified sync action UI component
 *
 * Follows the store credit sync pattern from settings page:
 * - Consistent box styling with background
 * - Title and description
 * - Sync/Cancel button inline
 * - Progress bar with stats when syncing
 * - Optional ETA display
 */

import {
  Box,
  BlockStack,
  InlineStack,
  Text,
  Button,
  ProgressBar,
  Spinner,
  Badge,
  Banner,
} from "@shopify/polaris";
import { RefreshIcon } from "@shopify/polaris-icons";
import type { ReactNode } from "react";

export interface SyncProgress {
  processedCount: number;
  totalCount: number | null;
  percentComplete: number;
  createdCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  errorCount?: number;
}

export interface SyncActionCardProps {
  /** Title of the sync action */
  title: string;
  /** Description of what the sync does */
  description: string;
  /** Button text when not syncing */
  buttonText?: string;
  /** Whether sync is currently in progress */
  isSyncing: boolean;
  /** Whether sync is starting (shows loading spinner on button) */
  isStarting?: boolean;
  /** Progress data when syncing */
  progress?: SyncProgress | null;
  /** Called when sync button is clicked */
  onSync: () => void;
  /** Called when cancel button is clicked */
  onCancel?: () => void;
  /** Whether sync can be started */
  disabled?: boolean;
  /** Optional ETA text */
  eta?: string | null;
  /** Optional custom progress label (e.g., "customers" or "orders") */
  progressLabel?: string;
  /** Whether to show detailed progress stats (created, updated, etc.) */
  showDetailedStats?: boolean;
  /** Custom icon for the button */
  icon?: React.ReactElement | React.FunctionComponent<React.SVGProps<SVGSVGElement>>;
  /** Optional badge to show next to title */
  statusBadge?: ReactNode;
  /** Size variant - 'compact' for settings page, 'full' for dedicated sync pages */
  variant?: 'compact' | 'full';
}

export function SyncActionCard({
  title,
  description,
  buttonText = "Sync",
  isSyncing,
  isStarting = false,
  progress,
  onSync,
  onCancel,
  disabled = false,
  eta,
  progressLabel = "items",
  showDetailedStats = false,
  icon,
  statusBadge,
  variant = 'compact',
}: SyncActionCardProps) {
  const showProgress = isSyncing && progress;
  const progressPercent = progress?.percentComplete || 0;

  // Format progress count
  const progressText = progress
    ? `${progress.processedCount.toLocaleString()}${progress.totalCount ? ` / ${progress.totalCount.toLocaleString()}` : ''} ${progressLabel}`
    : null;

  return (
    <Box
      padding="400"
      background="bg-surface-secondary"
      borderRadius="200"
    >
      <BlockStack gap="300">
        {/* Header */}
        <BlockStack gap="100">
          <InlineStack gap="200" blockAlign="center">
            <Text as="span" variant="bodyMd" fontWeight="semibold">
              {title}
            </Text>
            {statusBadge}
            {isSyncing && variant === 'full' && (
              <InlineStack gap="100" blockAlign="center">
                <Spinner size="small" />
                <Badge tone={"info" as any}>Syncing</Badge>
              </InlineStack>
            )}
          </InlineStack>
          <Text as="span" variant="bodySm" tone="subdued">
            {description}
          </Text>
        </BlockStack>

        {/* Buttons */}
        <InlineStack gap="200">
          <Button
            onClick={onSync}
            icon={icon || RefreshIcon}
            disabled={disabled || isSyncing}
            loading={isStarting}
            size="slim"
            fullWidth={variant === 'compact'}
          >
            {isSyncing ? 'Syncing...' : buttonText}
          </Button>
          {isSyncing && onCancel && (
            <Button
              onClick={onCancel}
              tone="critical"
              variant="plain"
              size="slim"
            >
              Cancel
            </Button>
          )}
        </InlineStack>

        {/* Progress Section */}
        {showProgress && (
          <BlockStack gap="100">
            <ProgressBar
              progress={progressPercent}
              size={variant === 'compact' ? 'small' : 'medium'}
              tone={progressPercent === 100 ? 'success' : 'primary'}
            />
            <InlineStack align="space-between" wrap>
              <InlineStack gap="300" wrap>
                {progressText && (
                  <Text as="span" variant="bodySm" tone="subdued">
                    {progressText}
                  </Text>
                )}
                {showDetailedStats && progress && (
                  <>
                    {progress.createdCount !== undefined && progress.createdCount > 0 && (
                      <Text as="span" variant="bodySm" tone="success">
                        {progress.createdCount.toLocaleString()} created
                      </Text>
                    )}
                    {progress.updatedCount !== undefined && progress.updatedCount > 0 && (
                      <Text as="span" variant="bodySm" tone="base">
                        {progress.updatedCount.toLocaleString()} updated
                      </Text>
                    )}
                    {progress.skippedCount !== undefined && progress.skippedCount > 0 && (
                      <Text as="span" variant="bodySm" tone="subdued">
                        {progress.skippedCount.toLocaleString()} skipped
                      </Text>
                    )}
                    {progress.errorCount !== undefined && progress.errorCount > 0 && (
                      <Text as="span" variant="bodySm" tone="critical">
                        {progress.errorCount.toLocaleString()} errors
                      </Text>
                    )}
                  </>
                )}
              </InlineStack>
              {eta && (
                <Text as="span" variant="bodySm" tone="subdued">
                  {eta}
                </Text>
              )}
            </InlineStack>
          </BlockStack>
        )}
      </BlockStack>
    </Box>
  );
}

/**
 * SyncStatusBanner - Unified sync status banner component
 * Shows success, error, or warning messages after sync completes
 */

export type SyncStatus = 'idle' | 'syncing' | 'completed' | 'failed' | 'cancelled';

export interface SyncStatusBannerProps {
  status: SyncStatus;
  /** Success message content */
  successMessage?: ReactNode;
  /** Error message to show on failure */
  errorMessage?: string | null;
  /** Warning message (e.g., rate limiting) */
  warningMessage?: string | null;
  /** Called when banner is dismissed */
  onDismiss?: () => void;
  /** Whether the banner can be dismissed */
  dismissible?: boolean;
}

export function SyncStatusBanner({
  status,
  successMessage,
  errorMessage,
  warningMessage,
  onDismiss,
  dismissible = true,
}: SyncStatusBannerProps) {
  if (status === 'completed' && successMessage) {
    return (
      <Banner
        tone="success"
        onDismiss={dismissible ? onDismiss : undefined}
      >
        {typeof successMessage === 'string' ? (
          <Text as="p" variant="bodySm">{successMessage}</Text>
        ) : (
          successMessage
        )}
      </Banner>
    );
  }

  if (status === 'failed' && errorMessage) {
    return (
      <Banner
        tone="critical"
        onDismiss={dismissible ? onDismiss : undefined}
      >
        <Text as="p" variant="bodySm">
          {errorMessage}
        </Text>
      </Banner>
    );
  }

  if (warningMessage) {
    return (
      <Banner tone="warning">
        <Text as="p" variant="bodySm">
          {warningMessage}
        </Text>
      </Banner>
    );
  }

  return null;
}

/**
 * SyncProgressCard - Full-featured sync progress card for dedicated sync pages
 * Includes progress bar, detailed stats, and action buttons
 */
export interface SyncProgressCardProps {
  /** Current sync status */
  status: SyncStatus;
  /** Progress data */
  progress: SyncProgress;
  /** Error message if failed */
  error?: string | null;
  /** Label for the items being synced */
  progressLabel?: string;
  /** Called when cancel is clicked */
  onCancel?: () => void;
  /** Called when resume is clicked */
  onResume?: () => void;
  /** Whether cancel/resume actions are loading */
  isLoading?: boolean;
}

export function SyncProgressCard({
  status,
  progress,
  error,
  progressLabel = "items",
  onCancel,
  onResume,
  isLoading = false,
}: SyncProgressCardProps) {
  const isSyncing = status === 'syncing';
  const isFailed = status === 'failed';
  const isCompleted = status === 'completed';
  const isCancelled = status === 'cancelled';

  const getStatusBadge = () => {
    switch (status) {
      case 'syncing':
        return (
          <InlineStack gap="100" blockAlign="center">
            <Spinner size="small" />
            <Badge tone="attention">Syncing</Badge>
          </InlineStack>
        );
      case 'completed':
        return <Badge tone="success">Completed</Badge>;
      case 'failed':
        return <Badge tone="critical">Failed</Badge>;
      case 'cancelled':
        return <Badge tone="warning">Cancelled</Badge>;
      default:
        return null;
    }
  };

  return (
    <Box padding="400" background="bg-surface-secondary" borderRadius="200">
      <BlockStack gap="400">
        {/* Header */}
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h2" variant="headingMd">Sync Progress</Text>
          {getStatusBadge()}
        </InlineStack>

        {/* Progress Bar */}
        <ProgressBar
          progress={progress.percentComplete}
          tone={isFailed ? 'critical' : isCompleted ? 'success' : 'primary'}
          size="medium"
        />

        {/* Stats */}
        <InlineStack gap="400" wrap>
          <Text as="span" variant="bodyMd">
            {progress.processedCount.toLocaleString()}
            {progress.totalCount && ` / ${progress.totalCount.toLocaleString()}`} {progressLabel}
          </Text>
          {progress.createdCount !== undefined && (
            <Text as="span" variant="bodyMd" tone="success">
              {progress.createdCount.toLocaleString()} created
            </Text>
          )}
          {progress.updatedCount !== undefined && (
            <Text as="span" variant="bodyMd" tone="base">
              {progress.updatedCount.toLocaleString()} updated
            </Text>
          )}
          {progress.skippedCount !== undefined && progress.skippedCount > 0 && (
            <Text as="span" variant="bodyMd" tone="subdued">
              {progress.skippedCount.toLocaleString()} skipped
            </Text>
          )}
          {progress.errorCount !== undefined && progress.errorCount > 0 && (
            <Text as="span" variant="bodyMd" tone="critical">
              {progress.errorCount.toLocaleString()} errors
            </Text>
          )}
        </InlineStack>

        {/* Error Banner */}
        {isFailed && error && (
          <Banner title="Sync Failed" tone="critical">
            <BlockStack gap="200">
              <Text as="p">{error}</Text>
              {progress.processedCount > 0 && (
                <Text as="p" tone="subdued">
                  Progress was saved. Click "Resume" to continue from where it stopped.
                </Text>
              )}
            </BlockStack>
          </Banner>
        )}

        {/* Success Banner */}
        {isCompleted && (
          <Banner title="Sync Complete" tone="success">
            <Text as="p">
              Successfully synced {progress.createdCount?.toLocaleString() || 0} new {progressLabel}
              {progress.updatedCount ? ` and updated ${progress.updatedCount.toLocaleString()} existing ${progressLabel}` : ''}.
            </Text>
          </Banner>
        )}

        {/* Action Buttons */}
        {(isSyncing || isFailed || isCancelled) && (
          <InlineStack gap="200">
            {isSyncing && onCancel && (
              <Button onClick={onCancel} tone="critical" disabled={isLoading}>
                Cancel Sync
              </Button>
            )}
            {(isFailed || isCancelled) && onResume && (
              <Button onClick={onResume} variant="primary" loading={isLoading}>
                Resume Sync
              </Button>
            )}
          </InlineStack>
        )}
      </BlockStack>
    </Box>
  );
}

export default SyncActionCard;
