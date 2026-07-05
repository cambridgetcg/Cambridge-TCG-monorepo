// Shared DB-target guard for the wholesale operational scripts
// (seed-game.mjs, backfill-pokemon-names.mjs). One truth in one place:
// a script only touches a non-localhost database when the operator says
// --allow-prod out loud. The guard runs BEFORE any connection is opened.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Validate the target DB URL against the localhost-unless---allow-prod rule.
 *
 * @param {string | undefined} rawUrl  connection string (env or --url)
 * @param {{ allowProd: boolean }} opts
 * @returns {{ url: string, isLocal: boolean, host: string }}
 */
export function guardDbUrl(rawUrl, { allowProd }) {
  if (!rawUrl || !rawUrl.trim()) {
    console.error("Missing DATABASE_URL (env or --url).");
    process.exit(1);
  }
  const url = rawUrl.trim();

  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    console.error(`Could not parse DB URL to determine its host: ${url}`);
    process.exit(1);
  }

  const isLocal = LOCAL_HOSTS.has(host);
  if (!isLocal && !allowProd) {
    console.error(
      `Refusing to touch non-localhost database host "${host}".\n` +
        `This script writes. If you really mean the remote/production DB, ` +
        `re-run with --allow-prod.`,
    );
    process.exit(1);
  }

  return { url, isLocal, host };
}

/** Tiny argv reader: value flags return the next token, boolean flags true/false. */
export function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function argFlag(name) {
  return process.argv.includes(name);
}
