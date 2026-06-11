/**
 * Product Search Service
 *
 * Provides GraphQL-based product search for selecting Shopify products
 * as raffle prizes. Caches product metadata to avoid repeated API calls.
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

// ============================================
// TYPES
// ============================================

export interface ProductVariant {
  id: string; // gid://shopify/ProductVariant/123
  title: string;
  price: string;
  sku: string | null;
  inventoryQuantity: number | null;
  selectedOptions: Array<{ name: string; value: string }>;
}

export interface ShopifyProductResult {
  id: string; // gid://shopify/Product/123
  title: string;
  handle: string;
  status: string;
  featuredImage: { url: string } | null;
  totalInventory: number | null;
  priceRange: {
    minPrice: string;
    maxPrice: string;
    currencyCode: string;
  };
  variants: ProductVariant[];
}

export interface SelectedProduct {
  productId: string;
  variantId: string;
  title: string;
  variantTitle: string | null;
  image: string | null;
  price: string;
  sku: string | null;
}

// ============================================
// GRAPHQL QUERIES
// ============================================

const SEARCH_PRODUCTS_QUERY = `#graphql
  query SearchProducts($query: String!, $first: Int!) {
    products(first: $first, query: $query, sortKey: TITLE) {
      edges {
        node {
          id
          title
          handle
          status
          featuredImage {
            url(transform: { maxWidth: 200, maxHeight: 200 })
          }
          totalInventory
          priceRangeV2 {
            minVariantPrice {
              amount
              currencyCode
            }
            maxVariantPrice {
              amount
              currencyCode
            }
          }
          variants(first: 50) {
            edges {
              node {
                id
                title
                price
                sku
                inventoryQuantity
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
        }
      }
    }
  }
`;

const LIST_PRODUCTS_QUERY = `#graphql
  query ListProducts($first: Int!, $sortKey: ProductSortKeys!, $reverse: Boolean) {
    products(first: $first, sortKey: $sortKey, reverse: $reverse, query: "status:ACTIVE") {
      edges {
        node {
          id
          title
          handle
          status
          featuredImage {
            url(transform: { maxWidth: 200, maxHeight: 200 })
          }
          totalInventory
          priceRangeV2 {
            minVariantPrice {
              amount
              currencyCode
            }
            maxVariantPrice {
              amount
              currencyCode
            }
          }
          variants(first: 50) {
            edges {
              node {
                id
                title
                price
                sku
                inventoryQuantity
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
        }
      }
    }
  }
`;

const LIST_COLLECTIONS_QUERY = `#graphql
  query ListCollections($first: Int!) {
    collections(first: $first, sortKey: TITLE) {
      edges {
        node {
          id
          title
          handle
          productsCount {
            count
          }
        }
      }
    }
  }
`;

const LIST_COLLECTION_PRODUCTS_QUERY = `#graphql
  query ListCollectionProducts($collectionId: ID!, $first: Int!) {
    collection(id: $collectionId) {
      id
      title
      products(first: $first) {
        edges {
          node {
            id
            title
            handle
            status
            featuredImage {
              url(transform: { maxWidth: 200, maxHeight: 200 })
            }
            totalInventory
            priceRangeV2 {
              minVariantPrice {
                amount
                currencyCode
              }
              maxVariantPrice {
                amount
                currencyCode
              }
            }
            variants(first: 50) {
              edges {
                node {
                  id
                  title
                  price
                  sku
                  inventoryQuantity
                  selectedOptions {
                    name
                    value
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const GET_PRODUCT_QUERY = `#graphql
  query GetProduct($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      featuredImage {
        url(transform: { maxWidth: 200, maxHeight: 200 })
      }
      totalInventory
      priceRangeV2 {
        minVariantPrice {
          amount
          currencyCode
        }
        maxVariantPrice {
          amount
          currencyCode
        }
      }
      variants(first: 50) {
        edges {
          node {
            id
            title
            price
            sku
            inventoryQuantity
            selectedOptions {
              name
              value
            }
          }
        }
      }
    }
  }
`;

// ============================================
// HELPER FUNCTIONS
// ============================================

interface GraphQLProductNode {
  id: string;
  title: string;
  handle: string;
  status: string;
  featuredImage: { url: string } | null;
  totalInventory: number | null;
  priceRangeV2: {
    minVariantPrice: { amount: string; currencyCode: string };
    maxVariantPrice: { amount: string; currencyCode: string };
  };
  variants: {
    edges: Array<{
      node: {
        id: string;
        title: string;
        price: string;
        sku: string | null;
        inventoryQuantity: number | null;
        selectedOptions: Array<{ name: string; value: string }>;
      };
    }>;
  };
}

function transformProduct(node: GraphQLProductNode): ShopifyProductResult {
  return {
    id: node.id,
    title: node.title,
    handle: node.handle,
    status: node.status,
    featuredImage: node.featuredImage,
    totalInventory: node.totalInventory,
    priceRange: {
      minPrice: node.priceRangeV2.minVariantPrice.amount,
      maxPrice: node.priceRangeV2.maxVariantPrice.amount,
      currencyCode: node.priceRangeV2.minVariantPrice.currencyCode,
    },
    variants: node.variants.edges.map((edge) => ({
      id: edge.node.id,
      title: edge.node.title,
      price: edge.node.price,
      sku: edge.node.sku,
      inventoryQuantity: edge.node.inventoryQuantity,
      selectedOptions: edge.node.selectedOptions,
    })),
  };
}

// ============================================
// MAIN FUNCTIONS
// ============================================

/**
 * Search for products by title, handle, or SKU
 *
 * @param admin - Shopify admin API context
 * @param query - Search query (product title, handle, or SKU)
 * @param first - Maximum number of results (default: 20)
 * @returns Array of matching products
 */
