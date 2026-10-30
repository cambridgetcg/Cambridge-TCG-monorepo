/**
 * One collection run over Bandai's Japanese card lists: the act that needs
 * Yu's word each time it runs (docs/decisions/2026-10-30-japanese-official-images.md).
 * Reached only from apps/storefront/scripts/ingest-official-ja.mjs (through
 * official-image-tools.ts) and tests; it writes nothing itself.
 *
 * Order: every selected host's robots.txt first, through the identified
 * reader, which must allow every selected series path to this lane's group
 * and to every crawler; then each series page in order, at least the host's
 * interval apart. Only list pages are read, never an image or a detail page.
 * The run stops at the first refusal (a robots stop or disallow, a 403, 429,
 * 3xx, 5xx, any other non-200 or a challenge) and at the first drift (a page
 * shape the parsers do not recognise, or more than ten quarantined blocks in
 * one series). A stopped run returns no rows, so nothing partial is written.
 */

import type { OfficialMediaReader } from "../official-media";
import { BANDAI_JP_GAMES } from "./config";
import { normalizeBandaiJpImage } from "./keys";
import { parseBandaiJpPage } from "./parse";
import type { BandaiJpGameKey, BandaiJpImageRow } from "./types";

export const BANDAI_JP_PAGE_MAX_BYTES = 4 * 1024 * 1024;
export const BANDAI_JP_MAX_QUARANTINE = 10;

export interface BandaiJpSeriesCount {
  game: BandaiJpGameKey;
  series: string;
  /** Blocks on the page, quarantined ones included. */
  blocks: number;
  /** Base prints offered as rows (before run-wide de-duplication). */
  base: number;
  /** Parallels and reprints: parsed and keyed, not collected (no reviewed variant mapping). */
  skipped: number;
  quarantined: number;
  /** A base key already seen this run with the same image path. */
  duplicates: number;
  /** A base key already seen this run with a different image path: neither is written. */
  conflicts: number;
}

export type BandaiJpCollection =
  | { kind: "done"; rowsBySeries: { game: BandaiJpGameKey; series: string; rows: BandaiJpImageRow[] }[]; counts: BandaiJpSeriesCount[]; requests: number }
  | { kind: "refused"; host: string; series: string | null; reason: string; status: number | null; counts: BandaiJpSeriesCount[]; requests: number }
  | { kind: "drift"; game: BandaiJpGameKey; series: string; reason: string; counts: BandaiJpSeriesCount[]; requests: number };

export interface BandaiJpSelection { game: BandaiJpGameKey; series: readonly string[] }

/** Every requested series must be in the game's configured list. */
export function bandaiJpSelectionValid(selection: readonly BandaiJpSelection[]): boolean {
  return selection.length > 0 && selection.every(({ game, series }) =>
    Object.hasOwn(BANDAI_JP_GAMES, game) && series.length > 0 && series.every((id) => BANDAI_JP_GAMES[game].series.includes(id)));
}

