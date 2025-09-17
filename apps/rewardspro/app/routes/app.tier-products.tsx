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
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { formatCurrency } from "../utils/currency";
import { TierBadge } from "../components/TierBadge";
import { getTierStyle } from "../utils/tier-styles";
import { SellingPlanManagerEnhanced } from "../services/subscription/selling-plan-manager-enhanced.server";
import { TierProductManagerEnhanced } from "../services/tier-products/tier-product-manager-enhanced.server";
import { PriceSyncService } from "../services/subscription/price-sync.server";
import { v4 as uuidv4 } from 'uuid';

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
  hasSubscription?: boolean;
  sellingPlanGroupId?: string;
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
    
    // Try to fetch tier products from database (if table exists)
    let dbTierProducts: any[] = [];
    try {
      dbTierProducts = await (db as any).tierProduct.findMany({
        where: { shop },
        include: {
          tier: true,
        }
      });
    } catch (error) {
      console.log('[TierProducts] Database table not yet available, using Shopify data only');
      // Table might not exist yet, continue with empty array
    }
    
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
              sellingPlanGroups(first: 1) {
                edges {
                  node {
                    id
                    name
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
          
          // Check if this product exists in database
          const dbProduct = dbTierProducts.find(p => 
            p.shopifyProductId === product.id.replace('gid://shopify/Product/', '')
          );
          
          const hasSubscription = product.sellingPlanGroups?.edges?.length > 0 || dbProduct?.hasSubscription;
          const sellingPlanGroupId = product.sellingPlanGroups?.edges?.[0]?.node?.id || dbProduct?.sellingPlanGroupId;
          
          tierProducts.push({
            id: product.id,
            tierId: matchingTier?.id || dbProduct?.tierId || '',
            tierName: dbProduct?.tier?.name || tierName,
            shopifyProductId: product.id,
            shopifyVariantId: variant.id,
            productHandle: product.handle,
            sku: variant.sku || dbProduct?.sku || '',
            price: parseFloat(variant.price || '0'),
            duration: dbProduct?.duration || duration,
            features: dbProduct?.features || [],
            isActive: product.status === 'ACTIVE',
            hasSubscription,
            sellingPlanGroupId,
            createdAt: dbProduct?.createdAt?.toISOString() || new Date().toISOString(),
            updatedAt: dbProduct?.updatedAt?.toISOString() || new Date().toISOString(),
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
      const enableSubscription = formData.get("enableSubscription") === "true";
      const subscriptionOptions = enableSubscription ? JSON.parse(formData.get("subscriptionOptions") as string || "{}") : null;
      
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
            // Try to create TierProduct record in database
            let tierProduct: any = null;
            try {
              tierProduct = await (db as any).tierProduct.create({
              data: {
                id: uuidv4(),
                shop,
                tierId,
                shopifyProductId: product.id.replace('gid://shopify/Product/', ''),
                shopifyVariantId: variant.id.replace('gid://shopify/ProductVariant/', ''),
                productHandle: product.handle,
                sku: variant.sku,
                purchaseType: enableSubscription ? "BOTH" : "ONE_TIME",
                duration: duration as any,
                hasSubscription: enableSubscription,
                oneTimePrice: price,
                monthlyPrice: enableSubscription && duration === "MONTHLY" ? price : null,
                quarterlyPrice: enableSubscription && duration === "QUARTERLY" ? price : null,
                annualPrice: enableSubscription && duration === "ANNUAL" ? price : null,
                features: features.length > 0 ? features : null,
                description,
                isActive: true,
              }
              });
            } catch (dbError) {
              console.log('[TierProducts] Could not create database record (table may not exist yet)');
              // Continue without database record
            }

            // Create selling plans if subscription is enabled
            if (enableSubscription && subscriptionOptions) {
              try {
                // First, create or get the selling plan group for this tier
                const sellingPlanResult = await SellingPlanManagerEnhanced.associateProductWithSellingPlanGroup({
                  shop,
                  admin,
                  productId: product.id,
                  variantId: variant.id,
                  tierId: tierProduct.tierId,
                });

                if (sellingPlanResult.sellingPlanGroupId) {
                  // Update TierProduct with selling plan IDs
                  await (db as any).tierProduct.update({
                    where: { id: tierProduct.id },
                    data: {
                      sellingPlanGroupId: sellingPlanResult.sellingPlanGroupId,
                      subscriptionPlanIds: sellingPlanResult.sellingPlanIds,
                    }
                  });

                  console.log(`[TierProducts] Associated product ${product.id} with selling plan group ${sellingPlanResult.sellingPlanGroupId}`);
                  
                  // Configure the subscription pricing based on options
                  const pricingUpdates = [];
                  if (subscriptionOptions.enableMonthly) {
                    pricingUpdates.push({
                      interval: 'MONTHLY',
                      discount: parseFloat(subscriptionOptions.monthlyDiscount || '0')
                    });
                  }
                  if (subscriptionOptions.enableQuarterly) {
                    pricingUpdates.push({
                      interval: 'QUARTERLY',
                      discount: parseFloat(subscriptionOptions.quarterlyDiscount || '5')
                    });
                  }
                  if (subscriptionOptions.enableAnnual) {
                    pricingUpdates.push({
                      interval: 'ANNUAL',
                      discount: parseFloat(subscriptionOptions.annualDiscount || '15')
                    });
                  }
                  
                  // Store subscription configuration in TierProduct metadata
                  await (db as any).tierProduct.update({
                    where: { id: tierProduct.id },
                    data: {
                      subscriptionConfig: {
                        options: subscriptionOptions,
                        pricingUpdates
                      }
                    }
                  });
                } else {
                  console.error(`[TierProducts] Failed to associate product with selling plan group`);
                }
              } catch (error) {
                console.error("[TierProducts] Error creating selling plans:", error);
                // Continue even if selling plan creation fails
              }
            }

            return json({
              success: true,
              message: enableSubscription 
                ? "Product created with subscription options" 
                : "Product created successfully",
              product: {
                id: product.id,
                title: product.title,
                handle: product.handle,
                variantId: variant.id,
                sku: variant.sku,
                price: variant.price,
                hasSubscription: enableSubscription,
              }
            });
          }
        }
      }
      
      return json({ 
        success: false, 
        error: "Failed to create product" 
      }, { status: 500 });
      
    } else if (intent === "update-product") {
      const productId = formData.get("productId") as string;
      const price = parseFloat(formData.get("price") as string);
      const description = formData.get("description") as string;
      const tierName = formData.get("tierName") as string;
      const duration = formData.get("duration") as string;
      
      // Update product using productUpdate mutation
      const updateProductResponse = await admin.graphql(
        `#graphql
        mutation updateProduct($input: ProductInput!) {
          productUpdate(input: $input) {
            product {
              id
              title
              handle
              status
              descriptionHtml
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
            userErrors {
              field
              message
            }
          }
        }`,
        {
          variables: {
            input: {
              id: productId,
              title: `${tierName} Tier Membership - ${formatDuration(duration)}`,
              descriptionHtml: description || `<p>Unlock exclusive ${tierName} tier benefits with this ${formatDuration(duration).toLowerCase()} membership.</p>`,
              status: "ACTIVE",
            }
          },
        }
      );
      
      const updateResult = await updateProductResponse.json();
      
      if (updateResult.data?.productUpdate?.userErrors?.length > 0) {
        const errors = updateResult.data.productUpdate.userErrors.map((e: any) => e.message).join(", ");
        return json({ 
          success: false, 
          error: `Failed to update product: ${errors}` 
        }, { status: 400 });
      }
      
      // Update variant price if changed
      if (updateResult.data?.productUpdate?.product) {
        const product = updateResult.data.productUpdate.product;
        const variant = product.variants.edges[0]?.node;
        
        if (variant && variant.price !== price.toString()) {
          // Get product options first
          const getOptionsResponse = await admin.graphql(
            `#graphql
            query getProductOptions($id: ID!) {
              product(id: $id) {
                options {
                  id
                  name
                  position
                  values
                }
              }
            }`,
            {
              variables: { id: productId }
            }
          );
          
          const optionsResult = await getOptionsResponse.json();
          const productOptions = optionsResult.data?.product?.options || [];
          
          // Build optionValues array
          const optionValues = productOptions.map((option: any) => ({
            optionName: option.name,
            name: option.values[0] || "Default Title"
          }));
          
          // Update variant price using productSet
          const updateVariantResponse = await admin.graphql(
            `#graphql
            mutation productSet($input: ProductSetInput!) {
              productSet(input: $input) {
                product {
                  id
                  variants(first: 1) {
                    edges {
                      node {
                        id
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
                  id: productId,
                  productOptions: productOptions.map((opt: any) => ({
                    name: opt.name,
                    values: opt.values.map((v: string) => ({ name: v }))
                  })),
                  variants: [{
                    id: variant.id,
                    price: price.toString(),
                    optionValues: optionValues
                  }]
                }
              }
            }
          );
          
          const variantResult = await updateVariantResponse.json();
          
          if (variantResult.data?.productSet?.userErrors?.length > 0) {
            const errors = variantResult.data.productSet.userErrors.map((e: any) => e.message).join(", ");
            console.error("Failed to update variant price:", errors);
          }
        }
      }
      
      return json({
        success: true,
        message: "Product updated successfully",
        product: updateResult.data?.productUpdate?.product,
      });
      
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
      
    } else if (intent === "sync-prices") {
      const productId = formData.get("productId") as string;
      const variantId = formData.get("variantId") as string;
      const newPrice = parseFloat(formData.get("price") as string);
      
      // Get tier product to find selling plan group
      const tierProduct = await db.tierProduct.findFirst({
        where: {
          shop,
          shopifyProductId: productId,
        },
      });
      
      if (!tierProduct) {
        return json({ 
          success: false, 
          error: "Tier product not found" 
        }, { status: 404 });
      }
      
      // Sync prices between product and selling plans
      const syncResult = await PriceSyncService.syncProductWithSellingPlans({
        shop,
        admin,
        productId,
        variantId,
        newPrice,
        sellingPlanGroupId: tierProduct.sellingPlanGroupId || undefined,
        discountPercentage: 10, // Default discount, could be made configurable
      });
      
      if (!syncResult.success) {
        return json({ 
          success: false, 
          error: `Failed to sync prices: ${syncResult.errors?.join(", ")}` 
        }, { status: 400 });
      }
      
      return json({
        success: true,
        message: "Prices synchronized successfully",
        data: syncResult,
      });
      
    } else if (intent === "delete-product") {
      const productId = formData.get("productId") as string;
      
      // Try to delete tier product record first
      try {
        await (db as any).tierProduct.deleteMany({
          where: {
            shop,
            shopifyProductId: productId,
          },
        });
      } catch (error) {
        console.log('[TierProducts] Could not delete database record');
      }
      
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
      
    } else if (intent === "reset-selling-plans") {
      // Reset all selling plans to use new descriptions
      console.log("[TierProducts] Resetting selling plans with new descriptions");
      
      // First, remove existing selling plan group
      await SellingPlanManagerEnhanced.removeSellingPlanGroup({ shop, admin });
      
      // Get all tier products from Shopify
      const productsQuery = `#graphql
        query getProducts {
          products(first: 100, query: "tag:tier-product") {
            edges {
              node {
                id
                variants(first: 1) {
                  edges {
                    node {
                      id
                    }
                  }
                }
              }
            }
          }
        }
      `;
      
      const productsResponse = await admin.graphql(productsQuery);
      const productsResult = await productsResponse.json();
      
      if (productsResult.data?.products?.edges?.length > 0) {
        // Collect variant IDs
        const variantIds: string[] = [];
        const tierIds: string[] = [];
        
        for (const edge of productsResult.data.products.edges) {
          const variant = edge.node.variants.edges[0]?.node;
          if (variant) {
            variantIds.push(variant.id);
            tierIds.push("dummy-tier-id"); // We don't need real tier IDs for this
          }
        }
        
        // Create new selling plan group with updated descriptions
        if (variantIds.length > 0) {
          const productVariantMap = new Map();
          variantIds.forEach((variantId, index) => {
            productVariantMap.set(tierIds[index], variantId);
          });
          
          await SellingPlanManagerEnhanced.createSellingPlanGroup({
            shop,
            admin,
            tierIds,
            productVariantMap,
          });
        }
      }
      
      return json({ 
        success: true, 
        message: "Selling plans have been reset with new descriptions" 
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
  const [editModalActive, setEditModalActive] = useState(false);
  const [editingProduct, setEditingProduct] = useState<TierProduct | null>(null);
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
  const [enableSubscription, setEnableSubscription] = useState(false);
  const [subscriptionDiscountPercent, setSubscriptionDiscountPercent] = useState("10");
  const [subscriptionOptions, setSubscriptionOptions] = useState({
    enableMonthly: true,
    enableQuarterly: true,
    enableAnnual: true,
    monthlyDiscount: "0",
    quarterlyDiscount: "5",
    annualDiscount: "15",
  });
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
    setEnableSubscription(false);
    setSubscriptionDiscountPercent("10");
    setSubscriptionOptions({
      enableMonthly: true,
      enableQuarterly: true,
      enableAnnual: true,
      monthlyDiscount: "0",
      quarterlyDiscount: "5",
      annualDiscount: "15",
    });
  }, []);
  
  // Handle modal close
  const handleModalClose = useCallback(() => {
    setModalActive(false);
    setEnableSubscription(false);
    setSubscriptionDiscountPercent("10");
    setSubscriptionOptions({
      enableMonthly: true,
      enableQuarterly: true,
      enableAnnual: true,
      monthlyDiscount: "0",
      quarterlyDiscount: "5",
      annualDiscount: "15",
    });
  }, []);
  
  // Handle edit modal open
  const handleEditModalOpen = useCallback((product: TierProduct) => {
    setEditingProduct(product);
    setSelectedTier(product.tierId);
    setPrice(product.price.toString());
    setDuration(product.duration);
    setDescription(""); // Would need to fetch from Shopify if needed
    setFeatures(product.features || [
      "Access to exclusive tier benefits",
      "Cashback rewards on purchases",
      "Priority customer support"
    ]);
    setEditModalActive(true);
  }, []);
  
  // Handle edit modal close
  const handleEditModalClose = useCallback(() => {
    setEditModalActive(false);
    setEditingProduct(null);
    setEnableSubscription(false);
    setSubscriptionDiscountPercent("10");
    setSubscriptionOptions({
      enableMonthly: true,
      enableQuarterly: true,
      enableAnnual: true,
      monthlyDiscount: "0",
      quarterlyDiscount: "5",
      annualDiscount: "15",
    });
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
    formData.append("enableSubscription", enableSubscription.toString());
    if (enableSubscription) {
      formData.append("subscriptionOptions", JSON.stringify(subscriptionOptions));
    }
    
    submit(formData, { method: "post" });
    handleModalClose();
  }, [selectedTier, price, duration, description, features, enableSubscription, subscriptionOptions, data.tiers, submit, handleModalClose]);
  
  // Handle update product
  const handleUpdateProduct = useCallback(() => {
    if (!editingProduct || !price) {
      setToast({
        active: true,
        content: "Please enter a valid price",
        error: true,
      });
      return;
    }
    
    const formData = new FormData();
    formData.append("intent", "update-product");
    formData.append("productId", editingProduct.id);
    formData.append("tierName", editingProduct.tierName);
    formData.append("price", price);
    formData.append("duration", duration);
    formData.append("description", description);
    formData.append("features", JSON.stringify(features));
    formData.append("enableSubscription", enableSubscription.toString());
    if (enableSubscription) {
      formData.append("subscriptionOptions", JSON.stringify(subscriptionOptions));
    }
    
    submit(formData, { method: "post" });
    handleEditModalClose();
  }, [editingProduct, price, duration, description, features, enableSubscription, subscriptionOptions, submit, handleEditModalClose]);
  
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
      
      // Product created successfully
    }
  }, [actionData, revalidate]);
  
  
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
            content: "Reset Subscription Descriptions",
            onAction: () => {
              if (confirm("This will update all selling plan descriptions. Continue?")) {
                const form = new FormData();
                form.append("intent", "reset-selling-plans");
                submit(form, { method: "post" });
              }
            },
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
                </EmptyState>
              </Card>
            ) : (
              <>
                
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
                                    <InlineStack gap="100">
                                      <Badge tone={product.isActive ? "success" : "attention"}>
                                        {product.isActive ? "Active" : "Draft"}
                                      </Badge>
                                      {product.hasSubscription && (
                                        <Badge tone="info" icon={CalendarIcon}>
                                          Subscription
                                        </Badge>
                                      )}
                                    </InlineStack>
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
                              
                              {product.hasSubscription && (
                                <Box background="bg-surface-info" padding="200" borderRadius="100">
                                  <InlineStack gap="200" align="start">
                                    <Icon source={CheckCircleIcon} tone="info" />
                                    <Text variant="bodySm" as="span">
                                      Subscription plans available
                                    </Text>
                                  </InlineStack>
                                </Box>
                              )}
                            </BlockStack>
                            
                            <Divider />
                            
                            {/* Action Buttons - Symmetrical */}
                            <InlineStack gap="200" align="stretch">
                              <div style={{ flex: 1 }}>
                                <Button 
                                  fullWidth
                                  icon={EditIcon}
                                  onClick={() => handleEditModalOpen(product)}
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
              
              <Divider />
              
              <BlockStack gap="300">
                <Text variant="headingSm" as="h3">
                  Subscription Options
                </Text>
                
                <Checkbox
                  label="Enable recurring subscription"
                  checked={enableSubscription}
                  onChange={setEnableSubscription}
                  helpText="Allow customers to subscribe for automatic renewal"
                />
                
                {enableSubscription && (
                  <Box paddingInlineStart="600">
                    <BlockStack gap="400">
                      <Text variant="bodyMd" fontWeight="semibold" as="span">
                        Subscription Billing Options
                      </Text>
                      
                      <BlockStack gap="300">
                        <InlineStack gap="400" align="space-between">
                          <Checkbox
                            label="Monthly billing"
                            checked={subscriptionOptions.enableMonthly}
                            onChange={(value) => setSubscriptionOptions({...subscriptionOptions, enableMonthly: value})}
                          />
                          <div style={{ width: '120px' }}>
                            <TextField
                              label=""
                              type="number"
                              value={subscriptionOptions.monthlyDiscount}
                              onChange={(value) => setSubscriptionOptions({...subscriptionOptions, monthlyDiscount: value})}
                              suffix="% off"
                              disabled={!subscriptionOptions.enableMonthly}
                              autoComplete="off"
                            />
                          </div>
                        </InlineStack>
                        
                        <InlineStack gap="400" align="space-between">
                          <Checkbox
                            label="Quarterly billing (3 months)"
                            checked={subscriptionOptions.enableQuarterly}
                            onChange={(value) => setSubscriptionOptions({...subscriptionOptions, enableQuarterly: value})}
                          />
                          <div style={{ width: '120px' }}>
                            <TextField
                              label=""
                              type="number"
                              value={subscriptionOptions.quarterlyDiscount}
                              onChange={(value) => setSubscriptionOptions({...subscriptionOptions, quarterlyDiscount: value})}
                              suffix="% off"
                              disabled={!subscriptionOptions.enableQuarterly}
                              autoComplete="off"
                            />
                          </div>
                        </InlineStack>
                        
                        <InlineStack gap="400" align="space-between">
                          <Checkbox
                            label="Annual billing (12 months)"
                            checked={subscriptionOptions.enableAnnual}
                            onChange={(value) => setSubscriptionOptions({...subscriptionOptions, enableAnnual: value})}
                          />
                          <div style={{ width: '120px' }}>
                            <TextField
                              label=""
                              type="number"
                              value={subscriptionOptions.annualDiscount}
                              onChange={(value) => setSubscriptionOptions({...subscriptionOptions, annualDiscount: value})}
                              suffix="% off"
                              disabled={!subscriptionOptions.enableAnnual}
                              autoComplete="off"
                            />
                          </div>
                        </InlineStack>
                      </BlockStack>
                      
                      <Banner status="info">
                        <p>
                          Customers will be able to choose from the enabled billing frequencies:
                        </p>
                        <ul style={{ marginLeft: '20px', marginTop: '8px' }}>
                          {subscriptionOptions.enableMonthly && (
                            <li>Monthly: {data.shopSettings?.storeCurrency || "USD"} {(parseFloat(price || '0') * (1 - parseFloat(subscriptionOptions.monthlyDiscount) / 100)).toFixed(2)}/month</li>
                          )}
                          {subscriptionOptions.enableQuarterly && (
                            <li>Quarterly: {data.shopSettings?.storeCurrency || "USD"} {(parseFloat(price || '0') * 3 * (1 - parseFloat(subscriptionOptions.quarterlyDiscount) / 100)).toFixed(2)} every 3 months</li>
                          )}
                          {subscriptionOptions.enableAnnual && (
                            <li>Annual: {data.shopSettings?.storeCurrency || "USD"} {(parseFloat(price || '0') * 12 * (1 - parseFloat(subscriptionOptions.annualDiscount) / 100)).toFixed(2)}/year</li>
                          )}
                        </ul>
                      </Banner>
                    </BlockStack>
                  </Box>
                )}
              </BlockStack>
              
              <Divider />
              
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
        
        {/* Edit Product Modal */}
        <Modal
          open={editModalActive}
          onClose={handleEditModalClose}
          title="Edit Tier Product"
          primaryAction={{
            content: "Update Product",
            onAction: handleUpdateProduct,
            loading: isLoading,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: handleEditModalClose,
            },
          ]}
        >
          <Modal.Section>
            <FormLayout>
              {editingProduct && (
                <>
                  <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <Text variant="bodyMd" fontWeight="semibold" as="span">
                          Current Product
                        </Text>
                        <Badge>{editingProduct.tierName}</Badge>
                      </InlineStack>
                      <Text variant="bodySm" tone="subdued" as="p">
                        {editingProduct.tierName} Tier Membership - {formatDuration(editingProduct.duration)}
                      </Text>
                    </BlockStack>
                  </Box>
                  
                  <TextField
                    label="Price"
                    type="number"
                    value={price}
                    onChange={setPrice}
                    prefix={data.shopSettings?.storeCurrency || "USD"}
                    helpText="Update the price for this membership"
                    autoComplete="off"
                  />
                  
                  <Select
                    label="Duration"
                    options={durationOptions}
                    value={duration}
                    onChange={setDuration}
                    helpText="Change how long the membership lasts"
                  />
                  
                  <TextField
                    label="Description"
                    value={description}
                    onChange={setDescription}
                    multiline={4}
                    helpText="Update the product description"
                    autoComplete="off"
                  />
                  
                  <BlockStack gap="200">
                    <Divider />
                    
                    <Checkbox
                      label="Enable recurring subscription"
                      checked={enableSubscription}
                      onChange={setEnableSubscription}
                      helpText="Allow customers to subscribe for automatic renewal"
                    />
                    
                    {enableSubscription && (
                      <Box paddingInlineStart="600">
                        <BlockStack gap="400">
                          <Text variant="bodyMd" fontWeight="semibold" as="span">
                            Subscription Billing Options
                          </Text>
                          
                          <BlockStack gap="300">
                            <InlineStack gap="400" align="space-between">
                              <Checkbox
                                label="Monthly billing"
                                checked={subscriptionOptions.enableMonthly}
                                onChange={(value) => setSubscriptionOptions({...subscriptionOptions, enableMonthly: value})}
                              />
                              <div style={{ width: '120px' }}>
                                <TextField
                                  label=""
                                  type="number"
                                  value={subscriptionOptions.monthlyDiscount}
                                  onChange={(value) => setSubscriptionOptions({...subscriptionOptions, monthlyDiscount: value})}
                                  suffix="% off"
                                  disabled={!subscriptionOptions.enableMonthly}
                                  autoComplete="off"
                                />
                              </div>
                            </InlineStack>
                            
                            <InlineStack gap="400" align="space-between">
                              <Checkbox
                                label="Quarterly billing (3 months)"
                                checked={subscriptionOptions.enableQuarterly}
                                onChange={(value) => setSubscriptionOptions({...subscriptionOptions, enableQuarterly: value})}
                              />
                              <div style={{ width: '120px' }}>
                                <TextField
                                  label=""
                                  type="number"
                                  value={subscriptionOptions.quarterlyDiscount}
                                  onChange={(value) => setSubscriptionOptions({...subscriptionOptions, quarterlyDiscount: value})}
                                  suffix="% off"
                                  disabled={!subscriptionOptions.enableQuarterly}
                                  autoComplete="off"
                                />
                              </div>
                            </InlineStack>
                            
                            <InlineStack gap="400" align="space-between">
                              <Checkbox
                                label="Annual billing (12 months)"
                                checked={subscriptionOptions.enableAnnual}
                                onChange={(value) => setSubscriptionOptions({...subscriptionOptions, enableAnnual: value})}
                              />
                              <div style={{ width: '120px' }}>
                                <TextField
                                  label=""
                                  type="number"
                                  value={subscriptionOptions.annualDiscount}
                                  onChange={(value) => setSubscriptionOptions({...subscriptionOptions, annualDiscount: value})}
                                  suffix="% off"
                                  disabled={!subscriptionOptions.enableAnnual}
                                  autoComplete="off"
                                />
                              </div>
                            </InlineStack>
                          </BlockStack>
                          
                          <Banner status="info">
                            <p>
                              Customers will be able to choose from the enabled billing frequencies:
                            </p>
                            <ul style={{ marginLeft: '20px', marginTop: '8px' }}>
                              {subscriptionOptions.enableMonthly && (
                                <li>Monthly: {data.shopSettings?.storeCurrency || "USD"} {(parseFloat(price || '0') * (1 - parseFloat(subscriptionOptions.monthlyDiscount) / 100)).toFixed(2)}/month</li>
                              )}
                              {subscriptionOptions.enableQuarterly && (
                                <li>Quarterly: {data.shopSettings?.storeCurrency || "USD"} {(parseFloat(price || '0') * 3 * (1 - parseFloat(subscriptionOptions.quarterlyDiscount) / 100)).toFixed(2)} every 3 months</li>
                              )}
                              {subscriptionOptions.enableAnnual && (
                                <li>Annual: {data.shopSettings?.storeCurrency || "USD"} {(parseFloat(price || '0') * 12 * (1 - parseFloat(subscriptionOptions.annualDiscount) / 100)).toFixed(2)}/year</li>
                              )}
                            </ul>
                          </Banner>
                        </BlockStack>
                      </Box>
                    )}
                  </BlockStack>
                  
                  <Divider />
                  
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
                </>
              )}
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