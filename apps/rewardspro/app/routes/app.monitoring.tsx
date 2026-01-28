import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Card,
  DataTable,
  Badge,
  Box,
  Text,
  InlineStack,
  BlockStack,
  Button,
  Divider,
} from "@shopify/polaris";
import { RefreshIcon, StatusActiveIcon, AlertTriangleIcon } from "@shopify/polaris-icons";
import { useEffect, useState } from "react";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";
import { MetricsService } from "~/services/monitoring/metrics.service";
import { Logger } from "~/services/logger.service";
import { formatCurrency } from "~/utils/currency";

interface HealthStatus {
  status: string;
  timestamp: string;
  responseTime: number;
  environment: {
    VERCEL_ENV: string;
    NODE_ENV: string;
    APP_VERSION: string;
  };
  memory: {
    heapUsed: string;
    heapTotal: string;
    heapUsagePercent: string;
  };
  dataAPI: {
    connected: boolean;
    responseTime: number;
  };
  monitoring: {
    datadog: string;
    sentry: string;
    logging: string;
  };
}

/**
 * Internal monitoring dashboard for system health and metrics
 * Only accessible to shop owners
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  try {
    // Get current system health and shop settings
    const [healthResponse, shopSettings] = await Promise.all([
      fetch(new URL('/api/health?detailed=true', request.url).href),
      db.shopSettings.findUnique({
        where: { shop: session.shop },
        select: { storeCurrency: true, currencyDisplayType: true }
      })
    ]);
    const health: HealthStatus = await healthResponse.json();

    // Get recent error count
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentErrors = await db.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count
      FROM "StoreCreditLedger"
      WHERE shop = ${session.shop}
        AND "createdAt" > ${oneDayAgo}
        AND "type" = 'ERROR_CORRECTION'
    `;

    // Get business metrics for this shop
    const metrics = await MetricsService.reportDailyMetrics(session.shop);

    // Get recent webhook activity
    const webhookActivity = await db.$queryRaw<Array<{
      topic: string;
      success_count: bigint;
      failure_count: bigint;
    }>>`
      SELECT
        topic,
        SUM(CASE WHEN success THEN 1 ELSE 0 END) as success_count,
        SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as failure_count
      FROM (
        SELECT
          'orders.paid' as topic,
          true as success
        FROM "StoreCreditLedger"
        WHERE shop = ${session.shop}
          AND "createdAt" > ${oneDayAgo}
          AND "type" = 'CASHBACK_EARNED'
        LIMIT 100
      ) as webhook_logs
      GROUP BY topic
    `;

    return json({
      shop: session.shop,
      health,
      metrics: metrics.metrics,
      recentErrors: Number(recentErrors[0]?.count || 0),
      webhookActivity,
      shopSettings: shopSettings || { storeCurrency: 'USD', currencyDisplayType: 'SYMBOL' },
    });
  } catch (error) {
    Logger.error('Failed to load monitoring dashboard', error as Error, {
      shop: session.shop,
    });

    // Return partial data on error
    return json({
      shop: session.shop,
      health: null,
      metrics: null,
      recentErrors: 0,
      webhookActivity: [],
      error: 'Failed to load some metrics',
      shopSettings: { storeCurrency: 'USD', currencyDisplayType: 'SYMBOL' },
    });
  }
}

export default function MonitoringDashboard() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Auto-refresh every 30 seconds if enabled
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetcher.load('/app/monitoring');
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh, fetcher]);

  const getHealthBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <Badge tone="success" icon={StatusActiveIcon}>Healthy</Badge>;
      case 'degraded':
        return <Badge tone="warning" icon={AlertTriangleIcon}>Degraded</Badge>;
      case 'unhealthy':
        return <Badge tone="critical" icon={AlertTriangleIcon}>Unhealthy</Badge>;
      default:
        return <Badge tone="info">Unknown</Badge>;
    }
  };

  const getServiceBadge = (status: string) => {
    switch (status) {
      case 'operational':
      case 'configured':
        return <Badge tone="success">Operational</Badge>;
      case 'error':
        return <Badge tone="critical">Error</Badge>;
      case 'not configured':
        return <Badge tone="info">Not Configured</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <Page
      title="System Monitoring"
      subtitle="Real-time health and performance metrics"
      backAction={{ url: "/app", content: "Dashboard" }}
      primaryAction={{
        content: 'Refresh',
        icon: RefreshIcon,
        onAction: () => fetcher.load('/app/monitoring'),
        loading: fetcher.state === 'loading',
      }}
      secondaryActions={[
        {
          content: autoRefresh ? 'Disable Auto-Refresh' : 'Enable Auto-Refresh',
          onAction: () => setAutoRefresh(!autoRefresh),
        },
      ]}
    >
      <BlockStack gap="400">
        {/* System Health Card */}
        {data.health && (
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">System Health</Text>
                  {getHealthBadge(data.health.status)}
                </InlineStack>

                <Divider />

                <InlineStack gap="800" wrap>
                  <BlockStack gap="200">
                    <Text as="p" tone="subdued">Environment</Text>
                    <Text as="p" variant="bodyMd">
                      {data.health.environment.VERCEL_ENV} / {data.health.environment.NODE_ENV}
                    </Text>
                  </BlockStack>

                  <BlockStack gap="200">
                    <Text as="p" tone="subdued">Version</Text>
                    <Text as="p" variant="bodyMd">{data.health.environment.APP_VERSION}</Text>
                  </BlockStack>

                  <BlockStack gap="200">
                    <Text as="p" tone="subdued">Response Time</Text>
                    <Text as="p" variant="bodyMd">{data.health.responseTime}ms</Text>
                  </BlockStack>
                </InlineStack>

                <Divider />

                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">Services</Text>
                  <InlineStack gap="400" wrap>
                    <InlineStack gap="200">
                      <Text as="span">Database:</Text>
                      <Badge tone={data.health.dataAPI.connected ? "success" : "critical"}>
                        {data.health.dataAPI.connected ? 'Connected' : 'Disconnected'}
                      </Badge>
                    </InlineStack>

                    <InlineStack gap="200">
                      <Text as="span">Datadog:</Text>
                      {getServiceBadge(data.health.monitoring.datadog)}
                    </InlineStack>

                    <InlineStack gap="200">
                      <Text as="span">Sentry:</Text>
                      {getServiceBadge(data.health.monitoring.sentry)}
                    </InlineStack>

                    <InlineStack gap="200">
                      <Text as="span">Logging:</Text>
                      {getServiceBadge(data.health.monitoring.logging)}
                    </InlineStack>
                  </InlineStack>
                </BlockStack>

                <Divider />

                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">Memory Usage</Text>
                  <InlineStack gap="400" wrap>
                    <Text as="p">Heap: {data.health.memory.heapUsed} / {data.health.memory.heapTotal}</Text>
                    <Badge tone={parseFloat(data.health.memory.heapUsagePercent) > 80 ? "warning" : "success"}>
                      {data.health.memory.heapUsagePercent} Used
                    </Badge>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Box>
          </Card>
        )}

        {/* Business Metrics Card */}
        {data.metrics && (
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Business Metrics</Text>

                <Divider />

                <InlineStack gap="800" wrap>
                  <BlockStack gap="200">
                    <Text as="p" tone="subdued">Total Customers</Text>
                    <Text as="p" variant="bodyLg">{data.metrics.customerMetrics.total}</Text>
                  </BlockStack>

                  <BlockStack gap="200">
                    <Text as="p" tone="subdued">Active (30d)</Text>
                    <Text as="p" variant="bodyLg">{data.metrics.customerMetrics.active30Days}</Text>
                  </BlockStack>

                  <BlockStack gap="200">
                    <Text as="p" tone="subdued">New Today</Text>
                    <Text as="p" variant="bodyLg">{data.metrics.customerMetrics.newToday}</Text>
                  </BlockStack>

                  <BlockStack gap="200">
                    <Text as="p" tone="subdued">MRR</Text>
                    <Text as="p" variant="bodyLg">${data.metrics.subscriptionMetrics.mrr}</Text>
                  </BlockStack>
                </InlineStack>

                <Divider />

                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">Store Credit</Text>
                  <InlineStack gap="400" wrap>
                    <Text as="p">
                      Total Distributed: {formatCurrency(data.metrics.cashbackMetrics.totalDistributed, data.shopSettings as any)}
                    </Text>
                    <Text as="p">
                      Today: {formatCurrency(data.metrics.cashbackMetrics.distributedToday, data.shopSettings as any)}
                    </Text>
                    <Text as="p">
                      Average: {formatCurrency(data.metrics.cashbackMetrics.averageAmount, data.shopSettings as any)}
                    </Text>
                  </InlineStack>
                </BlockStack>

                {data.metrics.ledgerConsistency.discrepancyCount > 0 && (
                  <>
                    <Divider />
                    <InlineStack gap="200">
                      <Badge tone="warning">
                        {data.metrics.ledgerConsistency.discrepancyCount} Ledger Discrepancies
                      </Badge>
                      <Text as="p" tone="subdued">
                        ({data.metrics.ledgerConsistency.discrepancyRate.toFixed(2)}% of checked)
                      </Text>
                    </InlineStack>
                  </>
                )}
              </BlockStack>
            </Box>
          </Card>
        )}

        {/* Recent Activity Card */}
        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">Recent Activity</Text>
                {data.recentErrors > 0 && (
                  <Badge tone="critical">{data.recentErrors} Errors (24h)</Badge>
                )}
              </InlineStack>

              {data.webhookActivity.length > 0 && (
                <>
                  <Divider />
                  <DataTable
                    columnContentTypes={['text', 'numeric', 'numeric']}
                    headings={['Webhook Topic', 'Success', 'Failed']}
                    rows={data.webhookActivity.map(activity => [
                      activity.topic,
                      Number(activity.success_count),
                      Number(activity.failure_count),
                    ])}
                  />
                </>
              )}
            </BlockStack>
          </Box>
        </Card>

        {/* Error Message */}
        {data.error && (
          <Card>
            <Box padding="400">
              <InlineStack gap="200">
                <Badge tone="warning">Warning</Badge>
                <Text as="p">{data.error}</Text>
              </InlineStack>
            </Box>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}

export function ErrorBoundary() {
  return (
    <Page title="Monitoring Dashboard" backAction={{ url: "/app", content: "Dashboard" }}>
      <Card>
        <Box padding="400">
          <BlockStack gap="300">
            <Badge tone="critical">Error</Badge>
            <Text as="p">Failed to load monitoring dashboard. Please try refreshing the page.</Text>
          </BlockStack>
        </Box>
      </Card>
    </Page>
  );
}