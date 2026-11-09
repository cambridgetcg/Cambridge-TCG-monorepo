import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ApiVersion } from "@shopify/shopify-app-react-router/server";
import {
  type GraphQLSchema,
  GraphQLError,
  Kind,
  NoDeprecatedCustomRule,
  type OperationDefinitionNode,
  buildSchema,
  getNamedType,
  isInputObjectType,
  isScalarType,
  parse,
  print,
  validate,
  visit,
} from "graphql";
import { parse as parseToml } from "smol-toml";
import { describe, expect, it } from "vitest";
import * as graphqlModule from "~/shopify/graphql";

/**
 * Every Admin API document the app sends is checked against Shopify's schema
 * for the version the app speaks (RP-25). The schema is committed SDL,
 * test/fixtures/shopify/admin-<version>.graphql, refreshed with
 * `pnpm schema:admin` (scripts/fetch-admin-schema.ts); no network here.
 *
 * Beyond the schema: page sizes are literals of at most 250, every document
 * lives in app/shopify/graphql.ts, and every operation a test mock or
 * stand-in client answers exists. Each check is a small function below, run once on the real
 * documents and once on a seeded bad input, so none of them passes by
 * matching nothing. Query cost is not checked (still counted by hand).
 */

const file = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const APP = file("../../../");
const read = (rel: string) => readFileSync(`${APP}${rel}`, "utf8");
const apiVersionOf = (rel: string) => (parseToml(read(rel)) as { webhooks: { api_version: string } }).webhooks.api_version;

const VERSION = apiVersionOf("shopify.app.toml");
const FIXTURES = "test/fixtures/shopify";
const schema = buildSchema(read(`${FIXTURES}/admin-${VERSION}.graphql`));

/** The search bulk-import.server.ts sends, in its exact shape. */
const BULK_SEARCH = `created_at:>='${new Date("2025-11-09T10:00:00.000Z").toISOString()}' AND created_at:<'${new Date("2026-11-09T10:00:00.000Z").toISOString()}'`;

const exported = graphqlModule as Record<string, unknown>;
const named = Object.entries(exported).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].startsWith("#graphql"));
const all: [string, string][] = [...named, ["RewardsBulkOrderNodes", graphqlModule.RewardsBulkOrderNodes(BULK_SEARCH)]];
const doc = (name: string) => {
  const text = named.find(([n]) => n === name)?.[1];
  if (text === undefined) throw new Error(`no document ${name}`);
  return text;
};

// ---- the checks ----

function parsed(text: string) {
  try {
    return { document: parse(text) };
  } catch (error) {
    if (error instanceof GraphQLError) return { problem: error.message };
    throw error;
  }
}

/** What Shopify's schema says is wrong with a document. */
function schemaErrors(s: GraphQLSchema, text: string): string[] {
  const { document, problem } = parsed(text);
  return document ? validate(s, document).map((e) => e.message) : [problem];
}

/** Every deprecated field, argument, input field or enum value it uses. */
function deprecatedUses(s: GraphQLSchema, text: string): string[] {
  const { document, problem } = parsed(text);
  return document ? validate(s, document, [NoDeprecatedCustomRule]).map((e) => e.message) : [problem];
}

const MAX_PAGE = 250;

/**
 * Every `first`/`last` must be an Int literal of at most 250: Shopify refuses
 * more, and a variable could be anything at run time. If one is ever needed,
 * allowlist it here with its bound.
 */
function pageSizeProblems(text: string): string[] {
  const problems: string[] = [];
  let operation = "anonymous";
  visit(parse(text), {
    OperationDefinition(node) {
      operation = node.name?.value ?? "anonymous";
    },
    Field(node) {
      for (const arg of node.arguments ?? []) {
        if (arg.name.value !== "first" && arg.name.value !== "last") continue;
        const shown = `${operation}: ${node.name.value}(${arg.name.value}: ${print(arg.value)})`;
        if (arg.value.kind !== Kind.INT) problems.push(`${shown} is not an Int literal`);
        else if (Number(arg.value.value) > MAX_PAGE) problems.push(`${shown} is over ${MAX_PAGE}`);
      }
    },
  });
  return problems;
}

