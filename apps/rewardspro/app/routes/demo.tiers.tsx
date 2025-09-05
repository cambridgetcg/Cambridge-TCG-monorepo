import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  DataTable,
  Badge,
  Button,
  BlockStack,
  InlineStack,
  Box,
  TextField,
  Select,
} from "@shopify/polaris";
import { PlusIcon, EditIcon } from "@shopify/polaris-icons";

export const loader = async () => {
  // Mock tier data
  const tiers = [
    {
      id: "1",
      name: "Bronze",
      minSpend: "$0",
      cashbackRate: "2%",
      customerCount: 245,
      status: "Active",
      benefits: ["2% cashback", "Birthday bonus"],
    },
    {
      id: "2",
      name: "Silver",
      minSpend: "$500",
      cashbackRate: "3%",
      customerCount: 128,
      status: "Active",
      benefits: ["3% cashback", "Birthday bonus", "Early sale access"],
    },
    {
      id: "3",
      name: "Gold",
      minSpend: "$1,500",
      cashbackRate: "5%",
      customerCount: 67,
      status: "Active",
      benefits: ["5% cashback", "Birthday bonus", "Early sale access", "Free shipping"],
    },
    {
      id: "4",
      name: "Platinum",
      minSpend: "$5,000",
      cashbackRate: "7%",
      customerCount: 12,
      status: "Draft",
      benefits: ["7% cashback", "All perks", "VIP support"],
    },
  ];

  return json({ tiers });
};

export default function DemoTiersPage() {
  const { tiers } = useLoaderData<typeof loader>();

  const rows = tiers.map(tier => [
    tier.name,
    tier.minSpend,
    tier.cashbackRate,
    tier.customerCount.toString(),
    <Badge tone={tier.status === "Active" ? "success" : "info"}>{tier.status}</Badge>,
    <Button size="slim" icon={EditIcon}>Edit</Button>,
  ]);

  return (
    <Page
      title="Loyalty Tiers"
      primaryAction={
        <Button variant="primary" icon={PlusIcon}>
          Add Tier
        </Button>
      }
    >
      <Box paddingBlockEnd="2000">
      <Layout>
        {/* Configuration Card */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Tier Configuration</Text>
                <InlineStack gap="300" align="start">
                  <Select
                    label="Evaluation Period"
                    options={[
                      { label: "Annual", value: "annual" },
                      { label: "Lifetime", value: "lifetime" },
                      { label: "Quarterly", value: "quarterly" },
                    ]}
                    value="annual"
                  />
                  <TextField
                    label="Grace Period (days)"
                    type="number"
                    value="30"
                    autoComplete="off"
                  />
                  <Select
                    label="Tier Assignment"
                    options={[
                      { label: "Automatic", value: "auto" },
                      { label: "Manual Review", value: "manual" },
                    ]}
                    value="auto"
                  />
                </InlineStack>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        {/* Tiers Table */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Active Tiers</Text>
                <DataTable
                  columnContentTypes={[
                    'text',
                    'numeric',
                    'numeric',
                    'numeric',
                    'text',
                    'text',
                  ]}
                  headings={[
                    'Tier Name',
                    'Min. Spend',
                    'Cashback',
                    'Customers',
                    'Status',
                    'Actions',
                  ]}
                  rows={rows}
                />
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        {/* Benefits Overview */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Tier Benefits Overview</Text>
                {tiers.map(tier => (
                  <Box key={tier.id} padding="200" background="bg-surface-secondary" borderRadius="200">
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <Text variant="bodyMd" fontWeight="semibold">{tier.name}</Text>
                        <Badge tone={tier.status === "Active" ? "success" : "info"}>{tier.status}</Badge>
                      </InlineStack>
                      <InlineStack gap="200" wrap>
                        {tier.benefits.map((benefit, idx) => (
                          <Badge key={idx} tone="default">{benefit}</Badge>
                        ))}
                      </InlineStack>
                    </BlockStack>
                  </Box>
                ))}
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
      </Box>
    </Page>
  );
}