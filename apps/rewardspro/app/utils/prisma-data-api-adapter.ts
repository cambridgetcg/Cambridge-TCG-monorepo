/**
 * Prisma-compatible Data API Adapter
 * 
 * Provides a Prisma-like interface that uses Aurora Data API
 * instead of direct database connections. Used for preview deployments.
 */

import { AuroraDataAPI, getAuroraClient } from "./aurora-data-api";
import type { SqlParameter } from "@aws-sdk/client-rds-data";

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
        } else if (value !== undefined) {
          conditions.push(`"${key}" = :param${index}`);
          params.push(AuroraDataAPI.buildParameter(`param${index}`, value));
        }
      });

      // Handle OR conditions
      if (args.where.OR && Array.isArray(args.where.OR)) {
        const orConditions = args.where.OR.map((orClause: any, orIndex: number) => {
          const subConditions: string[] = [];
          Object.entries(orClause).forEach(([key, value]: [string, any]) => {
            const paramName = `or${orIndex}_${key}`;
            if (value && typeof value === 'object' && 'contains' in value) {
              const searchValue = value.contains;
              const mode = value.mode || 'sensitive';
              if (mode === 'insensitive') {
                subConditions.push(`LOWER("${key}") LIKE LOWER(:${paramName})`);
              } else {
                subConditions.push(`"${key}" LIKE :${paramName}`);
              }
              params.push(AuroraDataAPI.buildParameter(paramName, `%${searchValue}%`));
            } else {
              subConditions.push(`"${key}" = :${paramName}`);
              params.push(AuroraDataAPI.buildParameter(paramName, value));
            }
          });
          return `(${subConditions.join(' OR ')})`;
        });
        
        if (orConditions.length > 0) {
          conditions.push(`(${orConditions.join(' OR ')})`);
        }
      }
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }

    // Add ORDER BY
    if (args?.orderBy) {
      const orderClauses = Object.entries(args.orderBy).map(
        ([field, direction]) => `"${field}" ${direction.toUpperCase()}`
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

      // Handle currentTier relation (many-to-one)
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
      // Add more relation handlers as needed
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
  }): Promise<T | null> {
    const results = await this.findMany({
      where: args.where,
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
  }): Promise<T | null> {
    const results = await this.findMany({
      where: args?.where,
      orderBy: args?.orderBy,
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
    const fields = Object.keys(args.data);
    const params: SqlParameter[] = [];
    
    // Build values with proper type casting for enums
    const values = fields.map((field, i) => {
      const value = args.data[field];
      params.push(AuroraDataAPI.buildParameter(`param${i}`, value));
      
      // Check if this field needs enum casting
      if (this.isEnumField(field)) {
        return `:param${i}::text::${this.getEnumType(field)}`;
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
      Tier: ['evaluationPeriod'],
      ShopSettings: ['storeCurrency', 'currencyDisplayType'],
      StoreCreditLedger: ['type'],
      TierChangeLog: ['changeType', 'triggerType'],
    };
    
    return enumFields[this.tableName]?.includes(field) || false;
  }
  
  /**
   * Get the PostgreSQL enum type name for a field
   */
  private getEnumType(field: string): string {
    // Map field names to PostgreSQL enum type names
    const enumTypes: Record<string, string> = {
      evaluationPeriod: '"EvaluationPeriod"',
      storeCurrency: '"Currency"',
      currencyDisplayType: '"CurrencyDisplayType"',
      type: '"LedgerEntryType"',
      changeType: '"TierChangeType"',
      triggerType: '"TierTriggerType"',
    };
    
    return enumTypes[field] || field;
  }

  /**
   * Update records with enum handling
   */
  async update(args: {
    where: Record<string, any>;
    data: Record<string, any>;
  }): Promise<T> {
    const setFields = Object.keys(args.data);
    const whereFields = Object.keys(args.where);
    const params: SqlParameter[] = [];

    // Build SET clause with enum casting
    const setClauses = setFields.map((field, i) => {
      params.push(AuroraDataAPI.buildParameter(`set${i}`, args.data[field]));
      
      // Check if this field needs enum casting
      if (this.isEnumField(field)) {
        return `"${field}" = :set${i}::text::${this.getEnumType(field)}`;
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
    const setFields = Object.keys(args.data);
    const params: SqlParameter[] = [];

    // Build SET clause with enum casting
    const setClauses = setFields.map((field, i) => {
      params.push(AuroraDataAPI.buildParameter(`set${i}`, args.data[field]));
      
      // Check if this field needs enum casting
      if (this.isEnumField(field)) {
        return `"${field}" = :set${i}::text::${this.getEnumType(field)}`;
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

    if (args?.where) {
      const whereFields = Object.keys(args.where);
      const whereClauses = whereFields.map((field, i) => {
        params.push(AuroraDataAPI.buildParameter(`param${i}`, args.where![field]));
        return `"${field}" = :param${i}`;
      });
      sql += ` WHERE ${whereClauses.join(" AND ")}`;
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

    if (args._count) {
      aggregates.push("COUNT(*) as _count");
    }

    ["_sum", "_avg", "_min", "_max"].forEach((op) => {
      const fields = args[op as keyof typeof args];
      if (fields && typeof fields === "object") {
        Object.keys(fields).forEach((field) => {
          const func = op.substring(1).toUpperCase();
          aggregates.push(`${func}("${field}") as ${op}_${field}`);
        });
      }
    });

    if (aggregates.length === 0) {
      aggregates.push("COUNT(*) as _count");
    }

    let sql = `SELECT ${aggregates.join(", ")} FROM "${this.tableName}"`;
    const params: SqlParameter[] = [];

    if (args.where) {
      const whereFields = Object.keys(args.where);
      const whereClauses = whereFields.map((field, i) => {
        if (args.where![field] !== undefined && typeof args.where![field] === 'object' && 'not' in args.where![field]) {
          // Handle { not: null }
          return `"${field}" IS NOT NULL`;
        } else if (args.where![field] === null) {
          return `"${field}" IS NULL`;
        } else {
          params.push(AuroraDataAPI.buildParameter(`param${i}`, args.where![field]));
          return `"${field}" = :param${i}`;
        }
      });
      sql += ` WHERE ${whereClauses.join(" AND ")}`;
    }

    const result = await this.client.executeStatement(sql, params);
    const record = result.records[0] || {};
    
    // Format the response to match Prisma's structure
    const response: any = {};
    
    if (args._count) {
      response._count = parseInt(record._count || '0');
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
}

/**
 * Creates a Prisma-compatible client using Data API
 */
export function createDataAPIPrismaClient() {
  const client = getAuroraClient();

  return {
    // Transaction support
    $transaction: async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
      return client.executeTransaction(async (execute) => {
        // Create transaction context with execute function
        const txClient = {
          $executeRaw: async (sql: string, ...params: any[]) => {
            const result = await execute(sql, params);
            return result.numberOfRecordsUpdated || 0;
          },
          $queryRaw: async (sql: string, ...params: any[]) => {
            const result = await execute(sql, params);
            return result.records;
          },
        };
        return fn(txClient);
      });
    },

    // Raw query support
    $executeRaw: async (sql: string, ...params: any[]) => {
      const result = await client.executeStatement(sql, params);
      return result.numberOfRecordsUpdated || 0;
    },

    $queryRaw: async (sql: string, ...params: any[]) => {
      const result = await client.executeStatement(sql, params);
      return result.records;
    },

    // Model proxies
    session: new DataAPIModelProxy("Session", client),
    shopSettings: new DataAPIModelProxy("ShopSettings", client),
    tier: new DataAPIModelProxy("Tier", client),
    customer: new DataAPIModelProxy("Customer", client),
    storeCreditLedger: new DataAPIModelProxy("StoreCreditLedger", client),
    tierChangeLog: new DataAPIModelProxy("TierChangeLog", client),

    // Disconnect (no-op for Data API)
    $disconnect: async () => {
      console.log("Data API client disconnected (no-op)");
    },
  };
}