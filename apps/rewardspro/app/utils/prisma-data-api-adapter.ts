/**
 * Prisma-compatible Data API Adapter
 * 
 * Provides a Prisma-like interface that uses Aurora Data API
 * instead of direct database connections. Used for preview deployments.
 */

import { AuroraDataAPI, getAuroraClient } from "./aurora-data-api";
import type { SqlParameter } from "@aws-sdk/client-rds-data";
import * as crypto from "crypto";

/**
 * Base model proxy that provides Prisma-like methods using Data API
 */
export class DataAPIModelProxy<T = any> {
  constructor(
    private tableName: string,
    private client: AuroraDataAPI
  ) {}

  /**
   * Find many records with error handling
   */
  async findMany(args?: {
    where?: Record<string, any>;
    take?: number;
    skip?: number;
    orderBy?: Record<string, "asc" | "desc">;
    include?: Record<string, any>;
    select?: Record<string, any>;
    _count?: { select?: Record<string, boolean> };
  }): Promise<T[]> {
    let sql = `SELECT * FROM "${this.tableName}"`;
    const params: SqlParameter[] = [];
    const conditions: string[] = [];

    // Build WHERE clause
    if (args?.where) {
      Object.entries(args.where).forEach(([key, value], index) => {
        // Handle OR condition specially
        if (key === 'OR' && Array.isArray(value)) {
          // Process OR conditions
          const orConditions: string[] = [];
          value.forEach((orClause, orIndex) => {
            Object.entries(orClause).forEach(([orKey, orValue]) => {
              const paramName = `or${orIndex}_${orKey}`;
              if (orValue === null) {
                orConditions.push(`"${orKey}" IS NULL`);
              } else if (orValue !== undefined && typeof orValue === 'object') {
                // Handle complex comparisons within OR
                if ('gte' in orValue) {
                  // Check if this is a timestamp field
                  const isTimestampField = ['createdAt', 'updatedAt', 'expires', 'processedAt', 'endDate',
                    'currentPeriodStart', 'currentPeriodEnd', 'lastCapAlert', 'shopifyCreatedAt',
                    'shopifyUpdatedAt', 'syncedAt', 'lastOrderDate', 'cancelledAt'].includes(orKey);

                  orConditions.push(`"${orKey}" >= :${paramName}`);
                  params.push(AuroraDataAPI.buildParameter(paramName, orValue.gte, { isTimestamp: isTimestampField }));
                } else if ('lte' in orValue) {
                  const isTimestampField = ['createdAt', 'updatedAt', 'expires', 'processedAt', 'endDate',
                    'currentPeriodStart', 'currentPeriodEnd', 'lastCapAlert', 'shopifyCreatedAt',
                    'shopifyUpdatedAt', 'syncedAt', 'lastOrderDate', 'cancelledAt'].includes(orKey);

                  orConditions.push(`"${orKey}" <= :${paramName}`);
                  params.push(AuroraDataAPI.buildParameter(paramName, orValue.lte, { isTimestamp: isTimestampField }));
                } else if ('gt' in orValue) {
                  orConditions.push(`"${orKey}" > :${paramName}`);
                  params.push(AuroraDataAPI.buildParameter(paramName, orValue.gt));
                } else if ('lt' in orValue) {
                  orConditions.push(`"${orKey}" < :${paramName}`);
                  params.push(AuroraDataAPI.buildParameter(paramName, orValue.lt));
                } else {
                  // Default to equality for other object values
                  orConditions.push(`"${orKey}" = :${paramName}`);
                  params.push(AuroraDataAPI.buildParameter(paramName, orValue));
                }
              } else if (orValue !== undefined) {
                // Simple equality comparison
                orConditions.push(`"${orKey}" = :${paramName}`);
                params.push(AuroraDataAPI.buildParameter(paramName, orValue));
              }
            });
          });
          if (orConditions.length > 0) {
            conditions.push(`(${orConditions.join(' OR ')})`);
          }
          return; // Skip the rest of the processing for OR
        }

        if (value === null) {
          conditions.push(`"${key}" IS NULL`);
        } else if (value !== undefined && typeof value === 'object' && 'not' in value) {
          // Handle { not: null }
          conditions.push(`"${key}" IS NOT NULL`);
        } else if (value !== undefined && typeof value === 'object' && 'contains' in value) {
          // Handle { contains: 'text', mode: 'insensitive' }
          const searchValue = value.contains;
          const mode = value.mode || 'sensitive';
          if (mode === 'insensitive') {
            conditions.push(`LOWER("${key}") LIKE LOWER(:param${index})`);
          } else {
            conditions.push(`"${key}" LIKE :param${index}`);
          }
          params.push(AuroraDataAPI.buildParameter(`param${index}`, `%${searchValue}%`));
        } else if (value !== undefined && typeof value === 'object' && 'gte' in value) {
          // Handle { gte: value } (greater than or equal)
          // STRATEGY 1: Remove SQL casting, rely on Data API type hints only
          conditions.push(`"${key}" >= :param${index}`);

          // Check if this is a timestamp field to pass hint to buildParameter
          const isTimestampField = ['createdAt', 'updatedAt', 'expires', 'processedAt',
            'currentPeriodStart', 'currentPeriodEnd', 'lastCapAlert', 'shopifyCreatedAt',
            'shopifyUpdatedAt', 'syncedAt', 'lastOrderDate', 'cancelledAt'].includes(key);

          params.push(AuroraDataAPI.buildParameter(`param${index}`, value.gte, { isTimestamp: isTimestampField }));
        } else if (value !== undefined && typeof value === 'object' && 'lte' in value) {
          // Handle { lte: value } (less than or equal)
          // STRATEGY 1: Remove SQL casting, rely on Data API type hints only
          conditions.push(`"${key}" <= :param${index}`);

          // Check if this is a timestamp field to pass hint to buildParameter
          const isTimestampField = ['createdAt', 'updatedAt', 'expires', 'processedAt',
            'currentPeriodStart', 'currentPeriodEnd', 'lastCapAlert', 'shopifyCreatedAt',
            'shopifyUpdatedAt', 'syncedAt', 'lastOrderDate', 'cancelledAt'].includes(key);

          params.push(AuroraDataAPI.buildParameter(`param${index}`, value.lte, { isTimestamp: isTimestampField }));
        } else if (value !== undefined && typeof value === 'object' && 'gt' in value) {
          // Handle { gt: value } (greater than)
          // Check if this is a timestamp field that needs casting
          const isTimestampField = ['createdAt', 'updatedAt', 'expires', 'processedAt',
            'currentPeriodStart', 'currentPeriodEnd', 'lastCapAlert', 'shopifyCreatedAt',
            'shopifyUpdatedAt', 'syncedAt', 'lastOrderDate', 'cancelledAt'].includes(key);
          
          if (isTimestampField) {
            conditions.push(`"${key}" > :param${index}::timestamp`);
          } else {
            conditions.push(`"${key}" > :param${index}`);
          }
          params.push(AuroraDataAPI.buildParameter(`param${index}`, value.gt));
        } else if (value !== undefined && typeof value === 'object' && 'lt' in value) {
          // Handle { lt: value } (less than)
          // Check if this is a timestamp field that needs casting
          const isTimestampField = ['createdAt', 'updatedAt', 'expires', 'processedAt',
            'currentPeriodStart', 'currentPeriodEnd', 'lastCapAlert', 'shopifyCreatedAt',
            'shopifyUpdatedAt', 'syncedAt', 'lastOrderDate', 'cancelledAt'].includes(key);
          
          if (isTimestampField) {
            conditions.push(`"${key}" < :param${index}::timestamp`);
          } else {
            conditions.push(`"${key}" < :param${index}`);
          }
          params.push(AuroraDataAPI.buildParameter(`param${index}`, value.lt));
        } else if (value !== undefined && typeof value === 'object' && 'in' in value) {
          // Handle { in: [...] } (IN clause)
          const inValues = value.in;
          if (Array.isArray(inValues) && inValues.length > 0) {
            // Use the isEnumField method to check if field needs casting
            const placeholders = inValues.map((_, i) => `:param${index}_${i}`);

            // Check if this field is an enum type that needs casting
            // Creating a temporary proxy to access the private method
            const enumFields = ['type', 'changeType', 'triggerType', 'storeCurrency', 'currencyDisplayType',
                               'evaluationPeriod', 'purchaseType', 'duration', 'currency', 'status',
                               'billingInterval', 'deliveryInterval', 'financialStatus', 'lastPaymentStatus',
                               'discountType', 'eventType'];
            if (enumFields.includes(key)) {
              // Cast enum types explicitly for PostgreSQL IN clause
              conditions.push(`"${key}"::text IN (${placeholders.join(', ')})`);
            } else {
              conditions.push(`"${key}" IN (${placeholders.join(', ')})`);
            }

            inValues.forEach((val, i) => {
              params.push(AuroraDataAPI.buildParameter(`param${index}_${i}`, val));
            });
          }
        } else if (value !== undefined) {
          // Check if this field is an enum type that needs casting
          const enumFields = ['type', 'changeType', 'triggerType', 'storeCurrency', 'currencyDisplayType',
                             'evaluationPeriod', 'purchaseType', 'duration', 'currency', 'status',
                             'billingInterval', 'deliveryInterval', 'financialStatus', 'lastPaymentStatus',
                             'discountType', 'eventType'];
          if (enumFields.includes(key)) {
            // Cast enum types explicitly for PostgreSQL
            conditions.push(`"${key}"::text = :param${index}`);
          } else {
            conditions.push(`"${key}" = :param${index}`);
          }
          params.push(AuroraDataAPI.buildParameter(`param${index}`, value));
        }
      });

      // OR conditions are already handled in the forEach loop above
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }

    // Add ORDER BY
    if (args?.orderBy) {
      const orderClauses = Object.entries(args.orderBy).map(
        ([field, direction]) => {
          // Handle both string and object notation for orderBy
          const dir = typeof direction === 'string' ? direction : (direction?.sort || 'asc');
          return `"${field}" ${dir.toUpperCase()}`;
        }
      );
      sql += ` ORDER BY ${orderClauses.join(", ")}`;
    }

    // Add LIMIT and OFFSET
    if (args?.take) {
      sql += ` LIMIT ${args.take}`;
    }
    if (args?.skip) {
      sql += ` OFFSET ${args.skip}`;
    }

    try {
      const result = await this.client.executeStatement(sql, params);
      const records = result.records as T[];

      // Handle includes (fetch related data)
      if (args?.include && records.length > 0) {
        for (const record of records) {
          await this.loadIncludes(record, args.include);
        }
      }

      // Handle _count
      if (args?._count?.select && records.length > 0) {
        for (const record of records) {
          await this.loadCounts(record, args._count.select);
        }
      }

      return records;
    } catch (error: any) {
      console.error(`[DataAPI] Error in findMany for ${this.tableName}:`, error);
      console.error(`[DataAPI] SQL: ${sql}`);
      console.error(`[DataAPI] Params:`, params);
      throw new Error(`Database query failed: ${error.message}`);
    }
  }

