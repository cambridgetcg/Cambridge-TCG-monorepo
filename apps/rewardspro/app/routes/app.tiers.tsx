import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useSubmit } from "@remix-run/react";
export { ErrorBoundary } from "../components/ErrorBoundary";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Button,
  Modal,
  FormLayout,
  TextField,
  Select,
  Banner,
  InlineStack,
  BlockStack,
  Text,
  Badge,
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// ============= TYPES =============
type Tier = {
  id: string;
  shop: string;
  name: string;
  minSpend: number;
  cashbackPercent: number;
  evaluationPeriod: "ANNUAL" | "LIFETIME";
  createdAt: string;
};

type LoaderData = {
  tiers: Tier[];
  shop: string;
};

// ============= INPUT VALIDATION =============
const validateTierInput = (formData: FormData) => {
  const name = formData.get("name") as string;
  const minSpend = formData.get("minSpend") as string;
  const cashbackPercent = formData.get("cashbackPercent") as string;
  const evaluationPeriod = formData.get("evaluationPeriod") as string;

  const errors: string[] = [];

  // Name validation
  if (!name || name.trim().length === 0) {
    errors.push("Name is required");
  } else if (name.length > 50) {
    errors.push("Name must be less than 50 characters");
  } else if (!/^[a-zA-Z0-9\s-]+$/.test(name)) {
    errors.push("Name contains invalid characters");
  }

  // MinSpend validation
  const minSpendNum = Number(minSpend);
  if (isNaN(minSpendNum)) {
    errors.push("Minimum spend must be a number");
  } else if (minSpendNum < 0) {
    errors.push("Minimum spend cannot be negative");
  } else if (minSpendNum > 1000000) {
    errors.push("Minimum spend exceeds maximum allowed");
  }

  // Cashback validation
  const cashbackNum = Number(cashbackPercent);
  if (isNaN(cashbackNum)) {
    errors.push("Cashback percent must be a number");
  } else if (cashbackNum < 0 || cashbackNum > 100) {
    errors.push("Cashback percent must be between 0 and 100");
  }

  // Period validation
  if (!["ANNUAL", "LIFETIME"].includes(evaluationPeriod)) {
    errors.push("Invalid evaluation period");
  }

  if (errors.length > 0) {
    throw new Error(errors.join(", "));
  }

  return {
    name: name.trim(),
    minSpend: minSpendNum,
    cashbackPercent: cashbackNum,
    evaluationPeriod: evaluationPeriod as "ANNUAL" | "LIFETIME",
  };
};

// ============= RATE LIMITING =============
const rateLimitMap = new Map<string, number[]>();

const checkRateLimit = (shop: string) => {
  const now = Date.now();
  const windowMs = 60000; // 1 minute window
  const maxRequests = 20; // 20 requests per minute

  const key = shop;
  const timestamps = rateLimitMap.get(key) || [];
  
  // Remove old timestamps
  const recentTimestamps = timestamps.filter(t => now - t < windowMs);
  
  if (recentTimestamps.length >= maxRequests) {
    throw new Response("Too many requests. Please wait a moment.", { status: 429 });
  }
  
  recentTimestamps.push(now);
  rateLimitMap.set(key, recentTimestamps);
};

// ============= LOADER =============
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    
    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;

    const tiers = await db.tier.findMany({
      where: { shop },
      orderBy: { minSpend: "asc" },
    });

    // Serialize dates to strings for JSON (handle both Date objects and strings)
    const serializedTiers = tiers.map(tier => ({
      ...tier,
      createdAt: tier.createdAt instanceof Date 
        ? tier.createdAt.toISOString() 
        : tier.createdAt, // Already a string from Data API
    }));

    return json<LoaderData>({ tiers: serializedTiers, shop });
  } catch (error) {
    console.error("Loader error:", error);
    throw new Response("Failed to load tiers", { status: 500 });
  }
};

