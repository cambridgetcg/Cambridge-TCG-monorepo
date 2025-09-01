/**
 * Aurora Data API Client Wrapper
 * Provides a type-safe interface to AWS Aurora Serverless using Data API
 */

import {
  RDSDataClient,
  ExecuteStatementCommand,
  BatchExecuteStatementCommand,
  BeginTransactionCommand,
  CommitTransactionCommand,
  RollbackTransactionCommand,
  type ExecuteStatementCommandInput,
  type Field,
  type SqlParameter,
} from "@aws-sdk/client-rds-data";

export interface AuroraConfig {
  resourceArn: string;
  secretArn: string;
  database: string;
  region?: string;
}

export interface QueryResult<T = any> {
  records: T[];
  numberOfRecordsUpdated?: number;
  generatedFields?: Field[];
}

export class AuroraDataAPI {
  private client: RDSDataClient;
  private config: AuroraConfig;

  constructor(config: AuroraConfig) {
    this.config = {
      ...config,
      region: config.region || "eu-north-1",
    };

    this.client = new RDSDataClient({
      region: this.config.region,
    });
  }

  /**
   * Execute a single SQL statement
   */
  async executeStatement<T = any>(
    sql: string,
    parameters?: SqlParameter[]
  ): Promise<QueryResult<T>> {
    const input: ExecuteStatementCommandInput = {
      resourceArn: this.config.resourceArn,
      secretArn: this.config.secretArn,
      database: this.config.database,
      sql,
      parameters,
      includeResultMetadata: true,
    };

    try {
      const command = new ExecuteStatementCommand(input);
      const response = await this.client.send(command);

      return {
        records: this.formatRecords<T>(
          response.records || [],
          response.columnMetadata || []
        ),
        numberOfRecordsUpdated: response.numberOfRecordsUpdated,
        generatedFields: response.generatedFields,
      };
    } catch (error) {
      this.handleError(error, sql);
    }
  }

  /**
   * Execute multiple SQL statements in a batch
   */
  async batchExecuteStatement(
    sql: string,
    parameterSets: SqlParameter[][]
  ): Promise<void> {
    const input = {
      resourceArn: this.config.resourceArn,
      secretArn: this.config.secretArn,
      database: this.config.database,
      sql,
      parameterSets,
    };

    try {
      const command = new BatchExecuteStatementCommand(input);
      await this.client.send(command);
    } catch (error) {
      this.handleError(error, sql);
    }
  }

  /**
   * Begin a database transaction
   */
  async beginTransaction(): Promise<string> {
    const input = {
      resourceArn: this.config.resourceArn,
      secretArn: this.config.secretArn,
      database: this.config.database,
    };

    const command = new BeginTransactionCommand(input);
    const response = await this.client.send(command);
    
    if (!response.transactionId) {
      throw new Error("Failed to begin transaction");
    }
    
    return response.transactionId;
  }

  /**
   * Commit a database transaction
   */
  async commitTransaction(transactionId: string): Promise<void> {
    const input = {
      resourceArn: this.config.resourceArn,
      secretArn: this.config.secretArn,
      transactionId,
    };

    const command = new CommitTransactionCommand(input);
    await this.client.send(command);
  }

  /**
   * Rollback a database transaction
   */
  async rollbackTransaction(transactionId: string): Promise<void> {
    const input = {
      resourceArn: this.config.resourceArn,
      secretArn: this.config.secretArn,
      transactionId,
    };

    const command = new RollbackTransactionCommand(input);
    await this.client.send(command);
  }

  /**
   * Execute a transaction with automatic rollback on error
   */
  async executeTransaction<T>(
    callback: (execute: (sql: string, params?: SqlParameter[]) => Promise<QueryResult>) => Promise<T>
  ): Promise<T> {
    const transactionId = await this.beginTransaction();

    const execute = async (sql: string, params?: SqlParameter[]) => {
      const input: ExecuteStatementCommandInput = {
        resourceArn: this.config.resourceArn,
        secretArn: this.config.secretArn,
        database: this.config.database,
        sql,
        parameters: params,
        transactionId,
        includeResultMetadata: true,
      };

      const command = new ExecuteStatementCommand(input);
      const response = await this.client.send(command);

      return {
        records: this.formatRecords(
          response.records || [],
          response.columnMetadata || []
        ),
        numberOfRecordsUpdated: response.numberOfRecordsUpdated,
        generatedFields: response.generatedFields,
      };
    };

    try {
      const result = await callback(execute);
      await this.commitTransaction(transactionId);
      return result;
    } catch (error) {
      await this.rollbackTransaction(transactionId);
      throw error;
    }
  }

