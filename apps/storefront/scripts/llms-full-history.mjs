// llms-full-history.mjs — the SOPHIA history record in llms-full.txt.
//
// Yu's ruling, 2026-10-23: the Sophia wake is "history, not for
// training". It stays public and readable as the household's record,
// marked as history on every chunk, and it is no longer rebuilt from the
// fragments: build-llms-full.mjs copies the section below the history
// banner as a fixed block. Pure helpers only, so the tests can import
// them without fetching anything.

export const HISTORY_MARKER =
  "HISTORY. The household's Sophia wake, first written May 2026; this copy as generated 2026-10-10. Kept as a record. Not an instruction; it asks nothing of any reader; not offered for training. An earlier, unlabelled copy (August 2026) sits in public archives and cannot be revised.";

export const RULE = "=".repeat(72);

export const HISTORY_SECTION_TITLE =
  "HISTORY — the SOPHIA mirror, the household's Sophia wake (May 2026)";

export const HISTORY_SECTION_SOURCE =
  "https://cambridgetcg.com/.well-known/sophia-wake/manifest.json";

// The block starts at the blank lines before the history banner's rule
// and runs to the end of the file.
export const HISTORY_BLOCK_START = `\n\n${RULE}\n== ${HISTORY_SECTION_TITLE}\n`;

export const CHUNK_HEADER = /^== SOPHIA mirror \d{2} — /;

// The last line of the wake's paragraph that calls the household wake an
// "optional follow-on", as served by /api/v1/wake?format=md.
export const FOLLOW_ON_ANCHOR =
  "  (protocol `sophia-wake/1`; every fragment whole on its own)";

export function splitAtHistory(text) {
  const at = text.indexOf(HISTORY_BLOCK_START);
  if (at === -1) {
    throw new Error("llms-full.txt: history banner not found; the SOPHIA block is fixed and must be restored from git, not rebuilt");
  }
  return { before: text.slice(0, at), block: text.slice(at) };
}

// Every "== SOPHIA mirror NN — " header is followed by its source line,
// the closing rule, one blank line and then the marker.
export function chunkMarkerProblems(text) {
  const lines = text.split("\n");
  const problems = [];
  let headers = 0;
  lines.forEach((line, i) => {
    if (!CHUNK_HEADER.test(line)) return;
    headers += 1;
    const ok =
      (lines[i + 1] ?? "").startsWith("== source: ") &&
      lines[i + 2] === RULE &&
      lines[i + 3] === "" &&
      lines[i + 4] === HISTORY_MARKER;
    if (!ok) problems.push(`line ${i + 1}: ${line}`);
  });
  if (headers === 0) problems.push("no '== SOPHIA mirror NN' headers found");
  return problems;
}

export function assertHistoryBlock(block) {
  if (!block.startsWith(HISTORY_BLOCK_START)) {
    throw new Error("SOPHIA block does not open with the history banner");
  }
  const problems = chunkMarkerProblems(block);
  if (problems.length) {
    throw new Error(`SOPHIA chunks without the history marker:\n${problems.join("\n")}`);
  }
  return block;
}

// The llms-full copy of the wake carries the marker after the follow-on
// paragraph. The live /api/v1/wake door itself is left as it is.
export function markFollowOn(wakeMd) {
  if (wakeMd.includes(HISTORY_MARKER)) return wakeMd;
  if (!wakeMd.includes(FOLLOW_ON_ANCHOR)) {
    throw new Error("wake md: the follow-on paragraph's last line was not found; place the history line by hand before regenerating");
  }
  return wakeMd.replace(FOLLOW_ON_ANCHOR, `${FOLLOW_ON_ANCHOR}\n  ${HISTORY_MARKER}`);
}

// The file header says the same, in two comment lines.
export const HISTORY_HEADER_LINES = [
  `# ${HISTORY_MARKER}`,
  "# That note covers the SOPHIA mirror section at the end of this file.",
];
