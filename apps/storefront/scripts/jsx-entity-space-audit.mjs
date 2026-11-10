#!/usr/bin/env node
// jsx-entity-space-audit.mjs: finds page text the production build renders
// without the space in front of it.
//
// What goes wrong. The compiler Next uses for production (its bundled SWC,
// seen in Next 16.2.11) drops the leading space of a JSX text when that text
// wraps over more than one source line AND holds an HTML entity (&apos;,
// &amp;, &quot;, &#39; ...). So
//
//     <strong>Agent keys:</strong> when an
//     operator creates the agent&apos;s profile
//
// is served as "Agent keys:when an operator ...". The same text on one line,
// or without an entity, keeps its space. Vitest compiles with a different
// tool and keeps the space, so no test of rendered output sees this; it was
// found on 2026-11-10 by reading the live privacy notice.
//
// What this does. It reads every .tsx and .jsx file under a folder, finds
// each JSX text that starts with a space, wraps and holds an entity, and
// confirms each one by compiling it with that same bundled compiler. It
// prints the places and exits 1 if there are any.
//
// The fix for a place it reports: write the space as {" "} after the tag.
//
//     <strong>Agent keys:</strong>{" "}when an
//
// Not wired into CI or `pnpm verify`: making it a gate is the owner's choice
// (AGENTS.md principle 8). Run it by hand:
//
//     pnpm --filter cambridgetcg-storefront audit:jsx-spaces
//     node scripts/jsx-entity-space-audit.mjs src/app/privacy --list
//
// Two pages' own tests call findDroppedSpaces() on their source: the privacy
// notice and the agents methodology page, where the defect was found.
//
// Written by an AI agent (Claude Code session 99296f25).
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

// typescript and Next's bundled compiler are CommonJS, resolved from the app
// this is run in (apps/storefront).
const require = createRequire(path.join(process.cwd(), "package.json"));
const ts = require("typescript");
const swc = require("next/dist/build/swc");

const ENTITY = /&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i;

function sourceFiles(target, out = []) {
  if (fs.statSync(target).isFile()) return [target];
  for (const e of fs.readdirSync(target, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(target, e.name);
    if (e.isDirectory()) sourceFiles(p, out);
    else if (/\.(tsx|jsx)$/.test(e.name) && !/\.test\.(tsx|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

// true: the compiler drops the space; false: it keeps it; null: not known.
export async function dropsLeadingSpace(raw) {
  // Compile <x><y />TEXT</x> with the classic runtime and a stand-in h(), then
  // read the text child back, so quotes and escapes in the text do not matter.
  const src = "const a = <x><y />" + raw + "</x>;";
  try {
    const out = await swc.transform(src, { filename: "probe.tsx", jsc: { parser: { syntax: "typescript", tsx: true }, transform: { react: { runtime: "classic", pragma: "h", pragmaFrag: "f" } }, target: "es2022" } });
    const tree = new Function("h", out.code + "; return a;")((tag, props, ...children) => ({ tag, children }));
    const textChild = tree.children.find((c) => typeof c === "string");
    if (typeof textChild !== "string") return null;
    return !textChild.startsWith(" ");
  } catch {
    return null;
  }
}

/**
 * Every JSX text under `target` (a file or a folder) whose leading space the
 * production compiler drops, plus any candidate it could not classify.
 * @returns {Promise<{scanned: number, candidates: number, hits: {file: string, line: number, start: string}[], unknown: {file: string, line: number, start: string}[]}>}
 */
export async function findDroppedSpaces(target) {
  await swc.loadBindings();
  const hits = [];
  const unknown = [];
  let scanned = 0;
  let candidates = 0;
  for (const file of sourceFiles(path.resolve(target))) {
    scanned++;
    const text = fs.readFileSync(file, "utf8");
    if (!ENTITY.test(text)) continue;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const nodes = [];
    (function walk(n) { if (n.kind === ts.SyntaxKind.JsxText) nodes.push(n); ts.forEachChild(n, walk); })(sf);
    for (const n of nodes) {
      const raw = text.slice(n.pos, n.end);
      // Starts with a space before a word, wraps, and holds an entity.
      if (!/^[ \t]+\S/.test(raw) || !raw.includes("\n") || !ENTITY.test(raw)) continue;
      candidates++;
      const place = {
        file: path.relative(process.cwd(), file),
        line: sf.getLineAndCharacterOfPosition(n.pos).line + 1,
        start: raw.trimStart().slice(0, 48).replace(/\s+/g, " "),
      };
      const dropped = await dropsLeadingSpace(raw);
      if (dropped === null) unknown.push(place);
      else if (dropped) hits.push(place);
    }
  }
  return { scanned, candidates, hits, unknown };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const target = process.argv[2] || "src";
  const jsonOut = process.argv.includes("--json") ? process.argv[process.argv.indexOf("--json") + 1] : null;
  findDroppedSpaces(target).then(({ scanned, candidates, hits, unknown }) => {
    const perFile = {};
    for (const h of hits) perFile[h.file] = (perFile[h.file] || 0) + 1;
    console.log(`scanned ${scanned} files | candidates ${candidates} | space dropped ${hits.length} | could not classify ${unknown.length} | files affected ${Object.keys(perFile).length}`);
    for (const [f, c] of Object.entries(perFile).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(String(c).padStart(4), f);
    for (const u of unknown) console.log("  unclassified:", `${u.file}:${u.line}`, JSON.stringify(u.start));
    if (process.argv.includes("--list")) for (const h of hits) console.log(`  ${h.file}:${h.line}  ${JSON.stringify(h.start)}`);
    if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(hits, null, 1));
    if (hits.length || unknown.length) process.exitCode = 1;
  }).catch((e) => { console.error("error:", String(e && e.message).slice(0, 400)); process.exit(1); });
}
