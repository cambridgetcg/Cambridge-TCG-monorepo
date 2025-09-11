/**
 * DEPRECATED - Direct API Endpoint for Customer Membership Data
 * 
 * NOTE: This endpoint was originally intended for App Proxy but was never properly configured.
 * The actual App Proxy implementation is now at: /api/proxy/membership
 * 
 * This endpoint currently uses custom authentication and should be migrated to the proper
 * App Proxy handler for better security.
 * 
 * MIGRATION STATUS:
 * - New App Proxy handler created at: api.proxy.membership.tsx
 * - Widget already calls correct path: /apps/rewardspro/membership
 * - This file kept for reference during migration
 */

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { db } from "~/db.server";
import { 
  verifyAppProxySignature, 
  validateShopDomain,
  logSecurityEvent 
} from "~/utils/hmac-verification";
import { formatCurrency } from "~/utils/currency";
import { appProxyRateLimit } from "~/utils/rate-limiter";
import { validateCustomerAuth } from "~/utils/widget-session-manager";
// Zod schemas removed - this file is deprecated
// See api.proxy.membership.tsx for the new App Proxy implementation

// Type definitions (without Zod)
type AppProxyParams = {
  shop: string;
  logged_in_customer_id?: string;
  path_prefix?: string;
  timestamp?: string;
  signature: string;
};

type GuestResponse = {
  requiresLogin: true;
  message: string;
};

type MemberResponse = {
  success: true;
  enrolled: boolean;
  memberData?: {
    storeCredit: string;
    tierName: string;
    cashbackRate: number;
    nextTier?: string;
    progressToNextTier?: number;
    lifetimeEarned?: string;
    memberSince: string;
  };
};

export async function loader({ request }: LoaderFunctionArgs) {
  const startTime = Date.now();
  
  try {
    // Step 1: Apply rate limiting
    const rateLimitResponse = await appProxyRateLimit(request);
    if (rateLimitResponse) {
      logSecurityEvent('RATE_LIMIT', {
        ip: request.headers.get('x-forwarded-for'),
        url: request.url
      });
      return rateLimitResponse;
    }
    
    // Step 2: Parse and validate query parameters
    const url = new URL(request.url);
    const rawParams = Object.fromEntries(url.searchParams);
    
    // Validate parameter structure (manual validation without Zod)
    const params = rawParams as AppProxyParams;
    if (!params.shop || !params.signature) {
      logSecurityEvent('INVALID_SIGNATURE', {
        reason: 'Invalid parameters',
        errors: 'Missing required parameters',
        ip: request.headers.get('x-forwarded-for')
      });
      return json({ error: 'Invalid request' }, { status: 400 });
    }
    
    // Step 3: Custom signature verification (not actual App Proxy)
    // NOTE: This custom implementation doesn't provide the same security as Shopify's App Proxy
    // The new App Proxy handler at api.proxy.membership.tsx uses Shopify's built-in verification
    const isValidSignature = verifyAppProxySignature(
      url.toString(),
      process.env.SHOPIFY_API_SECRET!
    );
    
    if (!isValidSignature) {
      logSecurityEvent('INVALID_SIGNATURE', {
        shop: params.shop,
        customerId: params.logged_in_customer_id,
        ip: request.headers.get('x-forwarded-for')
      });
      return json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    // Step 4: Validate shop domain format
    const validatedShop = validateShopDomain(params.shop);
    if (!validatedShop) {
      logSecurityEvent('INVALID_SHOP', {
        shop: params.shop,
        ip: request.headers.get('x-forwarded-for')
      });
      return json({ error: 'Invalid shop' }, { status: 400 });
    }
    
    // Step 5: Check if customer is logged in
    // NOTE: In this custom implementation, we're relying on our own verification
    // The proper App Proxy implementation automatically provides verified customer ID
    const customerId = params.logged_in_customer_id;
    
    if (!customerId) {
      // Guest user - return login prompt
      const guestResponse: GuestResponse = {
        requiresLogin: true,
        message: 'Please log in to view your rewards'
      };
      
      return json(guestResponse, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY'
        }
      });
    }
    
    // Step 6: Fetch customer data with shop scoping
    const customer = await db.customer.findFirst({
      where: {
        shopifyCustomerId: customerId,
        shop: validatedShop // CRITICAL: Always scope to shop
      },
      select: {
        id: true,
        storeCredit: true,
        lifetimeEarned: true,
        createdAt: true,
        tier: {
          select: {
            name: true,
            cashbackRate: true,
            minimumSpend: true
          }
        }
      }
    });
    
    // Step 7: Get shop settings for currency formatting
    const shopSettings = await db.shopSettings.findUnique({
      where: { shop: validatedShop },
      select: {
        currency: true,
        currencyFormat: true
      }
    });
    
    // Step 8: Build response based on enrollment status
    if (!customer) {
      // Customer exists in Shopify but not enrolled in rewards
      const response: MemberResponse = {
        success: true,
        enrolled: false
      };
      
      return json(response, {
        headers: {
          'Cache-Control': 'private, max-age=60',
          'X-Content-Type-Options': 'nosniff',
          'X-Response-Time': `${Date.now() - startTime}ms`
        }
      });
    }
    
    // Step 9: Calculate progress to next tier (if applicable)
    let nextTierInfo = undefined;
    if (customer.tier) {
      // Fetch next tier
      const nextTier = await db.tier.findFirst({
        where: {
          shop: validatedShop,
          minimumSpend: {
            gt: customer.tier.minimumSpend
          }
        },
        orderBy: {
          minimumSpend: 'asc'
        },
        select: {
          name: true,
          minimumSpend: true
        }
      });
      
      if (nextTier) {
        const currentSpend = customer.lifetimeEarned || 0;
        const progress = Math.min(
          100,
          (currentSpend.toNumber() / nextTier.minimumSpend.toNumber()) * 100
        );
        
        nextTierInfo = {
          name: nextTier.name,
          progress: Math.round(progress)
        };
      }
    }
    
    // Step 10: Format response with minimal necessary data
    const memberResponse: MemberResponse = {
      success: true,
      enrolled: true,
      memberData: {
        storeCredit: formatCurrency(
          customer.storeCredit.toNumber(),
          shopSettings
        ),
        tierName: customer.tier?.name || 'No Tier',
        cashbackRate: customer.tier?.cashbackRate || 0,
        nextTier: nextTierInfo?.name,
        progressToNextTier: nextTierInfo?.progress,
        lifetimeEarned: customer.lifetimeEarned 
          ? formatCurrency(customer.lifetimeEarned.toNumber(), shopSettings)
          : undefined,
        memberSince: customer.createdAt.toISOString()
      }
    };
    
    // Step 11: Return response with security headers
    return json(memberResponse, {
      headers: {
        'Cache-Control': 'private, max-age=60',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'X-Response-Time': `${Date.now() - startTime}ms`,
        'Referrer-Policy': 'same-origin'
      }
    });
    
  } catch (error) {
    // Log error but don't expose details to client
    console.error('App proxy error:', error);
    
    logSecurityEvent('UNAUTHORIZED_ACCESS', {
      error: error instanceof Error ? error.message : 'Unknown error',
      url: request.url
    });
    
    // Generic error response (no details leaked)
    return json(
      { error: 'Service temporarily unavailable' },
      { 
        status: 503,
        headers: {
          'Retry-After': '60'
        }
      }
    );
  }
}

// No action handler - this is read-only
export async function action() {
  return json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}