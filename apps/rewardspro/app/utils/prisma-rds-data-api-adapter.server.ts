/**
 * Prisma 6 Driver Adapter for AWS Aurora RDS Data API.
 *
 * Implements the SqlDriverAdapter contract from `@prisma/client/runtime/library`.
 * Prisma's query engine generates parameterised SQL ($1, $2, ...) and passes it
 * here; we rewrite to Aurora's :paramN syntax, dispatch via RDSDataClient, and
 * shape the response back into Prisma's positional-row format.
 *
 * Replaces the 2425-LOC hand-rolled `prisma-data-api-adapter.ts`.
 *
 * Architecture: see docs/01-architecture/data-api-adapter-replacement-plan.md
 * Audit: see docs/01-architecture/data-api-adapter-audit.md
 * Phase 0 findings: see docs/01-architecture/data-api-adapter-phase-0-findings.md
 */
import {
  RDSDataClient,
  ExecuteStatementCommand,
  BeginTransactionCommand,
  CommitTransactionCommand,
  RollbackTransactionCommand,
  type SqlParameter,
  type Field,
  type ColumnMetadata,
  type ExecuteStatementCommandInput,
  type TypeHint,
} from "@aws-sdk/client-rds-data";

// Prisma's column type enum — values must match @prisma/client/runtime ColumnTypeEnum.
const ColumnType = {
  Int32: 0,
  Int64: 1,
  Float: 2,
  Double: 3,
  Numeric: 4,
  Boolean: 5,
  Character: 6,
  Text: 7,
  Date: 8,
  Time: 9,
  DateTime: 10,
  Json: 11,
  Enum: 12,
  Bytes: 13,
  Uuid: 15,
  UnknownNumber: 128,
} as const;
type ColumnTypeValue = (typeof ColumnType)[keyof typeof ColumnType];

// Prisma SqlQuery shape (mirrored locally to avoid coupling to runtime internals).
type ArgScalarType =
  | "string" | "int" | "bigint" | "float" | "decimal"
  | "boolean" | "enum" | "uuid" | "json" | "datetime" | "bytes" | "unknown";
interface PrismaArgType { scalarType: ArgScalarType; dbType?: string; arity: "scalar" | "list" }
interface PrismaSqlQuery { sql: string; args: unknown[]; argTypes: PrismaArgType[] }
interface PrismaSqlResultSet {
  columnTypes: ColumnTypeValue[];
  columnNames: string[];
  rows: unknown[][];
  lastInsertId?: string;
}

export interface RdsDataApiAdapterConfig {
  resourceArn: string;
  secretArn: string;
  database: string;
  region: string;
  // Optional reader replica ARN for read/write split (optimisation #1).
  readReplicaArn?: string;
}

const DEBUG = process.env.DEBUG_DATA_API === "true";

/**
 * Rewrite Prisma's `$1, $2, ...` placeholders into Aurora's `:paramN`.
 * Skips inside string literals and dollar-quoted blocks ($$...$$ and $tag$...$tag$)
 * to avoid touching values that happen to contain `$N`.
 */
function rewritePlaceholders(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'") {
      // Single-quoted string: copy verbatim including escaped ''.
      out += ch; i++;
      while (i < sql.length) {
        out += sql[i];
        if (sql[i] === "'") { i++; if (sql[i] === "'") { out += "'"; i++; continue; } break; }
        i++;
      }
      continue;
    }
    if (ch === '"') {
      // Quoted identifier.
      out += ch; i++;
      while (i < sql.length && sql[i] !== '"') { out += sql[i]; i++; }
      if (i < sql.length) { out += sql[i]; i++; }
      continue;
    }
    if (ch === "$") {
      // Dollar-quoted string ($$ or $tag$).
      const dq = sql.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (dq) {
        const tag = dq[0];
        out += tag; i += tag.length;
        const end = sql.indexOf(tag, i);
        if (end === -1) { out += sql.slice(i); i = sql.length; }
        else { out += sql.slice(i, end + tag.length); i = end + tag.length; }
        continue;
      }
      // Numeric placeholder $N → :paramN
      const m = sql.slice(i).match(/^\$(\d+)/);
      if (m) {
        out += `:param${parseInt(m[1], 10) - 1}`;
        i += m[0].length;
        continue;
      }
    }
    out += ch; i++;
  }
  return out;
}

