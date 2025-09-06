import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import db from "../db.server";
import { v4 as uuidv4 } from "uuid";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface SyncOptions {
  shop: string;
  batchSize?: number;
  onProgress?: (progress: SyncProgress) => void;
}

export interface SyncProgress {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  errors: string[];
}

export interface SyncResult {
  success: boolean;
  message: string;
  processed: number;
  successful: number;
  failed: number;
  errors: string[];
}

interface GraphQLCustomer {
  id: string;
  email: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  amountSpent: {
    amount: string;
    currencyCode: string;
  };
}

interface CustomerBatch {
  customers: GraphQLCustomer[];
  hasNextPage: boolean;
  endCursor: string | null;
}

// ============================================================================
// MAIN SYNC SERVICE
// ============================================================================

export class CustomerSyncServiceV2 {
  private admin: AdminApiContext;
  private shop: string;
  private batchSize: number;
  private onProgress?: (progress: SyncProgress) => void;

  constructor(admin: AdminApiContext, options: SyncOptions) {
    this.admin = admin;
    this.shop = options.shop;
    this.batchSize = options.batchSize || 50;
    this.onProgress = options.onProgress;
  }

  /**
   * Sync all customers from Shopify to the database
   */
  async syncAllCustomers(): Promise<SyncResult> {
    const startTime = Date.now();
    const progress: SyncProgress = {
      total: 0,
      processed: 0,
      successful: 0,
      failed: 0,
      errors: []
    };

    try {
      // Get all tiers for this shop first
      const tiers = await db.tier.findMany({
        where: { shop: this.shop },
        orderBy: { minSpend: 'asc' }
      });

      if (tiers.length === 0) {
        throw new Error("Please create at least one tier before syncing customers");
      }

      // Process customers in batches
      let hasNextPage = true;
      let cursor: string | null = null;

      while (hasNextPage) {
        // Fetch batch from Shopify
        const batch = await this.fetchCustomerBatch(cursor);
        
        if (!batch.customers || batch.customers.length === 0) {
          break;
        }

        // Process each customer
        for (const customer of batch.customers) {
          try {
            await this.processCustomer(customer, tiers);
            progress.successful++;
          } catch (error) {
            progress.failed++;
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            progress.errors.push(`Customer ${customer.id}: ${errorMsg}`);
            
            // Stop if too many errors
            if (progress.errors.length > 10) {
              throw new Error("Too many errors, stopping sync");
            }
          }
          
          progress.processed++;
          progress.total = Math.max(progress.total, progress.processed);
          
          // Report progress
          if (this.onProgress) {
            this.onProgress(progress);
          }
        }

        hasNextPage = batch.hasNextPage;
        cursor = batch.endCursor;
      }

      const duration = Date.now() - startTime;
      
      return {
        success: progress.successful > 0,
        message: `Synced ${progress.successful} customers successfully`,
        processed: progress.processed,
        successful: progress.successful,
        failed: progress.failed,
        errors: progress.errors
      };

    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Sync failed",
        processed: progress.processed,
        successful: progress.successful,
        failed: progress.failed,
        errors: progress.errors
      };
    }
  }

  /**
   * Fetch a batch of customers from Shopify
   */
  private async fetchCustomerBatch(cursor: string | null): Promise<CustomerBatch> {
    const query = `#graphql
      query GetCustomersMinimal($first: Int!, $after: String) {
        customers(first: $first, after: $after, sortKey: CREATED_AT) {
          edges {
            node {
              id
              email
              state
              createdAt
              updatedAt
              amountSpent {
                amount
                currencyCode
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    const variables = {
      first: this.batchSize,
      after: cursor
    };

    try {
      const response = await this.admin.graphql(query, { variables });
      const result = await response.json() as any;

      if (result.errors && result.errors.length > 0) {
        throw new Error(`GraphQL error: ${result.errors[0].message}`);
      }

      const edges = result.data?.customers?.edges || [];
      const pageInfo = result.data?.customers?.pageInfo || { hasNextPage: false, endCursor: null };

      return {
        customers: edges.map((edge: any) => edge.node),
        hasNextPage: pageInfo.hasNextPage,
        endCursor: pageInfo.endCursor
      };

    } catch (error) {
      throw new Error(`Failed to fetch customers: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process a single customer
   */
  private async processCustomer(customer: GraphQLCustomer, tiers: any[]): Promise<void> {
    // Extract Shopify customer ID (remove GraphQL prefix)
    const shopifyCustomerId = customer.id.replace('gid://shopify/Customer/', '');
    
    // Parse spending amount
    const totalSpending = parseFloat(customer.amountSpent?.amount || "0");
    
    // Determine tier based on spending
    let assignedTier = null;
    for (const tier of tiers) {
      if (!tier.minSpend || totalSpending >= tier.minSpend) {
        assignedTier = tier;
        break;
      }
    }

    // If no tier matched, use the first tier (base tier)
    if (!assignedTier) {
      assignedTier = tiers[0];
    }

    // Check if customer already exists
    const existingCustomer = await db.customer.findFirst({
      where: {
        shop: this.shop,
        shopifyCustomerId: shopifyCustomerId
      }
    });

    const now = new Date();

    if (existingCustomer) {
      // Update existing customer
      await db.customer.update({
        where: { id: existingCustomer.id },
        data: {
          email: customer.email,
          currentTierId: assignedTier?.id || null,
          updatedAt: now // Explicitly set for Aurora Data API
        }
      });

      // Log tier change if different
      if (existingCustomer.currentTierId !== assignedTier?.id) {
        await this.logTierChange(
          existingCustomer.id,
          existingCustomer.currentTierId,
          assignedTier?.id || null,
          tiers,
          totalSpending,
          customer
        );
      }

    } else {
      // Create new customer
      const newCustomer = await db.customer.create({
        data: {
          id: uuidv4(), // Explicit UUID for Aurora Data API
          shop: this.shop,
          shopifyCustomerId: shopifyCustomerId,
          email: customer.email,
          storeCredit: 0,
          currentTierId: assignedTier?.id || null,
          createdAt: now, // Explicit timestamps for Aurora Data API
          updatedAt: now
        }
      });

      // Log initial tier assignment
      if (assignedTier) {
        await this.logTierChange(
          newCustomer.id,
          null,
          assignedTier.id,
          tiers,
          totalSpending,
          customer
        );
      }
    }
  }

  /**
   * Log tier changes for audit trail
   */
  private async logTierChange(
    customerId: string,
    fromTierId: string | null,
    toTierId: string | null,
    tiers: any[],
    totalSpending: number,
    customer: GraphQLCustomer
  ): Promise<void> {
    const fromTier = fromTierId ? tiers.find(t => t.id === fromTierId) : null;
    const toTier = toTierId ? tiers.find(t => t.id === toTierId) : null;

    let changeType = "INITIAL_ASSIGNMENT";
    if (fromTierId && toTierId) {
      changeType = (toTier?.minSpend || 0) > (fromTier?.minSpend || 0) ? "UPGRADE" : "DOWNGRADE";
    }

    await db.tierChangeLog.create({
      data: {
        id: uuidv4(), // Explicit UUID for Aurora Data API
        customerId: customerId,
        shop: this.shop,
        fromTierId: fromTierId,
        toTierId: toTierId,
        fromTierName: fromTier?.name || null,
        toTierName: toTier?.name || null,
        changeType: changeType,
        triggerType: fromTierId ? "SHOPIFY_SYNC" : "ACCOUNT_CREATED",
        totalSpending: totalSpending,
        createdAt: new Date(), // Explicit timestamp for Aurora Data API
        metadata: {
          source: "customer_sync_v2",
          customerState: customer.state,
          currency: customer.amountSpent?.currencyCode,
          shopifyCreatedAt: customer.createdAt,
          shopifyUpdatedAt: customer.updatedAt
        }
      }
    });
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export async function createCustomerSyncServiceV2(
  admin: AdminApiContext,
  shop: string,
  options?: Partial<SyncOptions>
): Promise<CustomerSyncServiceV2> {
  return new CustomerSyncServiceV2(admin, {
    shop,
    ...options
  });
}