/**
 * Pure analyzer — `analyze(files, registry)` → `UsageReport`.
 *
 * Walks every line of every file looking for token (`var(--rp-*)`)
 * and primitive (`.rp-*`, `class="rp-*"`) references. Cross-references
 * against the registry to produce per-name usage maps and unused
 * lists.
 *
 * No I/O here; the facade in `./index.ts` reads the assets directory
 * and passes file contents in.
 */
import type { Registry } from "../rp-registry/types";
import type { FileReference, ScannedFile, UsageReport } from "./types";

/** Token-family names that are intentionally not declared in the
 * canonical CSS (theme-inherited). They're still tracked as "used"
 * if referenced, but absence from registry doesn't make them invalid. */
const THEME_INHERITED = new Set(["--rp-primary-color"]);

export function analyze(files: ScannedFile[], registry: Registry): UsageReport {
  const tokens = new Map<string, FileReference[]>();
  const primitives = new Map<string, FileReference[]>();

  for (const file of files) {
    const lines = file.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const ref = (): FileReference => ({ path: file.path, line: i + 1 });

      // Token references — `var(--rp-X)` (whitespace allowed after `(`).
      for (const m of line.matchAll(/var\(\s*(--rp-[a-z0-9-]+)/gi)) {
        const name = m[1];
        if (!registry.tokenNames.has(name) && !THEME_INHERITED.has(name)) continue;
        push(tokens, name, ref());
      }

      // Primitive class references — both `.rp-X` (in CSS selectors)
      // and `rp-X` inside `class="..."` / `className="..."` (in HTML/JS).
      for (const m of line.matchAll(/\.(rp-[a-z0-9_-]+)/gi)) {
        const name = m[1];
        if (!registry.primitiveNames.has(name)) continue;
        push(primitives, name, ref());
      }
      for (const m of line.matchAll(/class(?:Name)?\s*=\s*["']([^"']+)["']/gi)) {
        for (const cls of m[1].split(/\s+/)) {
          if (!cls.startsWith("rp-")) continue;
          if (!registry.primitiveNames.has(cls)) continue;
          push(primitives, cls, ref());
        }
      }
    }
  }

  const unusedTokens = registry.tokens
    .map((t) => t.name)
    .filter((name) => !tokens.has(name));
  const unusedPrimitives = registry.primitives
    .map((p) => p.name)
    .filter((name) => !primitives.has(name));

  return {
    tokens,
    primitives,
    unusedTokens,
    unusedPrimitives,
    filesScanned: files.length,
  };
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}