  /**
   * Format raw records from Data API into typed objects
   */
  private formatRecords<T>(records: Field[][], columnMetadata: any[]): T[] {
    return records.map((record) => {
      const obj: any = {};
      record.forEach((field, index) => {
        const columnName = columnMetadata[index]?.name || `column${index}`;
        obj[columnName] = this.getFieldValue(field);
      });
      return obj as T;
    });
  }

  /**
   * Extract value from Data API field
   */
  private getFieldValue(field: Field): any {
    if (field.isNull) return null;
    if (field.stringValue !== undefined) return field.stringValue;
    if (field.longValue !== undefined) return field.longValue;
    if (field.doubleValue !== undefined) return field.doubleValue;
    if (field.booleanValue !== undefined) return field.booleanValue;
    if (field.blobValue !== undefined) return field.blobValue;
    if (field.arrayValue !== undefined) {
      return field.arrayValue.stringValues || 
             field.arrayValue.longValues || 
             field.arrayValue.doubleValues || 
             field.arrayValue.booleanValues;
    }
    return null;
  }

  /**
   * Handle and format errors
   */
  private handleError(error: any, sql: string): never {
    const errorMessage = error.message || "Unknown database error";
    const enhancedError = new Error(
      `Aurora Data API Error: ${errorMessage}\nSQL: ${sql.substring(0, 200)}...`
    );
    
    // Preserve original error properties
    if (error.name) enhancedError.name = error.name;
    if (error.stack) enhancedError.stack = error.stack;
    
    throw enhancedError;
  }

  /**
   * Build SQL parameters for Data API
   */
  static buildParameter(name: string, value: any): SqlParameter {
    const param: SqlParameter = { name };

    if (value === null || value === undefined) {
      param.value = { isNull: true };
    } else if (typeof value === "string") {
      param.value = { stringValue: value };
    } else if (typeof value === "number") {
      if (Number.isInteger(value)) {
        param.value = { longValue: value };
      } else {
        param.value = { doubleValue: value };
      }
    } else if (typeof value === "boolean") {
      param.value = { booleanValue: value };
    } else if (value instanceof Date) {
      param.value = { stringValue: value.toISOString() };
    } else if (Buffer.isBuffer(value)) {
      param.value = { blobValue: value };
    } else if (Array.isArray(value)) {
      // Handle arrays (for PostgreSQL array types)
      if (value.every(v => typeof v === "string")) {
        param.value = { arrayValue: { stringValues: value } };
      } else if (value.every(v => typeof v === "number")) {
        param.value = { arrayValue: { longValues: value } };
      } else if (value.every(v => typeof v === "boolean")) {
        param.value = { arrayValue: { booleanValues: value } };
      }
    } else {
      // Default to JSON string for complex objects
      param.value = { stringValue: JSON.stringify(value) };
    }

    return param;
  }
}

// Singleton instance
let auroraClient: AuroraDataAPI | null = null;

/**
 * Get or create Aurora Data API client instance
 */
export function getAuroraClient(): AuroraDataAPI {
  if (!auroraClient) {
    const config: AuroraConfig = {
      resourceArn: process.env.AURORA_RESOURCE_ARN!,
      secretArn: process.env.AURORA_SECRET_ARN!,
      database: process.env.AURORA_DATABASE_NAME || "rewardspro",
      region: process.env.AWS_REGION || "eu-north-1",
    };

    if (!config.resourceArn || !config.secretArn) {
      throw new Error(
        "Missing required Aurora configuration. Please set AURORA_RESOURCE_ARN and AURORA_SECRET_ARN environment variables."
      );
    }

    auroraClient = new AuroraDataAPI(config);
  }

  return auroraClient;
}