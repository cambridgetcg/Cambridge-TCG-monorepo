/**
 * Privacy-safe request diagnostics for Shopify communications.
 *
 * Query values, header values, request/response bodies, merchant identifiers,
 * cookies, and credentials must never be written to application logs.
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";

interface LogEntry {
  timestamp: string;
  type: 'REQUEST' | 'RESPONSE' | 'ERROR';
  method: string;
  url: string;
  headerNames: string[];
  status?: number;
  duration?: number;
  errorName?: string;
}

export function describeRequestUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl, "https://rewardspro.invalid");
    const queryKeys = [...new Set(url.searchParams.keys())].sort();
    return queryKeys.length > 0
      ? `${url.pathname}?keys=${queryKeys.join(",")}`
      : url.pathname;
  } catch {
    return "[invalid-url]";
  }
}

function sortedHeaderNames(headers: Headers): string[] {
  const names = new Set<string>();
  headers.forEach((_value, key) => names.add(key.toLowerCase()));
  return [...names].sort();
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
  
  const logEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    type: 'REQUEST',
    method: request.method,
    url: describeRequestUrl(request.url),
    headerNames: sortedHeaderNames(request.headers),
  };

  console.log(JSON.stringify({
    event: "request_received",
    requestId,
    context,
    ...logEntry,
  }));

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
  
  const headerNames = new Set<string>();
  if (response.headers) {
    if (response.headers.forEach) {
      response.headers.forEach((_value: string, key: string) => {
        headerNames.add(key.toLowerCase());
      });
    } else if (response.headers instanceof Headers) {
      response.headers.forEach((_value: string, key: string) => {
        headerNames.add(key.toLowerCase());
      });
    }
  }

  const logEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    type: 'RESPONSE',
    method: 'RESPONSE',
    url: context,
    headerNames: [...headerNames].sort(),
    status: response.status || 200,
    duration,
  };

  console.log(JSON.stringify({
    event: "response_sent",
    requestId,
    context,
    ...logEntry,
  }));
}

/**
 * Log errors
 */
export function logError(
  error: any,
  context: string = 'Unknown',
  requestId: string
): void {
  console.error(JSON.stringify({
    event: "request_error",
    requestId,
    context,
    errorName:
      error && typeof error === "object" && typeof error.name === "string"
        ? error.name
        : "UnknownError",
  }));
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
  console.log(JSON.stringify({
    event: "shopify_context",
    hasShop: Boolean(data.shop),
    hasSession: Boolean(data.session),
    sessionIsOnline: Boolean(data.session?.isOnline),
    hasSessionExpiry: Boolean(data.session?.expires),
    hasAccessToken: Boolean(data.session?.accessToken),
    hasAdminClient: Boolean(data.admin),
    hasApiKey: Boolean(data.apiKey),
    hasHost: Boolean(data.host),
  }));
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
  
  let hasReferrer = false;
  try {
    hasReferrer = Boolean(document.referrer);
  } catch {
    hasReferrer = false;
  }

  const info = {
    path: window.location.pathname,
    queryKeys: [...new Set(new URL(window.location.href).searchParams.keys())].sort(),
    isEmbedded: window.top !== window.self,
    hasShopify: typeof (window as any).shopify !== 'undefined',
    hasShopifyConfig: Boolean((window as any).shopify?.config),
    hasReferrer,
    cookies: document.cookie ? 'Present' : 'None',
  };
  
  return JSON.stringify(info, null, 2);
}