// ============= ACTION =============
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    // Authenticate
    const { session } = await authenticate.admin(request);
    
    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;
    
    // Rate limiting
    checkRateLimit(shop);

    const formData = await request.formData();
    const intent = formData.get("intent") as string;

    switch (intent) {
      case "create": {
        const data = validateTierInput(formData);
        
        // Check for duplicate name
        const existing = await db.tier.findFirst({
          where: { 
            shop,
            name: data.name,
          },
        });

        if (existing) {
          return json(
            { error: `A tier named "${data.name}" already exists` },
            { status: 400 }
          );
        }

        // Check for conflicting minSpend
        const conflicting = await db.tier.findFirst({
          where: {
            shop,
            minSpend: data.minSpend,
          },
        });

        if (conflicting) {
          return json(
            { error: `A tier with minimum spend $${data.minSpend} already exists` },
            { status: 400 }
          );
        }

        // Extract store name from shop domain (e.g., "mystore.myshopify.com" -> "mystore")
        const storeName = shop.split('.')[0];
        
        // Create tier ID in format: storename-tiername (lowercase, spaces replaced with hyphens)
        const tierId = `${storeName}-${data.name.toLowerCase().replace(/\s+/g, '-')}`;
        
        const newTier = await db.tier.create({
          data: {
            id: tierId,
            shop,
            ...data,
          },
        });

        return json({ success: true, tier: newTier });
      }

      case "update": {
        const id = formData.get("id") as string;
        
        if (!id) {
          return json({ error: "Tier ID is required" }, { status: 400 });
        }

        const data = validateTierInput(formData);

        // Verify tier belongs to shop
        const existingTier = await db.tier.findFirst({
          where: { id, shop },
        });

        if (!existingTier) {
          return json({ error: "Tier not found" }, { status: 404 });
        }

        // Check for duplicate name (excluding current tier)
        const duplicateName = await db.tier.findFirst({
          where: {
            shop,
            name: data.name,
            NOT: { id },
          },
        });

        if (duplicateName) {
          return json(
            { error: `A tier named "${data.name}" already exists` },
            { status: 400 }
          );
        }

        const updatedTier = await db.tier.update({
          where: { id },
          data,
        });

        return json({ success: true, tier: updatedTier });
      }

      case "delete": {
        const id = formData.get("id") as string;
        
        if (!id) {
          return json({ error: "Tier ID is required" }, { status: 400 });
        }

        // Verify tier belongs to shop
        const tier = await db.tier.findFirst({
          where: { id, shop },
        });

        if (!tier) {
          return json({ error: "Tier not found" }, { status: 404 });
        }

        await db.tier.delete({
          where: { id },
        });

        return json({ success: true, deletedId: id });
      }

      default:
        return json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Action error:", error);
    
    if (error instanceof Response) {
      throw error;
    }
    
    if (error instanceof Error) {
      return json({ error: error.message }, { status: 400 });
    }
    
    return json({ error: "An unexpected error occurred" }, { status: 500 });
  }
};

