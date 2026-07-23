/**
 * Request/Response Logger for debugging Shopify communications
 * Logs all requests and responses between the app and Shopify
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";

interface LogEntry {
  timestamp: string;
  type: 'REQUEST' | 'RESPONSE' | 'ERROR';
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: any;
  status?: number;
  duration?: number;
  error?: string;
}

/**
 * Log incoming request details
 */
export async function logRequest(
  request: Request,
  context: string = 'Unknown'
): Promise<{ startTime: number; requestId: string }> {
  const requestId = Math.random().toString(36).substring(7);
  const startTime = Date.now();
  
  const url = new URL(request.url);
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    // Don't log sensitive headers in full
    if (key.toLowerCase().includes('token') || key.toLowerCase().includes('secret')) {
      headers[key] = value.substring(0, 10) + '...';
    } else {
      headers[key] = value;
    }
  });

  const logEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    type: 'REQUEST',
    method: request.method,
    url: url.pathname + url.search,
    headers,
  };

  // Try to get body if it's not a GET request
  if (request.method !== 'GET' && request.body) {
    try {
      const clonedRequest = request.clone();
      const text = await clonedRequest.text();
      if (text) {
        try {
          logEntry.body = JSON.parse(text);
        } catch {
          logEntry.body = text.substring(0, 1000); // Limit text body size
        }
      }
    } catch (error) {
      logEntry.body = '[Could not read body]';
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`[${requestId}] 📥 INCOMING ${context} REQUEST`);
  console.log(`${'='.repeat(80)}`);
  console.log(`Method: ${logEntry.method}`);
  console.log(`URL: ${logEntry.url}`);
  console.log(`Headers:`, JSON.stringify(headers, null, 2));
  if (logEntry.body) {
    console.log(`Body:`, JSON.stringify(logEntry.body, null, 2));
  }
  console.log(`${'='.repeat(80)}\n`);

  return { startTime, requestId };
}

/**
 * Log outgoing response details
 */
export function logResponse(
  response: Response | any,
  context: string = 'Unknown',
  startTime: number,
  requestId: string
): void {
  const duration = Date.now() - startTime;
  
  const headers: Record<string, string> = {};
  if (response.headers) {
    if (response.headers.forEach) {
      response.headers.forEach((value: string, key: string) => {
        headers[key] = value;
      });
    } else if (response.headers instanceof Headers) {
      response.headers.forEach((value: string, key: string) => {
        headers[key] = value;
      });
    }
  }

  const logEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    type: 'RESPONSE',
    method: 'RESPONSE',
    url: context,
    headers,
    status: response.status || 200,
    duration,
  };

  console.log(`\n${'='.repeat(80)}`);
  console.log(`[${requestId}] 📤 OUTGOING ${context} RESPONSE`);
  console.log(`${'='.repeat(80)}`);
  console.log(`Status: ${logEntry.status}`);
  console.log(`Duration: ${duration}ms`);
  console.log(`Headers:`, JSON.stringify(headers, null, 2));
  console.log(`${'='.repeat(80)}\n`);
}

/**
 * Log errors
 */
export function logError(
  error: any,
  context: string = 'Unknown',
  requestId: string
): void {
  console.error(`\n${'='.repeat(80)}`);
  console.error(`[${requestId}] ❌ ERROR in ${context}`);
  console.error(`${'='.repeat(80)}`);
  console.error(`Error:`, error.message || error);
  if (error.stack) {
    console.error(`Stack:`, error.stack);
  }
  console.error(`${'='.repeat(80)}\n`);
}

/**
 * Wrapper for loader functions with logging
 */
export function withLogging<T extends LoaderFunctionArgs | ActionFunctionArgs>(
  handler: (args: T) => Promise<Response>,
  context: string
) {
  return async (args: T): Promise<Response> => {
    const { startTime, requestId } = await logRequest(args.request, context);
    
    try {
      const response = await handler(args);
      logResponse(response, context, startTime, requestId);
      return response;
    } catch (error) {
      logError(error, context, requestId);
      throw error;
    }
  };
}

