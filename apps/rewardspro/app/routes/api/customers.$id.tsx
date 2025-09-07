/**
 * API resource route for individual customer operations
 * Provides RESTful endpoints for customer data
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../../shopify.server";
import db from "../../db.server";

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
    },
    include: {
      currentTier: true,
      creditLedger: {
        take: 10,
        orderBy: { createdAt: 'desc' }
      }
    }
  });
  
  if (!customer) {
    throw new Response("Customer not found", { status: 404 });
  }
  
  return json({
    id: customer.id,
    email: customer.email,
    shopifyCustomerId: customer.shopifyCustomerId,
    storeCredit: customer.storeCredit.toString(),
    currentTier: customer.currentTier,
    recentTransactions: customer.creditLedger.map(ledger => ({
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
      
      const customer = await db.customer.update({
        where: {
          id: params.id
        },
        data: {
          ...(data.storeCredit !== undefined && {
            storeCredit: parseFloat(data.storeCredit)
          }),
          ...(data.currentTierId !== undefined && {
            currentTierId: data.currentTierId
          }),
          updatedAt: new Date()
        }
      });
      
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