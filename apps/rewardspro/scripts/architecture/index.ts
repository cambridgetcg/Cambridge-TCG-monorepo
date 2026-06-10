/**
 * Top-level facade — reads `scripts/` and `test/scripts/` from disk,
 * feeds a synthetic `DiscoverInputs` into the pure `discover()`.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { discover } from "./discover";
import { validate } from "./validate";
import { mermaid } from "./diagram";
import type { Architecture } from "./types";
import type { DiscoverInputs, FileEntry } from "./discover";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const SCRIPTS_DIR = path.resolve(__dirname, "..");
export const TEST_DIR = path.resolve(__dirname, "../../test/scripts");

export function discoverArchitecture(): Architecture {
  const scriptsTree = readScriptsTree(SCRIPTS_DIR);
  const testFiles = readTestFiles(TEST_DIR);
  return discover({ scriptsTree, testFiles });
}

function readScriptsTree(root: string): FileEntry[] {
  const out: FileEntry[] = [];
  for (const top of fs.readdirSync(root)) {
    const topPath = path.join(root, top);
    const stat = fs.statSync(topPath);
    if (!stat.isDirectory()) continue;
    for (const child of fs.readdirSync(topPath)) {
      const childPath = path.join(topPath, child);
      const childStat = fs.statSync(childPath);
      if (childStat.isDirectory()) continue; // skip nested dirs (e.g., outputs/)
      out.push({
        relPath: `${top}/${child}`,
        content: fs.readFileSync(childPath, "utf-8"),
      });
    }
  }
  return out;
}

function readTestFiles(testDir: string): string[] {
  if (!fs.existsSync(testDir)) return [];
  return fs.readdirSync(testDir).filter((f) => f.endsWith(".test.ts"));
}

export { discover } from "./discover";
export { validate } from "./validate";
export { mermaid } from "./diagram";
export type {
  Architecture,
  ModuleInfo,
  PatternIssue,
  IssueType,
} from "./types";
export type { DiscoverInputs, FileEntry } from "./discover";
