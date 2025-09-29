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
} from "~/utils/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { formatCurrency } from "../utils/currency";
import { TierBadge } from "../components/TierBadge";
import { getTierStyle } from "../utils/tier-styles";
import { SellingPlanManagerEnhanced } from "../services/subscription/selling-plan-manager-enhanced.server";
import { TierProductManagerEnhanced } from "../services/tier-products/tier-product-manager-enhanced.server";
import { ProductCreatorV2 } from "../services/tier-products/product-creator-v2.server";
import { PriceSyncService } from "../services/subscription/price-sync.server";
import { SubscriptionOptionsManager, type SubscriptionOption } from "../components/SubscriptionOptionsManager";
import { TryBeforeYouBuyForm } from "../components/TryBeforeYouBuyForm";
import { v4 as uuidv4 } from 'uuid';
import { generateTierSKU as generateSKUFromUtils, isValidSKU } from "../utils/sku-generator";

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
  publishedAt?: string | null;
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
  tierDistribution: Record<string, number>;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

// Generate a unique SKU for tier products using the centralized utility
// Format: SHOP-TIER-DUR-DATE-RND
// Example: TESTS-GOLD-MON-2501-X9K (TestStore - Gold - Monthly - Jan 2025 - Random X9K)
function generateTierSKU(tierName: string, duration: string, shop: string): string {
  // Use the centralized SKU generator utility
  return generateSKUFromUtils({
    tierName,
    duration,
    shop,
    productType: 'tier',
    includeDate: true
  });
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
    // Fetch tiers, shop settings, and tier distribution
    const [tiers, shopSettings, customers] = await Promise.all([
      db.tier.findMany({
        where: { shop },
        orderBy: { minSpend: 'asc' },
      }),
      db.shopSettings.findUnique({
        where: { shop },
      }),
      db.customer.findMany({
        where: { shop },
        select: { currentTierId: true },
      }),
    ]);

    // Calculate tier distribution
    const tierDistribution: Record<string, number> = {};
    customers.forEach((customer) => {
      if (customer.currentTierId) {
        tierDistribution[customer.currentTierId] = (tierDistribution[customer.currentTierId] || 0) + 1;
      }
    });
    
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
              publishedAt
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
            publishedAt: product.publishedAt,
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
      tierDistribution,
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
    // Handle tier management actions
    if (intent === "create" || intent === "update" || intent === "delete") {
      switch (intent) {
        case "create": {
          const name = formData.get("name") as string;
          const minSpend = Number(formData.get("minSpend"));
          const cashbackPercent = Number(formData.get("cashbackPercent"));
          const evaluationPeriod = formData.get("evaluationPeriod") as "ANNUAL" | "LIFETIME";

          // Validate inputs
          if (!name || name.trim().length === 0) {
            return json({ error: "Name is required" }, { status: 400 });
          }
          if (isNaN(minSpend) || minSpend < 0) {
            return json({ error: "Invalid minimum spend" }, { status: 400 });
          }
          if (isNaN(cashbackPercent) || cashbackPercent < 0 || cashbackPercent > 100) {
            return json({ error: "Cashback must be between 0 and 100" }, { status: 400 });
          }

          // Check for duplicate
          const existing = await db.tier.findFirst({
            where: { shop, name: name.trim() },
          });

          if (existing) {
            return json({ error: `A tier named "${name}" already exists` }, { status: 400 });
          }

          // Create tier
          const storeName = shop.split('.')[0];
          const tierId = `${storeName}-${name.trim().toLowerCase().replace(/\s+/g, '-')}`;

          // Create tier with timestamps
          await db.tier.create({
            data: {
              id: tierId,
              shop,
              name: name.trim(),
              minSpend,
              cashbackPercent,
              evaluationPeriod,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });

          return json({ success: true, message: "Tier created successfully" });
        }

        case "update": {
          const id = formData.get("id") as string;
          const name = formData.get("name") as string;
          const minSpend = Number(formData.get("minSpend"));
          const cashbackPercent = Number(formData.get("cashbackPercent"));
          const evaluationPeriod = formData.get("evaluationPeriod") as "ANNUAL" | "LIFETIME";

          if (!id) {
            return json({ error: "Tier ID is required" }, { status: 400 });
          }

          // Verify tier belongs to shop
          const existingTier = await db.tier.findFirst({
            where: { id, shop },
          });

          if (!existingTier) {
            return json({ error: "Tier not found" }, { status: 404 });
          }

          // Update tier
          await db.tier.update({
            where: { id },
            data: {
              name: name.trim(),
              minSpend,
              cashbackPercent,
              evaluationPeriod,
              updatedAt: new Date(),
            },
          });

          return json({ success: true, message: "Tier updated successfully" });
        }

        case "delete": {
          const id = formData.get("id") as string;

          if (!id) {
            return json({ error: "Tier ID is required" }, { status: 400 });
          }

          // Verify tier belongs to shop
          const existingTier = await db.tier.findFirst({
            where: { id, shop },
          });

          if (!existingTier) {
            return json({ error: "Tier not found" }, { status: 404 });
          }

          // Check if customers are assigned to this tier
          const customerCount = await db.customer.count({
            where: { shop, currentTierId: id },
          });

          if (customerCount > 0) {
            return json({
              error: `Cannot delete tier with ${customerCount} assigned customers. Please reassign customers first.`
            }, { status: 400 });
          }

          // Delete tier
          await db.tier.delete({
            where: { id },
          });

          return json({ success: true, message: "Tier deleted successfully" });
        }
      }
    }

    if (intent === "create-product") {
      const tierId = formData.get("tierId") as string;
      const tierName = formData.get("tierName") as string;
      const price = parseFloat(formData.get("price") as string);
      const duration = formData.get("duration") as string;
      const description = formData.get("description") as string;
      const features = JSON.parse(formData.get("features") as string || "[]");
      const enableSubscription = formData.get("enableSubscription") === "true";
      const subscriptionOptions = enableSubscription ? JSON.parse(formData.get("subscriptionOptions") as string || "{}") : null;
      
      // Fetch tier and shop settings for currency
      const [tier, shopSettings] = await Promise.all([
        db.tier.findFirst({
          where: { id: tierId, shop }
        }),
        db.shopSettings.findUnique({
          where: { shop }
        })
      ]);
      
      if (!tier) {
        return json({ 
          success: false, 
          error: "Tier not found" 
        }, { status: 404 });
      }
      
      if (!shopSettings) {
        return json({ 
          success: false, 
          error: "Shop settings not found. Please configure your shop settings first." 
        }, { status: 400 });
      }
      
      // Generate SKU
      const sku = generateTierSKU(tierName, duration, shop);
      
      // Direct productCreate mutation implementation
      const USE_DIRECT_MUTATION = false;  // Use ProductCreatorV2 service instead

      if (USE_DIRECT_MUTATION) {
        // Use the productCreate mutation directly as per Shopify documentation
        console.log('[TierProducts] Creating product with productCreate mutation');

        const productCreateMutation = `#graphql
          mutation productCreate($product: ProductCreateInput!) {
            productCreate(product: $product) {
              product {
                id
                title
                handle
                status
                vendor
                productType
                tags
                options {
                  id
                  name
                  position
                  optionValues {
                    id
                    name
                    hasVariants
                  }
                }
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
          }
        `;

        // Prepare product input with proper structure
        const productInput = {
          title: `${tierName} Tier Membership - ${formatDuration(duration)}`,
          descriptionHtml: description ? `<p>${description}</p>` : `<p>Unlock exclusive ${tierName} tier benefits with this ${formatDuration(duration).toLowerCase()} membership.</p>`,
          vendor: shop.split('.')[0],
          productType: "Tier Membership",
          status: "ACTIVE",
          tags: [
            "tier-membership",
            tierName.toLowerCase(),
            duration.toLowerCase(),
            enableSubscription ? "subscription-enabled" : "one-time"
          ],
          requiresSellingPlan: enableSubscription
        };

        // Create the product
        const createResponse = await admin.graphql(productCreateMutation, {
          variables: {
            product: productInput
          }
        });

        const createResult = await createResponse.json();

        // Check for errors
        if (createResult.data?.productCreate?.userErrors?.length > 0) {
          const errors = createResult.data.productCreate.userErrors.map((e: any) => e.message).join(", ");
          return json({
            success: false,
            error: `Failed to create product: ${errors}`
          }, { status: 400 });
        }

        const product = createResult.data?.productCreate?.product;
        if (!product) {
          return json({
            success: false,
            error: "Failed to create product"
          }, { status: 400 });
        }

        const variant = product.variants?.edges?.[0]?.node;

        // Update variant with price and SKU using productSet mutation (best practice from 2025-01)
        if (variant) {
          // First, fetch the product's existing options (required for productSet)
          const getOptionsQuery = `#graphql
            query getProductOptions($id: ID!) {
              product(id: $id) {
                options {
                  id
                  name
                  position
                  values
                }
              }
            }
          `;

          const optionsResponse = await admin.graphql(getOptionsQuery, {
            variables: { id: product.id }
          });

          const optionsResult = await optionsResponse.json();
          const productOptions = optionsResult.data?.product?.options || [
            { name: "Title", values: ["Default Title"] }
          ];

          // Build optionValues array for the variant
          const optionValues = productOptions.map((option: any) => ({
            optionName: option.name,
            name: option.values?.[0] || "Default Title"
          }));

          const updateVariantMutation = `#graphql
            mutation updateProductVariantPricing($input: ProductSetInput!, $synchronous: Boolean!, $identifier: ProductSetIdentifiers) {
              productSet(synchronous: $synchronous, input: $input, identifier: $identifier) {
                product {
                  id
                  variants(first: 5) {
                    nodes {
                      id
                      price
                      compareAtPrice
                      sku
                    }
                  }
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `;

          // Retry logic with exponential backoff
          let updateSuccess = false;
          let retryCount = 0;
          const maxRetries = 3;

          while (!updateSuccess && retryCount < maxRetries) {
            try {
              const variantUpdate = await admin.graphql(updateVariantMutation, {
                variables: {
                  synchronous: true,
                  identifier: { id: product.id },
                  input: {
                    // Include productOptions at the product level
                    productOptions: productOptions.map((opt: any) => ({
                      name: opt.name,
                      values: opt.values?.map((v: string) => ({ name: v })) || [{ name: "Default Title" }]
                    })),
                    variants: [
                      {
                        id: variant.id,
                        price: price.toString(),
                        sku: sku,
                        taxable: true,
                        // Include optionValues to match product options
                        optionValues: optionValues
                      }
                    ]
                  }
                }
              });

              const updateResult = await variantUpdate.json();

              // Handle both userErrors and GraphQL errors as per best practice
              if (updateResult.errors?.length > 0) {
                const errors = updateResult.errors.map((e: any) => e.message).join(', ');
                throw new Error(`GraphQL Errors: ${errors}`);
              }

              if (updateResult.data?.productSet?.userErrors?.length > 0) {
                const errors = updateResult.data.productSet.userErrors.map((e: any) =>
                  `${e.field}: ${e.message}`
                ).join(', ');
                console.warn('[TierProducts] User errors updating variant:', errors);

                // Don't retry on validation errors
                if (errors.includes('invalid') || errors.includes('required')) {
                  break;
                }
                throw new Error(`GraphQL User Errors: ${errors}`);
              }

              console.log('[TierProducts] Variant updated successfully with price and SKU');
              updateSuccess = true;

            } catch (error) {
              retryCount++;
              if (retryCount < maxRetries) {
                // Exponential backoff with jitter
                const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 30000) + Math.random() * 1000;
                console.log(`[TierProducts] Retrying variant update (attempt ${retryCount + 1}/${maxRetries}) after ${delay}ms`);
                await new Promise(resolve => setTimeout(resolve, delay));
              } else {
                console.error('[TierProducts] Failed to update variant after retries:', error);
              }
            }
          }
        } else {
          console.warn('[TierProducts] No variant found on created product');
        }

        // Store in database
        if (product.id && variant?.id) {
          try {
            await (db as any).tierProduct.create({
              data: {
                id: uuidv4(),
                shop,
                tierId,
                shopifyProductId: product.id.replace('gid://shopify/Product/', ''),
                shopifyVariantId: variant.id.replace('gid://shopify/ProductVariant/', ''),
                productHandle: product.handle || sku,
                sku: variant.sku || sku,
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
                createdAt: new Date(),
                updatedAt: new Date()
              }
            });

            // If subscription is enabled, create selling plans
            if (enableSubscription && subscriptionOptions) {
              const sellingPlanResult = await SellingPlanManagerEnhanced.createSellingPlanGroup({
                shop,
                admin,
                name: `${tierName} Tier Subscription`,
                merchantCode: `TIER_${tierName.toUpperCase()}`,
                description: `Subscription plans for ${tierName} tier membership`,
                options: [duration as "MONTHLY" | "QUARTERLY" | "ANNUAL"],
                products: [product.id]
              });

              if (!sellingPlanResult.success) {
                console.warn('[TierProducts] Could not create selling plans:', sellingPlanResult.error);
              }
            }
          } catch (dbError) {
            console.log('[TierProducts] Could not create database record:', dbError);
          }
        }

        // Try to publish to online store
        const publishMutation = `#graphql
          mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
            publishablePublish(id: $id, input: $input) {
              publishable {
                availablePublicationsCount {
                  count
                }
                resourcePublicationsCount {
                  count
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        // Try to get Online Store publication
        const publicationsQuery = `#graphql
          query {
            publications(first: 10) {
              edges {
                node {
                  id
                  name
                }
              }
            }
          }
        `;

        const pubResponse = await admin.graphql(publicationsQuery);
        const pubData = await pubResponse.json();

        let publicationStatus = {
          onlineStore: false,
          totalChannels: 0
        };

        const onlineStore = pubData.data?.publications?.edges?.find(
          (edge: any) => edge.node.name === "Online Store"
        );

        if (onlineStore) {
          const publishResponse = await admin.graphql(publishMutation, {
            variables: {
              id: product.id,
              input: [{ publicationId: onlineStore.node.id }]
            }
          });

          const publishData = await publishResponse.json();

          if (!publishData.data?.publishablePublish?.userErrors?.length) {
            publicationStatus = {
              onlineStore: true,
              totalChannels: publishData.data?.publishablePublish?.publishable?.resourcePublicationsCount?.count || 1
            };
          }
        }

        return json({
          success: true,
          message: publicationStatus.onlineStore
            ? `Product created and published to online store for ${tierName} tier`
            : `Product created successfully for ${tierName} tier (manual publication may be required)`,
          productId: product.id,
          hasSubscription: enableSubscription,
          publicationStatus
        });

      } else {
        // Use the new ProductCreatorV2 with retry logic for reliability
        console.log(`[TierProducts] Creating product with price: ${price}, SKU: ${sku}`);
        const result = await ProductCreatorV2.createAndPublishProductWithRetry(admin, {
          title: `${tierName} Tier Membership - ${formatDuration(duration)}`,
          description: description || `Unlock exclusive ${tierName} tier benefits with this ${formatDuration(duration).toLowerCase()} membership.`,
          vendor: shop.split('.')[0],
          productType: "Tier Membership",
          price: price.toString(),
          sku,
          tags: [
            "tier-membership",
            tierName.toLowerCase(),
            duration.toLowerCase(),
            enableSubscription ? "subscription-enabled" : "one-time"
          ],
          status: "ACTIVE",
          requiresShipping: false,
          taxable: true
        }, 3); // Max 3 retries with exponential backoff
        
        if (!result.success) {
          // Provide more detailed error messages for common issues
          let errorMessage = result.error || "Failed to create product";

          // Check for specific GraphQL errors and provide helpful messages
          if (errorMessage.includes("already exists")) {
            errorMessage = "A product with this SKU already exists. Please use a different tier or duration.";
          } else if (errorMessage.includes("invalid")) {
            errorMessage = "Invalid product data. Please check your inputs and try again.";
          } else if (errorMessage.includes("permission")) {
            errorMessage = "Your app doesn't have permission to create products. Please reinstall the app.";
          }

          return json({
            success: false,
            error: errorMessage
          }, { status: 400 });
        }
        
        // Store in database if successful
        if (result.productId && result.variantId) {
          try {
            await (db as any).tierProduct.create({
              data: {
                id: uuidv4(),
                shop,
                tierId,
                shopifyProductId: result.productId.replace('gid://shopify/Product/', ''),
                shopifyVariantId: result.variantId.replace('gid://shopify/ProductVariant/', ''),
                productHandle: result.handle || sku,
                sku,
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
                createdAt: new Date(),
                updatedAt: new Date()
              }
            });
            
            // If subscription is enabled, create selling plans
            if (enableSubscription && subscriptionOptions) {
              const sellingPlanResult = await SellingPlanManagerEnhanced.createSellingPlanGroup({
                shop,
                admin,
                name: `${tierName} Tier Subscription`,
                merchantCode: `TIER_${tierName.toUpperCase()}`,
                description: `Subscription plans for ${tierName} tier membership`,
                options: [duration as "MONTHLY" | "QUARTERLY" | "ANNUAL"],
                products: [result.productId]
              });
              
              if (!sellingPlanResult.success) {
                console.warn('[TierProducts] Could not create selling plans:', sellingPlanResult.error);
              }
            }
          } catch (dbError) {
            console.log('[TierProducts] Could not create database record:', dbError);
          }
        }
        
        // Verify publication status
        const publicationStatus = await ProductCreatorV2.verifyPublication(admin, result.productId!);
        
        return json({ 
          success: true, 
          message: publicationStatus.onlineStorePublished 
            ? `Product created and published to online store for ${tierName} tier`
            : `Product created successfully for ${tierName} tier (manual publication may be required)`,
          productId: result.productId,
          hasSubscription: enableSubscription,
          publicationStatus: {
            onlineStore: publicationStatus.onlineStorePublished,
            totalChannels: publicationStatus.publicationCount
          }
        });
      }
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
          // Generate new SKU for the updated product
          const updatedSku = generateTierSKU(tierName, duration, shop);

          // Fetch product options first (required for productSet)
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
            { variables: { id: productId } }
          );

          const optionsResult = await getOptionsResponse.json();
          const productOptions = optionsResult.data?.product?.options || [
            { name: "Title", values: ["Default Title"] }
          ];

          // Build optionValues array for the variant
          const optionValues = productOptions.map((option: any) => ({
            optionName: option.name,
            name: option.values?.[0] || "Default Title"
          }));

          // Update variant price and SKU using productSet
          const updateVariantResponse = await admin.graphql(
            `#graphql
            mutation productSet($input: ProductSetInput!) {
              productSet(synchronous: true, input: $input) {
                product {
                  id
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
                  // Include productOptions at the product level
                  productOptions: productOptions.map((opt: any) => ({
                    name: opt.name,
                    values: opt.values?.map((v: string) => ({ name: v })) || [{ name: "Default Title" }]
                  })),
                  variants: [{
                    id: variant.id,
                    price: price.toString(),
                    sku: variant.sku || updatedSku,  // Keep existing SKU or use new one
                    taxable: true,
                    // Include optionValues to match product options
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
      
    } else if (intent === "publish-product") {
      const productId = formData.get("productId") as string;
      const publish = formData.get("publish") === "true";

      console.log(`[TierProducts] ${publish ? 'Publishing' : 'Unpublishing'} product: ${productId}`);

      // First, get the available publications
      const publicationsQuery = `#graphql
        query getPublications {
          publications(first: 10) {
            edges {
              node {
                id
                name
                supportsFuturePublishing
              }
            }
          }
        }
      `;

      const pubResponse = await admin.graphql(publicationsQuery);
      const pubData = await pubResponse.json() as any;

      // Find the Online Store publication
      const onlineStore = pubData.data?.publications?.edges?.find(
        (edge: any) => edge.node.name === "Online Store"
      );

      if (!onlineStore) {
        return json({
          success: false,
          error: "Online Store publication not found"
        }, { status: 404 });
      }

      if (publish) {
        // Publish the product
        const publishMutation = `#graphql
          mutation productPublish($input: ProductPublishInput!) {
            productPublish(input: $input) {
              product {
                id
                title
                publishedOnCurrentPublication
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        const publishResponse = await admin.graphql(publishMutation, {
          variables: {
            input: {
              id: productId,
              productPublications: [
                {
                  publicationId: onlineStore.node.id,
                  publishDate: new Date().toISOString()
                }
              ]
            }
          }
        });

        const publishResult = await publishResponse.json() as any;

        if (publishResult.data?.productPublish?.userErrors?.length > 0) {
          const errors = publishResult.data.productPublish.userErrors.map((e: any) => e.message).join(", ");
          return json({
            success: false,
            error: `Failed to publish product: ${errors}`
          }, { status: 400 });
        }

        return json({
          success: true,
          message: "Product published successfully to Online Store",
          published: true
        });
      } else {
        // Unpublish the product
        const unpublishMutation = `#graphql
          mutation productUnpublish($input: ProductUnpublishInput!) {
            productUnpublish(input: $input) {
              product {
                id
                title
                publishedOnCurrentPublication
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        const unpublishResponse = await admin.graphql(unpublishMutation, {
          variables: {
            input: {
              id: productId,
              productPublications: [
                {
                  publicationId: onlineStore.node.id
                }
              ]
            }
          }
        });

        const unpublishResult = await unpublishResponse.json() as any;

        if (unpublishResult.data?.productUnpublish?.userErrors?.length > 0) {
          const errors = unpublishResult.data.productUnpublish.userErrors.map((e: any) => e.message).join(", ");
          return json({
            success: false,
            error: `Failed to unpublish product: ${errors}`
          }, { status: 400 });
        }

        return json({
          success: true,
          message: "Product unpublished from Online Store",
          published: false
        });
      }

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
    } else if (intent === "create-tbyb-selling-plan") {
      const variables = JSON.parse(formData.get("variables") as string);

      console.log("[TierProducts] Creating Try Before You Buy selling plan with variables:", variables);

      // Use the exact GraphQL mutation format from the example
      const response = await admin.graphql(
        `#graphql
        mutation createSellingPlanGroup($input: SellingPlanGroupInput!, $resources: SellingPlanGroupResourceInput) {
          sellingPlanGroupCreate(input: $input, resources: $resources) {
            sellingPlanGroup {
              id
              name
              sellingPlans(first: 1) {
                edges {
                  node {
                    id
                    name
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
        { variables }
      );

      const data = await response.json();

      if (data.data?.sellingPlanGroupCreate?.userErrors?.length > 0) {
        const errors = data.data.sellingPlanGroupCreate.userErrors
          .map((e: any) => e.message)
          .join(', ');
        throw new Error(`Failed to create selling plan: ${errors}`);
      }

      const sellingPlanGroup = data.data?.sellingPlanGroupCreate?.sellingPlanGroup;
      if (!sellingPlanGroup) {
        throw new Error('No selling plan group returned from mutation');
      }

      // Store in database for tracking
      await db.sellingPlanGroup.create({
        data: {
          id: uuidv4(),
          shop,
          shopifySellingPlanGroupId: sellingPlanGroup.id,
          name: sellingPlanGroup.name,
          merchantCode: variables.input.merchantCode,
          tierProducts: [],
          metadata: {
            type: 'TRY_BEFORE_YOU_BUY',
            createdVia: 'TryBeforeYouBuyForm',
            createdAt: new Date().toISOString(),
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      return json({
        success: true,
        message: "Try Before You Buy plan created successfully",
        sellingPlanGroup
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
  const [showTryBeforeYouBuy, setShowTryBeforeYouBuy] = useState(false);
  const [selectedProductForTBYB, setSelectedProductForTBYB] = useState<string | undefined>();
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

  // Tier management states
  const [tierModalActive, setTierModalActive] = useState(false);
  const [editingTier, setEditingTier] = useState<any>(null);
  const [deleteConfirmActive, setDeleteConfirmActive] = useState(false);
  const [deletingTierId, setDeletingTierId] = useState<string | null>(null);
  const [tierFormData, setTierFormData] = useState({
    name: "",
    minSpend: "0",
    cashbackPercent: "0",
    evaluationPeriod: "ANNUAL" as "ANNUAL" | "LIFETIME",
  });

  const isLoading = navigation.state === "submitting";
  const isRefreshing = navigation.state === "loading";
  
  // Format currency helper
  const formatAmount = useCallback((amount: number) => {
    return formatCurrency(amount, data.shopSettings as any);
  }, [data.shopSettings]);

  // Tier management handlers
  const handleSaveTier = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", editingTier ? "update" : "create");
    if (editingTier) {
      formData.append("id", editingTier.id);
    }
    formData.append("name", tierFormData.name);
    formData.append("minSpend", tierFormData.minSpend);
    formData.append("cashbackPercent", tierFormData.cashbackPercent);
    formData.append("evaluationPeriod", tierFormData.evaluationPeriod);

    submit(formData, { method: "post" });
    setTierModalActive(false);
    setEditingTier(null);
  }, [editingTier, tierFormData, submit]);

  const handleDeleteTier = useCallback(() => {
    if (deletingTierId) {
      const formData = new FormData();
      formData.append("intent", "delete");
      formData.append("id", deletingTierId);

      submit(formData, { method: "post" });
      setDeleteConfirmActive(false);
      setDeletingTierId(null);
    }
  }, [deletingTierId, submit]);

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
  const handleTBYBSubmit = useCallback(async (variables: any) => {
    const formData = new FormData();
    formData.append("intent", "create-tbyb-selling-plan");
    formData.append("variables", JSON.stringify(variables));
    submit(formData, { method: "post" });
    setShowTryBeforeYouBuy(false);
  }, [submit]);

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
    // Validate inputs
    if (!selectedTier) {
      setToast({
        active: true,
        content: "Please select a tier for this membership product",
        error: true,
      });
      return;
    }

    if (!price || parseFloat(price) <= 0) {
      setToast({
        active: true,
        content: "Please enter a valid price greater than 0",
        error: true,
      });
      return;
    }

    // Validate price format (max 2 decimal places)
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum !== Math.round(priceNum * 100) / 100) {
      setToast({
        active: true,
        content: "Price must be a valid number with up to 2 decimal places",
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
      // Construct appropriate toast message
      let toastContent = '';
      let toastError = false;

      if ('message' in actionData) {
        toastContent = actionData.message;
        toastError = !actionData.success;
      } else if (actionData.success) {
        toastContent = "Product created successfully! The product is now available in your Shopify admin.";
        toastError = false;
        // Reload data on success
        setTimeout(() => revalidate(), 1000);
      } else {
        toastContent = actionData.error || "Operation failed. Please try again.";
        toastError = true;
      }

      setToast({
        active: true,
        content: toastContent,
        error: toastError,
      });
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
            content: "Create Try Before You Buy",
            icon: CalendarIcon,
            onAction: () => setShowTryBeforeYouBuy(true),
          },
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
          {/* Loading State Banner */}
          {isLoading && (
            <Layout.Section>
              <Banner tone="info">
                <InlineStack gap="400" align="start">
                  <Spinner size="small" />
                  <Text as="span">
                    {navigation.formData?.get("intent") === "create-product"
                      ? "Creating product in Shopify... This may take a few seconds."
                      : "Processing your request..."}
                  </Text>
                </InlineStack>
              </Banner>
            </Layout.Section>
          )}

          {/* Loyalty Tiers Management */}
          <Layout.Section>
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text variant="headingLg" as="h2">
                      Loyalty Tiers
                    </Text>
                    <Button
                      primary
                      icon={PlusIcon}
                      onClick={() => {
                        setEditingTier(null);
                        setTierFormData({
                          name: "",
                          minSpend: "0",
                          cashbackPercent: "0",
                          evaluationPeriod: "ANNUAL",
                        });
                        setTierModalActive(true);
                      }}
                    >
                      Add Tier
                    </Button>
                  </InlineStack>

                  {data.tiers.length === 0 ? (
                    <EmptyState
                      heading="Start rewarding your customers"
                      action={{
                        content: "Create first tier",
                        onAction: () => {
                          setEditingTier(null);
                          setTierFormData({
                            name: "",
                            minSpend: "0",
                            cashbackPercent: "0",
                            evaluationPeriod: "ANNUAL",
                          });
                          setTierModalActive(true);
                        },
                      }}
                      image="https://cdn.shopify.com/s/files/1/0583/8520/4949/files/loyalty-empty-state.svg"
                    >
                      <p>Create loyalty tiers to automatically reward customers based on their spending.</p>
                    </EmptyState>
                  ) : (
                    <BlockStack gap="300">
                      {data.tiers
                        .sort((a, b) => a.minSpend - b.minSpend)
                        .map((tier, index) => {
                          const customerCount = data.tierDistribution[tier.id] || 0;

                          return (
                            <Box key={tier.id} background="bg-surface" padding="0" borderRadius="200">
                              <InlineStack align="space-between" blockAlign="stretch" wrap={false}>
                                {/* Tier Info Section */}
                                <Box padding="400" minWidth="0">
                                  <InlineStack gap="400" align="start" blockAlign="start">
                                    {/* Icon */}
                                    <div style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      width: '40px',
                                      height: '40px',
                                      borderRadius: '8px',
                                      background: getTierStyle(tier.name).backgroundColor,
                                      border: `2px solid ${getTierStyle(tier.name).borderColor}`,
                                    }}>
                                      <Icon source={getTierStyle(tier.name).icon} tone="base" />
                                    </div>

                                    {/* Tier Details */}
                                    <BlockStack gap="200">
                                      <InlineStack gap="200" align="start">
                                        <Text variant="headingMd" as="h3">
                                          {tier.name}
                                        </Text>
                                        <Badge tone="success">
                                          {tier.cashbackPercent}% Cashback
                                        </Badge>
                                        {customerCount > 0 && (
                                          <Badge tone="info">
                                            {customerCount} {customerCount === 1 ? 'customer' : 'customers'}
                                          </Badge>
                                        )}
                                      </InlineStack>

                                      <InlineStack gap="400" wrap={false}>
                                        <InlineStack gap="100">
                                          <Icon source={CashDollarIcon} tone="subdued" />
                                          <Text variant="bodyMd" as="span">
                                            <Text variant="bodyMd" fontWeight="semibold" as="span">
                                              {formatAmount(tier.minSpend)}
                                            </Text>
                                            {' min spend'}
                                          </Text>
                                        </InlineStack>

                                        <Box borderInlineStartWidth="025" borderColor="border">
                                          <Box paddingInlineStart="400">
                                            <InlineStack gap="100">
                                              <Icon source={CalendarIcon} tone="subdued" />
                                              <Text variant="bodyMd" tone="subdued" as="span">
                                                {tier.evaluationPeriod === "ANNUAL" ? "Annual" : "Lifetime"}
                                              </Text>
                                            </InlineStack>
                                          </Box>
                                        </Box>
                                      </InlineStack>
                                    </BlockStack>
                                  </InlineStack>
                                </Box>

                                {/* Actions Section */}
                                <Box background="bg-surface-secondary" borderRadius="200">
                                  <Box padding="400">
                                    <InlineStack gap="200">
                                      <Button
                                        size="slim"
                                        icon={EditIcon}
                                        onClick={() => {
                                          setEditingTier(tier);
                                          setTierFormData({
                                            name: tier.name,
                                            minSpend: tier.minSpend.toString(),
                                            cashbackPercent: tier.cashbackPercent.toString(),
                                            evaluationPeriod: tier.evaluationPeriod,
                                          });
                                          setTierModalActive(true);
                                        }}
                                      >
                                        Edit
                                      </Button>
                                      <Button
                                        size="slim"
                                        tone="critical"
                                        icon={DeleteIcon}
                                        onClick={() => {
                                          setDeletingTierId(tier.id);
                                          setDeleteConfirmActive(true);
                                        }}
                                        disabled={customerCount > 0}
                                      >
                                        Delete
                                      </Button>
                                    </InlineStack>
                                  </Box>
                                </Box>
                              </InlineStack>
                            </Box>
                          );
                        })}
                    </BlockStack>
                  )}
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>

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
                                      <Badge tone={product.publishedAt ? "success" : "info"}>
                                        {product.publishedAt ? "Published" : "Unpublished"}
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
                            <BlockStack gap="200">
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
                              <Button
                                fullWidth
                                tone={product.publishedAt ? "critical" : "success"}
                                onClick={() => {
                                  const formData = new FormData();
                                  formData.append("intent", "publish-product");
                                  formData.append("productId", product.id);
                                  formData.append("publish", product.publishedAt ? "false" : "true");
                                  submit(formData, { method: "post" });
                                }}
                                loading={navigation.state === "submitting" && navigation.formData?.get("productId") === product.id}
                              >
                                {product.publishedAt ? "Unpublish Product" : "Publish Product"}
                              </Button>
                            </BlockStack>
                          </BlockStack>
                        </Box>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
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
              
              <SubscriptionOptionsManager
                enabled={enableSubscription}
                onEnabledChange={setEnableSubscription}
                options={subscriptionOptions as SubscriptionOption}
                onOptionsChange={setSubscriptionOptions}
                basePrice={price}
                currency={data.shopSettings?.storeCurrency || "USD"}
                showAdvanced={false}
                compactMode={true}
              />
              
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

        {/* Try Before You Buy Modal */}
        <Modal
          open={showTryBeforeYouBuy}
          onClose={() => setShowTryBeforeYouBuy(false)}
          title="Create Try Before You Buy Plan"
          size="large"
          primaryAction={{
            content: "Close",
            onAction: () => setShowTryBeforeYouBuy(false),
          }}
        >
          <Modal.Section>
            <TryBeforeYouBuyForm
              productId={selectedProductForTBYB}
              onSubmit={handleTBYBSubmit}
              isLoading={isLoading}
            />
          </Modal.Section>
        </Modal>

        {/* Tier Create/Edit Modal */}
        <Modal
          open={tierModalActive}
          onClose={() => {
            setTierModalActive(false);
            setEditingTier(null);
          }}
          title={editingTier ? "Edit Tier" : "Create New Tier"}
          primaryAction={{
            content: "Save",
            onAction: handleSaveTier,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => {
                setTierModalActive(false);
                setEditingTier(null);
              },
            },
          ]}
        >
          <Modal.Section>
            <FormLayout>
              <TextField
                label="Tier Name"
                value={tierFormData.name}
                onChange={(value) => setTierFormData({ ...tierFormData, name: value })}
                placeholder="e.g., Bronze, Silver, Gold"
                autoComplete="off"
              />

              <TextField
                label="Minimum Spend"
                type="number"
                value={tierFormData.minSpend}
                onChange={(value) => setTierFormData({ ...tierFormData, minSpend: value })}
                prefix={data.shopSettings?.storeCurrency || "USD"}
                helpText="Minimum spending amount to qualify for this tier"
                autoComplete="off"
              />

              <TextField
                label="Cashback Percentage"
                type="number"
                value={tierFormData.cashbackPercent}
                onChange={(value) => setTierFormData({ ...tierFormData, cashbackPercent: value })}
                suffix="%"
                helpText="Percentage of order value earned as store credit"
                autoComplete="off"
              />

              <Select
                label="Evaluation Period"
                options={[
                  { label: "Annual (resets yearly)", value: "ANNUAL" },
                  { label: "Lifetime (cumulative)", value: "LIFETIME" },
                ]}
                value={tierFormData.evaluationPeriod}
                onChange={(value) => setTierFormData({ ...tierFormData, evaluationPeriod: value as "ANNUAL" | "LIFETIME" })}
              />
            </FormLayout>
          </Modal.Section>
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          open={deleteConfirmActive}
          onClose={() => {
            setDeleteConfirmActive(false);
            setDeletingTierId(null);
          }}
          title="Delete Tier"
          primaryAction={{
            content: "Delete",
            destructive: true,
            onAction: handleDeleteTier,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => {
                setDeleteConfirmActive(false);
                setDeletingTierId(null);
              },
            },
          ]}
        >
          <Modal.Section>
            <Text as="p">
              Are you sure you want to delete this tier? This action cannot be undone.
            </Text>
          </Modal.Section>
        </Modal>

        {/* Workflow Guide Section */}
        <Layout.Section>
          <Card>
            <Box padding="600">
              <BlockStack gap="400">
                <BlockStack gap="200">
                  <Text variant="headingLg" as="h2">
                    Tier Products Workflow Guide
                  </Text>
                  <Text variant="bodyMd" tone="subdued" as="p">
                    Follow these steps to set up and manage tier membership products in your store
                  </Text>
                </BlockStack>

                <Divider />

                {/* Workflow Steps */}
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
                          Create Tier Product
                        </Text>
                        <Text variant="bodySm" tone="subdued" as="p" alignment="center">
                          Click "Create Product" to generate a Shopify product linked to a specific loyalty tier.
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
                          Configure Options
                        </Text>
                        <Text variant="bodySm" tone="subdued" as="p" alignment="center">
                          Set pricing, duration (monthly/annual), and enable subscription options if desired.
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
                          Publish Product
                        </Text>
                        <Text variant="bodySm" tone="subdued" as="p" alignment="center">
                          The product is automatically created in Shopify and ready for customers to purchase.
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
                          Automatic Tier Assignment
                        </Text>
                        <Text variant="bodySm" tone="subdued" as="p" alignment="center">
                          When customers complete purchase, they're automatically assigned to the corresponding tier.
                        </Text>
                      </BlockStack>
                    </Box>
                  </Card>
                </div>

                <Divider />

                {/* Features Section */}
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h3">
                    Key Features
                  </Text>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                    gap: 'var(--p-space-300)',
                  }}>
                    <InlineStack gap="200">
                      <Icon source={CheckCircleIcon} tone="positive" />
                      <BlockStack gap="100">
                        <Text variant="bodyMd" fontWeight="semibold" as="span">
                          Subscription Support
                        </Text>
                        <Text variant="bodySm" tone="subdued" as="p">
                          Enable recurring billing with customizable frequencies and discounts
                        </Text>
                      </BlockStack>
                    </InlineStack>

                    <InlineStack gap="200">
                      <Icon source={CheckCircleIcon} tone="positive" />
                      <BlockStack gap="100">
                        <Text variant="bodyMd" fontWeight="semibold" as="span">
                          Try Before You Buy
                        </Text>
                        <Text variant="bodySm" tone="subdued" as="p">
                          Offer trial periods with deferred payment options
                        </Text>
                      </BlockStack>
                    </InlineStack>

                    <InlineStack gap="200">
                      <Icon source={CheckCircleIcon} tone="positive" />
                      <BlockStack gap="100">
                        <Text variant="bodyMd" fontWeight="semibold" as="span">
                          Flexible Durations
                        </Text>
                        <Text variant="bodySm" tone="subdued" as="p">
                          Monthly, quarterly, annual, or lifetime membership options
                        </Text>
                      </BlockStack>
                    </InlineStack>

                    <InlineStack gap="200">
                      <Icon source={CheckCircleIcon} tone="positive" />
                      <BlockStack gap="100">
                        <Text variant="bodyMd" fontWeight="semibold" as="span">
                          Custom Features
                        </Text>
                        <Text variant="bodySm" tone="subdued" as="p">
                          Add unlimited feature descriptions to each product
                        </Text>
                      </BlockStack>
                    </InlineStack>
                  </div>
                </BlockStack>

                <Divider />

                {/* Tips Section */}
                <Banner tone="info" icon={ProductIcon}>
                  <BlockStack gap="200">
                    <Text variant="bodyMd" fontWeight="semibold" as="span">
                      Pro Tips
                    </Text>
                    <ul style={{ marginLeft: '20px' }}>
                      <li>Create multiple products for the same tier with different durations to offer pricing flexibility</li>
                      <li>Use subscription options to provide recurring revenue and better customer retention</li>
                      <li>Enable "Try Before You Buy" for premium tiers to reduce purchase friction</li>
                      <li>Products are regular Shopify products - you can edit them further in your Shopify admin</li>
                    </ul>
                  </BlockStack>
                </Banner>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

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