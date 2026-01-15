import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData, useRevalidator, useFetcher } from "@remix-run/react";
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
  UndoIcon,
  ClockIcon,
  ArchiveIcon,
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
import { v4 as uuidv4 } from 'uuid';
import { generateTierSKU as generateSKUFromUtils, isValidSKU } from "../utils/sku-generator";
import { extractNumericId } from "../utils/shopify-id-normalizer";
import { getEntitlements } from "../services/entitlements.server";
import { FeatureGate, LockedFeature } from "../components/FeatureGate";
import { TierEmptyStateV1B } from "../components/TierEmptyStateVariations";
import {
  validateTierProductDeletion,
  deleteTierProduct,
  restoreTierProduct,
  permanentlyDeleteTierProduct,
  type DeletionValidationResult,
  type DeletionBlocker,
  type DeletionWarning,
  type RestoreResult,
} from "../services/tier-products/tier-product-deletion.server";

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
  duration: 'MONTHLY' | 'ANNUAL' | 'LIFETIME';
  features: string[];
  publishedAt?: string | null;
  isActive: boolean;
  hasSubscription?: boolean;
  sellingPlanGroupId?: string;
  createdAt: string;
  updatedAt: string;
}

interface DeletedTierProduct extends TierProduct {
  deletedAt: string;
  deletedBy: string | null;
  deletionReason: string | null;
  recoveryDeadline: string;
  canRecover: boolean;
  daysUntilPermanentDelete: number;
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
  deletedTierProducts: DeletedTierProduct[]; // Soft-deleted products
  shopSettings: {
    storeCurrency: string;
    currencyDisplayType: string;
  } | null;
  shop: string;
  tierDistribution: Record<string, number>;
  canCreateProducts: boolean;
  currentPlan: string;
  hasAnnualEval: boolean; // Feature flag from entitlements
  hasPurchasableTiers: boolean; // Feature flag from entitlements
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
    // Fetch entitlements (single source of truth for features/limits)
    const entitlements = await getEntitlements(shop);
    const currentPlan = entitlements.effectivePlan;
    // Use entitlements for feature flags
    const canCreateProducts = entitlements.featurePurchasableTiers;
    const hasAnnualEval = entitlements.featureAnnualEval;
    const hasPurchasableTiers = entitlements.featurePurchasableTiers;

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
    let deletedTierProducts: any[] = [];
    try {
      // Filter out soft-deleted products from main list
      dbTierProducts = await (db as any).tierProduct.findMany({
        where: {
          shop,
          deletedAt: null // Exclude soft-deleted products
        },
        include: {
          tier: true,
        }
      });

      // DIAGNOSTIC: Log all database tier products
      console.log(`[TierProducts:Loader] Database tier products found:`,
        dbTierProducts.map((p: any) => ({
          dbId: p.id,
          shopifyProductId: p.shopifyProductId,
          sku: p.sku,
          tierName: p.tier?.name,
        }))
      );

      // Also fetch soft-deleted products for "Recently Deleted" section
      const now = new Date();
      const softDeleted = await (db as any).tierProduct.findMany({
        where: {
          shop,
          deletedAt: { not: null } // Only soft-deleted products
        },
        include: {
          tier: true,
        },
        orderBy: { deletedAt: 'desc' }
      });

      // Calculate recovery info for each deleted product
      const SOFT_DELETE_RETENTION_DAYS = 30;
      deletedTierProducts = softDeleted.map((product: any) => {
        const deletedAt = new Date(product.deletedAt);
        const recoveryDeadline = new Date(deletedAt.getTime() + SOFT_DELETE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
        const canRecover = now < recoveryDeadline;
        const daysUntilPermanentDelete = Math.max(0, Math.ceil((recoveryDeadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));

        return {
          ...product,
          deletedAt: product.deletedAt,
          deletedBy: product.deletedBy,
          deletionReason: product.deletionReason,
          recoveryDeadline: recoveryDeadline.toISOString(),
          canRecover,
          daysUntilPermanentDelete
        };
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
          else if (tags.includes('annual')) duration = 'ANNUAL';
          else if (tags.includes('lifetime')) duration = 'LIFETIME';
          
          // Extract tier name from title (assuming format: "TierName Tier Membership - Duration")
          const tierNameMatch = product.title.match(/^(.+?)\s+Tier\s+Membership/);
          const tierName = tierNameMatch ? tierNameMatch[1] : product.title;

          // Find matching tier - prefer exact match on extracted tier name
          // then fall back to longest substring match to avoid matching
          // "Gold" when tier is actually "Gold Premium"
          let matchingTier = tiers.find(t =>
            t.name.toLowerCase() === tierName.toLowerCase()
          );
          if (!matchingTier) {
            // Fall back to substring matching, but prioritize longer matches
            // to avoid "Gold" matching before "Gold Premium"
            const sortedTiers = [...tiers].sort((a, b) => b.name.length - a.name.length);
            matchingTier = sortedTiers.find(t =>
              product.title.toLowerCase().includes(t.name.toLowerCase())
            );
          }
          
          // Check if this product exists in database
          // Use normalized ID comparison to handle both formats:
          // - Database may store full GraphQL ID: gid://shopify/Product/123
          // - Or just numeric ID: 123
          const productNumericId = extractNumericId(product.id);
          const dbProduct = dbTierProducts.find(p =>
            extractNumericId(p.shopifyProductId) === productNumericId
          );

          // Debug logging for tier product resolution
          const resolvedSku = variant.sku || dbProduct?.sku || '';
          const resolvedTierId = dbProduct?.tierId || matchingTier?.id || '';
          const resolvedDuration = dbProduct?.duration || duration;

          // Log if any critical field is missing
          if (!resolvedSku || !resolvedTierId) {
            console.log(`[TierProducts] Resolution issue for "${product.title}":`, {
              shopifyProductId: product.id,
              normalizedId: productNumericId,
              // SKU resolution
              variantSku: variant.sku,
              dbProductSku: dbProduct?.sku,
              resolvedSku,
              // Tier resolution
              dbProductTierId: dbProduct?.tierId,
              matchingTierId: matchingTier?.id,
              matchingTierName: matchingTier?.name,
              resolvedTierId,
              // Duration resolution
              dbProductDuration: dbProduct?.duration,
              tagsDuration: duration,
              resolvedDuration,
              // DB lookup status
              dbProductFound: !!dbProduct,
              dbProductId: dbProduct?.shopifyProductId,
            });
          }

          const hasSubscription = product.sellingPlanGroups?.edges?.length > 0 || dbProduct?.hasSubscription;
          const sellingPlanGroupId = product.sellingPlanGroups?.edges?.[0]?.node?.id || dbProduct?.sellingPlanGroupId;

          // DIAGNOSTIC: Log ID resolution for every product
          const resolvedId = dbProduct?.id || product.id;
          console.log(`[TierProducts:IDResolution] Product "${product.title}":`, {
            shopifyGID: product.id,
            dbProductExists: !!dbProduct,
            dbProductId: dbProduct?.id,
            dbProductShopifyId: dbProduct?.shopifyProductId,
            resolvedId,
            isUUID: resolvedId && !resolvedId.includes('gid://'),
          });

          tierProducts.push({
            // IMPORTANT: Use database UUID when available for deletion/update operations
            // Fall back to Shopify GID only for products not yet in our database
            id: resolvedId,
            // IMPORTANT: Database tierId takes priority over title-based matching
            // because db stores the authoritative tier association
            tierId: resolvedTierId,
            tierName: dbProduct?.tier?.name || tierName,
            shopifyProductId: product.id,
            shopifyVariantId: variant.id,
            productHandle: product.handle,
            sku: resolvedSku,
            price: parseFloat(variant.price || '0'),
            duration: resolvedDuration,
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
      deletedTierProducts,
      shopSettings: shopSettings ? {
        storeCurrency: shopSettings.storeCurrency,
        currencyDisplayType: shopSettings.currencyDisplayType,
      } : null,
      shop,
      tierDistribution,
      canCreateProducts,
      currentPlan,
      hasAnnualEval,
      hasPurchasableTiers,
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

          console.log('[TierProducts] Creating tier with ID:', tierId);
          console.log('[TierProducts] Tier data:', { id: tierId, shop, name: name.trim(), minSpend, cashbackPercent, evaluationPeriod });

          // Create tier with timestamps
          const createdTier = await db.tier.create({
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

          console.log('[TierProducts] ✅ Tier created successfully:', createdTier);

          // Verify the tier was created by fetching it back
          const verifyTier = await db.tier.findFirst({ where: { id: tierId, shop } });
          if (verifyTier) {
            console.log('[TierProducts] ✅ Tier verified in database:', verifyTier.id, verifyTier.name);
          } else {
            console.error('[TierProducts] ❌ CRITICAL: Tier was NOT found after creation!');
          }

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

          // Check if tier products are linked to this tier
          let tierProductCount = 0;
          try {
            tierProductCount = await (db as any).tierProduct.count({
              where: { shop, tierId: id },
            });
          } catch (e) {
            // TierProduct table may not exist in all environments
            console.log('[TierProducts] Could not check tier products count:', e);
          }

          if (tierProductCount > 0) {
            return json({
              error: `Cannot delete tier with ${tierProductCount} linked tier product(s). Please delete the tier products first.`
            }, { status: 400 });
          }

          // Check if tier purchases reference this tier
          let tierPurchaseCount = 0;
          try {
            tierPurchaseCount = await db.tierPurchase.count({
              where: { shop, tierId: id },
            });
          } catch (e) {
            console.log('[TierProducts] Could not check tier purchases count:', e);
          }

          if (tierPurchaseCount > 0) {
            return json({
              error: `Cannot delete tier with ${tierPurchaseCount} existing tier purchase(s). These represent customer purchases that reference this tier.`
            }, { status: 400 });
          }

          // Check if tier subscriptions reference this tier
          let tierSubscriptionCount = 0;
          try {
            tierSubscriptionCount = await db.tierSubscription.count({
              where: { shop, tierId: id },
            });
          } catch (e) {
            console.log('[TierProducts] Could not check tier subscriptions count:', e);
          }

          if (tierSubscriptionCount > 0) {
            return json({
              error: `Cannot delete tier with ${tierSubscriptionCount} existing tier subscription(s). These represent active subscriptions that reference this tier.`
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
      // Check plan access (server-side validation using entitlements)
      const entitlements = await getEntitlements(shop);
      const canCreateProducts = entitlements.featurePurchasableTiers;

      if (!canCreateProducts) {
        return json({
          success: false,
          error: `Upgrade to Pro plan or higher to create purchasable tier products. Current plan: ${entitlements.effectivePlan}`
        }, { status: 403 });
      }

      const tierId = formData.get("tierId") as string;
      const tierName = formData.get("tierName") as string;
      const price = parseFloat(formData.get("price") as string);
      const duration = formData.get("duration") as string;
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
          descriptionHtml: `<p>Unlock exclusive ${tierName} tier benefits with this ${formatDuration(duration).toLowerCase()} membership.</p>`,
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
                tierId: tier.id,  // Use tier.id from database, not form data
                shopifyProductId: product.id.replace('gid://shopify/Product/', ''),
                shopifyVariantId: variant.id.replace('gid://shopify/ProductVariant/', ''),
                productHandle: product.handle || sku,
                sku: variant.sku || sku,
                purchaseType: enableSubscription ? "BOTH" : "ONE_TIME",
                duration: duration as any,
                hasSubscription: enableSubscription,
                price: price,  // REQUIRED field
                currency: shopSettings?.storeCurrency || 'USD',  // REQUIRED field
                oneTimePrice: price,
                monthlyPrice: enableSubscription && duration === "MONTHLY" ? price : null,
                annualPrice: enableSubscription && duration === "ANNUAL" ? price : null,
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
                options: [duration as "MONTHLY" | "ANNUAL"],
                products: [product.id]
              });

              if (!sellingPlanResult.success) {
                console.warn('[TierProducts] Could not create selling plans:', sellingPlanResult.error);
              }
            }
          } catch (dbError: any) {
            console.error('[TierProducts] ❌ CRITICAL: Could not create database record!');
            console.error('[TierProducts] Error:', dbError?.message || dbError);
            // Continue but log the error - the product was created in Shopify
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
          description: `Unlock exclusive ${tierName} tier benefits with this ${formatDuration(duration).toLowerCase()} membership.`,
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
            const tierProductId = uuidv4();
            const tierProductData = {
              id: tierProductId,
              shop,
              tierId: tier.id,  // Use tier.id from database, not form data
              shopifyProductId: result.productId.replace('gid://shopify/Product/', ''),
              shopifyVariantId: result.variantId.replace('gid://shopify/ProductVariant/', ''),
              productHandle: result.handle || sku,
              sku,
              purchaseType: enableSubscription ? "BOTH" : "ONE_TIME",
              duration: duration as any,
              hasSubscription: enableSubscription,
              price: price,  // Required base price field
              currency: shopSettings?.storeCurrency || 'USD',  // REQUIRED field - was missing!
              oneTimePrice: price,
              monthlyPrice: enableSubscription && duration === "MONTHLY" ? price : null,
              annualPrice: enableSubscription && duration === "ANNUAL" ? price : null,
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date()
            };

            console.log('[TierProducts] ========================================');
            console.log('[TierProducts] CREATING TIER PRODUCT RECORD');
            console.log('[TierProducts] ========================================');
            console.log('[TierProducts] TierProduct ID:', tierProductId);
            console.log('[TierProducts] Shop:', shop);
            console.log('[TierProducts] Tier ID:', tier.id);
            console.log('[TierProducts] Tier Name:', tier.name);
            console.log('[TierProducts] Shopify Product ID:', tierProductData.shopifyProductId);
            console.log('[TierProducts] Shopify Variant ID:', tierProductData.shopifyVariantId);
            console.log('[TierProducts] SKU:', sku);
            console.log('[TierProducts] Duration:', duration);
            console.log('[TierProducts] Price:', price);
            console.log('[TierProducts] Purchase Type:', tierProductData.purchaseType);
            console.log('[TierProducts] ========================================');

            await (db as any).tierProduct.create({
              data: tierProductData
            });

            console.log('[TierProducts] ✅ TierProduct record created successfully!');
            console.log('[TierProducts] TierProduct ID:', tierProductId);
            console.log('[TierProducts] Linked to Tier:', tier.name, '(', tier.id, ')');

            // If subscription is enabled, create selling plans
            if (enableSubscription && subscriptionOptions) {
              const sellingPlanResult = await SellingPlanManagerEnhanced.createSellingPlanGroup({
                shop,
                admin,
                name: `${tierName} Tier Subscription`,
                merchantCode: `TIER_${tierName.toUpperCase()}`,
                description: `Subscription plans for ${tierName} tier membership`,
                options: [duration as "MONTHLY" | "ANNUAL"],
                products: [result.productId]
              });
              
              if (!sellingPlanResult.success) {
                console.warn('[TierProducts] Could not create selling plans:', sellingPlanResult.error);
              }
            }
          } catch (dbError: any) {
            console.error('[TierProducts] ❌ CRITICAL: Could not create database record!');
            console.error('[TierProducts] Error:', dbError?.message || dbError);
            console.error('[TierProducts] Tier Product Data:', JSON.stringify(tierProductData, null, 2));

            // Return error - don't silently fail!
            return json({
              success: false,
              error: `Shopify product was created but database record failed: ${dbError?.message || 'Unknown error'}. Please check the product in Shopify admin.`,
              productId: result.productId,  // Include product ID so user can find it in Shopify
            }, { status: 500 });
          }
        } else {
          console.error('[TierProducts] ❌ Missing productId or variantId from Shopify response');
          return json({
            success: false,
            error: 'Product creation returned incomplete data from Shopify'
          }, { status: 500 });
        }

        // Verify publication status
        // DISABLED: Missing read_publications and read_product_listings scopes
        // const publicationStatus = await ProductCreatorV2.verifyPublication(admin, result.productId!);

        return json({
          success: true,
          message: `Product created successfully for ${tierName} tier`,
          productId: result.productId,
          hasSubscription: enableSubscription,
          publicationStatus: {
            onlineStore: false,
            totalChannels: 0
          }
        });
      }
    } else if (intent === "update-product") {
      const productId = formData.get("productId") as string;
      const price = parseFloat(formData.get("price") as string);
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

        try {
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

          // Check for userErrors (these are actual validation/business logic errors)
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
        } catch (error: any) {
          // GraphQL client throws when response has errors array, even if operation succeeded
          // Check if we got a successful result despite the error
          console.warn('[TierProducts] GraphQL error during publish, checking if operation succeeded:', error.message);

          // Try to extract the response from the error
          let publishResult: any = null;
          try {
            // The error might have the response attached
            if (error.response) {
              publishResult = await error.response.json();
            }
          } catch (e) {
            // Couldn't extract response, treat as real error
          }

          // Check if operation succeeded despite GraphQL errors
          if (publishResult?.data?.productPublish?.product?.id) {
            // Operation succeeded! Check for userErrors
            if (publishResult.data.productPublish.userErrors?.length > 0) {
              const errors = publishResult.data.productPublish.userErrors.map((e: any) => e.message).join(", ");
              return json({
                success: false,
                error: `Failed to publish product: ${errors}`
              }, { status: 400 });
            }

            // Success with non-fatal GraphQL errors
            console.log('[TierProducts] Product published successfully despite GraphQL errors');
            return json({
              success: true,
              message: "Product published successfully to Online Store",
              published: true
            });
          }

          // Real failure - operation did not succeed
          return json({
            success: false,
            error: `Failed to publish product: ${error.message}`
          }, { status: 500 });
        }
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

        try {
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

          // Check for userErrors (these are actual validation/business logic errors)
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
        } catch (error: any) {
          // GraphQL client throws when response has errors array, even if operation succeeded
          // Check if we got a successful result despite the error
          console.warn('[TierProducts] GraphQL error during unpublish, checking if operation succeeded:', error.message);

          // Try to extract the response from the error
          let unpublishResult: any = null;
          try {
            // The error might have the response attached
            if (error.response) {
              unpublishResult = await error.response.json();
            }
          } catch (e) {
            // Couldn't extract response, treat as real error
          }

          // Check if operation succeeded despite GraphQL errors
          if (unpublishResult?.data?.productUnpublish?.product?.id) {
            // Operation succeeded! Check for userErrors
            if (unpublishResult.data.productUnpublish.userErrors?.length > 0) {
              const errors = unpublishResult.data.productUnpublish.userErrors.map((e: any) => e.message).join(", ");
              return json({
                success: false,
                error: `Failed to unpublish product: ${errors}`
              }, { status: 400 });
            }

            // Success with non-fatal GraphQL errors
            console.log('[TierProducts] Product unpublished successfully despite GraphQL errors');
            return json({
              success: true,
              message: "Product unpublished from Online Store",
              published: false
            });
          }

          // Real failure - operation did not succeed
          return json({
            success: false,
            error: `Failed to unpublish product: ${error.message}`
          }, { status: 500 });
        }
      }

    } else if (intent === "delete-product") {
      // ═══════════════════════════════════════════════════════════════════════
      // TIER PRODUCT DELETION (Improved with validation)
      // ═══════════════════════════════════════════════════════════════════════
      const tierProductId = formData.get("tierProductId") as string;
      const skipValidation = formData.get("skipValidation") === "true";

      if (!tierProductId) {
        return json({
          success: false,
          action: "delete-product",
          error: "Tier product ID is required"
        }, { status: 400 });
      }

      // DIAGNOSTIC: Detailed logging for delete request
      console.log(`[TierProducts:DeleteRequest] Received delete request:`, {
        tierProductId,
        isShopifyGID: tierProductId.includes('gid://shopify'),
        isUUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tierProductId),
        shop,
      });

      // 1. Validate deletion (unless skipped for force-delete scenarios)
      if (!skipValidation) {
        const validation = await validateTierProductDeletion(shop, tierProductId);

        if (!validation.canDelete) {
          console.log(`[TierProducts] Deletion blocked:`, validation.blockers);
          return json({
            success: false,
            action: "delete-product",
            error: "Cannot delete tier product",
            blockers: validation.blockers,
            warnings: validation.warnings,
          }, { status: 400 });
        }
      }

      // 2. Perform deletion (Shopify first, then database)
      const result = await deleteTierProduct(shop, tierProductId, admin);

      if (!result.success) {
        console.log(`[TierProducts] Deletion failed:`, result.error);
        return json({
          success: false,
          action: "delete-product",
          error: result.error || "Failed to delete tier product"
        }, { status: 500 });
      }

      console.log(`[TierProducts] Deletion successful:`, result.cleanupSummary);

      return json({
        success: true,
        action: "delete-product",
        message: "Tier product deleted successfully",
        deletedShopifyProductId: result.deletedShopifyProductId,
        cleanupSummary: result.cleanupSummary,
      });

    } else if (intent === "validate-delete-product") {
      // ═══════════════════════════════════════════════════════════════════════
      // VALIDATE TIER PRODUCT DELETION (Pre-check for UI)
      // ═══════════════════════════════════════════════════════════════════════
      const tierProductId = formData.get("tierProductId") as string;

      if (!tierProductId) {
        return json({
          success: false,
          action: "validate-delete-product",
          error: "Tier product ID is required"
        }, { status: 400 });
      }

      const validation = await validateTierProductDeletion(shop, tierProductId);

      return json({
        success: true,
        action: "validate-delete-product",
        canDelete: validation.canDelete,
        blockers: validation.blockers,
        warnings: validation.warnings,
        product: validation.product ? {
          id: validation.product.id,
          name: validation.product.tier?.name || 'Unknown Tier',
          shopifyProductId: validation.product.shopifyProductId,
          duration: validation.product.duration,
          price: validation.product.price,
        } : null,
      });
    } else if (intent === "delete-tier-product-record") {
      // Delete tier product by its database ID (for cleaning up orphaned records)
      const tierProductId = formData.get("tierProductId") as string;

      if (!tierProductId) {
        return json({ success: false, error: "Tier product ID is required" }, { status: 400 });
      }

      console.log(`[TierProducts] Deleting tier product record: ${tierProductId}`);

      try {
        // Find the tier product first
        const tierProduct = await (db as any).tierProduct.findFirst({
          where: {
            id: tierProductId,
            shop,
          },
        });

        if (!tierProduct) {
          return json({ success: false, error: "Tier product not found or does not belong to this shop" }, { status: 404 });
        }

        // Delete the tier product record
        await (db as any).tierProduct.delete({
          where: { id: tierProductId },
        });

        console.log(`[TierProducts] Successfully deleted tier product record: ${tierProductId}`);

        return json({
          success: true,
          message: "Tier product record deleted successfully",
        });
      } catch (error) {
        console.error('[TierProducts] Error deleting tier product record:', error);
        return json({
          success: false,
          error: error instanceof Error ? error.message : "Failed to delete tier product record"
        }, { status: 500 });
      }
    } else if (intent === "restore-tier-product") {
      // ═══════════════════════════════════════════════════════════════════════
      // RESTORE SOFT-DELETED TIER PRODUCT
      // ═══════════════════════════════════════════════════════════════════════
      const tierProductId = formData.get("tierProductId") as string;

      if (!tierProductId) {
        return json({
          success: false,
          action: "restore-tier-product",
          error: "Tier product ID is required"
        }, { status: 400 });
      }

      console.log(`[TierProducts] Restore request for tier product: ${tierProductId}`);

      const result = await restoreTierProduct(shop, tierProductId);

      if (!result.success) {
        console.log(`[TierProducts] Restore failed:`, result.error);
        return json({
          success: false,
          action: "restore-tier-product",
          error: result.error || "Failed to restore tier product"
        }, { status: 400 });
      }

      console.log(`[TierProducts] Restore successful for: ${result.restoredProductId}`);

      return json({
        success: true,
        action: "restore-tier-product",
        message: "Tier product restored successfully. Note: The Shopify product may need to be recreated.",
        restoredProductId: result.restoredProductId,
      });

    } else if (intent === "permanent-delete-tier-product") {
      // ═══════════════════════════════════════════════════════════════════════
      // PERMANENTLY DELETE SOFT-DELETED TIER PRODUCT
      // ═══════════════════════════════════════════════════════════════════════
      const tierProductId = formData.get("tierProductId") as string;

      if (!tierProductId) {
        return json({
          success: false,
          action: "permanent-delete-tier-product",
          error: "Tier product ID is required"
        }, { status: 400 });
      }

      console.log(`[TierProducts] Permanent delete request for tier product: ${tierProductId}`);

      const result = await permanentlyDeleteTierProduct(shop, tierProductId);

      if (!result.success) {
        console.log(`[TierProducts] Permanent delete failed:`, result.error);
        return json({
          success: false,
          action: "permanent-delete-tier-product",
          error: result.error || "Failed to permanently delete tier product"
        }, { status: 500 });
      }

      console.log(`[TierProducts] Permanent delete successful:`, result.cleanupSummary);

      return json({
        success: true,
        action: "permanent-delete-tier-product",
        message: "Tier product permanently deleted",
        cleanupSummary: result.cleanupSummary,
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
  const [deleteModalActive, setDeleteModalActive] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [deleteValidation, setDeleteValidation] = useState<{
    canDelete: boolean;
    blockers: DeletionBlocker[];
    warnings: DeletionWarning[];
    product: { id: string; name: string } | null;
  } | null>(null);
  const [isValidatingDelete, setIsValidatingDelete] = useState(false);
  const deleteFetcher = useFetcher<{
    success: boolean;
    action: string;
    canDelete?: boolean;
    blockers?: DeletionBlocker[];
    warnings?: DeletionWarning[];
    product?: { id: string; name: string } | null;
    error?: string;
  }>();

  // Soft delete / restore states
  const [restoreModalActive, setRestoreModalActive] = useState(false);
  const [permanentDeleteModalActive, setPermanentDeleteModalActive] = useState(false);
  const [selectedDeletedProduct, setSelectedDeletedProduct] = useState<DeletedTierProduct | null>(null);
  const [showRecentlyDeleted, setShowRecentlyDeleted] = useState(false);
  const restoreFetcher = useFetcher<{
    success: boolean;
    action: string;
    message?: string;
    error?: string;
  }>();

  const [editingProduct, setEditingProduct] = useState<TierProduct | null>(null);
  const [selectedTier, setSelectedTier] = useState<string>("");
  const [price, setPrice] = useState<string>("");
  const [duration, setDuration] = useState<string>("MONTHLY");
  const [enableSubscription, setEnableSubscription] = useState(false);
  const [subscriptionDiscountPercent, setSubscriptionDiscountPercent] = useState("10");
  const [subscriptionOptions, setSubscriptionOptions] = useState({
    enableMonthly: true,
    enableAnnual: true,
    monthlyDiscount: "0",
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

  // Automatically revalidate when navigation completes (after create/update/delete)
  useEffect(() => {
    if (navigation.state === "idle" && navigation.formData) {
      const intent = navigation.formData.get("intent");
      if (intent === "create-product" || intent === "delete-product" || intent === "update-product" || intent === "delete-tier-product-record") {
        // Add small delay to ensure database operation completes
        setTimeout(() => {
          revalidate();
        }, 500);
      }
    }
  }, [navigation.state, navigation.formData, revalidate]);

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
    setEnableSubscription(false);
    setSubscriptionDiscountPercent("10");
    setSubscriptionOptions({
      enableMonthly: true,
      enableAnnual: true,
      monthlyDiscount: "0",
      annualDiscount: "15",
    });
  }, []);

  const handleModalClose = useCallback(() => {
    setModalActive(false);
    setEnableSubscription(false);
    setSubscriptionDiscountPercent("10");
    setSubscriptionOptions({
      enableMonthly: true,
      enableAnnual: true,
      monthlyDiscount: "0",
      annualDiscount: "15",
    });
  }, []);
  
  // Handle edit modal open
  const handleEditModalOpen = useCallback((product: TierProduct) => {
    setEditingProduct(product);
    setSelectedTier(product.tierId);
    setPrice(product.price.toString());
    setDuration(product.duration);
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
      enableAnnual: true,
      monthlyDiscount: "0",
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
    formData.append("enableSubscription", enableSubscription.toString());
    if (enableSubscription) {
      formData.append("subscriptionOptions", JSON.stringify(subscriptionOptions));
    }

    submit(formData, { method: "post" });
    handleModalClose();
  }, [selectedTier, price, duration, enableSubscription, subscriptionOptions, data.tiers, submit, handleModalClose]);
  
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
    formData.append("enableSubscription", enableSubscription.toString());
    if (enableSubscription) {
      formData.append("subscriptionOptions", JSON.stringify(subscriptionOptions));
    }

    submit(formData, { method: "post" });
    handleEditModalClose();
  }, [editingProduct, price, duration, enableSubscription, subscriptionOptions, submit, handleEditModalClose]);
  
  // Handle action response
  useEffect(() => {
    if (actionData) {
      // Construct appropriate toast message
      let toastContent = '';
      let toastError = false;
      let shouldRevalidate = false;

      if ('message' in actionData) {
        toastContent = actionData.message;
        toastError = !actionData.success;
        if (actionData.success) {
          setModalActive(false);
          setEditModalActive(false);
          shouldRevalidate = true;
        }
      } else if (actionData.success) {
        toastContent = "Product created successfully! The product is now available in your Shopify admin.";
        toastError = false;
        setModalActive(false);
        setEditModalActive(false);
        shouldRevalidate = true;
      } else {
        toastContent = actionData.error || "Operation failed. Please try again.";
        toastError = true;
      }

      setToast({
        active: true,
        content: toastContent,
        error: toastError,
      });

      // Revalidate loader data to refresh the tier products list
      if (shouldRevalidate) {
        // Small delay to ensure database operations complete
        setTimeout(() => {
          revalidate();
        }, 300);
      }
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
    { label: "Annual", value: "ANNUAL" },
    { label: "Lifetime (one-time)", value: "LIFETIME" },
  ];
  
  // Handle delete product with validation
  const handleDeleteProduct = useCallback((tierProductId: string) => {
    setProductToDelete(tierProductId);
    setDeleteValidation(null);
    setIsValidatingDelete(true);
    setDeleteModalActive(true);

    // Call validation endpoint
    const formData = new FormData();
    formData.append("intent", "validate-delete-product");
    formData.append("tierProductId", tierProductId);
    deleteFetcher.submit(formData, { method: "post" });
  }, [deleteFetcher]);

  // Handle validation response
  useEffect(() => {
    if (deleteFetcher.state === "idle" && deleteFetcher.data) {
      setIsValidatingDelete(false);
      if (deleteFetcher.data.action === "validate-delete-product") {
        setDeleteValidation({
          canDelete: deleteFetcher.data.canDelete ?? false,
          blockers: deleteFetcher.data.blockers ?? [],
          warnings: deleteFetcher.data.warnings ?? [],
          product: deleteFetcher.data.product ?? null,
        });
      }
    }
  }, [deleteFetcher.state, deleteFetcher.data]);

  // Handle restore/permanent delete response
  useEffect(() => {
    if (restoreFetcher.state === "idle" && restoreFetcher.data) {
      const { success, action, message, error } = restoreFetcher.data;

      if (action === "restore-tier-product" || action === "permanent-delete-tier-product") {
        setRestoreModalActive(false);
        setPermanentDeleteModalActive(false);
        setSelectedDeletedProduct(null);

        setToast({
          active: true,
          content: success ? (message || "Operation completed") : (error || "Operation failed"),
          error: !success,
        });

        if (success) {
          // Revalidate to refresh the lists
          setTimeout(() => revalidate(), 300);
        }
      }
    }
  }, [restoreFetcher.state, restoreFetcher.data, revalidate]);

  // Handlers for restore and permanent delete
  const handleRestoreProduct = useCallback((product: DeletedTierProduct) => {
    setSelectedDeletedProduct(product);
    setRestoreModalActive(true);
  }, []);

  const handlePermanentDeleteProduct = useCallback((product: DeletedTierProduct) => {
    setSelectedDeletedProduct(product);
    setPermanentDeleteModalActive(true);
  }, []);

  const confirmRestoreProduct = useCallback(() => {
    if (!selectedDeletedProduct) return;

    const formData = new FormData();
    formData.append("intent", "restore-tier-product");
    formData.append("tierProductId", selectedDeletedProduct.id);
    restoreFetcher.submit(formData, { method: "post" });
  }, [selectedDeletedProduct, restoreFetcher]);

  const confirmPermanentDelete = useCallback(() => {
    if (!selectedDeletedProduct) return;

    const formData = new FormData();
    formData.append("intent", "permanent-delete-tier-product");
    formData.append("tierProductId", selectedDeletedProduct.id);
    restoreFetcher.submit(formData, { method: "post" });
  }, [selectedDeletedProduct, restoreFetcher]);

  const confirmDelete = useCallback(() => {
    if (productToDelete && deleteValidation?.canDelete) {
      const formData = new FormData();
      formData.append("intent", "delete-product");
      formData.append("tierProductId", productToDelete);
      submit(formData, { method: "post" });
      setDeleteModalActive(false);
      setProductToDelete(null);
      setDeleteValidation(null);
    }
  }, [productToDelete, deleteValidation, submit]);

  const cancelDelete = useCallback(() => {
    setDeleteModalActive(false);
    setProductToDelete(null);
    setDeleteValidation(null);
    setIsValidatingDelete(false);
  }, []);
  
  return (
    <Frame>
      <Page
        title="Membership Tiers"
        subtitle="Create and manage membership products for your loyalty tiers"
        primaryAction={{
          content: "Add Tier",
          icon: PlusIcon,
          onAction: () => {
            setEditingTier(null);
            setTierFormData({
              name: "",
              minSpend: "0",
              cashbackPercent: "0",
              // Default to LIFETIME for plans without annualEvaluationPeriod feature
              evaluationPeriod: data.hasAnnualEval ? "ANNUAL" : "LIFETIME",
            });
            setTierModalActive(true);
          },
        }}
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

          {/* Plan Upgrade Banner */}
          {!data.canCreateProducts && (
            <Layout.Section>
              <LockedFeature
                feature="Purchasable Tier Products"
                upgradeMessage="Upgrade to Max plan or higher to create products that customers can purchase to unlock tier benefits. This feature allows you to sell tier memberships as one-time purchases or recurring subscriptions."
              />
            </Layout.Section>
          )}

          {/* Loyalty Tiers Management */}
          <Layout.Section>
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <Text variant="headingLg" as="h2">
                    Loyalty Tiers
                  </Text>

                  {data.tiers.length === 0 ? (
                    <TierEmptyStateV1B
                      onCreateTier={() => {
                        setEditingTier(null);
                        setTierFormData({
                          name: "",
                          minSpend: "0",
                          cashbackPercent: "0",
                          // Default to LIFETIME for plans without annualEvaluationPeriod feature
                          evaluationPeriod: data.hasAnnualEval ? "ANNUAL" : "LIFETIME",
                        });
                        setTierModalActive(true);
                      }}
                    />
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

          {/* Tier-Duration Matrix View */}
          <Layout.Section>
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingLg" as="h2">
                      Tier Product Coverage
                    </Text>
                    <Badge tone="info">
                      {data.tierProducts.length} / {data.tiers.length * 3} products created
                    </Badge>
                  </InlineStack>

                  <Text variant="bodySm" tone="subdued" as="p">
                    See which tier + duration combinations have products. Click + Create to add missing products.
                  </Text>

                  {data.tiers.length === 0 ? (
                    <Banner tone="warning">
                      <p>Create loyalty tiers first before adding tier products.</p>
                    </Banner>
                  ) : (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '150px repeat(3, 1fr)',
                      gap: '12px',
                      marginTop: '8px'
                    }}>
                      {/* Header Row */}
                      <div style={{ padding: '12px', fontWeight: 600 }}></div>
                      <div style={{ padding: '12px', fontWeight: 600, textAlign: 'center' }}>
                        <Text variant="headingSm" as="h3" fontWeight="semibold">Monthly</Text>
                      </div>
                      <div style={{ padding: '12px', fontWeight: 600, textAlign: 'center' }}>
                        <Text variant="headingSm" as="h3" fontWeight="semibold">Annual</Text>
                      </div>
                      <div style={{ padding: '12px', fontWeight: 600, textAlign: 'center' }}>
                        <Text variant="headingSm" as="h3" fontWeight="semibold">Lifetime</Text>
                      </div>

                      {/* Tier Rows */}
                      {data.tiers
                        .sort((a, b) => a.minSpend - b.minSpend)
                        .map((tier) => {
                          const monthlyProduct = data.tierProducts.find(
                            p => p.tierId === tier.id && p.duration === 'MONTHLY'
                          );
                          const annualProduct = data.tierProducts.find(
                            p => p.tierId === tier.id && p.duration === 'ANNUAL'
                          );
                          const lifetimeProduct = data.tierProducts.find(
                            p => p.tierId === tier.id && p.duration === 'LIFETIME'
                          );

                          return (
                            <div key={tier.id} style={{ display: 'contents' }}>
                              {/* Tier Name Cell */}
                              <div style={{
                                padding: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                borderRadius: '8px',
                                background: 'var(--p-color-bg-surface-secondary)'
                              }}>
                                <div style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '6px',
                                  background: getTierStyle(tier.name).backgroundColor,
                                  border: `1px solid ${getTierStyle(tier.name).borderColor}`,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0
                                }}>
                                  <Icon source={getTierStyle(tier.name).icon} tone="base" />
                                </div>
                                <Text variant="bodyMd" as="span" fontWeight="semibold">
                                  {tier.name}
                                </Text>
                              </div>

                              {/* Monthly Cell */}
                              <div style={{
                                padding: '12px',
                                borderRadius: '8px',
                                border: '1px solid var(--p-color-border)',
                                background: monthlyProduct ? 'var(--p-color-bg-surface)' : 'var(--p-color-bg-surface-secondary)',
                                minHeight: '80px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
                              }}>
                                {monthlyProduct ? (
                                  <>
                                    <InlineStack align="space-between" blockAlign="start">
                                      <Text variant="headingMd" as="span" fontWeight="bold">
                                        {formatAmount(monthlyProduct.price)}
                                      </Text>
                                      <InlineStack gap="100">
                                        <div style={{
                                          width: '8px',
                                          height: '8px',
                                          borderRadius: '50%',
                                          backgroundColor: monthlyProduct.isActive ? '#22c55e' : '#eab308'
                                        }} />
                                        <div style={{
                                          width: '8px',
                                          height: '8px',
                                          borderRadius: '50%',
                                          backgroundColor: monthlyProduct.publishedAt ? '#22c55e' : '#9ca3af'
                                        }} />
                                        {monthlyProduct.hasSubscription && (
                                          <div style={{
                                            width: '8px',
                                            height: '8px',
                                            borderRadius: '50%',
                                            backgroundColor: '#3b82f6'
                                          }} />
                                        )}
                                      </InlineStack>
                                    </InlineStack>
                                    <Text variant="bodySm" tone="subdued" as="code" truncate>
                                      {monthlyProduct.sku}
                                    </Text>
                                    <InlineStack gap="100">
                                      <Button
                                        size="micro"
                                        onClick={() => handleEditModalOpen(monthlyProduct)}
                                        disabled={!data.canCreateProducts}
                                      >
                                        Edit
                                      </Button>
                                      <Button
                                        size="micro"
                                        tone="critical"
                                        onClick={() => handleDeleteProduct(monthlyProduct.id)}
                                        disabled={!data.canCreateProducts}
                                      >
                                        Delete
                                      </Button>
                                    </InlineStack>
                                  </>
                                ) : (
                                  <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    height: '100%',
                                    gap: '8px'
                                  }}>
                                    <Button
                                      size="slim"
                                      icon={PlusIcon}
                                      onClick={() => {
                                        setSelectedTier(tier.id);
                                        setDuration('MONTHLY');
                                        setPrice('');
                                        handleModalOpen();
                                      }}
                                      disabled={!data.canCreateProducts}
                                    >
                                      Create
                                    </Button>
                                  </div>
                                )}
                              </div>

                              {/* Annual Cell */}
                              <div style={{
                                padding: '12px',
                                borderRadius: '8px',
                                border: '1px solid var(--p-color-border)',
                                background: annualProduct ? 'var(--p-color-bg-surface)' : 'var(--p-color-bg-surface-secondary)',
                                minHeight: '80px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
                              }}>
                                {annualProduct ? (
                                  <>
                                    <InlineStack align="space-between" blockAlign="start">
                                      <Text variant="headingMd" as="span" fontWeight="bold">
                                        {formatAmount(annualProduct.price)}
                                      </Text>
                                      <InlineStack gap="100">
                                        <div style={{
                                          width: '8px',
                                          height: '8px',
                                          borderRadius: '50%',
                                          backgroundColor: annualProduct.isActive ? '#22c55e' : '#eab308'
                                        }} />
                                        <div style={{
                                          width: '8px',
                                          height: '8px',
                                          borderRadius: '50%',
                                          backgroundColor: annualProduct.publishedAt ? '#22c55e' : '#9ca3af'
                                        }} />
                                        {annualProduct.hasSubscription && (
                                          <div style={{
                                            width: '8px',
                                            height: '8px',
                                            borderRadius: '50%',
                                            backgroundColor: '#3b82f6'
                                          }} />
                                        )}
                                      </InlineStack>
                                    </InlineStack>
                                    <Text variant="bodySm" tone="subdued" as="code" truncate>
                                      {annualProduct.sku}
                                    </Text>
                                    <InlineStack gap="100">
                                      <Button
                                        size="micro"
                                        onClick={() => handleEditModalOpen(annualProduct)}
                                        disabled={!data.canCreateProducts}
                                      >
                                        Edit
                                      </Button>
                                      <Button
                                        size="micro"
                                        tone="critical"
                                        onClick={() => handleDeleteProduct(annualProduct.id)}
                                        disabled={!data.canCreateProducts}
                                      >
                                        Delete
                                      </Button>
                                    </InlineStack>
                                  </>
                                ) : (
                                  <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    height: '100%',
                                    gap: '8px'
                                  }}>
                                    <Button
                                      size="slim"
                                      icon={PlusIcon}
                                      onClick={() => {
                                        setSelectedTier(tier.id);
                                        setDuration('ANNUAL');
                                        setPrice('');
                                        handleModalOpen();
                                      }}
                                      disabled={!data.canCreateProducts}
                                    >
                                      Create
                                    </Button>
                                  </div>
                                )}
                              </div>

                              {/* Lifetime Cell */}
                              <div style={{
                                padding: '12px',
                                borderRadius: '8px',
                                border: '1px solid var(--p-color-border)',
                                background: lifetimeProduct ? 'var(--p-color-bg-surface)' : 'var(--p-color-bg-surface-secondary)',
                                minHeight: '80px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
                              }}>
                                {lifetimeProduct ? (
                                  <>
                                    <InlineStack align="space-between" blockAlign="start">
                                      <Text variant="headingMd" as="span" fontWeight="bold">
                                        {formatAmount(lifetimeProduct.price)}
                                      </Text>
                                      <InlineStack gap="100">
                                        <div style={{
                                          width: '8px',
                                          height: '8px',
                                          borderRadius: '50%',
                                          backgroundColor: lifetimeProduct.isActive ? '#22c55e' : '#eab308'
                                        }} />
                                        <div style={{
                                          width: '8px',
                                          height: '8px',
                                          borderRadius: '50%',
                                          backgroundColor: lifetimeProduct.publishedAt ? '#22c55e' : '#9ca3af'
                                        }} />
                                        {lifetimeProduct.hasSubscription && (
                                          <div style={{
                                            width: '8px',
                                            height: '8px',
                                            borderRadius: '50%',
                                            backgroundColor: '#3b82f6'
                                          }} />
                                        )}
                                      </InlineStack>
                                    </InlineStack>
                                    <Text variant="bodySm" tone="subdued" as="code" truncate>
                                      {lifetimeProduct.sku}
                                    </Text>
                                    <InlineStack gap="100">
                                      <Button
                                        size="micro"
                                        onClick={() => handleEditModalOpen(lifetimeProduct)}
                                        disabled={!data.canCreateProducts}
                                      >
                                        Edit
                                      </Button>
                                      <Button
                                        size="micro"
                                        tone="critical"
                                        onClick={() => handleDeleteProduct(lifetimeProduct.id)}
                                        disabled={!data.canCreateProducts}
                                      >
                                        Delete
                                      </Button>
                                    </InlineStack>
                                  </>
                                ) : (
                                  <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    height: '100%',
                                    gap: '8px'
                                  }}>
                                    <Button
                                      size="slim"
                                      icon={PlusIcon}
                                      onClick={() => {
                                        setSelectedTier(tier.id);
                                        setDuration('LIFETIME');
                                        setPrice('');
                                        handleModalOpen();
                                      }}
                                      disabled={!data.canCreateProducts}
                                    >
                                      Create
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}

                  {/* Legend */}
                  <Box paddingBlockStart="400">
                    <BlockStack gap="200">
                      <Text variant="bodySm" as="span" fontWeight="semibold">Status Indicators:</Text>
                      <InlineStack gap="400">
                        <InlineStack gap="100" blockAlign="center">
                          <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: '#22c55e'
                          }} />
                          <Text variant="bodySm" tone="subdued" as="span">Active/Published</Text>
                        </InlineStack>
                        <InlineStack gap="100" blockAlign="center">
                          <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: '#eab308'
                          }} />
                          <Text variant="bodySm" tone="subdued" as="span">Draft</Text>
                        </InlineStack>
                        <InlineStack gap="100" blockAlign="center">
                          <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: '#9ca3af'
                          }} />
                          <Text variant="bodySm" tone="subdued" as="span">Unpublished</Text>
                        </InlineStack>
                        <InlineStack gap="100" blockAlign="center">
                          <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: '#3b82f6'
                          }} />
                          <Text variant="bodySm" tone="subdued" as="span">Subscription</Text>
                        </InlineStack>
                      </InlineStack>
                    </BlockStack>
                  </Box>
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>

          {/* Products Grid - Symmetric Card Layout - HIDDEN (Legacy Display) */}
          {false && <Layout.Section>
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
                  action={data.canCreateProducts ? {
                    content: "Create your first product",
                    onAction: handleModalOpen,
                  } : undefined}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>
                    Start creating membership products that customers can purchase to unlock tier benefits.
                  </p>
                  {!data.canCreateProducts && (
                    <Box paddingBlockStart="400">
                      <Text as="p" tone="subdued">
                        This feature requires Pro plan or higher. <Button variant="plain" url="/app/billing">Upgrade now</Button>
                      </Text>
                    </Box>
                  )}
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
          </Layout.Section>}

          {/* Recently Deleted Section */}
          {data.deletedTierProducts.length > 0 && (
            <Layout.Section>
              <Card>
                <Box padding="400">
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="200" blockAlign="center">
                        <Icon source={ArchiveIcon} tone="subdued" />
                        <Text as="h2" variant="headingMd">
                          Recently Deleted ({data.deletedTierProducts.length})
                        </Text>
                      </InlineStack>
                      <Button
                        variant="plain"
                        onClick={() => setShowRecentlyDeleted(!showRecentlyDeleted)}
                      >
                        {showRecentlyDeleted ? "Hide" : "Show"}
                      </Button>
                    </InlineStack>

                    {showRecentlyDeleted && (
                      <BlockStack gap="300">
                        <Banner tone="info">
                          <Text as="p" variant="bodyMd">
                            Deleted products can be restored within 30 days. After that, they are permanently removed.
                          </Text>
                        </Banner>

                        {data.deletedTierProducts.map((deletedProduct) => (
                          <Box
                            key={deletedProduct.id}
                            padding="300"
                            background="bg-surface-secondary"
                            borderRadius="200"
                          >
                            <InlineStack align="space-between" blockAlign="center" wrap={false}>
                              <BlockStack gap="100">
                                <InlineStack gap="200" blockAlign="center">
                                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                                    {deletedProduct.tierName}
                                  </Text>
                                  <Badge tone={deletedProduct.canRecover ? "attention" : "critical"}>
                                    {deletedProduct.canRecover
                                      ? `${deletedProduct.daysUntilPermanentDelete} days left`
                                      : "Expired"}
                                  </Badge>
                                </InlineStack>
                                <InlineStack gap="200">
                                  <Text as="span" variant="bodySm" tone="subdued">
                                    {formatCurrency(Number(deletedProduct.price), data.shopSettings?.storeCurrency || "USD")} • {deletedProduct.duration}
                                  </Text>
                                  <Text as="span" variant="bodySm" tone="subdued">
                                    • Deleted {new Date(deletedProduct.deletedAt).toLocaleDateString()}
                                  </Text>
                                </InlineStack>
                              </BlockStack>

                              <InlineStack gap="200">
                                {deletedProduct.canRecover && (
                                  <Button
                                    size="slim"
                                    icon={UndoIcon}
                                    onClick={() => handleRestoreProduct(deletedProduct)}
                                  >
                                    Restore
                                  </Button>
                                )}
                                <Button
                                  size="slim"
                                  tone="critical"
                                  icon={DeleteIcon}
                                  onClick={() => handlePermanentDeleteProduct(deletedProduct)}
                                >
                                  Delete Forever
                                </Button>
                              </InlineStack>
                            </InlineStack>
                          </Box>
                        ))}
                      </BlockStack>
                    )}
                  </BlockStack>
                </Box>
              </Card>
            </Layout.Section>
          )}
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
                              {subscriptionOptions.enableAnnual && (
                                <li>Annual: {data.shopSettings?.storeCurrency || "USD"} {(parseFloat(price || '0') * 12 * (1 - parseFloat(subscriptionOptions.annualDiscount) / 100)).toFixed(2)}/year</li>
                              )}
                            </ul>
                          </Banner>
                        </BlockStack>
                      </Box>
                    )}
                  </BlockStack>
                </>
              )}
            </FormLayout>
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
                options={
                  data.hasAnnualEval
                    ? [
                        { label: "Annual (resets yearly)", value: "ANNUAL" },
                        { label: "Lifetime (cumulative)", value: "LIFETIME" },
                      ]
                    : [
                        { label: "Lifetime (cumulative)", value: "LIFETIME" },
                      ]
                }
                value={tierFormData.evaluationPeriod}
                onChange={(value) => setTierFormData({ ...tierFormData, evaluationPeriod: value as "ANNUAL" | "LIFETIME" })}
                helpText={
                  !data.hasAnnualEval
                    ? "Annual evaluation period is only available on Ultra plan and above. Upgrade to unlock this feature."
                    : "Choose how tier status is calculated: annually reset or lifetime cumulative"
                }
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

        {/* Delete Confirmation Modal with Validation */}
        <Modal
          open={deleteModalActive}
          onClose={cancelDelete}
          title={`Delete Tier Product${deleteValidation?.product?.name ? `: ${deleteValidation.product.name}` : ''}`}
          primaryAction={deleteValidation?.canDelete ? {
            content: "Delete",
            destructive: true,
            onAction: confirmDelete,
            loading: navigation.state === "submitting",
          } : undefined}
          secondaryActions={[
            {
              content: deleteValidation?.canDelete ? "Cancel" : "Close",
              onAction: cancelDelete,
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              {/* Loading State */}
              {isValidatingDelete && (
                <InlineStack gap="200" align="center">
                  <Spinner size="small" />
                  <Text as="p" variant="bodyMd">Checking for active purchases and subscriptions...</Text>
                </InlineStack>
              )}

              {/* Blockers - Cannot Delete */}
              {!isValidatingDelete && deleteValidation && !deleteValidation.canDelete && (
                <>
                  <Banner tone="critical" title="Cannot delete this tier product">
                    <Text as="p" variant="bodyMd">
                      This product has active purchases or subscriptions that must be resolved first.
                    </Text>
                  </Banner>
                  <BlockStack gap="200">
                    {deleteValidation.blockers.map((blocker, index) => (
                      <InlineStack key={index} gap="200" blockAlign="start">
                        <Icon source={AlertTriangleIcon} tone="critical" />
                        <Text as="p" variant="bodyMd" tone="critical">
                          {blocker.message}
                        </Text>
                      </InlineStack>
                    ))}
                  </BlockStack>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Cancel or expire active subscriptions and wait for purchases to expire before deleting.
                  </Text>
                </>
              )}

              {/* Can Delete - Show Warnings and Confirmation */}
              {!isValidatingDelete && deleteValidation?.canDelete && (
                <>
                  {/* Warnings (non-blocking) */}
                  {deleteValidation.warnings.length > 0 && (
                    <>
                      <Banner tone="warning" title="Please note">
                        <BlockStack gap="100">
                          {deleteValidation.warnings.map((warning, index) => (
                            <Text key={index} as="p" variant="bodyMd">
                              • {warning.message}
                            </Text>
                          ))}
                        </BlockStack>
                      </Banner>
                      <Divider />
                    </>
                  )}

                  <div style={{ textAlign: 'left' }}>
                    <Text as="p" variant="bodyMd">
                      Are you sure you want to delete this tier product? This will:
                    </Text>
                  </div>
                  <BlockStack gap="200">
                    <InlineStack gap="200" blockAlign="start" align="start">
                      <Icon source={AlertTriangleIcon} tone="critical" />
                      <Text as="p" variant="bodyMd">
                        Remove the product from your Shopify store
                      </Text>
                    </InlineStack>
                    <InlineStack gap="200" blockAlign="start" align="start">
                      <Icon source={AlertTriangleIcon} tone="critical" />
                      <Text as="p" variant="bodyMd">
                        Delete the tier product record from the database
                      </Text>
                    </InlineStack>
                    <InlineStack gap="200" blockAlign="start" align="start">
                      <Icon source={AlertTriangleIcon} tone="critical" />
                      <Text as="p" variant="bodyMd">
                        Remove any expired purchase records
                      </Text>
                    </InlineStack>
                  </BlockStack>
                  <div style={{ textAlign: 'left' }}>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      You can restore deleted products within 30 days from the "Recently Deleted" section.
                    </Text>
                  </div>
                </>
              )}
            </BlockStack>
          </Modal.Section>
        </Modal>

        {/* Restore Confirmation Modal */}
        <Modal
          open={restoreModalActive}
          onClose={() => {
            setRestoreModalActive(false);
            setSelectedDeletedProduct(null);
          }}
          title="Restore Tier Product"
          primaryAction={{
            content: "Restore",
            onAction: confirmRestoreProduct,
            loading: restoreFetcher.state === "submitting",
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => {
                setRestoreModalActive(false);
                setSelectedDeletedProduct(null);
              },
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              {selectedDeletedProduct && (
                <>
                  <Text as="p" variant="bodyMd">
                    Are you sure you want to restore <strong>{selectedDeletedProduct.tierName}</strong> tier product?
                  </Text>
                  <Banner tone="info">
                    <Text as="p" variant="bodyMd">
                      This will restore the database record. However, the Shopify product was permanently deleted and may need to be recreated in Shopify.
                    </Text>
                  </Banner>
                </>
              )}
            </BlockStack>
          </Modal.Section>
        </Modal>

        {/* Permanent Delete Confirmation Modal */}
        <Modal
          open={permanentDeleteModalActive}
          onClose={() => {
            setPermanentDeleteModalActive(false);
            setSelectedDeletedProduct(null);
          }}
          title="Permanently Delete Tier Product"
          primaryAction={{
            content: "Permanently Delete",
            destructive: true,
            onAction: confirmPermanentDelete,
            loading: restoreFetcher.state === "submitting",
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => {
                setPermanentDeleteModalActive(false);
                setSelectedDeletedProduct(null);
              },
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              {selectedDeletedProduct && (
                <>
                  <Text as="p" variant="bodyMd">
                    Are you sure you want to permanently delete <strong>{selectedDeletedProduct.tierName}</strong> tier product?
                  </Text>
                  <Banner tone="critical">
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        This action cannot be undone!
                      </Text>
                      <Text as="p" variant="bodyMd">
                        All purchase records associated with this tier product will also be permanently deleted.
                      </Text>
                    </BlockStack>
                  </Banner>
                </>
              )}
            </BlockStack>
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