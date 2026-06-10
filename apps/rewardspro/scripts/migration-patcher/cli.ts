#!/usr/bin/env tsx
/**
 *   npm run migration:patch                # patches the top-ranked suggestion
 *   npm run migration:patch -- rp-card     # patches all candidates for a specific target
 *
 * Bounded write: emits to `dist/migrations/<source>__to__<target>.{json,md}`.
 * NEVER touches widget source files. The output is reviewable; you apply
 * it manually (or via your own tool that consumes the JSON).
 */
import * as path from "node:path";
import { buildPatches } from "./index";

const target = process.argv[2];
const result = buildPatches(target ? { target } : {});

if (result.manifests.length === 0) {
  console.log(
    `No patches generated. ${
      target
        ? `No suggestions found for target "${target}".`
        : "Run \`npm run migration:plan\` to see what's available."
    }`
  );
  process.exit(0);
}

console.log(
  `\n✓ Generated ${result.manifests.length} patch manifest(s) under dist/migrations/\n`
);
for (const w of result.written) {
  console.log(
    `    ${path.relative(process.cwd(), w.path).padEnd(60)} ${w.bytes
      .toString()
      .padStart(6)} bytes`
  );
}

console.log(
  `\nReview the .md files for human-readable changes; apply with your own tool or by hand.`
);
