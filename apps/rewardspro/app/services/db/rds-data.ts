import {
  RDSDataClient,
  ExecuteStatementCommand,
  BeginTransactionCommand,
  CommitTransactionCommand,
  RollbackTransactionCommand,
  type SqlParameter,
} from "@aws-sdk/client-rds-data";
import { marshal, unmarshalRows } from "./marshal";

// Trim all env vars to handle accidental whitespace/newlines
const region = (process.env.AWS_REGION || "eu-north-1").trim();
const resourceArn = process.env.AURORA_RESOURCE_ARN?.trim() || "";
const secretArn = process.env.AURORA_SECRET_ARN?.trim() || "";
const database = process.env.AURORA_DATABASE_NAME?.trim() || "";

// Trim AWS credentials to handle env vars with newlines
const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();

// Build client config with trimmed credentials
const clientConfig: any = { region };
if (accessKeyId && secretAccessKey) {
  clientConfig.credentials = { accessKeyId, secretAccessKey };
}

export const rds = new RDSDataClient(clientConfig);

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
      resourceArn: resourceArn,
      secretArn: secretArn,
      database: database,
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
      resourceArn: resourceArn,
      secretArn: secretArn,
      database: database,
    })
  );
  const txId = begin.transactionId!;
  try {
    const result = await fn(txId);
    await rds.send(
      new CommitTransactionCommand({
        resourceArn: resourceArn,
        secretArn: secretArn,
        transactionId: txId,
      })
    );
    return result;
  } catch (e) {
    await rds.send(
      new RollbackTransactionCommand({
        resourceArn: resourceArn,
        secretArn: secretArn,
        transactionId: txId,
      })
    );
    throw e;
  }
}