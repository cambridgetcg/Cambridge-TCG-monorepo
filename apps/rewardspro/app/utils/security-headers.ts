/**
 * Security headers middleware for Shopify app
 * 
 * Implements recommended security headers for embedded Shopify apps
 * Including CSP, HSTS, and other security-related headers
 */

import type { HeadersFunction } from "@remix-run/node";

/**
 * Generate Content Security Policy for Shopify embedded app
 * 
 * @param shopDomain - The shop domain (e.g., "store.myshopify.com")
 * @returns CSP header value
 */
function generateCSP(shopDomain?: string): string {
  const directives: Record<string, string[]> = {
    // Default source for all content types not explicitly defined
    'default-src': ["'self'", "https://*.shopify.com", "https://*.shopifycdn.com"],
    
    // Scripts: Allow Shopify scripts and inline scripts with nonce
    'script-src': [
      "'self'",
      "'unsafe-inline'", // Required for Shopify App Bridge
      "'unsafe-eval'", // Required for some Shopify features
      "https://*.shopify.com",
      "https://*.shopifycdn.com",
      "https://cdn.shopify.com",
    ],
    
    // Styles: Allow Shopify styles and inline styles
    'style-src': [
      "'self'",
      "'unsafe-inline'", // Required for Polaris and inline styles
      "https://*.shopify.com",
      "https://*.shopifycdn.com",
      "https://cdn.shopify.com",
    ],
    
    // Images: Allow images from Shopify CDN
    'img-src': [
      "'self'",
      "data:",
      "blob:",
      "https://*.shopify.com",
      "https://*.shopifycdn.com",
      "https://cdn.shopify.com",
    ],
    
    // Fonts: Allow fonts from Shopify CDN
    'font-src': [
      "'self'",
      "data:",
      "https://*.shopify.com",
      "https://*.shopifycdn.com",
      "https://cdn.shopify.com",
    ],
    
    // Connect: Allow API calls to Shopify
    'connect-src': [
      "'self'",
      "https://*.shopify.com",
      "https://*.shopifycdn.com",
      "wss://*.shopify.com", // WebSocket connections
    ],
    
    // Frame ancestors: Critical for embedded apps
    'frame-ancestors': [
      "https://*.shopify.com",
      "https://admin.shopify.com",
    ],
    
    // Child frames: Allow embedding Shopify content
    'frame-src': [
      "'self'",
      "https://*.shopify.com",
    ],
    
    // Form actions
    'form-action': [
      "'self'",
      "https://*.shopify.com",
    ],
    
    // Base URI
    'base-uri': ["'self'"],
    
    // Upgrade insecure requests
    'upgrade-insecure-requests': [],
  };
  
  // Add specific shop domain if provided
  if (shopDomain) {
    directives['frame-ancestors'].push(`https://${shopDomain}`);
  }
  
  // Build CSP string
  return Object.entries(directives)
    .map(([directive, sources]) => {
      if (sources.length === 0) {
        return directive;
      }
      return `${directive} ${sources.join(' ')}`;
    })
    .join('; ');
}

/**
 * Security headers configuration
 * 
 * @param shopDomain - Optional shop domain for CSP frame-ancestors
 * @returns Headers object with security headers
 */
export function getSecurityHeaders(shopDomain?: string): HeadersInit {
  return {
    // Content Security Policy
    'Content-Security-Policy': generateCSP(shopDomain),
    
    // Strict Transport Security (HSTS)
    // max-age=31536000 (1 year), includeSubDomains, preload
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    
    // Prevent MIME type sniffing
    'X-Content-Type-Options': 'nosniff',
    
    // XSS Protection (legacy, but still useful for older browsers)
    'X-XSS-Protection': '1; mode=block',
    
    // Referrer Policy - Send only origin to third parties
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    
    // Permissions Policy (formerly Feature Policy)
    'Permissions-Policy': [
      'accelerometer=()',
      'camera=()',
      'geolocation=()',
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'payment=(self)',
      'usb=()',
    ].join(', '),
    
    // DNS Prefetch Control
    'X-DNS-Prefetch-Control': 'on',
    
    // Download Options - Prevent IE from executing downloads
    'X-Download-Options': 'noopen',
    
    // Permitted Cross-Domain Policies
    'X-Permitted-Cross-Domain-Policies': 'none',
  };
}

/**
 * Headers function for Remix routes
 * Use this in your route exports
 * 
 * Example:
 * export const headers: HeadersFunction = securityHeaders;
 */
export const securityHeaders: HeadersFunction = ({ loaderHeaders }) => {
  // Get shop domain from loader headers if available
  const shopDomain = loaderHeaders.get('X-Shop-Domain') || undefined;
  
  return getSecurityHeaders(shopDomain);
};

/**
 * Combine security headers with existing headers
 * 
 * @param existingHeaders - Existing headers to merge with
 * @param shopDomain - Optional shop domain for CSP
 * @returns Combined headers
 */
export function combineHeaders(
  existingHeaders: HeadersInit = {},
  shopDomain?: string
): HeadersInit {
  return {
    ...existingHeaders,
    ...getSecurityHeaders(shopDomain),
  };
}

/**
 * Validate security headers are properly set
 * Use this in development to ensure headers are configured correctly
 */
export function validateSecurityHeaders(headers: Headers): boolean {
  const requiredHeaders = [
    'Content-Security-Policy',
    'Strict-Transport-Security',
    'X-Content-Type-Options',
  ];
  
  const missingHeaders = requiredHeaders.filter(
    header => !headers.has(header)
  );
  
  if (missingHeaders.length > 0) {
    console.warn('[Security Headers] Missing required headers:', missingHeaders);
    return false;
  }
  
  console.log('[Security Headers] All required headers present');
  return true;
}