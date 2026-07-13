/**
 * Pure HTML parsing for Bandai EN cardlist pages.
 *
 * The pages are server-rendered and structurally stable, so this is a
 * regex parser over known landmarks (no HTML-parser dependency — the
 * package convention; cf. cardrush/discovery.ts, tcgcollector).
 *
 * Two DOM families (config.dom picks per game):
 *
 * - "modal-page" (One Piece): one series page carries every card's
 *   full data — `parseCardlistPage` + `parseSeriesOptions` below.
 * - "list-detail" (DBS Fusion World): the series page is a thumbnail
 *   grid linking to per-card detail.php pages — `parseCardRefs` +
 *   `parseDetailPage` + `parseSeriesAnchors` at the bottom of this
 *   file, DOM documented there.
 *
 * "modal-page" DOM verified live 2026-07-11 against
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

import type {
  BandaiEnCard,
  BandaiEnCardRef,
  BandaiEnGameKey,
  BandaiEnSeriesOption,
} from "./types";

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

/* ═══════════════════════════════════════════════════════════════════
 * "list-detail" DOM family — DBS Fusion World (dbf).
 *
 * Verified live 2026-07-13 against
 * https://www.dbs-cardgame.com/fw/en/cardlist/?search=true&category%5B%5D=583010
 * (FB10; FB01 cross-checked — same shapes):
 *
 * The series page renders EVERY item server-side on one page (the
 * pager is an empty client-side JS shell) but carries only thumbnails:
 *
 *   <li class="cardItem"><a … data-type="iframe"
 *       data-src="detail.php?card_no=FB10-001&p=_p1" class="cardStr">
 *     <img class="lazy" src="…/noimage.webp"
 *          data-src="../../images/cards/card/en/FB10-001_f_p1.webp"
 *          alt="FB10-001 Son Goku"></a></li>
 *
 * Card data lives on the per-card detail page (server-rendered, ~10 KB):
 *
 *   <div class="cardNo">FB10-001</div> <div class="rarity">L</div>
 *   <div class="frontBack">FRONT</div>            ← leaders only
 *   <h1 class="cardName is-back">…</h1><h1 class="cardName is-front">…</h1>
 *   <div class="cardImageImg img-front"><img src="…FB10-001_f.webp"></div>
 *   <div class="cardImageImg img-back"><img src="…FB10-001_b.webp"></div>
 *     — or, single-faced: <div class="cardImage"><img src="…FB10-002.webp">
 *   <div class="cardDataCell"><h6>Card type</h6><div class="data">LEADER</div></div>
 *   … Color (nested <div class="colValue" data-color="Red">Red</div>),
 *   Cost, Specified cost (<span class="costIcon …">R</span>),
 *   Power / Special Traits / Skills (leaders: paired
 *   <div class="data … is-front">/<div class="data … is-back">;
 *   single-faced cards one <div class="data …"> — traits use Bandai's
 *   own "is-nomal" class), Where to get it.
 *
 * Image naming: {CARD_NO}[_f|_b][_pN].webp — `_f`/`_b` front/back on
 * leaders only, parallel `_pN` last. Detail images are direct `src`
 * (not lazy); list thumbnails are lazy `data-src`.
 *
 * ── Text policy (docs/EN-CARD-DATA.md §3) ────────────────────────────
 * Rules text only: the Skills row(s) — both leader faces are functional
 * rules. This DOM carries no flavor text anywhere (verified on leader +
 * battle pages); if Bandai ever adds it, do NOT map it. The detail
 * page's Q&A block (`cardQACol`) is publisher *rulings*, not card text
 * — never captured, same policy as op's Notes/errata row.
 * ═══════════════════════════════════════════════════════════════════ */

