import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Card,
  Button,
  Text,
  Box,
  InlineStack,
  BlockStack,
  Banner,
  ProgressBar,
  Badge,
  List,
  Spinner,
  Toast,
  Frame,
} from "@shopify/polaris";
import { useToast } from "~/hooks/useToast";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { useState, useCallback, useEffect, useRef } from "react";

interface SyncProgress {
  processedCount: number;
  totalCustomers: number | null;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  percentComplete: number;
}

interface SyncJobResult {
  success: boolean;
  jobId: string | null;
  status: string;
  progress: SyncProgress;
  hasMore: boolean;
  error?: string;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  // Get current customer statistics
  const customerStats = await db.customer.aggregate({
    where: { shop: session.shop },
    _count: { id: true },
  });

  // Count customers with placeholder emails
  const placeholderCount = await db.customer.count({
    where: {
      shop: session.shop,
      email: {
        contains: 'placeholder'
      }
    }
  });

  // Count customers with 'customer' prefix (another placeholder pattern)
  const customerPrefixCount = await db.customer.count({
    where: {
      shop: session.shop,
      email: {
        startsWith: 'customer'
      }
    }
  });

  // Get tier count
  const tierCount = await db.tier.count({
    where: { shop: session.shop }
  });

  // Get most recent sync job
  const lastSyncJob = await db.customerSyncJob.findFirst({
    where: { shop: session.shop },
    orderBy: { createdAt: 'desc' }
  });

  // Check shop settings for legacy sync status
  const shopSettings = await db.shopSettings.findUnique({
    where: { shop: session.shop }
  });

  return json({
    shop: session.shop,
    stats: {
      totalCustomers: customerStats._count.id || 0,
      placeholderCustomers: placeholderCount + customerPrefixCount,
      tierCount: tierCount,
    },
    lastSyncJob: lastSyncJob ? {
      id: lastSyncJob.id,
      status: lastSyncJob.status,
      processedCount: lastSyncJob.processedCount,
      totalCustomers: lastSyncJob.totalCustomers,
      createdCount: lastSyncJob.createdCount,
      updatedCount: lastSyncJob.updatedCount,
      skippedCount: lastSyncJob.skippedCount,
      errorCount: lastSyncJob.errorCount,
      lastError: lastSyncJob.lastError,
      startedAt: lastSyncJob.startedAt?.toISOString(),
      completedAt: lastSyncJob.completedAt?.toISOString(),
    } : null,
    legacySyncInProgress: shopSettings?.customersSyncInProgress || false,
  });
}

