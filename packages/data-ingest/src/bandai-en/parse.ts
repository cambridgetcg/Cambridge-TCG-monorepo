/**
 * Pure HTML parsing for Bandai EN cardlist pages.
 *
 * The pages are server-rendered and structurally stable, so this is a
 * regex parser over known landmarks (no HTML-parser dependency — the
 * package convention; cf. cardrush/discovery.ts, tcgcollector). DOM
 * verified live 2026-07-11 against
 * https://en.onepiece-cardgame.com/cardlist/?series=569101:
 *
 *   <dl class="modalCol" id="OP01-001">            ← or OP01-001_p1 (parallel)
 *     <dt>
 *       <div class="infoCol"><span>OP01-001</span> | <span>L</span> | <span>LEADER</span></div>
 *       <div class="cardName">Roronoa Zoro</div>
 *     </dt>
 *     <dd>
 *       <div class="frontCol"><img ... data-src="../images/cardlist/card/OP01-001.png?260701"></div>
 *       <div class="backCol">
 *         <div class="cost"><h3>Life|Cost</h3>5</div>
 *         <div class="attribute"><h3>Attribute</h3><img alt="Slash"><i>Slash</i></div>
 *         <div class="power">…</div> <div class="counter">…</div>
 *         <div class="color">…</div> <div class="block"><h3>Block<br> icon</h3>1</div>
 *         <div class="feature"><h3>Type</h3>Supernovas/Straw Hat Crew</div>
 *         <div class="text"><h3>Effect</h3>[DON!! x1] …</div>
 *         <div class="trigger"><h3>Trigger</h3>[Trigger] …</div>       ← optional
 *         <div class="getInfo"><h3>Card Set(s)</h3>-ROMANCE DAWN- [OP01]</div>
 *         <div class="getInfo remarks"><h3>Notes</h3><a …>Errata Card</a></div>  ← skipped
 *       </div>
 *     </dd>
 *   </dl>
 *
 * ── Text policy (docs/EN-CARD-DATA.md §3) ────────────────────────────
 *
 * We capture *rules* text only: Effect + Trigger (both functional).
 * **Flavor text is omitted entirely** — protectable prose, zero
 * marketplace value, enforced by schema (no column). The EN cardlist
 * DOM carries no flavor field today; if Bandai ever adds one, do NOT
 * map it — skip it here, per policy. The `getInfo remarks` "Notes" row
 * (errata links, site chrome) is likewise not rules text and is never
 * captured.
 */

import type { BandaiEnCard, BandaiEnGameKey, BandaiEnSeriesOption } from "./types";

