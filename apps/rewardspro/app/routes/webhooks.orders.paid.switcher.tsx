/**
 * Webhook Version Switcher
 * 
 * This file allows you to control which webhook version is active
 * Change USE_V2 to switch between implementations
 */

import type { ActionFunctionArgs } from "@remix-run/node";

// Import both versions
import { action as v1Action } from "./webhooks.orders.paid";
import { action as v2Action } from "./webhooks.orders.paid.v2";

// ============================================================================
// CONFIGURATION - CHANGE THIS TO SWITCH VERSIONS
// ============================================================================

/**
 * Control webhook version via environment variable or hardcoded value
 * 
 * To use environment variable:
 * - Set USE_WEBHOOK_V2=true in .env or Vercel dashboard
 * 
 * To hardcode:
 * - Change the fallback value below
 */
const USE_V2 = process.env.USE_WEBHOOK_V2 === 'true' || false; // 👈 Change fallback to true for v2

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

export const action = async (args: ActionFunctionArgs) => {
  console.log(`[Webhook Switcher] Using ${USE_V2 ? 'v2' : 'v1'} implementation`);
  
  // Route to the selected version
  return USE_V2 ? v2Action(args) : v1Action(args);
};