/**
 * Tier Management Page
 * Create and manage loyalty tiers with subscription pricing
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, Form } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Button,
  Box,
  Text,
  BlockStack,
  InlineStack,
  Modal,
  FormLayout,
  TextField,
  Select,
  Banner,
  Badge,
  Divider,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { db } from "~/db.server";
import { useState, useCallback } from "react";
import { v4 as uuidv4 } from 'crypto';
import { isSubscriptionEnabled } from "~/services/subscription/config.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const [tiers, shopSettings, subscriptionsEnabled] = await Promise.all([
    db.tier.findMany({
      where: { shop: session.shop },
      include: {
        _count: {
          select: { customers: true },
        },
      },
      orderBy: { minSpend: 'asc' },
    }),
    db.shopSettings.findUnique({
      where: { shop: session.shop },
    }),
    Promise.resolve(isSubscriptionEnabled()),
  ]);

  return json({
    tiers: tiers.map(tier => ({
      id: tier.id,
      name: tier.name,
      minSpend: tier.minSpend,
      cashbackPercent: tier.cashbackPercent,
      evaluationPeriod: tier.evaluationPeriod,
      monthlyPrice: tier.monthlyPrice?.toNumber() || null,
      customerCount: tier._count.customers,
    })),
    shopSettings,
    subscriptionsEnabled,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const action = formData.get("action");

  switch (action) {
    case "create": {
      const name = formData.get("name") as string;
      const minSpend = parseInt(formData.get("minSpend") as string);
      const cashbackPercent = parseInt(formData.get("cashbackPercent") as string);
      const evaluationPeriod = formData.get("evaluationPeriod") as "ANNUAL" | "LIFETIME";
      const monthlyPrice = formData.get("monthlyPrice") ? 
        parseFloat(formData.get("monthlyPrice") as string) : null;

      // Validate inputs
      if (!name || isNaN(minSpend) || isNaN(cashbackPercent)) {
        return json({ 
          success: false, 
          error: "Invalid input values" 
        }, { status: 400 });
      }

      if (cashbackPercent < 0 || cashbackPercent > 100) {
        return json({ 
          success: false, 
          error: "Cashback percentage must be between 0 and 100" 
        }, { status: 400 });
      }

      try {
        await db.tier.create({
          data: {
            id: uuidv4(),
            shop: session.shop,
            name,
            minSpend,
            cashbackPercent,
            evaluationPeriod,
            monthlyPrice,
            createdAt: new Date(),
          },
        });

        return json({ success: true, message: "Tier created successfully" });
      } catch (error: any) {
        if (error.code === 'P2002') {
          return json({ 
            success: false, 
            error: "A tier with this name already exists" 
          }, { status: 400 });
        }
        throw error;
      }
    }

    case "update": {
      const id = formData.get("id") as string;
      const name = formData.get("name") as string;
      const minSpend = parseInt(formData.get("minSpend") as string);
      const cashbackPercent = parseInt(formData.get("cashbackPercent") as string);
      const evaluationPeriod = formData.get("evaluationPeriod") as "ANNUAL" | "LIFETIME";
      const monthlyPrice = formData.get("monthlyPrice") ? 
        parseFloat(formData.get("monthlyPrice") as string) : null;

      try {
        await db.tier.update({
          where: { id },
          data: {
            name,
            minSpend,
            cashbackPercent,
            evaluationPeriod,
            monthlyPrice,
          },
        });

        return json({ success: true, message: "Tier updated successfully" });
      } catch (error: any) {
        if (error.code === 'P2002') {
          return json({ 
            success: false, 
            error: "A tier with this name already exists" 
          }, { status: 400 });
        }
        throw error;
      }
    }

    case "delete": {
      const id = formData.get("id") as string;

      // Check if tier has customers
      const tier = await db.tier.findUnique({
        where: { id },
        include: { _count: { select: { customers: true } } },
      });

      if (tier && tier._count.customers > 0) {
        return json({ 
          success: false, 
          error: `Cannot delete tier with ${tier._count.customers} customers` 
        }, { status: 400 });
      }

      await db.tier.delete({
        where: { id },
      });

      return json({ success: true, message: "Tier deleted successfully" });
    }

    default:
      return json({ success: false, error: "Invalid action" }, { status: 400 });
  }
};

export default function Tiers() {
  const { tiers, shopSettings, subscriptionsEnabled } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  
  const [modalActive, setModalActive] = useState(false);
  const [editingTier, setEditingTier] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    minSpend: "",
    cashbackPercent: "",
    evaluationPeriod: "ANNUAL",
    monthlyPrice: "",
  });

  const isLoading = navigation.state !== "idle";

  const handleModalOpen = useCallback((tier?: any) => {
    if (tier) {
      setEditingTier(tier);
      setFormData({
        name: tier.name,
        minSpend: tier.minSpend.toString(),
        cashbackPercent: tier.cashbackPercent.toString(),
        evaluationPeriod: tier.evaluationPeriod,
        monthlyPrice: tier.monthlyPrice?.toString() || "",
      });
    } else {
      setEditingTier(null);
      setFormData({
        name: "",
        minSpend: "",
        cashbackPercent: "",
        evaluationPeriod: "ANNUAL",
        monthlyPrice: "",
      });
    }
    setModalActive(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setModalActive(false);
    setEditingTier(null);
  }, []);

  const handleSubmit = useCallback(() => {
    const data = new FormData();
    data.append("action", editingTier ? "update" : "create");
    if (editingTier) {
      data.append("id", editingTier.id);
    }
    data.append("name", formData.name);
    data.append("minSpend", formData.minSpend);
    data.append("cashbackPercent", formData.cashbackPercent);
    data.append("evaluationPeriod", formData.evaluationPeriod);
    if (formData.monthlyPrice) {
      data.append("monthlyPrice", formData.monthlyPrice);
    }
    submit(data, { method: "post" });
    handleModalClose();
  }, [formData, editingTier, submit, handleModalClose]);

  const handleDelete = useCallback((id: string) => {
    if (confirm("Are you sure you want to delete this tier?")) {
      const data = new FormData();
      data.append("action", "delete");
      data.append("id", id);
      submit(data, { method: "post" });
    }
  }, [submit]);

  const formatCurrency = (amount: number) => {
    if (!shopSettings) return `$${amount}`;
    
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: shopSettings.storeCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    
    return formatter.format(amount);
  };

  const rows = tiers.map(tier => [
    tier.name,
    formatCurrency(tier.minSpend),
    `${tier.cashbackPercent}%`,
    <Badge>{tier.evaluationPeriod}</Badge>,
    tier.monthlyPrice ? formatCurrency(tier.monthlyPrice) : "—",
    tier.customerCount,
    <InlineStack gap="200">
      <Button size="slim" onClick={() => handleModalOpen(tier)}>
        Edit
      </Button>
      <Button 
        size="slim" 
        tone="critical" 
        onClick={() => handleDelete(tier.id)}
        disabled={tier.customerCount > 0}
      >
        Delete
      </Button>
    </InlineStack>,
  ]);

  return (
    <Page
      title="Tiers"
      subtitle="Manage loyalty tiers and subscription pricing"
      primaryAction={{
        content: "Create Tier",
        onAction: () => handleModalOpen(),
      }}
      secondaryActions={[
        {
          content: "Tier Products",
          url: "/app/tier-products",
        },
      ]}
    >
      <Layout>
        {subscriptionsEnabled && (
          <Layout.Section>
            <Banner
              title="Subscription Pricing"
              tone="info"
            >
              <p>
                You can now set monthly subscription prices for each tier. 
                Customers can subscribe to tier memberships with recurring billing.
              </p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg">Loyalty Tiers</Text>
                
                {tiers.length > 0 ? (
                  <DataTable
                    columnContentTypes={[
                      "text",
                      "numeric",
                      "numeric",
                      "text",
                      "numeric",
                      "numeric",
                      "text",
                    ]}
                    headings={[
                      "Name",
                      "Min Spend",
                      "Cashback",
                      "Period",
                      subscriptionsEnabled ? "Monthly Price" : "",
                      "Customers",
                      "Actions",
                    ].filter(h => h !== "")}
                    rows={rows}
                  />
                ) : (
                  <Banner>
                    <p>No tiers created yet. Click "Create Tier" to add your first loyalty tier.</p>
                  </Banner>
                )}
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={modalActive}
        onClose={handleModalClose}
        title={editingTier ? "Edit Tier" : "Create Tier"}
        primaryAction={{
          content: editingTier ? "Update" : "Create",
          onAction: handleSubmit,
          loading: isLoading,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: handleModalClose,
          },
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="Tier Name"
              value={formData.name}
              onChange={(value) => setFormData({ ...formData, name: value })}
              autoComplete="off"
              helpText="e.g., Bronze, Silver, Gold"
            />
            
            <TextField
              label="Minimum Spend"
              type="number"
              value={formData.minSpend}
              onChange={(value) => setFormData({ ...formData, minSpend: value })}
              autoComplete="off"
              prefix={shopSettings?.storeCurrency || "USD"}
              helpText="Minimum spending to qualify for this tier"
            />
            
            <TextField
              label="Cashback Percentage"
              type="number"
              value={formData.cashbackPercent}
              onChange={(value) => setFormData({ ...formData, cashbackPercent: value })}
              autoComplete="off"
              suffix="%"
              helpText="Percentage of order value returned as store credit"
            />
            
            <Select
              label="Evaluation Period"
              options={[
                { label: "Annual (12 months)", value: "ANNUAL" },
                { label: "Lifetime", value: "LIFETIME" },
              ]}
              value={formData.evaluationPeriod}
              onChange={(value) => setFormData({ ...formData, evaluationPeriod: value })}
              helpText="How spending is calculated for tier qualification"
            />

            {subscriptionsEnabled && (
              <>
                <Divider />
                <Text as="h3" variant="headingMd">Subscription Pricing (Optional)</Text>
                
                <TextField
                  label="Monthly Subscription Price"
                  type="number"
                  value={formData.monthlyPrice}
                  onChange={(value) => setFormData({ ...formData, monthlyPrice: value })}
                  autoComplete="off"
                  prefix={shopSettings?.storeCurrency || "USD"}
                  helpText="Monthly price for tier membership subscription (leave blank for no subscription option)"
                />
                
                {formData.monthlyPrice && (
                  <Banner tone="info">
                    <p>
                      Subscription discounts will be automatically applied:
                      <br />• Monthly: {formatCurrency(parseFloat(formData.monthlyPrice))}
                      <br />• Quarterly: {formatCurrency(parseFloat(formData.monthlyPrice) * 0.95)} (5% off)
                      <br />• Annual: {formatCurrency(parseFloat(formData.monthlyPrice) * 0.85)} (15% off)
                    </p>
                  </Banner>
                )}
              </>
            )}
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
}