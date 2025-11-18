import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * Setup Customer Metafield for Storefront Widget
 *
 * This endpoint creates the customer metafield definition that stores
 * the RewardsPro customer ID for storefront widget authentication.
 *
 * Usage: POST /api/setup-customer-metafield
 */

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    // Create customer metafield definition
    const metafieldDefinitionMutation = `
      mutation CreateCustomerMetafieldDefinition {
        metafieldDefinitionCreate(
          definition: {
            name: "RewardsPro Customer ID"
            namespace: "rewardspro"
            key: "customer_id"
            description: "Internal RewardsPro customer ID for loyalty program"
            type: "single_line_text_field"
            ownerType: CUSTOMER
            access: {
              storefront: READ
            }
          }
        ) {
          createdDefinition {
            id
            name
            namespace
            key
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const response = await admin.graphql(metafieldDefinitionMutation);
    const data = await response.json();

    if (data.data?.metafieldDefinitionCreate?.userErrors?.length > 0) {
      const errors = data.data.metafieldDefinitionCreate.userErrors;
      console.error("Metafield definition creation errors:", errors);

      // Check if error is because definition already exists
      const alreadyExists = errors.some((err: any) =>
        err.message.includes("already exists") || err.message.includes("taken")
      );

      if (alreadyExists) {
        return json({
          success: true,
          message: "Metafield definition already exists",
          alreadyExists: true
        });
      }

      return json({
        success: false,
        error: "Failed to create metafield definition",
        details: errors
      }, { status: 400 });
    }

    const definition = data.data?.metafieldDefinitionCreate?.createdDefinition;

    console.log("Customer metafield definition created:", definition);

    // Now populate metafield for existing customers
    const customers = await db.customer.findMany({
      where: { shop },
      select: {
        id: true,
        shopifyCustomerId: true,
        shopifyCustomerMetafieldId: true
      }
    });

    let updatedCount = 0;
    let skippedCount = 0;
    const errors: any[] = [];

    for (const customer of customers) {
      // Skip if already has metafield ID
      if (customer.shopifyCustomerMetafieldId) {
        skippedCount++;
        continue;
      }

      if (!customer.shopifyCustomerId) {
        skippedCount++;
        continue;
      }

      try {
        // Set customer metafield with RewardsPro customer ID
        const setMetafieldMutation = `
          mutation SetCustomerMetafield($customerId: ID!, $metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
              metafields {
                id
                namespace
                key
                value
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        const metafieldResponse = await admin.graphql(setMetafieldMutation, {
          variables: {
            customerId: customer.shopifyCustomerId,
            metafields: [
              {
                ownerId: customer.shopifyCustomerId,
                namespace: "rewardspro",
                key: "customer_id",
                value: customer.id,
                type: "single_line_text_field"
              }
            ]
          }
        });

        const metafieldData = await metafieldResponse.json();

        if (metafieldData.data?.metafieldsSet?.userErrors?.length > 0) {
          errors.push({
            customerId: customer.id,
            shopifyCustomerId: customer.shopifyCustomerId,
            errors: metafieldData.data.metafieldsSet.userErrors
          });
          continue;
        }

        const metafieldId = metafieldData.data?.metafieldsSet?.metafields?.[0]?.id;

        if (metafieldId) {
          // Update customer record with metafield ID
          await db.customer.update({
            where: { id: customer.id },
            data: { shopifyCustomerMetafieldId: metafieldId }
          });

          updatedCount++;
        }
      } catch (error) {
        console.error(`Error setting metafield for customer ${customer.id}:`, error);
        errors.push({
          customerId: customer.id,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    return json({
      success: true,
      message: "Customer metafield setup complete",
      stats: {
        total: customers.length,
        updated: updatedCount,
        skipped: skippedCount,
        errors: errors.length
      },
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error("Error setting up customer metafield:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}
