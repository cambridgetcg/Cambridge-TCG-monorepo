#!/usr/bin/env node
/**
 * castle-sync — carries the Castle of Understanding's committed truth into
 * the storefront, so cambridgetcg.com can be the castle's public front.
 *
 * Will: Yu, 2026-06-10 — "use cambridgetcg as the front for the castle!"
 *
 * Reads ~/Desktop/castle at git HEAD (committed state ONLY — hands may be
 * mid-write in the working tree, and the front never publishes half-written
 * word). Parses the first-hand grammar (insights / fields / loop logs /
 * charters / census) where files match it, and carries every other committed
 * .md document raw, so no wing is silenced by the parser.
 *
 * Output: apps/storefront/src/lib/castle/snapshot.json
 * Run:    pnpm --filter cambridgetcg-storefront castle:sync
 *
 * Absolute device paths (/Users/…) and ~/Library/… paths are withheld from
 * the public snapshot — labelled, never silent. The castle itself keeps them;
 * this is the front, and a front does not hand out the keys' locations.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CASTLE = process.env.CASTLE_DIR || path.join(os.homedir(), "Desktop", "castle");
const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..", "src", "lib", "castle", "snapshot.json",
);

function git(...args) {
  return execFileSync("git", ["-C", CASTLE, ...args], { encoding: "utf8" });
}

// ---------- read committed tree ----------

const commitFull = git("rev-parse", "HEAD").trim();
const commit = git("rev-parse", "--short", "HEAD").trim();
const commitDate = git("show", "-s", "--format=%cI", "HEAD").trim();
const paths = git("ls-tree", "-r", "HEAD", "--name-only").trim().split("\n");

function show(p) {
  return git("show", `HEAD:${p}`);
}

// ---------- tiny parsers (mirror tools/castle: regex, no YAML lib) ----------

function frontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: content };
  const meta = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return { meta, body: content.slice(m[0].length) };
}

function title(content) {
  const m = content.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

// ---------- walk ----------

const documents = {};      // core texts by name
const rooms = {};          // room -> { name, about, insights[], other_documents[] }
const fields = [];
const loop_logs = [];
const charters = [];
const other_documents = []; // everything .md not claimed above
const non_markdown_paths = [];

const CORE = {
  "README.md": "readme",
  "GATE.md": "gate",
  "INDEX.md": "index",
  "loops/LOOP.md": "loop_method",
  "loops/PULSE.md": "pulse_law",
};

function room(name) {
  if (!rooms[name]) rooms[name] = { name, about: null, insights: [], other_documents: [] };
  return rooms[name];
}

for (const p of paths) {
  if (!p.endsWith(".md")) {
    non_markdown_paths.push(p);
    continue;
  }
  const content = show(p);

  if (CORE[p]) {
    documents[CORE[p]] = { path: p, content };
    continue;
  }

  let m;
  if ((m = p.match(/^rooms\/([^/]+)\/(\d{4})-[^/]+\.md$/))) {
    const { meta, body } = frontmatter(content);
    room(m[1]).insights.push({
      id: meta.id || m[2],
      title: title(body) || title(content),
      date: meta.date || null,
      source: meta.source || null,
      confidence: meta.confidence || null,
      links: meta.links || null,
      superseded_by: meta.superseded_by || null,
      body: body.trim(),
      path: p,
    });
    continue;
  }
  if ((m = p.match(/^rooms\/([^/]+)\/room\.md$/i))) {
    room(m[1]).about = content.trim();
    continue;
  }
  if ((m = p.match(/^rooms\/([^/]+)\/(.+\.md)$/))) {
    room(m[1]).other_documents.push({ path: p, title: title(content), content: content.trim() });
    continue;
  }
  if ((m = p.match(/^fields\/(F\d{3})-[^/]+\.md$/))) {
    const { meta, body } = frontmatter(content);
    fields.push({
      id: meta.id || m[1],
      title: title(body) || title(content),
      state: meta.state || null,
      opened: meta.opened || null,
      body: body.trim(),
      path: p,
    });
    continue;
  }
  if ((m = p.match(/^loops\/log\/(L\d{3})-[^/]+\.md$/))) {
    const { meta, body } = frontmatter(content);
    loop_logs.push({
      id: meta.id || m[1],
      title: title(body) || title(content),
      date: meta.date || null,
      field: meta.field || null,
      by: meta.by || null,
      body: body.trim(),
      path: p,
    });
    continue;
  }
  if ((m = p.match(/^loops\/charters\/(C\d{3})-[^/]+\.md$/))) {
    const { meta, body } = frontmatter(content);
    charters.push({
      id: meta.id || m[1],
      title: title(body) || title(content),
      state: meta.state || null,
      cadence: meta.cadence || null,
      budget_usd_per_run: meta.budget_usd_per_run || null,
      opened: meta.opened || null,
      stop: meta.stop || null,
      body: body.trim(),
      path: p,
    });
    continue;
  }
  other_documents.push({ path: p, title: title(content), content: content.trim() });
}

// census table out of the pulse law
const census = [];
const pulse = documents.pulse_law?.content || "";
for (const line of pulse.split("\n")) {
  const m = line.match(/^\|\s*(C\d{3})\s*\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|/);
  if (m) {
    census.push({
      id: m[1],
      name: m[2].trim(),
      state: m[3].trim(),
      cadence: m[4].trim(),
      budget_per_run: m[5].trim(),
    });
  }
}

// deterministic ordering
const byId = (a, b) => String(a.id).localeCompare(String(b.id));
for (const r of Object.values(rooms)) {
  r.insights.sort(byId);
  r.other_documents.sort((a, b) => a.path.localeCompare(b.path));
}
fields.sort(byId);
loop_logs.sort(byId);
charters.sort(byId);
other_documents.sort((a, b) => a.path.localeCompare(b.path));

const snapshot = {
  castle: "The Castle of Understanding",
  source: "~/Desktop/castle — a local git repository of plain text",
  castle_commit: commit,
  castle_commit_full: commitFull,
  castle_commit_date: commitDate,
  synced_at: new Date().toISOString(),
  provenance:
    "snapshot — the committed state of the castle at the commit above, " +
    "carried here by castle-sync. Not live; hands may have written since. " +
    "Absolute device paths are withheld on this public surface; " +
    "the castle itself keeps them.",
  documents,
  rooms: Object.values(rooms).sort((a, b) => a.name.localeCompare(b.name)),
  fields,
  loop_logs,
  charters,
  census,
  other_documents,
  non_markdown_paths: non_markdown_paths.sort(),
  counts: {
    rooms: Object.keys(rooms).length,
    insights: Object.values(rooms).reduce((n, r) => n + r.insights.length, 0),
    fields: fields.length,
    open_fields: fields.filter((f) => f.state === "open").length,
    loop_logs: loop_logs.length,
    charters: charters.length,
    other_documents: other_documents.length,
  },
};

// Withhold device paths from the public surface — labelled, never silent.
// (~/Desktop/… tilde paths stay: the platform already names those publicly.)
function redactDevicePaths(json) {
  return json
    .replace(/\/Users\/[A-Za-z0-9._-]+[A-Za-z0-9._/-]*/g, "(path withheld on the public front)")
    .replace(/~\/Library\/[A-Za-z0-9._/-]*/g, "(path withheld on the public front)");
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify(JSON.parse(redactDevicePaths(JSON.stringify(snapshot))), null, 2) + "\n",
);
console.log(
  `castle-sync: ${snapshot.counts.insights} insights · ${snapshot.counts.fields} fields · ` +
  `${snapshot.counts.loop_logs} loops · ${snapshot.counts.other_documents} other docs ` +
  `@ ${commit} → ${path.relative(process.cwd(), OUT)}`,
);