  /**
   * Load included relations
   */
  private async loadIncludes(record: any, include: Record<string, any>) {
    for (const [relation, includeConfig] of Object.entries(include)) {
      if (!includeConfig) continue;

      // Handle currentTier relation (many-to-one) for Customer model
      if (relation === 'currentTier' && record.currentTierId) {
        const tierResult = await this.client.executeStatement(
          `SELECT * FROM "Tier" WHERE id = :tierId`,
          [AuroraDataAPI.buildParameter('tierId', record.currentTierId)]
        );

        if (tierResult.records.length > 0) {
          const tier = tierResult.records[0];
          // Handle select if specified
          if (typeof includeConfig === 'object' && includeConfig.select) {
            const selected: any = {};
            for (const field of Object.keys(includeConfig.select)) {
              if (includeConfig.select[field]) {
                selected[field] = tier[field];
              }
            }
            record.currentTier = selected;
          } else {
            record.currentTier = tier;
          }
        } else {
          record.currentTier = null;
        }
      }

      // Handle tier relation (many-to-one) for TierProduct model
      if (relation === 'tier' && record.tierId) {
        console.log(`[DataAPI] Loading tier relation for tierId: ${record.tierId}`);
        const tierResult = await this.client.executeStatement(
          `SELECT * FROM "Tier" WHERE id = :tierId`,
          [AuroraDataAPI.buildParameter('tierId', record.tierId)]
        );

        console.log(`[DataAPI] Tier lookup result: found ${tierResult.records.length} records`);
        if (tierResult.records.length > 0) {
          const tier = tierResult.records[0];
          console.log(`[DataAPI] Tier found: ${tier.name} (${tier.id})`);
          // Handle select if specified
          if (typeof includeConfig === 'object' && includeConfig.select) {
            const selected: any = {};
            for (const field of Object.keys(includeConfig.select)) {
              if (includeConfig.select[field]) {
                selected[field] = tier[field];
              }
            }
            record.tier = selected;
          } else {
            record.tier = tier;
          }
        } else {
          console.log(`[DataAPI] ⚠️ No tier found for tierId: ${record.tierId}`);
          record.tier = null;
        }
      }

      // Handle customer relation (many-to-one) for Order model
      if (relation === 'customer' && record.customerId) {
        const customerResult = await this.client.executeStatement(
          `SELECT * FROM "Customer" WHERE id = :customerId`,
          [AuroraDataAPI.buildParameter('customerId', record.customerId)]
        );

        if (customerResult.records.length > 0) {
          const customer = customerResult.records[0];
          // Handle select if specified
          if (typeof includeConfig === 'object' && includeConfig.select) {
            const selected: any = {};
            for (const field of Object.keys(includeConfig.select)) {
              if (includeConfig.select[field]) {
                selected[field] = customer[field];
              }
            }
            record.customer = selected;
          } else {
            record.customer = customer;
          }
        } else {
          record.customer = null;
        }
      }
    }
  }

  /**
   * Load counts for relations
   */
  private async loadCounts(record: any, countSelect: Record<string, boolean>) {
    record._count = {};
    
    for (const [relation, shouldCount] of Object.entries(countSelect)) {
      if (!shouldCount) continue;

      // Handle creditLedger count
      if (relation === 'creditLedger' && record.id) {
        const countResult = await this.client.executeStatement(
          `SELECT COUNT(*) as count FROM "StoreCreditLedger" WHERE "customerId" = :customerId`,
          [AuroraDataAPI.buildParameter('customerId', record.id)]
        );
        
        record._count[relation] = countResult.records[0]?.count || 0;
      }
      // Add more count handlers as needed
    }
  }

  /**
   * Find unique record
   */
  async findUnique(args: {
    where: Record<string, any>;
    select?: Record<string, any>;
  }): Promise<T | null> {
    // Handle composite unique constraints
    // Prisma may pass composite keys as "field1_field2" with a combined value
    // We need to detect and split these
    const processedWhere: Record<string, any> = {};

    for (const [key, value] of Object.entries(args.where)) {
      // Check for composite unique constraint patterns
      if (key === 'shop_shopifyOrderId' && this.tableName === 'Order') {
        // Handle the composite key for Order model
        // The value might be a string (JSON) or an object
        let parsed: any;

        if (typeof value === 'string') {
          try {
            parsed = JSON.parse(value);
          } catch (e) {
            console.error('[DataAPI] Failed to parse composite key value:', value);
            processedWhere[key] = value;
            continue;
          }
        } else if (typeof value === 'object' && value !== null) {
          parsed = value;
        } else {
          processedWhere[key] = value;
          continue;
        }

        // Extract individual fields
        if (parsed.shop && parsed.shopifyOrderId) {
          processedWhere.shop = parsed.shop;
          processedWhere.shopifyOrderId = parsed.shopifyOrderId;
        } else {
          console.error('[DataAPI] Invalid composite key structure:', parsed);
          processedWhere[key] = value;
        }
      } else if (key === 'orderId_shopifyLineItemId' && this.tableName === 'OrderLineItem') {
        // Handle the composite key for OrderLineItem model
        if (typeof value === 'object' && value !== null) {
          processedWhere.orderId = value.orderId;
          processedWhere.shopifyLineItemId = value.shopifyLineItemId;
        } else {
          console.error('[DataAPI] Invalid composite key for OrderLineItem:', value);
          processedWhere[key] = value;
        }
      } else if (key === 'shop_shopifyCustomerId' && this.tableName === 'Customer') {
        // Handle the composite key for Customer model
        let parsed: any;

        if (typeof value === 'string') {
          try {
            parsed = JSON.parse(value);
          } catch (e) {
            console.error('[DataAPI] Failed to parse Customer composite key:', value);
            processedWhere[key] = value;
            continue;
          }
        } else if (typeof value === 'object' && value !== null) {
          parsed = value;
        } else {
          processedWhere[key] = value;
          continue;
        }

        // Extract individual fields
        if (parsed.shop && parsed.shopifyCustomerId) {
          processedWhere.shop = parsed.shop;
          processedWhere.shopifyCustomerId = parsed.shopifyCustomerId;
        } else {
          console.error('[DataAPI] Invalid Customer composite key structure:', parsed);
          processedWhere[key] = value;
        }
      } else if (key === 'shop_year_month' && this.tableName === 'MonthlyOrderUsage') {
        // Handle the composite key for MonthlyOrderUsage model
        let parsed: any;

        if (typeof value === 'string') {
          try {
            parsed = JSON.parse(value);
          } catch (e) {
            console.error('[DataAPI] Failed to parse MonthlyOrderUsage composite key:', value);
            processedWhere[key] = value;
            continue;
          }
        } else if (typeof value === 'object' && value !== null) {
          parsed = value;
        } else {
          processedWhere[key] = value;
          continue;
        }

        // Extract individual fields
        if (parsed.shop && parsed.year !== undefined && parsed.month !== undefined) {
          processedWhere.shop = parsed.shop;
          processedWhere.year = parsed.year;
          processedWhere.month = parsed.month;
        } else {
          console.error('[DataAPI] Invalid MonthlyOrderUsage composite key structure:', parsed);
          processedWhere[key] = value;
        }
      } else if (key.includes('_') && typeof value === 'string') {
        // Check if this might be another composite key (JSON string)
        try {
          const parsed = JSON.parse(value);
          if (typeof parsed === 'object' && parsed !== null) {
            // Split the key and map to individual fields
            const parts = key.split('_');
            if (parts.length === 2 && parsed[parts[0]] && parsed[parts[1]]) {
              processedWhere[parts[0]] = parsed[parts[0]];
              processedWhere[parts[1]] = parsed[parts[1]];
            } else {
              processedWhere[key] = value;
            }
          } else {
            processedWhere[key] = value;
          }
        } catch (e) {
          // Not JSON, treat as regular field
          processedWhere[key] = value;
        }
      } else {
        // Regular field
        processedWhere[key] = value;
      }
    }

    const results = await this.findMany({
      where: processedWhere,
      take: 1,
    });
    return results[0] || null;
  }

  /**
   * Find first record
   */
  async findFirst(args?: {
    where?: Record<string, any>;
    orderBy?: Record<string, "asc" | "desc">;
    include?: Record<string, any>;
    select?: Record<string, any>;
  }): Promise<T | null> {
    const results = await this.findMany({
      where: args?.where,
      orderBy: args?.orderBy,
      include: args?.include,
      select: args?.select,
      take: 1,
    });
    return results[0] || null;
  }

  /**
   * Create a record with enum handling
   */
  async create(args: {
    data: Record<string, any>;
  }): Promise<T> {
    // Auto-generate UUID for id field if not provided
    // This mimics Prisma's @default(uuid()) behavior
    const dataWithId = { ...args.data };
    if (!dataWithId.id && this.requiresUuidId()) {
      dataWithId.id = crypto.randomUUID();
      console.log(`[DataAPI] Auto-generated UUID for ${this.tableName}: ${dataWithId.id}`);
    }

    // Auto-add timestamps if not provided
    // This mimics Prisma's @default(now()) and @updatedAt behavior
    const now = new Date().toISOString();
    if (this.requiresTimestamps()) {
      if (!dataWithId.createdAt) {
        dataWithId.createdAt = now;
      }
      // Only add updatedAt for tables that have the field
      // Ledger tables (StoreCreditLedger, PointsLedger) only have createdAt
      if (!dataWithId.updatedAt && !this.hasOnlyCreatedAt()) {
        dataWithId.updatedAt = now;
      }
    }

    const fields = Object.keys(dataWithId);
    const params: SqlParameter[] = [];

    // Build values with proper type casting for enums, timestamps, and JSON
    const values = fields.map((field, i) => {
      const value = dataWithId[field];

      // CRITICAL FIX: Handle arrays and objects by JSON-stringifying them
      // Aurora Data API doesn't support array parameters directly
      let paramValue = value;
      let needsJsonbCast = false;

      if (value && (Array.isArray(value) || (typeof value === 'object' && !(value instanceof Date)))) {
        // JSON-stringify arrays and objects
        paramValue = JSON.stringify(value);
        needsJsonbCast = true;
      }

      params.push(AuroraDataAPI.buildParameter(`param${i}`, paramValue));

      // Check if this field needs enum casting
      if (this.isEnumField(field)) {
        return `:param${i}::text::${this.getEnumType(field)}`;
      }

      // Check if this is a timestamp field
      if (field === 'createdAt' || field === 'updatedAt' || field === 'expires' ||
          field === 'currentPeriodStart' || field === 'currentPeriodEnd' || field === 'processedAt' ||
          field === 'shopifyCreatedAt' || field === 'shopifyUpdatedAt' || field === 'syncedAt' ||
          field === 'lastSyncAt' || field === 'completedAt' || field === 'lastSuccessAt' ||
          field === 'cancelledAt' || field === 'closedAt' || field === 'lastActivityAt' ||
          field === 'tierAssignedAt' || field === 'lastOrderDate' || field === 'verifiedAt' ||
          field === 'sentAt' || field === 'readAt' || field === 'startAt' || field === 'endAt' ||
          field === 'processedStartAt' || field === 'processedEndAt' || field === 'originalCreatedAt' ||
          field === 'originalUpdatedAt' || field.endsWith('At') || field.endsWith('Date')) {
        return `:param${i}::timestamp`;
      }

      // Check if this is a JSON/JSONB field (metadata, features, data, config, payload, etc.)
      // Cast to jsonb if value is an array or object
      if (needsJsonbCast || field === 'metadata' || field === 'data' || field === 'config' ||
          field === 'payload' || field === 'features') {
        return `:param${i}::jsonb`;
      }

      return `:param${i}`;
    });

    const sql = `
      INSERT INTO "${this.tableName}" (${fields.map(f => `"${f}"`).join(", ")})
      VALUES (${values.join(", ")})
      RETURNING *
    `;

    try {
      const result = await this.client.executeStatement(sql, params);
      return result.records[0] as T;
    } catch (error: any) {
      console.error(`[DataAPI] Error in create for ${this.tableName}:`, error);
      console.error(`[DataAPI] SQL: ${sql}`);
      console.error(`[DataAPI] Data:`, args.data);
      throw new Error(`Failed to create ${this.tableName}: ${error.message}`);
    }
  }
  
