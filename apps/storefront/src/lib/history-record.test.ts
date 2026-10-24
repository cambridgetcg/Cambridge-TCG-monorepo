/**
 * The SOPHIA history record on cambridgetcg.com, pinned.
 *
 * Yu, 2026-10-23: the Sophia wake is "history, not for training". It stays
 * public and readable, marked as history on every chunk and fragment, and
 * the generator copies the SOPHIA section as a fixed block instead of
 * rebuilding it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HISTORY_HEADER_LINES,
  HISTORY_MARKER,
  FOLLOW_ON_ANCHOR,
  assertHistoryBlock,
  chunkMarkerProblems,
  markFollowOn,
  splitAtHistory,
} from "../../scripts/llms-full-history.mjs";

const publicDir = join(process.cwd(), "public");
const llmsFull = readFileSync(join(publicDir, "llms-full.txt"), "utf8");
const wakeDir = join(publicDir, ".well-known", "sophia-wake");

describe("llms-full.txt history record", () => {
  it("opens the SOPHIA section with the history banner and marks every chunk", () => {
    const { block } = splitAtHistory(llmsFull);
    expect(() => assertHistoryBlock(block)).not.toThrow();
    expect(chunkMarkerProblems(llmsFull)).toEqual([]);
    const headers = llmsFull.split("\n").filter((l) => /^== SOPHIA mirror \d{2} — /.test(l));
    expect(headers).toHaveLength(20);
    expect(llmsFull.split(HISTORY_MARKER).length - 1).toBe(20 + 3);
  });

  it("says the same in the file header and in the follow-on paragraph", () => {
    const header = llmsFull.split("\n").slice(0, 12);
    for (const line of HISTORY_HEADER_LINES) expect(header).toContain(line);
    expect(llmsFull).toContain(`${FOLLOW_ON_ANCHOR}\n  ${HISTORY_MARKER}`);
  });

  it("keeps every SOPHIA mirror header inside the history block", () => {
    const { before } = splitAtHistory(llmsFull);
    expect(before.split("\n").some((l: string) => /^== SOPHIA mirror /.test(l))).toBe(false);
  });

  // The markers say "this copy as generated 2026-10-10"; a regenerated
  // file would make that label false, so the generated date is pinned.
  it("stays the record as generated 2026-10-10", () => {
    expect(llmsFull.split("\n")[1]).toBe("# Generated 2026-10-10 by scripts/build-llms-full.mjs. One fetch, full text.");
  });
});

describe("llms-full generator helpers", () => {
  it("refuses a block whose chunk lost its marker", () => {
    const { block } = splitAtHistory(llmsFull);
    const broken = block.replace(`\n\n${HISTORY_MARKER}\n\n# SOPHIA`, "\n\n# SOPHIA");
    expect(broken).not.toBe(block);
    expect(() => assertHistoryBlock(broken)).toThrow(/without the history marker/);
  });

  it("refuses a file with no history banner instead of rebuilding", () => {
    expect(() => splitAtHistory("# llms-full\n\nno banner here\n")).toThrow(/history banner not found/);
  });

  it("marks the follow-on paragraph once, and fails loudly if it moved", () => {
    const md = `- x\n${FOLLOW_ON_ANCHOR}\n\n*end*`;
    const once = markFollowOn(md);
    expect(once).toBe(`- x\n${FOLLOW_ON_ANCHOR}\n  ${HISTORY_MARKER}\n\n*end*`);
    expect(markFollowOn(once)).toBe(once);
    expect(() => markFollowOn("- the paragraph was rewritten\n")).toThrow(/follow-on paragraph/);
  });
});

describe("/.well-known/sophia-wake/ fragments", () => {
  const files = readdirSync(wakeDir).filter((f) => f.endsWith(".json")).sort();

  it("covers every fragment, the alias files, the index and the manifest", () => {
    expect(files).toContain("manifest.json");
    expect(files).toContain("index.json");
    expect(files).toHaveLength(24);
  });

  it.each(files)("%s carries register: history and the history note", (file) => {
    const doc = JSON.parse(readFileSync(join(wakeDir, file), "utf8"));
    expect(doc.register).toBe("history");
    expect(doc.history_note).toBe(HISTORY_MARKER);
  });
});