export default function CustomersSyncPage() {
  const data = useLoaderData<typeof loader>();

  // Toast notifications
  const { toast, showInfo, showSuccess, showError, hideToast } = useToast();

  // Sync state
  const [syncJob, setSyncJob] = useState<SyncJobResult | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const processingRef = useRef(false);

  // Check if there's an existing in-progress job on mount
  useEffect(() => {
    if (data.lastSyncJob?.status === 'IN_PROGRESS') {
      setSyncJob({
        success: true,
        jobId: data.lastSyncJob.id,
        status: 'IN_PROGRESS',
        progress: {
          processedCount: data.lastSyncJob.processedCount,
          totalCustomers: data.lastSyncJob.totalCustomers,
          createdCount: data.lastSyncJob.createdCount,
          updatedCount: data.lastSyncJob.updatedCount,
          skippedCount: data.lastSyncJob.skippedCount,
          errorCount: data.lastSyncJob.errorCount,
          percentComplete: data.lastSyncJob.totalCustomers
            ? Math.round((data.lastSyncJob.processedCount / data.lastSyncJob.totalCustomers) * 100)
            : 0
        },
        hasMore: true
      });
      // Start processing
      setIsPolling(true);
    }
  }, [data.lastSyncJob]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
      }
    };
  }, []);

  // Show toast notification on sync completion or failure
  useEffect(() => {
    if (syncJob?.status === 'COMPLETED') {
      const { createdCount, updatedCount, processedCount } = syncJob.progress;
      showSuccess(`Sync complete: ${processedCount} customers processed, ${createdCount} created, ${updatedCount} updated`);
    } else if (syncJob?.status === 'FAILED' && syncJob.error) {
      showError(`Sync failed: ${syncJob.error}`);
    } else if (syncJob?.status === 'CANCELLED') {
      showInfo("Sync cancelled. Progress has been saved.");
    }
  }, [syncJob?.status, syncJob?.progress, syncJob?.error, showSuccess, showError, showInfo]);

  // Process batches when polling is active
  useEffect(() => {
    if (!isPolling || !syncJob?.jobId || processingRef.current) return;

    const processNextBatch = async () => {
      if (processingRef.current) return;
      processingRef.current = true;

      try {
        const response = await fetch('/api/customer-sync/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: syncJob.jobId })
        });

        const result: SyncJobResult = await response.json();
        setSyncJob(result);

        if (result.hasMore && result.status === 'IN_PROGRESS') {
          // Schedule next batch after a short delay
          pollingRef.current = setTimeout(() => {
            processingRef.current = false;
            // This will trigger the useEffect again
            setSyncJob(prev => prev ? { ...prev } : null);
          }, 500);
        } else {
          // Sync completed or failed
          setIsPolling(false);
          if (result.status === 'COMPLETED') {
            setShowSuccessBanner(true);
          }
        }
      } catch (error) {
        console.error('Error processing batch:', error);
        setIsPolling(false);
        setSyncJob(prev => prev ? {
          ...prev,
          success: false,
          status: 'FAILED',
          error: 'Network error during sync'
        } : null);
      } finally {
        processingRef.current = false;
      }
    };

    processNextBatch();
  }, [isPolling, syncJob?.jobId, syncJob?.progress.processedCount]);

  const handleStartSync = useCallback(async () => {
    const confirmMessage = data.stats.totalCustomers > 0
      ? `This will sync all customers from Shopify and update any customers with placeholder data. Continue?`
      : "This will import all customers from Shopify. Continue?";

    if (!window.confirm(confirmMessage)) return;

    setIsStarting(true);
    setShowSuccessBanner(false);

    // Show immediate feedback
    showInfo("Customer sync started. Progress will update automatically.");

    try {
      const response = await fetch('/api/customer-sync/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggeredBy: 'manual' })
      });

      const result: SyncJobResult = await response.json();
      setSyncJob(result);

      if (result.success && result.hasMore) {
        setIsPolling(true);
      } else if (!result.success) {
        showError(result.error || "Failed to start sync");
      }
    } catch (error) {
      console.error('Error starting sync:', error);
      showError("Failed to start sync. Please try again.");
      setSyncJob({
        success: false,
        jobId: null,
        status: 'FAILED',
        progress: {
          processedCount: 0,
          totalCustomers: null,
          createdCount: 0,
          updatedCount: 0,
          skippedCount: 0,
          errorCount: 0,
          percentComplete: 0
        },
        hasMore: false,
        error: 'Failed to start sync'
      });
    } finally {
      setIsStarting(false);
    }
  }, [data.stats.totalCustomers, showInfo, showError]);

  const handleResumeSync = useCallback(async () => {
    if (!syncJob?.jobId) return;

    setIsPolling(true);
    processingRef.current = false;

    try {
      const response = await fetch('/api/customer-sync/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: syncJob.jobId, resume: true })
      });

      const result: SyncJobResult = await response.json();
      setSyncJob(result);

      if (!result.hasMore || result.status !== 'IN_PROGRESS') {
        setIsPolling(false);
        if (result.status === 'COMPLETED') {
          setShowSuccessBanner(true);
        }
      }
    } catch (error) {
      console.error('Error resuming sync:', error);
      setIsPolling(false);
    }
  }, [syncJob?.jobId]);

  const handleCancelSync = useCallback(async () => {
    if (!syncJob?.jobId) return;

    try {
      await fetch('/api/customer-sync/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', jobId: syncJob.jobId })
      });

      setIsPolling(false);
      setSyncJob(prev => prev ? { ...prev, status: 'CANCELLED', hasMore: false } : null);
    } catch (error) {
      console.error('Error cancelling sync:', error);
    }
  }, [syncJob?.jobId]);

  const isSyncing = isPolling || isStarting;
  const canStartSync = !isSyncing && data.stats.tierCount > 0 && !data.legacySyncInProgress;
  const canResume = syncJob?.status === 'FAILED' || syncJob?.status === 'CANCELLED';

  // Calculate display progress
  const progress = syncJob?.progress || {
    processedCount: 0,
    totalCustomers: null,
    createdCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    percentComplete: 0
  };

  return (
    <Frame>
      <Page
        title="Customer Sync"
        subtitle="Import and update customer data from Shopify"
        backAction={{ url: "/app/members" }}
        primaryAction={canResume ? {
          content: "Resume Sync",
          onAction: handleResumeSync,
          loading: isStarting
        } : {
          content: "Sync All Customers",
          onAction: handleStartSync,
          disabled: !canStartSync,
          loading: isStarting
        }}
        secondaryActions={isSyncing ? [{
          content: "Cancel",
          onAction: handleCancelSync,
          destructive: true
        }] : undefined}
      >
      <BlockStack gap="400">
        {/* Tier Warning */}
        {data.stats.tierCount === 0 && (
          <Banner title="No Tiers Found" tone="critical">
            <Text as="p">
              You must create at least one tier before syncing customers. Customers are automatically
              assigned tiers based on their total spending.
            </Text>
          </Banner>
        )}

        {/* Legacy sync in progress warning */}
        {data.legacySyncInProgress && (
          <Banner title="Legacy Sync In Progress" tone="warning">
            <Text as="p">
              A sync is already in progress using the old system. Please wait for it to complete.
            </Text>
          </Banner>
        )}

        {/* Success Banner */}
        {showSuccessBanner && syncJob?.status === 'COMPLETED' && (
          <Banner
            title="Sync Completed Successfully"
            tone="success"
            onDismiss={() => setShowSuccessBanner(false)}
          >
            <BlockStack gap="200">
              <Text as="p">All customers have been synced from Shopify.</Text>
              <List type="bullet">
                <List.Item>Customers Processed: {progress.processedCount.toLocaleString()}</List.Item>
                <List.Item>New Customers Created: {progress.createdCount.toLocaleString()}</List.Item>
                <List.Item>Existing Customers Updated: {progress.updatedCount.toLocaleString()}</List.Item>
                <List.Item>Skipped (no email): {progress.skippedCount.toLocaleString()}</List.Item>
                {progress.errorCount > 0 && (
                  <List.Item>Errors: {progress.errorCount.toLocaleString()}</List.Item>
                )}
              </List>
            </BlockStack>
          </Banner>
        )}

        {/* Error Banner */}
        {syncJob?.status === 'FAILED' && syncJob.error && (
          <Banner title="Sync Failed" tone="critical">
            <BlockStack gap="200">
              <Text as="p">{syncJob.error}</Text>
              {progress.processedCount > 0 && (
                <Text as="p" tone="subdued">
                  Progress was saved. Click "Resume Sync" to continue from where it stopped.
                </Text>
              )}
            </BlockStack>
          </Banner>
        )}

        {/* Sync Progress Card */}
        {(isSyncing || syncJob?.status === 'IN_PROGRESS') && (
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Sync Progress</Text>
                  <InlineStack gap="200" blockAlign="center">
                    <Spinner size="small" />
                    <Badge tone="info">Syncing</Badge>
                  </InlineStack>
                </InlineStack>

                <ProgressBar
                  progress={progress.percentComplete}
                  tone="primary"
                  size="medium"
                />

                <InlineStack gap="400" wrap>
                  <Text as="span" variant="bodyMd">
                    {progress.processedCount.toLocaleString()}
                    {progress.totalCustomers ? ` / ${progress.totalCustomers.toLocaleString()}` : ''} customers
                  </Text>
                  <Text as="span" variant="bodyMd" tone="success">
                    {progress.createdCount.toLocaleString()} created
                  </Text>
                  <Text as="span" variant="bodyMd" tone="info">
                    {progress.updatedCount.toLocaleString()} updated
                  </Text>
                  {progress.skippedCount > 0 && (
                    <Text as="span" variant="bodyMd" tone="subdued">
                      {progress.skippedCount.toLocaleString()} skipped
                    </Text>
                  )}
                  {progress.errorCount > 0 && (
                    <Text as="span" variant="bodyMd" tone="critical">
                      {progress.errorCount.toLocaleString()} errors
                    </Text>
                  )}
                </InlineStack>

                <Text as="p" variant="bodySm" tone="subdued">
                  Processing customers in batches of 100. Progress is saved automatically -
                  you can close this page and return later.
                </Text>
              </BlockStack>
            </Box>
          </Card>
        )}

        {/* Current Statistics */}
        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Current Statistics</Text>

              <InlineStack gap="800" wrap>
                <BlockStack gap="200">
                  <Text as="span" tone="subdued">Customers in Database</Text>
                  <Text as="p" variant="headingLg">{data.stats.totalCustomers.toLocaleString()}</Text>
                </BlockStack>

                <BlockStack gap="200">
                  <Text as="span" tone="subdued">Placeholder Data</Text>
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="p" variant="headingLg">{data.stats.placeholderCustomers.toLocaleString()}</Text>
                    {data.stats.placeholderCustomers > 0 && (
                      <Badge tone="warning">Needs Sync</Badge>
                    )}
                  </InlineStack>
                </BlockStack>

                <BlockStack gap="200">
                  <Text as="span" tone="subdued">Tiers Configured</Text>
                  <Text as="p" variant="headingLg">{data.stats.tierCount}</Text>
                </BlockStack>

                {data.lastSyncJob?.completedAt && (
                  <BlockStack gap="200">
                    <Text as="span" tone="subdued">Last Completed Sync</Text>
                    <Text as="p" variant="bodyMd">
                      {new Date(data.lastSyncJob.completedAt).toLocaleString()}
                    </Text>
                  </BlockStack>
                )}
              </InlineStack>
            </BlockStack>
          </Box>
        </Card>

        {/* Last Sync Summary */}
        {data.lastSyncJob?.status === 'COMPLETED' && !showSuccessBanner && (
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Last Sync Results</Text>
                <InlineStack gap="600" wrap>
                  <BlockStack gap="100">
                    <Text as="span" tone="subdued">Total Processed</Text>
                    <Text as="p" variant="headingMd">{data.lastSyncJob.processedCount.toLocaleString()}</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="span" tone="subdued">Created</Text>
                    <Text as="p" variant="headingMd" tone="success">{data.lastSyncJob.createdCount.toLocaleString()}</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="span" tone="subdued">Updated</Text>
                    <Text as="p" variant="headingMd">{data.lastSyncJob.updatedCount.toLocaleString()}</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="span" tone="subdued">Skipped</Text>
                    <Text as="p" variant="headingMd" tone="subdued">{data.lastSyncJob.skippedCount.toLocaleString()}</Text>
                  </BlockStack>
                  {data.lastSyncJob.errorCount > 0 && (
                    <BlockStack gap="100">
                      <Text as="span" tone="subdued">Errors</Text>
                      <Text as="p" variant="headingMd" tone="critical">{data.lastSyncJob.errorCount.toLocaleString()}</Text>
                    </BlockStack>
                  )}
                </InlineStack>
              </BlockStack>
            </Box>
          </Card>
        )}

        {/* What Gets Synced */}
        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">What Gets Synced</Text>

              <List type="bullet">
                <List.Item>
                  <strong>Customer Data:</strong> Email, first name, last name, total spent, order count
                </List.Item>
                <List.Item>
                  <strong>Tier Assignment:</strong> Automatically assigns appropriate tier based on total spending
                </List.Item>
                <List.Item>
                  <strong>Existing Customers:</strong> Updates placeholder emails with real Shopify data
                </List.Item>
                <List.Item>
                  <strong>Store Credit:</strong> Preserves existing store credit and cashback amounts
                </List.Item>
                <List.Item>
                  <strong>Guest Checkouts:</strong> Skips customers without email addresses
                </List.Item>
              </List>

              <Banner title="Improvements in This Version" tone="info">
                <List type="bullet">
                  <List.Item>Fetches ALL customers from Shopify (not just recent ones)</List.Item>
                  <List.Item>Real-time progress tracking with accurate counts</List.Item>
                  <List.Item>Resume capability - if interrupted, continue from where you left off</List.Item>
                  <List.Item>Progress is saved automatically - you can close this page safely</List.Item>
                </List>
              </Banner>
            </BlockStack>
          </Box>
        </Card>

        {/* Troubleshooting */}
        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Troubleshooting</Text>

              <BlockStack gap="300">
                <Box>
                  <Text as="p" fontWeight="semibold">Missing customers after sync?</Text>
                  <Text as="p" tone="subdued">
                    This sync fetches ALL customers from Shopify using cursor-based pagination.
                    If customers are still missing, they may not have email addresses (guest checkouts).
                  </Text>
                </Box>

                <Box>
                  <Text as="p" fontWeight="semibold">Sync interrupted or failed?</Text>
                  <Text as="p" tone="subdued">
                    Progress is automatically saved. Click "Resume Sync" to continue from where it stopped.
                    You don't need to start over from the beginning.
                  </Text>
                </Box>

                <Box>
                  <Text as="p" fontWeight="semibold">Widget showing wrong tier/credit?</Text>
                  <Text as="p" tone="subdued">
                    Run this sync to update customers with real Shopify data. The widget will then
                    display correct information from the database.
                  </Text>
                </Box>
              </BlockStack>
            </BlockStack>
          </Box>
        </Card>
      </BlockStack>
    </Page>

    {/* Toast notification */}
    {toast.active && (
      <Toast
        content={toast.content}
        error={toast.error}
        duration={toast.duration}
        onDismiss={hideToast}
      />
    )}
    </Frame>
  );
}
