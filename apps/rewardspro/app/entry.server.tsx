import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { RemixServer } from "@remix-run/react";
import type { EntryContext } from "@remix-run/node";
import { createReadableStreamFromReadable } from "@remix-run/node";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";
import * as Sentry from "@sentry/remix";
import { initDatadog } from "./services/monitoring/datadog.service";
import { initBetterStack, BetterStackService } from "./services/monitoring/betterstack.service";

// Initialize monitoring services
// 1. Datadog: APM, distributed tracing, metrics
initDatadog();
// 2. Better Stack: Log aggregation (cost-effective alternative to Datadog Logs)
initBetterStack();

// Initialize Sentry for server-side error tracking
if (process.env.NODE_ENV === 'production' || process.env.SENTRY_ENABLED === 'true') {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',

    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

    // Set sample rate for profiling
    profilesSampleRate: 0.1,

    // Attach release information
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    dist: process.env.VERCEL_ENV,

    // Filter and sanitize events
    beforeSend(event, hint) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['x-shopify-access-token'];
      }

      // Remove sensitive data from query strings
      if (event.request?.query_string) {
        event.request.query_string = event.request.query_string.replace(
          /token=[^&]*/g,
          'token=[REDACTED]'
        );
      }

      return event;
    },

    // Server-specific options
    serverName: process.env.VERCEL_REGION || 'unknown',
  });
}

// Export error handler for Remix
export function handleError(
  error: unknown,
  { request }: { request: Request }
) {
  // Log to console for local debugging
  if (process.env.NODE_ENV !== 'production') {
    console.error('Unhandled error:', error);
  }

  // Extract useful context from request
  const url = new URL(request.url);
  const shopDomain = request.headers.get('x-shopify-shop-domain');

  // Log to Better Stack for centralized log aggregation
  BetterStackService.error('Unhandled error', error instanceof Error ? error : undefined, {
    url: url.pathname,
    method: request.method,
    shop: shopDomain || undefined,
  });

  // Capture with Sentry if enabled
  if (process.env.NODE_ENV === 'production' || process.env.SENTRY_ENABLED === 'true') {
    Sentry.withScope((scope) => {
      scope.setContext('request', {
        url: url.pathname,
        method: request.method,
        shopDomain,
      });

      if (shopDomain) {
        scope.setTag('shopify.shop', shopDomain);
      }

      // If it's a known error type, add specific handling
      if (error instanceof Error) {
        if (error.message.includes('HMAC')) {
          scope.setTag('error.type', 'hmac_validation');
          scope.setLevel('warning');
        } else if (error.message.includes('rate limit')) {
          scope.setTag('error.type', 'rate_limit');
          scope.setLevel('warning');
        } else if (error.message.includes('session')) {
          scope.setTag('error.type', 'session_error');
        }
      }

      Sentry.captureException(error);
    });
  }
}

export const streamTimeout = 5000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext
) {
  addDocumentResponseHeaders(request, responseHeaders);
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? '')
    ? "onAllReady"
    : "onShellReady";

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <RemixServer
        context={remixContext}
        url={request.url}
      />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        },
      }
    );

    // Automatically timeout the React renderer after 6 seconds, which ensures
    // React has enough time to flush down the rejected boundary contents
    setTimeout(abort, streamTimeout + 1000);
  });
}
