/**
 * Keep the serverless function alive until `promise` settles, after the
 * response has gone out. On serverless, work a request leaves running can
 * be frozen or cut off once the response is sent.
 *
 * Vercel publishes each request's context (with its waitUntil) under this
 * global symbol; waitUntil in @vercel/functions reads it the same way. That
 * package is not a dependency here, so this reads the context directly.
 * Where there is no Vercel request (local dev, tests), the promise simply
 * runs on.
 */

const VERCEL_REQUEST_CONTEXT = Symbol.for("@vercel/request-context");

interface VercelRequestContext {
  waitUntil?: (promise: Promise<unknown>) => void;
}

export function waitUntil(promise: Promise<unknown>): void {
  const store = (globalThis as { [VERCEL_REQUEST_CONTEXT]?: { get?: () => VercelRequestContext | undefined } })[
    VERCEL_REQUEST_CONTEXT
  ];
  store?.get?.()?.waitUntil?.(promise);
}
