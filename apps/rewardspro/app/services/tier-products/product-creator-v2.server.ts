/**
 * Product Creator V2 Service
 * 
 * Uses the official Shopify productCreate mutation with proper publication handling
 * Based on Shopify's latest GraphQL API documentation
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { v4 as uuidv4 } from "uuid";

export interface ProductCreateConfig {
  title: string;
  description?: string;
  vendor?: string;
  productType?: string;
  price: string;
  sku: string;
  tags?: string[];
  status?: "ACTIVE" | "DRAFT" | "ARCHIVED";
  requiresShipping?: boolean;
  taxable?: boolean;
  options?: Array<{
    name: string;
    values: string[];
  }>;
}

export interface ProductCreateResult {
  success: boolean;
  productId?: string;
  variantId?: string;
  handle?: string;
  error?: string;
  publicationStatus?: {
    published: boolean;
    publicationCount: number;
  };
}

export class ProductCreatorV2 {
  private static readonly SERVICE_PREFIX = "[ProductCreatorV2]";

  /**
   * Main method to create and publish a product
   */
  static async createAndPublishProduct(
    admin: AdminApiContext,
    config: ProductCreateConfig
  ): Promise<ProductCreateResult> {
    try {
      // Step 1: Create the product
      const createResult = await this.createProduct(admin, config);
      if (!createResult.success || !createResult.productId) {
        return createResult;
      }

      // Step 2: Publish to online store
      const publishResult = await this.publishToOnlineStore(admin, createResult.productId);
      
      return {
        ...createResult,
        publicationStatus: {
          published: publishResult.success,
          publicationCount: publishResult.publicationCount || 0
        }
      };

    } catch (error) {
      console.error(`${this.SERVICE_PREFIX} Error in createAndPublishProduct:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred"
      };
    }
  }

  /**
   * Create product using productCreate mutation
   */
  private static async createProduct(
    admin: AdminApiContext,
    config: ProductCreateConfig
  ): Promise<ProductCreateResult> {
    const mutation = `#graphql
      mutation productCreate($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
        productCreate(product: $product, media: $media) {
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

    // Prepare product options with proper structure
    const productOptions = config.options || [
      {
        name: "Title",
        values: ["Default Title"]
      }
    ];

    // Build the product input according to Shopify's ProductCreateInput spec
    const productInput: any = {
      title: config.title,
      descriptionHtml: config.description ? `<p>${config.description}</p>` : undefined,
      vendor: config.vendor,
      productType: config.productType || "Tier Membership",
      status: config.status || "ACTIVE",
      tags: config.tags || [],
      requiresSellingPlan: false, // Will be set later if subscriptions are enabled
      productOptions: productOptions.map(option => ({
        name: option.name,
        values: option.values.map(value => ({ name: value }))
      }))
    };

    // Remove undefined values for cleaner mutation
    Object.keys(productInput).forEach(key => {
      if (productInput[key] === undefined) {
        delete productInput[key];
      }
    });

    try {
      console.log(`${this.SERVICE_PREFIX} Creating product with title:`, config.title);
      console.log(`${this.SERVICE_PREFIX} Product options:`, JSON.stringify(productOptions, null, 2));

      const response = await admin.graphql(mutation, {
        variables: {
          product: productInput,
          media: [] // Empty array if no media is provided
        }
      });

      const data = await response.json() as any;

      // Check for errors
      if (data.errors) {
        console.error(`${this.SERVICE_PREFIX} GraphQL errors:`, data.errors);
        return {
          success: false,
          error: data.errors.map((e: any) => e.message).join(", ")
        };
      }

      if (data.data?.productCreate?.userErrors?.length > 0) {
        const errors = data.data.productCreate.userErrors;
        console.error(`${this.SERVICE_PREFIX} User errors:`, errors);
        return {
          success: false,
          error: errors.map((e: any) => `${e.field}: ${e.message}`).join(", ")
        };
      }

      const product = data.data?.productCreate?.product;
      if (!product) {
        return {
          success: false,
          error: "No product returned from mutation"
        };
      }

      // Get the first variant
      const variant = product.variants?.edges?.[0]?.node;
      
      // Now update the variant with price and SKU using productVariantUpdate
      if (variant) {
        const updateResult = await this.updateVariantPriceAndSku(
          admin,
          variant.id,
          config.price,
          config.sku
        );

        if (!updateResult.success) {
          console.warn(`${this.SERVICE_PREFIX} Could not update variant price/SKU:`, updateResult.error);
        }
      }

      console.log(`${this.SERVICE_PREFIX} Product created successfully:`, {
        id: product.id,
        handle: product.handle,
        variantId: variant?.id
      });

      return {
        success: true,
        productId: product.id,
        variantId: variant?.id,
        handle: product.handle
      };

    } catch (error) {
      console.error(`${this.SERVICE_PREFIX} Error creating product:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create product"
      };
    }
  }

  /**
   * Update variant with price and SKU
   */
  private static async updateVariantPriceAndSku(
    admin: AdminApiContext,
    variantId: string,
    price: string,
    sku: string
  ): Promise<{ success: boolean; error?: string }> {
    const mutation = `
      mutation UpdateVariant($input: ProductVariantInput!) {
        productVariantUpdate(input: $input) {
          productVariant {
            id
            sku
            price
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      const response = await admin.graphql(mutation, {
        variables: {
          input: {
            id: variantId,
            price: price,
            sku: sku,
            inventoryPolicy: "CONTINUE"
          }
        }
      });

      const data = await response.json() as any;

      if (data.errors) {
        console.error(`${this.SERVICE_PREFIX} GraphQL errors updating variant:`, data.errors);
        return { success: false, error: "Failed to update variant" };
      }

      if (data.data?.productVariantUpdate?.userErrors?.length > 0) {
        const errors = data.data.productVariantUpdate.userErrors;
        return {
          success: false,
          error: errors.map((e: any) => e.message).join(", ")
        };
      }

      return { success: true };

    } catch (error) {
      console.error(`${this.SERVICE_PREFIX} Error updating variant:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update variant"
      };
    }
  }

  /**
   * Publish product to online store
   */
  private static async publishToOnlineStore(
    admin: AdminApiContext,
    productId: string
  ): Promise<{ success: boolean; publicationCount?: number; error?: string }> {
    try {
      // Step 1: Get publications
      const publicationsQuery = `
        query GetPublications {
          publications(first: 10) {
            edges {
              node {
                id
                name
                catalog {
                  id
                  title
                }
              }
            }
          }
        }
      `;

      const pubResponse = await admin.graphql(publicationsQuery);
      const pubData = await pubResponse.json() as any;

      if (pubData.errors) {
        console.error(`${this.SERVICE_PREFIX} Error fetching publications:`, pubData.errors);
        return { success: false, error: "Failed to fetch publications" };
      }

      // Find Online Store publication
      const onlineStore = pubData.data?.publications?.edges?.find(
        (edge: any) => 
          edge.node.name === "Online Store" || 
          edge.node.catalog?.title === "Online Store"
      );

      if (!onlineStore) {
        console.warn(`${this.SERVICE_PREFIX} Online Store publication not found`);
        // Try with default ID
        return this.publishWithDefaultId(admin, productId);
      }

      // Step 2: Publish to online store
      const publishMutation = `
        mutation PublishProduct($id: ID!, $input: [PublicationInput!]!) {
          publishablePublish(id: $id, input: $input) {
            publishable {
              availablePublicationsCount {
                count
              }
              resourcePublicationsCount {
                count
              }
            }
            shop {
              publicationCount
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
          id: productId,
          input: [{
            publicationId: onlineStore.node.id
          }]
        }
      });

      const publishData = await publishResponse.json() as any;

      if (publishData.errors) {
        console.error(`${this.SERVICE_PREFIX} GraphQL errors publishing:`, publishData.errors);
        return { success: false, error: "Failed to publish product" };
      }

      if (publishData.data?.publishablePublish?.userErrors?.length > 0) {
        const errors = publishData.data.publishablePublish.userErrors;
        console.error(`${this.SERVICE_PREFIX} Publication errors:`, errors);
        return {
          success: false,
          error: errors.map((e: any) => e.message).join(", ")
        };
      }

      const publicationCount = 
        publishData.data?.publishablePublish?.publishable?.resourcePublicationsCount?.count || 0;

      console.log(`${this.SERVICE_PREFIX} Product published to ${publicationCount} channel(s)`);
      
      return {
        success: true,
        publicationCount
      };

    } catch (error) {
      console.error(`${this.SERVICE_PREFIX} Error publishing product:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to publish product"
      };
    }
  }

  /**
   * Fallback: Try to publish with common Online Store ID
   */
  private static async publishWithDefaultId(
    admin: AdminApiContext,
    productId: string
  ): Promise<{ success: boolean; publicationCount?: number; error?: string }> {
    const mutation = `
      mutation PublishProductDefault($id: ID!) {
        publishablePublish(id: $id, input: [{ publicationId: "gid://shopify/Publication/1" }]) {
          publishable {
            resourcePublicationsCount {
              count
            }
          }
          userErrors {
            message
          }
        }
      }
    `;

    try {
      const response = await admin.graphql(mutation, {
        variables: { id: productId }
      });

      const data = await response.json() as any;

      if (!data.errors && !data.data?.publishablePublish?.userErrors?.length) {
        return {
          success: true,
          publicationCount: data.data?.publishablePublish?.publishable?.resourcePublicationsCount?.count || 0
        };
      }

      // If default ID doesn't work, product is created but not published
      console.warn(`${this.SERVICE_PREFIX} Could not auto-publish to online store`);
      return {
        success: false,
        error: "Manual publication required"
      };

    } catch (error) {
      return {
        success: false,
        error: "Could not publish to online store"
      };
    }
  }

  /**
   * Verify if product is published
   */
  static async verifyPublication(
    admin: AdminApiContext,
    productId: string
  ): Promise<{
    isPublished: boolean;
    onlineStorePublished: boolean;
    publicationCount: number;
  }> {
    const query = `
      query CheckProductPublication($id: ID!) {
        product(id: $id) {
          status
          publishedOnCurrentPublication
          resourcePublications(first: 10) {
            edges {
              node {
                isPublished
                publication {
                  id
                  name
                }
              }
            }
          }
        }
      }
    `;

    try {
      const response = await admin.graphql(query, {
        variables: { id: productId }
      });

      const data = await response.json() as any;
      const product = data.data?.product;

      if (!product) {
        return {
          isPublished: false,
          onlineStorePublished: false,
          publicationCount: 0
        };
      }

      const publications = product.resourcePublications?.edges || [];
      const onlineStore = publications.find(
        (pub: any) => pub.node.publication.name === "Online Store"
      );

      return {
        isPublished: product.status === "ACTIVE",
        onlineStorePublished: onlineStore?.node?.isPublished || false,
        publicationCount: publications.filter((p: any) => p.node.isPublished).length
      };

    } catch (error) {
      console.error(`${this.SERVICE_PREFIX} Error verifying publication:`, error);
      return {
        isPublished: false,
        onlineStorePublished: false,
        publicationCount: 0
      };
    }
  }
}