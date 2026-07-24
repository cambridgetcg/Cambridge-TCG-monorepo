import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { bootstrapDatabaseRoles } from "../dist/database-role-bootstrap.js";
import { discoverMigrationPlan } from "../dist/migrations.js";

const adminDatabaseUrl = process.env.DATABASE_URL;
const apiPassword = process.env.REWARDSPRO_CI_API_PASSWORD;
const workerPassword = process.env.REWARDSPRO_CI_WORKER_PASSWORD;

if (!adminDatabaseUrl || !apiPassword || !workerPassword) {
  throw new Error("CI database role bootstrap inputs are missing");
}
const runningInGitHubActions =
  process.env.CI === "true" && process.env.GITHUB_ACTIONS === "true";
const githubActionsMode =
  runningInGitHubActions &&
  process.env.REWARDSPRO_CI_DATABASE_CONFORMANCE === "true";
const localDisposableMode =
  !runningInGitHubActions &&
  process.env.REWARDSPRO_LOCAL_DISPOSABLE_DATABASE_CONFORMANCE === "true";
if (!githubActionsMode && !localDisposableMode) {
  throw new Error(
    "Database role bootstrap requires an explicit GitHub Actions or local-disposable opt-in",
  );
}
const expectedAdminUsername = githubActionsMode
  ? "postgres"
  : process.env.REWARDSPRO_CONFORMANCE_ADMIN_USERNAME;
if (!expectedAdminUsername) {
  throw new Error(
    "Local-disposable database role bootstrap requires REWARDSPRO_CONFORMANCE_ADMIN_USERNAME",
  );
}
if (
  !/^[0-9a-f]{64}$/.test(apiPassword) ||
  !/^[0-9a-f]{64}$/.test(workerPassword)
) {
  throw new Error("CI database role passwords must be 32 random hex bytes");
}

const parsedUrl = new URL(adminDatabaseUrl);
if (
  process.env.NODE_ENV !== "test" ||
  !["127.0.0.1", "localhost"].includes(parsedUrl.hostname) ||
  parsedUrl.pathname !== "/rewardspro" ||
  decodeURIComponent(parsedUrl.username) !== expectedAdminUsername
) {
  throw new Error(
    "Database role bootstrap requires the agreed local rewardspro database administrator",
  );
}

const endpoint = {
  database: "rewardspro",
  host: parsedUrl.hostname,
  port: Number(parsedUrl.port || "5432"),
};
const apiSecretArn = "local-disposable/api";
const workerSecretArn = "local-disposable/worker";
const secrets = new Map();
const secretWrites = [];
const adminPool = new pg.Pool({ connectionString: adminDatabaseUrl, max: 2 });
const migrationsDirectory = fileURLToPath(
  new URL("../migrations", import.meta.url),
);

try {
  const bootstrapOptions = {
    adminPool,
    adminUsername: expectedAdminUsername,
    apiSecretArn,
    endpoint,
    migrationPlan: await discoverMigrationPlan(migrationsDirectory),
    passwordFactory(role) {
      return role === "api" ? apiPassword : workerPassword;
    },
    requireTls: false,
    roles: {
      api: "rewardspro_ci_api",
      worker: "rewardspro_ci_worker",
    },
    secretStore: {
      async readCurrent(secretArn) {
        return secrets.get(secretArn);
      },
      async writeCurrent(secretArn, secretValue) {
        if (secrets.has(secretArn)) {
          throw new Error("Local conformance refused a secret overwrite");
        }
        secrets.set(secretArn, secretValue);
        secretWrites.push(secretArn);
      },
    },
    workerSecretArn,
  };
  const first = await bootstrapDatabaseRoles(bootstrapOptions);
  assert.deepEqual(first, {
    createdSecretVersions: ["api", "worker"],
    reusedSecretVersions: [],
  });
  assert.deepEqual(secretWrites, [apiSecretArn, workerSecretArn]);

  const second = await bootstrapDatabaseRoles(bootstrapOptions);
  assert.deepEqual(second, {
    createdSecretVersions: [],
    reusedSecretVersions: ["api", "worker"],
  });
  assert.deepEqual(secretWrites, [apiSecretArn, workerSecretArn]);
} finally {
  await adminPool.end();
}
