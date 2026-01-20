/**
 * Integration Adapters Index
 *
 * Auto-registers all available integration adapters when imported.
 * Each adapter file self-registers via registerAdapter() when loaded.
 */

// P0 - Critical Integrations
export * from "./klaviyo-adapter.server";
export * from "./judgeme-adapter.server";

// P1 - High Priority Integrations
export * from "./recharge-adapter.server";
export * from "./gorgias-adapter.server";

// P2 - Automation Integrations
export * from "./zapier-adapter.server";

// Re-export adapter utilities
export { getAdapter, hasAdapter, getAvailableIntegrations } from "../integration-manager.server";
