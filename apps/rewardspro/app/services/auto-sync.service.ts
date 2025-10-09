/**
 * Automatic Sync Service
 *
 * Handles automatic background synchronization of customers and orders
 * when a merchant first installs the app or manually triggers a sync.
 *
 * This service runs in the background and updates onboarding progress
 * as data is synced from Shopify.
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { CustomerSyncService } from "./customer-sync.service";
import { OrderSyncService } from "./order-sync.service";
import db from "~/db.server";
import {
  markCustomersSynced,
  markOrdersSynced,
} from "~/utils/onboarding";

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface AutoSyncOptions {
  shop: string;
  admin: AdminApiContext;
  syncCustomers?: boolean;
  syncOrders?: boolean;
  ordersStartDate?: Date;
  ordersEndDate?: Date;
  batchSize?: number;
}

export interface AutoSyncResult {
  success: boolean;
  customersResult?: {
    success: boolean;
    imported: number;
    updated: number;
    failed: number;
    duration: number;
  };
  ordersResult?: {
    success: boolean;
    successful: number;
    failed: number;
    skipped: number;
    duration: number;
  };
  errors?: string[];
}

// ============================================
// AUTO SYNC SERVICE
// ============================================

export class AutoSyncService {
  private shop: string;
  private admin: AdminApiContext;
  private syncCustomers: boolean;
  private syncOrders: boolean;
  private ordersStartDate: Date;
  private ordersEndDate: Date;
  private batchSize: number;

  constructor(options: AutoSyncOptions) {
    this.shop = options.shop;
    this.admin = options.admin;
    this.syncCustomers = options.syncCustomers ?? true;
    this.syncOrders = options.syncOrders ?? true;

    // Default to last 1 year of orders
    this.ordersStartDate = options.ordersStartDate ??
      new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    this.ordersEndDate = options.ordersEndDate ?? new Date();
    this.batchSize = options.batchSize ?? 50;
  }

  /**
   * Run the automatic sync process
   *
   * Syncs customers first, then orders (customers are required for orders)
   */
  async sync(): Promise<AutoSyncResult> {
    console.log(`[AutoSync] Starting automatic sync for ${this.shop}`);
    console.log(`[AutoSync] Settings: customers=${this.syncCustomers}, orders=${this.syncOrders}`);

    const result: AutoSyncResult = {
      success: true,
      errors: []
    };

    try {
      // Track sync initiation in database
      await this.markSyncStarted();

      // Step 1: Sync Customers
      if (this.syncCustomers) {
        try {
          console.log(`[AutoSync] Starting customer sync...`);
          const customerResult = await this.syncCustomersData();
          result.customersResult = customerResult;

          if (customerResult.success) {
            // Mark onboarding step as complete
            await markCustomersSynced(this.shop);
            console.log(`[AutoSync] Customer sync completed successfully`);
          } else {
            result.success = false;
            result.errors?.push("Customer sync failed");
          }
        } catch (error) {
          console.error(`[AutoSync] Customer sync error:`, error);
          result.success = false;
          result.errors?.push(`Customer sync error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Step 2: Sync Orders (only if customers sync succeeded or was skipped)
      if (this.syncOrders && (result.customersResult?.success !== false)) {
        try {
          console.log(`[AutoSync] Starting order sync...`);
          const orderResult = await this.syncOrdersData();
          result.ordersResult = orderResult;

          if (orderResult.success) {
            // Mark onboarding step as complete
            await markOrdersSynced(this.shop);
            console.log(`[AutoSync] Order sync completed successfully`);
          } else {
            result.success = false;
            result.errors?.push("Order sync failed");
          }
        } catch (error) {
          console.error(`[AutoSync] Order sync error:`, error);
          result.success = false;
          result.errors?.push(`Order sync error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Mark sync as completed in database
      await this.markSyncCompleted(result.success);

      console.log(`[AutoSync] Auto-sync completed for ${this.shop}:`, {
        success: result.success,
        customersImported: result.customersResult?.imported ?? 0,
        ordersProcessed: result.ordersResult?.successful ?? 0,
      });

      return result;

    } catch (error) {
      console.error(`[AutoSync] Fatal error during auto-sync:`, error);
      await this.markSyncFailed(error instanceof Error ? error.message : 'Unknown error');

      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown sync error']
      };
    }
  }

  /**
   * Sync customers from Shopify
   */
  private async syncCustomersData() {
    const customerSyncService = new CustomerSyncService(
      this.admin,
      this.shop,
      {
        batchSize: this.batchSize,
        onProgress: (progress) => {
          console.log(`[AutoSync] Customer sync progress: ${progress.processed}/${progress.total}`);
        }
      }
    );

    const result = await customerSyncService.syncAllCustomers();

    return {
      success: result.success,
      imported: result.imported,
      updated: result.updated,
      failed: result.failed,
      duration: result.duration
    };
  }

  /**
   * Sync orders from Shopify
   */
  private async syncOrdersData() {
    const orderSyncService = new OrderSyncService(
      this.admin,
      {
        shop: this.shop,
        batchSize: this.batchSize,
        startDate: this.ordersStartDate,
        endDate: this.ordersEndDate,
        onProgress: (progress) => {
          console.log(`[AutoSync] Order sync progress: ${progress.processed}/${progress.total}`);
        }
      }
    );

    const result = await orderSyncService.syncAllOrders();

    return {
      success: result.success,
      successful: result.progress.successful,
      failed: result.progress.failed,
      skipped: result.progress.skipped,
      duration: result.duration
    };
  }

  /**
   * Mark sync as started in the database
   */
  private async markSyncStarted() {
    try {
      // Update or create sync status
      await db.syncStatus.upsert({
        where: {
          shop_syncType: {
            shop: this.shop,
            syncType: 'auto-install'
          }
        },
        update: {
          status: 'RUNNING',
          errorMessage: null,
          updatedAt: new Date()
        },
        create: {
          id: crypto.randomUUID(),
          shop: this.shop,
          syncType: 'auto-install',
          status: 'RUNNING',
          lastSyncAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
    } catch (error) {
      console.error(`[AutoSync] Failed to mark sync as started:`, error);
      // Non-critical, continue anyway
    }
  }

  /**
   * Mark sync as completed in the database
   */
  private async markSyncCompleted(success: boolean) {
    try {
      await db.syncStatus.update({
        where: {
          shop_syncType: {
            shop: this.shop,
            syncType: 'auto-install'
          }
        },
        data: {
          status: success ? 'COMPLETED' : 'FAILED',
          lastSyncAt: new Date(),
          updatedAt: new Date()
        }
      });
    } catch (error) {
      console.error(`[AutoSync] Failed to mark sync as completed:`, error);
    }
  }

  /**
   * Mark sync as failed in the database
   */
  private async markSyncFailed(errorMessage: string) {
    try {
      await db.syncStatus.update({
        where: {
          shop_syncType: {
            shop: this.shop,
            syncType: 'auto-install'
          }
        },
        data: {
          status: 'FAILED',
          errorMessage: errorMessage,
          lastSyncAt: new Date(),
          updatedAt: new Date()
        }
      });
    } catch (error) {
      console.error(`[AutoSync] Failed to mark sync as failed:`, error);
    }
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if auto-sync has already run for this shop
 */
export async function hasAutoSyncRun(shop: string): Promise<boolean> {
  try {
    const syncStatus = await db.syncStatus.findUnique({
      where: {
        shop_syncType: {
          shop,
          syncType: 'auto-install'
        }
      }
    });

    return syncStatus?.status === 'COMPLETED';
  } catch (error) {
    console.error(`[AutoSync] Failed to check sync status:`, error);
    return false;
  }
}

/**
 * Trigger auto-sync in the background (non-blocking)
 *
 * Use this for fire-and-forget background syncing
 */
export function triggerAutoSyncBackground(options: AutoSyncOptions): void {
  // Don't await - run in background
  (async () => {
    try {
      const service = new AutoSyncService(options);
      await service.sync();
    } catch (error) {
      console.error(`[AutoSync] Background sync failed:`, error);
    }
  })();

  console.log(`[AutoSync] Background sync triggered for ${options.shop}`);
}

/**
 * Trigger auto-sync and wait for completion (blocking)
 *
 * Use this when you need to wait for sync to complete
 */
export async function triggerAutoSyncBlocking(options: AutoSyncOptions): Promise<AutoSyncResult> {
  const service = new AutoSyncService(options);
  return await service.sync();
}
