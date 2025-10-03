/**
 * Tier Products Test Page
 *
 * Test and review the complete flow of tier product purchases:
 * - Database state before/after purchase
 * - Webhook processing simulation
 * - Tier resolution behavior
 * - Conflict resolution with different tier sources
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, useLoaderData, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  Select,
  TextField,
  Banner,
  InlineStack,
  Badge,
  Divider,
  Box,
  DataTable,
  InlineGrid,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { updateCustomerToEffectiveTier, resolveEffectiveTier } from "../services/tier-resolution.server";
import { useState, useCallback } from "react";

// ============================================
// LOADER - Get test data
// ============================================

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Get all tiers
  const tiers = await db.tier.findMany({
    where: { shop },
    orderBy: { minSpend: 'asc' }
  });

  // Get all tier products
  let tierProducts = [];
  try {
    tierProducts = await (db as any).tierProduct.findMany({
      where: { shop },
      include: { tier: true },
      orderBy: { createdAt: 'desc' }
    });
    console.log(`[TestPage] Found ${tierProducts.length} tier products for shop ${shop}`);
  } catch (error) {
    console.log('[TestPage] TierProduct table query error:', error);
    // Table might not exist yet, continue with empty array
  }

  // Get test customers (or all customers)
  const customers = await db.customer.findMany({
    where: { shop },
    include: {
      currentTier: true,
      orders: {
        take: 5,
        orderBy: { createdAt: 'desc' }
      }
    },
    take: 20,
    orderBy: { createdAt: 'desc' }
  });

  return json({
    shop,
    tiers,
    tierProducts,
    customers
  });
}

// ============================================
// ACTION - Test operations
// ============================================

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    // ============================================
    // 1. SIMULATE TIER PURCHASE
    // ============================================
    if (intent === "simulate-purchase") {
      const customerId = formData.get("customerId") as string;
      const tierProductId = formData.get("tierProductId") as string;
      const orderAmount = parseFloat(formData.get("orderAmount") as string || "0");

      // Get tier product details
      const tierProduct = await (db as any).tierProduct.findFirst({
        where: { id: tierProductId, shop },
        include: { tier: true }
      });

      if (!tierProduct) {
        return json({ success: false, error: "Tier product not found" });
      }

      // Get customer before purchase
      const customerBefore = await db.customer.findFirst({
        where: { id: customerId, shop },
        include: { currentTier: true }
      });

      if (!customerBefore) {
        return json({ success: false, error: "Customer not found" });
      }

      // Calculate tier purchase duration
      const now = new Date();
      let tierEndDate: Date | null = null;

      if (tierProduct.duration) {
        tierEndDate = new Date(now);
        switch (tierProduct.duration) {
          case 'MONTHLY':
            tierEndDate.setMonth(tierEndDate.getMonth() + 1);
            break;
          case 'ANNUAL':
            tierEndDate.setFullYear(tierEndDate.getFullYear() + 1);
            break;
          case 'LIFETIME':
            tierEndDate = null;
            break;
        }
      }

      // Create TierPurchase record (simulating webhook behavior)
      const tierPurchase = await db.tierPurchase.create({
        data: {
          id: crypto.randomUUID(),
          shop,
          customerId: customerBefore.id,
          tierId: tierProduct.tierId,
          tierProductId: tierProduct.id,
          shopifyOrderId: `test-order-${Date.now()}`,
          shopifyLineItemId: `test-line-${Date.now()}`,
          purchasePrice: tierProduct.price,
          currency: tierProduct.currency || 'USD',
          startDate: now,
          endDate: tierEndDate,
          status: 'ACTIVE',
          metadata: {
            testPurchase: true,
            simulatedAt: now.toISOString()
          },
          createdAt: now,
          updatedAt: now,
        }
      });

      // Resolve effective tier (this is what the webhook does)
      const resolutionResult = await updateCustomerToEffectiveTier(
        shop,
        customerId,
        {
          triggeredBy: 'TEST_TIER_PURCHASE',
          purchaseId: tierPurchase.id
        }
      );

      // Get customer after resolution
      const customerAfter = await db.customer.findFirst({
        where: { id: customerId, shop },
        include: { currentTier: true }
      });

      // Get all tier sources
      const resolution = await resolveEffectiveTier(shop, customerId);

      return json({
        success: true,
        operation: "simulate-purchase",
        data: {
          tierPurchase: {
            id: tierPurchase.id,
            tierId: tierPurchase.tierId,
            tierName: tierProduct.tier.name,
            startDate: tierPurchase.startDate,
            endDate: tierPurchase.endDate,
            status: tierPurchase.status
          },
          customerBefore: {
            id: customerBefore.id,
            email: customerBefore.email,
            currentTierId: customerBefore.currentTierId,
            currentTierName: customerBefore.currentTier?.name || null
          },
          customerAfter: {
            id: customerAfter?.id,
            email: customerAfter?.email,
            currentTierId: customerAfter?.currentTierId,
            currentTierName: customerAfter?.currentTier?.name || null
          },
          resolution: {
            changed: resolutionResult.changed,
            source: resolutionResult.source,
            effectiveTierId: resolution.effectiveTierId,
            effectiveTierName: resolution.effectiveTierName,
            effectiveSource: resolution.effectiveSource,
            allSources: resolution.allSources.map(s => ({
              source: s.source,
              priority: s.priority,
              tierName: s.tierName,
              metadata: s.metadata
            })),
            conflictResolved: resolution.conflictResolved
          }
        }
      });
    }

    // ============================================
    // 2. CHECK TIER RESOLUTION
    // ============================================
    if (intent === "check-resolution") {
      const customerId = formData.get("customerId") as string;

      const resolution = await resolveEffectiveTier(shop, customerId);

      // Get detailed tier sources
      const customer = await db.customer.findFirst({
        where: { id: customerId, shop },
        include: { currentTier: true }
      });

      const tierPurchases = await db.tierPurchase.findMany({
        where: { customerId, shop, status: 'ACTIVE' },
        include: { tier: true }
      });

      const tierSubscriptions = await db.tierSubscription.findMany({
        where: { customerId, shop, status: 'ACTIVE' },
        include: { tier: true }
      });

      const tierChangeLogs = await db.tierChangeLog.findMany({
        where: { customerId, shop },
        orderBy: { createdAt: 'desc' },
        take: 10
      });

      return json({
        success: true,
        operation: "check-resolution",
        data: {
          customer: {
            id: customer?.id,
            email: customer?.email,
            currentTierId: customer?.currentTierId,
            currentTierName: customer?.currentTier?.name || null,
            totalSpent: customer?.totalSpent || 0,
            netSpent: customer?.netSpent || 0
          },
          resolution: {
            effectiveTierId: resolution.effectiveTierId,
            effectiveTierName: resolution.effectiveTierName,
            effectiveSource: resolution.effectiveSource,
            allSources: resolution.allSources.map(s => ({
              source: s.source,
              priority: s.priority,
              tierName: s.tierName,
              tierMinSpend: s.tierMinSpend,
              metadata: s.metadata
            })),
            conflictResolved: resolution.conflictResolved,
            resolutionReason: resolution.resolutionReason
          },
          tierPurchases: tierPurchases.map(tp => ({
            id: tp.id,
            tierName: tp.tier.name,
            startDate: tp.startDate,
            endDate: tp.endDate,
            status: tp.status
          })),
          tierSubscriptions: tierSubscriptions.map(ts => ({
            id: ts.id,
            tierName: ts.tier.name,
            status: ts.status,
            currentPeriodEnd: ts.currentPeriodEnd
          })),
          recentTierChanges: tierChangeLogs.map(log => ({
            id: log.id,
            fromTierName: log.fromTierName,
            toTierName: log.toTierName,
            changeType: log.changeType,
            triggerType: log.triggerType,
            createdAt: log.createdAt
          }))
        }
      });
    }

    // ============================================
    // 3. REVOKE TIER PURCHASE
    // ============================================
    if (intent === "revoke-purchase") {
      const purchaseId = formData.get("purchaseId") as string;

      const tierPurchase = await db.tierPurchase.findFirst({
        where: { id: purchaseId, shop }
      });

      if (!tierPurchase) {
        return json({ success: false, error: "Tier purchase not found" });
      }

      // Update status to REVOKED
      await db.tierPurchase.update({
        where: { id: purchaseId },
        data: {
          status: 'REVOKED',
          updatedAt: new Date()
        }
      });

      // Re-resolve tier
      const resolutionResult = await updateCustomerToEffectiveTier(
        shop,
        tierPurchase.customerId,
        {
          triggeredBy: 'TEST_PURCHASE_REVOKED',
          purchaseId: purchaseId
        }
      );

      return json({
        success: true,
        operation: "revoke-purchase",
        data: {
          purchaseId,
          customerId: tierPurchase.customerId,
          resolution: {
            changed: resolutionResult.changed,
            source: resolutionResult.source,
            previousTierId: resolutionResult.previousTierId,
            newTierId: resolutionResult.newTierId
          }
        }
      });
    }

    // ============================================
    // 4. CLEANUP TEST DATA
    // ============================================
    if (intent === "cleanup-test-data") {
      // Delete test tier purchases
      const deleteResult = await db.tierPurchase.deleteMany({
        where: {
          shop,
          shopifyOrderId: {
            startsWith: 'test-order-'
          }
        }
      });

      return json({
        success: true,
        operation: "cleanup-test-data",
        data: {
          deletedCount: deleteResult.count
        }
      });
    }

    return json({ success: false, error: "Unknown intent" });

  } catch (error) {
    console.error("[TierProductsTest] Error:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

// ============================================
// COMPONENT
// ============================================

export default function TierProductsTestPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();

  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [selectedTierProduct, setSelectedTierProduct] = useState("");
  const [orderAmount, setOrderAmount] = useState("50.00");
  const [activeTab, setActiveTab] = useState<"simulate" | "inspect" | "results">("simulate");

  // Customer options
  const customerOptions = data.customers.map(c => ({
    label: `${c.email} (${c.currentTier?.name || 'No tier'})`,
    value: c.id
  }));

  // Tier product options
  const tierProductOptions = data.tierProducts.map(tp => ({
    label: `${tp.tier.name} - ${tp.duration} (${tp.currency} ${tp.price})`,
    value: tp.id
  }));

  // Handle simulate purchase
  const handleSimulatePurchase = useCallback(() => {
    if (!selectedCustomer || !selectedTierProduct) {
      alert("Please select both customer and tier product");
      return;
    }

    const formData = new FormData();
    formData.append("intent", "simulate-purchase");
    formData.append("customerId", selectedCustomer);
    formData.append("tierProductId", selectedTierProduct);
    formData.append("orderAmount", orderAmount);

    submit(formData, { method: "post" });
    setActiveTab("results");
  }, [selectedCustomer, selectedTierProduct, orderAmount, submit]);

  // Handle check resolution
  const handleCheckResolution = useCallback(() => {
    if (!selectedCustomer) {
      alert("Please select a customer");
      return;
    }

    const formData = new FormData();
    formData.append("intent", "check-resolution");
    formData.append("customerId", selectedCustomer);

    submit(formData, { method: "post" });
    setActiveTab("results");
  }, [selectedCustomer, submit]);

  // Handle cleanup
  const handleCleanup = useCallback(() => {
    if (confirm("Delete all test tier purchases?")) {
      const formData = new FormData();
      formData.append("intent", "cleanup-test-data");
      submit(formData, { method: "post" });
    }
  }, [submit]);

  // Get selected customer details
  const selectedCustomerData = data.customers.find(c => c.id === selectedCustomer);

  return (
    <Page
      title="Tier Products Test Page"
      subtitle="Test and review tier product purchase behavior"
      backAction={{ url: "/app" }}
    >
      <Layout>
        {/* Instructions */}
        <Layout.Section>
          <Banner status="info">
            <p><strong>What this page does:</strong></p>
            <ul style={{ marginLeft: '20px', marginTop: '8px' }}>
              <li>Simulates tier product purchases without creating real Shopify orders</li>
              <li>Shows database state before/after purchase</li>
              <li>Displays tier resolution behavior (which tier source wins)</li>
              <li>Tests conflict resolution between manual overrides, subscriptions, purchases, and spending</li>
              <li>Allows inspection of all tier sources for a customer</li>
            </ul>
          </Banner>
        </Layout.Section>

        {/* Tab Navigation */}
        <Layout.Section>
          <Card>
            <InlineStack gap="200">
              <Button
                pressed={activeTab === "simulate"}
                onClick={() => setActiveTab("simulate")}
              >
                Simulate Purchase
              </Button>
              <Button
                pressed={activeTab === "inspect"}
                onClick={() => setActiveTab("inspect")}
              >
                Inspect Customer
              </Button>
              <Button
                pressed={activeTab === "results"}
                onClick={() => setActiveTab("results")}
                disabled={!actionData}
              >
                View Results
              </Button>
            </InlineStack>
          </Card>
        </Layout.Section>

        {/* Simulate Purchase Tab */}
        {activeTab === "simulate" && (
          <Layout.Section>
            <Layout>
              <Layout.Section variant="oneHalf">
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">Purchase Simulation</Text>

                    <Select
                      label="Select Customer"
                      options={[
                        { label: "Select a customer...", value: "" },
                        ...customerOptions
                      ]}
                      value={selectedCustomer}
                      onChange={setSelectedCustomer}
                    />

                    <Select
                      label="Select Tier Product"
                      options={[
                        { label: "Select a tier product...", value: "" },
                        ...tierProductOptions
                      ]}
                      value={selectedTierProduct}
                      onChange={setSelectedTierProduct}
                    />

                    <TextField
                      label="Order Total Amount"
                      type="number"
                      value={orderAmount}
                      onChange={setOrderAmount}
                      prefix="$"
                      autoComplete="off"
                      helpText="Used for spending-based tier calculation"
                    />

                    <InlineStack gap="200">
                      <Button
                        variant="primary"
                        onClick={handleSimulatePurchase}
                        disabled={!selectedCustomer || !selectedTierProduct}
                      >
                        Simulate Purchase
                      </Button>
                      <Button onClick={handleCheckResolution} disabled={!selectedCustomer}>
                        Check Resolution
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Card>
              </Layout.Section>

              <Layout.Section variant="oneHalf">
                {selectedCustomerData && (
                  <Card>
                    <BlockStack gap="400">
                      <Text variant="headingMd" as="h2">Customer Details</Text>

                      <BlockStack gap="200">
                        <Text variant="bodyMd" as="p">
                          <strong>Email:</strong> {selectedCustomerData.email}
                        </Text>
                        <Text variant="bodyMd" as="p">
                          <strong>Current Tier:</strong>{" "}
                          {selectedCustomerData.currentTier ? (
                            <Badge tone="success">{selectedCustomerData.currentTier.name}</Badge>
                          ) : (
                            <Badge>No tier</Badge>
                          )}
                        </Text>
                        <Text variant="bodyMd" as="p">
                          <strong>Total Spent:</strong> ${selectedCustomerData.totalSpent?.toFixed(2) || '0.00'}
                        </Text>
                        <Text variant="bodyMd" as="p">
                          <strong>Recent Orders:</strong> {selectedCustomerData.orders.length}
                        </Text>
                      </BlockStack>
                    </BlockStack>
                  </Card>
                )}
              </Layout.Section>
            </Layout>
          </Layout.Section>
        )}

        {/* Inspect Customer Tab */}
        {activeTab === "inspect" && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Customer Inspection</Text>

                <Select
                  label="Select Customer"
                  options={[
                    { label: "Select a customer...", value: "" },
                    ...customerOptions
                  ]}
                  value={selectedCustomer}
                  onChange={setSelectedCustomer}
                />

                <Button variant="primary" onClick={handleCheckResolution} disabled={!selectedCustomer}>
                  Inspect Tier Sources
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* Results Tab */}
        {activeTab === "results" && actionData && (
          <Layout.Section>
            <BlockStack gap="400">
              {/* Success/Error Banner */}
              {actionData.success ? (
                <Banner status="success">
                  <p>Operation completed: <strong>{actionData.operation}</strong></p>
                </Banner>
              ) : (
                <Banner status="critical">
                  <p>Error: {actionData.error}</p>
                </Banner>
              )}

              {/* Purchase Simulation Results */}
              {actionData.success && actionData.operation === "simulate-purchase" && actionData.data && (
                <>
                  {/* Tier Purchase Created */}
                  <Card>
                    <BlockStack gap="300">
                      <Text variant="headingMd" as="h2">✅ Tier Purchase Created</Text>
                      <Divider />

                      <InlineGrid columns={2} gap="400">
                        <Box>
                          <BlockStack gap="200">
                            <Text variant="bodyMd" as="p"><strong>Purchase ID:</strong></Text>
                            <Text variant="bodyMd" as="p" tone="subdued">{actionData.data.tierPurchase.id}</Text>
                          </BlockStack>
                        </Box>
                        <Box>
                          <BlockStack gap="200">
                            <Text variant="bodyMd" as="p"><strong>Tier:</strong></Text>
                            <Badge tone="info">{actionData.data.tierPurchase.tierName}</Badge>
                          </BlockStack>
                        </Box>
                        <Box>
                          <BlockStack gap="200">
                            <Text variant="bodyMd" as="p"><strong>Start Date:</strong></Text>
                            <Text variant="bodyMd" as="p" tone="subdued">
                              {new Date(actionData.data.tierPurchase.startDate).toLocaleDateString()}
                            </Text>
                          </BlockStack>
                        </Box>
                        <Box>
                          <BlockStack gap="200">
                            <Text variant="bodyMd" as="p"><strong>End Date:</strong></Text>
                            <Text variant="bodyMd" as="p" tone="subdued">
                              {actionData.data.tierPurchase.endDate
                                ? new Date(actionData.data.tierPurchase.endDate).toLocaleDateString()
                                : "LIFETIME"}
                            </Text>
                          </BlockStack>
                        </Box>
                      </InlineGrid>
                    </BlockStack>
                  </Card>

                  {/* Customer State Comparison */}
                  <Card>
                    <BlockStack gap="300">
                      <Text variant="headingMd" as="h2">Customer State: Before → After</Text>
                      <Divider />

                      <InlineGrid columns={2} gap="400">
                        <Box>
                          <BlockStack gap="300">
                            <Text variant="headingSm" as="h3">Before Purchase</Text>
                            <BlockStack gap="200">
                              <Text variant="bodyMd" as="p">
                                <strong>Current Tier:</strong>{" "}
                                {actionData.data.customerBefore.currentTierName ? (
                                  <Badge>{actionData.data.customerBefore.currentTierName}</Badge>
                                ) : (
                                  <Badge tone="critical">No tier</Badge>
                                )}
                              </Text>
                            </BlockStack>
                          </BlockStack>
                        </Box>
                        <Box>
                          <BlockStack gap="300">
                            <Text variant="headingSm" as="h3">After Purchase</Text>
                            <BlockStack gap="200">
                              <Text variant="bodyMd" as="p">
                                <strong>Current Tier:</strong>{" "}
                                {actionData.data.customerAfter.currentTierName ? (
                                  <Badge tone="success">{actionData.data.customerAfter.currentTierName}</Badge>
                                ) : (
                                  <Badge tone="critical">No tier</Badge>
                                )}
                              </Text>
                            </BlockStack>
                          </BlockStack>
                        </Box>
                      </InlineGrid>
                    </BlockStack>
                  </Card>

                  {/* Tier Resolution Details */}
                  <Card>
                    <BlockStack gap="400">
                      <Text variant="headingMd" as="h2">🎯 Tier Resolution Analysis</Text>
                      <Divider />

                      <BlockStack gap="300">
                        <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                          <BlockStack gap="200">
                            <Text variant="bodyMd" as="p">
                              <strong>Resolution Result:</strong>{" "}
                              {actionData.data.resolution.changed ? (
                                <Badge tone="success">Tier Changed</Badge>
                              ) : (
                                <Badge tone="attention">No Change</Badge>
                              )}
                            </Text>
                            <Text variant="bodyMd" as="p">
                              <strong>Effective Source:</strong>{" "}
                              <Badge tone="info">{actionData.data.resolution.effectiveSource}</Badge>
                            </Text>
                            <Text variant="bodyMd" as="p">
                              <strong>Effective Tier:</strong> {actionData.data.resolution.effectiveTierName || "None"}
                            </Text>
                            <Text variant="bodyMd" as="p">
                              <strong>Conflict Resolved:</strong>{" "}
                              {actionData.data.resolution.conflictResolved ? "Yes (multiple sources detected)" : "No (single source)"}
                            </Text>
                          </BlockStack>
                        </Box>

                        <Text variant="headingSm" as="h3">All Tier Sources (Priority Order)</Text>
                        <DataTable
                          columnContentTypes={["text", "numeric", "text", "text"]}
                          headings={["Source", "Priority", "Tier", "Metadata"]}
                          rows={actionData.data.resolution.allSources.map((source: any) => [
                            source.source === actionData.data.resolution.effectiveSource ? (
                              <Badge tone="success">{source.source} ⭐</Badge>
                            ) : (
                              source.source
                            ),
                            source.priority,
                            source.tierName || "N/A",
                            JSON.stringify(source.metadata || {}, null, 2).substring(0, 50) + "..."
                          ])}
                        />
                      </BlockStack>
                    </BlockStack>
                  </Card>
                </>
              )}

              {/* Resolution Check Results */}
              {actionData.success && actionData.operation === "check-resolution" && actionData.data && (
                <>
                  {/* Customer Overview */}
                  <Card>
                    <BlockStack gap="300">
                      <Text variant="headingMd" as="h2">Customer Overview</Text>
                      <Divider />

                      <InlineGrid columns={2} gap="400">
                        <Box>
                          <BlockStack gap="200">
                            <Text variant="bodyMd" as="p"><strong>Email:</strong></Text>
                            <Text variant="bodyMd" as="p">{actionData.data.customer.email}</Text>
                          </BlockStack>
                        </Box>
                        <Box>
                          <BlockStack gap="200">
                            <Text variant="bodyMd" as="p"><strong>Current Tier:</strong></Text>
                            {actionData.data.customer.currentTierName ? (
                              <Badge tone="success">{actionData.data.customer.currentTierName}</Badge>
                            ) : (
                              <Badge>No tier</Badge>
                            )}
                          </BlockStack>
                        </Box>
                        <Box>
                          <BlockStack gap="200">
                            <Text variant="bodyMd" as="p"><strong>Total Spent:</strong></Text>
                            <Text variant="bodyMd" as="p">${actionData.data.customer.totalSpent.toFixed(2)}</Text>
                          </BlockStack>
                        </Box>
                        <Box>
                          <BlockStack gap="200">
                            <Text variant="bodyMd" as="p"><strong>Net Spent:</strong></Text>
                            <Text variant="bodyMd" as="p">${actionData.data.customer.netSpent.toFixed(2)}</Text>
                          </BlockStack>
                        </Box>
                      </InlineGrid>
                    </BlockStack>
                  </Card>

                  {/* Resolution Details */}
                  <Card>
                    <BlockStack gap="400">
                      <Text variant="headingMd" as="h2">🎯 Current Tier Resolution</Text>
                      <Divider />

                      <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                        <BlockStack gap="200">
                          <Text variant="bodyMd" as="p">
                            <strong>Effective Tier:</strong> {actionData.data.resolution.effectiveTierName || "None"}
                          </Text>
                          <Text variant="bodyMd" as="p">
                            <strong>Source:</strong>{" "}
                            <Badge tone="info">{actionData.data.resolution.effectiveSource}</Badge>
                          </Text>
                          <Text variant="bodyMd" as="p">
                            <strong>Conflict Resolved:</strong>{" "}
                            {actionData.data.resolution.conflictResolved ? "Yes" : "No"}
                          </Text>
                          {actionData.data.resolution.resolutionReason && (
                            <Text variant="bodyMd" as="p">
                              <strong>Reason:</strong> {actionData.data.resolution.resolutionReason}
                            </Text>
                          )}
                        </BlockStack>
                      </Box>

                      <Text variant="headingSm" as="h3">All Tier Sources</Text>
                      <DataTable
                        columnContentTypes={["text", "numeric", "text", "numeric"]}
                        headings={["Source", "Priority", "Tier", "Min Spend"]}
                        rows={actionData.data.resolution.allSources.map((source: any) => [
                          source.source === actionData.data.resolution.effectiveSource ? (
                            <Badge tone="success">{source.source} ⭐</Badge>
                          ) : (
                            source.source
                          ),
                          source.priority,
                          source.tierName || "N/A",
                          `$${source.tierMinSpend.toFixed(2)}`
                        ])}
                      />
                    </BlockStack>
                  </Card>

                  {/* Active Tier Purchases */}
                  {actionData.data.tierPurchases.length > 0 && (
                    <Card>
                      <BlockStack gap="300">
                        <Text variant="headingMd" as="h2">🛒 Active Tier Purchases</Text>
                        <Divider />

                        <DataTable
                          columnContentTypes={["text", "text", "text", "text"]}
                          headings={["Tier", "Start Date", "End Date", "Status"]}
                          rows={actionData.data.tierPurchases.map((tp: any) => [
                            tp.tierName,
                            new Date(tp.startDate).toLocaleDateString(),
                            tp.endDate ? new Date(tp.endDate).toLocaleDateString() : "LIFETIME",
                            <Badge tone="success">{tp.status}</Badge>
                          ])}
                        />
                      </BlockStack>
                    </Card>
                  )}

                  {/* Active Tier Subscriptions */}
                  {actionData.data.tierSubscriptions.length > 0 && (
                    <Card>
                      <BlockStack gap="300">
                        <Text variant="headingMd" as="h2">🔄 Active Tier Subscriptions</Text>
                        <Divider />

                        <DataTable
                          columnContentTypes={["text", "text", "text"]}
                          headings={["Tier", "Period End", "Status"]}
                          rows={actionData.data.tierSubscriptions.map((ts: any) => [
                            ts.tierName,
                            new Date(ts.currentPeriodEnd).toLocaleDateString(),
                            <Badge tone="info">{ts.status}</Badge>
                          ])}
                        />
                      </BlockStack>
                    </Card>
                  )}

                  {/* Recent Tier Changes */}
                  <Card>
                    <BlockStack gap="300">
                      <Text variant="headingMd" as="h2">📜 Recent Tier Changes</Text>
                      <Divider />

                      <DataTable
                        columnContentTypes={["text", "text", "text", "text", "text"]}
                        headings={["From", "To", "Type", "Trigger", "Date"]}
                        rows={actionData.data.recentTierChanges.map((log: any) => [
                          log.fromTierName || "None",
                          log.toTierName || "None",
                          log.changeType,
                          log.triggerType,
                          new Date(log.createdAt).toLocaleDateString()
                        ])}
                      />
                    </BlockStack>
                  </Card>
                </>
              )}

              {/* Cleanup Results */}
              {actionData.success && actionData.operation === "cleanup-test-data" && (
                <Card>
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h2">🧹 Cleanup Complete</Text>
                    <Divider />
                    <Text variant="bodyMd" as="p">
                      Deleted <strong>{actionData.data?.deletedCount}</strong> test tier purchases
                    </Text>
                  </BlockStack>
                </Card>
              )}
            </BlockStack>
          </Layout.Section>
        )}

        {/* Cleanup Section */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">🧹 Cleanup</Text>
              <Text variant="bodyMd" as="p" tone="subdued">
                Remove all test tier purchases created by this page
              </Text>
              <Button tone="critical" onClick={handleCleanup}>
                Delete Test Data
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Available Tier Products */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Available Tier Products</Text>
              <Divider />

              {data.tierProducts.length > 0 ? (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text"]}
                  headings={["Tier", "Duration", "Price", "Type"]}
                  rows={data.tierProducts.map(tp => [
                    tp.tier.name,
                    tp.duration,
                    `${tp.currency} ${tp.price}`,
                    tp.hasSubscription ? "Subscription" : "One-time"
                  ])}
                />
              ) : (
                <Text variant="bodyMd" as="p" tone="subdued">
                  No tier products found. Create one first in the Tier Products page.
                </Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
