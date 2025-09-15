/**
 * Subscription Management Page
 * Admin interface for managing tier subscriptions
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Badge,
  Button,
  Box,
  Text,
  BlockStack,
  InlineStack,
  Banner,
  EmptyState,
  Modal,
  FormLayout,
  Select,
  TextField,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";
import { useState, useCallback } from "react";
import { isSubscriptionEnabled, SUBSCRIPTION_CONFIG } from "~/services/subscription/config.server";
import { SubscriptionContractService } from "~/services/subscription/subscription-contract.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  // Check if subscriptions are enabled
  const subscriptionsEnabled = isSubscriptionEnabled();

  // Initialize default values
  let totalSubscriptions = 0;
  let activeSubscriptions = 0;
  let failedSubscriptions = 0;
  let revenue = { _sum: { amount: null } };
  let subscriptions: any[] = [];
  let sellingPlanGroup = null;

  try {
    // Get subscription stats - wrap in try/catch in case tables don't exist yet
    [totalSubscriptions, activeSubscriptions, failedSubscriptions, revenue] = await Promise.all([
      db.tierSubscription.count({ where: { shop: session.shop } }).catch(() => 0),
      db.tierSubscription.count({ where: { shop: session.shop, status: 'ACTIVE' } }).catch(() => 0),
      db.tierSubscription.count({ where: { shop: session.shop, status: 'FAILED' } }).catch(() => 0),
      db.subscriptionBillingAttempt.aggregate({
        where: { 
          subscription: { shop: session.shop },
          status: 'SUCCESS',
        },
        _sum: { amount: true },
      }).catch(() => ({ _sum: { amount: null } })),
    ]);

    // Get recent subscriptions
    subscriptions = await db.tierSubscription.findMany({
      where: { shop: session.shop },
      include: {
        customer: true,
        tier: true,
        billingAttempts: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }).catch(() => []);

    // Check if selling plans exist
    sellingPlanGroup = await db.sellingPlanGroup.findFirst({
      where: { shop: session.shop },
      include: { sellingPlans: true },
    }).catch(() => null);
  } catch (error) {
    console.error("[Subscriptions Loader] Error loading subscription data:", error);
    // Continue with defaults - the page will still render
  }

  return json({
    subscriptionsEnabled,
    stats: {
      total: totalSubscriptions,
      active: activeSubscriptions,
      failed: failedSubscriptions,
      revenue: revenue._sum.amount || 0,
    },
    subscriptions: subscriptions.map(sub => ({
      id: sub.id,
      customerEmail: sub.customer.email,
      customerName: sub.customer.firstName 
        ? `${sub.customer.firstName} ${sub.customer.lastName || ''}`.trim()
        : sub.customer.email,
      tierName: sub.tier.name,
      status: sub.status,
      billingInterval: sub.billingInterval,
      monthlyPrice: sub.monthlyPrice?.toNumber() || 0,
      nextBillingDate: sub.nextBillingDate?.toISOString(),
      failureCount: sub.failureCount,
      lastBillingStatus: sub.billingAttempts[0]?.status || 'PENDING',
    })),
    hasSellingPlans: !!sellingPlanGroup,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const action = formData.get("action");

  switch (action) {
    case "cancel": {
      const subscriptionId = formData.get("subscriptionId") as string;
      const reason = formData.get("reason") as string;
      
      await SubscriptionContractService.cancelSubscription({
        shop: session.shop,
        admin,
        subscriptionId,
        reason,
      });
      
      return json({ success: true, message: "Subscription cancelled" });
    }
    
    case "pause": {
      const subscriptionId = formData.get("subscriptionId") as string;
      
      await SubscriptionContractService.pauseSubscription({
        shop: session.shop,
        admin,
        subscriptionId,
      });
      
      return json({ success: true, message: "Subscription paused" });
    }
    
    case "resume": {
      const subscriptionId = formData.get("subscriptionId") as string;
      
      await SubscriptionContractService.resumeSubscription({
        shop: session.shop,
        admin,
        subscriptionId,
      });
      
      return json({ success: true, message: "Subscription resumed" });
    }
    
    default:
      return json({ success: false, message: "Invalid action" }, { status: 400 });
  }
};

export default function Subscriptions() {
  const { subscriptionsEnabled, stats, subscriptions, hasSellingPlans } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [cancelModalActive, setCancelModalActive] = useState(false);
  const [selectedSubscription, setSelectedSubscription] = useState<any>(null);
  const [cancellationReason, setCancellationReason] = useState("");

  const isLoading = navigation.state !== "idle";

  const handleCancelClick = useCallback((subscription: any) => {
    setSelectedSubscription(subscription);
    setCancelModalActive(true);
  }, []);

  const handleCancelConfirm = useCallback(() => {
    if (selectedSubscription) {
      const formData = new FormData();
      formData.append("action", "cancel");
      formData.append("subscriptionId", selectedSubscription.id);
      formData.append("reason", cancellationReason || "Customer requested cancellation");
      submit(formData, { method: "post" });
      setCancelModalActive(false);
      setSelectedSubscription(null);
      setCancellationReason("");
    }
  }, [selectedSubscription, cancellationReason, submit]);

  const handlePause = useCallback((subscriptionId: string) => {
    const formData = new FormData();
    formData.append("action", "pause");
    formData.append("subscriptionId", subscriptionId);
    submit(formData, { method: "post" });
  }, [submit]);

  const handleResume = useCallback((subscriptionId: string) => {
    const formData = new FormData();
    formData.append("action", "resume");
    formData.append("subscriptionId", subscriptionId);
    submit(formData, { method: "post" });
  }, [submit]);

  const getStatusBadge = (status: string) => {
    const toneMap: Record<string, any> = {
      ACTIVE: "success",
      PENDING: "info",
      PAUSED: "warning",
      CANCELLED: "critical",
      FAILED: "critical",
      EXPIRED: "critical",
    };
    
    return <Badge tone={toneMap[status] || "info"}>{status}</Badge>;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (!subscriptionsEnabled) {
    return (
      <Page title="Subscriptions">
        <Layout>
          <Layout.Section>
            <Banner
              title="Subscriptions Not Enabled"
              tone="warning"
            >
              <p>
                Subscription features are currently disabled. To enable subscriptions:
              </p>
              <ol>
                <li>Request subscription API scopes from Shopify</li>
                <li>Set ENABLE_SUBSCRIPTIONS=true in your environment variables</li>
                <li>Deploy the updated configuration</li>
              </ol>
              <p>
                See the <a href="/docs/SUBSCRIPTION_SCOPES_SETUP.md">setup guide</a> for detailed instructions.
              </p>
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const rows = subscriptions.map(sub => [
    sub.customerName,
    sub.tierName,
    getStatusBadge(sub.status),
    sub.billingInterval,
    formatCurrency(sub.monthlyPrice),
    formatDate(sub.nextBillingDate),
    sub.failureCount > 0 ? (
      <Badge tone="critical">{sub.failureCount} failures</Badge>
    ) : (
      <Badge tone="success">OK</Badge>
    ),
    <InlineStack gap="200">
      {sub.status === 'ACTIVE' && (
        <>
          <Button size="slim" onClick={() => handlePause(sub.id)} loading={isLoading}>
            Pause
          </Button>
          <Button size="slim" tone="critical" onClick={() => handleCancelClick(sub)} loading={isLoading}>
            Cancel
          </Button>
        </>
      )}
      {sub.status === 'PAUSED' && (
        <Button size="slim" onClick={() => handleResume(sub.id)} loading={isLoading}>
          Resume
        </Button>
      )}
    </InlineStack>,
  ]);

  return (
    <Page
      title="Subscriptions"
      subtitle="Manage tier membership subscriptions"
      primaryAction={
        hasSellingPlans ? undefined : {
          content: "Setup Selling Plans",
          url: "/app/subscriptions/setup",
        }
      }
    >
      <Layout>
        {/* Stats Cards */}
        <Layout.Section>
          <InlineStack gap="400" align="start" blockAlign="stretch">
            <Card>
              <Box padding="400">
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">Total Subscriptions</Text>
                  <Text as="p" variant="heading2xl">{stats.total}</Text>
                </BlockStack>
              </Box>
            </Card>
            <Card>
              <Box padding="400">
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">Active</Text>
                  <Text as="p" variant="heading2xl" tone="success">{stats.active}</Text>
                </BlockStack>
              </Box>
            </Card>
            <Card>
              <Box padding="400">
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">Failed</Text>
                  <Text as="p" variant="heading2xl" tone="critical">{stats.failed}</Text>
                </BlockStack>
              </Box>
            </Card>
            <Card>
              <Box padding="400">
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">Total Revenue</Text>
                  <Text as="p" variant="heading2xl">{formatCurrency(stats.revenue)}</Text>
                </BlockStack>
              </Box>
            </Card>
          </InlineStack>
        </Layout.Section>

        {/* Subscriptions Table */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg">Recent Subscriptions</Text>
                
                {subscriptions.length > 0 ? (
                  <DataTable
                    columnContentTypes={[
                      "text",
                      "text",
                      "text",
                      "text",
                      "numeric",
                      "text",
                      "text",
                      "text",
                    ]}
                    headings={[
                      "Customer",
                      "Tier",
                      "Status",
                      "Interval",
                      "Price",
                      "Next Billing",
                      "Health",
                      "Actions",
                    ]}
                    rows={rows}
                  />
                ) : (
                  <EmptyState
                    heading="No subscriptions yet"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>Subscriptions will appear here when customers subscribe to tier memberships.</p>
                  </EmptyState>
                )}
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>

      {/* Cancel Subscription Modal */}
      <Modal
        open={cancelModalActive}
        onClose={() => setCancelModalActive(false)}
        title="Cancel Subscription"
        primaryAction={{
          content: "Cancel Subscription",
          onAction: handleCancelConfirm,
          destructive: true,
          loading: isLoading,
        }}
        secondaryActions={[
          {
            content: "Keep Subscription",
            onAction: () => setCancelModalActive(false),
          },
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <Text as="p">
              Are you sure you want to cancel this subscription for{" "}
              <strong>{selectedSubscription?.customerName}</strong>?
            </Text>
            <TextField
              label="Cancellation Reason"
              value={cancellationReason}
              onChange={setCancellationReason}
              multiline={3}
              autoComplete="off"
              helpText="Optional: Provide a reason for cancellation"
            />
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
}