/** The kind and name of the operation a document holds, and how many it holds. */
function operationShape(text: string) {
  const operations = parse(text).definitions.filter((d): d is OperationDefinitionNode => d.kind === Kind.OPERATION_DEFINITION);
  return { kind: operations[0]?.operation, name: operations[0]?.name?.value ?? null, count: operations.length };
}

/** An exported document must hold exactly one operation, named as its export. */
function operationProblems(exportName: string, text: string): string[] {
  const { name, count } = operationShape(text);
  if (count !== 1) return [`${exportName} holds ${count} operations, not 1`];
  return name === exportName ? [] : [`${exportName} holds an operation named ${name ?? "(none)"}`];
}

const GRAPHQL_TS = "app/shopify/graphql.ts";
const DOCUMENT_LIKE = /#graphql|\b(?:query|mutation|subscription)\s+[A-Z]\w*\s*[({]/;
const EXPORTED_DOCUMENT = /^export const [A-Z]\w* = `#graphql$/;

/**
 * A document outside the checked set: anything that looks like one outside
 * graphql.ts, a `#graphql` string graphql.ts doesn't export, or a .graphql
 * file. (Anonymous or lowercase-named documents elsewhere aren't caught:
 * matching those flags comments.)
 */
function strayDocuments(files: { path: string; text: string }[]): string[] {
  const strays: string[] = [];
  for (const { path, text } of files) {
    if (/\.(?:graphql|gql)$/.test(path)) {
      strays.push(`${path}: a GraphQL file`);
      continue;
    }
    text.split("\n").forEach((line, i) => {
      const stray = path === GRAPHQL_TS ? line.includes("#graphql") && !EXPORTED_DOCUMENT.test(line.trim()) : DOCUMENT_LIKE.test(line);
      if (stray) strays.push(`${path}:${i + 1}: ${line.trim()}`);
    });
  }
  return strays;
}

/** graphql.ts exports documents, cost numbers and the one bulk-text function. */
function exportProblems(module: Record<string, unknown>): string[] {
  return Object.entries(module).flatMap(([name, value]) => {
    if (typeof value === "string") return value.startsWith("#graphql") ? [] : [`${name} is a string that isn't a #graphql document`];
    if (typeof value === "number") return [];
    if (typeof value === "function" && name === "RewardsBulkOrderNodes") return [];
    return [`${name} is a ${typeof value}`];
  });
}

