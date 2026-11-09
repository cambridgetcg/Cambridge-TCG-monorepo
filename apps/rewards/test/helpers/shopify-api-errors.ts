import { createRequire } from "node:module";

/**
 * The error classes of the @shopify/shopify-api copy the app library itself
 * loads (apps/rewards has no direct dependency on it), so the tests throw
 * exactly what the real Admin API client throws.
 */
type HttpErrorParams = { message: string; code: number; statusText: string; body?: Record<string, unknown> };

interface ShopifyApiErrors {
  GraphqlQueryError: new (p: { message: string; response: Record<string, unknown>; body?: Record<string, unknown> }) => Error;
  HttpResponseError: new (p: HttpErrorParams) => Error;
  HttpInternalError: new (p: HttpErrorParams) => Error;
  HttpThrottlingError: new (p: HttpErrorParams & { retryAfter?: number }) => Error;
  HttpRequestError: new (message: string) => Error;
  HttpMaxRetriesError: new (message: string) => Error;
  MissingRequiredArgument: new (message: string) => Error;
}

const require = createRequire(import.meta.url);
const library = require.resolve("@shopify/shopify-app-react-router/server");

export const {
  GraphqlQueryError,
  HttpInternalError,
  HttpMaxRetriesError,
  HttpRequestError,
  HttpResponseError,
  HttpThrottlingError,
  MissingRequiredArgument,
} = createRequire(library)("@shopify/shopify-api") as ShopifyApiErrors;
