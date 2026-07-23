/**
 * Plan name constants
 * Shared between client and server code
 * Should match Partner Dashboard configuration
 */

import { PRICING_PLANS } from "./pricing-contract";

// Current plans
export const FREE_PLAN = PRICING_PLANS.free.billingName;
export const PRO_PLAN = PRICING_PLANS.pro.billingName;
export const PRO_ANNUAL_PLAN = PRICING_PLANS.pro.annualBillingName;
export const MAX_PLAN = PRICING_PLANS.max.billingName;
export const MAX_ANNUAL_PLAN = PRICING_PLANS.max.annualBillingName;
export const ULTRA_PLAN = PRICING_PLANS.ultra.billingName;
export const ULTRA_ANNUAL_PLAN = PRICING_PLANS.ultra.annualBillingName;
export const ENTERPRISE_PLAN = PRICING_PLANS.enterprise.billingName;

// Legacy plans - keeping for backward compatibility
export const STARTER_PLAN = "RewardsPro Starter";
export const GROWTH_PLAN = "RewardsPro Growth";
export const MONTHLY_PLAN = "RewardsPro Monthly";
export const ANNUAL_PLAN = "RewardsPro Annual";
export const USAGE_PLAN = "RewardsPro Usage";
