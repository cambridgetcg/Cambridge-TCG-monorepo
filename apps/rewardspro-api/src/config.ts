import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { z } from "zod";

const nonEmpty = z.string().trim().min(1);
const optionalNonEmpty = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  nonEmpty.optional(),
);
const positiveInteger = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);
const optionalPort = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.coerce.number().int().min(1).max(65_535).optional(),
);

const CommonEnvironmentSchema = z.object({
  AWS_REGION: optionalNonEmpty,
  DATABASE_URL: optionalNonEmpty,
  DB_CONNECT_TIMEOUT_MS: positiveInteger(5_000),
  DB_HOST: optionalNonEmpty,
  DB_NAME: optionalNonEmpty,
  DB_POOL_MAX: positiveInteger(10),
  DB_PORT: optionalPort,
  DB_QUERY_TIMEOUT_MS: positiveInteger(10_000),
  DB_SECRET_ARN: optionalNonEmpty,
  DB_SSL_ROOT_CERT: optionalNonEmpty,
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const MigrationEnvironmentSchema = CommonEnvironmentSchema.extend({
  MIGRATION_QUERY_TIMEOUT_MS: positiveInteger(540_000),
});

const ServiceEnvironmentSchema = CommonEnvironmentSchema.extend({
  SHUTDOWN_GRACE_MS: positiveInteger(15_000),
  SQS_QUEUE_URL: optionalNonEmpty,
});

const ApiEnvironmentSchema = ServiceEnvironmentSchema.extend({
  OPERATOR_TOKEN: optionalNonEmpty,
  OPERATOR_TOKEN_SECRET_ARN: optionalNonEmpty,
  PORT: z.coerce.number().int().min(1).max(65_535).default(3_000),
  SHOPIFY_API_SECRET: optionalNonEmpty,
  SHOPIFY_API_SECRET_ARN: optionalNonEmpty,
  WEBHOOK_BODY_LIMIT_BYTES: positiveInteger(1_048_576),
});

const WorkerEnvironmentSchema = ServiceEnvironmentSchema.extend({
  WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(10).default(10),
  WORKER_MAX_CONSECUTIVE_ERRORS: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(5),
  WORKER_POLL_MS: positiveInteger(1_000),
  WORKER_PROBE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(5_000)
    .max(600_000)
    .default(60_000),
  WORKER_VISIBILITY_TIMEOUT_SECONDS: z.coerce
    .number()
    .int()
    .min(30)
    .max(43_200)
    .default(120),
});

type CommonEnvironment = z.infer<typeof CommonEnvironmentSchema>;
type ServiceEnvironment = z.infer<typeof ServiceEnvironmentSchema>;
type ApiEnvironment = z.infer<typeof ApiEnvironmentSchema>;
type WorkerEnvironment = z.infer<typeof WorkerEnvironmentSchema>;

export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

export interface SecretReader {
  readSecret(arn: string, region: string): Promise<string>;
}

export interface DatabaseConfig {
  connectTimeoutMs: number;
  databaseUrl: string;
  poolMax: number;
  queryTimeoutMs: number;
  source: "environment" | "secrets-manager";
}

interface ServiceConfig {
  awsRegion: string | undefined;
  database: DatabaseConfig;
  logLevel: CommonEnvironment["LOG_LEVEL"];
  nodeEnv: CommonEnvironment["NODE_ENV"];
  shutdownGraceMs: number;
  sqsQueueUrl: string | undefined;
}

export interface ApiConfig extends ServiceConfig {
  operatorToken: string;
  port: number;
  shopifyApiSecret: string;
  webhookBodyLimitBytes: number;
}

export interface WorkerConfig extends ServiceConfig {
  workerBatchSize: number;
  workerMaxConsecutiveErrors: number;
  workerPollMs: number;
  workerProbeTimeoutMs: number;
  workerVisibilityTimeoutSeconds: number;
}

export class AwsSecretReader implements SecretReader {
  readonly #clients = new Map<string, SecretsManagerClient>();

  async readSecret(arn: string, region: string): Promise<string> {
    let client = this.#clients.get(region);
    if (!client) {
      client = new SecretsManagerClient({ region });
      this.#clients.set(region, client);
    }

    const response = await client.send(
      new GetSecretValueCommand({ SecretId: arn }),
    );
    if (response.SecretString !== undefined) {
      return response.SecretString;
    }
    if (response.SecretBinary !== undefined) {
      return Buffer.from(response.SecretBinary).toString("utf8");
    }
    throw new ConfigError("Secrets Manager returned an empty secret");
  }
}

interface LoadOptions {
  secretReader?: SecretReader;
}

export async function loadDatabaseConfig(
  environment: NodeJS.ProcessEnv = process.env,
  options: LoadOptions = {},
): Promise<DatabaseConfig> {
  const parsed = parseEnvironment(MigrationEnvironmentSchema, environment);
  const database = await resolveDatabaseConfig(
    parsed,
    options.secretReader ?? new AwsSecretReader(),
  );
  return {
    ...database,
    queryTimeoutMs: parsed.MIGRATION_QUERY_TIMEOUT_MS,
  };
}

export async function loadApiConfig(
  environment: NodeJS.ProcessEnv = process.env,
  options: LoadOptions = {},
): Promise<ApiConfig> {
  const parsed = parseEnvironment(ApiEnvironmentSchema, environment);
  const secretReader = options.secretReader ?? new AwsSecretReader();
  assertExclusivePair(
    parsed.DATABASE_URL,
    parsed.DB_SECRET_ARN,
    "DATABASE_URL",
    "DB_SECRET_ARN",
  );
  assertExclusivePair(
    parsed.SHOPIFY_API_SECRET,
    parsed.SHOPIFY_API_SECRET_ARN,
    "SHOPIFY_API_SECRET",
    "SHOPIFY_API_SECRET_ARN",
  );
  assertExclusivePair(
    parsed.OPERATOR_TOKEN,
    parsed.OPERATOR_TOKEN_SECRET_ARN,
    "OPERATOR_TOKEN",
    "OPERATOR_TOKEN_SECRET_ARN",
  );
  assertAwsRegionWhenNeeded(parsed);

  const [database, shopifyApiSecret, operatorToken] = await Promise.all([
    resolveDatabaseConfig(parsed, secretReader),
    resolveValueOrSecret({
      directValue: parsed.SHOPIFY_API_SECRET,
      secretArn: parsed.SHOPIFY_API_SECRET_ARN,
      region: parsed.AWS_REGION,
      reader: secretReader,
      label: "SHOPIFY_API_SECRET",
      jsonKeys: ["SHOPIFY_API_SECRET", "shopifyApiSecret", "apiSecret"],
    }),
    resolveValueOrSecret({
      directValue: parsed.OPERATOR_TOKEN,
      secretArn: parsed.OPERATOR_TOKEN_SECRET_ARN,
      region: parsed.AWS_REGION,
      reader: secretReader,
      label: "OPERATOR_TOKEN",
      jsonKeys: ["OPERATOR_TOKEN", "operatorToken", "token"],
    }),
  ]);

  return {
    awsRegion: parsed.AWS_REGION,
    database,
    logLevel: parsed.LOG_LEVEL,
    nodeEnv: parsed.NODE_ENV,
    operatorToken,
    port: parsed.PORT,
    shopifyApiSecret,
    shutdownGraceMs: parsed.SHUTDOWN_GRACE_MS,
    sqsQueueUrl: parsed.SQS_QUEUE_URL,
    webhookBodyLimitBytes: parsed.WEBHOOK_BODY_LIMIT_BYTES,
  };
}

export async function loadWorkerConfig(
  environment: NodeJS.ProcessEnv = process.env,
  options: LoadOptions = {},
): Promise<WorkerConfig> {
  const parsed = parseEnvironment(WorkerEnvironmentSchema, environment);
  const secretReader = options.secretReader ?? new AwsSecretReader();
  assertExclusivePair(
    parsed.DATABASE_URL,
    parsed.DB_SECRET_ARN,
    "DATABASE_URL",
    "DB_SECRET_ARN",
  );
  assertAwsRegionWhenNeeded(parsed);
  const database = await resolveDatabaseConfig(parsed, secretReader);

  return {
    awsRegion: parsed.AWS_REGION,
    database,
    logLevel: parsed.LOG_LEVEL,
    nodeEnv: parsed.NODE_ENV,
    shutdownGraceMs: parsed.SHUTDOWN_GRACE_MS,
    sqsQueueUrl: parsed.SQS_QUEUE_URL,
    workerBatchSize: parsed.WORKER_BATCH_SIZE,
    workerMaxConsecutiveErrors: parsed.WORKER_MAX_CONSECUTIVE_ERRORS,
    workerPollMs: parsed.WORKER_POLL_MS,
    workerProbeTimeoutMs: parsed.WORKER_PROBE_TIMEOUT_MS,
    workerVisibilityTimeoutSeconds: parsed.WORKER_VISIBILITY_TIMEOUT_SECONDS,
  };
}

async function resolveDatabaseConfig(
  environment: CommonEnvironment,
  secretReader: SecretReader,
): Promise<DatabaseConfig> {
  assertExclusivePair(
    environment.DATABASE_URL,
    environment.DB_SECRET_ARN,
    "DATABASE_URL",
    "DB_SECRET_ARN",
  );

  let databaseUrl: string;
  let source: DatabaseConfig["source"];
  if (environment.DATABASE_URL) {
    databaseUrl = validatePostgresUrl(environment.DATABASE_URL);
    source = "environment";
  } else {
    if (!environment.DB_SECRET_ARN) {
      throw new ConfigError(
        "Exactly one of DATABASE_URL or DB_SECRET_ARN must be configured",
      );
    }
    if (!environment.AWS_REGION) {
      throw new ConfigError("AWS_REGION is required when DB_SECRET_ARN is configured");
    }
    const rawSecret = await safelyReadSecret(
      secretReader,
      environment.DB_SECRET_ARN,
      environment.AWS_REGION,
      "DB_SECRET_ARN",
    );
    databaseUrl = databaseUrlFromSecret(rawSecret, {
      ...(environment.DB_NAME ? { database: environment.DB_NAME } : {}),
      ...(environment.DB_HOST ? { host: environment.DB_HOST } : {}),
      ...(environment.DB_PORT ? { port: environment.DB_PORT } : {}),
    });
    source = "secrets-manager";
  }

  databaseUrl = enforceDatabaseTls(
    databaseUrl,
    environment.NODE_ENV,
    environment.DB_SSL_ROOT_CERT,
  );

  return {
    connectTimeoutMs: environment.DB_CONNECT_TIMEOUT_MS,
    databaseUrl,
    poolMax: environment.DB_POOL_MAX,
    queryTimeoutMs: environment.DB_QUERY_TIMEOUT_MS,
    source,
  };
}

export function enforceDatabaseTls(
  databaseUrl: string,
  nodeEnv: CommonEnvironment["NODE_ENV"],
  sslRootCertPath?: string,
): string {
  const validated = validatePostgresUrl(databaseUrl);
  if (nodeEnv !== "production") {
    return validated;
  }

  const url = new URL(validated);
  if (isLoopbackHost(url.hostname)) {
    return validated;
  }

  const sslMode = url.searchParams.get("sslmode");
  if (sslMode === null) {
    url.searchParams.set("sslmode", "verify-full");
  } else if (sslMode.toLowerCase() !== "verify-full") {
    throw new ConfigError(
      "Production PostgreSQL connections must use sslmode=verify-full",
    );
  }

  if (
    url.searchParams.get("sslrootcert") === null &&
    sslRootCertPath !== undefined
  ) {
    url.searchParams.set("sslrootcert", sslRootCertPath);
  }
  if (
    isRdsHostname(url.hostname) &&
    url.searchParams.get("sslrootcert") === null
  ) {
    throw new ConfigError(
      "Amazon RDS PostgreSQL connections require DB_SSL_ROOT_CERT or sslrootcert",
    );
  }
  return url.toString();
}

function parseEnvironment<T extends z.ZodTypeAny>(
  schema: T,
  environment: NodeJS.ProcessEnv,
): z.infer<T> {
  const result = schema.safeParse(environment);
  if (!result.success) {
    const names = [
      ...new Set(
        result.error.issues
          .map((issue) => issue.path[0])
          .filter((name): name is string => typeof name === "string"),
      ),
    ];
    throw new ConfigError(
      names.length > 0
        ? `Invalid configuration for: ${names.join(", ")}`
        : "Invalid runtime configuration",
    );
  }
  return result.data;
}

function assertAwsRegionWhenNeeded(
  environment:
    | ServiceEnvironment
    | ApiEnvironment
    | WorkerEnvironment,
): void {
  const secretArns =
    "SHOPIFY_API_SECRET_ARN" in environment
      ? [
          environment.SHOPIFY_API_SECRET_ARN,
          environment.OPERATOR_TOKEN_SECRET_ARN,
        ]
      : [];
  const needsRegion =
    environment.DB_SECRET_ARN !== undefined ||
    secretArns.some((value) => value !== undefined) ||
    environment.SQS_QUEUE_URL !== undefined;
  if (needsRegion && !environment.AWS_REGION) {
    throw new ConfigError(
      "AWS_REGION is required when a secret ARN or SQS_QUEUE_URL is configured",
    );
  }
}

function assertExclusivePair(
  directValue: string | undefined,
  secretArn: string | undefined,
  directName: string,
  arnName: string,
): void {
  if ((directValue === undefined) === (secretArn === undefined)) {
    throw new ConfigError(
      `Exactly one of ${directName} or ${arnName} must be configured`,
    );
  }
}

interface ResolveSecretOptions {
  directValue: string | undefined;
  jsonKeys: readonly string[];
  label: string;
  reader: SecretReader;
  region: string | undefined;
  secretArn: string | undefined;
}

async function resolveValueOrSecret(options: ResolveSecretOptions): Promise<string> {
  assertExclusivePair(
    options.directValue,
    options.secretArn,
    options.label,
    `${options.label}_ARN`,
  );
  if (options.directValue !== undefined) {
    return options.directValue;
  }
  if (!options.secretArn || !options.region) {
    throw new ConfigError(`${options.label} secret configuration is incomplete`);
  }
  const rawSecret = await safelyReadSecret(
    options.reader,
    options.secretArn,
    options.region,
    `${options.label}_ARN`,
  );
  return scalarValueFromSecret(rawSecret, options.jsonKeys, options.label);
}

async function safelyReadSecret(
  reader: SecretReader,
  arn: string,
  region: string,
  label: string,
): Promise<string> {
  try {
    const value = await reader.readSecret(arn, region);
    if (value.trim() === "") {
      throw new ConfigError(`${label} resolved to an empty secret`);
    }
    return value;
  } catch (error) {
    if (error instanceof ConfigError) {
      throw error;
    }
    throw new ConfigError(`Unable to load ${label} from Secrets Manager`);
  }
}

function scalarValueFromSecret(
  rawSecret: string,
  jsonKeys: readonly string[],
  label: string,
): string {
  const parsed = tryParseJson(rawSecret);
  if (parsed === undefined) {
    return rawSecret;
  }
  if (typeof parsed === "string" && parsed.length > 0) {
    return parsed;
  }
  if (isRecord(parsed)) {
    for (const key of jsonKeys) {
      const value = parsed[key];
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    }
  }
  throw new ConfigError(`${label} secret has an unsupported shape`);
}

export interface RdsConnectionMetadata {
  database?: string;
  host?: string;
  port?: number;
}

export function databaseUrlFromSecret(
  rawSecret: string,
  metadata: RdsConnectionMetadata = {},
): string {
  const parsed = tryParseJson(rawSecret);
  if (parsed === undefined) {
    return validatePostgresUrl(rawSecret);
  }
  if (typeof parsed === "string") {
    return validatePostgresUrl(parsed);
  }
  if (!isRecord(parsed)) {
    throw new ConfigError("DB_SECRET_ARN secret has an unsupported shape");
  }

  for (const key of ["DATABASE_URL", "databaseUrl", "url", "connectionString"]) {
    const value = parsed[key];
    if (typeof value === "string" && value.length > 0) {
      return validatePostgresUrl(value);
    }
  }

  const host = optionalStringField(parsed, "host") ?? metadata.host;
  const username =
    optionalStringField(parsed, "username") ??
    optionalStringField(parsed, "user");
  const password = requiredStringField(parsed, "password");
  const database =
    optionalStringField(parsed, "dbname") ??
    optionalStringField(parsed, "database") ??
    optionalStringField(parsed, "dbName") ??
    metadata.database;
  if (!host) {
    throw new ConfigError(
      "DB_SECRET_ARN secret is missing host; configure DB_HOST",
    );
  }
  if (!username) {
    throw new ConfigError("DB_SECRET_ARN secret is missing username");
  }
  if (!database) {
    throw new ConfigError(
      "DB_SECRET_ARN secret is missing database; configure DB_NAME",
    );
  }

  const portValue = parsed.port ?? metadata.port ?? 5432;
  const port =
    typeof portValue === "number" || typeof portValue === "string"
      ? Number(portValue)
      : Number.NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new ConfigError("DB_SECRET_ARN secret has an invalid port");
  }

  const url = new URL("postgresql://placeholder");
  url.hostname = host;
  url.port = String(port);
  url.username = username;
  url.password = password;
  url.pathname = `/${database}`;
  url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}

function validatePostgresUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError("Database connection URL is invalid");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new ConfigError("Database connection URL must use PostgreSQL");
  }
  if (!url.hostname || !url.pathname || url.pathname === "/") {
    throw new ConfigError("Database connection URL is incomplete");
  }
  return value;
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
}

function isRdsHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized.endsWith(".rds.amazonaws.com") ||
    normalized.endsWith(".rds.amazonaws.com.cn")
  );
}

function tryParseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredStringField(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = optionalStringField(record, key);
  if (!value) {
    throw new ConfigError(`DB_SECRET_ARN secret is missing ${key}`);
  }
  return value;
}

function optionalStringField(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
