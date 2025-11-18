import { json } from "@remix-run/node";
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
  List
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { useState, useCallback, useEffect } from "react";

/**
 * Enhanced customer sync function that fetches full customer data including spending
 * and assigns proper tiers based on total spent
 */
async function syncCustomersWithFullData(shop: string, admin: any) {
  console.log(`[Customer Sync] Starting full customer sync for shop: ${shop}`);

  const customersQuery = `
    query getCustomers($first: Int!, $after: String) {
      customers(first: $first, after: $after) {
        edges {
          cursor
          node {
            id
            email
            firstName
            lastName
            displayName
            createdAt
            updatedAt
            amountSpent {
              amount
              currencyCode
            }
            numberOfOrders
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  let hasNextPage = true;
  let cursor = null;
  let totalProcessed = 0;
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalErrors = 0;
  let totalSkipped = 0;

  // Get all tiers for this shop
  const tiers = await db.tier.findMany({
    where: { shopDomain: shop },
    orderBy: { minSpend: 'desc' } // Highest tier first
  });

  if (tiers.length === 0) {
    throw new Error("No tiers found for shop. Please create tiers first.");
  }

  console.log(`[Customer Sync] Found ${tiers.length} tiers for shop`);

  while (hasNextPage) {
    const response = await admin.graphql(customersQuery, {
      variables: {
        first: 100, // Process 100 customers per batch
        after: cursor,
      },
    });

    const result = await response.json() as any;

    if (result.errors) {
      console.error("[Customer Sync] GraphQL errors:", result.errors);
      throw new Error("GraphQL query failed: " + JSON.stringify(result.errors));
    }

    const customers = result.data.customers;

    // Process each customer
    for (const edge of customers.edges) {
      const shopifyCustomer = edge.node;
      const shopifyId = shopifyCustomer.id.split('/').pop();

      try {
        totalProcessed++;

        // Skip customers without email (guest checkouts)
        if (!shopifyCustomer.email) {
          console.log(`[Customer Sync] Skipping customer ${shopifyId} - no email`);
          totalSkipped++;
          continue;
        }

        // Parse spending amount
        const totalSpent = parseFloat(shopifyCustomer.amountSpent?.amount || '0');
        const ordersCount = shopifyCustomer.numberOfOrders || 0;

        // Determine appropriate tier based on spending
        let assignedTier = tiers[tiers.length - 1]; // Default to lowest tier
        for (const tier of tiers) {
          if (totalSpent >= parseFloat(tier.minSpend.toString())) {
            assignedTier = tier;
            break;
          }
        }

        // Check if customer already exists
        const existingCustomer = await db.customer.findFirst({
          where: {
            shopDomain: shop,
            shopifyCustomerId: shopifyId,
          },
          include: {
            membershipHistory: {
              where: { isActive: true },
              include: { tier: true }
            }
          }
        });

        if (!existingCustomer) {
          // Create new customer with full data
          const newCustomer = await db.customer.create({
            data: {
              shopDomain: shop,
              shopifyCustomerId: shopifyId,
              email: shopifyCustomer.email,
              firstName: shopifyCustomer.firstName || '',
              lastName: shopifyCustomer.lastName || '',
              totalSpent: totalSpent,
              ordersCount: ordersCount,
              storeCredit: 0, // Default store credit
              totalEarned: 0,
              totalCashbackEarned: 0,
            },
          });

          // Assign tier via membership history
          await db.membershipHistory.create({
            data: {
              customerId: newCustomer.id,
              tierId: assignedTier.id,
              isActive: true,
            }
          });

          totalCreated++;
          console.log(
            `[Customer Sync] Created customer ${shopifyId} (${shopifyCustomer.email}) ` +
            `with tier ${assignedTier.name} (spent: $${totalSpent})`
          );
        } else {
          // Update existing customer with real Shopify data
          const updates: any = {
            email: shopifyCustomer.email,
            firstName: shopifyCustomer.firstName || existingCustomer.firstName,
            lastName: shopifyCustomer.lastName || existingCustomer.lastName,
            totalSpent: totalSpent,
            ordersCount: ordersCount,
            updatedAt: new Date(),
          };

          await db.customer.update({
            where: { id: existingCustomer.id },
            data: updates,
          });

          // Check if tier needs updating
          const currentTier = existingCustomer.membershipHistory[0]?.tier;
          const needsTierUpdate = !currentTier || currentTier.id !== assignedTier.id;

          if (needsTierUpdate) {
            // Deactivate old memberships
            if (currentTier) {
              await db.membershipHistory.updateMany({
                where: {
                  customerId: existingCustomer.id,
                  isActive: true,
                },
                data: { isActive: false },
              });
            }

            // Create new membership with correct tier
            await db.membershipHistory.create({
              data: {
                customerId: existingCustomer.id,
                tierId: assignedTier.id,
                isActive: true,
              }
            });

            console.log(
              `[Customer Sync] Updated customer ${shopifyId} - ` +
              `tier changed from ${currentTier?.name || 'none'} to ${assignedTier.name}`
            );
          }

          totalUpdated++;
        }
      } catch (customerError) {
        console.error(`[Customer Sync] Error processing customer ${shopifyId}:`, customerError);
        totalErrors++;
      }
    }

    hasNextPage = customers.pageInfo.hasNextPage;
    cursor = customers.pageInfo.endCursor;

    console.log(
      `[Customer Sync] Progress - Processed: ${totalProcessed}, ` +
      `Created: ${totalCreated}, Updated: ${totalUpdated}, ` +
      `Skipped: ${totalSkipped}, Errors: ${totalErrors}`
    );
  }

  return {
    success: true,
    totalProcessed,
    totalCreated,
    totalUpdated,
    totalSkipped,
    totalErrors,
    message: `Sync completed: ${totalCreated} created, ${totalUpdated} updated, ${totalSkipped} skipped, ${totalErrors} errors`
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  // Get current customer statistics
  const customerStats = await db.customer.aggregate({
    where: { shopDomain: session.shop },
    _count: { id: true },
  });

  // Count customers with placeholder emails
  const placeholderCount = await db.customer.count({
    where: {
      shopDomain: session.shop,
      email: {
        contains: 'placeholder'
      }
    }
  });

  // Count customers with 'customer' prefix (another placeholder pattern)
  const customerPrefixCount = await db.customer.count({
    where: {
      shopDomain: session.shop,
      email: {
        startsWith: 'customer'
      }
    }
  });

  // Get tier count
  const tierCount = await db.tier.count({
    where: { shopDomain: session.shop }
  });

  // Check sync status
  const shopSettings = await db.shopSettings.findUnique({
    where: { shop: session.shop }
  });

  return json({
    shop: session.shop,
    stats: {
      totalCustomers: customerStats._count.id || 0,
      placeholderCustomers: placeholderCount + customerPrefixCount,
      tierCount: tierCount,
    },
    syncInProgress: shopSettings?.customersSyncInProgress || false,
    lastSyncDate: shopSettings?.updatedAt,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "sync_customers") {
    try {
      // Mark sync as in progress
      await db.shopSettings.upsert({
        where: { shop: session.shop },
        create: {
          shop: session.shop,
          storeName: session.shop,
          storeUrl: `https://${session.shop}`,
          customersSyncInProgress: true,
          customersInitialSynced: false,
        },
        update: {
          customersSyncInProgress: true,
          updatedAt: new Date(),
        },
      });

      // Run sync
      const result = await syncCustomersWithFullData(session.shop, admin);

      // Mark sync as completed
      await db.shopSettings.update({
        where: { shop: session.shop },
        data: {
          customersInitialSynced: true,
          customersSyncInProgress: false,
          updatedAt: new Date(),
        },
      });

      return json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error("Failed to sync customers:", error);

      // Mark sync as failed
      await db.shopSettings.update({
        where: { shop: session.shop },
        data: {
          customersSyncInProgress: false,
        },
      }).catch(console.error);

      return json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to sync customers"
      }, { status: 500 });
    }
  }

  return json({ success: false, error: "Invalid action" }, { status: 400 });
}

