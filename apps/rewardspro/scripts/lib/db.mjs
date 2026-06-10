/**
 * Shared Database Helper for Scripts
 *
 * Provides a thin wrapper around AWS Aurora Data API for standalone scripts.
 * All scripts should import from here instead of creating their own RDSDataClient.
 *
 * Usage:
 *   import { query, execute, param } from './lib/db.mjs';
 *   const rows = await query('SELECT * FROM "Customer" WHERE shop = :shop', [param('shop', 'mystore.myshopify.com')]);
 */

import {
  RDSDataClient,
  ExecuteStatementCommand,
  BeginTransactionCommand,
  CommitTransactionCommand,
  RollbackTransactionCommand,
} from "@aws-sdk/client-rds-data";

const region = (process.env.AWS_REGION || "eu-north-1").trim();
const resourceArn = process.env.AURORA_RESOURCE_ARN?.trim();
const secretArn = process.env.AURORA_SECRET_ARN?.trim();
const database = (process.env.AURORA_DATABASE_NAME || "rewardspro").trim();

if (!resourceArn || !secretArn) {
  console.error("Missing AURORA_RESOURCE_ARN or AURORA_SECRET_ARN");
  process.exit(1);
}

const clientConfig = { region };
const ak = process.env.AWS_ACCESS_KEY_ID?.trim();
const sk = process.env.AWS_SECRET_ACCESS_KEY?.trim();
if (ak && sk) clientConfig.credentials = { accessKeyId: ak, secretAccessKey: sk };

export const rds = new RDSDataClient(clientConfig);

/**
 * Execute a SELECT query and return unmarshalled rows.
 * @param {string} sql - SQL with :name placeholders
 * @param {Array} params - Array of Data API parameters (use param() helper)
 * @returns {Array<Object>} Unmarshalled row objects
 */
export async function query(sql, params = []) {
  const resp = await rds.send(
    new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql,
      parameters: params,
      includeResultMetadata: true,
    })
  );
  if (!resp.records || !resp.columnMetadata) return [];
  const cols = resp.columnMetadata.map((c) => c.name || "col");
  return resp.records.map((row) => {
    const obj = {};
    row.forEach((f, i) => {
      if (f.isNull) obj[cols[i]] = null;
      else if (f.stringValue !== undefined) obj[cols[i]] = f.stringValue;
      else if (f.longValue !== undefined) obj[cols[i]] = Number(f.longValue);
      else if (f.doubleValue !== undefined) obj[cols[i]] = f.doubleValue;
      else if (f.booleanValue !== undefined) obj[cols[i]] = f.booleanValue;
      else obj[cols[i]] = null;
    });
    return obj;
  });
}

/**
 * Execute a statement (INSERT/UPDATE/DELETE) and return the raw response.
 * @param {string} sql - SQL with :name placeholders
 * @param {Array} params - Array of Data API parameters (use param() helper)
 * @returns {Object} ExecuteStatementCommandOutput
 */
export async function execute(sql, params = []) {
  return rds.send(
    new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql,
      parameters: params,
    })
  );
}

/**
 * Build a Data API SqlParameter from a name and JS value.
 * Handles null, Date, number, boolean, and string.
 * @param {string} name - Parameter name (matches :name in SQL)
 * @param {*} value - JS value
 * @returns {Object} SqlParameter
 */
export function param(name, value) {
  if (value === null || value === undefined)
    return { name, value: { isNull: true } };
  if (value instanceof Date)
    return { name, value: { stringValue: value.toISOString() }, typeHint: "TIMESTAMP" };
  if (typeof value === "number")
    return Number.isInteger(value)
      ? { name, value: { longValue: value } }
      : { name, value: { doubleValue: value } };
  if (typeof value === "boolean")
    return { name, value: { booleanValue: value } };
  return { name, value: { stringValue: String(value) } };
}

/**
 * Run a function inside a Data API transaction.
 * @param {function} fn - Async function receiving transactionId
 * @returns {*} Result of fn
 */
export async function withTransaction(fn) {
  const begin = await rds.send(
    new BeginTransactionCommand({ resourceArn, secretArn, database })
  );
  const txId = begin.transactionId;
  try {
    const result = await fn(txId);
    await rds.send(
      new CommitTransactionCommand({ resourceArn, secretArn, transactionId: txId })
    );
    return result;
  } catch (e) {
    await rds.send(
      new RollbackTransactionCommand({ resourceArn, secretArn, transactionId: txId })
    );
    throw e;
  }
}

export { resourceArn, secretArn, database };
