/**
 * Top-level facade — runs the formatters against the canonical
 * registry and writes the artifacts to `dist/foundation/`.
 *
 * Bounded write: only touches `dist/foundation/`. Never modifies any
 * source file or any artifact outside that directory.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { registry } from "../rp-registry";
import { formatJson, formatTs } from "./format";
import type { Artifact } from "./types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const EXPORT_DIR = path.resolve(__dirname, "../../dist/foundation");

export interface ExportResult {
  dir: string;
  artifacts: Array<{ filename: string; bytes: number }>;
}

export function buildArtifacts(): Artifact[] {
  return [formatJson(registry), formatTs(registry)];
}

export function exportFoundation(targetDir = EXPORT_DIR): ExportResult {
  fs.mkdirSync(targetDir, { recursive: true });
  const artifacts = buildArtifacts();
  const written: ExportResult["artifacts"] = [];
  for (const a of artifacts) {
    const file = path.join(targetDir, a.filename);
    fs.writeFileSync(file, a.content);
    written.push({ filename: a.filename, bytes: a.content.length });
  }
  return { dir: targetDir, artifacts: written };
}

export { formatJson, formatTs } from "./format";
export type { Artifact, ExportFormat } from "./types";
