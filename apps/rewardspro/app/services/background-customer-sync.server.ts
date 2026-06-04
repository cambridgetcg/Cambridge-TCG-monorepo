import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import crypto from "node:crypto";
import prisma from "../db.server";

/**
 * Background customer sync function for afterAuth hook
 * Syncs all customers from Shopify to the database in the background
 * Uses the same simple, reliable sync method as the customers page
 */
export async function syncCustomersInBackground(
  shop: string,
  admin: AdminApiContext
): Promise<void> {
  console.log(`[Background Sync] Starting customer sync for shop: ${shop}`);

  try {
    // Mark sync as in progress
    await prisma.shopSettings.upsert({
      where: { shop },
      create: {
        shop,
        storeName: shop,
        storeUrl: `https://${shop}`,
        customersSyncInProgress: true,
        customersInitialSynced: false,
      },
      update: {
        customersSyncInProgress: true,
        updatedAt: new Date(),
      },
    });

    // Minimal GraphQL query - only essential fields for Prisma schema
    const customersQuery = `
      query getCustomers($first: Int!, $after: String) {
        customers(first: $first, after: $after) {
          edges {
            cursor
            node {
              id
              email
              displayName
              createdAt
              updatedAt
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    let hasNextPage = true;
    let cursor = null;
    let totalImported = 0;
    let totalUpdated = 0;
    let totalErrors = 0;

    while (hasNextPage) {
      const response = await admin.graphql(customersQuery, {
        variables: {
          first: 250, // Max allowed per request
          after: cursor,
        },
      });

      const result = await response.json() as any;

      if (result.errors) {
        console.error("[Background Sync] GraphQL errors:", result.errors);
        throw new Error("GraphQL query failed");
      }

      const customers = result.data.customers;

      // Process each customer
      for (const edge of customers.edges) {
        const shopifyCustomer = edge.node;
        const shopifyId = shopifyCustomer.id.split('/').pop(); // Extract ID from gid://shopify/Customer/9224704098643

        try {
          // Check if customer already exists
          const existingCustomer = await prisma.customer.findFirst({
            where: {
              shop,
              shopifyCustomerId: shopifyId,
            },
          });

          if (!existingCustomer) {
            // Create new customer with minimal required fields
            await prisma.customer.create({
              data: {
                id: crypto.randomUUID(),
                shop,
                shopifyCustomerId: shopifyId,
                email: shopifyCustomer.email || `customer${shopifyId}@placeholder.com`, // Fallback email if null
                storeCredit: 0, // Default to 0
                createdAt: new Date(shopifyCustomer.createdAt),
                updatedAt: new Date(shopifyCustomer.updatedAt),
              },
            });

            totalImported++;
            console.log(`[Background Sync] Imported customer ${shopifyId}`);
          } else {
            // Update existing customer only if email has changed
            if (shopifyCustomer.email && shopifyCustomer.email !== existingCustomer.email) {
              await prisma.customer.update({
                where: { id: existingCustomer.id },
                data: {
                  email: shopifyCustomer.email,
                  updatedAt: new Date(shopifyCustomer.updatedAt),
                },
              });

              totalUpdated++;
              console.log(`[Background Sync] Updated customer ${shopifyId} email`);
            }
          }
        } catch (customerError) {
          console.error(`[Background Sync] Error processing customer ${shopifyId}:`, customerError);
          totalErrors++;
        }
      }

      hasNextPage = customers.pageInfo.hasNextPage;
      cursor = customers.pageInfo.endCursor;

      // Log progress
      console.log(`[Background Sync] Processed batch. Total so far - Imported: ${totalImported}, Updated: ${totalUpdated}, Errors: ${totalErrors}`);
    }

    console.log(
      `[Background Sync] ✅ Customer sync completed for ${shop}: ` +
      `Imported ${totalImported}, Updated ${totalUpdated}, Errors ${totalErrors}`
    );

    // Mark sync as completed
    await prisma.shopSettings.update({
      where: { shop },
      data: {
        customersInitialSynced: true,
        customersSyncInProgress: false,
        updatedAt: new Date(),
      },
    });

  } catch (error) {
    console.error(`[Background Sync] ❌ Error during customer sync for ${shop}:`, error);

    // Mark sync as failed
    try {
      await prisma.shopSettings.update({
        where: { shop },
        data: {
          customersSyncInProgress: false,
          updatedAt: new Date(),
        },
      });
    } catch (dbError) {
      console.error(`[Background Sync] Failed to update sync status:`, dbError);
    }
  }
}
