/**
 * API resource route for individual customer operations
 * Provides RESTful endpoints for customer data
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../../shopify.server";
import db from "../../db.server";
import { setManualOverride } from "../../services/tier-state.server";

/**
 * GET /api/customers/:id
 * Retrieves a single customer by ID
 * 
 * @returns Customer data with tier information
 * @throws {Response} 404 if customer not found
 * @throws {Response} 401 if not authenticated
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  
  if (!params.id) {
    throw new Response("Customer ID required", { status: 400 });
  }
  
  const customer = await db.customer.findFirst({
    where: {
      id: params.id,
      shop: session.shop
    }
  });
  
  if (!customer) {
    throw new Response("Customer not found", { status: 404 });
  }
  
  // Fetch related data separately (Data API doesn't support includes)
  const [currentTier, creditLedger] = await Promise.all([
    customer.currentTierId ? db.tier.findUnique({
      where: { id: customer.currentTierId }
    }) : Promise.resolve(null),
    db.storeCreditLedger.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: 'desc' },
      take: 10
    })
  ]);
  
  return json({
    id: customer.id,
    email: customer.email,
    shopifyCustomerId: customer.shopifyCustomerId,
    storeCredit: customer.storeCredit.toString(),
    currentTier,
    recentTransactions: creditLedger.map(ledger => ({
      id: ledger.id,
      amount: ledger.amount.toString(),
      type: ledger.type,
      reason: ledger.reason,
      createdAt: ledger.createdAt.toISOString()
    }))
  });
}

/**
 * PATCH /api/customers/:id
 * Updates customer data
 * 
 * @returns Updated customer data
 * @throws {Response} 404 if customer not found
 * @throws {Response} 401 if not authenticated
 */
export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  
  if (!params.id) {
    throw new Response("Customer ID required", { status: 400 });
  }
  
  const method = request.method.toUpperCase();
  
  switch (method) {
    case "PATCH":
    case "PUT": {
      const data = await request.json();

      // Handle tier change through the manual override system (not direct update)
      // This ensures proper logging, CustomerTierState update, and tier resolution
      if (data.currentTierId !== undefined) {
        const overrideResult = await setManualOverride(
          session.shop,
          params.id,
          data.currentTierId, // Can be null to remove tier
          'api', // Admin user ID - could be enhanced to pass actual user from session
          {
            permanent: true,
            note: data.tierNote || 'Updated via API'
          }
        );

        if (!overrideResult.success) {
          return json({
            success: false,
            error: overrideResult.error || 'Failed to update tier'
          }, { status: 400 });
        }
      }

      // Handle other updates (like storeCredit)
      const updateData: any = {
        updatedAt: new Date()
      };

      if (data.storeCredit !== undefined) {
        updateData.storeCredit = parseFloat(data.storeCredit);
      }

      // Only update if we have fields other than tier to update
      let customer;
      if (Object.keys(updateData).length > 1) { // More than just updatedAt
        customer = await db.customer.update({
          where: { id: params.id },
          data: updateData
        });
      } else {
        // Just fetch the customer for response
        customer = await db.customer.findUnique({
          where: { id: params.id }
        });
      }

      if (!customer) {
        throw new Response("Customer not found", { status: 404 });
      }

      return json({
        success: true,
        customer: {
          id: customer.id,
          email: customer.email,
          storeCredit: customer.storeCredit.toString()
        }
      });
    }
    
    case "DELETE": {
      await db.customer.delete({
        where: {
          id: params.id
        }
      });
      
      return json({ success: true });
    }
    
    default:
      throw new Response("Method not allowed", { status: 405 });
  }
}