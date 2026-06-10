/**
 * Protected Loader Wrapper
 * Enforces plan-based access control for app routes
 */

import { redirect, json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { checkPlanAccess, type AccessCheckResult } from "./plan-access-control.server";

export interface ProtectedLoaderArgs extends LoaderFunctionArgs {
  accessCheck: AccessCheckResult;
  session: any;
  admin: any;
}

/**
 * Wrapper for loaders that enforces plan access control
 *
 * Usage:
 * ```typescript
 * export const loader = withPlanAccess(async ({ request, accessCheck, session }) => {
 *   // Your loader code here
 *   // accessCheck is automatically provided
 *   // Shop is automatically unlocked if accessing billing routes
 * });
 * ```
 *
 * Routes that bypass lock check:
 * - /app/billing (and all sub-routes)
 * - /app/locked
 * - /api/* (API routes)
 */
export function withPlanAccess<T>(
  loaderFn: (args: ProtectedLoaderArgs) => Promise<T>
) {
  return async (args: LoaderFunctionArgs): Promise<T | Response> => {
    // Authenticate with Shopify
    const { session, admin } = await authenticate.admin(args.request);

    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    // Check if this is a route that should bypass lock check
    const url = new URL(args.request.url);
    const pathname = url.pathname;

    const isBillingRoute = pathname.startsWith('/app/billing');
    const isLockedRoute = pathname === '/app/locked';
    const isApiRoute = pathname.startsWith('/api/');

    // Always check plan access (for metrics)
    const accessCheck = await checkPlanAccess(session.shop);

    // Log access check for debugging
    console.log(`[ProtectedLoader] ${pathname} - Shop: ${session.shop}, Locked: ${accessCheck.isLocked}, Bypass: ${isBillingRoute || isLockedRoute || isApiRoute}`);

    // If locked and not on an exempt route, redirect to locked page
    if (accessCheck.isLocked && !isBillingRoute && !isLockedRoute && !isApiRoute) {
      console.log(`[ProtectedLoader] Redirecting ${session.shop} to /app/locked`);
      return redirect('/app/locked');
    }

    // Pass access check and session to loader
    return loaderFn({
      ...args,
      accessCheck,
      session,
      admin
    });
  };
}

/**
 * Simpler wrapper that just checks access without redirecting
 * Useful for API routes that need to return JSON errors
 */
export function withAccessCheck<T>(
  loaderFn: (args: ProtectedLoaderArgs) => Promise<T>
) {
  return async (args: LoaderFunctionArgs): Promise<T> => {
    const { session, admin } = await authenticate.admin(args.request);

    if (!session?.shop) {
      throw json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessCheck = await checkPlanAccess(session.shop);

    return loaderFn({
      ...args,
      accessCheck,
      session,
      admin
    });
  };
}