  /**
   * Check if a field is an enum type
   */
  private isEnumField(field: string): boolean {
    // Map of known enum fields per table
    const enumFields: Record<string, string[]> = {
      Tier: ['evaluationPeriod', 'billingInterval'],
      ShopSettings: ['storeCurrency', 'currencyDisplayType', 'tierRecalculationFrequency', 'widgetThemeMode'],
      StoreCreditLedger: ['type'],
      TierChangeLog: ['changeType', 'triggerType'],
      TierProduct: ['purchaseType', 'duration', 'currency'],
      TierSubscription: ['status', 'billingInterval', 'deliveryInterval', 'currency'],
      // Order: ['financialStatus'], // Commented out - enum type doesn't exist in production database
      SubscriptionBillingAttempt: ['status', 'currency'],
      CustomerTierState: ['tierSource'],
      Subscription: ['status', 'currency', 'lastPaymentStatus'],
      BillingAttempt: ['status', 'currency'],
      SellingPlan: ['billingInterval', 'discountType'],
      TierPurchase: ['status', 'currency'],
      SubscriptionRetry: ['status'],
      SubscriptionEvent: ['eventType'],
      SyncStatus: ['status'],
      ShopEntitlements: ['planSource'],
      CustomerSyncJob: ['status'],
      StoreCreditSyncJob: ['status'],
      OrderSyncJob: ['status'],
      PointsConfig: ['roundingMode'],
      PointsLedger: ['type'],
      // Raffles System
      Raffle: ['status', 'drawType'],
      RafflePrize: ['prizeType'],
      RaffleWinner: ['deliveryStatus'],
      // Mystery Box System
      MysteryBox: ['status'],
      MysteryBoxReward: ['rewardType', 'rarity'],
      // Third-Party Integration System
      Integration: ['provider', 'status'],
      IntegrationEvent: ['eventType', 'status'],
      IntegrationWebhook: ['status'],
      OAuthState: ['provider'],
      IntegrationPointsRule: ['provider', 'pointsType'],
      // Gift Card System
      IssuedGiftCard: ['bundleType', 'status'],
      GiftCardBundle: ['bundleType'],
      // Klaviyo Integration System
      KlaviyoProfile: ['syncStatus', 'emailConsent', 'smsConsent'],
      KlaviyoEvent: ['status'],
    };

    return enumFields[this.tableName]?.includes(field) || false;
  }

  /**
   * Check if this table requires auto-generated UUID for id field
   * Tables with @id @default(uuid()) in Prisma schema
   */
  private requiresUuidId(): boolean {
    const tablesWithUuidId = [
      // Core models
      'Session',
      'ShopSettings',
      'Tier',
      'TierProduct',
      'Customer',
      'StoreCreditLedger',
      'TierChangeLog',
      'UsageRecord',
      'BillingHistory',
      'Notification',
      'MonthlyOrderUsage',
      'Order',
      'OrderLineItem',
      'OrderRefund',
      'OrderRefundLineItem',
      'TierSubscription',
      'SubscriptionBillingAttempt',
      'SellingPlanGroup',
      'SellingPlan',
      'TierPurchase',
      'TierPurchaseItem',
      'CustomerTierState',
      'ShopEntitlements',
      'CronLock',
      'SyncStatus',
      // Email models
      'EmailTemplate',
      'EmailCampaign',
      'EmailAutomation',
      'EmailSettings',
      'EmailEvent',
      'SendGridDomain',
      'AnalyticsRecommendation',
      // Sync Job models
      'CustomerSyncJob',
      'StoreCreditSyncJob',
      'OrderSyncJob',
      // Trial abuse prevention
      'TierTrialAuditLog',
      // Points Engagement System
      'PointsConfig',
      'PointsLedger',
      // Raffles System
      'Raffle',
      'RafflePrize',
      'RaffleEntry',
      'RaffleWinner',
      // Mystery Box System
      'MysteryBox',
      'MysteryBoxReward',
      'MysteryBoxOpen',
      'MysteryBoxWinner',
      // Third-Party Integration System
      'Integration',
      'IntegrationEvent',
      'IntegrationWebhook',
      'OAuthState',
      'IntegrationPointsRule',
      // Gift Card System
      'GiftCardConfig',
      'TierGiftCardSettings',
      'IssuedGiftCard',
      'GiftCardBundle',
      // Klaviyo Integration System
      'KlaviyoProfile',
      'KlaviyoEvent',
      'KlaviyoList',
      'KlaviyoAutomationSettings',
      // AI Feedback System
      'AISession',
      'AISessionAction',
      'AISessionFeedback',
      'AICodeMetric',
      'AILearningPattern',
      'AICodeQualitySignal',
      'AIArchitectureHealth',
      'AIInnovationTracker',
    ];
    return tablesWithUuidId.includes(this.tableName);
  }

  /**
   * Check if this table has createdAt/updatedAt timestamp fields
   * Most tables with @default(now()) and @updatedAt in Prisma schema
   */
  private requiresTimestamps(): boolean {
    // Tables that have createdAt and updatedAt fields
    // This covers most models in the schema
    const tablesWithTimestamps = [
      // Core models
      'Session',
      'ShopSettings',
      'Tier',
      'TierProduct',
      'Customer',
      'StoreCreditLedger',
      'TierChangeLog',
      'UsageRecord',
      'BillingHistory',
      'Notification',
      'MonthlyOrderUsage',
      'MonthlyEmailUsage',
      'Order',
      'OrderLineItem',
      'OrderRefund',
      'OrderRefundLineItem',
      'TierSubscription',
      'SubscriptionBillingAttempt',
      'SellingPlanGroup',
      'SellingPlan',
      'TierPurchase',
      'TierPurchaseItem',
      'CustomerTierState',
      'ShopEntitlements',
      'CronLock',
      'SyncStatus',
      // Email models
      'EmailTemplate',
      'EmailCampaign',
      'EmailAutomation',
      'EmailSettings',
      'EmailEvent',
      'SendGridDomain',
      'AnalyticsRecommendation',
      // Sync Job models
      'CustomerSyncJob',
      'StoreCreditSyncJob',
      'OrderSyncJob',
      // Trial abuse prevention
      'TierTrialAuditLog',
      // Points Engagement System
      'PointsConfig',
      'PointsLedger',
      // Raffles System
      'Raffle',
      'RafflePrize',
      'RaffleEntry',
      'RaffleWinner',
      // Mystery Box System
      'MysteryBox',
      'MysteryBoxReward',
      'MysteryBoxOpen',
      'MysteryBoxWinner',
      // Third-Party Integration System
      'Integration',
      'IntegrationEvent',
      'IntegrationWebhook',
      'OAuthState',
      'IntegrationPointsRule',
      // Gift Card System
      'GiftCardConfig',
      'TierGiftCardSettings',
      'IssuedGiftCard',
      'GiftCardBundle',
      // Klaviyo Integration System
      'KlaviyoProfile',
      'KlaviyoEvent',
      'KlaviyoList',
      'KlaviyoAutomationSettings',
      // AI Feedback System
      'AISession',
      'AISessionAction',
      'AISessionFeedback',
      'AICodeMetric',
      'AILearningPattern',
      'AICodeQualitySignal',
      'AIArchitectureHealth',
      'AIInnovationTracker',
      // Webhook models
      'WebhookProcess',
      'WebhookError',
      'WebhookProcessed',
      'DeadLetterQueue',
      // Billing models
      'BillingAuditLog',
      'BillingSubscription',
      'AppSubscription',
      // Other models
      'BulkOperationLog',
      'ExchangeRate',
      'SubscriptionPricingHistory',
      'SubscriptionPricingConfig',
      'SubscriptionRetry',
      'SubscriptionEvent',
      'ReconciliationLog',
    ];
    return tablesWithTimestamps.includes(this.tableName);
  }

  /**
   * Check if this table has ONLY createdAt (no updatedAt field)
   * These are typically ledger/log tables where records are immutable after creation
   */
  private hasOnlyCreatedAt(): boolean {
    const tablesWithOnlyCreatedAt = [
      'StoreCreditLedger',  // Ledger entries are immutable
      'PointsLedger',       // Ledger entries are immutable
      'WebhookError',       // Error logs are immutable (no updatedAt in schema)
      'OrderLineItem',      // Line items are immutable (no updatedAt in schema)
      'OrderRefund',        // Refund records are immutable (no updatedAt in schema)
      'OrderRefundLineItem', // Refund line items are immutable (no updatedAt in schema)
    ];
    return tablesWithOnlyCreatedAt.includes(this.tableName);
  }

  /**
   * Get the PostgreSQL enum type name for a field
   */
  private getEnumType(field: string): string {
    // Handle table-specific enum mappings first
    if (field === 'type') {
      return this.getTypeEnumForTable();
    }

    // Handle provider field for integration tables
    if (field === 'provider') {
      return '"IntegrationProvider"';
    }

    // Handle eventType field based on table
    if (field === 'eventType') {
      return this.getEventTypeEnumForTable();
    }

    // Handle pointsType for IntegrationPointsRule
    if (field === 'pointsType') {
      return '"IntegrationPointsType"';
    }

    // Map field names to PostgreSQL enum type names
    const enumTypes: Record<string, string> = {
      evaluationPeriod: '"EvaluationPeriod"',
      storeCurrency: '"Currency"',
      currency: '"Currency"',
      currencyDisplayType: '"CurrencyDisplayType"',
      tierRecalculationFrequency: '"RecalculationFrequency"',
      widgetThemeMode: '"WidgetThemeMode"',
      changeType: '"TierChangeType"',
      triggerType: '"TierTriggerType"',
      tierSource: '"TierSource"',
      planSource: '"EntitlementSource"',
      purchaseType: '"PurchaseType"',
      duration: '"ProductDuration"',
      status: this.getStatusEnumForTable(),
      billingInterval: '"BillingInterval"',
      deliveryInterval: '"BillingInterval"',
      financialStatus: '"OrderFinancialStatus"',
      lastPaymentStatus: '"PaymentStatus"',
      discountType: '"DiscountType"',
      roundingMode: '"PointsRoundingMode"',
      // Raffles System
      drawType: '"RaffleDrawType"',
      prizeType: '"RafflePrizeType"',
      deliveryStatus: '"RafflePrizeDeliveryStatus"',
      // Mystery Box System
      rewardType: '"MysteryBoxRewardType"',
      rarity: '"MysteryBoxRarity"',
      // Gift Card System
      bundleType: '"GiftCardBundleType"',
      // Klaviyo Integration System
      syncStatus: '"KlaviyoSyncStatus"',
      emailConsent: '"KlaviyoConsentStatus"',
      smsConsent: '"KlaviyoConsentStatus"',
    };

    return enumTypes[field] || field;
  }

