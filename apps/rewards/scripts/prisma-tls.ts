/**
 * Run a Prisma CLI command against the database in REWARDS_DIRECT_URL over
 * TLS verified the same way as the app at runtime.
 *
 *   REWARDS_DIRECT_URL=... pnpm --filter rewards migrate:deploy
 *   REWARDS_DIRECT_URL=... pnpm --filter rewards exec tsx scripts/prisma-tls.ts <prisma args>
 *
 * Why: Prisma's schema engine (migrate, db execute, diff) does its own TLS.
 * With `sslmode=require` it accepts any certificate, and with
 * `sslaccept=strict` it uses the OS verifier, which on macOS rejects
 * Supabase's chain even with the right root (the 5-year server certificate
 * fails Apple's TLS policy). So for a remote host this starts a loopback
 * bridge (scripts/lib/postgres-tls-bridge.ts) whose upstream TLS is
 * verified against the bundled Supabase root CA with hostname checking,
 * using the app's own settings (app/db/database-connection.server.ts).
 * Loopback URLs (local development, CI) are passed through unchanged.
 *
 * Prisma sees REWARDS_DATABASE_URL and REWARDS_DIRECT_URL both pointed at
 * REWARDS_DIRECT_URL's database: migrations use the session-mode connection
 * (port 5432).
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import type { AddressInfo, Server } from "node:net";
import type { ConnectionOptions } from "node:tls";
import { databaseConnectionConfig } from "../app/db/database-connection.server";
import { bridgedUrl, startVerifiedBridge } from "./lib/postgres-tls-bridge";

const LOG_PREFIX = "[prisma-tls]";

async function main(args: string[]): Promise<number> {
  const directUrl = process.env.REWARDS_DIRECT_URL;
  if (!directUrl) {
    console.error(`${LOG_PREFIX} REWARDS_DIRECT_URL is not set`);
    return 1;
  }
  if (new URL(directUrl).searchParams.get("pgbouncer") === "true") {
    // Prisma's schema engine needs a session; through the transaction pooler
    // (REWARDS_DATABASE_URL, port 6543) it stalls instead of failing.
    console.error(`${LOG_PREFIX} REWARDS_DIRECT_URL must be the session-mode connection (port 5432), not the pgbouncer=true pooler URL`);
    return 1;
  }
  const { pool } = databaseConnectionConfig(directUrl);

  let bridge: Server | undefined;
  let url = directUrl;
  if (pool.ssl) {
    bridge = await startVerifiedBridge({
      host: pool.host!,
      port: pool.port!,
      tls: pool.ssl as ConnectionOptions,
    });
    const { port } = bridge.address() as AddressInfo;
    url = bridgedUrl(directUrl, port);
    console.error(`${LOG_PREFIX} bridging ${pool.host}:${pool.port} via 127.0.0.1:${port}; upstream TLS must verify against the bundled CA`);
  }

  const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js");
  const child = spawn(process.execPath, [prismaCli, ...args], {
    stdio: "inherit",
    env: { ...process.env, REWARDS_DATABASE_URL: url, REWARDS_DIRECT_URL: url },
  });
  const code = await new Promise<number>((resolve) => {
    child.on("exit", (exitCode, signal) => resolve(exitCode ?? (signal ? 1 : 0)));
  });
  bridge?.close();
  return code;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: Error) => {
    console.error(LOG_PREFIX, error.message);
    process.exit(1);
  },
);