export async function searchProducts(
  admin: AdminApiContext,
  query: string,
  first: number = 20
): Promise<ShopifyProductResult[]> {
  const LOG_PREFIX = "[ProductSearch]";

  if (!query.trim()) {
    return [];
  }

  try {
    console.log(`${LOG_PREFIX} Searching products: "${query}" (limit: ${first})`);

    const response = await admin.graphql(SEARCH_PRODUCTS_QUERY, {
      variables: {
        query: query.trim(),
        first: Math.min(first, 50), // Shopify limit
      },
    });

    const data = await response.json() as { data: any; errors?: Array<{ message: string }> };

    if (data.errors) {
      console.error(`${LOG_PREFIX} GraphQL errors:`, data.errors);
      throw new Error(data.errors[0]?.message || "GraphQL query failed");
    }

    const products = data.data?.products?.edges || [];
    console.log(`${LOG_PREFIX} Found ${products.length} products`);

    return products.map((edge: { node: GraphQLProductNode }) =>
      transformProduct(edge.node)
    );
  } catch (error) {
    console.error(`${LOG_PREFIX} Search error:`, error);
    throw error;
  }
}

/**
 * Get a single product by ID
 *
 * @param admin - Shopify admin API context
 * @param productId - Product GID (gid://shopify/Product/123)
 * @returns Product details or null if not found
 */
export async function getProductById(
  admin: AdminApiContext,
  productId: string
): Promise<ShopifyProductResult | null> {
  const LOG_PREFIX = "[ProductSearch]";

  try {
    console.log(`${LOG_PREFIX} Getting product: ${productId}`);

    const response = await admin.graphql(GET_PRODUCT_QUERY, {
      variables: { id: productId },
    });

    const data = await response.json() as { data: any; errors?: Array<{ message: string }> };

    if (data.errors) {
      console.error(`${LOG_PREFIX} GraphQL errors:`, data.errors);
      throw new Error(data.errors[0]?.message || "GraphQL query failed");
    }

    const product = data.data?.product;
    if (!product) {
      console.log(`${LOG_PREFIX} Product not found: ${productId}`);
      return null;
    }

    return transformProduct(product);
  } catch (error) {
    console.error(`${LOG_PREFIX} Get product error:`, error);
    throw error;
  }
}

/**
 * Get the first variant ID for a product
 * Used when no specific variant is selected
 *
 * @param admin - Shopify admin API context
 * @param productId - Product GID
 * @returns First variant GID or null
 */
export async function getFirstVariantId(
  admin: AdminApiContext,
  productId: string
): Promise<string | null> {
  const product = await getProductById(admin, productId);
  return product?.variants[0]?.id || null;
}

/**
 * Validate that a product exists and is active
 *
 * @param admin - Shopify admin API context
 * @param productId - Product GID to validate
 * @returns Validation result with product data
 */
export async function validateProduct(
  admin: AdminApiContext,
  productId: string
): Promise<{
  valid: boolean;
  product: ShopifyProductResult | null;
  error?: string;
}> {
  try {
    const product = await getProductById(admin, productId);

    if (!product) {
      return { valid: false, product: null, error: "Product not found" };
    }

    if (product.status !== "ACTIVE") {
      return {
        valid: false,
        product,
        error: `Product is ${product.status.toLowerCase()}, not active`,
      };
    }

    if (product.variants.length === 0) {
      return { valid: false, product, error: "Product has no variants" };
    }

    return { valid: true, product };
  } catch (error) {
    return {
      valid: false,
      product: null,
      error: error instanceof Error ? error.message : "Validation failed",
    };
  }
}

/**
 * Format a product and variant for storage in prizeValue
 *
 * @param product - Product from search results
 * @param variantId - Selected variant ID (optional, uses first variant if not provided)
 * @param quantity - Prize quantity
 * @returns SelectedProduct object for prizeValue
 */
export function formatProductForPrize(
  product: ShopifyProductResult,
  variantId?: string,
  quantity: number = 1
): SelectedProduct & { quantity: number } {
  const variant = variantId
    ? product.variants.find((v) => v.id === variantId)
    : product.variants[0];

  if (!variant) {
    throw new Error("No valid variant found for product");
  }

  return {
    productId: product.id,
    variantId: variant.id,
    title: product.title,
    variantTitle:
      variant.title !== "Default Title" ? variant.title : null,
    image: product.featuredImage?.url || null,
    price: variant.price,
    sku: variant.sku,
    quantity,
  };
}

