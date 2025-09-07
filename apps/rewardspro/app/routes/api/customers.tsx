/**
 * API resource route for customer collection operations
 * Provides RESTful endpoints for customer listing and creation
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../../shopify.server";
import db from "../../db.server";
import { v4 as uuidv4 } from "uuid";

/**
 * GET /api/customers
 * Lists customers with optional filtering and pagination
 * 
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 * - tier: Filter by tier ID
 * - search: Search by email
 * 
 * @returns Paginated customer list
 * @throws {Response} 401 if not authenticated
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 20)));
  const tierId = url.searchParams.get("tier");
  const search = url.searchParams.get("search");
  
  const where = {
    shop: session.shop,
    ...(tierId && { currentTierId: tierId }),
    ...(search && {
      email: {
        contains: search,
        mode: 'insensitive' as const
      }
    })
  };
  
  const [customers, total] = await Promise.all([
    db.customer.findMany({
      where,
      include: {
        currentTier: {
          select: {
            id: true,
            name: true,
            cashbackPercent: true
          }
        }
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' }
    }),
    db.customer.count({ where })
  ]);
  
  return json({
    customers: customers.map(customer => ({
      id: customer.id,
      email: customer.email,
      shopifyCustomerId: customer.shopifyCustomerId,
      storeCredit: customer.storeCredit.toString(),
      currentTier: customer.currentTier,
      createdAt: customer.createdAt.toISOString()
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1
    }
  });
}

/**
 * POST /api/customers
 * Creates a new customer
 * 
 * @returns Created customer data
 * @throws {Response} 400 if validation fails
 * @throws {Response} 401 if not authenticated
 */
export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  
  if (request.method !== "POST") {
    throw new Response("Method not allowed", { status: 405 });
  }
  
  const data = await request.json();
  
  // Validate required fields
  if (!data.email || !data.shopifyCustomerId) {
    throw new Response("Email and Shopify Customer ID are required", { status: 400 });
  }
  
  // Check for duplicate
  const existing = await db.customer.findFirst({
    where: {
      shop: session.shop,
      shopifyCustomerId: data.shopifyCustomerId
    }
  });
  
  if (existing) {
    throw new Response("Customer already exists", { status: 409 });
  }
  
  const customer = await db.customer.create({
    data: {
      id: uuidv4(),
      shop: session.shop,
      email: data.email,
      shopifyCustomerId: data.shopifyCustomerId,
      storeCredit: data.storeCredit || 0,
      currentTierId: data.tierId || null,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  });
  
  return json({
    success: true,
    customer: {
      id: customer.id,
      email: customer.email,
      shopifyCustomerId: customer.shopifyCustomerId,
      storeCredit: customer.storeCredit.toString()
    }
  }, { status: 201 });
}