/**
 * Server-side utilities for the customers route
 * These functions should only be used in loaders and actions
 */

import type { Prisma } from "@prisma/client";

/**
 * Formats customer data for client consumption
 * Converts Decimal types to strings and formats dates
 * 
 * @param customer - Raw customer data from database
 * @returns Formatted customer data
 */
export function formatCustomerForClient(customer: any) {
  return {
    id: customer.id,
    email: customer.email,
    shopifyCustomerId: customer.shopifyCustomerId,
    storeCredit: customer.storeCredit.toString(),
    currentTier: customer.currentTier ? {
      name: customer.currentTier.name,
      cashbackPercent: customer.currentTier.cashbackPercent
    } : null,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString()
  };
}

/**
 * Calculates customer statistics
 * 
 * @param customers - Array of customers
 * @returns Statistics object
 */
export function calculateCustomerStats(customers: any[]) {
  const totalStoreCredit = customers.reduce(
    (sum, c) => sum + Number(c.storeCredit), 
    0
  ).toFixed(2);
  
  const customersWithTiers = customers.filter(c => c.currentTierId).length;
  
  return {
    totalCustomers: customers.length,
    customersWithTiers,
    totalStoreCredit
  };
}

/**
 * Validates sync request parameters
 * 
 * @param formData - Form data from request
 * @throws {Error} If validation fails
 */
export function validateSyncRequest(formData: FormData) {
  const action = formData.get("action");
  
  if (action !== "sync") {
    throw new Error("Invalid action type");
  }
  
  // Add more validation as needed
  return true;
}