// ============================================
// BROWSE FUNCTIONS (No Search Required)
// ============================================

export interface ShopifyCollection {
  id: string;
  title: string;
  handle: string;
  productsCount: number;
}

export type ProductSortKey = 'TITLE' | 'UPDATED_AT' | 'CREATED_AT' | 'BEST_SELLING' | 'PRICE';

/**
 * List products without search query (for browsing)
 *
 * @param admin - Shopify admin API context
 * @param options - List options
 * @returns Array of products
 */
export async function listProducts(
  admin: AdminApiContext,
  options?: {
    first?: number;
    sortKey?: ProductSortKey;
    reverse?: boolean;
  }
): Promise<ShopifyProductResult[]> {
  const LOG_PREFIX = "[ProductSearch]";
  const first = Math.min(options?.first || 20, 50);
  const sortKey = options?.sortKey || 'UPDATED_AT';
  const reverse = options?.reverse ?? true; // Default: newest first

  try {
    console.log(`${LOG_PREFIX} Listing products (first: ${first}, sort: ${sortKey})`);

    const response = await admin.graphql(LIST_PRODUCTS_QUERY, {
      variables: {
        first,
        sortKey,
        reverse,
      },
    });

    const data = await response.json() as { data: any; errors?: Array<{ message: string }> };

    if (data.errors) {
      console.error(`${LOG_PREFIX} GraphQL errors:`, data.errors);
      throw new Error(data.errors[0]?.message || "GraphQL query failed");
    }

    const products = data.data?.products?.edges || [];
    console.log(`${LOG_PREFIX} Listed ${products.length} products`);

    return products.map((edge: { node: GraphQLProductNode }) =>
      transformProduct(edge.node)
    );
  } catch (error) {
    console.error(`${LOG_PREFIX} List products error:`, error);
    throw error;
  }
}

/**
 * List all collections
 *
 * @param admin - Shopify admin API context
 * @param first - Maximum collections to return
 * @returns Array of collections
 */
export async function listCollections(
  admin: AdminApiContext,
  first: number = 50
): Promise<ShopifyCollection[]> {
  const LOG_PREFIX = "[ProductSearch]";

  try {
    console.log(`${LOG_PREFIX} Listing collections (first: ${first})`);

    const response = await admin.graphql(LIST_COLLECTIONS_QUERY, {
      variables: { first: Math.min(first, 100) },
    });

    const data = await response.json() as { data: any; errors?: Array<{ message: string }> };

    if (data.errors) {
      console.error(`${LOG_PREFIX} GraphQL errors:`, data.errors);
      throw new Error(data.errors[0]?.message || "GraphQL query failed");
    }

    const collections = data.data?.collections?.edges || [];
    console.log(`${LOG_PREFIX} Listed ${collections.length} collections`);

    return collections.map((edge: any) => ({
      id: edge.node.id,
      title: edge.node.title,
      handle: edge.node.handle,
      productsCount: edge.node.productsCount?.count || 0,
    }));
  } catch (error) {
    console.error(`${LOG_PREFIX} List collections error:`, error);
    throw error;
  }
}

/**
 * List products in a specific collection
 *
 * @param admin - Shopify admin API context
 * @param collectionId - Collection GID
 * @param first - Maximum products to return
 * @returns Array of products in the collection
 */
export async function listCollectionProducts(
  admin: AdminApiContext,
  collectionId: string,
  first: number = 20
): Promise<ShopifyProductResult[]> {
  const LOG_PREFIX = "[ProductSearch]";

  try {
    console.log(`${LOG_PREFIX} Listing collection products: ${collectionId} (first: ${first})`);

    const response = await admin.graphql(LIST_COLLECTION_PRODUCTS_QUERY, {
      variables: {
        collectionId,
        first: Math.min(first, 50),
      },
    });

    const data = await response.json() as { data: any; errors?: Array<{ message: string }> };

    if (data.errors) {
      console.error(`${LOG_PREFIX} GraphQL errors:`, data.errors);
      throw new Error(data.errors[0]?.message || "GraphQL query failed");
    }

    const collection = data.data?.collection;
    if (!collection) {
      console.log(`${LOG_PREFIX} Collection not found: ${collectionId}`);
      return [];
    }

    const products = collection.products?.edges || [];
    console.log(`${LOG_PREFIX} Listed ${products.length} products from collection "${collection.title}"`);

    // Filter to only active products
    return products
      .filter((edge: any) => edge.node.status === "ACTIVE")
      .map((edge: { node: GraphQLProductNode }) =>
        transformProduct(edge.node)
      );
  } catch (error) {
    console.error(`${LOG_PREFIX} List collection products error:`, error);
    throw error;
  }
}
