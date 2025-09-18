/**
 * Product Publisher Service
 * 
 * Handles publishing products to sales channels (specifically Online Store)
 * Uses multiple fallback strategies to ensure products are visible
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

export class ProductPublisher {
  private static readonly SERVICE_PREFIX = "[ProductPublisher]";

  /**
   * Main method to ensure product is published to online store
   */
  static async ensurePublishedToOnlineStore(
    admin: AdminApiContext,
    productId: string
  ): Promise<{ success: boolean; error?: string }> {
    console.log(`${this.SERVICE_PREFIX} Ensuring product ${productId} is published to online store`);

    // Strategy 1: Try to get publications and publish directly
    const publicationResult = await this.publishViaPublications(admin, productId);
    if (publicationResult.success) {
      return publicationResult;
    }

    // Strategy 2: Use productSet to ensure availability
    const productSetResult = await this.publishViaProductSet(admin, productId);
    if (productSetResult.success) {
      return productSetResult;
    }

    // Strategy 3: Try resource publication
    const resourceResult = await this.publishViaResourcePublication(admin, productId);
    if (resourceResult.success) {
      return resourceResult;
    }

    // If all strategies fail, log warning but don't fail the product creation
    console.warn(`${this.SERVICE_PREFIX} Could not automatically publish product ${productId} to online store. Manual publication may be required.`);
    return {
      success: false,
      error: "Product created but requires manual publication to online store"
    };
  }

  /**
   * Strategy 1: Use publications API to publish to online store
   */
  private static async publishViaPublications(
    admin: AdminApiContext,
    productId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get available publications
      const query = `
        query getPublications {
          publications(first: 10) {
            edges {
              node {
                id
                name
                supportsFuturePublishing
                catalog {
                  id
                  title
                }
              }
            }
          }
        }
      `;

      const response = await admin.graphql(query);
      const data = await response.json();

      if (data.errors) {
        console.error(`${this.SERVICE_PREFIX} Error fetching publications:`, data.errors);
        return { success: false, error: "Failed to fetch publications" };
      }

      // Find Online Store publication
      const publications = data.data?.publications?.edges || [];
      const onlineStore = publications.find((pub: any) => 
        pub.node.name === "Online Store" || 
        pub.node.catalog?.title === "Online Store"
      );

      if (!onlineStore) {
        console.log(`${this.SERVICE_PREFIX} Online Store publication not found`);
        return { success: false, error: "Online Store publication not found" };
      }

      // Publish to online store
      const publishMutation = `
        mutation publishProduct($id: ID!, $input: [PublicationInput!]!) {
          publishablePublish(id: $id, input: $input) {
            publishable {
              availablePublicationsCount {
                count
              }
              publicationCount
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

      const publishData = await publishResponse.json();

      if (publishData.errors) {
        console.error(`${this.SERVICE_PREFIX} GraphQL errors:`, publishData.errors);
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

      console.log(`${this.SERVICE_PREFIX} Successfully published to online store via publications API`);
      return { success: true };

    } catch (error) {
      console.error(`${this.SERVICE_PREFIX} Error in publishViaPublications:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Strategy 2: Use productSet mutation to update publication status
   */
  private static async publishViaProductSet(
    admin: AdminApiContext,
    productId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const mutation = `
        mutation makeProductAvailable($input: ProductSetInput!) {
          productSet(input: $input) {
            product {
              id
              status
              publishedOnCurrentPublication
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const response = await admin.graphql(mutation, {
        variables: {
          input: {
            id: productId,
            productOptions: [],
            status: "ACTIVE"
          }
        }
      });

      const data = await response.json();

      if (data.errors) {
        console.error(`${this.SERVICE_PREFIX} GraphQL errors in productSet:`, data.errors);
        return { success: false, error: "Failed to update product status" };
      }

      if (data.data?.productSet?.userErrors?.length > 0) {
        const errors = data.data.productSet.userErrors;
        console.error(`${this.SERVICE_PREFIX} ProductSet errors:`, errors);
        return {
          success: false,
          error: errors.map((e: any) => e.message).join(", ")
        };
      }

      console.log(`${this.SERVICE_PREFIX} Product set to ACTIVE status`);
      return { success: true };

    } catch (error) {
      console.error(`${this.SERVICE_PREFIX} Error in publishViaProductSet:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Strategy 3: Use resource publication API
   */
  private static async publishViaResourcePublication(
    admin: AdminApiContext,
    productId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const mutation = `
        mutation createResourcePublication($input: ResourcePublicationInput!) {
          resourcePublicationCreate(resourcePublication: $input) {
            resourcePublication {
              isPublished
              publication {
                name
                id
              }
              publishDate
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      // Try with a generic online store publication ID
      const response = await admin.graphql(mutation, {
        variables: {
          input: {
            resourceId: productId,
            publicationId: "gid://shopify/Publication/1", // Common ID for online store
            publishDate: new Date().toISOString()
          }
        }
      });

      const data = await response.json();

      if (data.errors) {
        console.error(`${this.SERVICE_PREFIX} GraphQL errors in resource publication:`, data.errors);
        return { success: false, error: "Failed to create resource publication" };
      }

      if (data.data?.resourcePublicationCreate?.userErrors?.length > 0) {
        const errors = data.data.resourcePublicationCreate.userErrors;
        console.error(`${this.SERVICE_PREFIX} Resource publication errors:`, errors);
        return {
          success: false,
          error: errors.map((e: any) => e.message).join(", ")
        };
      }

      console.log(`${this.SERVICE_PREFIX} Successfully created resource publication`);
      return { success: true };

    } catch (error) {
      console.error(`${this.SERVICE_PREFIX} Error in publishViaResourcePublication:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Check if product is published to online store
   */
  static async checkPublicationStatus(
    admin: AdminApiContext,
    productId: string
  ): Promise<{
    isPublished: boolean;
    publicationCount: number;
    onlineStoreStatus: boolean;
  }> {
    try {
      const query = `
        query checkProductPublication($id: ID!) {
          product(id: $id) {
            id
            status
            publishedOnCurrentPublication
            publicationCount
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

      const response = await admin.graphql(query, {
        variables: { id: productId }
      });

      const data = await response.json();
      const product = data.data?.product;

      if (!product) {
        return {
          isPublished: false,
          publicationCount: 0,
          onlineStoreStatus: false
        };
      }

      const onlineStorePublication = product.resourcePublications?.edges?.find(
        (edge: any) => edge.node.publication.name === "Online Store"
      );

      return {
        isPublished: product.status === "ACTIVE",
        publicationCount: product.publicationCount || 0,
        onlineStoreStatus: onlineStorePublication?.node?.isPublished || false
      };

    } catch (error) {
      console.error(`${this.SERVICE_PREFIX} Error checking publication status:`, error);
      return {
        isPublished: false,
        publicationCount: 0,
        onlineStoreStatus: false
      };
    }
  }
}