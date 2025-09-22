import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, useNavigation, Form } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import {
  recalculateCashbackForAllOrders,
  processPendingCashback
} from "../services/recalculate-cashback.server";
import {
  Page,
  Layout,
  Card,
  Button,
  Banner,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Box,
  Divider,
  ProgressBar,
} from "@shopify/polaris";
import db from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Get statistics
  const [totalOrders, ordersWithCashback, ordersWithoutCashback, unprocessedCashback] = await Promise.all([
    db.order.count({ where: { shop } }),
    db.order.count({ where: { shop, cashbackAmount: { not: null } } }),
    db.order.count({ where: { shop, cashbackAmount: null, cashbackEligible: true, financialStatus: 'PAID' } }),
    db.order.count({ where: { shop, cashbackAmount: { not: null }, cashbackProcessed: false } })
  ]);

  const totalUnprocessedAmount = await db.order.aggregate({
    where: {
      shop,
      cashbackAmount: { not: null },
      cashbackProcessed: false
    },
    _sum: { cashbackAmount: true }
  });

  return json({
    stats: {
      totalOrders,
      ordersWithCashback,
      ordersWithoutCashback,
      unprocessedCashback,
      totalUnprocessedAmount: totalUnprocessedAmount._sum.cashbackAmount || 0
    }
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const actionType = formData.get("action");

  try {
    if (actionType === "recalculate") {
      const result = await recalculateCashbackForAllOrders(shop);
      return json({
        success: true,
        message: `Successfully recalculated cashback for ${result.ordersProcessed} orders. Total cashback: ${result.totalCashback}`,
        result
      });
    } else if (actionType === "process") {
      const result = await processPendingCashback(shop);
      return json({
        success: true,
        message: `Successfully processed cashback for ${result.ordersProcessed} orders. Total credited: ${result.totalCredited}`,
        result
      });
    }

    return json({ success: false, message: "Invalid action" });
  } catch (error: any) {
    console.error("[Cashback Recalculation] Error:", error);
    return json({ success: false, message: error.message });
  }
}

export default function RecalculateCashbackPage() {
  const { stats } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isProcessing = navigation.state === "submitting";

  return (
    <Page
      title="Recalculate Cashback"
      backAction={{ url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          {actionData?.success && (
            <Banner tone="success" title="Success">
              <p>{actionData.message}</p>
            </Banner>
          )}

          {actionData?.success === false && (
            <Banner tone="critical" title="Error">
              <p>{actionData.message}</p>
            </Banner>
          )}

          <BlockStack gap="400">
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">Order Statistics</Text>
                  <Divider />

                  <InlineStack gap="800" wrap>
                    <BlockStack gap="200">
                      <Text variant="bodySm" as="p" tone="subdued">Total Orders</Text>
                      <Text variant="headingLg" as="p">{stats.totalOrders}</Text>
                    </BlockStack>

                    <BlockStack gap="200">
                      <Text variant="bodySm" as="p" tone="subdued">With Cashback</Text>
                      <Text variant="headingLg" as="p">{stats.ordersWithCashback}</Text>
                    </BlockStack>

                    <BlockStack gap="200">
                      <Text variant="bodySm" as="p" tone="subdued">Need Calculation</Text>
                      <InlineStack gap="200" align="end">
                        <Text variant="headingLg" as="p">{stats.ordersWithoutCashback}</Text>
                        {stats.ordersWithoutCashback > 0 && <Badge tone="attention">Action needed</Badge>}
                      </InlineStack>
                    </BlockStack>

                    <BlockStack gap="200">
                      <Text variant="bodySm" as="p" tone="subdued">Unprocessed</Text>
                      <InlineStack gap="200" align="end">
                        <Text variant="headingLg" as="p">{stats.unprocessedCashback}</Text>
                        {stats.unprocessedCashback > 0 && <Badge tone="warning">Pending</Badge>}
                      </InlineStack>
                    </BlockStack>
                  </InlineStack>

                  {stats.totalUnprocessedAmount > 0 && (
                    <>
                      <Divider />
                      <InlineStack align="space-between">
                        <Text variant="bodyMd" as="p">Total Unprocessed Cashback</Text>
                        <Text variant="headingMd" as="p">${Number(stats.totalUnprocessedAmount).toFixed(2)}</Text>
                      </InlineStack>
                    </>
                  )}
                </BlockStack>
              </Box>
            </Card>

            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">Step 1: Calculate Cashback</Text>
                  <Text variant="bodyMd" as="p">
                    This will calculate cashback amounts for all eligible orders based on customer tiers.
                    Orders that already have cashback calculated will not be affected.
                  </Text>

                  <Form method="post">
                    <input type="hidden" name="action" value="recalculate" />
                    <Button
                      submit
                      variant="primary"
                      size="large"
                      loading={isProcessing && navigation.formData?.get("action") === "recalculate"}
                      disabled={isProcessing || stats.ordersWithoutCashback === 0}
                    >
                      Calculate Cashback for {stats.ordersWithoutCashback} Orders
                    </Button>
                  </Form>
                </BlockStack>
              </Box>
            </Card>

            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">Step 2: Process Cashback Credits</Text>
                  <Text variant="bodyMd" as="p">
                    This will create store credit ledger entries and update customer balances for orders
                    with calculated but unprocessed cashback.
                  </Text>

                  <Banner tone="warning">
                    <p>This action will credit customer accounts. Make sure cashback calculations are correct before proceeding.</p>
                  </Banner>

                  <Form method="post">
                    <input type="hidden" name="action" value="process" />
                    <Button
                      submit
                      variant="primary"
                      size="large"
                      tone="critical"
                      loading={isProcessing && navigation.formData?.get("action") === "process"}
                      disabled={isProcessing || stats.unprocessedCashback === 0}
                    >
                      Process {stats.unprocessedCashback} Orders (Credit ${Number(stats.totalUnprocessedAmount).toFixed(2)})
                    </Button>
                  </Form>
                </BlockStack>
              </Box>
            </Card>

            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">Important Notes</Text>
                  <BlockStack gap="200">
                    <InlineStack gap="200">
                      <Text variant="bodyMd" as="span">•</Text>
                      <Text variant="bodyMd" as="span">Only PAID orders are eligible for cashback</Text>
                    </InlineStack>
                    <InlineStack gap="200">
                      <Text variant="bodyMd" as="span">•</Text>
                      <Text variant="bodyMd" as="span">Test orders are excluded from cashback</Text>
                    </InlineStack>
                    <InlineStack gap="200">
                      <Text variant="bodyMd" as="span">•</Text>
                      <Text variant="bodyMd" as="span">Cashback is calculated based on the customer's current tier</Text>
                    </InlineStack>
                    <InlineStack gap="200">
                      <Text variant="bodyMd" as="span">•</Text>
                      <Text variant="bodyMd" as="span">Processing cashback will update store credit balances immediately</Text>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Box>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}