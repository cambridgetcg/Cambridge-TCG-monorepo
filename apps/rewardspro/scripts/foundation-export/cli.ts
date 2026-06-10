#!/usr/bin/env tsx
/**
 *   npm run foundation:export
 *
 * Writes `tokens.json` + `tokens.ts` into `dist/foundation/`. The
 * directory is gitignored by default — this is a derived artifact,
 * not source. Downstream consumers regenerate as part of their build.
 */
import * as path from "node:path";
import { exportFoundation } from "./index";

const result = exportFoundation();

console.log(`✓ Exported foundation → ${path.relative(process.cwd(), result.dir)}/`);
for (const a of result.artifacts) {
  console.log(`    ${a.filename.padEnd(14)} ${a.bytes.toString().padStart(6)} bytes`);
}
