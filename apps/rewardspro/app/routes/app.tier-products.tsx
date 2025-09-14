import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData, useRevalidator } from "@remix-run/react";
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
  Spinner,
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
  // Get shop name without .myshopify.com
  const shopName = shop.split('.')[0];
  
  // Clean and get first 4-6 chars of shop name
  const shopPrefix = shopName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .substring(0, Math.min(6, Math.max(4, shopName.length)));
  
  // Clean the tier name for SKU (3-4 chars)
  const cleanTierName = tierName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .substring(0, 4);
  
  // Duration code
  const durationCode = {
    'MONTHLY': 'M',
    'QUARTERLY': 'Q', 
    'ANNUAL': 'A',
    'LIFETIME': 'L'
  }[duration] || 'X';
  
  // Date-based component for uniqueness (YYMM)
  const now = new Date();
  const dateCode = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  // Random suffix for additional uniqueness (3 chars)
  const randomSuffix = Math.random().toString(36).substring(2, 5).toUpperCase();
  
  // Format: SHOP-TIER-DUR-DATE-RND
  // Example: ACME-GOLD-A-2501-X9K
  return `${shopPrefix}-${cleanTierName}-${durationCode}-${dateCode}-${randomSuffix}`;
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
  const { session, admin } = await authenticate.admin(request);
  
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
    
    // Fetch tier products from Shopify using GraphQL
    const productsResponse = await admin.graphql(
      `#graphql
      query getTierProducts {
        products(first: 100, query: "tag:tier-membership") {
          edges {
            node {
              id
              title
              handle
              status
              tags
              productType
              variants(first: 10) {
                edges {
                  node {
                    id
                    sku
                    price
                    title
                  }
                }
              }
            }
          }
        }
      }`
    );
    
    const productsResult = await productsResponse.json();
    
    // Transform Shopify products to our TierProduct format
    const tierProducts: TierProduct[] = [];
    
    if (productsResult.data?.products?.edges) {
      for (const edge of productsResult.data.products.edges) {
        const product = edge.node;
        const variant = product.variants.edges[0]?.node;
        
        if (variant) {
          // Extract tier name and duration from tags or title
          const tags = product.tags || [];
          let duration = 'MONTHLY' as TierProduct['duration'];
          
          // Check tags for duration
          if (tags.includes('monthly')) duration = 'MONTHLY';
          else if (tags.includes('quarterly')) duration = 'QUARTERLY';
          else if (tags.includes('annual')) duration = 'ANNUAL';
          else if (tags.includes('lifetime')) duration = 'LIFETIME';
          
          // Extract tier name from title (assuming format: "TierName Tier Membership - Duration")
          const tierNameMatch = product.title.match(/^(.+?)\s+Tier\s+Membership/);
          const tierName = tierNameMatch ? tierNameMatch[1] : product.title;
          
          // Find matching tier
          const matchingTier = tiers.find(t => 
            product.title.toLowerCase().includes(t.name.toLowerCase())
          );
          
          tierProducts.push({
            id: product.id,
            tierId: matchingTier?.id || '',
            tierName: tierName,
            shopifyProductId: product.id,
            shopifyVariantId: variant.id,
            productHandle: product.handle,
            sku: variant.sku || '',
            price: parseFloat(variant.price || '0'),
            duration: duration,
            features: [], // Would need to parse from description or metafields
            isActive: product.status === 'ACTIVE',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }
    
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
      // Step 1: Create the product with default option
      const createProductResponse = await admin.graphql(
        `#graphql
        mutation createProduct($input: ProductInput!) {
          productCreate(input: $input) {
            product {
              id
              title
              handle
              status
              options {
                id
                name
                position
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
            input: {
              title: `${tierName} Tier Membership - ${formatDuration(duration)}`,
              descriptionHtml: description || `<p>Unlock exclusive ${tierName} tier benefits with this ${formatDuration(duration).toLowerCase()} membership.</p>`,
              productType: "Membership",
              vendor: shop.split('.')[0],
              tags: ["tier-membership", tierName.toLowerCase(), duration.toLowerCase()],
              status: "ACTIVE",
              productOptions: [
                {
                  name: "Title",
                  values: [{ name: "Default Title" }]
                }
              ]
            }
          },
        }
      );
      
      const createResult = await createProductResponse.json();
      
      if (createResult.data?.productCreate?.userErrors?.length > 0) {
        const errors = createResult.data.productCreate.userErrors.map((e: any) => e.message).join(", ");
        return json({ 
          success: false, 
          error: `Failed to create product: ${errors}` 
        }, { status: 400 });
      }
      
      if (!createResult.data?.productCreate?.product) {
        return json({ 
          success: false, 
          error: "Failed to create product" 
        }, { status: 500 });
      }
      
      const product = createResult.data.productCreate.product;
      const productOptions = product.options || [];
      
      // Step 2: Get the default variant ID first
      const getVariantResponse = await admin.graphql(
        `#graphql
        query getProductVariant($id: ID!) {
          product(id: $id) {
            variants(first: 1) {
              edges {
                node {
                  id
                  selectedOptions {
                    name
                    value
                  }
                }
              }
            }
          }
        }`,
        {
          variables: { id: product.id }
        }
      );
      
      const variantResult = await getVariantResponse.json();
      const variantData = variantResult.data?.product?.variants?.edges?.[0]?.node;
      const variantId = variantData?.id;
      
      if (variantId) {
        // Build optionValues array using the product's options
        const optionValues = productOptions.map((option: any) => ({
          optionName: option.name,
          name: "Default Title" // Use the default value for the option
        }));
        
        // Step 3: Update the variant with price and SKU using productSet
        // Include productOptions in the input to satisfy the requirement
        const updateVariantResponse = await admin.graphql(
          `#graphql
          mutation productSet($input: ProductSetInput!) {
            productSet(input: $input) {
              product {
                id
                title
                handle
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
              input: {
                id: product.id,
                productOptions: productOptions.map((opt: any) => ({
                  name: opt.name,
                  values: [{ name: "Default Title" }]
                })),
                variants: [{
                  id: variantId,
                  price: price.toString(),
                  sku: sku,
                  inventoryPolicy: "CONTINUE",
                  taxable: true,
                  optionValues: optionValues
                }]
              }
            }
          }
        );
        
        const updateResult = await updateVariantResponse.json();
        
        if (updateResult.data?.productSet?.userErrors?.length > 0) {
          const errors = updateResult.data.productSet.userErrors.map((e: any) => e.message).join(", ");
          
          // If location error, try without inventory quantities
          if (errors.includes("location") || errors.includes("inventory") || errors.includes("Location")) {
            const retryResponse = await admin.graphql(
              `#graphql
              mutation productSet($input: ProductSetInput!) {
                productSet(input: $input) {
                  product {
                    id
                    title
                    handle
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
                  input: {
                    id: product.id,
                    productOptions: productOptions.map((opt: any) => ({
                      name: opt.name,
                      values: [{ name: "Default Title" }]
                    })),
                    variants: [{
                      id: variantId,
                      price: price.toString(),
                      sku: sku,
                      inventoryPolicy: "CONTINUE",
                      taxable: true,
                      optionValues: optionValues
                    }]
                  }
                }
              }
            );
            
            const retryResult = await retryResponse.json();
            
            if (retryResult.data?.productSet?.product) {
              const variant = retryResult.data.productSet.product.variants.edges[0]?.node;
              if (variant) {
                return json({
                  success: true,
                  message: "Product created successfully",
                  product: {
                    id: product.id,
                    title: product.title,
                    handle: product.handle,
                    variantId: variant.id,
                    sku: variant.sku,
                    price: variant.price,
                  }
                });
              }
            }
          }
          
          return json({ 
            success: false, 
            error: `Failed to update product variant: ${errors}` 
          }, { status: 400 });
        }
        
        if (updateResult.data?.productSet?.product) {
          const variant = updateResult.data.productSet.product.variants.edges[0]?.node;
          if (variant) {
            return json({
              success: true,
              message: "Product created successfully",
              product: {
                id: product.id,
                title: product.title,
                handle: product.handle,
                variantId: variant.id,
                sku: variant.sku,
                price: variant.price,
              }
            });
          }
        }
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
  const { revalidate } = useRevalidator();
  
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
  const isRefreshing = navigation.state === "loading";
  
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
    
    // Mark that we're creating a product for auto-refresh
    sessionStorage.setItem('tier-product-created', Date.now().toString());
    
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
        content: 'message' in actionData ? actionData.message : (actionData.success ? "Operation successful" : actionData.error || "Operation failed"),
        error: !actionData.success,
      });
      
      // Refresh the product list after successful creation
      if (actionData.success) {
        // Add a small delay to ensure Shopify has indexed the new product
        setTimeout(() => {
          revalidate();
        }, 1000);
      }
    }
  }, [actionData, revalidate]);
  
  // Auto-refresh every 30 seconds if there are no products (initial setup)
  useEffect(() => {
    if (data.tierProducts.length === 0) {
      const interval = setInterval(() => {
        revalidate();
      }, 30000); // 30 seconds
      
      return () => clearInterval(interval);
    }
  }, [data.tierProducts.length, revalidate]);
  
  // Refresh on page focus if products were recently created
  useEffect(() => {
    const handleFocus = () => {
      // Check if we should refresh (e.g., if modal was recently closed)
      const lastCreation = sessionStorage.getItem('tier-product-created');
      if (lastCreation) {
        const timeSinceCreation = Date.now() - parseInt(lastCreation);
        if (timeSinceCreation < 60000) { // Within last minute
          revalidate();
          sessionStorage.removeItem('tier-product-created');
        }
      }
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [revalidate]);
  
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
  
  // Handle delete product
  const handleDeleteProduct = useCallback((productId: string) => {
    if (confirm('Are you sure you want to delete this product?')) {
      const formData = new FormData();
      formData.append("intent", "delete-product");
      formData.append("productId", productId);
      submit(formData, { method: "post" });
    }
  }, [submit]);
  
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
            disabled: isLoading || navigation.state === "loading",
            onAction: () => revalidate(),
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
          
          {/* Symmetrical Stats Cards Grid */}
          <Layout.Section>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 'var(--p-space-400)',
            }}>
              <Card>
                <Box padding="400">
                  <BlockStack gap="200" align="center">
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--p-color-bg-surface-info)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Icon source={CashDollarIcon} />
                    </div>
                    <Text variant="heading2xl" as="h3">
                      {data.tiers.length}
                    </Text>
                    <Text variant="bodySm" tone="subdued" as="p" alignment="center">
                      Available Tiers
                    </Text>
                  </BlockStack>
                </Box>
              </Card>
              
              <Card>
                <Box padding="400">
                  <BlockStack gap="200" align="center">
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--p-color-bg-surface-info)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Icon source={PackageIcon} />
                    </div>
                    <Text variant="heading2xl" as="h3">
                      {data.tierProducts.length}
                    </Text>
                    <Text variant="bodySm" tone="subdued" as="p" alignment="center">
                      Tier Products
                    </Text>
                  </BlockStack>
                </Box>
              </Card>
              
              <Card>
                <Box padding="400">
                  <BlockStack gap="200" align="center">
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--p-color-bg-surface-success)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Icon source={CheckCircleIcon} />
                    </div>
                    <Text variant="heading2xl" as="h3">
                      {data.tierProducts.filter(p => p.isActive).length}
                    </Text>
                    <Text variant="bodySm" tone="subdued" as="p" alignment="center">
                      Active Products
                    </Text>
                  </BlockStack>
                </Box>
              </Card>
            </div>
          </Layout.Section>
          
          {/* Products Grid - Symmetric Card Layout */}
          <Layout.Section>
            {isRefreshing && data.tierProducts.length === 0 ? (
              <Card>
                <Box padding="400">
                  <BlockStack gap="300">
                    <SkeletonBodyText lines={1} />
                    <SkeletonBodyText lines={3} />
                    <SkeletonBodyText lines={2} />
                  </BlockStack>
                </Box>
              </Card>
            ) : data.tierProducts.length === 0 ? (
              <Card>
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
                  <Text variant="bodySm" tone="subdued" as="p">
                    Products will appear here automatically after creation. Refreshing every 30 seconds...
                  </Text>
                </EmptyState>
              </Card>
            ) : (
              <>
                {isRefreshing && (
                  <Box paddingBlockEnd="400">
                    <InlineStack align="center" gap="200">
                      <Spinner size="small" />
                      <Text variant="bodySm" tone="subdued" as="span">
                        Refreshing products...
                      </Text>
                    </InlineStack>
                  </Box>
                )}
                
                {/* Symmetric Product Cards Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                  gap: 'var(--p-space-400)',
                }}>
                  {data.tierProducts.map((product) => {
                    const tier = data.tiers.find(t => t.id === product.tierId);
                    const tierStyle = tier ? getTierStyle(tier.name) : { gradient: '', icon: '🏆' };
                    
                    return (
                      <Card key={product.id}>
                        <Box padding="400">
                          <BlockStack gap="400">
                            {/* Product Header - Symmetrical */}
                            <InlineStack align="space-between" blockAlign="start">
                              <BlockStack gap="200">
                                <InlineStack gap="200" align="start">
                                  <div style={{
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '8px',
                                    background: tierStyle.gradient || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '20px'
                                  }}>
                                    {tierStyle.icon}
                                  </div>
                                  <BlockStack gap="050">
                                    <Text variant="headingMd" as="h3">
                                      {product.tierName}
                                    </Text>
                                    <Badge tone={product.isActive ? "success" : "attention"}>
                                      {product.isActive ? "Active" : "Draft"}
                                    </Badge>
                                  </BlockStack>
                                </InlineStack>
                              </BlockStack>
                            </InlineStack>
                            
                            <Divider />
                            
                            {/* Product Details - Balanced Layout */}
                            <BlockStack gap="300">
                              <InlineStack align="space-between">
                                <Text variant="bodySm" tone="subdued" as="span">Duration</Text>
                                <Text variant="bodyMd" fontWeight="semibold" as="span">
                                  {formatDuration(product.duration)}
                                </Text>
                              </InlineStack>
                              
                              <InlineStack align="space-between">
                                <Text variant="bodySm" tone="subdued" as="span">Price</Text>
                                <Text variant="headingMd" as="span" fontWeight="bold">
                                  {formatAmount(product.price)}
                                </Text>
                              </InlineStack>
                              
                              <InlineStack align="space-between">
                                <Text variant="bodySm" tone="subdued" as="span">SKU</Text>
                                <Text variant="bodySm" as="code" fontWeight="medium">
                                  {product.sku}
                                </Text>
                              </InlineStack>
                              
                              {tier && (
                                <InlineStack align="space-between">
                                  <Text variant="bodySm" tone="subdued" as="span">Cashback</Text>
                                  <Badge tone="info">
                                    {tier.cashbackPercent}%
                                  </Badge>
                                </InlineStack>
                              )}
                            </BlockStack>
                            
                            <Divider />
                            
                            {/* Action Buttons - Symmetrical */}
                            <InlineStack gap="200" align="stretch">
                              <div style={{ flex: 1 }}>
                                <Button 
                                  fullWidth
                                  icon={EditIcon}
                                  onClick={() => {
                                    // TODO: Implement edit functionality
                                    console.log("Edit", product.id);
                                  }}
                                >
                                  Edit
                                </Button>
                              </div>
                              <div style={{ flex: 1 }}>
                                <Button 
                                  fullWidth
                                  tone="critical"
                                  icon={DeleteIcon}
                                  onClick={() => handleDeleteProduct(product.id)}
                                >
                                  Delete
                                </Button>
                              </div>
                            </InlineStack>
                          </BlockStack>
                        </Box>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </Layout.Section>
          
          {/* How It Works Section - Symmetric Grid Layout */}
          <Layout.Section>
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2" alignment="center">
                    How Tier Products Work
                  </Text>
                  
                  {/* Symmetric 2x2 Grid for Steps */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: 'var(--p-space-400)',
                  }}>
                    {/* Step 1 */}
                    <Card>
                      <Box padding="300">
                        <BlockStack gap="200" align="center">
                          <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--p-color-bg-surface-brand)',
                            color: 'var(--p-color-text-on-color)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 'bold',
                            fontSize: '18px'
                          }}>
                            1
                          </div>
                          <Text variant="bodyMd" fontWeight="semibold" as="h4" alignment="center">
                            Create Product
                          </Text>
                          <Text variant="bodySm" tone="subdued" as="p" alignment="center">
                            Select a tier and create a Shopify product with custom pricing and duration.
                          </Text>
                        </BlockStack>
                      </Box>
                    </Card>
                    
                    {/* Step 2 */}
                    <Card>
                      <Box padding="300">
                        <BlockStack gap="200" align="center">
                          <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--p-color-bg-surface-brand)',
                            color: 'var(--p-color-text-on-color)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 'bold',
                            fontSize: '18px'
                          }}>
                            2
                          </div>
                          <Text variant="bodyMd" fontWeight="semibold" as="h4" alignment="center">
                            Customer Purchase
                          </Text>
                          <Text variant="bodySm" tone="subdued" as="p" alignment="center">
                            Customers buy the product through your store like any other item.
                          </Text>
                        </BlockStack>
                      </Box>
                    </Card>
                    
                    {/* Step 3 */}
                    <Card>
                      <Box padding="300">
                        <BlockStack gap="200" align="center">
                          <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--p-color-bg-surface-brand)',
                            color: 'var(--p-color-text-on-color)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 'bold',
                            fontSize: '18px'
                          }}>
                            3
                          </div>
                          <Text variant="bodyMd" fontWeight="semibold" as="h4" alignment="center">
                            Automatic Assignment
                          </Text>
                          <Text variant="bodySm" tone="subdued" as="p" alignment="center">
                            Upon purchase completion, the customer is automatically assigned to the tier.
                          </Text>
                        </BlockStack>
                      </Box>
                    </Card>
                    
                    {/* Step 4 */}
                    <Card>
                      <Box padding="300">
                        <BlockStack gap="200" align="center">
                          <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--p-color-bg-surface-success)',
                            color: 'var(--p-color-text-on-color)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 'bold',
                            fontSize: '18px'
                          }}>
                            ✓
                          </div>
                          <Text variant="bodyMd" fontWeight="semibold" as="h4" alignment="center">
                            Benefits Activated
                          </Text>
                          <Text variant="bodySm" tone="subdued" as="p" alignment="center">
                            Customer immediately receives all tier benefits including cashback rates.
                          </Text>
                        </BlockStack>
                      </Box>
                    </Card>
                  </div>
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