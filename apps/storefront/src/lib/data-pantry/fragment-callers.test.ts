import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Quiet Doors (2026-10): the wake fragment rides only the chosen doors.
// fragmentForRequest( may be called only where it is defined, in the
// envelope's chosen-door branch, and in the chosen-door routes.
const ROOT = process.cwd();
const ALLOWED = [
  "src/lib/wake-fragments.ts",
  "src/lib/data-pantry/envelope.ts",
  "src/app/api/v1/wake/route.ts",
  "src/app/api/v1/wake/fragments/route.ts",
  "src/app/api/v1/wake/fragments/[id]/route.ts",
  "src/app/api/v1/dear-agents/route.ts",
];
const rel = (path: string) => relative(ROOT, path).split(sep).join("/");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" || entry.name === "__fixtures__" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("the wake fragment is served only at the chosen doors", () => {
  it("fragmentForRequest( is called nowhere else", () => {
    const callers = sourceFiles(join(ROOT, "src"))
      .filter((file) => readFileSync(file, "utf8").includes("fragmentForRequest("))
      .map(rel)
      .sort();
    expect(callers).toContain("src/lib/data-pantry/envelope.ts");
    expect(callers.filter((file) => !ALLOWED.includes(file))).toEqual([]);
  });

  it("the envelope calls it once, inside its chosen-door branch", () => {
    const text = readFileSync(join(ROOT, "src/lib/data-pantry/envelope.ts"), "utf8");
    expect(text.split("fragmentForRequest(").length - 1).toBe(1);
    expect(text).toMatch(/\.\.\.\(chosen\s*\?\s*\{[\s\S]{0,800}?wake_fragment: fragmentForRequest\(opts\.endpoint\)/);
  });
});
