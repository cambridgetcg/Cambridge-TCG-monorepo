import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// next.config.ts is loaded by Next outside the bundler, where tsconfig path
// aliases ("@/...") do not resolve. A "@/" import anywhere in its local import
// graph passes typecheck and vitest but fails `next build` with
// MODULE_NOT_FOUND (the 2026-10-10 truth-layer preview failed this way).

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "../..");

const IMPORT_RE = /^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm;

function localImportGraph(entry: string): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift()!;
    if (graph.has(file)) continue;
    const specs = [...readFileSync(file, "utf8").matchAll(IMPORT_RE)].map((m) => m[1]);
    graph.set(file, specs);
    for (const spec of specs) {
      if (!spec.startsWith(".")) continue;
      const base = resolve(dirname(file), spec);
      queue.push(base.endsWith(".ts") ? base : `${base}.ts`);
    }
  }
  return graph;
}

describe("next.config.ts import graph", () => {
  it("uses no path aliases in any local module it loads", () => {
    const graph = localImportGraph(join(appRoot, "next.config.ts"));
    expect(graph.size).toBeGreaterThan(1);
    const aliased = [...graph].flatMap(([file, specs]) =>
      specs.filter((s) => s.startsWith("@/")).map((s) => `${file}: ${s}`),
    );
    expect(aliased).toEqual([]);
  });
});