const CARD_ITEM_RE =
  /<li class="cardItem"><a [^>]*data-src="detail\.php\?card_no=([^"&]+)(?:&(?:amp;)?p=([^"&]+))?"[^>]*>\s*<img[^>]*data-src="([^"]*)"[^>]*alt="([^"]*)"/g;

/**
 * Parse every `<li class="cardItem">` off a "list-detail" series page
 * into detail-page references. Pure; `read()` follows each ref with a
 * rate-limited detail fetch.
 */
export function parseCardRefs(html: string): BandaiEnCardRef[] {
  const refs: BandaiEnCardRef[] = [];
  for (const m of html.matchAll(CARD_ITEM_RE)) {
    refs.push({
      card_no: decodeEntities(m[1]),
      p: m[2] ? decodeEntities(m[2]) : null,
      image_src: m[3] ? decodeEntities(m[3]) : null,
      alt: decodeEntities(m[4]),
    });
  }
  return refs;
}

/**
 * Parse the series list from a "list-detail" cardlist page — the
 * `data-val` dropdown wired to the hidden `category[]` input. Scoped
 * via that input's `data-toggleelem` key because the language switcher
 * and other filters reuse the same `data-val` markup. Options with
 * empty values ("ALL") are skipped.
 */
export function parseSeriesAnchors(html: string): BandaiEnSeriesOption[] {
  const input = html.match(
    /<input[^>]*name="category\[\]"[^>]*data-toggleelem="([^"]+)"/,
  );
  if (!input) return [];
  const ulStart = html.search(new RegExp(`<ul class="${input[1]}[^"]*"`));
  if (ulStart === -1) return [];
  const ulEnd = html.indexOf("</ul>", ulStart);
  const ul = html.slice(ulStart, ulEnd === -1 ? undefined : ulEnd);

  const options: BandaiEnSeriesOption[] = [];
  for (const m of ul.matchAll(/<a [^>]*data-val="(\d+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    options.push({ id: m[1], label: cleanText(m[2]).replace(/\s+/g, " ").trim() });
  }
  return options;
}

/**
 * One labelled detail cell (`<h6>LABEL</h6>` … up to the next `<h6>`),
 * split into face-classified `.data` values. Single-faced cards land in
 * `plain` (including Bandai's "is-nomal" class); leaders in
 * `front`/`back`.
 */
function detailCell(
  html: string,
  label: string,
): { plain: string | null; front: string | null; back: string | null } {
  const out = { plain: null as string | null, front: null as string | null, back: null as string | null };
  const start = html.indexOf(`<h6>${label}</h6>`);
  if (start === -1) return out;
  const next = html.indexOf("<h6>", start + 1);
  const cell = html.slice(start, next === -1 ? undefined : next);

  for (const m of cell.matchAll(/<div class="data([^"]*)">([\s\S]*?)<\/div>/g)) {
    const value = nullIfDash(cleanText(m[2]));
    if (m[1].includes("is-front")) out.front = value;
    else if (m[1].includes("is-back")) out.back = value;
    else if (out.plain === null) out.plain = value;
  }
  return out;
}

/** Face-aware pick: single-faced value, else the front face. */
function frontOr(cell: { plain: string | null; front: string | null }): string | null {
  return cell.plain ?? cell.front;
}

/**
 * The Color cell nests `<div class="colValue" data-color="Red">Red</div>`
 * per color, so the generic cell parser would truncate a multi-color
 * card at the first `</div>`. Read the `data-color` attributes instead
 * (joined "/", the sites' own multi-value separator); fall back to the
 * generic cell for a shape drift.
 */
function colorCell(html: string): string | null {
  const start = html.indexOf("<h6>Color</h6>");
  if (start === -1) return null;
  const next = html.indexOf("<h6>", start + 1);
  const cell = html.slice(start, next === -1 ? undefined : next);
  const colors = [...cell.matchAll(/data-color="([^"]+)"/g)].map((m) =>
    cleanText(m[1]),
  );
  if (colors.length > 0) return colors.join("/");
  return frontOr(detailCell(cell, "Color"));
}