/**
 * Log Shopify-specific information
 */
export function logShopifyContext(data: {
  shop?: string;
  session?: any;
  admin?: any;
  apiKey?: string;
  host?: string;
}): void {
  console.log(`\n${'🛍️'.repeat(20)}`);
  console.log('SHOPIFY CONTEXT');
  console.log(`${'🛍️'.repeat(20)}`);
  
  if (data.shop) {
    console.log(`Shop: ${data.shop}`);
  }
  
  if (data.session) {
    console.log(`Session ID: ${data.session.id}`);
    console.log(`Session Shop: ${data.session.shop}`);
    console.log(`Is Online: ${data.session.isOnline}`);
    console.log(`Has Access Token: ${!!data.session.accessToken}`);
    console.log(`Expires: ${data.session.expires}`);
  }
  
  if (data.admin) {
    console.log(`Admin GraphQL: Available`);
  }
  
  if (data.apiKey) {
    console.log(`API Key: ${data.apiKey.substring(0, 10)}...`);
  }
  
  if (data.host) {
    console.log(`Host: ${data.host}`);
  }
  
  console.log(`${'🛍️'.repeat(20)}\n`);
}

/**
 * Check for common authentication issues
 * Only shows warnings for actual auth problems, not for normal Remix data fetches
 */
export function checkAuthenticationIssues(request: Request): void {
  const url = new URL(request.url);
  const authHeader = request.headers.get('authorization');

  // Skip warnings for Remix client-side data fetches - these use session auth
  // and don't need shop/host params
  const isRemixDataFetch = url.searchParams.has('_data');
  if (isRemixDataFetch && authHeader) {
    // This is a normal authenticated Remix fetch, no warnings needed
    return;
  }

  // Skip warnings for embedded app requests - these use signed host param + session cookie
  // instead of bearer token (standard Shopify embedded app auth flow)
  const isEmbedded = url.searchParams.get('embedded') === '1' || url.searchParams.has('host');
  if (isEmbedded) {
    // Embedded apps authenticate via session + signed host param, not bearer token
    return;
  }

  const issues: string[] = [];

  // Only check for missing params if there's no auth header
  // (initial OAuth flow needs these params)
  if (!authHeader) {
    if (!url.searchParams.get('shop')) {
      issues.push('⚠️ Missing "shop" parameter in URL');
    }

    if (!url.searchParams.get('host')) {
      issues.push('⚠️ Missing "host" parameter in URL');
    }
  }

  // Check for session token in headers
  if (!authHeader) {
    issues.push('⚠️ No Authorization header found');
  } else if (!authHeader.startsWith('Bearer ')) {
    issues.push('⚠️ Authorization header is not a Bearer token');
  }

  // Only warn about referer if we're missing auth completely
  if (!authHeader) {
    const referer = request.headers.get('referer');
    if (!referer?.includes('myshopify.com')) {
      issues.push('⚠️ Request not coming from Shopify admin (check Referer header)');
    }
  }

  if (issues.length > 0) {
    console.log(`\n${'⚠️'.repeat(20)}`);
    console.log('POTENTIAL AUTHENTICATION ISSUES DETECTED:');
    issues.forEach(issue => console.log(issue));
    console.log(`${'⚠️'.repeat(20)}\n`);
  }
}

/**
 * Log browser-side information (for client-side debugging)
 */
export function getBrowserDebugInfo(): string {
  if (typeof window === 'undefined') {
    return 'Not in browser context';
  }
  
  const info = {
    url: window.location.href,
    isEmbedded: window.top !== window.self,
    hasShopify: typeof (window as any).shopify !== 'undefined',
    shopifyConfig: (window as any).shopify?.config,
    shopifyEnvironment: (window as any).shopify?.environment,
    referrer: document.referrer,
    userAgent: navigator.userAgent,
    cookies: document.cookie ? 'Present' : 'None',
  };
  
  return JSON.stringify(info, null, 2);
}