/** MSW's `.query("Name"` / `.mutation("Name"`, which also says the kind. */
const MOCK = /\.(?<kind>query|mutation)\(\s*["'`](?<name>[A-Za-z_]\w*)["'`]/g;

/**
 * Stand-in clients that read the operation name out of the query text and
 * answer by it, which say only the name: `case "RewardsX":` in a switch,
 * `query.includes("RewardsX")`, and `operation === "RewardsX"` (or `!==`).
 */
const BY_NAME = [
  /\bcase\s+["'`](?<name>Rewards\w*)["'`]\s*:/g,
  /\.includes\(\s*["'`](?<name>Rewards\w*)["'`]\s*\)/g,
  /\boperation\s*[!=]==?\s*["'`](?<name>Rewards\w*)["'`]/g,
];

/**
 * Every operation a test mock answers is a real document: of that kind for an
 * MSW mock, by name alone for a stand-in client.
 */
function mockProblems(files: { path: string; text: string }[], kinds: Map<string, string>): string[] {
  const problems: string[] = [];
  for (const { path, text } of files) {
    for (const { groups } of text.matchAll(MOCK)) {
      const { kind, name } = groups as { kind: string; name: string };
      const real = kinds.get(name);
      if (real === undefined) problems.push(`${path}: mocks ${kind} ${name}, which no document in ${GRAPHQL_TS} is`);
      else if (real !== kind) problems.push(`${path}: mocks ${name} as a ${kind}, but it is a ${real}`);
    }
    for (const pattern of BY_NAME) {
      for (const { groups } of text.matchAll(pattern)) {
        const name = (groups as { name: string }).name;
        if (!kinds.has(name)) problems.push(`${path}: answers ${name}, which no document in ${GRAPHQL_TS} is`);
      }
    }
  }
  return problems;
}

const namesMatching = (files: { path: string; text: string }[], pattern: RegExp) =>
  new Set(files.flatMap(({ text }) => [...text.matchAll(pattern)].map((m) => (m.groups as { name: string }).name)));

// ---- the real inputs ----

const sources = (dir: string, pattern: RegExp, skip: string[] = []) =>
  (readdirSync(`${APP}${dir}`, { recursive: true }) as string[])
    .map((rel) => `${dir}/${rel}`)
    .filter((path) => pattern.test(path) && !skip.includes(path))
    .map((path) => ({ path, text: read(path) }));

const CODE_OR_GRAPHQL = /\.(?:tsx?|jsx?|graphql|gql)$/;
const appFiles = () => [...sources("app", CODE_OR_GRAPHQL), ...sources("extensions", CODE_OR_GRAPHQL)];
const THIS_FILE = "test/unit/shopify/graphql-schema.test.ts";
const testFiles = () => sources("test", /\.tsx?$/, [THIS_FILE]);
const realKinds = new Map(named.map(([name, text]) => [name, operationShape(text).kind ?? "none"]));

// ---- the real documents ----

describe(`the Admin documents, against the committed ${VERSION} schema`, () => {
  it("are checked against the version the app speaks", () => {
    expect(apiVersionOf("shopify.app.staging.toml")).toBe(VERSION);
    for (const rel of ["app/shopify.server.ts", ".graphqlrc.ts"]) {
      const used = [...read(rel).matchAll(/ApiVersion\.(\w+)/g)].map((m) => m[1]);
      expect(used.length, `${rel} names no ApiVersion`).toBeGreaterThan(0);
      for (const key of used) expect(ApiVersion[key as keyof typeof ApiVersion], `${rel}: ApiVersion.${key}`).toBe(VERSION);
    }
    expect(readdirSync(`${APP}${FIXTURES}`).filter((f) => /^admin-.*\.graphql$/.test(f))).toEqual([`admin-${VERSION}.graphql`]);
  });

  it("use a schema that kept @oneOf and deprecated arguments", () => {
    const identifier = schema.getType("CustomerIdentifierInput");
    expect(isInputObjectType(identifier) && identifier.isOneOf).toBe(true);
    expect(deprecatedArgument()).toBeDefined();
  });

  it(`are every #graphql string in ${GRAPHQL_TS}, all exported, and the bulk query's text`, () => {
    expect(named.length).toBeGreaterThan(0);
    expect(named.length).toBe(read(GRAPHQL_TS).split("#graphql").length - 1);
  });

  it.each(all)("%s is valid", (_name, text) => {
    expect(schemaErrors(schema, text)).toEqual([]);
  });

  it.each(named)("%s is one operation named as its export", (name, text) => {
    expect(operationProblems(name, text)).toEqual([]);
  });

  it("use no deprecated field, argument or enum value", () => {
    expect(all.flatMap(([name, text]) => deprecatedUses(schema, text).map((use) => `${name}: ${use}`))).toEqual([]);
  });

  it(`ask for pages of at most ${MAX_PAGE}, always as literals`, () => {
    expect(all.flatMap(([, text]) => pageSizeProblems(text))).toEqual([]);
  });

  it("include a bulk query text with one root field, orders", () => {
    const [operation] = parse(all[all.length - 1][1]).definitions as OperationDefinitionNode[];
    expect(operation.selectionSet.selections.map((s) => (s.kind === Kind.FIELD ? s.name.value : s.kind))).toEqual(["orders"]);
  });

  it(`all live in ${GRAPHQL_TS}`, () => {
    const files = appFiles();
    expect(files.some((f) => f.path === GRAPHQL_TS)).toBe(true);
    expect(strayDocuments(files)).toEqual([]);
    expect(exportProblems(exported)).toEqual([]);
  });

  it("are what every test mock answers", () => {
    const files = testFiles();
    for (const pattern of [MOCK, ...BY_NAME]) expect(namesMatching(files, pattern).size, `${pattern} matches no test file`).toBeGreaterThan(0);
    expect(mockProblems(files, realKinds)).toEqual([]);
  });
});

// ---- seeded negatives: each check can fail ----

/** The first QueryRoot field with a deprecated argument, found in the schema. */
function deprecatedArgument() {
  for (const field of Object.values(schema.getQueryType()?.getFields() ?? {})) {
    const arg = field.args.find((a) => a.deprecationReason);
    if (arg) return { field, arg };
  }
  return undefined;
}

describe("the checks catch", () => {
  const replaced = (name: string, from: string, to: string) => {
    const text = doc(name);
    expect(text).toContain(from);
    return text.replace(from, to);
  };

  it("a misspelled field", () => {
    expect(schemaErrors(schema, replaced("RewardsOrderFacts", "currentQuantity", "currentQuantty"))).toEqual([
      'Cannot query field "currentQuantty" on type "LineItem". Did you mean "currentQuantity"?',
    ]);
  });

  it("an enum value the schema lacks", () => {
    expect(schemaErrors(schema, replaced("RewardsUpdatedOrders", "UPDATED_AT", "UPDATED"))).toEqual([
      'Value "UPDATED" does not exist in "OrderSortKeys" enum. Did you mean the enum value "UPDATED_AT"?',
    ]);
  });

  it("an undeclared variable", () => {
    expect(schemaErrors(schema, replaced("RewardsOrderFacts", "($id: ID!, $after: String)", "($id: ID!)"))).toEqual([
      'Variable "$after" is not defined by operation "RewardsOrderFacts".',
    ]);
  });

  it("a @oneOf input given two keys", () => {
    const input = schema.getType("CustomerIdentifierInput");
    if (!isInputObjectType(input)) throw new Error("CustomerIdentifierInput is not an input");
    const keys = Object.values(input.getFields()).filter((f) => isScalarType(getNamedType(f.type)));
    const taking = Object.values(schema.getQueryType()?.getFields() ?? {}).flatMap((field) =>
      field.args.filter((a) => getNamedType(a.type) === input).map((a) => ({ field, arg: a })),
    )[0];
    expect(keys.length).toBeGreaterThanOrEqual(2);
    expect(taking).toBeDefined();

    const text = `query RewardsTwoKeys { ${taking.field.name}(${taking.arg.name}: { ${keys[0].name}: "a", ${keys[1].name}: "b" }) { __typename } }`;

    expect(schemaErrors(schema, text)).toContain('OneOf Input Object "CustomerIdentifierInput" must specify exactly one key.');
  });

  it("a deprecated field", () => {
    const field = Object.values(schema.getQueryType()?.getFields() ?? {}).find((f) => f.deprecationReason);
    if (!field) throw new Error("QueryRoot has no deprecated field to seed with");

    expect(deprecatedUses(schema, `{ ${field.name} }`)).toEqual([`The field QueryRoot.${field.name} is deprecated. ${field.deprecationReason}`]);
  });

  it("a deprecated argument", () => {
    const found = deprecatedArgument();
    if (!found) throw new Error("QueryRoot has no deprecated argument to seed with");
    const { field, arg } = found;

    expect(deprecatedUses(schema, `{ ${field.name}(${arg.name}: null) }`)).toEqual([
      `Field "QueryRoot.${field.name}" argument "${arg.name}" is deprecated. ${arg.deprecationReason}`,
    ]);
  });

  it(`a page over ${MAX_PAGE}`, () => {
    expect(pageSizeProblems(replaced("RewardsCustomerSearch", "first: 250", "first: 300"))).toEqual([
      "RewardsCustomerSearch: customers(first: 300) is over 250",
    ]);
  });

  it("a page size given as a variable", () => {
    const text = replaced("RewardsCustomerSearch", "first: 250", "first: $n").replace("($query: String!)", "($query: String!, $n: Int!)");

    expect(schemaErrors(schema, text)).toEqual([]);
    expect(pageSizeProblems(text)).toEqual(["RewardsCustomerSearch: customers(first: $n) is not an Int literal"]);
  });

  it("a document named for another export", () => {
    expect(operationProblems("RewardsTokenPing", doc("RewardsShopDetails"))).toEqual(["RewardsTokenPing holds an operation named RewardsShopDetails"]);
  });

  it("two operations in one document", () => {
    expect(operationProblems("RewardsShopDetails", `${doc("RewardsShopDetails")}\n${doc("RewardsTokenPing")}`)).toEqual([
      "RewardsShopDetails holds 2 operations, not 1",
    ]);
  });

  it("a document outside graphql.ts, an unexported one inside it, and a .graphql file", () => {
    const files = [
      { path: "app/shopify/extra.server.ts", text: "const q = `\n  query RewardsX($id: ID!) {\n    order(id: $id) { id }\n  }`;" },
      { path: "app/shopify/plain.server.ts", text: "const q = `\n  query RewardsY {\n    shop { id }\n  }`;" },
      { path: GRAPHQL_TS, text: "export const RewardsShop = `#graphql\n  query RewardsShop { shop { id } }`;\nconst Hidden = `#graphql\n  query Hidden { shop { id } }`;" },
      { path: "extensions/rewards-widget/orders.graphql", text: "query RewardsZ { shop { id } }" },
    ];

    expect(strayDocuments(files)).toEqual([
      "app/shopify/extra.server.ts:2: query RewardsX($id: ID!) {",
      "app/shopify/plain.server.ts:2: query RewardsY {",
      `${GRAPHQL_TS}:3: const Hidden = \`#graphql`,
      "extensions/rewards-widget/orders.graphql: a GraphQL file",
    ]);
  });

  it("an export of graphql.ts that is neither a document, a cost nor the bulk text", () => {
    expect(exportProblems({ RewardsPlain: "query RewardsPlain { shop { id } }", RewardsOther: () => "", RewardsCost: 12 })).toEqual([
      "RewardsPlain is a string that isn't a #graphql document",
      "RewardsOther is a function",
    ]);
  });

  it("a mock of an operation that doesn't exist, and a mutation mocked as a query", () => {
    const files = [
      {
        path: "test/postgres/example.postgres.test.ts",
        text: 'server.use(\n  graphql.link(adminGraphqlUrl(SHOP)).query(\n    "RewardsNope",\n    () => HttpResponse.json({}),\n  ),\n  link.query("RewardsCredit", () => HttpResponse.json({})),\n);',
      },
    ];

    expect(mockProblems(files, realKinds)).toEqual([
      `test/postgres/example.postgres.test.ts: mocks query RewardsNope, which no document in ${GRAPHQL_TS} is`,
      "test/postgres/example.postgres.test.ts: mocks RewardsCredit as a query, but it is a mutation",
    ]);
  });

  it("a stand-in client answering, by name, an operation that doesn't exist", () => {
    const files = [
      {
        path: "test/postgres/example.postgres.test.ts",
        text: [
          "const name = /(?:query|mutation)\\s+(\\w+)/.exec(query)?.[1];",
          "switch (name) {",
          '  case "RewardsBalance":',
          "    return {};",
          '  case "RewardsNope":',
          "    return {};",
          "}",
          'if (query.includes("RewardsGone")) ask();',
          'if (operation !== "RewardsOld") throw new Error("no");',
          'calls.filter((call) => call.operation === "RewardsCustomerNames");',
        ].join("\n"),
      },
    ];

    expect(mockProblems(files, realKinds)).toEqual([
      `test/postgres/example.postgres.test.ts: answers RewardsNope, which no document in ${GRAPHQL_TS} is`,
      `test/postgres/example.postgres.test.ts: answers RewardsGone, which no document in ${GRAPHQL_TS} is`,
      `test/postgres/example.postgres.test.ts: answers RewardsOld, which no document in ${GRAPHQL_TS} is`,
    ]);
  });
});
