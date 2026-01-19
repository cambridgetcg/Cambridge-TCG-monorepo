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
    // Trim region to handle accidental whitespace/newlines in env vars
    const region = (config.region || process.env.AWS_REGION || "eu-north-1").trim();

    this.config = {
      ...config,
      region,
    };

    this.client = new RDSDataClient({
      region,
    });
  }

  /**
   * Execute a single SQL statement
   */
  async executeStatement<T = any>(
    sql: string,
    parameters?: SqlParameter[]
  ): Promise<QueryResult<T>> {
    // Debug logging for SQL and parameters
    if (process.env.DEBUG_DATA_API === 'true') {
      console.log('[DataAPI] Executing SQL:', sql);
      if (parameters) {
        console.log('[DataAPI] Parameters:', JSON.stringify(parameters, null, 2));
      }
    }

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
        const column = columnMetadata[index];
        const columnName = column?.name || `column${index}`;
        const columnType = column?.typeName?.toLowerCase();
        
        // Get the raw value first
        let value = this.getFieldValue(field);
        
        // Convert timestamp/date strings to Date objects
        if (value && typeof value === 'string' && 
            (columnType === 'timestamp' || columnType === 'timestamptz' || 
             columnType === 'date' || columnType === 'datetime')) {
          try {
            value = new Date(value);
          } catch (e) {
            console.warn(`Failed to parse date value: ${value}`);
          }
        }
        
        // Convert numeric/decimal strings to numbers
        if (value && typeof value === 'string' && 
            (columnType === 'numeric' || columnType === 'decimal' || 
             columnType === 'float' || columnType === 'real' || columnType === 'double')) {
          try {
            value = parseFloat(value);
          } catch (e) {
            console.warn(`Failed to parse numeric value: ${value}`);
          }
        }
        
        obj[columnName] = value;
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
  private handleError(error: any, sql: any): never {
    const errorMessage = error.message || "Unknown database error";
    
    // Handle different SQL input formats
    let sqlString = "";
    if (typeof sql === 'string') {
      sqlString = sql.substring(0, 200);
    } else if (typeof sql === 'object' && sql !== null) {
      // Handle Prisma template literal or object format
      sqlString = JSON.stringify(sql).substring(0, 200);
    } else {
      sqlString = String(sql).substring(0, 200);
    }
    
    const enhancedError = new Error(
      `Aurora Data API Error: ${errorMessage}\nSQL: ${sqlString}...`
    );
    
    // Preserve original error properties
    if (error.name) enhancedError.name = error.name;
    if (error.stack) enhancedError.stack = error.stack;
    
    throw enhancedError;
  }

  /**
   * Format date for AWS Data API TIMESTAMP format
   * AWS Data API expects: "YYYY-MM-DD HH:MM:SS[.FFF]"
   */
  static formatDateForDataAPI(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    const milliseconds = String(date.getUTCMilliseconds()).padStart(3, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
  }

  /**
   * Build SQL parameters for Data API
   * @param name Parameter name
   * @param value Parameter value
   * @param options Optional configuration (e.g., isTimestamp flag)
   */
  static buildParameter(name: string, value: any, options?: { isTimestamp?: boolean }): SqlParameter {
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
      // Format date according to AWS Data API requirements
      const formattedDate = AuroraDataAPI.formatDateForDataAPI(value);
      param.value = { stringValue: formattedDate };

      // CRITICAL: Add type hint for TIMESTAMP to ensure proper type handling
      // Without this, AWS Data API treats the value as text, causing type mismatch
      param.typeHint = "TIMESTAMP" as any;

      // Debug logging for date parameters
      if (process.env.DEBUG_DATA_API === 'true') {
        console.log(`[DataAPI] Date parameter ${name}:`, {
          original: value.toISOString(),
          formatted: formattedDate,
          typeHint: "TIMESTAMP"
        });
      }
    } else if (Buffer.isBuffer(value)) {
      param.value = { blobValue: value };
    } else if (Array.isArray(value)) {
      // CRITICAL FIX: AWS RDS Data API does not support array parameters directly
      // Arrays must be expanded into individual parameters in the SQL query
      // Example: WHERE id IN (:id0, :id1, :id2) instead of WHERE id IN (:ids)
      // If you see this error, you need to expand the array in your query builder
      throw new Error(
        `Cannot bind array directly as parameter "${name}". ` +
        `AWS RDS Data API requires arrays to be expanded into individual parameters. ` +
        `For IN clauses, use: WHERE ${name} IN (:${name}0, :${name}1, ...) ` +
        `and bind each value separately.`
      );
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
    // Trim all env vars to handle accidental whitespace/newlines
    const config: AuroraConfig = {
      resourceArn: process.env.AURORA_RESOURCE_ARN?.trim() || "",
      secretArn: process.env.AURORA_SECRET_ARN?.trim() || "",
      database: (process.env.AURORA_DATABASE_NAME || "rewardspro").trim(),
      region: (process.env.AWS_REGION || "eu-north-1").trim(),
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