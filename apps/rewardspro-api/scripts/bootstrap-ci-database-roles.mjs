import pg from "pg";

const { Client } = pg;

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
  !/^[0-9a-f]{48}$/.test(apiPassword) ||
  !/^[0-9a-f]{48}$/.test(workerPassword)
) {
  throw new Error("CI database role passwords must be 24 random hex bytes");
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

const quoteLiteral = (value) => `'${value.replaceAll("'", "''")}'`;
const client = new Client({ connectionString: adminDatabaseUrl });

try {
  await client.connect();
  await client.query(`
    CREATE ROLE rewardspro_ci_api
      LOGIN INHERIT
      PASSWORD ${quoteLiteral(apiPassword)}
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    CREATE ROLE rewardspro_ci_worker
      LOGIN INHERIT
      PASSWORD ${quoteLiteral(workerPassword)}
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

    ALTER ROLE rewardspro_ci_api
      IN DATABASE rewardspro SET search_path = pg_catalog;
    ALTER ROLE rewardspro_ci_worker
      IN DATABASE rewardspro SET search_path = pg_catalog;

    GRANT CONNECT ON DATABASE rewardspro
      TO rewardspro_ci_api, rewardspro_ci_worker;
    GRANT USAGE ON SCHEMA public, commerce
      TO rewardspro_ci_api, rewardspro_ci_worker;

    GRANT yu_reader TO rewardspro_ci_api
      WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;
    GRANT EXECUTE ON FUNCTION public.rp_ingest_shopify_event(
      uuid,
      text,
      text,
      text,
      text,
      jsonb,
      timestamptz,
      boolean
    ) TO rewardspro_ci_api;

    GRANT yu_writer TO rewardspro_ci_worker
      WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;
    GRANT SELECT ON TABLE public.rp_commerce_connection
      TO rewardspro_ci_worker;
    GRANT SELECT ON TABLE commerce.events
      TO rewardspro_ci_worker;
    GRANT SELECT, DELETE ON TABLE commerce.event_payloads
      TO rewardspro_ci_worker;
    GRANT SELECT, UPDATE ON TABLE public.rp_commerce_event_state
      TO rewardspro_ci_worker;
    GRANT SELECT, INSERT ON TABLE commerce.orders, commerce.line_items
      TO rewardspro_ci_worker;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rp_worker_probe
      TO rewardspro_ci_worker;
  `);
} finally {
  await client.end();
}
