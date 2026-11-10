/**
 * Refresh the committed Admin API schema (RP-25):
 *
 *   pnpm --filter rewards schema:admin            # the version shopify.app.toml speaks
 *   pnpm --filter rewards schema:admin 2027-01    # another version
 *   pnpm --filter rewards schema:admin --check    # exit 1 if the fixture differs; writes nothing
 *
 * It introspects Shopify's public docs proxy (scripts/lib/admin-schema.ts),
 * with no token, and writes test/fixtures/shopify/admin-<version>.graphql,
 * removing any other admin-*.graphql there. When the version changes, bump
 * the tomls, app/shopify.server.ts and .graphqlrc.ts with it:
 * test/unit/shopify/graphql-schema.test.ts refuses any disagreement.
 *
 * `--check` compares bytes, so a graphql-js upgrade that prints the schema
 * differently reports drift even when Shopify changed nothing.
 *
 * If the proxy ever stops answering, the fallback is a one-off by hand, not
 * part of this script: POST the same introspection (introspectionQuery()) to
 * a dev store's /admin/api/<version>/graphql.json with its Admin token, and
 * print the answer with printSchema(buildClientSchema(data)).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import { ADMIN_SCHEMA_DIR, adminSchemaFile, fetchAdminSchemaSdl } from "./lib/admin-schema";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const say = (line: string) => console.log(`[schema:admin] ${line}`);

function readFile(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const toml = parse(readFileSync(resolve(APP, "shopify.app.toml"), "utf8")) as { webhooks?: { api_version?: string } };
  const version = args.find((a) => !a.startsWith("--")) ?? toml.webhooks?.api_version;
  if (!version) throw new Error("no version given and shopify.app.toml has no webhooks.api_version");

  const target = adminSchemaFile(version);
  const sdl = await fetchAdminSchemaSdl(version);
  const summary = `${Buffer.byteLength(sdl)} bytes, sha256 ${createHash("sha256").update(sdl).digest("hex")}`;

  if (check) {
    if (readFile(resolve(APP, target)) === sdl) {
      say(`${target} matches Shopify's ${version} schema (${summary})`);
      return 0;
    }
    say(`${target} differs from Shopify's ${version} schema (${summary}); run without --check to refresh it`);
    return 1;
  }

  mkdirSync(resolve(APP, ADMIN_SCHEMA_DIR), { recursive: true });
  writeFileSync(resolve(APP, target), sdl);
  say(`wrote ${target} (${summary})`);
  for (const name of readdirSync(resolve(APP, ADMIN_SCHEMA_DIR))) {
    if (/^admin-.*\.graphql$/.test(name) && `${ADMIN_SCHEMA_DIR}/${name}` !== target) {
      rmSync(resolve(APP, ADMIN_SCHEMA_DIR, name));
      say(`removed ${ADMIN_SCHEMA_DIR}/${name}`);
    }
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(`[schema:admin] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
