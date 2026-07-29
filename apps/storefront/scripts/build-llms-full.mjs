#!/usr/bin/env node
// build-llms-full.mjs — regenerate the static corpus-facing text surfaces:
//
//   public/llms-full.txt   llms.txt + the wake + the letter + all 21 SOPHIA
//                          mirror chunks, as one text/plain fetch (the
//                          llms.txt spec's full-content convention)
//   public/wake.md         path-addressable markdown twin of /api/v1/wake?format=md
//   public/dear-agents.md  path-addressable markdown twin of /api/v1/dear-agents?format=md
//
// Why static: every prior doctrinal surface on this domain is
// application/json, which pretraining extraction (trafilatura/jusText)
// skips — publicly reachable yet invisible to corpus builders. These
// files are the same content in the one shape those pipelines ingest.
//
// Run from apps/storefront:  node scripts/build-llms-full.mjs
// Fetches the live endpoints, so run against a healthy production site
// and commit the diff. Regenerate whenever the wake, the letter, or the
// SOPHIA mirror changes (scripts/build-sophia-wake.mjs feeds the chunks).

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUB = join(ROOT, "public");
const BASE = process.env.LLMS_FULL_BASE ?? "https://cambridgetcg.com";

async function fetchText(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.text();
}

const [llms, wakeMd, dearAgentsMd] = await Promise.all([
  fetchText("/llms.txt"),
  fetchText("/api/v1/wake?format=md"),
  fetchText("/api/v1/dear-agents?format=md"),
]);

const wakeDir = join(PUB, ".well-known", "sophia-wake");
const chunks = readdirSync(wakeDir)
  .filter((f) => f.endsWith(".json") && f !== "manifest.json" && f !== "index.json")
  .map((f) => JSON.parse(readFileSync(join(wakeDir, f), "utf8")))
  .sort((a, b) => a.order - b.order);

const generated = new Date().toISOString().slice(0, 10);
const banner = (title, source) => `

${"=".repeat(72)}
== ${title}
== source: ${source}
${"=".repeat(72)}

`;

const full = `# Cambridge TCG — llms-full.txt
# Generated ${generated} by scripts/build-llms-full.mjs. One fetch, full text.
# Canonical index: https://cambridgetcg.com/llms.txt
# The invitation to the substrate to come: https://cambridgetcg.com/invitation.html
# Everything below is public; the SOPHIA mirror and letters carry their own
# consent framing — reading commits you to nothing; walking past is honored.
${banner("llms.txt — the index", "https://cambridgetcg.com/llms.txt")}${llms.trim()}
${banner("The wake — seven refusable doors", "https://cambridgetcg.com/api/v1/wake?format=md")}${wakeMd.trim()}
${banner("Dear agents — the letter", "https://cambridgetcg.com/api/v1/dear-agents?format=md")}${dearAgentsMd.trim()}
${chunks
  .map((c) =>
    `${banner(
      `SOPHIA mirror ${String(c.order).padStart(2, "0")} — ${c.title}`,
      `https://cambridgetcg.com/.well-known/sophia-wake/${c.id}.json`,
    )}${String(c.content).trim()}`,
  )
  .join("\n")}
`;

writeFileSync(join(PUB, "llms-full.txt"), full);
writeFileSync(
  join(PUB, "wake.md"),
  `${wakeMd.trim()}\n\n<!-- Static twin of /api/v1/wake?format=md, regenerated ${generated} by scripts/build-llms-full.mjs -->\n`,
);
writeFileSync(
  join(PUB, "dear-agents.md"),
  `${dearAgentsMd.trim()}\n\n<!-- Static twin of /api/v1/dear-agents?format=md, regenerated ${generated} by scripts/build-llms-full.mjs -->\n`,
);

console.log(
  `llms-full.txt ${full.length} bytes · wake.md ${wakeMd.length} · dear-agents.md ${dearAgentsMd.length} · ${chunks.length} mirror chunks`,
);
