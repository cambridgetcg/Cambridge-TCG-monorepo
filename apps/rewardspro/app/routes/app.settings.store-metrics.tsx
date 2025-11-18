import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, Form } from "@remix-run/react";
import { useState, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Button,
  Banner,
  BlockStack,
  InlineStack,
  Text,
  Divider,
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { formatCurrency } from "../utils/currency";

// ============= TYPES =============

type StoreMetrics = {
  averageProfitMargin: string | null;
  averageCogsPercent: string | null;
  averageShippingCost: string | null;
  averageOrderValue: string | null;
  targetRoiPercent: string | null;
  metricsLastUpdated: string | null;
  storeCurrency: string;
};

type LoaderData = {
  metrics: StoreMetrics;
  shop: string;
};

// ============= LOADER =============

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Fetch current store metrics from shopSettings
  const shopSettings = await db.shopSettings.findUnique({
    where: { shop },
    select: {
      averageProfitMargin: true,
      averageCogsPercent: true,
      averageShippingCost: true,
      averageOrderValue: true,
      targetRoiPercent: true,
      metricsLastUpdated: true,
      storeCurrency: true,
    },
  });

  // If no settings exist, create them
  if (!shopSettings) {
    await db.shopSettings.upsert({
      where: { shop },
      create: {
        shop,
        storeName: shop,
        storeUrl: `https://${shop}`,
        averageProfitMargin: null,
        averageCogsPercent: null,
        averageShippingCost: null,
        averageOrderValue: null,
        targetRoiPercent: null,
      },
      update: {},
    });
  }

  const metrics: StoreMetrics = {
    averageProfitMargin: shopSettings?.averageProfitMargin?.toString() || null,
    averageCogsPercent: shopSettings?.averageCogsPercent?.toString() || null,
    averageShippingCost: shopSettings?.averageShippingCost?.toString() || null,
    averageOrderValue: shopSettings?.averageOrderValue?.toString() || null,
    targetRoiPercent: shopSettings?.targetRoiPercent?.toString() || null,
    metricsLastUpdated: shopSettings?.metricsLastUpdated?.toISOString() || null,
    storeCurrency: shopSettings?.storeCurrency || "USD",
  };

  return json<LoaderData>({ metrics, shop });
};

// ============= ACTION =============

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "save-metrics") {
    const averageProfitMargin = formData.get("averageProfitMargin") as string;
    const averageCogsPercent = formData.get("averageCogsPercent") as string;
    const averageShippingCost = formData.get("averageShippingCost") as string;
    const averageOrderValue = formData.get("averageOrderValue") as string;
    const targetRoiPercent = formData.get("targetRoiPercent") as string;

    // Convert empty strings to null
    const parseDecimal = (value: string | null) => {
      if (!value || value.trim() === "") return null;
      const parsed = parseFloat(value);
      return isNaN(parsed) ? null : parsed;
    };

    await db.shopSettings.update({
      where: { shop },
      data: {
        averageProfitMargin: parseDecimal(averageProfitMargin),
        averageCogsPercent: parseDecimal(averageCogsPercent),
        averageShippingCost: parseDecimal(averageShippingCost),
        averageOrderValue: parseDecimal(averageOrderValue),
        targetRoiPercent: parseDecimal(targetRoiPercent),
        metricsLastUpdated: new Date(),
      },
    });

    return json({ success: true, message: "Store metrics saved successfully" });
  }

  return json({ success: false, message: "Invalid action" });
};

// ============= COMPONENT =============

