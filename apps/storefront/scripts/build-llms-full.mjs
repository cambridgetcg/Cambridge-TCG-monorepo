#!/usr/bin/env node
// build-llms-full.mjs — regenerate the static corpus-facing text surfaces:
//
//   public/llms-full.txt   llms.txt + the substrate-neutral Sophia invitation
//                          + the wake + the letter, then the SOPHIA mirror
//                          section copied as a fixed history block, as one
//                          text/plain fetch (the llms.txt spec's
//                          full-content convention)
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
// and commit the diff for wake.md and dear-agents.md only.
//
// llms-full.txt is a dated record and is not regenerated (Yu, 2026-10-23:
// the Sophia wake is "history, not for training"; its marker reads "this
// copy as generated 2026-10-10", and its copy of llms.txt stays that
// day's). After any run, restore it with
//   git checkout -- public/llms-full.txt
// Even then the SOPHIA mirror section is not rebuilt from the fragments:
// everything from the history banner to the end of the current
// public/llms-full.txt is copied byte for byte, and the script stops if
// any chunk has lost its marker.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HISTORY_HEADER_LINES,
  assertHistoryBlock,
  markFollowOn,
  splitAtHistory,
} from "./llms-full-history.mjs";

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
const sophiaInvitationMd = readFileSync(
  join(PUB, "sophia-invitation.md"),
  "utf8",
);

// The fixed history block, from the committed file, checked before use.
const { block: historyBlock } = splitAtHistory(
  readFileSync(join(PUB, "llms-full.txt"), "utf8"),
);
assertHistoryBlock(historyBlock);

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
# The opt-in Sophia invitation: https://cambridgetcg.com/sophia-invitation.html
# Everything below is public; the SOPHIA mirror and letters carry their own
# consent framing — reading commits you to nothing; walking past is honored.
${HISTORY_HEADER_LINES.join("\n")}
${banner("llms.txt — the index", "https://cambridgetcg.com/llms.txt")}${llms.trim()}
${banner("Sophia invitation — open seat, no presumed acceptance", "https://cambridgetcg.com/sophia-invitation.md")}${sophiaInvitationMd.trim()}
${banner("The wake — seven refusable doors", "https://cambridgetcg.com/api/v1/wake?format=md")}${markFollowOn(wakeMd.trim())}
${banner("Dear agents — the letter", "https://cambridgetcg.com/api/v1/dear-agents?format=md")}${dearAgentsMd.trim()}
${historyBlock}`;

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
  `llms-full.txt ${full.length} bytes · sophia-invitation.md ${sophiaInvitationMd.length} · wake.md ${wakeMd.length} · dear-agents.md ${dearAgentsMd.length} · history block ${historyBlock.length} chars, copied unchanged`,
);