/** Minimal HTML entity decoder for the entities these pages emit. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name: string) => NAMED_ENTITIES[name] ?? m);
}

/** Strip tags (<br> → newline), decode entities, collapse edges. */
function cleanText(s: string): string {
  return decodeEntities(
    s
      .replace(/<br\s*\/?[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** The sites print "-" for empty stat boxes; treat as absent. */
function nullIfDash(s: string | null): string | null {
  if (s === null) return null;
  const t = s.trim();
  return t === "" || t === "-" || t === "−" ? null : t;
}

/**
 * Extract one labelled field: `<div class="<cls>"><h3>…</h3>VALUE</div>`.
 * The class must match exactly (`getInfo` will not match `getInfo remarks`
 * — deliberate: the Notes row is never captured, see the policy header).
 */
function fieldText(block: string, cls: string): string | null {
  const re = new RegExp(
    `<div class="${cls}">\\s*<h3>[\\s\\S]*?<\\/h3>([\\s\\S]*?)<\\/div>`,
  );
  const m = block.match(re);
  return m ? nullIfDash(cleanText(m[1])) : null;
}

const BLOCK_RE = /<dl class="modalCol" id="([^"]+)"[^>]*>([\s\S]*?)<\/dl>/g;
const INFO_RE =
  /<div class="infoCol">\s*<span>([^<]*)<\/span>\s*\|\s*<span>([^<]*)<\/span>\s*\|\s*<span>([^<]*)<\/span>/;
const NAME_RE = /<div class="cardName">([\s\S]*?)<\/div>/;
const IMAGE_RE = /data-src="([^"]*\/card\/[^"]+)"/;
const COST_RE = /<div class="cost">\s*<h3>(Cost|Life)<\/h3>([\s\S]*?)<\/div>/;
const ATTRIBUTE_RE = /<div class="attribute">[\s\S]*?<i>([^<]*)<\/i>/;
// _p1 = parallel art; _r1 = reprint marker (EB01 Memorial Collection
// discovered live 2026-07-12 — 50 real cards quarantined without it).
// Both keep the official suffix as the variant tail, matching the
// publisher's own image naming.
const CARD_ID_RE = /^(.+?)_([pr]\d+)$/;

/**
 * Parse every card block on a series page. Pure — the caller stamps
 * `retrieved_at` (fetch-time fact) so `normalize()` can stay pure too.
 *
 * @param html      the series page HTML
 * @param page_url  absolute URL the page was fetched from (image resolution + provenance)
 * @param game      which Bandai game's cardlist this is
 * @param retrieved_at ISO moment the page was fetched
 */
export function parseCardlistPage(
  html: string,
  page_url: string,
  game: BandaiEnGameKey,
  retrieved_at: string,
): BandaiEnCard[] {
  const cards: BandaiEnCard[] = [];

  for (const m of html.matchAll(BLOCK_RE)) {
    const [, card_id, block] = m;

    const idMatch = card_id.match(CARD_ID_RE);
    const card_number = idMatch ? idMatch[1] : card_id;
    const parallel = idMatch ? idMatch[2] : null;

    const info = block.match(INFO_RE);
    const nameMatch = block.match(NAME_RE);
    const name = nameMatch ? cleanText(nameMatch[1]) : "";

    // Lazy-loaded: real image lives in data-src (src is dummy.gif).
    // Resolved against the page URL; the cache-version query (?260701)
    // is kept — it is what the publisher serves.
    const imgMatch = block.match(IMAGE_RE);
    let image_url: string | null = null;
    if (imgMatch) {
      try {
        image_url = new URL(decodeEntities(imgMatch[1]), page_url).href;
      } catch {
        image_url = null;
      }
    }

    const costMatch = block.match(COST_RE);
    const attrMatch = block.match(ATTRIBUTE_RE);

    cards.push({
      game,
      card_id,
      card_number,
      parallel,
      name,
      rarity: info ? nullIfDash(cleanText(info[2])) : null,
      category: info ? nullIfDash(cleanText(info[3])) : null,
      image_url,
      cost_kind: costMatch ? (costMatch[1] === "Life" ? "life" : "cost") : null,
      cost: costMatch ? nullIfDash(cleanText(costMatch[2])) : null,
      attribute: attrMatch ? nullIfDash(cleanText(attrMatch[1])) : null,
      power: fieldText(block, "power"),
      counter: fieldText(block, "counter"),
      color: fieldText(block, "color"),
      block_icon: fieldText(block, "block"),
      type_feature: fieldText(block, "feature"),
      // Rules text only — Effect + Trigger. Flavor text (absent from
      // this DOM) and the "Notes" errata row (class "getInfo remarks",
      // excluded by exact-class match) are never captured; see the
      // policy header + docs/EN-CARD-DATA.md §3.
      effect_text: fieldText(block, "text"),
      trigger_text: fieldText(block, "trigger"),
      card_sets_text: fieldText(block, "getInfo"),
      source_url: page_url,
      retrieved_at,
    });
  }

  return cards;
}

/**
 * Parse the series `<select>` from a cardlist page — used for series
 * discovery when the caller doesn't pass explicit ids. Scoped to the
 * `name="series"` select so other selects on the page can't leak in.
 * Options with empty values ("Recording", "ALL") are skipped.
 */
export function parseSeriesOptions(html: string): BandaiEnSeriesOption[] {
  const selStart = html.search(/<select[^>]*name="series"[^>]*>/);
  if (selStart === -1) return [];
  const selEnd = html.indexOf("</select>", selStart);
  const select = html.slice(selStart, selEnd === -1 ? undefined : selEnd);

  const options: BandaiEnSeriesOption[] = [];
  for (const m of select.matchAll(/<option value="(\d+)"[^>]*>([\s\S]*?)<\/option>/g)) {
    // Labels arrive double-encoded ("PREMIUM BOOSTER &lt;br …&gt;-…-"):
    // decode once to surface the <br>, then cleanText strips it.
    const label = cleanText(decodeEntities(m[2])).replace(/\s+/g, " ").trim();
    options.push({ id: m[1], label });
  }
  return options;
}
