import { describe, expect, it, vi } from "vitest";
import {
  DescribeSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

import { AwsRuntimeSecretStore } from "../src/aws-runtime-secret-store.js";
import {
  bootstrapDatabaseRoles,
  parseRuntimeDatabaseSecret,
  postgresScramVerifier,
  type RuntimeDatabaseEndpoint,
} from "../src/database-role-bootstrap.js";
import type { MigrationFile } from "../src/migrations.js";

const endpoint: RuntimeDatabaseEndpoint = {
  database: "rewardspro",
  host: "rewardspro.example.eu-west-2.rds.amazonaws.com",
  port: 5432,
  sslRootCert: "/app/certs/eu-west-2-bundle.pem",
};
const password = "a".repeat(64);
const workerPassword = "b".repeat(64);

function runtimeSecret(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    dbname: "rewardspro",
    engine: "postgres",
    host: endpoint.host,
    managedBy: "rewardspro-runtime-bootstrap",
    password,
    port: 5432,
    schemaVersion: 1,
    username: "rewardspro_api",
    ...overrides,
  });
}

describe("runtime database secret contract", () => {
  it("accepts only the exact bootstrap-owned endpoint and role shape", () => {
    expect(
      parseRuntimeDatabaseSecret(runtimeSecret(), endpoint, "rewardspro_api"),
    ).toEqual({
      dbname: "rewardspro",
      engine: "postgres",
      host: endpoint.host,
      managedBy: "rewardspro-runtime-bootstrap",
      password,
      port: 5432,
      schemaVersion: 1,
      username: "rewardspro_api",
    });
  });

  it("refuses unowned, mismatched, weak, or extended secret values", () => {
    for (const candidate of [
      "postgresql://rewardspro_api:password@example/rewardspro",
      runtimeSecret({ managedBy: undefined }),
      runtimeSecret({ host: "other.example" }),
      runtimeSecret({ password: "too-short" }),
      runtimeSecret({ unexpected: "field" }),
      runtimeSecret({ username: "rewardspro_worker" }),
    ]) {
      expect(() =>
        parseRuntimeDatabaseSecret(candidate, endpoint, "rewardspro_api"),
      ).toThrow();
    }
  });
});

describe("AWS runtime secret adapter", () => {
  it("puts one AWSCURRENT version only when the placeholder is empty", async () => {
    const arn =
      "arn:aws:secretsmanager:eu-west-2:123456789012:secret:test/database/api-abc";
    const sender = vi.fn(async (command: unknown) => {
      if (command instanceof DescribeSecretCommand) {
        return { ARN: arn, VersionIdsToStages: {} };
      }
      if (command instanceof PutSecretValueCommand) {
        return { ARN: arn, VersionId: "version-1" };
      }
      throw new Error("unexpected command");
    });
    const store = new AwsRuntimeSecretStore("eu-west-2", sender);

    expect(await store.readCurrent(arn)).toBeUndefined();
    await store.writeCurrent(arn, runtimeSecret());

    const put = sender.mock.calls
      .map(([command]) => command)
      .find((command) => command instanceof PutSecretValueCommand);
    expect(put).toBeInstanceOf(PutSecretValueCommand);
    expect((put as PutSecretValueCommand).input).toMatchObject({
      SecretId: arn,
      SecretString: runtimeSecret(),
      VersionStages: ["AWSCURRENT"],
    });
    expect((put as PutSecretValueCommand).input.ClientRequestToken).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });

  it("reads an existing current string and refuses to overwrite it", async () => {
    const arn =
      "arn:aws:secretsmanager:eu-west-2:123456789012:secret:test/database/api-abc";
    const sender = vi.fn(async (command: unknown) => {
      if (command instanceof DescribeSecretCommand) {
        return {
          ARN: arn,
          VersionIdsToStages: { "version-1": ["AWSCURRENT"] },
        };
      }
      if (command instanceof GetSecretValueCommand) {
        return { ARN: arn, SecretString: runtimeSecret() };
      }
      throw new Error("unexpected command");
    });
    const store = new AwsRuntimeSecretStore("eu-west-2", sender);

    expect(await store.readCurrent(arn)).toBe(runtimeSecret());
    await expect(store.writeCurrent(arn, "replacement")).rejects.toThrow(
      "became populated",
    );
    expect(
      sender.mock.calls.some(
        ([command]) => command instanceof PutSecretValueCommand,
      ),
    ).toBe(false);
  });

  it("fails closed on an unexpected ARN or empty current value", async () => {
    const arn =
      "arn:aws:secretsmanager:eu-west-2:123456789012:secret:test/database/api-abc";
    const wrongArnStore = new AwsRuntimeSecretStore(
      "eu-west-2",
      vi.fn(async () => ({ ARN: `${arn}-wrong`, VersionIdsToStages: {} })),
    );
    await expect(wrongArnStore.readCurrent(arn)).rejects.toThrow(
      "unexpected secret",
    );

    const emptyStore = new AwsRuntimeSecretStore(
      "eu-west-2",
      vi.fn(async (command: unknown) => {
        if (command instanceof DescribeSecretCommand) {
          return {
            ARN: arn,
            VersionIdsToStages: { "version-1": ["AWSCURRENT"] },
          };
        }
        return { ARN: arn, SecretString: "" };
      }),
    );
    await expect(emptyStore.readCurrent(arn)).rejects.toThrow(
      "non-empty string",
    );
  });
});

