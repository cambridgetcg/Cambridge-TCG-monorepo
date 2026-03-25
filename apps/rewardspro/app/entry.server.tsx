import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { RemixServer } from "@remix-run/react";
import type { EntryContext } from "@remix-run/node";
import { createReadableStreamFromReadable } from "@remix-run/node";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";
import * as Sentry from "@sentry/remix";
import { initDatadog } from "./services/monitoring/datadog.service";
import { SentryService, createSmartSampler } from "./services/monitoring/sentry.service";

// Initialize monitoring services
// Datadog: APM, distributed tracing, metrics
initDatadog();

// Initialize Sentry for server-side error tracking with enhanced configuration
if (process.env.NODE_ENV === 'production' || process.env.SENTRY_ENABLED === 'true') {
  Sentry.init({
    dsn: process.env.SENTRY_DSN?.trim(),
    environment: process.env.NODE_ENV || 'development',

    // Smart sampling: 100% for critical ops, 20% default
    tracesSampler: createSmartSampler(0.2) as any,

    // Set sample rate for profiling
    profilesSampleRate: 0.1,

    // Attach release information for release health tracking
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    dist: process.env.VERCEL_ENV,

    // Enable session tracking for release health
    autoSessionTracking: true,

    // Integrations
    integrations: [
      // Track HTTP requests
      new Sentry.Integrations.Http({ tracing: true }),
    ],

    // Filter and sanitize events before sending
    beforeSend(event, hint) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['x-shopify-access-token'];
        delete event.request.headers['x-shopify-hmac-sha256'];
      }

      // Remove sensitive data from query strings
      if (event.request?.query_string) {
        event.request.query_string = (event.request.query_string as string).replace(
          /token=[^&]*/g,
          'token=[REDACTED]'
        ).replace(
          /hmac=[^&]*/g,
          'hmac=[REDACTED]'
        ).replace(
          /signature=[^&]*/g,
          'signature=[REDACTED]'
        );
      }

      // Add shop domain tag from request headers if available
      const shopDomain = event.request?.headers?.['x-shopify-shop-domain'];
      if (shopDomain && !event.tags?.['shop.domain']) {
        event.tags = { ...event.tags, 'shop.domain': shopDomain };
      }

      return event;
    },

    // Enrich transactions with business context
    beforeSendTransaction(event) {
      // Add deployment info to all transactions
      event.tags = {
        ...event.tags,
        'vercel.region': process.env.VERCEL_REGION || 'unknown',
        'vercel.env': process.env.VERCEL_ENV || 'unknown',
      };
      return event;
    },

    // Server-specific options
    serverName: process.env.VERCEL_REGION || 'unknown',

    // Ignore known benign errors
    ignoreErrors: [
      // Shopify session errors (expected during OAuth flow)
      'No session found',
      'Session not found',
      // Network timeouts (retryable)
      'ETIMEDOUT',
      'ECONNRESET',
    ],
  });

  // Mark SentryService as initialized
  SentryService.markInitialized();
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
  const webhookTopic = request.headers.get('x-shopify-topic');
  const webhookId = request.headers.get('x-shopify-webhook-id');

  // Capture with enhanced Sentry context
  if (SentryService.isEnabled()) {
    // Determine error type and severity
    let errorType = 'unknown';
    let level: Sentry.SeverityLevel = 'error';
    let isRecoverable = false;

    if (error instanceof Error) {
      if (error.message.includes('HMAC')) {
        errorType = 'hmac_validation';
        level = 'warning';
        isRecoverable = false;
      } else if (error.message.includes('rate limit')) {
        errorType = 'rate_limit';
        level = 'warning';
        isRecoverable = true;
      } else if (error.message.includes('session')) {
        errorType = 'session_error';
        level = 'warning';
        isRecoverable = true;
      } else if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
        errorType = 'timeout';
        level = 'warning';
        isRecoverable = true;
      } else if (error.message.includes('database') || error.message.includes('prisma')) {
        errorType = 'database_error';
        level = 'error';
        isRecoverable = false;
      }
    }

    // Determine operation type from URL
    let operationType: 'webhook' | 'api' | 'cron' | 'ui' = 'ui';
    if (url.pathname.startsWith('/webhooks')) {
      operationType = 'webhook';
    } else if (url.pathname.startsWith('/api')) {
      operationType = url.pathname.includes('cron') ? 'cron' : 'api';
    }

    // Use SentryService for rich context capture
    SentryService.captureException(error, {
      shop: shopDomain ? { domain: shopDomain } : undefined,
      operation: {
        type: operationType,
        name: url.pathname,
        correlationId: webhookId || undefined,
      },
      tags: {
        'error.type': errorType,
        'error.recoverable': String(isRecoverable),
        'request.method': request.method,
        ...(webhookTopic ? { 'webhook.topic': webhookTopic } : {}),
      },
      level,
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
