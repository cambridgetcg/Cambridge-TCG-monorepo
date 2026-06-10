/**
 * Top-level facade — composes migration-planner output with widget
 * file content to produce concrete patch manifests.
 *
 * Bounded write: emits only to `dist/migrations/`. Never mutates
 * source. The patches are *artifacts*, like `tokens.json`, not
 * applied changes.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { generateMigrationPlan } from "../migration-planner";
import { loadWidgetAssets } from "../usage-analyzer";
import { patch, renderMarkdown } from "./patcher";
import type { PatchManifest } from "./types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PATCH_DIR = path.resolve(__dirname, "../../dist/migrations");

export interface BuildPatchOptions {
  /** Specific shared primitive to target (e.g. `"rp-card"`). If omitted, generates patches for the highest-impact suggestion only. */
  target?: string;
  /** Override the output directory (testing). */
  outputDir?: string;
}

export interface BuildPatchResult {
  manifests: PatchManifest[];
  written: Array<{ path: string; bytes: number }>;
}

export function buildPatches(opts: BuildPatchOptions = {}): BuildPatchResult {
  const plan = generateMigrationPlan();
  const files = loadWidgetAssets();

  // Pick which suggestion(s) to patch. By default, the top-ranked one;
  // explicit --target opts in to a specific shared primitive.
  const suggestions = opts.target
    ? plan.suggestions.filter((s) => s.target === opts.target)
    : plan.suggestions.slice(0, 1);

  if (suggestions.length === 0) {
    return { manifests: [], written: [] };
  }

  const manifests: PatchManifest[] = [];
  for (const s of suggestions) {
    for (const candidate of s.candidates) {
      manifests.push(
        patch({
          source: candidate.name,
          target: s.target,
          files,
        })
      );
    }
  }

  const outputDir = opts.outputDir ?? PATCH_DIR;
  fs.mkdirSync(outputDir, { recursive: true });
  const written: BuildPatchResult["written"] = [];
  for (const m of manifests) {
    const stem = `${m.source}__to__${m.target}`;
    const jsonPath = path.join(outputDir, `${stem}.json`);
    const mdPath = path.join(outputDir, `${stem}.md`);
    const json = JSON.stringify(m, null, 2) + "\n";
    const md = renderMarkdown(m);
    fs.writeFileSync(jsonPath, json);
    fs.writeFileSync(mdPath, md);
    written.push({ path: jsonPath, bytes: json.length });
    written.push({ path: mdPath, bytes: md.length });
  }
  return { manifests, written };
}

export { patch, renderMarkdown } from "./patcher";
export type { PatcherInputs } from "./patcher";
export type { PatchManifest, FilePatch, Edit } from "./types";
