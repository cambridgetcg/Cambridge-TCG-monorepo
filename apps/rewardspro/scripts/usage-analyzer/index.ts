/**
 * Top-level facade — read every widget asset, analyze against the registry.
 *
 * For programmatic / synthetic input, import `analyze` from `./analyzer`
 * directly and pass your own files.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { analyze } from "./analyzer";
import { registry } from "../rp-registry";
import type { ScannedFile, UsageReport } from "./types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ASSETS_DIR = path.resolve(
  __dirname,
  "../../extensions/theme-app-extension-rewardspro/assets"
);

const ASSETS_REL = "extensions/theme-app-extension-rewardspro/assets";

/** Files we always exclude — `rp-shared.css` IS the canonical and would
 * skew unused counts to zero; `rp-utils.js` is the runtime, not a widget. */
const EXCLUDE = new Set(["rp-shared.css"]);

export function loadWidgetAssets(): ScannedFile[] {
  return fs
    .readdirSync(ASSETS_DIR)
    .filter((name) => /\.(css|js)$/.test(name))
    .filter((name) => !EXCLUDE.has(name))
    .map((name) => ({
      path: `${ASSETS_REL}/${name}`,
      content: fs.readFileSync(path.join(ASSETS_DIR, name), "utf-8"),
    }));
}

export function analyzeWidgetAssets(): UsageReport {
  return analyze(loadWidgetAssets(), registry);
}

export { analyze } from "./analyzer";
export type {
  UsageReport,
  ScannedFile,
  FileReference,
} from "./types";
