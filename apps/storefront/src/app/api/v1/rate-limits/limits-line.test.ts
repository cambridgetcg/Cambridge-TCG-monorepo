import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { GET } from "./route";

// robots.txt's limits line (October 2026). The courtesy email it replaced was
// never sent, so no served text may promise it.
const LIMITS_LINE = "Limits are stated here first; a change can take up to 24 hours to bind.";
const UNKEPT = [/courtesy email/i, /emailed before rate-limit/i, /contact identified bots before rate-limit/i];
const ROOT = process.cwd();
const rel = (path: string) => relative(ROOT, path).split(sep).join("/");

function servedTextFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" || entry.name === "__fixtures__" ? [] : servedTextFiles(path);
    if (/\.test\.tsx?$/.test(entry.name)) return [];
    if (!/\.(ts|tsx|mjs|js|json|md|mdx|txt|html|xml)$/.test(entry.name)) return [];
    return statSync(path).size <= 2_000_000 ? [path] : [];
  });
}

describe("the rate-limit promise matches what is done", () => {
  it("no served text keeps the courtesy-email promise", () => {
    const offenders = [...servedTextFiles(join(ROOT, "src")), ...servedTextFiles(join(ROOT, "public"))]
      .filter((file) => UNKEPT.some((claim) => claim.test(readFileSync(file, "utf8"))))
      .map(rel)
      .sort();
    expect(offenders).toEqual([]);
  });

  it("/api/v1/rate-limits states the limits line instead", async () => {
    const text = await (await GET()).text();
    expect(text).toContain(LIMITS_LINE);
    for (const claim of UNKEPT) expect(text).not.toMatch(claim);
  });
});