/** Map Prisma's ArgType + JS value into a Data API SqlParameter. */
function buildParameter(name: string, value: unknown, argType: PrismaArgType | undefined): SqlParameter {
  if (value === null || value === undefined) {
    return { name, value: { isNull: true } };
  }

  if (argType?.arity === "list") {
    // Prisma occasionally hands a JS array for a list-typed arg; Data API has
    // no first-class array support — encode as JSONB string.
    return { name, value: { stringValue: JSON.stringify(value) }, typeHint: "JSON" as TypeHint };
  }

  switch (argType?.scalarType) {
    case "datetime": {
      const date = value instanceof Date ? value : new Date(value as string | number);
      return { name, value: { stringValue: formatDateForDataAPI(date) }, typeHint: "TIMESTAMP" as TypeHint };
    }
    case "decimal":
      return { name, value: { stringValue: String(value) }, typeHint: "DECIMAL" as TypeHint };
    case "uuid":
      return { name, value: { stringValue: String(value) }, typeHint: "UUID" as TypeHint };
    case "json":
      return {
        name,
        value: { stringValue: typeof value === "string" ? value : JSON.stringify(value) },
        typeHint: "JSON" as TypeHint,
      };
    case "bytes":
      return { name, value: { blobValue: value as Uint8Array } };
    case "bigint":
      return { name, value: { longValue: typeof value === "bigint" ? Number(value) : Number(value) } };
    case "int":
      return { name, value: { longValue: Number(value) } };
    case "float":
      return { name, value: { doubleValue: Number(value) } };
    case "boolean":
      return { name, value: { booleanValue: Boolean(value) } };
    case "enum":
    case "string":
      return { name, value: { stringValue: String(value) } };
  }

  // Fallback by JS type — unknown / mis-tagged args.
  if (value instanceof Date) {
    return { name, value: { stringValue: formatDateForDataAPI(value) }, typeHint: "TIMESTAMP" as TypeHint };
  }
  if (typeof value === "boolean") return { name, value: { booleanValue: value } };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { name, value: { longValue: value } }
      : { name, value: { doubleValue: value } };
  }
  if (typeof value === "bigint") return { name, value: { longValue: Number(value) } };
  if (value instanceof Uint8Array) return { name, value: { blobValue: value } };
  if (typeof value === "object") {
    return { name, value: { stringValue: JSON.stringify(value) }, typeHint: "JSON" as TypeHint };
  }
  return { name, value: { stringValue: String(value) } };
}