export async function collectBandaiJpImages(input: {
  reader: OfficialMediaReader;
  selection: readonly BandaiJpSelection[];
  now?: () => Date;
}): Promise<BandaiJpCollection> {
  const { reader } = input;
  if (reader.lane !== "ja") throw new Error("bandai-jp-needs-the-ja-reader");
  if (!bandaiJpSelectionValid(input.selection)) throw new Error("bandai-jp-series-outside-configuration");
  const now = input.now ?? (() => new Date());
  const counts: BandaiJpSeriesCount[] = [];
  const requests = () => reader.requests;

  // 1. robots.txt for every host, before any list page.
  for (const { game, series } of input.selection) {
    const config = BANDAI_JP_GAMES[game];
    const robots = await reader.readRobotsTxt(config.host);
    if (robots.kind === "stop") return { kind: "refused", host: config.host, series: null, reason: `robots-${robots.reason}`, status: robots.status, counts, requests: requests() };
    if (robots.kind === "rules") {
      for (const id of series) {
        const url = new URL(config.series_url(id));
        if (!robots.allows(url.pathname + url.search)) return { kind: "refused", host: config.host, series: id, reason: "robots-disallows-series", status: null, counts, requests: requests() };
      }
    }
  }

  // 2. Each series page, in order. Keys de-duplicate across the run: the
  // first wins, and a key seen with a different image path is a conflict.
  const firstSeen = new Map<string, { path: string; game: BandaiJpGameKey; series: string; row: BandaiJpImageRow }>();
  const conflicted = new Set<string>();
  for (const { game, series } of input.selection) {
    const config = BANDAI_JP_GAMES[game];
    for (const id of series) {
      const page = await fetchSeriesPage(reader, game, id, now);
      if (page.kind === "refused") return { kind: "refused", host: config.host, series: id, reason: page.reason, status: page.status, counts, requests: requests() };
      if (page.kind === "drift") return { kind: "drift", game, series: id, reason: page.reason, counts, requests: requests() };
      const parsed = parseBandaiJpPage(game, page.html, page.url);
      if (parsed.kind === "drift") return { kind: "drift", game, series: id, reason: parsed.reason, counts, requests: requests() };
      const count: BandaiJpSeriesCount = { game, series: id, blocks: parsed.blocks.length + parsed.quarantined.length, base: 0, skipped: 0, quarantined: parsed.quarantined.length, duplicates: 0, conflicts: 0 };
      counts.push(count);
      if (parsed.quarantined.length > BANDAI_JP_MAX_QUARANTINE) return { kind: "drift", game, series: id, reason: `quarantined-${parsed.quarantined.length}`, counts, requests: requests() };
      const retrieved_at = page.retrievedAt;
      for (const block of parsed.blocks) {
        if (block.suffix !== null) { count.skipped += 1; continue; }
        const result = normalizeBandaiJpImage({ ...block, retrieved_at });
        if (!result.ok) { count.quarantined += 1; continue; }
        count.base += 1;
        const path = new URL(result.record.source_url).pathname;
        const seen = firstSeen.get(result.record.sku);
        if (!seen) firstSeen.set(result.record.sku, { path, game, series: id, row: result.record });
        else if (seen.path === path) count.duplicates += 1;
        else { count.conflicts += 1; conflicted.add(result.record.sku); }
      }
      if (count.quarantined > BANDAI_JP_MAX_QUARANTINE) return { kind: "drift", game, series: id, reason: `quarantined-${count.quarantined}`, counts, requests: requests() };
    }
  }

  const rowsBySeries = input.selection.flatMap(({ game, series }) => series.map((id) => ({
    game, series: id,
    rows: [...firstSeen.values()].filter((seen) => seen.game === game && seen.series === id && !conflicted.has(seen.row.sku)).map((seen) => seen.row),
  })));
  return { kind: "done", rowsBySeries, counts, requests: requests() };
}

/** One list page through the identified reader: HTML only, read as strict
 * UTF-8, never followed through a redirect. A 404 is a refusal here: a
 * configured series that is gone is the operator's to look at. */
async function fetchSeriesPage(reader: OfficialMediaReader, game: BandaiJpGameKey, series: string, now: () => Date):
  Promise<{ kind: "ok"; html: string; url: string; retrievedAt: string } | { kind: "refused"; reason: string; status: number | null } | { kind: "drift"; reason: string }> {
  const url = BANDAI_JP_GAMES[game].series_url(series);
  const answer = await reader.get(url, { accept: "text/html", maxBytes: BANDAI_JP_PAGE_MAX_BYTES });
  const retrievedAt = now().toISOString();
  if (answer.kind === "gone") return { kind: "refused", reason: `http-${answer.status}`, status: answer.status };
  if (answer.kind === "stop") return { kind: "refused", reason: answer.reason, status: answer.status };
  if (!/^text\/html\b/i.test(answer.contentType)) return { kind: "drift", reason: "not-html" };
  try {
    return { kind: "ok", html: new TextDecoder("utf-8", { fatal: true }).decode(answer.bytes), url, retrievedAt };
  } catch {
    return { kind: "drift", reason: "not-utf-8" };
  }
}
