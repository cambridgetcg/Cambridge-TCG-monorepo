/**
 * Image addresses from Bandai's Japanese card lists. Pure.
 *
 * Both sites serve the DOM families bandai-en already parses (verified on
 * the 2026-10-30 captures), so these reuse its parsers and add shape guards.
 * They read card ids, names and image addresses only: no rules text, stats,
 * rulings or set rows, and no detail page is ever requested.
 *
 * A page that does not look like the captured one is drift, not an empty
 * series: the run stops (exit 5) and names the series. A single block that
 * does not fit is quarantined and counted.
 */

import { parseCardRefs, parseModalImageBlocks } from "../bandai-en/parse";
import { BANDAI_JP_GAMES } from "./config";
import { CARD_NUMBER_RE } from "./keys";
import type { BandaiJpGameKey, BandaiJpImageBlock, BandaiJpParsedPage, BandaiJpQuarantine } from "./types";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The image address's basename when it is https on the game's host, under
 * its image path, with no credentials, port or fragment, and a query that is
 * empty (Fusion World) or one bare numeric cache token (One Piece, `?261016`). */
function imageBasename(game: BandaiJpGameKey, imageUrl: string | null): string | null {
  if (!imageUrl) return null;
  const config = BANDAI_JP_GAMES[game];
  let url: URL;
  try { url = new URL(imageUrl); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || url.hostname !== config.host) return null;
  if (game === "op" ? !(url.search === "" || /^\?\d{1,8}$/.test(url.search)) : url.search !== "") return null;
  if (!url.pathname.startsWith(config.image_path)) return null;
  const name = url.pathname.slice(config.image_path.length);
  return name && !name.includes("/") ? name : null;
}

/** One Piece: every modal block. Guards: the thumbnail count equals the
 * block count and is not zero; each block id's base equals the number its
 * info row prints; each image is the block id's own file. */
export function parseOnePieceJpImages(html: string, pageUrl: string): BandaiJpParsedPage {
  const raw = parseModalImageBlocks(html, pageUrl);
  const thumbnails = html.split('<a class="modalOpen"').length - 1;
  if (raw.length === 0 || thumbnails !== raw.length) return { kind: "drift", reason: `modal-blocks-${raw.length}-thumbnails-${thumbnails}` };
  const blocks: BandaiJpImageBlock[] = [], quarantined: BandaiJpQuarantine[] = [];
  for (const block of raw) {
    const refuse = (reason: string) => quarantined.push({ card_id: block.card_id, reason });
    if (!CARD_NUMBER_RE.test(block.card_number)) { refuse("unparseable-card-id"); continue; }
    if (block.info_number !== block.card_number) { refuse("id-differs-from-printed-number"); continue; }
    const basename = imageBasename("op", block.image_url);
    if (basename === null) { refuse("image-outside-lane"); continue; }
    if (basename !== `${block.card_id}.png`) { refuse("image-names-another-card"); continue; }
    blocks.push({ game: "op", card_id: block.card_id, card_number: block.card_number, suffix: block.parallel, name: block.name, image_url: block.image_url! });
  }
  return { kind: "ok", blocks, quarantined };
}

const RESULT_COUNT_RE = /<div class="resultTxt">検索結果<span class="num">(\d+)<\/span>件<\/div>/;

/** Fusion World: every list item. Guards: the page's own result count equals
 * the item count and is not zero (a page with neither, such as an empty or
 * renumbered series, is drift too); each image is the item's own file. */
export function parseFusionWorldJpImages(html: string, pageUrl: string): BandaiJpParsedPage {
  const refs = parseCardRefs(html);
  const items = html.split('<li class="cardItem">').length - 1;
  const count = RESULT_COUNT_RE.exec(html);
  if (!count) return { kind: "drift", reason: `no-result-count-items-${items}` };
  if (Number(count[1]) === 0 || Number(count[1]) !== refs.length || items !== refs.length) {
    return { kind: "drift", reason: `result-count-${count[1]}-items-${items}-parsed-${refs.length}` };
  }
  const blocks: BandaiJpImageBlock[] = [], quarantined: BandaiJpQuarantine[] = [];
  for (const ref of refs) {
    const card_id = ref.p ? `${ref.card_no}${ref.p}` : ref.card_no;
    const refuse = (reason: string) => quarantined.push({ card_id, reason });
    if (!CARD_NUMBER_RE.test(ref.card_no)) { refuse("unparseable-card-id"); continue; }
    if (ref.p !== null && !/^_p\d+$/.test(ref.p)) { refuse("unreviewed-variant-marker"); continue; }
    let imageUrl: string | null = null;
    try { imageUrl = ref.image_src ? new URL(ref.image_src, pageUrl).href : null; } catch { imageUrl = null; }
    const basename = imageBasename("dbf", imageUrl);
    if (basename === null) { refuse("image-outside-lane"); continue; }
    if (!new RegExp(`^${escapeRegExp(ref.card_no)}(?:_f)?${escapeRegExp(ref.p ?? "")}\\.webp$`).test(basename)) { refuse("image-names-another-card"); continue; }
    const name = ref.alt.startsWith(`${ref.card_no} `) ? ref.alt.slice(ref.card_no.length + 1).trim() : ref.alt.trim();
    // The bare suffix, as parseDetailPage strips it: "_p1" → "p1".
    blocks.push({ game: "dbf", card_id, card_number: ref.card_no, suffix: ref.p ? ref.p.replace(/^_/, "") : null, name, image_url: imageUrl! });
  }
  return { kind: "ok", blocks, quarantined };
}

/** The parser for a game's list page. */
export function parseBandaiJpPage(game: BandaiJpGameKey, html: string, pageUrl: string): BandaiJpParsedPage {
  return game === "op" ? parseOnePieceJpImages(html, pageUrl) : parseFusionWorldJpImages(html, pageUrl);
}