/** AWS Data API expects `YYYY-MM-DD HH:MM:SS.fff` (UTC, no `T`, no `Z`). */
function formatDateForDataAPI(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` +
    `.${pad(d.getUTCMilliseconds(), 3)}`
  );
}

/** Map a Postgres type name (from Data API column metadata) to Prisma's ColumnType enum. */
function pgTypeToColumnType(typeName: string | undefined): ColumnTypeValue {
  if (!typeName) return ColumnType.UnknownNumber;
  const t = typeName.toLowerCase();
  switch (t) {
    case "int2": case "int4": return ColumnType.Int32;
    case "int8": return ColumnType.Int64;
    case "float4": return ColumnType.Float;
    case "float8": return ColumnType.Double;
    case "numeric": case "decimal": case "money": return ColumnType.Numeric;
    case "bool": return ColumnType.Boolean;
    case "char": case "bpchar": return ColumnType.Character;
    case "text": case "varchar": case "name": case "citext": return ColumnType.Text;
    case "date": return ColumnType.Date;
    case "time": case "timetz": return ColumnType.Time;
    case "timestamp": case "timestamptz": return ColumnType.DateTime;
    case "json": case "jsonb": return ColumnType.Json;
    case "bytea": return ColumnType.Bytes;
    case "uuid": return ColumnType.Uuid;
    default:
      // User-defined enums show up as the enum's own type name.
      return ColumnType.Enum;
  }
}

/** Convert a Field union into a JS value matched to the column's Prisma type. */
function fieldToValue(field: Field, columnType: ColumnTypeValue): unknown {
  if (field.isNull) return null;

  // Prefer the well-typed paths for known column types.
  if (columnType === ColumnType.Bytes && field.blobValue !== undefined) {
    return field.blobValue;
  }
  if (columnType === ColumnType.Boolean && field.booleanValue !== undefined) {
    return field.booleanValue;
  }
  if (
    (columnType === ColumnType.Int32 || columnType === ColumnType.Int64) &&
    field.longValue !== undefined
  ) {
    return field.longValue;
  }
  if (
    (columnType === ColumnType.Float || columnType === ColumnType.Double) &&
    field.doubleValue !== undefined
  ) {
    return field.doubleValue;
  }
  // Numeric/Decimal: Data API returns as stringValue to preserve precision —
  // Prisma's query engine handles the Decimal conversion.
  if (columnType === ColumnType.Numeric && field.stringValue !== undefined) {
    return field.stringValue;
  }

  // Fallthrough by Field shape.
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.longValue !== undefined) return field.longValue;
  if (field.doubleValue !== undefined) return field.doubleValue;
  if (field.booleanValue !== undefined) return field.booleanValue;
  if (field.blobValue !== undefined) return field.blobValue;
  if (field.arrayValue !== undefined) {
    const a = field.arrayValue;
    return a.stringValues ?? a.longValues ?? a.doubleValues ?? a.booleanValues ?? null;
  }
  return null;
}

/**
 * Core executor — one place that ships SQL through Data API.
 * Used by both the top-level adapter and the per-transaction queryable.
 */
// Aurora Data API hard limits.
// https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/data-api.html
const STATEMENT_SIZE_LIMIT = 65_536;       // 64 KB hard cap on SQL text
const STATEMENT_SIZE_WARNING = 60_000;     // warn at 92% so we get notice before hitting cap
const RESPONSE_SIZE_HINT = "Database returned more than the allowed response size";

async function executeStatement(
  client: RDSDataClient,
  config: { resourceArn: string; secretArn: string; database: string; transactionId?: string },
  query: PrismaSqlQuery,
): Promise<{
  records: Field[][];
  columnMetadata: ColumnMetadata[];
  numberOfRecordsUpdated: number;
  generatedFields?: Field[];
}> {
  const sql = rewritePlaceholders(query.sql);
  const parameters: SqlParameter[] = query.args.map((value, i) =>
    buildParameter(`param${i}`, value, query.argTypes[i]),
  );

  // Optimisation #3 — statement-size pre-flight.
  // Aurora Data API hard-caps statements at 64 KB and rejects with a
  // ValidationException that doesn't make the cause obvious. We catch it early
  // with a clear, actionable error. The 60 KB warning surfaces near-cap usage
  // in logs so we can spot growth before it breaks.
  if (sql.length > STATEMENT_SIZE_LIMIT) {
    throw new Error(
      `[PrismaAdapter] SQL statement is ${sql.length} bytes, exceeds Aurora Data API ` +
      `${STATEMENT_SIZE_LIMIT}-byte cap. Reduce the IN (...) list size, or use ` +
      `Prisma.maxBindValues to chunk the query. SQL prefix: ${sql.slice(0, 200)}...`,
    );
  }
  if (sql.length > STATEMENT_SIZE_WARNING && process.env.NODE_ENV !== "test") {
    console.warn(
      `[PrismaAdapter] SQL approaching ${STATEMENT_SIZE_LIMIT}-byte limit ` +
      `(${sql.length} bytes). Op: ${sql.trim().slice(0, 6)}, params: ${parameters.length}`,
    );
  }

  if (DEBUG) {
    console.log("[PrismaAdapter] SQL:", sql);
    console.log("[PrismaAdapter] argTypes:", query.argTypes);
    console.log("[PrismaAdapter] params:", JSON.stringify(parameters));
  }

  const input: ExecuteStatementCommandInput = {
    resourceArn: config.resourceArn,
    secretArn: config.secretArn,
    database: config.database,
    sql,
    parameters,
    includeResultMetadata: true,
    transactionId: config.transactionId,
  };

  const start = Date.now();
  try {
    const response = await client.send(new ExecuteStatementCommand(input));
    const latency = Date.now() - start;

    // Optimisation #7: lightweight EMF-style metric line; opt-in via env to
    // avoid log spam in dev.
    if (process.env.METRICS_DATA_API === "true") {
      const op = sql.trim().slice(0, 6).toUpperCase();
      console.log(JSON.stringify({
        _aws: { metric: "rds_data_api", op, latency_ms: latency, sql_size: sql.length },
      }));
    }

    return {
      records: (response.records ?? []) as Field[][],
      columnMetadata: (response.columnMetadata ?? []) as ColumnMetadata[],
      numberOfRecordsUpdated: response.numberOfRecordsUpdated ?? 0,
      generatedFields: response.generatedFields,
    };
  } catch (error: any) {
    // Surface Data API's response-size cap as an actionable error rather than
    // the raw SDK exception. Callers see a clear hint to add take/select or
    // chunk the query.
    if (typeof error?.message === "string" && error.message.includes(RESPONSE_SIZE_HINT)) {
      throw new Error(
        `[PrismaAdapter] Response exceeded Aurora Data API 1 MB cap. ` +
        `Add take: <N> or select: { ... } to narrow the query. ` +
        `SQL prefix: ${sql.slice(0, 200)}...`,
      );
    }
    if (DEBUG || process.env.NODE_ENV !== "production") {
      console.error("[PrismaAdapter] Error executing SQL:", error?.message);
      console.error("[PrismaAdapter] SQL was:", sql.slice(0, 500));
    }
    throw error;
  }
}

function shapeResultSet(
  records: Field[][],
  columnMetadata: ColumnMetadata[],
): PrismaSqlResultSet {
  const columnNames = columnMetadata.map((c) => c.name ?? "");
  const columnTypes = columnMetadata.map((c) => pgTypeToColumnType(c.typeName));
  const rows: unknown[][] = records.map((record) =>
    record.map((field, i) => fieldToValue(field, columnTypes[i] ?? ColumnType.UnknownNumber)),
  );
  return { columnNames, columnTypes, rows };
}

/**
 * Per-transaction queryable. Created by `startTransaction`; commit/rollback
 * end its lifecycle.
 */
class RdsDataApiTransaction {
  readonly provider = "postgres" as const;
  readonly adapterName = "rds-data-api" as const;
  readonly options = { usePhantomQuery: false };
  private readonly client: RDSDataClient;
  private readonly config: { resourceArn: string; secretArn: string; database: string };
  private readonly transactionId: string;

  constructor(
    client: RDSDataClient,
    config: { resourceArn: string; secretArn: string; database: string },
    transactionId: string,
  ) {
    this.client = client;
    this.config = config;
    this.transactionId = transactionId;
  }

  async queryRaw(query: PrismaSqlQuery): Promise<PrismaSqlResultSet> {
    const { records, columnMetadata } = await executeStatement(
      this.client, { ...this.config, transactionId: this.transactionId }, query,
    );
    return shapeResultSet(records, columnMetadata);
  }

  async executeRaw(query: PrismaSqlQuery): Promise<number> {
    const { numberOfRecordsUpdated } = await executeStatement(
      this.client, { ...this.config, transactionId: this.transactionId }, query,
    );
    return numberOfRecordsUpdated;
  }

  async commit(): Promise<void> {
    await this.client.send(new CommitTransactionCommand({
      resourceArn: this.config.resourceArn,
      secretArn: this.config.secretArn,
      transactionId: this.transactionId,
    }));
  }

  async rollback(): Promise<void> {
    await this.client.send(new RollbackTransactionCommand({
      resourceArn: this.config.resourceArn,
      secretArn: this.config.secretArn,
      transactionId: this.transactionId,
    }));
  }
}

/**
 * Top-level adapter. Serves both `SqlDriverAdapterFactory` and `SqlDriverAdapter`
 * roles: Prisma calls `connect()` first; for stateless HTTP we return `this`
 * since there is no per-connection state to establish.
 *
 * Reader-replica routing (optimisation #1): if `readReplicaArn` is set, SELECTs
 * outside transactions are routed to the reader; everything else hits the writer.
 */
export class PrismaRdsDataApiAdapter {
  readonly provider = "postgres" as const;
  readonly adapterName = "rds-data-api" as const;

  private readonly writerClient: RDSDataClient;
  private readonly config: { resourceArn: string; secretArn: string; database: string };
  private readonly readerArn?: string;

  constructor(opts: RdsDataApiAdapterConfig) {
    const region = opts.region.trim();
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
    const credentials =
      accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined;

    this.writerClient = new RDSDataClient({ region, credentials });
    this.config = {
      resourceArn: opts.resourceArn,
      secretArn: opts.secretArn,
      database: opts.database,
    };
    this.readerArn = opts.readReplicaArn;
  }

  /**
   * Factory entry point — Prisma's library engine calls this once per client
   * instantiation. For stateless HTTP we have nothing to set up, so we return
   * the same instance.
   */
  async connect(): Promise<this> {
    return this;
  }

  /**
   * Tells Prisma about adapter capabilities. `supportsRelationJoins: true`
   * unlocks Prisma's JOIN-based relation loader (faster than the legacy
   * subquery approach). `maxBindValues` lets Prisma chunk large `IN (...)`
   * clauses automatically — Aurora Data API has a 65 KB statement-size cap;
   * 1000 placeholders is a comfortable bound (~10 KB of placeholders alone).
   */
  getConnectionInfo() {
    return {
      schemaName: "public",
      maxBindValues: 1000,
      supportsRelationJoins: true,
    };
  }

  async queryRaw(query: PrismaSqlQuery): Promise<PrismaSqlResultSet> {
    // Outside a transaction, route reads to the reader if available.
    const useReader =
      this.readerArn && /^\s*(SELECT|WITH)\b/i.test(query.sql);
    const cfg = useReader
      ? { ...this.config, resourceArn: this.readerArn! }
      : this.config;
    const { records, columnMetadata } = await executeStatement(
      this.writerClient, cfg, query,
    );
    return shapeResultSet(records, columnMetadata);
  }

  async executeRaw(query: PrismaSqlQuery): Promise<number> {
    const { numberOfRecordsUpdated } = await executeStatement(
      this.writerClient, this.config, query,
    );
    return numberOfRecordsUpdated;
  }

  /**
   * Multi-statement script (semicolon-separated). Used by Prisma migrations.
   * Data API doesn't support multi-statement; split and run sequentially.
   */
  async executeScript(script: string): Promise<void> {
    const statements = splitSqlStatements(script);
    for (const stmt of statements) {
      if (!stmt.trim()) continue;
      await this.writerClient.send(new ExecuteStatementCommand({
        resourceArn: this.config.resourceArn,
        secretArn: this.config.secretArn,
        database: this.config.database,
        sql: stmt,
      }));
    }
  }

  async startTransaction(): Promise<RdsDataApiTransaction> {
    const response = await this.writerClient.send(new BeginTransactionCommand({
      resourceArn: this.config.resourceArn,
      secretArn: this.config.secretArn,
      database: this.config.database,
    }));
    if (!response.transactionId) {
      throw new Error("[PrismaAdapter] Failed to begin transaction — no transactionId returned");
    }
    return new RdsDataApiTransaction(this.writerClient, this.config, response.transactionId);
  }

  async dispose(): Promise<void> {
    // RDSDataClient is stateless; nothing to release. The SDK manages its own
    // HTTP keep-alive pool internally.
  }
}

/**
 * Naive SQL splitter — adequate for migration scripts, not arbitrary input.
 * Handles single-quoted strings and dollar-quoted blocks. Does not parse comments.
 */
function splitSqlStatements(script: string): string[] {
  const out: string[] = [];
  let buf = "";
  let i = 0;
  while (i < script.length) {
    const ch = script[i];
    if (ch === "'") {
      buf += ch; i++;
      while (i < script.length) {
        buf += script[i];
        if (script[i] === "'") { i++; if (script[i] === "'") { buf += "'"; i++; continue; } break; }
        i++;
      }
      continue;
    }
    if (ch === "$") {
      const dq = script.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (dq) {
        const tag = dq[0];
        buf += tag; i += tag.length;
        const end = script.indexOf(tag, i);
        if (end === -1) { buf += script.slice(i); i = script.length; }
        else { buf += script.slice(i, end + tag.length); i = end + tag.length; }
        continue;
      }
    }
    if (ch === ";") { out.push(buf); buf = ""; i++; continue; }
    buf += ch; i++;
  }
  if (buf.trim()) out.push(buf);
  return out;
}