  /**
   * Get the appropriate eventType enum based on table name
   */
  private getEventTypeEnumForTable(): string {
    const eventTypeEnumMap: Record<string, string> = {
      SubscriptionEvent: '"SubscriptionEventType"',
      IntegrationEvent: '"LoyaltyEventType"',
    };

    return eventTypeEnumMap[this.tableName] || '"SubscriptionEventType"';
  }

  /**
   * Get the appropriate type enum based on table name
   */
  private getTypeEnumForTable(): string {
    const typeEnumMap: Record<string, string> = {
      StoreCreditLedger: '"LedgerEntryType"',
      PointsLedger: '"PointsLedgerType"',
    };

    return typeEnumMap[this.tableName] || '"LedgerEntryType"';
  }

  /**
   * Get the appropriate status enum type based on table name
   */
  private getStatusEnumForTable(): string {
    // Different tables use different status enums
    const statusEnumMap: Record<string, string> = {
      TierSubscription: '"SubscriptionStatus"',
      Subscription: '"SubscriptionStatus"',
      SubscriptionBillingAttempt: '"BillingStatus"',
      BillingAttempt: '"BillingAttemptStatus"',
      TierPurchase: '"PurchaseStatus"',
      SubscriptionRetry: '"RetryStatus"',
      SyncStatus: '"SyncStatusEnum"',
      CustomerSyncJob: '"SyncJobStatus"',
      StoreCreditSyncJob: '"SyncJobStatus"',
      OrderSyncJob: '"SyncJobStatus"',
      // Raffles System
      Raffle: '"RaffleStatus"',
      // Mystery Box System
      MysteryBox: '"MysteryBoxStatus"',
      // Third-Party Integration System
      Integration: '"IntegrationStatus"',
      IntegrationEvent: '"IntegrationEventStatus"',
      IntegrationWebhook: '"IntegrationWebhookStatus"',
      // Gift Card System
      IssuedGiftCard: '"GiftCardStatus"',
      // Klaviyo Integration System
      KlaviyoProfile: '"KlaviyoSyncStatus"',
      KlaviyoEvent: '"KlaviyoEventStatus"',
    };

    return statusEnumMap[this.tableName] || '"Status"';
  }

  /**
   * Update records with enum handling
   */
  async update(args: {
    where: Record<string, any>;
    data: Record<string, any>;
  }): Promise<T> {
    // Auto-update updatedAt timestamp
    // This mimics Prisma's @updatedAt behavior
    // Skip for ledger tables that don't have updatedAt field
    const dataWithTimestamp = { ...args.data };
    if (this.requiresTimestamps() && !dataWithTimestamp.updatedAt && !this.hasOnlyCreatedAt()) {
      dataWithTimestamp.updatedAt = new Date().toISOString();
    }

    const setFields = Object.keys(dataWithTimestamp);
    const whereFields = Object.keys(args.where);
    const params: SqlParameter[] = [];

    // Build SET clause with enum, timestamp, and JSON casting
    const setClauses = setFields.map((field, i) => {
      const value = dataWithTimestamp[field];

      // CRITICAL FIX: Handle arrays and objects by JSON-stringifying them
      // Aurora Data API doesn't support array parameters directly
      let paramValue = value;
      let needsJsonbCast = false;

      if (value && (Array.isArray(value) || (typeof value === 'object' && !(value instanceof Date)))) {
        // JSON-stringify arrays and objects
        paramValue = JSON.stringify(value);
        needsJsonbCast = true;
      }

      params.push(AuroraDataAPI.buildParameter(`set${i}`, paramValue));

      // Check if this field needs enum casting
      if (this.isEnumField(field)) {
        return `"${field}" = :set${i}::text::${this.getEnumType(field)}`;
      }

      // Check if this is a timestamp field
      if (field === 'createdAt' || field === 'updatedAt' || field === 'expires' ||
          field === 'currentPeriodStart' || field === 'currentPeriodEnd' || field === 'processedAt' ||
          field === 'shopifyCreatedAt' || field === 'shopifyUpdatedAt' || field === 'syncedAt' ||
          field === 'lastSyncAt' || field === 'completedAt' || field === 'lastSuccessAt' ||
          field === 'cancelledAt' || field === 'closedAt' || field === 'lastActivityAt' ||
          field === 'tierAssignedAt' || field === 'lastOrderDate' || field === 'verifiedAt' ||
          field === 'sentAt' || field === 'readAt' || field === 'startAt' || field === 'endAt' ||
          field === 'processedStartAt' || field === 'processedEndAt' || field === 'originalCreatedAt' ||
          field === 'originalUpdatedAt' || field.endsWith('At') || field.endsWith('Date')) {
        return `"${field}" = :set${i}::timestamp`;
      }

      // Check if this is a JSON/JSONB field (metadata, features, data, config, payload, etc.)
      // Cast to jsonb if value is an array or object
      if (needsJsonbCast || field === 'metadata' || field === 'data' || field === 'config' ||
          field === 'payload' || field === 'features') {
        return `"${field}" = :set${i}::jsonb`;
      }

      return `"${field}" = :set${i}`;
    });

    // Build WHERE clause
    const whereClauses = whereFields.map((field, i) => {
      params.push(AuroraDataAPI.buildParameter(`where${i}`, args.where[field]));
      return `"${field}" = :where${i}`;
    });

    const sql = `
      UPDATE "${this.tableName}"
      SET ${setClauses.join(", ")}
      WHERE ${whereClauses.join(" AND ")}
      RETURNING *
    `;

    try {
      const result = await this.client.executeStatement(sql, params);
      return result.records[0] as T;
    } catch (error: any) {
      console.error(`[DataAPI] Error in update for ${this.tableName}:`, error);
      console.error(`[DataAPI] SQL: ${sql}`);
      throw new Error(`Failed to update ${this.tableName}: ${error.message}`);
    }
  }

  /**
   * Update many records with enum handling
   */
  async updateMany(args: {
    where?: Record<string, any>;
    data: Record<string, any>;
  }): Promise<{ count: number }> {
    // Auto-update updatedAt timestamp
    // This mimics Prisma's @updatedAt behavior
    // Skip for ledger tables that don't have updatedAt field
    const dataWithTimestamp = { ...args.data };
    if (this.requiresTimestamps() && !dataWithTimestamp.updatedAt && !this.hasOnlyCreatedAt()) {
      dataWithTimestamp.updatedAt = new Date().toISOString();
    }

    const setFields = Object.keys(dataWithTimestamp);
    const params: SqlParameter[] = [];

    // Build SET clause with enum, timestamp, and JSON casting
    const setClauses = setFields.map((field, i) => {
      const value = dataWithTimestamp[field];

      // CRITICAL FIX: Handle arrays and objects by JSON-stringifying them
      // Aurora Data API doesn't support array parameters directly
      let paramValue = value;
      let needsJsonbCast = false;

      if (value && (Array.isArray(value) || (typeof value === 'object' && !(value instanceof Date)))) {
        // JSON-stringify arrays and objects
        paramValue = JSON.stringify(value);
        needsJsonbCast = true;
      }

      params.push(AuroraDataAPI.buildParameter(`set${i}`, paramValue));

      // Check if this field needs enum casting
      if (this.isEnumField(field)) {
        return `"${field}" = :set${i}::text::${this.getEnumType(field)}`;
      }

      // Check if this is a timestamp field
      if (field === 'createdAt' || field === 'updatedAt' || field === 'expires' ||
          field === 'currentPeriodStart' || field === 'currentPeriodEnd' || field === 'processedAt' ||
          field === 'shopifyCreatedAt' || field === 'shopifyUpdatedAt' || field === 'syncedAt' ||
          field === 'lastSyncAt' || field === 'completedAt' || field === 'lastSuccessAt' ||
          field === 'cancelledAt' || field === 'closedAt' || field === 'lastActivityAt' ||
          field === 'tierAssignedAt' || field === 'lastOrderDate' || field === 'verifiedAt' ||
          field === 'sentAt' || field === 'readAt' || field === 'startAt' || field === 'endAt' ||
          field === 'processedStartAt' || field === 'processedEndAt' || field === 'originalCreatedAt' ||
          field === 'originalUpdatedAt' || field.endsWith('At') || field.endsWith('Date')) {
        return `"${field}" = :set${i}::timestamp`;
      }

      // Check if this is a JSON/JSONB field (metadata, features, data, config, payload, etc.)
      // Cast to jsonb if value is an array or object
      if (needsJsonbCast || field === 'metadata' || field === 'data' || field === 'config' ||
          field === 'payload' || field === 'features') {
        return `"${field}" = :set${i}::jsonb`;
      }

      return `"${field}" = :set${i}`;
    });

    let sql = `UPDATE "${this.tableName}" SET ${setClauses.join(", ")}`;

    // Build WHERE clause if provided
    if (args.where) {
      const whereFields = Object.keys(args.where);
      const whereClauses = whereFields.map((field, i) => {
        params.push(AuroraDataAPI.buildParameter(`where${i}`, args.where![field]));
        return `"${field}" = :where${i}`;
      });
      sql += ` WHERE ${whereClauses.join(" AND ")}`;
    }

    try {
      const result = await this.client.executeStatement(sql, params);
      return { count: result.numberOfRecordsUpdated || 0 };
    } catch (error: any) {
      console.error(`[DataAPI] Error in updateMany for ${this.tableName}:`, error);
      console.error(`[DataAPI] SQL: ${sql}`);
      throw new Error(`Failed to update ${this.tableName}: ${error.message}`);
    }
  }

  /**
   * Delete records
   */
  async delete(args: {
    where: Record<string, any>;
  }): Promise<T> {
    const whereFields = Object.keys(args.where);
    const params = whereFields.map((field, i) =>
      AuroraDataAPI.buildParameter(`param${i}`, args.where[field])
    );

    const whereClauses = whereFields.map(
      (field, i) => `"${field}" = :param${i}`
    );

    const sql = `
      DELETE FROM "${this.tableName}"
      WHERE ${whereClauses.join(" AND ")}
      RETURNING *
    `;

    const result = await this.client.executeStatement(sql, params);
    return result.records[0] as T;
  }

