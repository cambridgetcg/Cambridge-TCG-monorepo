/**
 * Shopify's Admin API schema, as the committed SDL fixture that
 * test/unit/shopify/graphql-schema.test.ts checks every document against
 * (RP-25). scripts/fetch-admin-schema.ts is the command; this is the part a
 * unit test can run with a stub for fetch.
 */
import { buildClientSchema, getIntrospectionQuery, printSchema, type IntrospectionQuery } from "graphql";

/** Where the fixtures live, relative to apps/rewards. */
export const ADMIN_SCHEMA_DIR = "test/fixtures/shopify";

/**
 * Shopify's public docs proxy for the Admin API (what its own codegen preset
 * introspects): no token, no store. Undocumented, so only a refresh depends
 * on it, never CI. Its query costs are not a real store's.
 */
export const ADMIN_SCHEMA_PROXY = "https://shopify.dev/admin-graphql-direct-proxy";

export const adminSchemaFile = (version: string) => `${ADMIN_SCHEMA_DIR}/admin-${version}.graphql`;

/**
 * The introspection, with its options in one place. `oneOf: true` keeps the
 * `@oneOf` marker on inputs such as CustomerIdentifierInput (graphql-js
 * leaves it out by default, and the validator then lets two keys through);
 * `inputValueDeprecation: true` keeps deprecated arguments and input fields,
 * so a document using one fails the test. Descriptions are left out.
 */
export const introspectionQuery = () =>
  getIntrospectionQuery({ descriptions: false, inputValueDeprecation: true, oneOf: true, directiveIsRepeatable: true, specifiedByUrl: true });

/**
 * The Admin schema of one version as SDL, ending in a newline. It throws on
 * anything but a 200 answer carrying `data.__schema`, so a refresh never
 * writes junk over the fixture.
 */
export async function fetchAdminSchemaSdl(version: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  if (!/^\d{4}-\d{2}$/.test(version)) throw new Error(`"${version}" is not an Admin API version (YYYY-MM)`);
  const url = `${ADMIN_SCHEMA_PROXY}/${version}`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: introspectionQuery() }),
  });
  if (response.status !== 200) throw new Error(`${url} answered HTTP ${response.status}`);
  const body = (await response.json()) as { data?: Partial<IntrospectionQuery>; errors?: { message?: string }[] };
  if (body.errors?.length) throw new Error(`${url} answered errors: ${body.errors.map((e) => e.message ?? "?").join("; ")}`);
  if (!body.data?.__schema) throw new Error(`${url} answered no __schema`);
  return `${printSchema(buildClientSchema(body.data as IntrospectionQuery))}\n`;
}
