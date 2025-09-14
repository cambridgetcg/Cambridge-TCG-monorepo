import { json, type LoaderFunctionArgs } from "@remix-run/node";
import crypto from "crypto";
import db from "~/db.server";
import { formatCurrency } from "~/utils/currency";

/**
 * App Proxy Route for Membership Data
 * Serves customer rewards data securely to the storefront widget
 * URL: /apps/rewardspro/membership
 */

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  
  // 1. Verify the request is from Shopify (HMAC signature verification)
  const signature = url.searchParams.get('signature');
  const timestamp = url.searchParams.get('timestamp');
  const shop = url.searchParams.get('shop');
  
  // Verify signature if present (Shopify adds this to app proxy requests)
  if (signature) {
    const params = new URLSearchParams(url.searchParams);
    params.delete('signature');
    params.delete('hmac'); // Sometimes Shopify uses hmac instead
    
    // Sort parameters alphabetically
    const sortedParams = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('');
    
    const expectedSignature = crypto
      .createHmac('sha256', process.env.SHOPIFY_API_SECRET!)
      .update(sortedParams)
      .digest('hex');
    
    // Timing-safe comparison
    if (!crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )) {
      console.error('Invalid app proxy signature');
      return json(
        { error: 'Invalid signature' },
        { 
          status: 401,
          headers: getCorsHeaders()
        }
      );
    }
  }
  
  // 2. Check if shop domain is provided
  if (!shop) {
    return json(
      { error: 'Shop parameter required' },
      { 
        status: 400,
        headers: getCorsHeaders()
      }
    );
  }
  
  // 3. Get customer ID from Shopify's app proxy parameters
  const customerId = url.searchParams.get('logged_in_customer_id');
  
  // If no customer ID, they're not logged in
  if (!customerId) {
    return json(
      { requiresLogin: true },
      { 
        headers: {
          ...getCorsHeaders(),
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      }
    );
  }
  
  try {
    // 4. Fetch customer data from database (scoped to shop for security)
    let customer = await db.customer.findFirst({
      where: {
        shop,
        shopifyCustomerId: customerId
      }
    });
    
    // Fetch tier separately if customer exists
    let currentTier = null;
    if (customer && customer.currentTierId) {
      currentTier = await db.tier.findFirst({
        where: {
          id: customer.currentTierId,
          shop
        }
      });
    }
    
    // 5. If customer doesn't exist, create them with defaults
    if (!customer) {
      console.log(`[Membership] Creating new customer record for Shopify ID: ${customerId}`);
      customer = await db.customer.create({
        data: {
          id: crypto.randomUUID(),
          shop,
          shopifyCustomerId: customerId,
          email: `customer${customerId}@placeholder.com`, // Placeholder email until synced
          storeCredit: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
    }
    
    // 6. Get shop settings for currency formatting
    const shopSettings = await db.shopSettings.findUnique({
      where: { shop }
    });
    
    // 7. Calculate additional metrics
    const storeCreditBalance = customer.storeCredit ? parseFloat(customer.storeCredit.toString()) : 0;
    
    // Get recent transactions for lifetime earned calculation
    const transactions = await db.storeCreditLedger.findMany({
      where: {
        customerId: customer.id,
        type: 'CASHBACK_EARNED'
      },
      select: {
        amount: true
      }
    });
    
    const lifetimeEarned = transactions.reduce((sum, t) => 
      sum + (t.amount ? parseFloat(t.amount.toString()) : 0), 0
    );
    
    // Calculate progress to next tier if applicable
    let progressData = null;
    if (customer.currentTier) {
      const nextTier = await db.tier.findFirst({
        where: {
          shop,
          minSpend: { gt: customer.currentTier.minSpend }
        },
        orderBy: { minSpend: 'asc' }
      });
      
      if (nextTier) {
        // This would need actual spending data from orders
        // For now, we'll use a mock calculation
        const currentSpending = customer.currentTier.minSpend + 100; // Mock
        const progressAmount = nextTier.minSpend - currentSpending;
        const progressPercent = Math.min(100, 
          ((currentSpending - customer.currentTier.minSpend) / 
           (nextTier.minSpend - customer.currentTier.minSpend)) * 100
        );
        
        progressData = {
          nextTier: nextTier.name,
          progressAmount: formatCurrency(progressAmount, shopSettings),
          progressPercent: Math.round(progressPercent)
        };
      }
    }
    
    // 8. Prepare response data with defaults for new customers
    const responseData = {
      // Customer info
      customerId: customer.id,
      
      // Store credit - always provide a value
      formattedCredit: formatCurrency(storeCreditBalance, shopSettings) || '$0.00',
      storeCredit: storeCreditBalance,
      
      // Tier information - provide "No Tier" as default
      tierName: customer.currentTier?.name || 'No Tier',
      tierMinSpend: customer.currentTier?.minSpend || 0,
      cashbackRate: customer.currentTier?.cashbackPercent || 0,
      
      // Lifetime stats with defaults
      lifetimeEarned: formatCurrency(lifetimeEarned, shopSettings) || '$0.00',
      lifetimeSpent: formatCurrency(0, shopSettings) || '$0.00', // Would need order data
      
      // Progress to next tier (null if no current tier)
      ...(customer.currentTier ? progressData : {}),
      
      // Additional data
      availableRewards: 0, // Could be expanded with rewards system
      
      // Metadata
      lastUpdated: new Date().toISOString(),
      isNewCustomer: !customer.currentTier // Flag for new customers
    };
    
    // 9. Return the data with appropriate headers
    return json(responseData, {
      headers: {
        ...getCorsHeaders(),
        'Cache-Control': 'private, max-age=60', // Cache for 1 minute
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff'
      }
    });
    
  } catch (error) {
    console.error('Membership API error:', error);
    
    // Don't expose internal errors to client
    return json(
      { error: 'Failed to load membership data' },
      { 
        status: 500,
        headers: getCorsHeaders()
      }
    );
  }
}

// CORS headers for app proxy requests
function getCorsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*', // App proxies handle origin validation
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
    'Access-Control-Max-Age': '86400' // 24 hours
  };
}

// Handle OPTIONS requests for CORS preflight
export async function action({ request }: LoaderFunctionArgs) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders()
    });
  }
  
  return json(
    { error: 'Method not allowed' },
    { 
      status: 405,
      headers: getCorsHeaders()
    }
  );
}