const DETAIL_CARD_NO_RE = /<div class="cardNo">([^<]*)<\/div>/;
const DETAIL_RARITY_RE = /<div class="rarity">([^<]*)<\/div>/;
// The is-back <h1> precedes the is-front one; `cardName"` | `cardName is-front"`
// matches single-faced and front names, never is-back.
const DETAIL_NAME_RE = /<h1 class="cardName(?: is-front)?">([\s\S]*?)<\/h1>/;
const DETAIL_IMG_FRONT_RE =
  /class="cardImageImg img-front">\s*<img src="([^"]+)"/;
const DETAIL_IMG_BACK_RE = /class="cardImageImg img-back">\s*<img src="([^"]+)"/;
const DETAIL_IMG_SINGLE_RE = /<div class="cardImage">\s*<img src="([^"]+)"/;

function resolveUrl(src: string | null, base: string): string | null {
  if (!src) return null;
  try {
    return new URL(decodeEntities(src), base).href;
  } catch {
    return null;
  }
}

/**
 * Parse one "list-detail" detail page into a BandaiEnCard. Pure — the
 * caller stamps `retrieved_at` and passes the parallel query value `p`
 * ("_p1" | null) from the list ref, since the detail DOM itself prints
 * only the base card number.
 *
 * Returns null when the page carries no card block (bad card_no, site
 * error page) so `read()` can quarantine-by-event instead of yielding
 * an empty husk.
 */
export function parseDetailPage(
  html: string,
  page_url: string,
  game: BandaiEnGameKey,
  retrieved_at: string,
  p: string | null,
): BandaiEnCard | null {
  const noMatch = html.match(DETAIL_CARD_NO_RE);
  if (!noMatch) return null;
  const card_number = cleanText(noMatch[1]);
  const parallel = p ? p.replace(/^_/, "") : null;

  const rarityMatch = html.match(DETAIL_RARITY_RE);
  const nameMatch = html.match(DETAIL_NAME_RE);

  // Leaders: _f/_b pair. Single-faced: plain cardImage. Direct src —
  // the detail page does not lazy-load its own card images.
  const front = html.match(DETAIL_IMG_FRONT_RE);
  const back = html.match(DETAIL_IMG_BACK_RE);
  const single = html.match(DETAIL_IMG_SINGLE_RE);
  const image_url = resolveUrl(front?.[1] ?? single?.[1] ?? null, page_url);
  const back_image_url = resolveUrl(back?.[1] ?? null, page_url);

  const cost = frontOr(detailCell(html, "Cost"));
  const power = detailCell(html, "Power");
  const traits = detailCell(html, "Special Traits");
  const skills = detailCell(html, "Skills");

  return {
    game,
    // Publisher image naming ({CARD_NO}[_f|_b]_pN.webp) keeps the _pN
    // tail; the id mirrors it so variant ↔ image stay aligned (op rule).
    card_id: parallel ? `${card_number}_${parallel}` : card_number,
    card_number,
    parallel,
    name: nameMatch ? cleanText(nameMatch[1]) : "",
    rarity: rarityMatch ? nullIfDash(cleanText(rarityMatch[1])) : null,
    category: frontOr(detailCell(html, "Card type")),
    image_url,
    // dbf has no Life box; leaders simply print "-" for Cost.
    cost_kind: cost !== null ? "cost" : null,
    cost,
    attribute: null, // op-only row; absent from this DOM
    power: frontOr(power),
    counter: null, // op-only row; absent from this DOM
    color: colorCell(html),
    block_icon: null, // op-only row; absent from this DOM
    type_feature: frontOr(traits),
    // Rules text only — the Skills row(s). No flavor exists in this
    // DOM; the Q&A rulings block is never captured (policy header).
    effect_text: frontOr(skills),
    trigger_text: null, // op-only concept; absent from this DOM
    card_sets_text: frontOr(detailCell(html, "Where to get it")),
    source_url: page_url,
    retrieved_at,
    back_image_url,
    power_back: power.back,
    traits_back: traits.back,
    effect_back_text: skills.back,
    specified_cost: frontOr(detailCell(html, "Specified cost")),
    combo_power: frontOr(detailCell(html, "Combo power")),
  };
}
