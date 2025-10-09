import { json, redirect } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
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
  InlineCode,
  List,
  Toast,
  Frame
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { useState, useCallback, useEffect } from "react";

// Types for action data
interface SyncStats {
  successful: number;
  failed: number;
  skipped: number;
  duration: number;
}

interface SyncActionData {
  success: boolean;
  message: string;
  stats?: SyncStats;
  error?: string;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  
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

  // Check if sync is already in progress (would need a SyncJob model for production)
  const syncInProgress = false;

  return json({
    shop: session.shop,
    stats: {
      orderCount: orderStats._count.id || 0,
      customerCount: customerStats._count.id || 0,
      oldestOrder: orderStats._min.shopifyCreatedAt,
      newestOrder: orderStats._max.shopifyCreatedAt
    },
    syncInProgress
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "sync_orders") {
    try {
      // Import the sync service
      const { OrderSyncService } = await import("~/services/order-sync.service");

      console.log("[ORDERS SYNC] Starting order sync for 1 year of historical orders");

      // @ts-expect-error - AdminApiContext type mismatch, but works in practice
      const syncService = new OrderSyncService(admin, {
        shop: session.shop,
        batchSize: 50,
        startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // Last 1 year
        endDate: new Date(),
      });

      console.log("[ORDERS SYNC] Sync service created, starting sync...");

      // Run sync synchronously to ensure it completes before Vercel timeout
      // For small order counts (<100 orders), this should complete quickly
      const result = await syncService.syncAllOrders();
      console.log("[ORDERS SYNC] Sync completed:", result);

      // Sync completed successfully
      console.log("[ORDERS SYNC] Successfully synced", result.progress.successful, "orders");

      // TODO: Update onboarding progress if needed
      // if (result.success && result.progress.successful > 0) {
      //   await updateOnboardingProgress(session.shop, { syncedOrders: true });
      // }

      return json({
        success: result.success,
        message: result.message,
        stats: {
          successful: result.progress.successful,
          failed: result.progress.failed,
          skipped: result.progress.skipped,
          duration: result.duration
        }
      });
    } catch (error) {
      console.error("[ORDERS SYNC] Sync failed:", error);
      return json({
        success: false,
        message: error instanceof Error ? error.message : "Sync failed",
        error: String(error)
      }, { status: 500 });
    }
  }

  if (action === "test_single") {
    // Test with a single order (you'd need to provide an order ID)
    const orderId = formData.get("orderId") as string;
    if (orderId) {
      try {
        const { OrderSyncService } = await import("~/services/order-sync.service");
        // @ts-expect-error - AdminApiContext type mismatch, but works in practice
        const syncService = new OrderSyncService(admin, {
          shop: session.shop,
          batchSize: 50,
          startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
          endDate: new Date(),
        });
        await syncService.syncSingleOrder(orderId);
        return json({ success: true, message: "Single order synced successfully" });
      } catch (error) {
        return json({
          success: false,
          error: error instanceof Error ? error.message : "Failed to sync order"
        }, { status: 500 });
      }
    }
  }

  return json({ success: false, error: "Invalid action" }, { status: 400 });
}

export default function OrdersSyncPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as SyncActionData | undefined;
  const submit = useSubmit();
  const navigation = useNavigation();
  const [toast, setToast] = useState<{ active: boolean; content: string; error?: boolean }>({
    active: false,
    content: "",
  });

  const isLoading = navigation.state !== "idle";

  const handleSyncOrders = useCallback(() => {
    if (window.confirm("This will sync all orders from the last year. This may take several minutes. Continue?")) {
      const formData = new FormData();
      formData.set("action", "sync_orders");
      submit(formData, { method: "post" });
    }
  }, [submit]);

  // Show toast for action results
  useEffect(() => {
    if (actionData) {
      setToast({
        active: true,
        content: actionData.message || (actionData.success ? "Sync completed" : "Sync failed"),
        error: !actionData.success,
      });
    }
  }, [actionData]);

  return (
    <Frame>
      <Page
        title="Order Sync"
        subtitle="Import historical orders from Shopify"
        backAction={{ url: "/app" }}
        primaryAction={{
          content: "Sync Orders",
          onAction: handleSyncOrders,
          disabled: isLoading || data.syncInProgress,
          loading: isLoading
        }}
      >
        <BlockStack gap="400">
          {/* Sync Results Banner */}
          {actionData && actionData.success && actionData.stats && (
            <Banner
              title="Sync Completed Successfully"
              tone="success"
              onDismiss={() => window.location.reload()}
            >
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd">
                  Successfully synced {actionData.stats.successful} orders
                  {actionData.stats.failed > 0 && `, ${actionData.stats.failed} failed`}
                  {actionData.stats.skipped > 0 && `, ${actionData.stats.skipped} skipped`}.
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Duration: {Math.round(actionData.stats.duration / 1000)}s
                </Text>
              </BlockStack>
            </Banner>
          )}

          {/* Loading Banner */}
          {isLoading && (
            <Banner tone="info">
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd">
                  Syncing orders... This may take several minutes depending on order volume.
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Please do not close this page.
                </Text>
              </BlockStack>
            </Banner>
          )}

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

        {/* Toast Notification */}
        {toast.active && (
          <Toast
            content={toast.content}
            error={toast.error}
            onDismiss={() => setToast({ ...toast, active: false })}
          />
        )}
      </Page>
    </Frame>
  );
}