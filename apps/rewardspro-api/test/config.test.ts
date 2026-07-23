import { describe, expect, it, vi } from "vitest";

import {
  ConfigError,
  databaseUrlFromSecret,
  loadApiConfig,
  loadDatabaseConfig,
  loadWorkerConfig,
  type SecretReader,
} from "../src/config.js";

const DIRECT_DATABASE_URL =
  "postgresql://rewardspro@127.0.0.1:5432/rewardspro";

describe("configuration", () => {
  it("loads direct local API values without consulting Secrets Manager", async () => {
    const reader: SecretReader = {
      readSecret: vi.fn(async () => {
        throw new Error("should not be called");
      }),
    };

    const config = await loadApiConfig(
      {
        DATABASE_URL: DIRECT_DATABASE_URL,
        OPERATOR_TOKEN: "operator-test-token",
        SHOPIFY_API_SECRET: "shopify-test-secret",
      },
      { secretReader: reader },
    );

    expect(config.port).toBe(3000);
    expect(config.database.source).toBe("environment");
    expect(config.sqsQueueUrl).toBeUndefined();
    expect(reader.readSecret).not.toHaveBeenCalled();
  });

  it("loads only database configuration for the migration entrypoint", async () => {
    const config = await loadDatabaseConfig({
      DATABASE_URL: DIRECT_DATABASE_URL,
      OPERATOR_TOKEN_SECRET_ARN: "must-not-be-read",
      SHOPIFY_API_SECRET_ARN: "must-not-be-read",
    });

    expect(config.databaseUrl).toBe(DIRECT_DATABASE_URL);
  });

  it("does not require or read API secrets in worker configuration", async () => {
    const reader: SecretReader = {
      readSecret: vi.fn(async () => {
        throw new Error("should not be called");
      }),
    };

    const config = await loadWorkerConfig(
      {
        DATABASE_URL: DIRECT_DATABASE_URL,
        OPERATOR_TOKEN_SECRET_ARN: "must-not-be-read",
        SHOPIFY_API_SECRET_ARN: "must-not-be-read",
      },
      { secretReader: reader },
    );

    expect(config.workerBatchSize).toBe(10);
    expect(reader.readSecret).not.toHaveBeenCalled();
  });

  it("requires TLS for non-loopback PostgreSQL URLs in production", async () => {
    const config = await loadWorkerConfig({
      DATABASE_URL: "postgresql://app@database.internal/rewardspro",
      NODE_ENV: "production",
    });

    expect(
      new URL(config.database.databaseUrl).searchParams.get("sslmode"),
    ).toBe("verify-full");
  });

  it("rejects explicitly weak PostgreSQL TLS modes in production", async () => {
    await expect(
      loadWorkerConfig({
        DATABASE_URL:
          "postgresql://app@database.internal/rewardspro?sslmode=disable",
        NODE_ENV: "production",
      }),
    ).rejects.toThrow("sslmode=verify-full");
  });

  it("preserves secure modes and permits loopback development topology", async () => {
    const secure = await loadWorkerConfig({
      DATABASE_URL:
        "postgresql://app@database.internal/rewardspro?sslmode=verify-full",
      NODE_ENV: "production",
    });
    const loopback = await loadWorkerConfig({
      DATABASE_URL: DIRECT_DATABASE_URL,
      NODE_ENV: "production",
    });

    expect(new URL(secure.database.databaseUrl).searchParams.get("sslmode")).toBe(
      "verify-full",
    );
    expect(loopback.database.databaseUrl).toBe(DIRECT_DATABASE_URL);
  });

  it("resolves API values from three purpose-specific secret ARNs", async () => {
    const values: Record<string, string> = {
      "arn:db": JSON.stringify({
        dbname: "rewardspro",
        host: "db.internal",
        password: "p@ss:/word",
        port: 5432,
        username: "app_user",
      }),
      "arn:operator": JSON.stringify({ OPERATOR_TOKEN: "operator-secret" }),
      "arn:shopify": "shopify-secret",
    };
    const reader: SecretReader = {
      readSecret: vi.fn(async (arn) => values[arn] ?? ""),
    };

    const config = await loadApiConfig(
      {
        AWS_REGION: "eu-west-2",
        DB_SECRET_ARN: "arn:db",
        OPERATOR_TOKEN_SECRET_ARN: "arn:operator",
        SHOPIFY_API_SECRET_ARN: "arn:shopify",
      },
      { secretReader: reader },
    );

    const url = new URL(config.database.databaseUrl);
    expect(url.hostname).toBe("db.internal");
    expect(decodeURIComponent(url.password)).toBe("p@ss:/word");
    expect(url.searchParams.get("sslmode")).toBe("verify-full");
    expect(config.operatorToken).toBe("operator-secret");
    expect(config.shopifyApiSecret).toBe("shopify-secret");
    expect(reader.readSecret).toHaveBeenCalledTimes(3);
  });

  it("accepts raw and JSON-wrapped PostgreSQL URLs", () => {
    expect(databaseUrlFromSecret(DIRECT_DATABASE_URL)).toBe(DIRECT_DATABASE_URL);
    expect(
      databaseUrlFromSecret(JSON.stringify({ DATABASE_URL: DIRECT_DATABASE_URL })),
    ).toBe(DIRECT_DATABASE_URL);
  });

  it("completes credentials-only RDS-managed JSON with non-secret metadata", () => {
    const result = databaseUrlFromSecret(
      JSON.stringify({ password: "master-secret", username: "master_user" }),
      {
        database: "rewardspro",
        host: "database.internal",
        port: 5432,
      },
    );
    const url = new URL(result);

    expect(url.hostname).toBe("database.internal");
    expect(url.pathname).toBe("/rewardspro");
    expect(url.username).toBe("master_user");
    expect(url.searchParams.get("sslmode")).toBe("verify-full");
  });

  it("requires and wires an explicit CA bundle for production RDS", async () => {
    await expect(
      loadWorkerConfig({
        DATABASE_URL:
          "postgresql://app@database.eu-west-2.rds.amazonaws.com/rewardspro",
        NODE_ENV: "production",
      }),
    ).rejects.toThrow("DB_SSL_ROOT_CERT");

    const config = await loadWorkerConfig({
      DATABASE_URL:
        "postgresql://app@database.eu-west-2.rds.amazonaws.com/rewardspro",
      DB_SSL_ROOT_CERT: "/app/certs/eu-west-2-bundle.pem",
      NODE_ENV: "production",
    });
    const url = new URL(config.database.databaseUrl);
    expect(url.searchParams.get("sslmode")).toBe("verify-full");
    expect(url.searchParams.get("sslrootcert")).toBe(
      "/app/certs/eu-west-2-bundle.pem",
    );
  });

  it("gives migrations a separate bounded query timeout", async () => {
    const defaults = await loadDatabaseConfig({
      DATABASE_URL: DIRECT_DATABASE_URL,
    });
    const configured = await loadDatabaseConfig({
      DATABASE_URL: DIRECT_DATABASE_URL,
      MIGRATION_QUERY_TIMEOUT_MS: "120000",
    });

    expect(defaults.queryTimeoutMs).toBe(540_000);
    expect(configured.queryTimeoutMs).toBe(120_000);
  });

  it("does not silently migrate the default postgres database", () => {
    expect(() =>
      databaseUrlFromSecret(
        JSON.stringify({
          host: "database.internal",
          password: "master-secret",
          username: "master_user",
        }),
      ),
    ).toThrow("configure DB_NAME");
  });

  it("rejects ambiguous or missing value/ARN pairs", async () => {
    await expect(
      loadApiConfig({
        DATABASE_URL: DIRECT_DATABASE_URL,
        DB_SECRET_ARN: "arn:db",
        OPERATOR_TOKEN: "operator",
        SHOPIFY_API_SECRET: "shopify",
      }),
    ).rejects.toThrow("Exactly one of DATABASE_URL or DB_SECRET_ARN");

    await expect(
      loadApiConfig({
        DATABASE_URL: DIRECT_DATABASE_URL,
        OPERATOR_TOKEN: "operator",
      }),
    ).rejects.toThrow("SHOPIFY_API_SECRET");
  });

  it("requires a region for AWS-backed configuration", async () => {
    await expect(
      loadWorkerConfig({
        DATABASE_URL: DIRECT_DATABASE_URL,
        SQS_QUEUE_URL: "https://sqs.example.invalid/queue",
      }),
    ).rejects.toThrow("AWS_REGION");
  });

  it("never includes a malformed secret value in configuration errors", () => {
    const secretValue = "not-a-url-super-secret-value";
    let thrown: unknown;
    try {
      databaseUrlFromSecret(secretValue);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ConfigError);
    expect(String(thrown)).not.toContain(secretValue);
  });
});
