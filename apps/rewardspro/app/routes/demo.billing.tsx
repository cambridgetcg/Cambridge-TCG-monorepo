import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Box,
  Button,
  Badge,
  DataTable,
  ProgressBar,
  Banner,
  List,
  Divider,
} from "@shopify/polaris";
import { CreditCardIcon, ReceiptIcon, CheckIcon } from "@shopify/polaris-icons";

export const loader = async () => {
  // Mock billing data
  const billing = {
    currentPlan: {
      name: "Professional",
      price: 49.99,
      billingCycle: "monthly",
      features: [
        "Up to 1,000 customers",
        "3 loyalty tiers",
        "Email notifications",
        "Analytics dashboard",
        "API access",
        "Priority support",
      ],
      usage: {
        customers: 452,
        customersLimit: 1000,
        orders: 1823,
        ordersLimit: 10000,
      },
    },
    plans: [
      {
        name: "Starter",
        price: 19.99,
        features: [
          "Up to 100 customers",
          "2 loyalty tiers",
          "Email notifications",
          "Basic analytics",
        ],
        popular: false,
      },
      {
        name: "Professional",
        price: 49.99,
        features: [
          "Up to 1,000 customers",
          "3 loyalty tiers",
          "Email notifications",
          "Analytics dashboard",
          "API access",
          "Priority support",
        ],
        popular: true,
        current: true,
      },
      {
        name: "Enterprise",
        price: 149.99,
        features: [
          "Unlimited customers",
          "Unlimited tiers",
          "Email & SMS notifications",
          "Advanced analytics",
          "API access",
          "Dedicated support",
          "Custom integrations",
          "White-label options",
        ],
        popular: false,
      },
    ],
    invoices: [
      {
        id: "INV-2024-003",
        date: "2024-03-01",
        amount: 49.99,
        status: "Paid",
      },
      {
        id: "INV-2024-002",
        date: "2024-02-01",
        amount: 49.99,
        status: "Paid",
      },
      {
        id: "INV-2024-001",
        date: "2024-01-01",
        amount: 49.99,
        status: "Paid",
      },
    ],
    nextBilling: {
      date: "2024-04-01",
      amount: 49.99,
    },
  };

  return json({ billing });
};

function PlanCard({ plan, isCurrent = false }: any) {
  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="400">
          {plan.popular && !isCurrent && (
            <Badge tone="success">Most Popular</Badge>
          )}
          {isCurrent && (
            <Badge tone="info">Current Plan</Badge>
          )}
          <BlockStack gap="200">
            <Text variant="headingLg" as="h3">{plan.name}</Text>
            <Text variant="heading2xl" as="p">
              ${plan.price}
              <Text variant="bodySm" tone="subdued" as="span"> /month</Text>
            </Text>
          </BlockStack>
          <Divider />
          <List type="bullet">
            {plan.features.map((feature: string, idx: number) => (
              <List.Item key={idx}>
                <InlineStack gap="100">
                  <Text variant="bodyMd">{feature}</Text>
                </InlineStack>
              </List.Item>
            ))}
          </List>
          <Button
            fullWidth
            variant={isCurrent ? "plain" : plan.popular ? "primary" : "secondary"}
            disabled={isCurrent}
          >
            {isCurrent ? "Current Plan" : "Upgrade"}
          </Button>
        </BlockStack>
      </Box>
    </Card>
  );
}