export default function CustomersSyncPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);

  const isLoading = navigation.state !== "idle" || isSyncing;

  const handleSyncCustomers = useCallback(() => {
    const confirmMessage = data.stats.totalCustomers > 0
      ? `This will sync all customers from Shopify and update ${data.stats.placeholderCustomers} customers with placeholder data. Continue?`
      : "This will import all customers from Shopify. Continue?";

    if (window.confirm(confirmMessage)) {
      setIsSyncing(true);
      setSyncProgress(0);

      const formData = new FormData();
      formData.set("action", "sync_customers");
      submit(formData, { method: "post" });

      // Simulate progress
      const interval = setInterval(() => {
        setSyncProgress(prev => {
          if (prev >= 90) {
            clearInterval(interval);
            return 90;
          }
          return prev + 10;
        });
      }, 3000);
    }
  }, [submit, data.stats]);

  useEffect(() => {
    if (navigation.state === "idle" && isSyncing && actionData) {
      // Sync completed
      setSyncProgress(100);
      setTimeout(() => {
        setIsSyncing(false);
        setSyncProgress(0);
        // Reload page to update stats
        window.location.reload();
      }, 2000);
    }
  }, [navigation.state, isSyncing, actionData]);

  return (
    <Page
      title="Customer Sync"
      subtitle="Import and update customer data from Shopify"
      backAction={{ url: "/app/customers" }}
      primaryAction={{
        content: "Sync Customers",
        onAction: handleSyncCustomers,
        disabled: isLoading || data.syncInProgress || data.stats.tierCount === 0,
        loading: isLoading
      }}
    >
      <BlockStack gap="400">
        {/* Tier Warning */}
        {data.stats.tierCount === 0 && (
          <Banner title="No Tiers Found" tone="critical">
            <Text as="p">
              You must create at least one tier before syncing customers. Customers are automatically
              assigned tiers based on their total spending.
            </Text>
          </Banner>
        )}

        {/* Success Message */}
        {actionData && actionData.success && (
          <Banner title="Sync Completed Successfully" tone="success">
            <Text as="p">{actionData.message}</Text>
            <List type="bullet">
              <List.Item>Customers Created: {actionData.totalCreated}</List.Item>
              <List.Item>Customers Updated: {actionData.totalUpdated}</List.Item>
              <List.Item>Customers Skipped (no email): {actionData.totalSkipped}</List.Item>
              {actionData.totalErrors > 0 && (
                <List.Item>Errors: {actionData.totalErrors}</List.Item>
              )}
            </List>
          </Banner>
        )}

        {/* Error Message */}
        {actionData && !actionData.success && (
          <Banner title="Sync Failed" tone="critical">
            <Text as="p">{actionData.error}</Text>
          </Banner>
        )}

        {/* Current Statistics */}
        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Current Statistics</Text>

              <InlineStack gap="800" wrap>
                <BlockStack gap="200">
                  <Text as="span" tone="subdued">Total Customers</Text>
                  <Text as="p" variant="headingLg">{data.stats.totalCustomers.toLocaleString()}</Text>
                </BlockStack>

                <BlockStack gap="200">
                  <Text as="span" tone="subdued">Placeholder Data</Text>
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="p" variant="headingLg">{data.stats.placeholderCustomers.toLocaleString()}</Text>
                    {data.stats.placeholderCustomers > 0 && (
                      <Badge tone="warning">Needs Sync</Badge>
                    )}
                  </InlineStack>
                </BlockStack>

                <BlockStack gap="200">
                  <Text as="span" tone="subdued">Tiers Configured</Text>
                  <Text as="p" variant="headingLg">{data.stats.tierCount}</Text>
                </BlockStack>

                {data.lastSyncDate && (
                  <BlockStack gap="200">
                    <Text as="span" tone="subdued">Last Sync</Text>
                    <Text as="p" variant="bodyMd">
                      {new Date(data.lastSyncDate).toLocaleString()}
                    </Text>
                  </BlockStack>
                )}
              </InlineStack>
            </BlockStack>
          </Box>
        </Card>

        {/* Sync Progress */}
        {isSyncing && (
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Sync Progress</Text>
                <ProgressBar progress={syncProgress} tone="primary" />
                <Text as="p" tone="subdued">
                  Syncing customers... This may take several minutes depending on customer count.
                </Text>
              </BlockStack>
            </Box>
          </Card>
        )}

        {/* What Gets Synced */}
        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">What Gets Synced</Text>

              <List type="bullet">
                <List.Item>
                  <strong>Customer Data:</strong> Email, first name, last name, total spent, order count
                </List.Item>
                <List.Item>
                  <strong>Tier Assignment:</strong> Automatically assigns appropriate tier based on total spending
                </List.Item>
                <List.Item>
                  <strong>Existing Customers:</strong> Updates placeholder emails with real Shopify data
                </List.Item>
                <List.Item>
                  <strong>Store Credit:</strong> Preserves existing store credit and cashback amounts
                </List.Item>
                <List.Item>
                  <strong>Guest Checkouts:</strong> Skips customers without email addresses
                </List.Item>
              </List>

              <Banner title="Important Notes" tone="info">
                <List type="bullet">
                  <List.Item>Sync time depends on customer count (typically 2-10 minutes)</List.Item>
                  <List.Item>Existing customers are updated, not duplicated</List.Item>
                  <List.Item>Store credit and cashback amounts are preserved during updates</List.Item>
                  <List.Item>Tiers are automatically recalculated based on current spending</List.Item>
                  <List.Item>After initial sync, new customers are tracked via webhooks</List.Item>
                </List>
              </Banner>
            </BlockStack>
          </Box>
        </Card>

        {/* Common Issues */}
        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Troubleshooting</Text>

              <BlockStack gap="300">
                <Box>
                  <Text as="p" fontWeight="semibold">Widget showing wrong tier/credit?</Text>
                  <Text as="p" tone="subdued">
                    Run this sync to update customers with real Shopify data. The widget will then
                    display correct information from the database.
                  </Text>
                </Box>

                <Box>
                  <Text as="p" fontWeight="semibold">Placeholder emails in database?</Text>
                  <Text as="p" tone="subdued">
                    This happens when customers visit your store before webhooks are configured.
                    This sync will replace placeholder emails with real data.
                  </Text>
                </Box>

                <Box>
                  <Text as="p" fontWeight="semibold">Sync taking too long?</Text>
                  <Text as="p" tone="subdued">
                    The sync processes customers in batches to respect Shopify API limits. For stores
                    with 10,000+ customers, this may take 10-15 minutes.
                  </Text>
                </Box>
              </BlockStack>
            </BlockStack>
          </Box>
        </Card>
      </BlockStack>
    </Page>
  );
}
