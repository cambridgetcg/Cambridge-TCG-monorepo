/**
 * The guard for the test scripts in scripts/ that write rows. They run only
 * against a local test database, and clean up even when they fail.
 *
 * Why: they wrote to whatever database DATABASE_URL named, and deleted their
 * rows only when every line before that had worked.
 *
 * Import it first and call it before anything else. App modules read
 * DATABASE_URL when they are imported, so import those after the call:
 *
 *   import { cleanUp, requireLocalTestDatabase } from "./lib/local-test-database.mjs";
 *
 *   const pool = requireLocalTestDatabase();
 *   const { listUserDecks } = await import("../src/lib/decks/db");
 *
 *   const users = [];
 *   try {
 *     ...
 *   } finally {
 *     await cleanUp(pool, () => cleanup(users));
 *   }
 *
 * Add an id to its list on the line after its INSERT. End a failed run with
 * process.exitCode = 1, because process.exit() skips `finally`. The run gets
 * none of the shell's other settings: a script sets what it needs after the
 * call, and a password has to be in the URL.
 *
 * Use a database that holds nothing else. Ctrl-C skips the cleanup, and so do
 * an error in code that nobody awaits and an await that never ends. After one
 * of those, drop the database and make it again.
 *
 * To run one, with PostgreSQL 16 on the PATH, in apps/storefront:
 *
 *   D=$(mktemp -d)/pg; P=56011
 *   export DATABASE_URL=postgres://tester@127.0.0.1:$P/ctcg_test
 *   initdb -D $D -U tester -A trust -E UTF8 --locale=C
 *   openssl req -new -x509 -days 30 -nodes -subj /CN=localhost -out $D/server.crt -keyout $D/server.key
 *   chmod 600 $D/server.key
 *   LC_ALL=C pg_ctl -D $D -l $D/log -w -o "-p $P -c listen_addresses=127.0.0.1 -c unix_socket_directories='' -c ssl=on" start
 *   createdb -h 127.0.0.1 -p $P -U tester ctcg_test
 *   node scripts/migrate.mjs --no-ssl
 *   psql $DATABASE_URL -c "ALTER TYPE dispute_status ADD VALUE 'escalated'"
 *   node scripts/migrate.mjs --no-ssl
 *   pnpm exec tsx scripts/test-notifications.mts
 *   pg_ctl -D $D -m fast stop
 *
 * The folder $D stays; delete it when you are done. The first migrate stops at
 * 0106, which needs that enum value; the second finishes. The certificate is
 * there because packages/db always asks for TLS. Without it, app code fails with
 * "Client network socket disconnected before secure TLS connection was established".
 */
import pg from "pg";

// The whole URL must look like this. pg and postgres.js read unusual URLs
// differently from new URL() and from each other: ?host= moves pg to another
// server, a comma moves postgres.js, and an empty host means PGHOST.
const LOCAL_URL =
  /^postgres(?:ql)?:\/\/([A-Za-z0-9_.-]+(?::[A-Za-z0-9_.~-]*)?@)?(?:127\.0\.0\.1|localhost)(?::([0-9]{1,5}))?\/([A-Za-z0-9_-]{1,63})$/;
// A tunnel to another server looks local too, so the name has to say test.
const TEST_WORD = /(?:^|[_-])test(?:[_-]|$)/i;

/** The URL a test script may use, or why the one it was given is refused. A refusal never repeats the URL. */
export function readLocalTestDatabase(raw) {
  const value = (raw ?? "").trim();
  if (!value) return { refusal: "DATABASE_URL is not set." };
  const [, login = "", digits = "5432", name] = LOCAL_URL.exec(value) ?? [];
  const port = Number(digits);
  if (!name || port < 1 || port > 65_535) {
    return {
      refusal:
        "DATABASE_URL is not a plain local URL, like postgres://user:password@127.0.0.1:5432/name. " +
        "The host must be 127.0.0.1 or localhost, with no query string, socket or encoded character. " +
        "The user name and password may hold only letters, digits and . _ - (and ~ in the password).",
    };
  }
  if (!TEST_WORD.test(name)) {
    return { refusal: 'The database name must have "test" as a word of its own, like ctcg_test.' };
  }
  // The address and port are spelled out, so neither a name lookup nor PGPORT decides them.
  return { url: `postgres://${login}127.0.0.1:${port}/${name}` };
}

/** Refuses (exit 2, nothing run) unless DATABASE_URL names a local test database. Returns a pool on it. */
export function requireLocalTestDatabase() {
  const { url, refusal } = readLocalTestDatabase(process.env.DATABASE_URL);
  if (!url) {
    console.error(
      `Refusing to run: test scripts write rows, so they run only against a local test database.\n${refusal}\n` +
      "The top of scripts/lib/local-test-database.mjs says how to make one.",
    );
    process.exit(2);
    throw new Error(refusal); // where process.exit is stubbed
  }
  // Another database URL, PG*, AWS_*, STRIPE_* or a mail setting left over from
  // .env.local would reach a real service, so nothing of the shell's is kept.
  for (const name of Object.keys(process.env)) delete process.env[name];
  Object.assign(process.env, {
    DATABASE_URL: url,
    DB_IDLE_TIMEOUT_S: "1", // the app's idle connections close, so the run ends 20 seconds sooner
    WHOLESALE_API_URL: "http://127.0.0.1:9", // unset means the live site; nothing answers here
    NO_PROXY: "*", // Node keeps the proxy it started with, and asks this before each call
    no_proxy: "*",
  });
  const pool = new pg.Pool({ connectionString: url });
  pool.on("error", () => {}); // an idle connection dropped; the next query reports it
  return pool;
}

/**
 * For `finally`. Runs every step even when one fails, then closes the pool.
 * Never throws, so the error that stopped the test is the one Node reports. A
 * failed step is printed beside it, and fails the run.
 */
export async function cleanUp(pool, ...steps) {
  // Some app code writes without being awaited (notifications, the admin log).
  // Those rows land first, so the steps delete them too.
  await new Promise((resolve) => setTimeout(resolve, 250));
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      process.exitCode = 1;
      console.error(`Cleanup failed, so test rows may remain in the local test database: ${error?.message || error}`);
    }
  }
  await pool.end().catch(() => {});
}