export default function DemoBillingPage() {
  const { billing } = useLoaderData<typeof loader>();

  const invoiceRows = billing.invoices.map(invoice => [
    invoice.id,
    invoice.date,
    `$${invoice.amount}`,
    <Badge tone={invoice.status === "Paid" ? "success" : "warning"}>{invoice.status}</Badge>,
    <Button size="slim" icon={ReceiptIcon}>Download</Button>,
  ]);

  const usagePercentage = (billing.currentPlan.usage.customers / billing.currentPlan.usage.customersLimit) * 100;
  const ordersPercentage = (billing.currentPlan.usage.orders / billing.currentPlan.usage.ordersLimit) * 100;

  return (
    <Page
      title="Billing & Plans"
      primaryAction={
        <Button icon={CreditCardIcon}>Update Payment Method</Button>
      }
    >
      <Box paddingBlockEnd="2000">
      <Layout>
        {/* Current Plan Overview */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <BlockStack gap="200">
                    <Text variant="headingMd" as="h2">Current Subscription</Text>
                    <InlineStack gap="200" align="center">
                      <Badge tone="success">{billing.currentPlan.name} Plan</Badge>
                      <Text variant="bodyMd" tone="subdued">
                        ${billing.currentPlan.price}/month
                      </Text>
                    </InlineStack>
                  </BlockStack>
                  <BlockStack gap="100" align="end">
                    <Text variant="bodySm" tone="subdued">Next billing date</Text>
                    <Text variant="bodyMd" fontWeight="semibold">{billing.nextBilling.date}</Text>
                  </BlockStack>
                </InlineStack>
                <Divider />
                <BlockStack gap="300">
                  <Text variant="bodyMd" fontWeight="semibold">Usage This Month</Text>
                  <BlockStack gap="200">
                    <BlockStack gap="100">
                      <InlineStack align="space-between">
                        <Text variant="bodySm">Customers</Text>
                        <Text variant="bodySm" tone="subdued">
                          {billing.currentPlan.usage.customers} / {billing.currentPlan.usage.customersLimit}
                        </Text>
                      </InlineStack>
                      <ProgressBar
                        progress={usagePercentage}
                        size="small"
                        tone={usagePercentage > 80 ? "warning" : "success"}
                      />
                    </BlockStack>
                    <BlockStack gap="100">
                      <InlineStack align="space-between">
                        <Text variant="bodySm">Orders Processed</Text>
                        <Text variant="bodySm" tone="subdued">
                          {billing.currentPlan.usage.orders} / {billing.currentPlan.usage.ordersLimit}
                        </Text>
                      </InlineStack>
                      <ProgressBar
                        progress={ordersPercentage}
                        size="small"
                        tone="success"
                      />
                    </BlockStack>
                  </BlockStack>
                </BlockStack>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        {/* Available Plans */}
        <Layout.Section>
          <BlockStack gap="400">
            <Text variant="headingMd" as="h2">Available Plans</Text>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
              {billing.plans.map((plan) => (
                <PlanCard
                  key={plan.name}
                  plan={plan}
                  isCurrent={plan.current}
                />
              ))}
            </div>
          </BlockStack>
        </Layout.Section>

        {/* Payment Method */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Payment Method</Text>
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <InlineStack align="space-between">
                    <InlineStack gap="300">
                      <Box>
                        <Icon source={CreditCardIcon} />
                      </Box>
                      <BlockStack gap="100">
                        <Text variant="bodyMd" fontWeight="semibold">Visa ending in 4242</Text>
                        <Text variant="bodySm" tone="subdued">Expires 12/2025</Text>
                      </BlockStack>
                    </InlineStack>
                    <Button size="slim">Update</Button>
                  </InlineStack>
                </Box>
                <Banner tone="info">
                  <p>Your payment method is securely stored and processed by Shopify.</p>
                </Banner>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        {/* Recent Invoices */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h2">Recent Invoices</Text>
                  <Button variant="plain">View All</Button>
                </InlineStack>
                <DataTable
                  columnContentTypes={[
                    'text',
                    'text',
                    'numeric',
                    'text',
                    'text',
                  ]}
                  headings={[
                    'Invoice',
                    'Date',
                    'Amount',
                    'Status',
                    'Actions',
                  ]}
                  rows={invoiceRows}
                />
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
      </Box>
    </Page>
  );
}

// Fix for Icon component
function Icon({ source }: { source: any }) {
  return <div style={{ width: 20, height: 20, display: "flex" }}>{source}</div>;
}