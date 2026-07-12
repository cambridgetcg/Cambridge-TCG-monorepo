import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const apiRoot = new URL("../app/api", import.meta.url).pathname;
const notificationHistorySource = readFileSync(
  join(apiRoot, "admin/orders/[id]/notifications/route.ts"),
  "utf8",
);

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === "route.ts" ? [path] : [];
  });
}

const forbiddenResponsePatterns = [
  /\b(?:error|detail|details)\s*:\s*(?:msg|message)\b/u,
  /\b(?:error|detail|details)\s*:\s*String\s*\(\s*(?:err|error)\s*\)/u,
  /\b(?:error|detail|details)\s*:\s*(?:err|error)\s+instanceof\s+Error/u,
  /\b(?:error|detail|details)\s*:\s*[A-Za-z_$][\w$]*(?:Result|result)\.error\b/u,
] as const;

describe("wholesale API public error boundaries", () => {
  it("does not place raw runtime errors into response fields", () => {
    const violations = routeFiles(apiRoot).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return forbiddenResponsePatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${path.slice(apiRoot.length)}: ${pattern.source}`);
    });

    expect(violations).toEqual([]);
  });

  it("redacts stored notification errors before returning history", () => {
    expect(notificationHistorySource).toContain("PUBLIC_INTERNAL_ERROR");
    expect(notificationHistorySource).not.toContain(
      "return NextResponse.json(result)",
    );
  });
});
