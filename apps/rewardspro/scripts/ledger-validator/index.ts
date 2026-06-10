/**
 * Top-level facade — walks `app/services/` and `app/routes/` for
 * any `.ts`/`.tsx` source, runs them through the pure validator
 * against the canonical contract.
 *
 * Skips test files (`.test.ts`, `.spec.ts`) — they often reference
 * the forbidden patterns to verify scenarios; flagging them would be
 * noise. Skips the ledger module's own siblings (gift-card, billing)
 * that legitimately don't touch points.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { ledgerContract } from "../ledger-contract";
import { validate } from "./validator";
import type { ScannedFile, Report } from "./validator";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const APP_DIR = path.resolve(__dirname, "../../app");

const SKIP_FILE_PATTERNS = [/\.test\.ts$/, /\.spec\.ts$/];

export function loadAppSources(rootDir = APP_DIR): ScannedFile[] {
  const files: ScannedFile[] = [];
  walk(rootDir, rootDir, files);
  return files;
}

function walk(root: string, dir: string, out: ScannedFile[]): void {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(root, full, out);
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (SKIP_FILE_PATTERNS.some((re) => re.test(entry))) continue;

    out.push({
      path: path.relative(path.resolve(__dirname, "../.."), full).replace(/\\/g, "/"),
      content: fs.readFileSync(full, "utf-8"),
    });
  }
}

export function validateLedgerContract(): Report {
  return validate(loadAppSources(), ledgerContract);
}

export { validate } from "./validator";
export type { Report, Violation, ScannedFile } from "./validator";