describe("PostgreSQL password verifier", () => {
  it("keeps the clear credential out of deterministic SCRAM-SHA-256 DDL input", () => {
    const verifier = postgresScramVerifier(password, Buffer.alloc(16, 7));

    expect(verifier).toMatch(
      /^SCRAM-SHA-256\$4096:[A-Za-z0-9+/]+=*\$[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*$/,
    );
    expect(verifier).not.toContain(password);
    expect(postgresScramVerifier(password, Buffer.alloc(16, 7))).toBe(verifier);
  });

  it("rejects weak credentials and undersized salts", () => {
    expect(() =>
      postgresScramVerifier("too-short", Buffer.alloc(16)),
    ).toThrow();
    expect(() => postgresScramVerifier(password, Buffer.alloc(15))).toThrow();
  });
});

describe("database role bootstrap state machine", () => {
  it("writes empty placeholders before DDL and makes a healthy retry a no-op", async () => {
    const harness = bootstrapHarness();

    const first = await bootstrapDatabaseRoles(harness.options);
    expect(first).toEqual({
      createdSecretVersions: ["api", "worker"],
      reusedSecretVersions: [],
    });
    expect(harness.events.indexOf("secret:write:api")).toBeGreaterThan(
      harness.events.indexOf("lock"),
    );
    expect(harness.events.indexOf("secret:write:worker")).toBeLessThan(
      harness.events.indexOf("ddl"),
    );
    expect(harness.roles).toEqual(
      new Set(["rewardspro_api", "rewardspro_worker"]),
    );

    const eventCount = harness.events.length;
    const second = await bootstrapDatabaseRoles(harness.options);
    expect(second).toEqual({
      createdSecretVersions: [],
      reusedSecretVersions: ["api", "worker"],
    });
    expect(harness.events.slice(eventCount)).not.toContain("ddl");
    expect(
      harness.events.filter((event) => event.startsWith("secret:write:")),
    ).toHaveLength(2);
  });

  it("converges after one secret write succeeds and the next write fails", async () => {
    const harness = bootstrapHarness({ failWorkerWriteOnce: true });

    await expect(bootstrapDatabaseRoles(harness.options)).rejects.toThrow(
      "injected worker secret failure",
    );
    const apiSecretBeforeRetry = harness.secrets.get("secret/api");
    expect(apiSecretBeforeRetry).toBeDefined();
    expect(harness.secrets.has("secret/worker")).toBe(false);
    expect(harness.roles.size).toBe(0);

    const retry = await bootstrapDatabaseRoles(harness.options);
    expect(retry).toEqual({
      createdSecretVersions: ["worker"],
      reusedSecretVersions: ["api"],
    });
    expect(harness.secrets.get("secret/api")).toBe(apiSecretBeforeRetry);
    expect(harness.roles).toEqual(
      new Set(["rewardspro_api", "rewardspro_worker"]),
    );
  });

  it("refuses a pre-existing runtime role without a managed secret", async () => {
    const harness = bootstrapHarness({
      roles: ["rewardspro_api"],
    });

    await expect(bootstrapDatabaseRoles(harness.options)).rejects.toThrow(
      "Existing runtime database role has no managed credential secret",
    );
    expect(harness.secrets.size).toBe(0);
    expect(harness.events).not.toContain("ddl");
  });

  it("checks the exact migration ledger before reading or writing secrets", async () => {
    const harness = bootstrapHarness({ ledgerRows: [] });

    await expect(bootstrapDatabaseRoles(harness.options)).rejects.toThrow(
      "exact migration ledger",
    );
    expect(harness.events.some((event) => event.startsWith("secret:"))).toBe(
      false,
    );
    expect(harness.released).toHaveBeenCalledOnce();
    expect(harness.events).toContain("unlock");
  });
});

function bootstrapHarness(
  overrides: {
    failWorkerWriteOnce?: boolean;
    ledgerRows?: Array<{ checksum_sha256: string; version: string }>;
    roles?: string[];
  } = {},
) {
  const migrationPlan: MigrationFile[] = [
    {
      checksum: "c".repeat(64),
      filename: "0001_test.sql",
      sql: "SELECT 1",
      version: "rewardspro/0001_test",
    },
  ];
  const events: string[] = [];
  const roles = new Set(overrides.roles ?? []);
  const secrets = new Map<string, string>();
  let failWorkerWriteOnce = overrides.failWorkerWriteOnce ?? false;
  const released = vi.fn();
  const client = {
    async query(sql: string) {
      if (sql.includes("pg_advisory_lock")) {
        events.push("lock");
        return { rows: [] };
      }
      if (sql.includes("pg_advisory_unlock")) {
        events.push("unlock");
        return { rows: [] };
      }
      if (sql.includes("current_setting('server_version_num')")) {
        return {
          rows: [
            {
              administrator: "postgres",
              database_name: "rewardspro",
              read_only: false,
              server_version_num: 160_000,
              tls: false,
            },
          ],
        };
      }
      if (sql.includes("FROM public.rp_schema_migration")) {
        return {
          rows:
            overrides.ledgerRows ??
            migrationPlan.map((migration) => ({
              checksum_sha256: migration.checksum,
              version: migration.version,
            })),
        };
      }
      if (sql.includes("FROM pg_catalog.pg_auth_members")) {
        return { rows: [] };
      }
      if (
        sql.includes("FROM pg_catalog.pg_roles") &&
        sql.includes("rolname = ANY")
      ) {
        return { rows: [...roles].map((rolname) => ({ rolname })) };
      }
      if (sql.includes("DO $role_bootstrap$")) {
        events.push("ddl");
        roles.add("rewardspro_api");
        roles.add("rewardspro_worker");
        return { rows: [] };
      }
      return { rows: [] };
    },
    release: released,
  };
  const runtimePoolFactory = vi.fn(() => ({
    async end() {},
    async query() {
      return { rows: [{ ready: true }] };
    },
  }));
  const options = {
    adminPool: {
      async connect() {
        return client;
      },
    } as never,
    adminUsername: "postgres",
    apiSecretArn: "secret/api",
    endpoint: {
      database: "rewardspro",
      host: "127.0.0.1",
      port: 5432,
    },
    migrationPlan,
    passwordFactory(role: "api" | "worker") {
      return role === "api" ? password : workerPassword;
    },
    requireTls: false,
    runtimePoolFactory: runtimePoolFactory as never,
    secretStore: {
      async readCurrent(secretArn: string) {
        events.push(
          `secret:read:${secretArn.endsWith("api") ? "api" : "worker"}`,
        );
        return secrets.get(secretArn);
      },
      async writeCurrent(secretArn: string, secretValue: string) {
        const role = secretArn.endsWith("api") ? "api" : "worker";
        events.push(`secret:write:${role}`);
        if (role === "worker" && failWorkerWriteOnce) {
          failWorkerWriteOnce = false;
          throw new Error("injected worker secret failure");
        }
        secrets.set(secretArn, secretValue);
      },
    },
    workerSecretArn: "secret/worker",
  } as const;
  return { events, options, released, roles, secrets };
}
