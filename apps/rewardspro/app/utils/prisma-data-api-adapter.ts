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
   * Find many records
   */
  async findMany(args?: {
    where?: Record<string, any>;
    take?: number;
    skip?: number;
    orderBy?: Record<string, "asc" | "desc">;
    include?: Record<string, boolean>;
  }): Promise<T[]> {
    let sql = `SELECT * FROM "${this.tableName}"`;
    const params: SqlParameter[] = [];
    const conditions: string[] = [];

    // Build WHERE clause
    if (args?.where) {
      Object.entries(args.where).forEach(([key, value], index) => {
        if (value === null) {
          conditions.push(`"${key}" IS NULL`);
        } else {
          conditions.push(`"${key}" = :param${index}`);
          params.push(AuroraDataAPI.buildParameter(`param${index}`, value));
        }
      });
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

    const result = await this.client.executeStatement(sql, params);
    return result.records as T[];
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
   * Create a record
   */
  async create(args: {
    data: Record<string, any>;
  }): Promise<T> {
    const fields = Object.keys(args.data);
    const values = fields.map((_, i) => `:param${i}`);
    const params = fields.map((field, i) =>
      AuroraDataAPI.buildParameter(`param${i}`, args.data[field])
    );

    const sql = `
      INSERT INTO "${this.tableName}" (${fields.map(f => `"${f}"`).join(", ")})
      VALUES (${values.join(", ")})
      RETURNING *
    `;

    const result = await this.client.executeStatement(sql, params);
    return result.records[0] as T;
  }

  /**
   * Update records
   */
  async update(args: {
    where: Record<string, any>;
    data: Record<string, any>;
  }): Promise<T> {
    const setFields = Object.keys(args.data);
    const whereFields = Object.keys(args.where);
    const params: SqlParameter[] = [];

    // Build SET clause
    const setClauses = setFields.map((field, i) => {
      params.push(AuroraDataAPI.buildParameter(`set${i}`, args.data[field]));
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

    const result = await this.client.executeStatement(sql, params);
    return result.records[0] as T;
  }

  /**
   * Update many records
   */
  async updateMany(args: {
    where?: Record<string, any>;
    data: Record<string, any>;
  }): Promise<{ count: number }> {
    const setFields = Object.keys(args.data);
    const params: SqlParameter[] = [];

    // Build SET clause
    const setClauses = setFields.map((field, i) => {
      params.push(AuroraDataAPI.buildParameter(`set${i}`, args.data[field]));
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

    const result = await this.client.executeStatement(sql, params);
    return { count: result.numberOfRecordsUpdated || 0 };
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
    _count?: boolean;
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
        params.push(AuroraDataAPI.buildParameter(`param${i}`, args.where![field]));
        return `"${field}" = :param${i}`;
      });
      sql += ` WHERE ${whereClauses.join(" AND ")}`;
    }

    const result = await this.client.executeStatement(sql, params);
    return result.records[0] || {};
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