import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  Button,
  TextField,
  Select,
  Banner,
  InlineStack,
  BlockStack,
  Text,
  Badge,
  EmptyState,
  Box,
  DataTable,
  Modal,
  FormLayout,
  Checkbox,
  Icon,
  Divider,
  SkeletonBodyText,
  Thumbnail,
  Toast,
  Frame,
} from "@shopify/polaris";
import {
  ProductIcon,
  PlusIcon,
  DeleteIcon,
  EditIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  CashDollarIcon,
  CalendarIcon,
  PackageIcon,
  RefreshIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { formatCurrency } from "../utils/currency";
import { TierBadge } from "../components/TierBadge";
import { getTierStyle } from "../utils/tier-styles";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface TierProduct {
  id: string;
  tierId: string;
  tierName: string;
  shopifyProductId: string;
  shopifyVariantId: string;
  productHandle: string;
  sku: string;
  price: number;
  duration: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'LIFETIME';
  features: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface LoaderData {
  tiers: Array<{
    id: string;
    name: string;
    minSpend: number;
    cashbackPercent: number;
    evaluationPeriod: "ANNUAL" | "LIFETIME";
  }>;
  tierProducts: TierProduct[];
  shopSettings: {
    storeCurrency: string;
    currencyDisplayType: string;
  } | null;
  shop: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

// Generate a unique SKU for tier products
function generateTierSKU(tierName: string, duration: string, shop: string): string {
  // Clean the tier name for SKU
  const cleanTierName = tierName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .substring(0, 6);
  
  // Get shop prefix (first 3 letters of shop name)
  const shopPrefix = shop
    .split('.')[0]
    .toUpperCase()
    .substring(0, 3);
  
  // Duration code
  const durationCode = {
    'MONTHLY': 'M',
    'QUARTERLY': 'Q',
    'ANNUAL': 'A',
    'LIFETIME': 'L'
  }[duration] || 'X';
  
  // Random suffix for uniqueness
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  
  return `${shopPrefix}-${cleanTierName}-${durationCode}-${randomSuffix}`;
}

// Format duration for display
function formatDuration(duration: string): string {
  const durations: Record<string, string> = {
    'MONTHLY': 'Monthly',
    'QUARTERLY': 'Quarterly',
    'ANNUAL': 'Annual',
    'LIFETIME': 'Lifetime'
  };
  return durations[duration] || duration;
}

// Calculate subscription interval for Shopify
function getSubscriptionInterval(duration: string): { interval: string; intervalCount: number } {
  switch (duration) {
    case 'MONTHLY':
      return { interval: 'MONTH', intervalCount: 1 };
    case 'QUARTERLY':
      return { interval: 'MONTH', intervalCount: 3 };
    case 'ANNUAL':
      return { interval: 'YEAR', intervalCount: 1 };
    case 'LIFETIME':
      return { interval: 'YEAR', intervalCount: 99 }; // Effectively lifetime
    default:
      return { interval: 'MONTH', intervalCount: 1 };
  }
}

// ============================================
// LOADER - Fetch tiers and existing tier products
// ============================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }
  
  const shop = session.shop;
  
  try {
    // Fetch tiers and shop settings
    const [tiers, shopSettings] = await Promise.all([
      db.tier.findMany({
        where: { shop },
        orderBy: { minSpend: 'asc' },
      }),
      db.shopSettings.findUnique({
        where: { shop },
      }),
    ]);
    
    // For now, we'll return empty tier products since we haven't created the model yet
    // In production, you would fetch from a TierProduct model
    const tierProducts: TierProduct[] = [];
    
    return json<LoaderData>({
      tiers,
      tierProducts,
      shopSettings: shopSettings ? {
        storeCurrency: shopSettings.storeCurrency,
        currencyDisplayType: shopSettings.currencyDisplayType,
      } : null,
      shop,
    });
  } catch (error) {
    console.error("[TierProducts] Loader error:", error);
    throw new Response("Failed to load tier products", { status: 500 });
  }
};

// ============================================
// ACTION - Create products in Shopify
// ============================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }
  
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  
  try {
    if (intent === "create-product") {
      const tierId = formData.get("tierId") as string;
      const tierName = formData.get("tierName") as string;
      const price = parseFloat(formData.get("price") as string);
      const duration = formData.get("duration") as string;
      const description = formData.get("description") as string;
      const features = JSON.parse(formData.get("features") as string || "[]");
      
      // Generate SKU
      const sku = generateTierSKU(tierName, duration, shop);
      
      // Create product in Shopify using GraphQL
      const productInput = {
        title: `${tierName} Tier Membership - ${formatDuration(duration)}`,
        descriptionHtml: description || `<p>Unlock exclusive ${tierName} tier benefits with this ${formatDuration(duration).toLowerCase()} membership.</p>`,
        productType: "Membership",
        vendor: shop.split('.')[0],
        tags: ["tier-membership", tierName.toLowerCase(), duration.toLowerCase()],
        status: "ACTIVE",
        variants: [{
          price: price.toString(),
          sku: sku,
          inventoryPolicy: "CONTINUE", // Digital product - always available
          requiresShipping: false,
          taxable: true,
        }]
      };
      
      // GraphQL mutation to create product
      const response = await admin.graphql(
        `#graphql
        mutation createProduct($input: ProductInput!) {
          productCreate(input: $input) {
            product {
              id
              title
              handle
              status
              variants(first: 1) {
                edges {
                  node {
                    id
                    sku
                    price
                  }
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }`,
        {
          variables: {
            input: productInput,
          },
        }
      );
      
      const result = await response.json();
      
      if (result.data?.productCreate?.userErrors?.length > 0) {
        const errors = result.data.productCreate.userErrors.map((e: any) => e.message).join(", ");
        return json({ 
          success: false, 
          error: `Failed to create product: ${errors}` 
        }, { status: 400 });
      }
      
      if (result.data?.productCreate?.product) {
        const product = result.data.productCreate.product;
        const variant = product.variants.edges[0]?.node;
        
        // Store the product reference in our database (would need a TierProduct model)
        // For now, just return success
        
        return json({
          success: true,
          message: "Product created successfully",
          product: {
            id: product.id,
            title: product.title,
            handle: product.handle,
            variantId: variant?.id,
            sku: variant?.sku,
            price: variant?.price,
          }
        });
      }
      
      return json({ 
        success: false, 
        error: "Failed to create product" 
      }, { status: 500 });
      
    } else if (intent === "sync-product") {
      const productId = formData.get("productId") as string;
      
      // Fetch product details from Shopify
      const response = await admin.graphql(
        `#graphql
        query getProduct($id: ID!) {
          product(id: $id) {
            id
            title
            status
            handle
            variants(first: 1) {
              edges {
                node {
                  id
                  price
                  sku
                }
              }
            }
          }
        }`,
        {
          variables: {
            id: productId,
          },
        }
      );
      
      const result = await response.json();
      
      if (result.data?.product) {
        return json({
          success: true,
          message: "Product synced successfully",
          product: result.data.product,
        });
      }
      
      return json({ 
        success: false, 
        error: "Product not found" 
      }, { status: 404 });
      
    } else if (intent === "delete-product") {
      const productId = formData.get("productId") as string;
      
      // Delete product from Shopify
      const response = await admin.graphql(
        `#graphql
        mutation deleteProduct($id: ID!) {
          productDelete(input: { id: $id }) {
            deletedProductId
            userErrors {
              field
              message
            }
          }
        }`,
        {
          variables: {
            id: productId,
          },
        }
      );
      
      const result = await response.json();
      
      if (result.data?.productDelete?.userErrors?.length > 0) {
        const errors = result.data.productDelete.userErrors.map((e: any) => e.message).join(", ");
        return json({ 
          success: false, 
          error: `Failed to delete product: ${errors}` 
        }, { status: 400 });
      }
      
      return json({
        success: true,
        message: "Product deleted successfully",
      });
    }
    
    return json({ success: false, error: "Invalid action" }, { status: 400 });
    
  } catch (error) {
    console.error("[TierProducts] Action error:", error);
    return json({ 
      success: false, 
      error: error instanceof Error ? error.message : "An error occurred" 
    }, { status: 500 });
  }
};

// ============================================
// MAIN COMPONENT
// ============================================

export default function TierProducts() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  
  // State
  const [modalActive, setModalActive] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string>("");
  const [price, setPrice] = useState<string>("");
  const [duration, setDuration] = useState<string>("MONTHLY");
  const [description, setDescription] = useState<string>("");
  const [features, setFeatures] = useState<string[]>([
    "Access to exclusive tier benefits",
    "Cashback rewards on purchases",
    "Priority customer support"
  ]);
  const [newFeature, setNewFeature] = useState<string>("");
  const [toast, setToast] = useState<{ active: boolean; content: string; error?: boolean }>({
    active: false,
    content: "",
  });
  
  const isLoading = navigation.state === "submitting";
  
  // Format currency helper
  const formatAmount = useCallback((amount: number) => {
    return formatCurrency(amount, data.shopSettings as any);
  }, [data.shopSettings]);
  
  // Handle modal open
  const handleModalOpen = useCallback(() => {
    setModalActive(true);
    // Reset form
    setSelectedTier("");
    setPrice("");
    setDuration("MONTHLY");
    setDescription("");
    setFeatures([
      "Access to exclusive tier benefits",
      "Cashback rewards on purchases",
      "Priority customer support"
    ]);
  }, []);
  
  // Handle modal close
  const handleModalClose = useCallback(() => {
    setModalActive(false);
  }, []);
  
  // Handle create product
  const handleCreateProduct = useCallback(() => {
    if (!selectedTier || !price) {
      setToast({
        active: true,
        content: "Please select a tier and enter a price",
        error: true,
      });
      return;
    }
    
    const tier = data.tiers.find(t => t.id === selectedTier);
    if (!tier) return;
    
    const formData = new FormData();
    formData.append("intent", "create-product");
    formData.append("tierId", tier.id);
    formData.append("tierName", tier.name);
    formData.append("price", price);
    formData.append("duration", duration);
    formData.append("description", description);
    formData.append("features", JSON.stringify(features));
    
    submit(formData, { method: "post" });
    handleModalClose();
  }, [selectedTier, price, duration, description, features, data.tiers, submit, handleModalClose]);
  
  // Handle add feature
  const handleAddFeature = useCallback(() => {
    if (newFeature.trim()) {
      setFeatures([...features, newFeature.trim()]);
      setNewFeature("");
    }
  }, [features, newFeature]);
  
  // Handle remove feature
  const handleRemoveFeature = useCallback((index: number) => {
    setFeatures(features.filter((_, i) => i !== index));
  }, [features]);
  
  // Handle action response
  useEffect(() => {
    if (actionData) {
      setToast({
        active: true,
        content: actionData.message || (actionData.success ? "Operation successful" : "Operation failed"),
        error: !actionData.success,
      });
    }
  }, [actionData]);
  
  // Tier options for select
  const tierOptions = data.tiers.map(tier => ({
    label: `${tier.name} (${tier.cashbackPercent}% cashback)`,
    value: tier.id,
  }));
  
  // Duration options
  const durationOptions = [
    { label: "Monthly", value: "MONTHLY" },
    { label: "Quarterly (3 months)", value: "QUARTERLY" },
    { label: "Annual", value: "ANNUAL" },
    { label: "Lifetime (one-time)", value: "LIFETIME" },
  ];
  
  // Table rows for existing products
  const rows = data.tierProducts.map(product => [
    <InlineStack gap="200" align="center">
      <Thumbnail
        source={ProductIcon}
        size="small"
        alt={product.tierName}
      />
      <BlockStack gap="050">
        <Text variant="bodyMd" fontWeight="medium" as="span">
          {product.tierName} - {formatDuration(product.duration)}
        </Text>
        <Text variant="bodySm" tone="subdued" as="span">
          SKU: {product.sku}
        </Text>
      </BlockStack>
    </InlineStack>,
    <Badge tone={product.isActive ? "success" : "attention"}>
      {product.isActive ? "Active" : "Draft"}
    </Badge>,
    <Text variant="bodyMd" fontWeight="semibold" as="span">
      {formatAmount(product.price)}
    </Text>,
    <InlineStack gap="200">
      <Button size="slim" icon={EditIcon} onClick={() => console.log("Edit", product.id)}>
        Edit
      </Button>
      <Button size="slim" tone="critical" icon={DeleteIcon} onClick={() => console.log("Delete", product.id)}>
        Delete
      </Button>
    </InlineStack>
  ]);
  
  return (
    <Frame>
      <Page
        title="Tier Products"
        subtitle="Create and manage membership products for your loyalty tiers"
        primaryAction={{
          content: "Create Product",
          icon: PlusIcon,
          onAction: handleModalOpen,
        }}
        secondaryActions={[
          {
            content: "Refresh",
            icon: RefreshIcon,
            disabled: isLoading,
          }
        ]}
      >
        <Layout>
          {/* Information Banner */}
          <Layout.Section>
            <Banner
              title="Sell tier memberships as products"
              tone="info"
              icon={PackageIcon}
            >
              <p>
                Create Shopify products that customers can purchase to gain access to specific loyalty tiers. 
                These products can be one-time purchases or recurring subscriptions.
              </p>
            </Banner>
          </Layout.Section>
          
          {/* Stats Cards */}
          <Layout.Section>
            <InlineStack gap="400">
              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <Text variant="headingLg" as="h3">
                      {data.tiers.length}
                    </Text>
                    <Text variant="bodySm" tone="subdued" as="p">
                      Available Tiers
                    </Text>
                  </BlockStack>
                </Box>
              </Card>
              
              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <Text variant="headingLg" as="h3">
                      {data.tierProducts.length}
                    </Text>
                    <Text variant="bodySm" tone="subdued" as="p">
                      Tier Products
                    </Text>
                  </BlockStack>
                </Box>
              </Card>
              
              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <Text variant="headingLg" as="h3">
                      {data.tierProducts.filter(p => p.isActive).length}
                    </Text>
                    <Text variant="bodySm" tone="subdued" as="p">
                      Active Products
                    </Text>
                  </BlockStack>
                </Box>
              </Card>
            </InlineStack>
          </Layout.Section>
          
          {/* Products Table */}
          <Layout.Section>
            <Card>
              {data.tierProducts.length === 0 ? (
                <EmptyState
                  heading="No tier products yet"
                  action={{
                    content: "Create your first product",
                    onAction: handleModalOpen,
                  }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>
                    Start creating membership products that customers can purchase to unlock tier benefits.
                  </p>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "numeric", "text"]}
                  headings={["Product", "Status", "Price", "Actions"]}
                  rows={rows}
                />
              )}
            </Card>
          </Layout.Section>
          
          {/* How It Works Section */}
          <Layout.Section>
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">
                    How Tier Products Work
                  </Text>
                  
                  <BlockStack gap="300">
                    <InlineStack gap="200" align="start">
                      <Badge>1</Badge>
                      <BlockStack gap="100">
                        <Text variant="bodyMd" fontWeight="semibold" as="span">
                          Create Product
                        </Text>
                        <Text variant="bodyMd" tone="subdued" as="p">
                          Select a tier and create a Shopify product with custom pricing and duration.
                        </Text>
                      </BlockStack>
                    </InlineStack>
                    
                    <InlineStack gap="200" align="start">
                      <Badge>2</Badge>
                      <BlockStack gap="100">
                        <Text variant="bodyMd" fontWeight="semibold" as="span">
                          Customer Purchase
                        </Text>
                        <Text variant="bodyMd" tone="subdued" as="p">
                          Customers buy the product through your store like any other item.
                        </Text>
                      </BlockStack>
                    </InlineStack>
                    
                    <InlineStack gap="200" align="start">
                      <Badge>3</Badge>
                      <BlockStack gap="100">
                        <Text variant="bodyMd" fontWeight="semibold" as="span">
                          Automatic Tier Assignment
                        </Text>
                        <Text variant="bodyMd" tone="subdued" as="p">
                          Upon purchase completion, the customer is automatically assigned to the tier.
                        </Text>
                      </BlockStack>
                    </InlineStack>
                    
                    <InlineStack gap="200" align="start">
                      <Badge>4</Badge>
                      <BlockStack gap="100">
                        <Text variant="bodyMd" fontWeight="semibold" as="span">
                          Benefits Activated
                        </Text>
                        <Text variant="bodyMd" tone="subdued" as="p">
                          Customer immediately receives all tier benefits including cashback rates.
                        </Text>
                      </BlockStack>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>
        </Layout>
        
        {/* Create Product Modal */}
        <Modal
          open={modalActive}
          onClose={handleModalClose}
          title="Create Tier Product"
          primaryAction={{
            content: "Create Product",
            onAction: handleCreateProduct,
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
              <Select
                label="Select Tier"
                options={[
                  { label: "Choose a tier...", value: "" },
                  ...tierOptions,
                ]}
                value={selectedTier}
                onChange={setSelectedTier}
                helpText="Choose which tier this product will grant access to"
              />
              
              <TextField
                label="Price"
                type="number"
                value={price}
                onChange={setPrice}
                prefix={data.shopSettings?.storeCurrency || "USD"}
                helpText="Set the price for this membership"
                autoComplete="off"
              />
              
              <Select
                label="Duration"
                options={durationOptions}
                value={duration}
                onChange={setDuration}
                helpText="How long the membership lasts"
              />
              
              <TextField
                label="Description"
                value={description}
                onChange={setDescription}
                multiline={4}
                helpText="Optional product description"
                autoComplete="off"
              />
              
              <BlockStack gap="200">
                <Text variant="bodyMd" fontWeight="semibold" as="span">
                  Membership Features
                </Text>
                
                {features.map((feature, index) => (
                  <InlineStack key={index} gap="200" align="space-between">
                    <Text variant="bodyMd" as="span">• {feature}</Text>
                    <Button
                      size="slim"
                      plain
                      onClick={() => handleRemoveFeature(index)}
                    >
                      Remove
                    </Button>
                  </InlineStack>
                ))}
                
                <InlineStack gap="200">
                  <div style={{ flex: 1 }}>
                    <TextField
                      label=""
                      value={newFeature}
                      onChange={setNewFeature}
                      placeholder="Add a feature..."
                      autoComplete="off"
                    />
                  </div>
                  <Button onClick={handleAddFeature}>Add</Button>
                </InlineStack>
              </BlockStack>
            </FormLayout>
          </Modal.Section>
        </Modal>
        
        {/* Toast */}
        {toast.active && (
          <Toast
            content={toast.content}
            error={toast.error}
            onDismiss={() => setToast({ ...toast, active: false })}
          />
        )}
      </Page>
    </Frame>
  );
}