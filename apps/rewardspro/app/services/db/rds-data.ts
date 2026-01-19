import {
  RDSDataClient,
  ExecuteStatementCommand,
  BeginTransactionCommand,
  CommitTransactionCommand,
  RollbackTransactionCommand,
  type SqlParameter,
} from "@aws-sdk/client-rds-data";
import { marshal, unmarshalRows } from "./marshal";

const { AWS_REGION, AURORA_RESOURCE_ARN, AURORA_SECRET_ARN, AURORA_DATABASE_NAME } = process.env;

// Trim region to handle accidental whitespace/newlines in env vars
const region = AWS_REGION?.trim() || "eu-north-1";

export const rds = new RDSDataClient({ region });

export async function query<T = any>(
  sql: string,
  params: Record<string, any> = {},
  opts: { includeMeta?: boolean } = {}
): Promise<T[]> {
  const Parameters: SqlParameter[] = Object.entries(params).map(([name, value]) => ({
    name,
    value: marshal(value),
  }));

  const resp = await rds.send(
    new ExecuteStatementCommand({
      resourceArn: AURORA_RESOURCE_ARN!,
      secretArn: AURORA_SECRET_ARN!,
      database: AURORA_DATABASE_NAME!,
      sql,
      parameters: Parameters,
      includeResultMetadata: true,
    })
  );

  return unmarshalRows<T>(resp.records, resp.columnMetadata);
}

export async function withTransaction<T>(
  fn: (txId: string) => Promise<T>
): Promise<T> {
  const begin = await rds.send(
    new BeginTransactionCommand({
      resourceArn: AURORA_RESOURCE_ARN!,
      secretArn: AURORA_SECRET_ARN!,
      database: AURORA_DATABASE_NAME!,
    })
  );
  const txId = begin.transactionId!;
  try {
    const result = await fn(txId);
    await rds.send(
      new CommitTransactionCommand({
        resourceArn: AURORA_RESOURCE_ARN!,
        secretArn: AURORA_SECRET_ARN!,
        transactionId: txId,
      })
    );
    return result;
  } catch (e) {
    await rds.send(
      new RollbackTransactionCommand({
        resourceArn: AURORA_RESOURCE_ARN!,
        secretArn: AURORA_SECRET_ARN!,
        transactionId: txId,
      })
    );
    throw e;
  }
}