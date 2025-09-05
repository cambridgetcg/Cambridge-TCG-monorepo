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
  TextField,
  InlineStack,
  BlockStack,
  Box,
  EmptyState,
} from "@shopify/polaris";
import { SearchIcon, FilterIcon, ExportIcon } from "@shopify/polaris-icons";

export const loader = async () => {
  // Mock customer data
  const customers = [
    {
      id: "1",
      name: "John Smith",
      email: "john@example.com",
      tier: "Gold",
      storeCredit: "$125.00",
      totalSpent: "$2,450.00",
      joinDate: "2024-01-15",
    },
    {
      id: "2",
      name: "Sarah Johnson",
      email: "sarah@example.com",
      tier: "Silver",
      storeCredit: "$45.00",
      totalSpent: "$890.00",
      joinDate: "2024-02-20",
    },
    {
      id: "3",
      name: "Mike Chen",
      email: "mike@example.com",
      tier: "Bronze",
      storeCredit: "$15.00",
      totalSpent: "$350.00",
      joinDate: "2024-03-10",
    },
  ];

  return json({ customers });
};

export default function DemoCustomersPage() {
  const { customers } = useLoaderData<typeof loader>();

  const rows = customers.map(customer => [
    customer.name,
    customer.email,
    <Badge tone="success">{customer.tier}</Badge>,
    customer.storeCredit,
    customer.totalSpent,
    customer.joinDate,
  ]);

  return (
    <Page
      title="Customers"
      primaryAction={
        <Button variant="primary" icon={ExportIcon}>
          Export
        </Button>
      }
    >
      <Box paddingBlockEnd="2000">
      <Layout>
        {/* Search and Filters */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack gap="300" align="end">
                <Box minWidth="320px">
                  <TextField
                    label=""
                    placeholder="Search customers..."
                    prefix={<Icon source={SearchIcon} />}
                    autoComplete="off"
                  />
                </Box>
                <Button icon={FilterIcon}>Filters</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Customers Table */}
        <Layout.Section>
          <Card>
            <DataTable
              columnContentTypes={[
                'text',
                'text',
                'text',
                'numeric',
                'numeric',
                'text',
              ]}
              headings={[
                'Name',
                'Email',
                'Tier',
                'Store Credit',
                'Total Spent',
                'Join Date',
              ]}
              rows={rows}
            />
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