  /**
   * Delete many records
   */
  async deleteMany(args?: {
    where?: Record<string, any>;
  }): Promise<{ count: number }> {
    let sql = `DELETE FROM "${this.tableName}"`;
    const params: SqlParameter[] = [];

    if (args?.where) {
      const whereFields = Object.keys(args.where);
      const whereClauses = whereFields.map((field, i) => {
        params.push(AuroraDataAPI.buildParameter(`param${i}`, args.where![field]));
        return `"${field}" = :param${i}`;
      });
      sql += ` WHERE ${whereClauses.join(" AND ")}`;
    }

    const result = await this.client.executeStatement(sql, params);
    return { count: result.numberOfRecordsUpdated || 0 };
  }

  /**
   * Count records
   */
  async count(args?: {
    where?: Record<string, any>;
  }): Promise<number> {
    let sql = `SELECT COUNT(*) as count FROM "${this.tableName}"`;
    const params: SqlParameter[] = [];
    const conditions: string[] = [];

    if (args?.where) {
      Object.entries(args.where).forEach(([key, value], index) => {
        if (value === null) {
          conditions.push(`"${key}" IS NULL`);
        } else if (value !== undefined && typeof value === 'object' && 'not' in value) {
          conditions.push(`"${key}" IS NOT NULL`);
        } else if (value !== undefined && typeof value === 'object' && 'gte' in value) {
          conditions.push(`"${key}" >= :param${index}`);
          params.push(AuroraDataAPI.buildParameter(`param${index}`, value.gte));
        } else if (value !== undefined && typeof value === 'object' && 'lte' in value) {
          conditions.push(`"${key}" <= :param${index}`);
          params.push(AuroraDataAPI.buildParameter(`param${index}`, value.lte));
        } else if (value !== undefined && typeof value === 'object' && 'gt' in value) {
          conditions.push(`"${key}" > :param${index}`);
          params.push(AuroraDataAPI.buildParameter(`param${index}`, value.gt));
        } else if (value !== undefined && typeof value === 'object' && 'lt' in value) {
          conditions.push(`"${key}" < :param${index}`);
          params.push(AuroraDataAPI.buildParameter(`param${index}`, value.lt));
        } else if (value !== undefined && typeof value === 'object' && 'in' in value) {
          const inValues = value.in;
          if (Array.isArray(inValues) && inValues.length > 0) {
            const placeholders = inValues.map((_, i) => `:param${index}_${i}`);
            // Check if this field is an enum type that needs casting
            // Must include 'status' for RaffleStatus, MysteryBoxStatus, etc.
            const enumFields = ['type', 'changeType', 'triggerType', 'storeCurrency', 'currencyDisplayType',
                               'evaluationPeriod', 'financialStatus', 'fulfillmentStatus', 'status',
                               'purchaseType', 'duration', 'currency', 'billingInterval', 'deliveryInterval',
                               'lastPaymentStatus', 'discountType', 'eventType'];
            if (enumFields.includes(key)) {
              // Cast enum types explicitly for PostgreSQL
              conditions.push(`"${key}"::text IN (${placeholders.join(', ')})`);
            } else {
              conditions.push(`"${key}" IN (${placeholders.join(', ')})`);
            }
            inValues.forEach((val, i) => {
              params.push(AuroraDataAPI.buildParameter(`param${index}_${i}`, val));
            });
          }
        } else if (value !== undefined) {
          // Check if this field is an enum type that needs casting
          const enumFields = ['type', 'changeType', 'triggerType', 'storeCurrency', 'currencyDisplayType',
                             'evaluationPeriod', 'purchaseType', 'duration', 'currency', 'status',
                             'billingInterval', 'deliveryInterval', 'financialStatus', 'fulfillmentStatus',
                             'lastPaymentStatus', 'discountType', 'eventType'];
          if (enumFields.includes(key)) {
            // Cast enum types explicitly for PostgreSQL
            conditions.push(`"${key}"::text = :param${index}`);
          } else {
            conditions.push(`"${key}" = :param${index}`);
          }
          params.push(AuroraDataAPI.buildParameter(`param${index}`, value));
        }
      });

      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(" AND ")}`;
      }
    }

    const result = await this.client.executeStatement(sql, params);
    return result.records[0]?.count || 0;
  }

  /**
   * Aggregate operations
   */
  async aggregate(args: {
    where?: Record<string, any>;
    _count?: boolean | { [key: string]: any };
    _sum?: Record<string, boolean>;
    _avg?: Record<string, boolean>;
    _min?: Record<string, boolean>;
    _max?: Record<string, boolean>;
  }): Promise<any> {
    const aggregates: string[] = [];

    // Handle _count - can be boolean or object with field names
    if (args._count) {
      if (typeof args._count === 'boolean') {
        aggregates.push('COUNT(*) as "_count"');
      } else if (typeof args._count === 'object') {
        Object.keys(args._count).forEach((field) => {
          aggregates.push(`COUNT("${field}") as "_count_${field}"`);
        });
      }
    }

    ["_sum", "_avg", "_min", "_max"].forEach((op) => {
      const fields = args[op as keyof typeof args];
      if (fields && typeof fields === "object") {
        Object.keys(fields).forEach((field) => {
          const func = op.substring(1).toUpperCase();
          aggregates.push(`${func}("${field}") as "${op}_${field}"`);
        });
      }
    });

    if (aggregates.length === 0) {
      aggregates.push('COUNT(*) as "_count"');
    }

    let sql = `SELECT ${aggregates.join(", ")} FROM "${this.tableName}"`;
    const params: SqlParameter[] = [];
    const conditions: string[] = [];

    if (args.where) {
      Object.entries(args.where).forEach(([key, value], index) => {
        // Check if this is a timestamp field
        const isTimestampField = ['createdAt', 'updatedAt', 'expires', 'processedAt', 
                                  'currentPeriodStart', 'currentPeriodEnd', 'startedAt', 
                                  'finishedAt', 'lastCapAlert'].includes(key);
        
        if (value === null) {
          conditions.push(`"${key}" IS NULL`);
        } else if (value !== undefined && typeof value === 'object' && 'not' in value) {
          conditions.push(`"${key}" IS NOT NULL`);
        } else if (value !== undefined && typeof value === 'object' && 'gte' in value) {
          // Apply timestamp casting for timestamp fields
          if (isTimestampField) {
            conditions.push(`"${key}" >= :param${index}::timestamp`);
          } else {
            conditions.push(`"${key}" >= :param${index}`);
          }
          params.push(AuroraDataAPI.buildParameter(`param${index}`, value.gte));
        } else if (value !== undefined && typeof value === 'object' && 'lte' in value) {
          // Apply timestamp casting for timestamp fields
          if (isTimestampField) {
            conditions.push(`"${key}" <= :param${index}::timestamp`);
          } else {
            conditions.push(`"${key}" <= :param${index}`);
          }
          params.push(AuroraDataAPI.buildParameter(`param${index}`, value.lte));
        } else if (value !== undefined && typeof value === 'object' && 'gt' in value) {
          // Apply timestamp casting for timestamp fields
          if (isTimestampField) {
            conditions.push(`"${key}" > :param${index}::timestamp`);
          } else {
            conditions.push(`"${key}" > :param${index}`);
          }
          params.push(AuroraDataAPI.buildParameter(`param${index}`, value.gt));
        } else if (value !== undefined && typeof value === 'object' && 'lt' in value) {
          // Apply timestamp casting for timestamp fields
          if (isTimestampField) {
            conditions.push(`"${key}" < :param${index}::timestamp`);
          } else {
            conditions.push(`"${key}" < :param${index}`);
          }
          params.push(AuroraDataAPI.buildParameter(`param${index}`, value.lt));
        } else if (value !== undefined && typeof value === 'object' && 'in' in value) {
          const inValues = value.in;
          if (Array.isArray(inValues) && inValues.length > 0) {
            const placeholders = inValues.map((_, i) => `:param${index}_${i}`);
            // Check if this field is an enum type that needs casting
            // Must include 'status' for RaffleStatus, MysteryBoxStatus, etc.
            const enumFields = ['type', 'changeType', 'triggerType', 'storeCurrency', 'currencyDisplayType',
                               'evaluationPeriod', 'financialStatus', 'fulfillmentStatus', 'status',
                               'purchaseType', 'duration', 'currency', 'billingInterval', 'deliveryInterval',
                               'lastPaymentStatus', 'discountType', 'eventType'];
            if (enumFields.includes(key)) {
              // Cast enum types explicitly for PostgreSQL
              conditions.push(`"${key}"::text IN (${placeholders.join(', ')})`);
            } else {
              conditions.push(`"${key}" IN (${placeholders.join(', ')})`);
            }
            inValues.forEach((val, i) => {
              params.push(AuroraDataAPI.buildParameter(`param${index}_${i}`, val));
            });
          }
        } else if (value !== undefined) {
          // Check if this field is an enum type that needs casting
          const enumFields = ['type', 'changeType', 'triggerType', 'storeCurrency', 'currencyDisplayType',
                             'evaluationPeriod', 'purchaseType', 'duration', 'currency', 'status',
                             'billingInterval', 'deliveryInterval', 'financialStatus', 'fulfillmentStatus',
                             'lastPaymentStatus', 'discountType', 'eventType'];
          if (enumFields.includes(key)) {
            // Cast enum types explicitly for PostgreSQL
            conditions.push(`"${key}"::text = :param${index}`);
          } else {
            conditions.push(`"${key}" = :param${index}`);
          }
          params.push(AuroraDataAPI.buildParameter(`param${index}`, value));
        }
      });

      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(" AND ")}`;
      }
    }

    const result = await this.client.executeStatement(sql, params);
    const record = result.records[0] || {};

    // Format the response to match Prisma's structure
    const response: any = {};

    if (args._count) {
      if (typeof args._count === 'boolean') {
        response._count = parseInt(record._count || '0');
      } else if (typeof args._count === 'object') {
        response._count = {};
        Object.keys(args._count).forEach(field => {
          const value = record[`_count_${field}`];
          response._count[field] = value !== null && value !== undefined ? parseInt(value) : 0;
        });
      }
    }
    
    if (args._sum) {
      response._sum = {};
      Object.keys(args._sum).forEach(field => {
        const value = record[`_sum_${field}`];
        response._sum[field] = value !== null ? parseFloat(value) : null;
      });
    }
    
    if (args._avg) {
      response._avg = {};
      Object.keys(args._avg).forEach(field => {
        const value = record[`_avg_${field}`];
        response._avg[field] = value !== null ? parseFloat(value) : null;
      });
    }
    
    if (args._min) {
      response._min = {};
      Object.keys(args._min).forEach(field => {
        response._min[field] = record[`_min_${field}`];
      });
    }
    
    if (args._max) {
      response._max = {};
      Object.keys(args._max).forEach(field => {
        response._max[field] = record[`_max_${field}`];
      });
    }
    
    return response;
  }

  /**
   * Group by operation with aggregation
   */
  async groupBy(args: {
    by: string[];
    where?: Record<string, any>;
    _sum?: Record<string, boolean>;
    _count?: boolean | Record<string, boolean>;
    _avg?: Record<string, boolean>;
    _min?: Record<string, boolean>;
    _max?: Record<string, boolean>;
  }): Promise<any[]> {
    const groupByFields = args.by.map(f => `"${f}"`).join(', ');
    const selectFields: string[] = [...args.by.map(f => `"${f}"`)];

    // Add aggregations
    if (args._sum) {
      Object.keys(args._sum).forEach(field => {
        selectFields.push(`SUM("${field}") as "_sum_${field}"`);
      });
    }
    if (args._count) {
      if (typeof args._count === 'boolean') {
        selectFields.push('COUNT(*) as "_count"');
      } else {
        Object.keys(args._count).forEach(field => {
          selectFields.push(`COUNT("${field}") as "_count_${field}"`);
        });
      }
    }
    if (args._avg) {
      Object.keys(args._avg).forEach(field => {
        selectFields.push(`AVG("${field}") as "_avg_${field}"`);
      });
    }
    if (args._min) {
      Object.keys(args._min).forEach(field => {
        selectFields.push(`MIN("${field}") as "_min_${field}"`);
      });
    }
    if (args._max) {
      Object.keys(args._max).forEach(field => {
        selectFields.push(`MAX("${field}") as "_max_${field}"`);
      });
    }

    let sql = `SELECT ${selectFields.join(', ')} FROM "${this.tableName}"`;
    const params: SqlParameter[] = [];
    const conditions: string[] = [];

    // Build WHERE clause (with full operator support like aggregate)
    if (args.where) {
      Object.entries(args.where).forEach(([key, value], index) => {
        // Check if this is a timestamp field
        const isTimestampField = ['createdAt', 'updatedAt', 'expires', 'processedAt',
                                  'currentPeriodStart', 'currentPeriodEnd', 'startedAt',
                                  'finishedAt', 'lastCapAlert', 'expiresAt'].includes(key);

        if (value === null) {
          conditions.push(`"${key}" IS NULL`);
        } else if (value !== undefined && typeof value === 'object' && 'not' in value) {
          conditions.push(`"${key}" IS NOT NULL`);
        } else if (value !== undefined && typeof value === 'object' && 'gte' in value) {
          // Apply timestamp casting for timestamp fields
          if (isTimestampField) {
            conditions.push(`"${key}" >= :param${index}::timestamp`);
          } else {
            conditions.push(`"${key}" >= :param${index}`);
          }
          params.push(AuroraDataAPI.buildParameter(`param${index}`, value.gte));
        } else if (value !== undefined && typeof value === 'object' && 'lte' in value) {
          // Apply timestamp casting for timestamp fields
          if (isTimestampField) {
            conditions.push(`"${key}" <= :param${index}::timestamp`);
          } else {
            conditions.push(`"${key}" <= :param${index}`);
          }
          params.push(AuroraDataAPI.buildParameter(`param${index}`, value.lte));
        } else if (value !== undefined && typeof value === 'object' && 'gt' in value) {
          // Apply timestamp casting for timestamp fields
          if (isTimestampField) {
            conditions.push(`"${key}" > :param${index}::timestamp`);
          } else {
            conditions.push(`"${key}" > :param${index}`);
          }
          params.push(AuroraDataAPI.buildParameter(`param${index}`, value.gt));
        } else if (value !== undefined && typeof value === 'object' && 'lt' in value) {
          // Apply timestamp casting for timestamp fields
          if (isTimestampField) {
            conditions.push(`"${key}" < :param${index}::timestamp`);
          } else {
            conditions.push(`"${key}" < :param${index}`);
          }
          params.push(AuroraDataAPI.buildParameter(`param${index}`, value.lt));
        } else if (value !== undefined && typeof value === 'object' && 'in' in value) {
          const inValues = value.in;
          if (Array.isArray(inValues) && inValues.length > 0) {
            const placeholders = inValues.map((_, i) => `:param${index}_${i}`);
            conditions.push(`"${key}" IN (${placeholders.join(', ')})`);
            inValues.forEach((val, i) => {
              params.push(AuroraDataAPI.buildParameter(`param${index}_${i}`, val));
            });
          }
        } else if (value !== undefined) {
          // Check if this field is an enum type that needs casting
          const enumFields = ['type', 'changeType', 'triggerType', 'storeCurrency', 'currencyDisplayType',
                             'evaluationPeriod', 'purchaseType', 'duration', 'currency', 'status',
                             'billingInterval', 'deliveryInterval', 'financialStatus', 'fulfillmentStatus',
                             'lastPaymentStatus', 'discountType', 'eventType'];
          if (enumFields.includes(key)) {
            // Cast enum types explicitly for PostgreSQL
            conditions.push(`"${key}"::text = :param${index}`);
          } else {
            conditions.push(`"${key}" = :param${index}`);
          }
          params.push(AuroraDataAPI.buildParameter(`param${index}`, value));
        }
      });

      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
    }

    sql += ` GROUP BY ${groupByFields}`;

    try {
      const result = await this.client.executeStatement(sql, params);

      // Format the response to match Prisma's structure
      return result.records.map((record: any) => {
        const formatted: any = {};

        // Add group by fields
        args.by.forEach(field => {
          formatted[field] = record[field];
        });

        // Add aggregations
        if (args._sum) {
          formatted._sum = {};
          Object.keys(args._sum).forEach(field => {
            const value = record[`_sum_${field}`];
            formatted._sum[field] = value !== null ? Number(value) : null;
          });
        }
        if (args._count) {
          if (typeof args._count === 'boolean') {
            formatted._count = parseInt(record._count || '0');
          } else {
            formatted._count = {};
            Object.keys(args._count).forEach(field => {
              formatted._count[field] = parseInt(record[`_count_${field}`] || '0');
            });
          }
        }
        if (args._avg) {
          formatted._avg = {};
          Object.keys(args._avg).forEach(field => {
            const value = record[`_avg_${field}`];
            formatted._avg[field] = value !== null ? parseFloat(value) : null;
          });
        }
        if (args._min) {
          formatted._min = {};
          Object.keys(args._min).forEach(field => {
            formatted._min[field] = record[`_min_${field}`];
          });
        }
        if (args._max) {
          formatted._max = {};
          Object.keys(args._max).forEach(field => {
            formatted._max[field] = record[`_max_${field}`];
          });
        }

        return formatted;
      });
    } catch (error: any) {
      console.error(`[DataAPI] Error in groupBy for ${this.tableName}:`, error);
      console.error(`[DataAPI] SQL: ${sql}`);
      throw new Error(`Failed to groupBy ${this.tableName}: ${error.message}`);
    }
  }

  /**
   * Upsert operation - insert or update
   */
  async upsert(args: {
    where: Record<string, any>;
    update: Record<string, any>;
    create: Record<string, any>;
  }): Promise<T> {
    // First try to find the record
    // Note: findUnique already handles composite keys
    const existing = await this.findUnique({ where: args.where });

    if (existing) {
      // For update, we need to handle composite keys in the where clause
      let whereClause = args.where;

      // Check for specific composite key patterns
      if ('orderId_shopifyLineItemId' in whereClause) {
        // Handle OrderLineItem composite key
        const composite = whereClause.orderId_shopifyLineItemId;
        whereClause = {
          orderId: composite.orderId,
          shopifyLineItemId: composite.shopifyLineItemId
        };
      } else if ('shop_shopifyOrderId' in whereClause) {
        // Handle Order composite key (might come as object)
        const composite = whereClause.shop_shopifyOrderId;
        if (typeof composite === 'object' && composite !== null) {
          whereClause = {
            shop: composite.shop,
            shopifyOrderId: composite.shopifyOrderId
          };
        } else if (typeof composite === 'string') {
          // Try to parse if it's JSON
          try {
            const parsed = JSON.parse(composite);
            whereClause = {
              shop: parsed.shop,
              shopifyOrderId: parsed.shopifyOrderId
            };
          } catch (e) {
            // Keep original whereClause
          }
        }
      } else if ('shop_year_month' in whereClause) {
        // Handle MonthlyOrderUsage composite key
        const composite = whereClause.shop_year_month;
        if (typeof composite === 'object' && composite !== null) {
          whereClause = {
            shop: composite.shop,
            year: composite.year,
            month: composite.month
          };
        } else if (typeof composite === 'string') {
          // Try to parse if it's JSON
          try {
            const parsed = JSON.parse(composite);
            whereClause = {
              shop: parsed.shop,
              year: parsed.year,
              month: parsed.month
            };
          } catch (e) {
            // Keep original whereClause
          }
        }
      }

      // Update the existing record using the correct primary key
      // Some models use 'shop' as the primary key instead of 'id'
      const modelsWithShopAsPrimaryKey = ['EmailSettings', 'ShopSettings'];
      let updateWhere: Record<string, any>;

      if (modelsWithShopAsPrimaryKey.includes(this.tableName)) {
        updateWhere = { shop: (existing as any).shop };
      } else if ((existing as any).id) {
        updateWhere = { id: (existing as any).id };
      } else {
        // Fall back to using the original where clause
        updateWhere = whereClause;
      }

      return await this.update({
        where: updateWhere,
        data: args.update
      });
    } else {
      // Create a new record
      return await this.create({
        data: args.create
      });
    }
  }
}

