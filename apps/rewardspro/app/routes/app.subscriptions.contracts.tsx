/**
 * Active Subscription Contracts Page
 * Detailed view and management of subscription contracts
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useSearchParams } from "@remix-run/react";
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
  Filters,
  ChoiceList,
  RangeSlider,
  Modal,
  DescriptionList,
  Divider,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";
import { useState, useCallback, useMemo } from "react";
import { SubscriptionContractService } from "~/services/subscription/subscription-contract.server";

interface FilterState {
  status: string[];
  interval: string[];
  priceRange: [number, number];
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const searchParams = url.searchParams;
  
  // Parse filters
  const statusFilter = searchParams.getAll("status");
  const intervalFilter = searchParams.getAll("interval");
  const minPrice = searchParams.get("minPrice");
  const maxPrice = searchParams.get("maxPrice");

  // Build where clause
  const where: any = { shop: session.shop };
  
  if (statusFilter.length > 0) {
    where.status = { in: statusFilter };
  }
  
  if (intervalFilter.length > 0) {
    where.billingInterval = { in: intervalFilter };
  }
  
  if (minPrice || maxPrice) {
    where.monthlyPrice = {};
    if (minPrice) where.monthlyPrice.gte = parseFloat(minPrice);
    if (maxPrice) where.monthlyPrice.lte = parseFloat(maxPrice);
  }

  // Get subscriptions with detailed info
  const subscriptions = await db.tierSubscription.findMany({
    where,
    include: {
      customer: true,
      tier: true,
      billingAttempts: {
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Get aggregate stats
  const stats = await db.tierSubscription.groupBy({
    by: ['status'],
    where: { shop: session.shop },
    _count: true,
  });

  return json({
    subscriptions: subscriptions.map(sub => ({
      id: sub.id,
      subscriptionContractId: sub.subscriptionContractId,
      customerId: sub.customerId,
      customerEmail: sub.customer.email,
      customerName: sub.customer.firstName 
        ? `${sub.customer.firstName} ${sub.customer.lastName || ''}`.trim()
        : sub.customer.email,
      tierName: sub.tier.name,
      status: sub.status,
      billingInterval: sub.billingInterval,
      monthlyPrice: sub.monthlyPrice?.toNumber() || 0,
      currentPrice: sub.currentPrice?.toNumber() || 0,
      nextBillingDate: sub.nextBillingDate?.toISOString(),
      lastBillingDate: sub.lastBillingDate?.toISOString(),
      startDate: sub.startDate.toISOString(),
      endDate: sub.endDate?.toISOString(),
      failureCount: sub.failureCount,
      totalBilled: sub.totalBilled?.toNumber() || 0,
      pausedAt: sub.pausedAt?.toISOString(),
      pausedReason: sub.pausedReason,
      cancelledAt: sub.cancelledAt?.toISOString(),
      cancellationReason: sub.cancellationReason,
      billingHistory: sub.billingAttempts.map(attempt => ({
        id: attempt.id,
        status: attempt.status,
        amount: attempt.amount?.toNumber() || 0,
        createdAt: attempt.createdAt.toISOString(),
        errorMessage: attempt.errorMessage,
      })),
    })),
    statusCounts: Object.fromEntries(
      stats.map(s => [s.status, s._count])
    ),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const action = formData.get("action");
  const subscriptionId = formData.get("subscriptionId") as string;

  switch (action) {
    case "retry-billing": {
      await SubscriptionContractService.retryFailedBilling({
        shop: session.shop,
        admin,
        subscriptionId,
      });
      
      return json({ success: true, message: "Billing retry initiated" });
    }
    
    case "update-payment": {
      // This would typically redirect to Shopify's payment update flow
      const subscription = await db.tierSubscription.findUnique({
        where: { id: subscriptionId },
      });
      
      if (!subscription) {
        return json({ success: false, message: "Subscription not found" }, { status: 404 });
      }
      
      // Generate payment update URL (would need actual implementation)
      const paymentUpdateUrl = `/app/subscriptions/update-payment/${subscriptionId}`;
      
      return json({ 
        success: true, 
        message: "Redirecting to payment update",
        redirectUrl: paymentUpdateUrl 
      });
    }
    
    case "export": {
      // Export subscription data (simplified)
      const subscriptions = await db.tierSubscription.findMany({
        where: { shop: session.shop },
        include: { customer: true, tier: true },
      });
      
      return json({
        success: true,
        data: subscriptions,
        message: "Export completed",
      });
    }
    
    default:
      return json({ success: false, message: "Invalid action" }, { status: 400 });
  }
};

export default function SubscriptionContracts() {
  const { subscriptions, statusCounts } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [selectedSubscription, setSelectedSubscription] = useState<any>(null);
  const [detailModalActive, setDetailModalActive] = useState(false);
  
  const [filters, setFilters] = useState<FilterState>({
    status: searchParams.getAll("status"),
    interval: searchParams.getAll("interval"),
    priceRange: [
      parseInt(searchParams.get("minPrice") || "0"),
      parseInt(searchParams.get("maxPrice") || "500"),
    ],
  });

  const isLoading = navigation.state !== "idle";

  const handleFilterChange = useCallback((key: keyof FilterState, value: any) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    
    // Update URL params
    const newParams = new URLSearchParams();
    
    newFilters.status.forEach(s => newParams.append("status", s));
    newFilters.interval.forEach(i => newParams.append("interval", i));
    newParams.set("minPrice", newFilters.priceRange[0].toString());
    newParams.set("maxPrice", newFilters.priceRange[1].toString());
    
    setSearchParams(newParams);
  }, [filters, setSearchParams]);

  const handleViewDetails = useCallback((subscription: any) => {
    setSelectedSubscription(subscription);
    setDetailModalActive(true);
  }, []);

  const handleRetryBilling = useCallback((subscriptionId: string) => {
    const formData = new FormData();
    formData.append("action", "retry-billing");
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

  const filteredSubscriptions = useMemo(() => {
    return subscriptions;
  }, [subscriptions]);

  const rows = filteredSubscriptions.map(sub => [
    sub.subscriptionContractId,
    sub.customerName,
    sub.tierName,
    getStatusBadge(sub.status),
    sub.billingInterval,
    formatCurrency(sub.currentPrice),
    formatDate(sub.nextBillingDate),
    formatCurrency(sub.totalBilled),
    <InlineStack gap="200">
      <Button size="slim" onClick={() => handleViewDetails(sub)}>
        View
      </Button>
      {sub.status === 'FAILED' && sub.failureCount > 0 && (
        <Button size="slim" onClick={() => handleRetryBilling(sub.id)} loading={isLoading}>
          Retry
        </Button>
      )}
    </InlineStack>,
  ]);

  const appliedFilters = [
    ...filters.status.map(s => ({ key: 'status', label: s, onRemove: () => handleFilterChange('status', filters.status.filter(x => x !== s)) })),
    ...filters.interval.map(i => ({ key: 'interval', label: i, onRemove: () => handleFilterChange('interval', filters.interval.filter(x => x !== i)) })),
  ];

  return (
    <Page
      title="Active Subscriptions"
      subtitle="View and manage subscription contracts"
      secondaryActions={[
        {
          content: "Export",
          onAction: () => {
            const formData = new FormData();
            formData.append("action", "export");
            submit(formData, { method: "post" });
          },
        },
      ]}
    >
      <Layout>
        {/* Status Overview */}
        <Layout.Section>
          <InlineStack gap="400" align="start" blockAlign="stretch">
            {Object.entries(statusCounts).map(([status, count]) => (
              <Card key={status}>
                <Box padding="300">
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {status}
                    </Text>
                    <Text as="p" variant="headingLg">
                      {count}
                    </Text>
                  </BlockStack>
                </Box>
              </Card>
            ))}
          </InlineStack>
        </Layout.Section>

        {/* Filters */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <Filters
                queryValue=""
                filters={[
                  {
                    key: 'status',
                    label: 'Status',
                    filter: (
                      <ChoiceList
                        title="Status"
                        titleHidden
                        choices={[
                          { label: 'Active', value: 'ACTIVE' },
                          { label: 'Pending', value: 'PENDING' },
                          { label: 'Paused', value: 'PAUSED' },
                          { label: 'Failed', value: 'FAILED' },
                          { label: 'Cancelled', value: 'CANCELLED' },
                        ]}
                        selected={filters.status}
                        onChange={(value) => handleFilterChange('status', value)}
                        allowMultiple
                      />
                    ),
                  },
                  {
                    key: 'interval',
                    label: 'Billing Interval',
                    filter: (
                      <ChoiceList
                        title="Billing Interval"
                        titleHidden
                        choices={[
                          { label: 'Monthly', value: 'MONTHLY' },
                          { label: 'Quarterly', value: 'QUARTERLY' },
                          { label: 'Annual', value: 'ANNUAL' },
                        ]}
                        selected={filters.interval}
                        onChange={(value) => handleFilterChange('interval', value)}
                        allowMultiple
                      />
                    ),
                  },
                  {
                    key: 'price',
                    label: 'Price Range',
                    filter: (
                      <RangeSlider
                        label="Monthly price range"
                        labelHidden
                        value={filters.priceRange}
                        prefix="$"
                        min={0}
                        max={500}
                        step={10}
                        onChange={(value) => handleFilterChange('priceRange', value)}
                        output
                      />
                    ),
                  },
                ]}
                appliedFilters={appliedFilters}
                onClearAll={() => {
                  setFilters({ status: [], interval: [], priceRange: [0, 500] });
                  setSearchParams(new URLSearchParams());
                }}
                onQueryChange={() => {}}
                onQueryClear={() => {}}
              />
            </Box>
          </Card>
        </Layout.Section>

        {/* Subscriptions Table */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg">Subscription Contracts</Text>
                
                {filteredSubscriptions.length > 0 ? (
                  <DataTable
                    columnContentTypes={[
                      "text",
                      "text",
                      "text",
                      "text",
                      "text",
                      "numeric",
                      "text",
                      "numeric",
                      "text",
                    ]}
                    headings={[
                      "Contract ID",
                      "Customer",
                      "Tier",
                      "Status",
                      "Interval",
                      "Price",
                      "Next Billing",
                      "Total Billed",
                      "Actions",
                    ]}
                    rows={rows}
                  />
                ) : (
                  <EmptyState
                    heading="No subscriptions found"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>Try adjusting your filters or check back later.</p>
                  </EmptyState>
                )}
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>

      {/* Detail Modal */}
      <Modal
        open={detailModalActive}
        onClose={() => setDetailModalActive(false)}
        title="Subscription Details"
        large
        secondaryActions={[
          {
            content: "Close",
            onAction: () => setDetailModalActive(false),
          },
        ]}
      >
        {selectedSubscription && (
          <Modal.Section>
            <BlockStack gap="400">
              {/* Contract Info */}
              <Box>
                <Text as="h3" variant="headingMd">Contract Information</Text>
                <Box paddingBlockStart="200">
                  <DescriptionList
                    items={[
                      {
                        term: "Contract ID",
                        description: selectedSubscription.subscriptionContractId,
                      },
                      {
                        term: "Status",
                        description: getStatusBadge(selectedSubscription.status),
                      },
                      {
                        term: "Start Date",
                        description: formatDate(selectedSubscription.startDate),
                      },
                      {
                        term: "End Date",
                        description: formatDate(selectedSubscription.endDate),
                      },
                    ]}
                  />
                </Box>
              </Box>

              <Divider />

              {/* Customer Info */}
              <Box>
                <Text as="h3" variant="headingMd">Customer</Text>
                <Box paddingBlockStart="200">
                  <DescriptionList
                    items={[
                      {
                        term: "Name",
                        description: selectedSubscription.customerName,
                      },
                      {
                        term: "Email",
                        description: selectedSubscription.customerEmail,
                      },
                      {
                        term: "Tier",
                        description: selectedSubscription.tierName,
                      },
                    ]}
                  />
                </Box>
              </Box>

              <Divider />

              {/* Billing Info */}
              <Box>
                <Text as="h3" variant="headingMd">Billing</Text>
                <Box paddingBlockStart="200">
                  <DescriptionList
                    items={[
                      {
                        term: "Interval",
                        description: selectedSubscription.billingInterval,
                      },
                      {
                        term: "Monthly Price",
                        description: formatCurrency(selectedSubscription.monthlyPrice),
                      },
                      {
                        term: "Current Price",
                        description: formatCurrency(selectedSubscription.currentPrice),
                      },
                      {
                        term: "Next Billing Date",
                        description: formatDate(selectedSubscription.nextBillingDate),
                      },
                      {
                        term: "Total Billed",
                        description: formatCurrency(selectedSubscription.totalBilled),
                      },
                      {
                        term: "Failed Attempts",
                        description: selectedSubscription.failureCount.toString(),
                      },
                    ]}
                  />
                </Box>
              </Box>

              {/* Billing History */}
              {selectedSubscription.billingHistory.length > 0 && (
                <>
                  <Divider />
                  <Box>
                    <Text as="h3" variant="headingMd">Recent Billing History</Text>
                    <Box paddingBlockStart="200">
                      <BlockStack gap="200">
                        {selectedSubscription.billingHistory.map((attempt: any) => (
                          <InlineStack key={attempt.id} align="space-between">
                            <Text as="span" variant="bodySm">
                              {formatDate(attempt.createdAt)}
                            </Text>
                            <InlineStack gap="200">
                              <Text as="span" variant="bodySm">
                                {formatCurrency(attempt.amount)}
                              </Text>
                              <Badge tone={attempt.status === 'SUCCESS' ? 'success' : 'critical'}>
                                {attempt.status}
                              </Badge>
                            </InlineStack>
                          </InlineStack>
                        ))}
                      </BlockStack>
                    </Box>
                  </Box>
                </>
              )}

              {/* Cancellation Info */}
              {selectedSubscription.cancelledAt && (
                <>
                  <Divider />
                  <Box>
                    <Text as="h3" variant="headingMd">Cancellation</Text>
                    <Box paddingBlockStart="200">
                      <DescriptionList
                        items={[
                          {
                            term: "Cancelled At",
                            description: formatDate(selectedSubscription.cancelledAt),
                          },
                          {
                            term: "Reason",
                            description: selectedSubscription.cancellationReason || "No reason provided",
                          },
                        ]}
                      />
                    </Box>
                  </Box>
                </>
              )}
            </BlockStack>
          </Modal.Section>
        )}
      </Modal>
    </Page>
  );
}