/**
 * Type definitions for the customers route
 */

import type { Customer, Tier } from "@prisma/client";

/**
 * Customer with tier relationship
 */
export interface CustomerWithTier extends Customer {
  currentTier: Pick<Tier, "id" | "name" | "cashbackPercent"> | null;
}

/**
 * Loader data structure
 */
export interface CustomersLoaderData {
  customers: Array<{
    id: string;
    email: string;
    shopifyCustomerId: string;
    storeCredit: string;
    currentTier: {
      name: string;
      cashbackPercent: number;
    } | null;
    createdAt: string;
    updatedAt: string;
  }>;
  tiers: Array<{
    id: string;
    name: string;
    minSpend: number | null;
    cashbackPercent: number;
  }>;
  stats: {
    totalCustomers: number;
    customersWithTiers: number;
    totalStoreCredit: string;
  };
  sortBy?: string;
  sortOrder?: string;
}

/**
 * Action data structure for sync operations
 */
export interface CustomersActionData {
  success: boolean;
  message?: string;
  processed?: number;
  successful?: number;
  failed?: number;
  errors?: string[];
}

/**
 * Sort configuration
 */
export type SortField = "email" | "shopifyCustomerId" | "tier" | "storeCredit" | "createdAt";
export type SortOrder = "asc" | "desc";

/**
 * Sync options for customer service
 */
export interface CustomerSyncOptions {
  batchSize?: number;
  onProgress?: (progress: CustomerSyncProgress) => void;
}

/**
 * Sync progress tracking
 */
export interface CustomerSyncProgress {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  errors: string[];
}