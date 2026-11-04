import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const APP_ROOT = resolve(process.cwd(), "app");

// Calls that mask an email before it is logged.
const MASKING_CALLS = new Set(["maskEmail", "logSafeCustomer", "logSafeOrder"]);

function appSourceFiles(directory = APP_ROOT): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return appSourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function sourceFile(path: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/** console.x, globalThis.console.x, window.console.x, logger.x, Logger.x */
function isRawLogSink(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  const receiver = node.expression.expression.getText();
  return /^(?:(?:globalThis|window)\.)?console$/.test(receiver) || /logger$/i.test(receiver);
}

function namesAnEmail(name: string): boolean {
  return /^email$|Email$/.test(name);
}

/** True when an argument carries an email value that no masking call wraps. */
function passesRawEmail(argument: ts.Node): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      MASKING_CALLS.has(node.expression.text)
    ) {
      return;
    }
    // `!!customer.email` logs a boolean, not the address.
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
      return;
    }
    if (ts.isPropertyAccessExpression(node) && namesAnEmail(node.name.text)) {
      found = true;
      return;
    }
    if (ts.isShorthandPropertyAssignment(node) && namesAnEmail(node.name.text)) {
      found = true;
      return;
    }
    if (
      ts.isIdentifier(node) &&
      namesAnEmail(node.text) &&
      !(ts.isPropertyAssignment(node.parent) && node.parent.name === node) &&
      !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(argument);
  return found;
}

const CLIENT_IP_HEADERS = new Set([
  "x-forwarded-for",
  "x-real-ip",
  "x-vercel-forwarded-for",
  "x-vercel-proxied-for",
  "forwarded",
  "cf-connecting-ip",
]);

/** True when an argument reads a client-IP header, e.g. headers.get("x-forwarded-for"). */
function readsClientIp(argument: ts.Node): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "get" &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      CLIENT_IP_HEADERS.has(node.arguments[0].text.toLowerCase())
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(argument);
  return found;
}

function logViolations(isViolation: (argument: ts.Node) => boolean): string[] {
  const violations: string[] = [];
  for (const path of appSourceFiles()) {
    const parsed = sourceFile(path);
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && isRawLogSink(node) && node.arguments.some(isViolation)) {
        const { line } = parsed.getLineAndCharacterOfPosition(node.getStart(parsed));
        violations.push(`${relative(APP_ROOT, path).split(sep).join("/")}:${line + 1}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(parsed);
  }
  return violations;
}

describe("production log privacy regressions", () => {
  it("never passes a raw shopper email to the console or a logger", () => {
    expect(logViolations(passesRawEmail)).toEqual([]);
  });

  it("never logs the client IP address", () => {
    expect(logViolations(readsClientIp)).toEqual([]);
  });

  it("does not log the raw redirect location from Shopify auth", () => {
    const appRoute = readFileSync(resolve(APP_ROOT, "routes/app.tsx"), "utf8");

    expect(appRoute).not.toMatch(/\$\{location \|\| 'none'\}/);
    expect(appRoute).toContain("describeRequestUrl(location)");
  });
});
