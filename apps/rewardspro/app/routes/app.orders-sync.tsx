import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useRevalidator } from "@remix-run/react";
import {
  Page,
  Card,
  Button,
  Text,
  Box,
  InlineStack,
  BlockStack,
  Banner,
  Badge,
  InlineCode,
  List,
  Modal,
  Frame,
} from "@shopify/polaris";
import { SyncProgressCard, type SyncStatus } from "~/components/SyncActionCard";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { useState, useCallback, useEffect, useRef } from "react";

interface SyncJobProgress {
  processedCount: number;
  totalOrders: number | null;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  percentComplete: number;
}

interface SyncJobStatus {
  success: boolean;
  jobId: string | null;
  status: string;
  progress: SyncJobProgress;
  hasMore: boolean;
  error?: string;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  // Get sync statistics
  const orderStats = await db.order.aggregate({
    where: { shop: session.shop },
    _count: { id: true },
    _max: { shopifyCreatedAt: true },
    _min: { shopifyCreatedAt: true }
  });

  const customerStats = await db.customer.aggregate({
    where: { shop: session.shop },
    _count: { id: true }
  });

  // Get current sync job status
  const currentJob = await db.orderSyncJob.findFirst({
    where: { shop: session.shop },
    orderBy: { createdAt: 'desc' }
  });

  return json({
    shop: session.shop,
    stats: {
      orderCount: orderStats._count.id || 0,
      customerCount: customerStats._count.id || 0,
      oldestOrder: orderStats._min.shopifyCreatedAt,
      newestOrder: orderStats._max.shopifyCreatedAt
    },
    currentJob: currentJob ? {
      jobId: currentJob.id,
      status: currentJob.status,
      progress: {
        processedCount: currentJob.processedCount,
        totalOrders: currentJob.totalOrders,
        createdCount: currentJob.createdCount,
        updatedCount: currentJob.updatedCount,
        skippedCount: currentJob.skippedCount,
        errorCount: currentJob.errorCount,
        percentComplete: currentJob.totalOrders
          ? Math.round((currentJob.processedCount / currentJob.totalOrders) * 100)
          : 0
      },
      hasMore: currentJob.status === 'IN_PROGRESS',
      error: currentJob.lastError
    } : null
  });
}

