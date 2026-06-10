/**
 * Pure: build an `Architecture` from synthetic file inputs.
 *
 * The facade in `./index.ts` is the only place that touches `fs` —
 * here we accept a `FileSystem` interface so tests can pass an
 * in-memory tree.
 */
import type { Architecture, ModuleInfo } from "./types";

export interface FileEntry {
  /** Path relative to the directory we're scanning. */
  relPath: string;
  /** File contents, or `null` for directories. */
  content: string | null;
}

export interface DiscoverInputs {
  /** Files inside `scripts/` (one level deep — module directories + their files). */
  scriptsTree: FileEntry[];
  /** File names inside `test/scripts/`. Contents not needed — only names. */
  testFiles: string[];
  /**
   * Directory names under `scripts/` that are NOT pattern modules and
   * should be skipped during discovery. Defaults to legacy helper
   * directories used by one-off migration scripts (`lib/`).
   */
  exclude?: string[];
}

const DEFAULT_TEST_FILES: string[] = [];
const DEFAULT_EXCLUDED_DIRS = ["lib"];

export function discover(inputs: DiscoverInputs): Architecture {
  const exclude = new Set(inputs.exclude ?? DEFAULT_EXCLUDED_DIRS);
  const moduleNames = collectModuleNames(inputs.scriptsTree).filter(
    (n) => !exclude.has(n)
  );
  const filesByModule = collectFilesByModule(inputs.scriptsTree);
  const testFiles = inputs.testFiles ?? DEFAULT_TEST_FILES;

  const modules: ModuleInfo[] = moduleNames.map((name) => {
    const files = filesByModule.get(name) ?? [];
    const fileNames = files.map((f) => baseName(f.relPath));
    const tsFiles = files.filter((f) => f.relPath.endsWith(".ts"));
    return {
      name,
      path: `scripts/${name}`,
      files: fileNames.sort(),
      hasReadme: fileNames.includes("README.md"),
      hasIndex: fileNames.includes("index.ts"),
      hasTest: matchingTests(name, testFiles).length > 0,
      testFiles: matchingTests(name, testFiles),
      imports: collectImports(tsFiles, moduleNames, name),
    };
  });

  // Reverse map: who imports each module.
  const importedBy: Record<string, string[]> = {};
  for (const m of modules) {
    for (const dep of m.imports) {
      (importedBy[dep] ??= []).push(m.name);
    }
  }
  for (const k of Object.keys(importedBy)) importedBy[k].sort();

  return { modules, importedBy };
}

function collectModuleNames(tree: FileEntry[]): string[] {
  const names = new Set<string>();
  for (const e of tree) {
    const top = e.relPath.split("/")[0];
    if (top && !top.includes(".") && !names.has(top)) names.add(top);
  }
  return [...names].sort();
}

function collectFilesByModule(tree: FileEntry[]): Map<string, FileEntry[]> {
  const out = new Map<string, FileEntry[]>();
  for (const e of tree) {
    const parts = e.relPath.split("/");
    if (parts.length < 2) continue; // top-level loose files — not modules
    if (e.content === null) continue;
    const mod = parts[0];
    const list = out.get(mod) ?? [];
    list.push(e);
    out.set(mod, list);
  }
  return out;
}

function baseName(p: string): string {
  return p.split("/").slice(1).join("/");
}

function matchingTests(moduleName: string, testFiles: string[]): string[] {
  // Convention: `<module>.test.ts`, `<module>.<thing>.test.ts`, or
  // `<module-with-dots>.test.ts`. Match files that start with the
  // module name followed by `.` and end in `.test.ts`.
  return testFiles
    .filter((f) => f.startsWith(`${moduleName}.`) && f.endsWith(".test.ts"))
    .sort();
}

function collectImports(
  tsFiles: FileEntry[],
  knownModules: string[],
  selfName: string
): string[] {
  const known = new Set(knownModules);
  const imports = new Set<string>();
  for (const f of tsFiles) {
    if (f.content === null) continue;
    for (const m of f.content.matchAll(/from\s+["']\.\.\/([a-z][a-z0-9-]+)/gi)) {
      const dep = m[1];
      if (dep === selfName) continue;
      if (!known.has(dep)) continue; // skip non-module imports (e.g., ../utils, ../app)
      imports.add(dep);
    }
  }
  return [...imports].sort();
}