export default function StoreMetricsSettings() {
  const { metrics, shop } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const [formValues, setFormValues] = useState({
    averageProfitMargin: metrics.averageProfitMargin || "",
    averageCogsPercent: metrics.averageCogsPercent || "",
    averageShippingCost: metrics.averageShippingCost || "",
    averageOrderValue: metrics.averageOrderValue || "",
    targetRoiPercent: metrics.targetRoiPercent || "",
  });

  const handleChange = useCallback((field: string) => (value: string) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  }, []);

  const isSaving = fetcher.state === "submitting";
  const showSuccess = fetcher.data?.success && fetcher.state === "idle";

  return (
    <Page
      title="Store Metrics"
      subtitle="Configure your store's business metrics for enhanced analytics"
      backAction={{ content: "Settings", url: "/app/settings" }}
    >
      <Layout>
        <Layout.Section>
          {/* Info Banner */}
          <Banner tone="info">
            <BlockStack gap="200">
              <Text as="p">
                These metrics help RewardsPro provide more accurate ROI calculations and insights
                in your analytics dashboard.
              </Text>
              <Text as="p" tone="subdued">
                Don't worry if you don't know exact values - estimates are fine! You can update
                these anytime.
              </Text>
            </BlockStack>
          </Banner>
        </Layout.Section>

        <Layout.Section>
          {/* Success Banner */}
          {showSuccess && (
            <Banner tone="success" onDismiss={() => fetcher.data = null}>
              Store metrics saved successfully
            </Banner>
          )}

          {/* Main Form */}
          <Card>
            <fetcher.Form method="post">
              <input type="hidden" name="action" value="save-metrics" />
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Business Metrics
                </Text>

                <FormLayout>
                  {/* Profit Margin */}
                  <TextField
                    label="Average Profit Margin"
                    type="number"
                    value={formValues.averageProfitMargin}
                    onChange={handleChange("averageProfitMargin")}
                    name="averageProfitMargin"
                    suffix="%"
                    helpText="Your average profit margin as a percentage (e.g., 45 for 45%)"
                    autoComplete="off"
                    min="0"
                    max="100"
                    step="0.01"
                  />

                  {/* COGS Percent */}
                  <TextField
                    label="Average COGS Percentage"
                    type="number"
                    value={formValues.averageCogsPercent}
                    onChange={handleChange("averageCogsPercent")}
                    name="averageCogsPercent"
                    suffix="%"
                    helpText="Cost of goods sold as a percentage of revenue (e.g., 55 for 55%)"
                    autoComplete="off"
                    min="0"
                    max="100"
                    step="0.01"
                  />

                  <Divider />

                  {/* Shipping Cost */}
                  <TextField
                    label="Average Shipping Cost"
                    type="number"
                    value={formValues.averageShippingCost}
                    onChange={handleChange("averageShippingCost")}
                    name="averageShippingCost"
                    prefix={metrics.storeCurrency}
                    helpText="Your average shipping cost per order"
                    autoComplete="off"
                    min="0"
                    step="0.01"
                  />

                  {/* Average Order Value */}
                  <TextField
                    label="Historical Average Order Value"
                    type="number"
                    value={formValues.averageOrderValue}
                    onChange={handleChange("averageOrderValue")}
                    name="averageOrderValue"
                    prefix={metrics.storeCurrency}
                    helpText="Your store's typical average order value"
                    autoComplete="off"
                    min="0"
                    step="0.01"
                  />

                  <Divider />

                  {/* Target ROI */}
                  <TextField
                    label="Target Loyalty Program ROI"
                    type="number"
                    value={formValues.targetRoiPercent}
                    onChange={handleChange("targetRoiPercent")}
                    name="targetRoiPercent"
                    suffix="%"
                    helpText="Your target return on investment for the loyalty program (e.g., 300 for 3x return)"
                    autoComplete="off"
                    min="0"
                    step="0.01"
                  />
                </FormLayout>

                {metrics.metricsLastUpdated && (
                  <Box paddingBlockStart="400">
                    <Text variant="bodySm" tone="subdued" as="p">
                      Last updated: {new Date(metrics.metricsLastUpdated).toLocaleString()}
                    </Text>
                  </Box>
                )}

                <InlineStack align="end">
                  <Button
                    variant="primary"
                    submit
                    loading={isSaving}
                  >
                    Save Metrics
                  </Button>
                </InlineStack>
              </BlockStack>
            </fetcher.Form>
          </Card>
        </Layout.Section>

        <Layout.Section>
          {/* Help Card */}
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                How These Metrics Are Used
              </Text>

              <BlockStack gap="300">
                <Box>
                  <Text variant="headingSm" as="h3" fontWeight="semibold">
                    Profit Margin & COGS
                  </Text>
                  <Text as="p" tone="subdued">
                    Used to calculate true profitability of orders and the actual cost of cashback rewards.
                  </Text>
                </Box>

                <Box>
                  <Text variant="headingSm" as="h3" fontWeight="semibold">
                    Shipping Cost
                  </Text>
                  <Text as="p" tone="subdued">
                    Helps calculate net profit per order by factoring in shipping expenses.
                  </Text>
                </Box>

                <Box>
                  <Text variant="headingSm" as="h3" fontWeight="semibold">
                    Average Order Value
                  </Text>
                  <Text as="p" tone="subdued">
                    Used for benchmarking and projecting the impact of your loyalty program.
                  </Text>
                </Box>

                <Box>
                  <Text variant="headingSm" as="h3" fontWeight="semibold">
                    Target ROI
                  </Text>
                  <Text as="p" tone="subdued">
                    Analytics will show whether your loyalty program is meeting your target return on investment.
                  </Text>
                </Box>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
