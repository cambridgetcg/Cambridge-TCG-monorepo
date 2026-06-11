/**
 * Typed model of the codebase's module structure.
 *
 * The canonical for this module is the filesystem under `scripts/`
 * (modules) and `test/scripts/` (their tests). The `Architecture`
 * type is the parsed shape of that canonical — same role as `Registry`
 * plays for `rp-shared.css`.
 */
export interface ModuleInfo {
  /** Directory name (e.g. `"rp-registry"`). */
  name: string;
  /** Path relative to repo root (e.g. `"scripts/rp-registry"`). */
  path: string;
  /** All files in the module directory (one level only — no recursion). */
  files: string[];
  hasReadme: boolean;
  hasIndex: boolean;
  hasTest: boolean;
  /** Test files in `test/scripts/` whose name starts with the module name. */
  testFiles: string[];
  /** Names of other modules this module imports (`../<name>` patterns). */
  imports: string[];
}

export interface Architecture {
  modules: ModuleInfo[];
  /** name → modules that import it (reverse of `imports`). */
  importedBy: Record<string, string[]>;
}

export type IssueType =
  | "missing-readme"
  | "missing-index"
  | "missing-test"
  | "unknown-import";

export interface PatternIssue {
  module: string;
  type: IssueType;
  detail: string;
}
