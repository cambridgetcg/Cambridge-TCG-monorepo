import { query } from "@/lib/db";

/**
 * The gallery's alternate-art wall — the pleasant rare prints.
 *
 * The landing's other card surfaces show the BASE art (one image per card,
 * keyed by the variant-stripped EN key — see getEnCardImages). But the
 * `card_images` bucket also holds every card's ALTERNATE prints: the
 * parallels and full-arts that carry a variant tail (`OP-OP03-072-EN-P1`,
 * `-P3`, `-R1`). Those are the prints collectors linger over, and they were
 * hanging in storage — surfaced by nothing. This module hangs them.
 *
 * Two honesty rules ride along, same as everywhere official art shows:
 *   - the copyright line (`attribution`, NOT NULL by schema) is carried on
 *     every piece and MUST render on its wall label; and
 *   - the illustrator is NAMED where — and only where — the publisher named
 *     them. Bandai embeds `illust:<name>` inside some card names; we read it
 *     out and credit the hand. It is sparse (a few hundred cards), so this is
 *     a credit-where-known, not a browse-by-artist index.
 */

const CARD_IMAGE_CDN = (
  process.env.CTCG_CARD_IMAGE_CDN ||
  "https://ctcg-card-images.s3.us-east-1.amazonaws.com"
).replace(/\/$/, "");

export interface GalleryPiece {
  /** EN variant key — e.g. `OP-OP03-072-EN-P1`. Links to /market/<sku>. */
  sku: string;
  /** Clean English card name where the catalogue gives one; else null. */
  name: string | null;
  /** Set code parsed from the key — `OP03`. */
  set_code: string;
  /** Card number parsed from the key — `072`. */
  card_number: string;
  /** The kind of alternate print, in plain words — "Parallel Art". */
  variant_label: string;
  /** Self-hosted official image URL — render as-is. */
  image_url: string;
  /** Copyright line — rendered on the wall label, always. */
  attribution: string;
  /** Illustrator, where the publisher named one; else null. */
  artist: string | null;
}

/** The alternate print's kind, from its variant tail, in museum words. */
function variantLabel(tail: string): string {
  if (/^P\d+$/.test(tail)) return "Parallel Art";
  if (/^R\d+$/.test(tail)) return "Alternate Print";
  return "Alternate Art";
}

type Row = {
  sku: string;
  set_code: string;
  card_number: string;
  tail: string;
  s3_key: string;
  attribution: string;
  name: string | null;
  artist: string | null;
};

/**
 * Curate the alternate-art wall: one print per card, credited hands first,
 * then a set-diverse spread of parallels. Deterministic (no randomness) so
 * the wall is stable across renders. Returns at most `limit` pieces.
 */
export async function getGalleryPieces(limit = 24): Promise<GalleryPiece[]> {
  // The catalogue (card_set_cards) is the only place a card's NAME and its
  // `illust:` credit live; it keys on the wholesale sku, so we fold it to
  // (set, number) and join the EN image key on the same two parts. A clean
  // English name = printable-ASCII and not itself an annotation row.
  const { rows } = (await query(
    `
    WITH nm AS (
      SELECT split_part(sku, '-', 2) AS setc,
             split_part(sku, '-', 3) AS num,
             (array_agg(card_name) FILTER (
                WHERE card_name ~ '^[ -~]+$' AND card_name !~* 'illust'))[1] AS name,
             trim((regexp_match(
                string_agg(card_name, ' | '),
                'illust[:：]\\s*([^)/|]+)'))[1]) AS artist
        FROM card_set_cards
       GROUP BY 1, 2
    )
    SELECT ci.sku,
           split_part(ci.sku, '-', 2) AS set_code,
           split_part(ci.sku, '-', 3) AS card_number,
           regexp_replace(ci.sku, '^.*-EN-', '') AS tail,
           ci.s3_key,
           ci.attribution,
           nm.name,
           nm.artist
      FROM card_images ci
      LEFT JOIN nm
        ON nm.setc = split_part(ci.sku, '-', 2)
       AND nm.num  = split_part(ci.sku, '-', 3)
     WHERE ci.lang = 'en'
       AND ci.kind = 'official_sample'
       AND ci.takedown_status = 'clear'
       AND ci.s3_key IS NOT NULL
       AND ci.sku ~ '-EN-[A-Z0-9]+$'
    `,
  )) as { rows: Row[] };

  // A piece is worth hanging only if it has something to say on its label —
  // a name, or a named hand. Prefer, per card, the print that says the most.
  const score = (r: Row): number => {
    let s = 0;
    if (r.artist) s += 100; // a named hand is the prize
    if (r.name) s += 10;
    const p = /^P(\d+)$/.exec(r.tail);
    if (p) s += 20 - Number(p[1]); // among parallels, prefer P1
    else if (/^R/.test(r.tail)) s += 1;
    return s;
  };

  const byBase = new Map<string, Row>();
  for (const r of rows) {
    const base = `${r.set_code}-${r.card_number}`;
    const cur = byBase.get(base);
    if (!cur || score(r) > score(cur)) byBase.set(base, r);
  }
  const deduped = [...byBase.values()].filter((r) => r.name || r.artist);

  // Credited prints lead — the wall names its illustrators first — then a
  // spread of parallels interleaved across sets so no single set dominates.
  const bySet = (a: Row, b: Row) =>
    a.set_code === b.set_code
      ? a.card_number.localeCompare(b.card_number)
      : b.set_code.localeCompare(a.set_code); // newer sets first
  const credited = deduped.filter((r) => r.artist).sort(bySet);

  const groups = new Map<string, Row[]>();
  for (const r of deduped.filter((x) => !x.artist)) {
    const g = groups.get(r.set_code);
    if (g) g.push(r);
    else groups.set(r.set_code, [r]);
  }
  const setKeys = [...groups.keys()].sort((a, b) => b.localeCompare(a));
  for (const k of setKeys) groups.get(k)!.sort((a, b) => a.card_number.localeCompare(b.card_number));
  const interleaved: Row[] = [];
  for (let more = true; more; ) {
    more = false;
    for (const k of setKeys) {
      const g = groups.get(k)!;
      if (g.length) { interleaved.push(g.shift()!); more = true; }
    }
  }

  const CREDIT_LEAD = 8; // celebrate named hands, but keep the wall varied
  const ordered = [...credited.slice(0, CREDIT_LEAD), ...interleaved, ...credited.slice(CREDIT_LEAD)];

  return ordered.slice(0, limit).map((r) => ({
    sku: r.sku,
    name: r.name,
    set_code: r.set_code,
    card_number: r.card_number,
    variant_label: variantLabel(r.tail),
    image_url: `${CARD_IMAGE_CDN}/${r.s3_key}`,
    attribution: r.attribution,
    artist: r.artist,
  }));
}