// ============= COMPONENT =============
export default function TiersPage() {
  const { tiers } = useLoaderData<LoaderData>();
  const fetcher = useFetcher();
  const submit = useSubmit();
  
  const [modalActive, setModalActive] = useState(false);
  const [editingTier, setEditingTier] = useState<Tier | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  // Form state
  const [name, setName] = useState("");
  const [minSpend, setMinSpend] = useState("");
  const [cashbackPercent, setCashbackPercent] = useState("");
  const [evaluationPeriod, setEvaluationPeriod] = useState<"ANNUAL" | "LIFETIME">("ANNUAL");
  
  const [formErrors, setFormErrors] = useState<string[]>([]);

  // Handle modal open/close
  const handleModalOpen = useCallback((tier?: Tier) => {
    if (tier) {
      setEditingTier(tier);
      setName(tier.name);
      setMinSpend(tier.minSpend.toString());
      setCashbackPercent(tier.cashbackPercent.toString());
      setEvaluationPeriod(tier.evaluationPeriod);
    } else {
      setEditingTier(null);
      setName("");
      setMinSpend("");
      setCashbackPercent("");
      setEvaluationPeriod("ANNUAL");
    }
    setFormErrors([]);
    setModalActive(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setModalActive(false);
    setEditingTier(null);
    setFormErrors([]);
  }, []);

  // Handle form submission
  const handleSubmit = useCallback(() => {
    const errors: string[] = [];
    
    // Client-side validation
    if (!name.trim()) errors.push("Name is required");
    if (!minSpend || Number(minSpend) < 0) errors.push("Valid minimum spend is required");
    if (!cashbackPercent || Number(cashbackPercent) < 0 || Number(cashbackPercent) > 100) {
      errors.push("Cashback must be between 0 and 100");
    }

    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }

    const formData = new FormData();
    formData.append("intent", editingTier ? "update" : "create");
    if (editingTier) {
      formData.append("id", editingTier.id);
    }
    formData.append("name", name);
    formData.append("minSpend", minSpend);
    formData.append("cashbackPercent", cashbackPercent);
    formData.append("evaluationPeriod", evaluationPeriod);

    fetcher.submit(formData, { method: "post" });
    handleModalClose();
  }, [name, minSpend, cashbackPercent, evaluationPeriod, editingTier, fetcher, handleModalClose]);

  // Handle delete
  const handleDelete = useCallback((id: string) => {
    const formData = new FormData();
    formData.append("intent", "delete");
    formData.append("id", id);
    submit(formData, { method: "post" });
    setDeleteConfirmId(null);
  }, [submit]);

  // Prepare table data
  const rows = tiers.map((tier) => [
    tier.name,
    `$${tier.minSpend.toLocaleString()}`,
    `${tier.cashbackPercent}%`,
    <Badge tone={tier.evaluationPeriod === "ANNUAL" ? "info" : "success"}>
      {tier.evaluationPeriod}
    </Badge>,
    <InlineStack gap="200">
      <Button size="slim" onClick={() => handleModalOpen(tier)}>
        Edit
      </Button>
      {deleteConfirmId === tier.id ? (
        <InlineStack gap="200">
          <Button size="slim" tone="critical" onClick={() => handleDelete(tier.id)}>
            Confirm
          </Button>
          <Button size="slim" onClick={() => setDeleteConfirmId(null)}>
            Cancel
          </Button>
        </InlineStack>
      ) : (
        <Button size="slim" variant="plain" tone="critical" onClick={() => setDeleteConfirmId(tier.id)}>
          Delete
        </Button>
      )}
    </InlineStack>,
  ]);

  // Show success/error messages
  const actionData = fetcher.data as { error?: string; success?: boolean } | undefined;
  const [showBanner, setShowBanner] = useState(true);
  
  // Reset banner visibility when new action data comes in
  useEffect(() => {
    if (actionData) {
      setShowBanner(true);
    }
  }, [actionData]);
  
  return (
    <Page
      title="Loyalty Tiers"
      primaryAction={{
        content: "Add Tier",
        onAction: () => handleModalOpen(),
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {actionData?.error && showBanner && (
              <Banner tone="critical" onDismiss={() => setShowBanner(false)}>
                <p>{actionData.error}</p>
              </Banner>
            )}
            {actionData?.success && showBanner && (
              <Banner tone="success" onDismiss={() => setShowBanner(false)}>
                <p>Tier {editingTier ? "updated" : "created"} successfully!</p>
              </Banner>
            )}
            
            <Card>
            {tiers.length === 0 ? (
              <BlockStack gap="400">
                <Text as="p" variant="bodyMd">
                  No tiers created yet. Create your first tier to start rewarding customers!
                </Text>
                <Button onClick={() => handleModalOpen()}>Create First Tier</Button>
              </BlockStack>
            ) : (
              <DataTable
                columnContentTypes={["text", "numeric", "numeric", "text", "text"]}
                headings={["Tier Name", "Min Spend", "Cashback", "Period", "Actions"]}
                rows={rows}
              />
            )}
          </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                About Tiers
              </Text>
              <Text as="p" variant="bodyMd">
                Tiers help you reward customers based on their spending. Customers automatically 
                move up tiers as they spend more.
              </Text>
              <Text as="p" variant="bodyMd">
                <strong>Annual:</strong> Based on last 12 months of spending
              </Text>
              <Text as="p" variant="bodyMd">
                <strong>Lifetime:</strong> Based on all-time spending
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={modalActive}
        onClose={handleModalClose}
        title={editingTier ? "Edit Tier" : "Create New Tier"}
        primaryAction={{
          content: editingTier ? "Update" : "Create",
          onAction: handleSubmit,
          loading: fetcher.state === "submitting",
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: handleModalClose,
          },
        ]}
      >
        <Modal.Section>
          {formErrors.length > 0 && (
            <Banner tone="critical">
              <BlockStack gap="200">
                {formErrors.map((error, i) => (
                  <Text key={i} as="p" variant="bodyMd">
                    {error}
                  </Text>
                ))}
              </BlockStack>
            </Banner>
          )}
          
          <FormLayout>
            <TextField
              label="Tier Name"
              value={name}
              onChange={setName}
              autoComplete="off"
              helpText="E.g., Bronze, Silver, Gold"
            />
            
            <TextField
              label="Minimum Spend ($)"
              value={minSpend}
              onChange={setMinSpend}
              type="number"
              min="0"
              autoComplete="off"
              helpText="Minimum amount customer must spend to reach this tier"
            />
            
            <TextField
              label="Cashback Percent (%)"
              value={cashbackPercent}
              onChange={setCashbackPercent}
              type="number"
              min="0"
              max="100"
              autoComplete="off"
              helpText="Percentage of order value returned as store credit"
            />
            
            <Select
              label="Evaluation Period"
              options={[
                { label: "Annual (12 months rolling)", value: "ANNUAL" },
                { label: "Lifetime (all-time spending)", value: "LIFETIME" },
              ]}
              value={evaluationPeriod}
              onChange={(value) => setEvaluationPeriod(value as "ANNUAL" | "LIFETIME")}
            />
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
}