/**
 * Creates a Prisma-compatible client using Data API
 */
export function createDataAPIPrismaClient() {
  console.log("[prisma-data-api-adapter] Creating Data API Prisma client...");

  const client = getAuroraClient();
  console.log("[prisma-data-api-adapter] Aurora client obtained");

  console.log("[prisma-data-api-adapter] Building model proxies including Points models...");

  const dbClient = {
    // Transaction support
    $transaction: async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
      return client.executeTransaction(async (execute) => {
        // Create a transaction-aware client that uses the transaction's execute function
        const txAuroraClient = {
          ...client,
          executeStatement: execute  // Override executeStatement to use transaction
        };

        // Create transaction context with all model proxies using the transaction client
        const txClient = {
          // Model proxies using transaction-aware client
          session: new DataAPIModelProxy("Session", txAuroraClient),
          shopSettings: new DataAPIModelProxy("ShopSettings", txAuroraClient),
          tier: new DataAPIModelProxy("Tier", txAuroraClient),
          tierProduct: new DataAPIModelProxy("TierProduct", txAuroraClient),
          customer: new DataAPIModelProxy("Customer", txAuroraClient),
          storeCreditLedger: new DataAPIModelProxy("StoreCreditLedger", txAuroraClient),
          tierChangeLog: new DataAPIModelProxy("TierChangeLog", txAuroraClient),
          // billingPlan removed - legacy REST API billing
          usageRecord: new DataAPIModelProxy("UsageRecord", txAuroraClient),
          billingHistory: new DataAPIModelProxy("BillingHistory", txAuroraClient),
          notification: new DataAPIModelProxy("Notification", txAuroraClient),
          monthlyOrderUsage: new DataAPIModelProxy("MonthlyOrderUsage", txAuroraClient),
          monthlyEmailUsage: new DataAPIModelProxy("MonthlyEmailUsage", txAuroraClient),
          order: new DataAPIModelProxy("Order", txAuroraClient),
          orderLineItem: new DataAPIModelProxy("OrderLineItem", txAuroraClient),
          orderRefund: new DataAPIModelProxy("OrderRefund", txAuroraClient),
          orderRefundLineItem: new DataAPIModelProxy("OrderRefundLineItem", txAuroraClient),
          tierSubscription: new DataAPIModelProxy("TierSubscription", txAuroraClient),
          subscriptionBillingAttempt: new DataAPIModelProxy("SubscriptionBillingAttempt", txAuroraClient),
          sellingPlanGroup: new DataAPIModelProxy("SellingPlanGroup", txAuroraClient),
          sellingPlan: new DataAPIModelProxy("SellingPlan", txAuroraClient),
          subscriptionPricingHistory: new DataAPIModelProxy("SubscriptionPricingHistory", txAuroraClient),
          subscriptionPricingConfig: new DataAPIModelProxy("SubscriptionPricingConfig", txAuroraClient),
          subscriptionRetry: new DataAPIModelProxy("SubscriptionRetry", txAuroraClient),
          subscriptionEvent: new DataAPIModelProxy("SubscriptionEvent", txAuroraClient),
          webhookProcess: new DataAPIModelProxy("WebhookProcess", txAuroraClient),
          webhookError: new DataAPIModelProxy("WebhookError", txAuroraClient),
          webhookProcessed: new DataAPIModelProxy("WebhookProcessed", txAuroraClient),
          deadLetterQueue: new DataAPIModelProxy("DeadLetterQueue", txAuroraClient),
          tierPurchase: new DataAPIModelProxy("TierPurchase", txAuroraClient),
          customerTierState: new DataAPIModelProxy("CustomerTierState", txAuroraClient),
          bulkOperationLog: new DataAPIModelProxy("BulkOperationLog", txAuroraClient),
          syncStatus: new DataAPIModelProxy("SyncStatus", txAuroraClient),
          billingAuditLog: new DataAPIModelProxy("BillingAuditLog", txAuroraClient),
          billingSubscription: new DataAPIModelProxy("BillingSubscription", txAuroraClient),
          appSubscription: new DataAPIModelProxy("AppSubscription", txAuroraClient),
          shopEntitlements: new DataAPIModelProxy("ShopEntitlements", txAuroraClient),

          // Marketing and Analytics models
          emailTemplate: new DataAPIModelProxy("EmailTemplate", txAuroraClient),
          emailCampaign: new DataAPIModelProxy("EmailCampaign", txAuroraClient),
          emailAutomation: new DataAPIModelProxy("EmailAutomation", txAuroraClient),
          emailSettings: new DataAPIModelProxy("EmailSettings", txAuroraClient),
          emailEvent: new DataAPIModelProxy("EmailEvent", txAuroraClient),
          sendGridDomain: new DataAPIModelProxy("SendGridDomain", txAuroraClient),
          analyticsRecommendation: new DataAPIModelProxy("AnalyticsRecommendation", txAuroraClient),
          exchangeRate: new DataAPIModelProxy("ExchangeRate", txAuroraClient),

          // Klaviyo Integration models
          klaviyoProfile: new DataAPIModelProxy("KlaviyoProfile", txAuroraClient),
          klaviyoEvent: new DataAPIModelProxy("KlaviyoEvent", txAuroraClient),
          klaviyoList: new DataAPIModelProxy("KlaviyoList", txAuroraClient),
          klaviyoAutomationSettings: new DataAPIModelProxy("KlaviyoAutomationSettings", txAuroraClient),

          // Sync Job models
          customerSyncJob: new DataAPIModelProxy("CustomerSyncJob", txAuroraClient),
          storeCreditSyncJob: new DataAPIModelProxy("StoreCreditSyncJob", txAuroraClient),
          orderSyncJob: new DataAPIModelProxy("OrderSyncJob", txAuroraClient),

          // Trial abuse prevention
          tierTrialAuditLog: new DataAPIModelProxy("TierTrialAuditLog", txAuroraClient),

          // Points Engagement System
          pointsConfig: new DataAPIModelProxy("PointsConfig", txAuroraClient),
          pointsLedger: new DataAPIModelProxy("PointsLedger", txAuroraClient),

          // Raffles System
          raffle: new DataAPIModelProxy("Raffle", txAuroraClient),
          rafflePrize: new DataAPIModelProxy("RafflePrize", txAuroraClient),
          raffleEntry: new DataAPIModelProxy("RaffleEntry", txAuroraClient),
          raffleWinner: new DataAPIModelProxy("RaffleWinner", txAuroraClient),
          raffleStreak: new DataAPIModelProxy("RaffleStreak", txAuroraClient),
          raffleInstantWin: new DataAPIModelProxy("RaffleInstantWin", txAuroraClient),
          raffleInstantWinLog: new DataAPIModelProxy("RaffleInstantWinLog", txAuroraClient),
          raffleActivity: new DataAPIModelProxy("RaffleActivity", txAuroraClient),
          raffleBonusEvent: new DataAPIModelProxy("RaffleBonusEvent", txAuroraClient),
          raffleBonusEventUsage: new DataAPIModelProxy("RaffleBonusEventUsage", txAuroraClient),
          raffleLuckyNumber: new DataAPIModelProxy("RaffleLuckyNumber", txAuroraClient),

          // Mystery Box System
          mysteryBox: new DataAPIModelProxy("MysteryBox", txAuroraClient),
          mysteryBoxReward: new DataAPIModelProxy("MysteryBoxReward", txAuroraClient),
          mysteryBoxOpen: new DataAPIModelProxy("MysteryBoxOpen", txAuroraClient),
          mysteryBoxWinner: new DataAPIModelProxy("MysteryBoxWinner", txAuroraClient),
          mysteryBoxStreak: new DataAPIModelProxy("MysteryBoxStreak", txAuroraClient),
          mysteryBoxActivity: new DataAPIModelProxy("MysteryBoxActivity", txAuroraClient),
          mysteryBoxBonusEvent: new DataAPIModelProxy("MysteryBoxBonusEvent", txAuroraClient),
          mysteryBoxBonusEventUsage: new DataAPIModelProxy("MysteryBoxBonusEventUsage", txAuroraClient),

          // Challenge/Mission System
          challenge: new DataAPIModelProxy("Challenge", txAuroraClient),
          challengeReward: new DataAPIModelProxy("ChallengeReward", txAuroraClient),
          challengeParticipant: new DataAPIModelProxy("ChallengeParticipant", txAuroraClient),
          challengeProgressLog: new DataAPIModelProxy("ChallengeProgressLog", txAuroraClient),
          missionTemplate: new DataAPIModelProxy("MissionTemplate", txAuroraClient),
          customerMissionStats: new DataAPIModelProxy("CustomerMissionStats", txAuroraClient),
          missionCompletionEvent: new DataAPIModelProxy("MissionCompletionEvent", txAuroraClient),

          // Third-Party Integration System
          integration: new DataAPIModelProxy("Integration", txAuroraClient),
          integrationEvent: new DataAPIModelProxy("IntegrationEvent", txAuroraClient),
          integrationWebhook: new DataAPIModelProxy("IntegrationWebhook", txAuroraClient),
          oAuthState: new DataAPIModelProxy("OAuthState", txAuroraClient),
          integrationPointsRule: new DataAPIModelProxy("IntegrationPointsRule", txAuroraClient),

          // Gift Card System
          giftCardConfig: new DataAPIModelProxy("GiftCardConfig", txAuroraClient),
          tierGiftCardSettings: new DataAPIModelProxy("TierGiftCardSettings", txAuroraClient),
          issuedGiftCard: new DataAPIModelProxy("IssuedGiftCard", txAuroraClient),
          giftCardBundle: new DataAPIModelProxy("GiftCardBundle", txAuroraClient),

          // AI Feedback System
          aISession: new DataAPIModelProxy("AISession", txAuroraClient),
          aISessionAction: new DataAPIModelProxy("AISessionAction", txAuroraClient),
          aISessionFeedback: new DataAPIModelProxy("AISessionFeedback", txAuroraClient),
          aICodeMetric: new DataAPIModelProxy("AICodeMetric", txAuroraClient),
          aILearningPattern: new DataAPIModelProxy("AILearningPattern", txAuroraClient),
          aICodeQualitySignal: new DataAPIModelProxy("AICodeQualitySignal", txAuroraClient),
          aIArchitectureHealth: new DataAPIModelProxy("AIArchitectureHealth", txAuroraClient),
          aIInnovationTracker: new DataAPIModelProxy("AIInnovationTracker", txAuroraClient),

          // Raw query support for the transaction
          $executeRaw: async (sql: any, ...params: any[]) => {
            // Handle Prisma template literal syntax
            if (typeof sql === 'object' && sql.strings) {
              const query = sql.strings.join('?');
              const result = await execute(query, []);
              return result.numberOfRecordsUpdated || 0;
            }
            const result = await execute(sql, params);
            return result.numberOfRecordsUpdated || 0;
          },
          $queryRaw: async (sql: any, ...params: any[]) => {
            // Handle Prisma template literal syntax
            if (typeof sql === 'object' && sql.strings) {
              const query = sql.strings.join('?');
              const values = sql.values || [];

              // Debug logging for search queries
              console.log('[Data API Adapter] $queryRaw (transaction) - Template literal detected');
              console.log('[Data API Adapter] SQL template strings:', sql.strings);
              console.log('[Data API Adapter] SQL values:', values);
              console.log('[Data API Adapter] Constructed query:', query);
              console.log('[Data API Adapter] Values count:', values.length);

              // Convert plain values to SqlParameter format
              const sqlParameters = values.map((value: any, index: number) =>
                AuroraDataAPI.buildParameter(`param${index}`, value)
              );

              console.log('[Data API Adapter] Formatted SQL parameters:', sqlParameters);

              try {
                const result = await execute(query, sqlParameters);

                console.log('[Data API Adapter] Query executed successfully');
                console.log('[Data API Adapter] Records returned:', result.records?.length ?? 0);

                return result.records;
              } catch (error: any) {
                console.error('[Data API Adapter] Transaction query execution FAILED');
                console.error('[Data API Adapter] Error name:', error.name);
                console.error('[Data API Adapter] Error message:', error.message);
                console.error('[Data API Adapter] Query that failed:', query);
                console.error('[Data API Adapter] Values that failed:', values);
                console.error('[Data API Adapter] Formatted parameters:', sqlParameters);
                console.error('[Data API Adapter] Full error:', error);
                throw error;
              }
            }
            const result = await execute(sql, params);
            return result.records;
          },
        };
        return fn(txClient);
      });
    },

    // Raw query support
    $executeRaw: async (sql: any, ...params: any[]) => {
      console.log("$executeRaw called with:", { sql, params, type: typeof sql });
      
      // Handle Prisma template literal syntax
      if (typeof sql === 'object' && sql !== null) {
        console.log("SQL object keys:", Object.keys(sql));
        console.log("SQL object:", JSON.stringify(sql, null, 2));
        
        // Check for Prisma's raw query format
        if (sql.text || sql.sql) {
          const query = sql.text || sql.sql;
          const result = await client.executeStatement(query, sql.values || []);
          return result.numberOfRecordsUpdated || 0;
        }
        
        // Check for template literal format
        if (sql.strings) {
          const query = sql.strings.join('?');
          const result = await client.executeStatement(query, sql.values || []);
          return result.numberOfRecordsUpdated || 0;
        }
        
        throw new Error("Unsupported SQL format for $executeRaw");
      }
      
      // Regular string query
      const result = await client.executeStatement(sql, params);
      return result.numberOfRecordsUpdated || 0;
    },

    $queryRaw: async (sql: any, ...params: any[]) => {
      // Handle Prisma template literal syntax
      if (typeof sql === 'object' && sql.strings) {
        const query = sql.strings.join('?');
        const values = sql.values || [];

        // Debug logging for search queries
        console.log('[Data API Adapter] $queryRaw (main) - Template literal detected');
        console.log('[Data API Adapter] SQL template strings:', sql.strings);
        console.log('[Data API Adapter] SQL values:', values);
        console.log('[Data API Adapter] Constructed query:', query);
        console.log('[Data API Adapter] Values count:', values.length);

        // Convert plain values to SqlParameter format
        const sqlParameters = values.map((value: any, index: number) =>
          AuroraDataAPI.buildParameter(`param${index}`, value)
        );

        console.log('[Data API Adapter] Formatted SQL parameters:', sqlParameters);

        try {
          const result = await client.executeStatement(query, sqlParameters);

          console.log('[Data API Adapter] Query executed successfully');
          console.log('[Data API Adapter] Records returned:', result.records?.length ?? 0);

          return result.records;
        } catch (error: any) {
          console.error('[Data API Adapter] Query execution FAILED');
          console.error('[Data API Adapter] Error name:', error.name);
          console.error('[Data API Adapter] Error message:', error.message);
          console.error('[Data API Adapter] Query that failed:', query);
          console.error('[Data API Adapter] Values that failed:', values);
          console.error('[Data API Adapter] Formatted parameters:', sqlParameters);
          console.error('[Data API Adapter] Full error:', error);
          throw error;
        }
      }
      const result = await client.executeStatement(sql, params);
      return result.records;
    },

    // Model proxies - All models from schema.prisma
    session: new DataAPIModelProxy("Session", client),
    shopSettings: new DataAPIModelProxy("ShopSettings", client),
    tier: new DataAPIModelProxy("Tier", client),
    tierProduct: new DataAPIModelProxy("TierProduct", client),
    customer: new DataAPIModelProxy("Customer", client),
    storeCreditLedger: new DataAPIModelProxy("StoreCreditLedger", client),
    tierChangeLog: new DataAPIModelProxy("TierChangeLog", client),
    // billingPlan removed - legacy REST API billing
    usageRecord: new DataAPIModelProxy("UsageRecord", client),
    billingHistory: new DataAPIModelProxy("BillingHistory", client),
    notification: new DataAPIModelProxy("Notification", client),
    monthlyOrderUsage: new DataAPIModelProxy("MonthlyOrderUsage", client),
    monthlyEmailUsage: new DataAPIModelProxy("MonthlyEmailUsage", client),

    // Order models
    order: new DataAPIModelProxy("Order", client),
    orderLineItem: new DataAPIModelProxy("OrderLineItem", client),
    orderRefund: new DataAPIModelProxy("OrderRefund", client),
    orderRefundLineItem: new DataAPIModelProxy("OrderRefundLineItem", client),
    tierSubscription: new DataAPIModelProxy("TierSubscription", client),
    subscriptionBillingAttempt: new DataAPIModelProxy("SubscriptionBillingAttempt", client),
    sellingPlanGroup: new DataAPIModelProxy("SellingPlanGroup", client),
    sellingPlan: new DataAPIModelProxy("SellingPlan", client),
    subscriptionPricingHistory: new DataAPIModelProxy("SubscriptionPricingHistory", client),
    subscriptionPricingConfig: new DataAPIModelProxy("SubscriptionPricingConfig", client),
    subscriptionRetry: new DataAPIModelProxy("SubscriptionRetry", client),
    subscriptionEvent: new DataAPIModelProxy("SubscriptionEvent", client),
    webhookProcess: new DataAPIModelProxy("WebhookProcess", client),
    webhookError: new DataAPIModelProxy("WebhookError", client),
    webhookProcessed: new DataAPIModelProxy("WebhookProcessed", client),
    deadLetterQueue: new DataAPIModelProxy("DeadLetterQueue", client),
    tierPurchase: new DataAPIModelProxy("TierPurchase", client),
    customerTierState: new DataAPIModelProxy("CustomerTierState", client),
    bulkOperationLog: new DataAPIModelProxy("BulkOperationLog", client),
    syncStatus: new DataAPIModelProxy("SyncStatus", client),
    billingAuditLog: new DataAPIModelProxy("BillingAuditLog", client),
    billingSubscription: new DataAPIModelProxy("BillingSubscription", client),
    appSubscription: new DataAPIModelProxy("AppSubscription", client),
    shopEntitlements: new DataAPIModelProxy("ShopEntitlements", client),

    // Marketing and Analytics models
    emailTemplate: new DataAPIModelProxy("EmailTemplate", client),
    emailCampaign: new DataAPIModelProxy("EmailCampaign", client),
    emailAutomation: new DataAPIModelProxy("EmailAutomation", client),
    emailSettings: new DataAPIModelProxy("EmailSettings", client),
    emailEvent: new DataAPIModelProxy("EmailEvent", client),
    sendGridDomain: new DataAPIModelProxy("SendGridDomain", client),
    analyticsRecommendation: new DataAPIModelProxy("AnalyticsRecommendation", client),
    exchangeRate: new DataAPIModelProxy("ExchangeRate", client),

    // Klaviyo Integration models
    klaviyoProfile: new DataAPIModelProxy("KlaviyoProfile", client),
    klaviyoEvent: new DataAPIModelProxy("KlaviyoEvent", client),
    klaviyoList: new DataAPIModelProxy("KlaviyoList", client),
    klaviyoAutomationSettings: new DataAPIModelProxy("KlaviyoAutomationSettings", client),

    // Sync Job models
    customerSyncJob: new DataAPIModelProxy("CustomerSyncJob", client),
    storeCreditSyncJob: new DataAPIModelProxy("StoreCreditSyncJob", client),
    orderSyncJob: new DataAPIModelProxy("OrderSyncJob", client),

    // Trial abuse prevention
    tierTrialAuditLog: new DataAPIModelProxy("TierTrialAuditLog", client),

    // Points Engagement System
    pointsConfig: new DataAPIModelProxy("PointsConfig", client),
    pointsLedger: new DataAPIModelProxy("PointsLedger", client),

    // Raffles System
    raffle: new DataAPIModelProxy("Raffle", client),
    rafflePrize: new DataAPIModelProxy("RafflePrize", client),
    raffleEntry: new DataAPIModelProxy("RaffleEntry", client),
    raffleWinner: new DataAPIModelProxy("RaffleWinner", client),
    raffleStreak: new DataAPIModelProxy("RaffleStreak", client),
    raffleInstantWin: new DataAPIModelProxy("RaffleInstantWin", client),
    raffleInstantWinLog: new DataAPIModelProxy("RaffleInstantWinLog", client),
    raffleActivity: new DataAPIModelProxy("RaffleActivity", client),
    raffleBonusEvent: new DataAPIModelProxy("RaffleBonusEvent", client),
    raffleBonusEventUsage: new DataAPIModelProxy("RaffleBonusEventUsage", client),
    raffleLuckyNumber: new DataAPIModelProxy("RaffleLuckyNumber", client),

    // Mystery Box System
    mysteryBox: new DataAPIModelProxy("MysteryBox", client),
    mysteryBoxReward: new DataAPIModelProxy("MysteryBoxReward", client),
    mysteryBoxOpen: new DataAPIModelProxy("MysteryBoxOpen", client),
    mysteryBoxWinner: new DataAPIModelProxy("MysteryBoxWinner", client),
    mysteryBoxStreak: new DataAPIModelProxy("MysteryBoxStreak", client),
    mysteryBoxActivity: new DataAPIModelProxy("MysteryBoxActivity", client),
    mysteryBoxBonusEvent: new DataAPIModelProxy("MysteryBoxBonusEvent", client),
    mysteryBoxBonusEventUsage: new DataAPIModelProxy("MysteryBoxBonusEventUsage", client),

    // Challenge/Mission System
    challenge: new DataAPIModelProxy("Challenge", client),
    challengeReward: new DataAPIModelProxy("ChallengeReward", client),
    challengeParticipant: new DataAPIModelProxy("ChallengeParticipant", client),
    challengeProgressLog: new DataAPIModelProxy("ChallengeProgressLog", client),
    missionTemplate: new DataAPIModelProxy("MissionTemplate", client),
    customerMissionStats: new DataAPIModelProxy("CustomerMissionStats", client),
    missionCompletionEvent: new DataAPIModelProxy("MissionCompletionEvent", client),

    // Third-Party Integration System
    integration: new DataAPIModelProxy("Integration", client),
    integrationEvent: new DataAPIModelProxy("IntegrationEvent", client),
    integrationWebhook: new DataAPIModelProxy("IntegrationWebhook", client),
    oAuthState: new DataAPIModelProxy("OAuthState", client),
    integrationPointsRule: new DataAPIModelProxy("IntegrationPointsRule", client),

    // Gift Card System
    giftCardConfig: new DataAPIModelProxy("GiftCardConfig", client),
    tierGiftCardSettings: new DataAPIModelProxy("TierGiftCardSettings", client),
    issuedGiftCard: new DataAPIModelProxy("IssuedGiftCard", client),
    giftCardBundle: new DataAPIModelProxy("GiftCardBundle", client),

    // AI Feedback System
    aISession: new DataAPIModelProxy("AISession", client),
    aISessionAction: new DataAPIModelProxy("AISessionAction", client),
    aISessionFeedback: new DataAPIModelProxy("AISessionFeedback", client),
    aICodeMetric: new DataAPIModelProxy("AICodeMetric", client),
    aILearningPattern: new DataAPIModelProxy("AILearningPattern", client),
    aICodeQualitySignal: new DataAPIModelProxy("AICodeQualitySignal", client),
    aIArchitectureHealth: new DataAPIModelProxy("AIArchitectureHealth", client),
    aIInnovationTracker: new DataAPIModelProxy("AIInnovationTracker", client),

    // Cron Locks
    cronLock: new DataAPIModelProxy("CronLock", client),

    // Reconciliation
    reconciliationLog: new DataAPIModelProxy("ReconciliationLog", client),

    // Disconnect (no-op for Data API)
    $disconnect: async () => {
      console.log("Data API client disconnected (no-op)");
    },
  };

  // Log confirmation of Points models
  console.log("[prisma-data-api-adapter] Client built. Verifying Points models...");
  console.log("[prisma-data-api-adapter] dbClient.pointsConfig exists:", !!dbClient.pointsConfig);
  console.log("[prisma-data-api-adapter] dbClient.pointsLedger exists:", !!dbClient.pointsLedger);
  console.log("[prisma-data-api-adapter] Total models registered:", Object.keys(dbClient).length);

  return dbClient;
}
