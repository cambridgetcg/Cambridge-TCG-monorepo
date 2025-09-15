/**
 * Subscription Testing Page
 * Tools for testing subscription functionality
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  Box,
  Text,
  BlockStack,
  InlineStack,
  Banner,
  FormLayout,
  Select,
  Badge,
  CalloutCard,
  List,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";
import { useState, useCallback } from "react";
import { v4 as uuidv4 } from 'crypto';
import { SubscriptionContractService } from "~/services/subscription/subscription-contract.server";
import { BillingScheduler } from "~/services/subscription/billing-scheduler.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  // Check if in development mode
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Get test data
  const [customers, tiers, subscriptions, sellingPlans] = await Promise.all([
    db.customer.findMany({
      where: { shop: session.shop },
      take: 10,
      orderBy: { createdAt: 'desc' },
    }),
    db.tier.findMany({
      where: { shop: session.shop, monthlyPrice: { not: null } },
      orderBy: { minSpend: 'asc' },
    }),
    db.tierSubscription.findMany({
      where: { shop: session.shop },
      include: {
        customer: true,
        tier: true,
        billingAttempts: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
    }),
    db.sellingPlan.findMany({
      where: { 
        sellingPlanGroup: { shop: session.shop },
      },
      include: { sellingPlanGroup: true },
    }),
  ]);

  return json({
    isDevelopment,
    customers: customers.map(c => ({
      id: c.id,
      email: c.email,
      name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.email,
      hasSubscription: !!c.currentSubscriptionId,
    })),
    tiers: tiers.map(t => ({
      id: t.id,
      name: t.name,
      monthlyPrice: t.monthlyPrice?.toNumber() || 0,
    })),
    subscriptions: subscriptions.map(s => ({
      id: s.id,
      customerEmail: s.customer.email,
      tierName: s.tier.name,
      status: s.status,
      nextBillingDate: s.nextBillingDate?.toISOString(),
      billingAttempts: s.billingAttempts.map(ba => ({
        date: ba.billingDate.toISOString(),
        status: ba.status,
        amount: ba.amount.toNumber(),
        error: ba.errorMessage,
      })),
    })),
    sellingPlans: sellingPlans.map(sp => ({
      id: sp.id,
      name: sp.name,
      shopifyId: sp.shopifySellingPlanId,
      interval: sp.billingInterval,
    })),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const action = formData.get("action");

  try {
    switch (action) {
      case "create-test-subscription": {
        const customerId = formData.get("customerId") as string;
        const tierId = formData.get("tierId") as string;
        const sellingPlanId = formData.get("sellingPlanId") as string;
        
        // Create a test subscription record (without Shopify integration)
        const customer = await db.customer.findUnique({ where: { id: customerId } });
        const tier = await db.tier.findUnique({ where: { id: tierId } });
        
        if (!customer || !tier) {
          return json({ success: false, error: "Customer or tier not found" });
        }

        const subscription = await db.tierSubscription.create({
          data: {
            id: uuidv4(),
            shop: session.shop,
            customerId,
            tierId,
            subscriptionContractId: `test-${uuidv4()}`,
            sellingPlanId: sellingPlanId || `test-plan-${uuidv4()}`,
            status: 'ACTIVE',
            billingInterval: 'MONTHLY',
            nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            discountPercentage: 0,
            monthlyPrice: tier.monthlyPrice || 0,
            activatedAt: new Date(),
            metadata: { isTest: true },
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

        return json({ 
          success: true, 
          message: "Test subscription created",
          subscriptionId: subscription.id,
        });
      }

      case "simulate-billing": {
        const subscriptionId = formData.get("subscriptionId") as string;
        const success = formData.get("success") === "true";
        
        const subscription = await db.tierSubscription.findUnique({
          where: { id: subscriptionId },
        });
        
        if (!subscription) {
          return json({ success: false, error: "Subscription not found" });
        }

        // Create billing attempt
        const idempotencyKey = `test-${subscriptionId}-${Date.now()}`;
        await db.subscriptionBillingAttempt.create({
          data: {
            id: uuidv4(),
            subscriptionId,
            idempotencyKey,
            status: success ? 'SUCCESS' : 'FAILED',
            amount: subscription.monthlyPrice || 0,
            currency: 'USD',
            billingDate: new Date(),
            attemptNumber: subscription.failureCount + 1,
            errorMessage: success ? null : 'Test payment failure',
            processedAt: new Date(),
            metadata: { isTest: true },
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

        // Update subscription
        if (success) {
          const nextBillingDate = new Date();
          nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
          
          await db.tierSubscription.update({
            where: { id: subscriptionId },
            data: {
              lastBillingDate: new Date(),
              nextBillingDate,
              failureCount: 0,
              updatedAt: new Date(),
            },
          });
        } else {
          await db.tierSubscription.update({
            where: { id: subscriptionId },
            data: {
              failureCount: subscription.failureCount + 1,
              lastFailureReason: 'Test payment failure',
              updatedAt: new Date(),
            },
          });
        }

        return json({ 
          success: true, 
          message: `Simulated ${success ? 'successful' : 'failed'} billing`,
        });
      }

      case "process-due-billings": {
        const results = await BillingScheduler.processDueBillings(admin, session.shop);
        return json({ 
          success: true, 
          message: `Processed ${results.length} subscriptions`,
          results,
        });
      }

      case "check-health": {
        await BillingScheduler.checkSubscriptionHealth(session.shop);
        return json({ 
          success: true, 
          message: "Health check completed",
        });
      }

      case "delete-test-subscription": {
        const subscriptionId = formData.get("subscriptionId") as string;
        
        await db.tierSubscription.delete({
          where: { id: subscriptionId },
        });

        return json({ 
          success: true, 
          message: "Test subscription deleted",
        });
      }

      default:
        return json({ success: false, error: "Invalid action" }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Test action error:', error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
};

export default function SubscriptionTest() {
  const { isDevelopment, customers, tiers, subscriptions, sellingPlans } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [selectedTier, setSelectedTier] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("");
  const [selectedSubscription, setSelectedSubscription] = useState("");

  const isLoading = navigation.state !== "idle";

  const handleCreateTestSubscription = useCallback(() => {
    if (!selectedCustomer || !selectedTier) {
      alert("Please select a customer and tier");
      return;
    }

    const formData = new FormData();
    formData.append("action", "create-test-subscription");
    formData.append("customerId", selectedCustomer);
    formData.append("tierId", selectedTier);
    if (selectedPlan) {
      formData.append("sellingPlanId", selectedPlan);
    }
    submit(formData, { method: "post" });
  }, [selectedCustomer, selectedTier, selectedPlan, submit]);

  const handleSimulateBilling = useCallback((success: boolean) => {
    if (!selectedSubscription) {
      alert("Please select a subscription");
      return;
    }

    const formData = new FormData();
    formData.append("action", "simulate-billing");
    formData.append("subscriptionId", selectedSubscription);
    formData.append("success", success.toString());
    submit(formData, { method: "post" });
  }, [selectedSubscription, submit]);

  const handleProcessBillings = useCallback(() => {
    const formData = new FormData();
    formData.append("action", "process-due-billings");
    submit(formData, { method: "post" });
  }, [submit]);

  const handleHealthCheck = useCallback(() => {
    const formData = new FormData();
    formData.append("action", "check-health");
    submit(formData, { method: "post" });
  }, [submit]);

  if (!isDevelopment) {
    return (
      <Page title="Subscription Testing" backAction={{ url: "/app/subscriptions" }}>
        <Layout>
          <Layout.Section>
            <Banner tone="warning" title="Testing Disabled">
              <p>Subscription testing is only available in development mode.</p>
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page
      title="Subscription Testing"
      subtitle="Test subscription functionality"
      backAction={{ url: "/app/subscriptions" }}
    >
      <Layout>
        <Layout.Section>
          <Banner tone="info" title="Testing Mode">
            <p>
              These tools are for testing subscription functionality. 
              Test subscriptions are marked and can be deleted after testing.
            </p>
          </Banner>
        </Layout.Section>

        {/* Create Test Subscription */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg">Create Test Subscription</Text>
                
                <FormLayout>
                  <Select
                    label="Customer"
                    options={[
                      { label: "Select a customer", value: "" },
                      ...customers.map(c => ({
                        label: `${c.name} (${c.email})`,
                        value: c.id,
                      })),
                    ]}
                    value={selectedCustomer}
                    onChange={setSelectedCustomer}
                  />

                  <Select
                    label="Tier"
                    options={[
                      { label: "Select a tier", value: "" },
                      ...tiers.map(t => ({
                        label: `${t.name} ($${t.monthlyPrice}/mo)`,
                        value: t.id,
                      })),
                    ]}
                    value={selectedTier}
                    onChange={setSelectedTier}
                  />

                  {sellingPlans.length > 0 && (
                    <Select
                      label="Selling Plan (Optional)"
                      options={[
                        { label: "No selling plan", value: "" },
                        ...sellingPlans.map(sp => ({
                          label: `${sp.name} (${sp.interval})`,
                          value: sp.shopifyId,
                        })),
                      ]}
                      value={selectedPlan}
                      onChange={setSelectedPlan}
                    />
                  )}

                  <Button
                    variant="primary"
                    onClick={handleCreateTestSubscription}
                    loading={isLoading}
                    disabled={!selectedCustomer || !selectedTier}
                  >
                    Create Test Subscription
                  </Button>
                </FormLayout>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        {/* Simulate Billing */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg">Simulate Billing</Text>
                
                <FormLayout>
                  <Select
                    label="Subscription"
                    options={[
                      { label: "Select a subscription", value: "" },
                      ...subscriptions.map(s => ({
                        label: `${s.customerEmail} - ${s.tierName} (${s.status})`,
                        value: s.id,
                      })),
                    ]}
                    value={selectedSubscription}
                    onChange={setSelectedSubscription}
                  />

                  <InlineStack gap="200">
                    <Button
                      onClick={() => handleSimulateBilling(true)}
                      loading={isLoading}
                      disabled={!selectedSubscription}
                    >
                      Simulate Success
                    </Button>
                    <Button
                      tone="critical"
                      onClick={() => handleSimulateBilling(false)}
                      loading={isLoading}
                      disabled={!selectedSubscription}
                    >
                      Simulate Failure
                    </Button>
                  </InlineStack>
                </FormLayout>

                {selectedSubscription && (
                  <Box paddingBlockStart="400">
                    <Text as="h3" variant="headingMd">Recent Billing Attempts</Text>
                    {subscriptions.find(s => s.id === selectedSubscription)?.billingAttempts.map((attempt, index) => (
                      <Box key={index} paddingBlockStart="200">
                        <InlineStack gap="200" align="space-between">
                          <Text as="span" tone="subdued">
                            {new Date(attempt.date).toLocaleDateString()}
                          </Text>
                          <Badge tone={attempt.status === 'SUCCESS' ? 'success' : 'critical'}>
                            {attempt.status}
                          </Badge>
                          <Text as="span">${attempt.amount.toFixed(2)}</Text>
                        </InlineStack>
                        {attempt.error && (
                          <Text as="p" tone="critical" variant="bodySm">
                            {attempt.error}
                          </Text>
                        )}
                      </Box>
                    ))}
                  </Box>
                )}
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        {/* Billing Operations */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg">Billing Operations</Text>
                
                <InlineStack gap="200">
                  <Button onClick={handleProcessBillings} loading={isLoading}>
                    Process Due Billings
                  </Button>
                  <Button onClick={handleHealthCheck} loading={isLoading}>
                    Run Health Check
                  </Button>
                </InlineStack>

                <Banner>
                  <p>
                    These operations will process actual billing logic but in test mode.
                    No real charges will be created without proper Shopify integration.
                  </p>
                </Banner>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}