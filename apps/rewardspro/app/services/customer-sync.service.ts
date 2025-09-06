import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import db from "../db.server";
import type { Prisma } from "@prisma/client";

// Types
export interface SyncOptions {
  shop: string;
  batchSize?: number;
  maxRetries?: number;
  onProgress?: (progress: SyncProgress) => void;
}

export interface SyncProgress {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
  errors: SyncError[];
  currentBatch?: number;
  totalBatches?: number;
}

export interface SyncError {
  customerId?: string;
  email?: string;
  error: string;
  timestamp: Date;
}

export interface SyncResult {
  success: boolean;
  message: string;
  progress: SyncProgress;
  completedAt: Date;
  duration: number;
}


// GraphQL Queries
const CUSTOMERS_BATCH_QUERY = `#graphql
  query GetCustomersBatch($cursor: String, $first: Int = 50) {
    customers(first: $first, after: $cursor, sortKey: CREATED_AT) {
      edges {
        cursor
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
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

const CUSTOMER_COUNT_QUERY = `#graphql
  query GetCustomerCount {
    customersCount: customers(first: 1) {
      edges {
        node {
          id
        }
      }
      pageInfo {
        hasNextPage
      }
    }
  }
`;

// Rate Limiter class
class RateLimiter {
  private requests: number[] = [];
  private readonly limit: number;
  private readonly window: number;

  constructor(limit = 100, window = 60000) {
    this.limit = limit;
    this.window = window;
  }

  async throttle(): Promise<void> {
    const now = Date.now();
    
    // Remove old requests outside window
    this.requests = this.requests.filter(time => now - time < this.window);
    
    // If at limit, wait
    if (this.requests.length >= this.limit) {
      const oldestRequest = this.requests[0];
      const waitTime = this.window - (now - oldestRequest) + 100;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.throttle();
    }
    
    this.requests.push(now);
  }
}

// Main Customer Sync Service
export class CustomerSyncService {
  private admin: AdminApiContext;
  private options: Required<SyncOptions>;
  private rateLimiter: RateLimiter;
  private startTime: number = 0;

  constructor(admin: AdminApiContext, options: SyncOptions) {
    this.admin = admin;
    this.options = {
      batchSize: 50,
      maxRetries: 3,
      onProgress: () => {},
      ...options
    };
    // Shopify allows 2 requests per second for GraphQL Admin API
    this.rateLimiter = new RateLimiter(2, 1000);
  }

  async syncAllCustomers(): Promise<SyncResult> {
    this.startTime = Date.now();
    
    const progress: SyncProgress = {
      total: 0,
      processed: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      currentBatch: 0,
      totalBatches: 0
    };

    try {
      // Get total count first (optional, for better progress tracking)
      const totalCount = await this.getCustomerCount();
      progress.total = totalCount;
      progress.totalBatches = Math.ceil(totalCount / this.options.batchSize);

      let cursor: string | null = null;
      let hasNextPage = true;

      // Get all tiers for assignment
      const tiers = await db.tier.findMany({
        where: { shop: this.options.shop },
        orderBy: { minSpend: 'desc' }
      });

      if (tiers.length === 0) {
        throw new Error("Please create loyalty tiers before syncing customers");
      }

      // Process customers in batches
      while (hasNextPage) {
        progress.currentBatch = (progress.currentBatch || 0) + 1;
        
        try {
          // Fetch batch with rate limiting
          await this.rateLimiter.throttle();
          const batch = await this.fetchCustomerBatch(cursor);
          
          if (!batch.customers || batch.customers.length === 0) {
            break;
          }

          // Process batch in transaction
          await db.$transaction(async (tx) => {
            await this.processBatch(batch.customers, tx, progress, tiers);
          });

          cursor = batch.pageInfo.endCursor;
          hasNextPage = batch.pageInfo.hasNextPage;

          // Report progress
          this.options.onProgress(progress);

          // Small delay between batches to avoid overwhelming the system
          if (hasNextPage) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.error(`Error processing batch ${progress.currentBatch}:`, error);
          
          // Add to errors but continue processing
          progress.errors.push({
            error: `Batch ${progress.currentBatch} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            timestamp: new Date()
          });

          // If too many errors, stop
          if (progress.errors.length > 10) {
            throw new Error("Too many errors encountered, stopping sync");
          }

          // Skip to next batch
          if (hasNextPage && cursor) {
            continue;
          }
        }
      }

      // Create sync log
      await this.createSyncLog(progress);

      const duration = Date.now() - this.startTime;
      
      return {
        success: progress.successful > 0,
        message: this.generateSyncMessage(progress),
        progress,
        completedAt: new Date(),
        duration
      };
    } catch (error) {
      console.error("Sync failed:", error);
      
      const duration = Date.now() - this.startTime;
      
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to sync customers",
        progress,
        completedAt: new Date(),
        duration
      };
    }
  }

  private async getCustomerCount(): Promise<number> {
    try {
      const response = await this.admin.graphql(CUSTOMER_COUNT_QUERY);
      const data = await response.json();
      
      // Estimate based on pagination info
      // Since we can't get exact count, estimate from first page
      if (data.data?.customersCount?.pageInfo?.hasNextPage) {
        // If there are more pages, estimate a reasonable number
        return 1000; // Default estimate
      }
      
      return data.data?.customersCount?.edges?.length || 0;
    } catch (error) {
      console.warn("Could not get customer count:", error);
      return 0; // Will be updated as we process
    }
  }

  private async fetchCustomerBatch(cursor: string | null): Promise<any> {
    const variables = {
      cursor,
      first: this.options.batchSize
    };

    const response = await this.admin.graphql(CUSTOMERS_BATCH_QUERY, { variables });
    const result = await response.json();

    if (result.errors && result.errors.length > 0) {
      const errorMessages = result.errors.map((e: any) => e.message).join(', ');
      
      // Check for rate limiting
      if (result.errors.some((e: any) => e.extensions?.code === 'THROTTLED')) {
        // Wait and retry
        await new Promise(resolve => setTimeout(resolve, 5000));
        return this.fetchCustomerBatch(cursor);
      }
      
      throw new Error(`GraphQL errors: ${errorMessages}`);
    }

    return {
      customers: result.data?.customers?.edges?.map((edge: any) => edge.node) || [],
      pageInfo: result.data?.customers?.pageInfo || { hasNextPage: false }
    };
  }

  private async processBatch(
    customers: any[],
    tx: Prisma.TransactionClient,
    progress: SyncProgress,
    tiers: any[]
  ): Promise<void> {
    for (const customer of customers) {
      // Skip only truly disabled customers
      // ENABLED, INVITED, and even DECLINED customers should be synced as they can have order history
      if (customer.state === 'DISABLED') {
        progress.skipped++;
        progress.processed++;
        continue;
      }

      // Skip customers without email silently
      if (!customer.email) {
        progress.skipped++;
        progress.processed++;
        continue;
      }

      try {
        await this.processCustomer(customer, tx, tiers);
        progress.successful++;
        progress.processed++;
      } catch (error) {
        progress.failed++;
        progress.processed++;
        progress.errors.push({
          customerId: customer.id,
          email: customer.email,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date()
        });
      }

      // Update total if we didn't get it initially
      if (progress.total === 0 || progress.processed > progress.total) {
        progress.total = progress.processed;
      }
    }
  }

  private async processCustomer(
    customer: any,
    tx: Prisma.TransactionClient,
    tiers: any[]
  ): Promise<void> {
    // Extract customer data
    const email = customer.email;
    
    // Extract Shopify customer ID
    const shopifyCustomerId = customer.id.replace('gid://shopify/Customer/', '');
    
    // Calculate total spending
    const totalSpending = parseFloat(customer.amountSpent?.amount || "0");
    
    // Determine tier based on spending
    let assignedTier = null;
    for (const tier of tiers) {
      if (totalSpending >= tier.minSpend) {
        assignedTier = tier;
        break;
      }
    }

    // Prepare customer data - only fields that exist in Customer model
    const customerData = {
      shop: this.options.shop,
      shopifyCustomerId,
      email,
      currentTierId: assignedTier?.id || null
    };

    // Check if customer exists
    const existingCustomer = await tx.customer.findUnique({
      where: {
        shop_shopifyCustomerId: {
          shop: this.options.shop,
          shopifyCustomerId
        }
      }
    });

    if (existingCustomer) {
      // Update existing customer
      await tx.customer.update({
        where: { id: existingCustomer.id },
        data: {
          email: customerData.email,
          currentTierId: customerData.currentTierId
        }
      });

      // Log tier change if different
      if (existingCustomer.currentTierId !== customerData.currentTierId) {
        await tx.tierChangeLog.create({
          data: {
            customerId: existingCustomer.id,
            shop: this.options.shop,
            fromTierId: existingCustomer.currentTierId,
            toTierId: customerData.currentTierId,
            changeType: customerData.currentTierId ? 
              (existingCustomer.currentTierId ? "UPGRADE" : "INITIAL_ASSIGNMENT") : 
              "DOWNGRADE",
            triggerType: "SHOPIFY_SYNC",
            totalSpending,
            metadata: {
              source: "customer_sync_service",
              previousTier: existingCustomer.currentTierId,
              newTier: customerData.currentTierId,
              reason: "Bulk sync from Shopify"
            }
          }
        });
      }
    } else {
      // Create new customer
      const newCustomer = await tx.customer.create({
        data: {
          shop: customerData.shop,
          shopifyCustomerId: customerData.shopifyCustomerId,
          email: customerData.email!,
          storeCredit: 0,
          currentTierId: customerData.currentTierId
        }
      });

      // Log initial tier assignment
      if (customerData.currentTierId) {
        await tx.tierChangeLog.create({
          data: {
            customerId: newCustomer.id,
            shop: this.options.shop,
            fromTierId: null,
            toTierId: customerData.currentTierId,
            changeType: "INITIAL_ASSIGNMENT",
            triggerType: "ACCOUNT_CREATED",
            totalSpending,
            metadata: {
              source: "customer_sync_service",
              reason: "Initial sync from Shopify"
            }
          }
        });
      }
    }
  }


  private async createSyncLog(progress: SyncProgress): Promise<void> {
    try {
      // Store sync log in metadata of a system record or custom table
      console.log("Sync completed:", {
        shop: this.options.shop,
        timestamp: new Date(),
        processed: progress.processed,
        successful: progress.successful,
        failed: progress.failed,
        skipped: progress.skipped,
        errors: progress.errors.length
      });
    } catch (error) {
      console.error("Failed to create sync log:", error);
    }
  }

  private generateSyncMessage(progress: SyncProgress): string {
    const parts = [`Processed ${progress.processed} customers`];
    
    if (progress.successful > 0) {
      parts.push(`${progress.successful} synced successfully`);
    }
    
    if (progress.failed > 0) {
      parts.push(`${progress.failed} failed`);
    }
    
    if (progress.skipped > 0) {
      parts.push(`${progress.skipped} skipped`);
    }
    
    return parts.join(", ");
  }

  // Search customers with filters
  async searchCustomers(query: string): Promise<any[]> {
    const SEARCH_QUERY = `#graphql
      query SearchCustomers($query: String!, $first: Int!) {
        customers(query: $query, first: $first, sortKey: UPDATED_AT) {
          edges {
            node {
              id
              email
              amountSpent {
                amount
                currencyCode
              }
            }
          }
        }
      }
    `;

    await this.rateLimiter.throttle();
    
    const response = await this.admin.graphql(SEARCH_QUERY, {
      variables: {
        query,
        first: 50
      }
    });

    const result = await response.json();
    
    if (result.errors) {
      throw new Error(`Search failed: ${result.errors[0].message}`);
    }

    return result.data?.customers?.edges?.map((edge: any) => edge.node) || [];
  }

  // Sync single customer
  async syncSingleCustomer(customerId: string): Promise<void> {
    const SINGLE_CUSTOMER_QUERY = `#graphql
      query GetCustomer($id: ID!) {
        customer(id: $id) {
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
    `;

    await this.rateLimiter.throttle();
    
    const response = await this.admin.graphql(SINGLE_CUSTOMER_QUERY, {
      variables: { id: customerId }
    });

    const result = await response.json();
    
    if (result.errors) {
      throw new Error(`Failed to fetch customer: ${result.errors[0].message}`);
    }

    if (!result.data?.customer) {
      throw new Error("Customer not found");
    }

    // Get tiers
    const tiers = await db.tier.findMany({
      where: { shop: this.options.shop },
      orderBy: { minSpend: 'desc' }
    });

    // Process the customer
    await db.$transaction(async (tx) => {
      await this.processCustomer(result.data.customer, tx, tiers);
    });
  }
}

// Export helper function for creating service instance
export async function createCustomerSyncService(
  admin: AdminApiContext,
  shop: string,
  options?: Partial<SyncOptions>
): Promise<CustomerSyncService> {
  return new CustomerSyncService(admin, {
    shop,
    ...options
  });
}