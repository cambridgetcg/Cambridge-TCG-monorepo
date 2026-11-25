/**
 * The test scripts that write rows, held to their guard
 * (scripts/lib/local-test-database.mjs): each calls it before anything else
 * and cleans up in `finally`.
 *
 * Why: they wrote to whatever database DATABASE_URL named, and one that failed
 * left its rows there.
 *
 * The list is fixed. It holds these scripts and no others, and skips one that
 * has been deleted.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const GUARD = "./lib/local-test-database.mjs";
const SCRIPTS = [
  "test-auction-fulfilment.mts",
  "test-bounty-merge.mts",
  "test-customer-tradein-status.mts",
  "test-decks.mts",
  "test-dispute-lifecycle.mts",
  "test-dm-lifecycle.mts",
  "test-email-preferences.mts",
  "test-email-queue.mts",
  "test-journey-aggregator.mts",
  "test-market-notifications.mts",
  "test-notifications.mts",
  "test-offer-lifecycle.mts",
  "test-order-fulfilment.mts",
  "test-payout-aggregation.mts",
  "test-payout-lifecycle.mts",
  "test-price-alerts.mts",
  "test-price-history.mts",
  "test-pricing-rules-lifecycle.mts",
  "test-quote-payout.mts",
  "test-return-lifecycle.mts",
  "test-saved-searches-lifecycle.mts",
  "test-set-progress.mts",
  "test-shop-lifecycle.mts",
  "test-social-lifecycle.mts",
  "test-streak-sweep.mts",
  "test-subscription-lifecycle.mts",
  "test-trade-cancel-lifecycle.mts",
  "test-tradein-admin.mts",
  "test-vacation-lifecycle.mts",
  "test-valuation-lifecycle.mts",
  "test-verification-lifecycle.mts",
  "test-wishlist-matching.mts",
];

/** `cleanUp(pool, step, ...)` */
const cleansUp = (node?: ts.Node) =>
  !!node && ts.isCallExpression(node) && node.expression.getText() === "cleanUp" &&
  node.arguments[0]?.getText() === "pool" && node.arguments.length > 1;

function problems(text: string): string[] {
  const { statements } = ts.createSourceFile("script.mts", text, ts.ScriptTarget.Latest, true);
  const found = new Set<string>();

  // Imported modules run before any statement of the script.
  const imports = statements.filter(ts.isImportDeclaration);
  const from = (statement: ts.ImportDeclaration) => (statement.moduleSpecifier as ts.StringLiteral).text;
  if (!imports[0] || from(imports[0]) !== GUARD) found.add("the guard is not its first import");
  for (const statement of imports) {
    if (statement.importClause?.isTypeOnly || from(statement) === GUARD || from(statement).startsWith("node:")) continue;
    found.add(`it imports ${from(statement)}, which runs before the guard`);
  }
  const body = statements.filter((statement) => !ts.isImportDeclaration(statement));
  if (body[0]?.getText() !== "const pool = requireLocalTestDatabase();") found.add("it does something before calling the guard");
  if (statements.some((statement) => ts.isExportDeclaration(statement) && statement.moduleSpecifier)) found.add("it re-exports a module, which runs before the guard");

  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) {
      if (node.text === "exit") found.add("it calls process.exit, which skips finally");
      if (node.text === "DATABASE_URL") found.add("it reads DATABASE_URL");
    }
    ts.forEachChild(node, visit);
  };
  statements.forEach(visit);

  // It ends with try { ... } finally { await cleanUp(pool, step); }, with
  // nothing else in the finally.
  const last = statements.at(-1);
  let end: ts.Node | undefined;
  if (last && ts.isTryStatement(last)) {
    const [only, ...more] = last.finallyBlock?.statements ?? [];
    if (only && !more.length && ts.isExpressionStatement(only) && ts.isAwaitExpression(only.expression)) end = only.expression.expression;
  }
  if (!cleansUp(end)) found.add("it does not end with a finally that only calls cleanUp");
  return [...found];
}

describe("the test scripts that write rows", () => {
  for (const name of SCRIPTS) {
    const path = fileURLToPath(new URL(`../../scripts/${name}`, import.meta.url));
    it.skipIf(!existsSync(path))(name, () => {
      expect(problems(readFileSync(path, "utf8"))).toEqual([]);
    });
  }
});

describe("this check", () => {
  const good = [
    `import { cleanUp, requireLocalTestDatabase } from "${GUARD}";`,
    'import { readFileSync } from "node:fs";',
    'import type { Deck } from "../src/lib/decks/db";',
    "// process.exit(1) and DATABASE_URL in a comment are fine",
    "const pool = requireLocalTestDatabase();",
    'const { listUserDecks } = await import("../src/lib/decks/db");',
    "try { process.exitCode = 1; } finally { await cleanUp(pool, () => cleanup(users)); }",
  ];
  const changed = (line: number, text: string) => good.map((old, index) => (index === line ? text : old)).join("\n");

  it("accepts the shape the scripts have", () => {
    expect(problems(good.join("\n"))).toEqual([]);
  });

  it.each([
    ["an empty script", ""],
    ["an import above the guard's", `import "node:fs";\n${good.join("\n")}`],
    ["an app import", changed(1, 'import { query } from "../src/lib/db";')],
    ["an app import of a type and a value", changed(2, 'import { query, type Deck } from "../src/lib/decks/db";')],
    ["a re-export", changed(5, 'export * from "../src/lib/db";')],
    ["work before the call", changed(3, "const started = Date.now();")],
    ["no call", changed(4, "const pool = new Pool();")],
    ["a conditional call", changed(4, "const pool = local ? requireLocalTestDatabase() : new Pool();")],
    ["process.exit", changed(6, "try { process.exit(1); } finally { await cleanUp(pool, step); }")],
    ["process['exit']", changed(6, "try { process['exit'](1); } finally { await cleanUp(pool, step); }")],
    ["exit from node:process", changed(1, 'import { exit } from "node:process";')],
    ["reading DATABASE_URL", changed(5, "const url = process.env.DATABASE_URL;")],
    ["process.env['DATABASE_URL']", changed(5, "const url = process.env['DATABASE_URL'];")],
    ["no finally", changed(6, "await main(); await cleanUp(pool, step);")],
    ["a finally without cleanUp", changed(6, "try { } finally { await pool.end(); }")],
    ["another function", changed(6, "try { } finally { await other(pool, step); }")],
    ["cleanUp without a step", changed(6, "try { } finally { await cleanUp(pool); }")],
    ["cleanUp that is not awaited", changed(6, "try { } finally { cleanUp(pool, step); }")],
    ["cleanUp of another pool", changed(6, "try { } finally { await cleanUp(other, step); }")],
    ["cleanUp only when nothing failed", changed(6, "try { } finally { if (!process.exitCode) await cleanUp(pool, step); }")],
    ["cleanUp in a function nobody calls", changed(6, "try { } finally { const later = async () => await cleanUp(pool, step); }")],
    ["a statement beside cleanUp", changed(6, "try { } finally { await cleanUp(pool, step); await more(); }")],
    ["a statement after the finally", `${good.join("\n")}\nawait more();`],
    ["a promise's finally", changed(6, "main().finally(() => cleanUp(pool, step));")],
  ])("refuses %s", (_, text) => {
    expect(problems(text)).not.toEqual([]);
  });
});