export default function OrdersSyncPage() {
  const data = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncJobStatus | null>(data.currentJob);
  const [isProcessing, setIsProcessing] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const isSyncing = syncStatus?.status === 'IN_PROGRESS';
  const isFailed = syncStatus?.status === 'FAILED';
  const isCompleted = syncStatus?.status === 'COMPLETED';

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
      }
    };
  }, []);

  // Start polling if there's an in-progress job
  useEffect(() => {
    if (data.currentJob?.status === 'IN_PROGRESS') {
      setSyncStatus(data.currentJob);
      processNextBatch(data.currentJob.jobId!);
    }
  }, []);

  const processNextBatch = useCallback(async (jobId: string) => {
    if (!jobId) return;

    setIsProcessing(true);

    try {
      const response = await fetch('/api/order-sync/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId })
      });

      const result: SyncJobStatus = await response.json();
      setSyncStatus(result);

      if (result.hasMore && result.status === 'IN_PROGRESS') {
        // Continue processing with a small delay
        pollingRef.current = setTimeout(() => {
          processNextBatch(jobId);
        }, 500);
      } else {
        // Sync completed or failed
        setIsProcessing(false);
        revalidator.revalidate();
      }
    } catch (error) {
      console.error('Failed to process batch:', error);
      setIsProcessing(false);
      // Fetch current status
      try {
        const statusResponse = await fetch(`/api/order-sync/status?jobId=${jobId}`);
        const status = await statusResponse.json();
        setSyncStatus(status);
      } catch {
        // Ignore status fetch errors
      }
    }
  }, [revalidator]);

  const handleStartSync = useCallback(async () => {
    setConfirmModalOpen(false);
    setIsProcessing(true);

    try {
      const response = await fetch('/api/order-sync/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggeredBy: 'manual' })
      });

      const result: SyncJobStatus = await response.json();
      setSyncStatus(result);

      if (result.success && result.jobId && result.hasMore) {
        // Start processing batches
        processNextBatch(result.jobId);
      } else {
        setIsProcessing(false);
        if (!result.success) {
          console.error('Failed to start sync:', result.error);
        }
      }
    } catch (error) {
      console.error('Failed to start sync:', error);
      setIsProcessing(false);
    }
  }, [processNextBatch]);

  const handleResume = useCallback(async () => {
    if (!syncStatus?.jobId) return;

    setIsProcessing(true);

    try {
      const response = await fetch('/api/order-sync/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: syncStatus.jobId, resume: true })
      });

      const result: SyncJobStatus = await response.json();
      setSyncStatus(result);

      if (result.hasMore && result.status === 'IN_PROGRESS') {
        processNextBatch(syncStatus.jobId);
      } else {
        setIsProcessing(false);
      }
    } catch (error) {
      console.error('Failed to resume sync:', error);
      setIsProcessing(false);
    }
  }, [syncStatus?.jobId, processNextBatch]);

  const handleCancel = useCallback(async () => {
    if (!syncStatus?.jobId) return;

    try {
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
      }

      await fetch('/api/order-sync/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', jobId: syncStatus.jobId })
      });

      // Fetch updated status
      const statusResponse = await fetch(`/api/order-sync/status?jobId=${syncStatus.jobId}`);
      const status = await statusResponse.json();
      setSyncStatus(status);
      setIsProcessing(false);
      revalidator.revalidate();
    } catch (error) {
      console.error('Failed to cancel sync:', error);
    }
  }, [syncStatus?.jobId, revalidator]);

  return (
    <Frame>
      <Page
        title="Order Sync"
        subtitle="Import historical orders from Shopify"
        backAction={{ url: "/app" }}
        primaryAction={{
          content: isSyncing ? "Syncing..." : "Sync Orders",
          onAction: () => setConfirmModalOpen(true),
          disabled: isSyncing || isProcessing,
          loading: isProcessing
      }}
    >
      <BlockStack gap="400">
        {/* Current Statistics */}
        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Current Statistics</Text>

              <InlineStack gap="800" wrap>
                <BlockStack gap="200">
                  <Text as="span" tone="subdued">Total Orders</Text>
                  <Text as="p" variant="headingLg">{data.stats.orderCount.toLocaleString()}</Text>
                </BlockStack>

                <BlockStack gap="200">
                  <Text as="span" tone="subdued">Total Customers</Text>
                  <Text as="p" variant="headingLg">{data.stats.customerCount.toLocaleString()}</Text>
                </BlockStack>

                {data.stats.oldestOrder && (
                  <BlockStack gap="200">
                    <Text as="span" tone="subdued">Date Range</Text>
                    <Text as="p" variant="bodyMd">
                      {new Date(data.stats.oldestOrder).toLocaleDateString()} - {new Date(data.stats.newestOrder).toLocaleDateString()}
                    </Text>
                  </BlockStack>
                )}
              </InlineStack>
            </BlockStack>
          </Box>
        </Card>

        {/* Sync Progress */}
        {syncStatus && syncStatus.status !== 'NO_JOB' && (
          <Card>
            <SyncProgressCard
              status={
                syncStatus.status === 'IN_PROGRESS' ? 'syncing' :
                syncStatus.status === 'COMPLETED' ? 'completed' :
                syncStatus.status === 'FAILED' ? 'failed' :
                syncStatus.status === 'CANCELLED' ? 'cancelled' : 'idle'
              }
              progress={{
                processedCount: syncStatus.progress.processedCount,
                totalCount: syncStatus.progress.totalOrders,
                percentComplete: syncStatus.progress.percentComplete,
                createdCount: syncStatus.progress.createdCount,
                updatedCount: syncStatus.progress.updatedCount,
                skippedCount: syncStatus.progress.skippedCount,
                errorCount: syncStatus.progress.errorCount,
              }}
              error={syncStatus.error}
              progressLabel="orders"
              onCancel={handleCancel}
              onResume={handleResume}
              isLoading={isProcessing}
            />
          </Card>
        )}

        {/* Instructions */}
        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">How Order Sync Works</Text>

              <List type="bullet">
                <List.Item>
                  Fetches all <InlineCode>paid</InlineCode>, <InlineCode>partially_refunded</InlineCode>, and <InlineCode>refunded</InlineCode> orders from the last year
                </List.Item>
                <List.Item>
                  Creates local Order records with all line items and refund data
                </List.Item>
                <List.Item>
                  Calculates cashback amounts based on customer tiers at time of order
                </List.Item>
                <List.Item>
                  Updates customer spending totals and order counts
                </List.Item>
                <List.Item>
                  Enables fast local tier calculations without API calls
                </List.Item>
              </List>

              <Banner title="Important Notes" tone="info">
                <List type="bullet">
                  <List.Item>Initial sync may take 5-30 minutes depending on order volume</List.Item>
                  <List.Item>Orders are synced in batches of 50 to respect API rate limits</List.Item>
                  <List.Item>Existing orders will be updated, not duplicated</List.Item>
                  <List.Item>After initial sync, new orders are tracked via webhooks</List.Item>
                  <List.Item>If sync fails, you can resume from where it left off</List.Item>
                </List>
              </Banner>
            </BlockStack>
          </Box>
        </Card>

        {/* Performance Benefits */}
        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Performance Benefits</Text>

              <InlineStack gap="400" wrap>
                <Badge tone="success">100x Faster Tier Calculations</Badge>
                <Badge tone="success">Instant Analytics</Badge>
                <Badge tone="success">No API Rate Limits</Badge>
                <Badge tone="success">Complete Order History</Badge>
              </InlineStack>

              <Text as="p" tone="subdued">
                With local order data, tier calculations and customer analytics run instantly without
                Shopify API calls, making your app significantly faster and more reliable.
              </Text>
            </BlockStack>
          </Box>
        </Card>
      </BlockStack>

      {/* Confirmation Modal */}
      <Modal
        open={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        title="Sync Orders"
        primaryAction={{
          content: "Start Sync",
          onAction: handleStartSync
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setConfirmModalOpen(false)
          }
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="p">
              This will sync all orders from the last year. The sync process will:
            </Text>
            <List type="bullet">
              <List.Item>Fetch paid, partially refunded, and refunded orders</List.Item>
              <List.Item>Create or update order records in the database</List.Item>
              <List.Item>Calculate cashback based on customer tiers</List.Item>
              <List.Item>Update customer spending totals</List.Item>
            </List>
            <Text as="p" tone="subdued">
              This may take several minutes depending on order volume. You can cancel or resume the sync at any time.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
      </Page>
    </Frame>
  );
}
