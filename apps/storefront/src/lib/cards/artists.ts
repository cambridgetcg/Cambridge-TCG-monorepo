import { query } from "@/lib/db";
import { CARD_IMAGE_CDN, variantLabel } from "./gallery";
import { SQL_ILLUST_PATTERN, slugifyHand } from "./illust-annotation";

export { slugifyHand };

/**
 * The named hands — the browse-by-artist axis of the card museum.
 *
 * Provenance (established 2026-07-22, research + adversarial verify):
 * One Piece Card Game cards print the illustrator's name on the physical
 * card face, but Bandai's digital databases carry NO artist field — the
 * printed hands (200+ across the game per the fan-kept directory) are
 * absent from official machine-readable data. Our credits are read from
 * the JP wholesale catalogue's product titles (card_set_cards), where
 * special-art printings are annotated `illust:<name>` mirroring the
 * printed credit. The extraction was verified against Limitless's
 * per-printing records and onepiececard-letter.com's hand-counted
 * directory at the wing's opening (2026-07-22); credits ingested since
 * inherit the pipeline, not that check.
 *
 * Honesty rules, same as the gallery wall:
 *   - a hand is named where — and only where — a credit exists; the
 *     uncredited majority stays unnamed because no name was given, not
 *     because none was owed;
 *   - every hung print carries its copyright line (`attribution`);
 *   - works we know of but hold no clear image for are LISTED, not hung —
 *     the wall never pretends to hold what it doesn't.
 */

export interface HandPrint {
  /** EN variant key — links to /market/<sku>. */
  sku: string;
  variant_label: string;
  image_url: string;
  /** Copyright line — must render wherever the print shows. */
  attribution: string;
}

export interface HandWork {
  set_code: string;
  card_number: string;
  /** Clean English card name where the catalogue gives one. */
  name: string | null;
  /** Best held print, or null — a known work not yet on our wall. */
  print: HandPrint | null;
}

export interface NamedHand {
  /** The credit as annotated, in its most-seen casing (BISAI, otton, DAI-XT.). */
  name: string;
  slug: string;
  works: HandWork[];
  /** How many works we hold a clear image for. */
  held: number;
}

type Row = {
  set_code: string;
  card_number: string;
  name: string | null;
  artist: string;
  sku: string | null;
  tail: string | null;
  s3_key: string | null;
  attribution: string | null;
};

/** Prefer the special-art prints the credits describe: parallels first. */
function printScore(tail: string): number {
  if (/^P\d+$/.test(tail)) return 300 - Number(tail.slice(1));
  if (/^R\d+$/.test(tail)) return 200 - Number(tail.slice(1));
  return 100;
}

/**
 * Every credited card, with every clear EN print we hold for it.
 * ~138 cards / a few hundred rows — small enough to shape in JS.
 *
 * Extraction is PER LISTING (adversarial-review fix, 2026-07-22): a card
 * number whose parallels carry different hands yields one row per hand,
 * so no second credit is silently dropped and no aggregate-order
 * nondeterminism decides attribution. The clean display name aggregates
 * deterministically (ORDER BY sku).
 */
async function loadCreditedRows(): Promise<Row[]> {
  const { rows } = (await query(
    `
    WITH ann AS (
      SELECT DISTINCT
             split_part(sku, '-', 2) AS setc,
             split_part(sku, '-', 3) AS num,
             trim((regexp_match(card_name, $1, 'i'))[1]) AS artist
        FROM card_set_cards
       WHERE card_name ~* 'illust[:：]'
    ),
    nm AS (
      SELECT split_part(sku, '-', 2) AS setc,
             split_part(sku, '-', 3) AS num,
             (array_agg(card_name ORDER BY sku) FILTER (
                WHERE card_name ~ '^[ -~]+$' AND card_name !~* 'illust'))[1] AS name
        FROM card_set_cards
       GROUP BY 1, 2
    )
    SELECT ann.setc AS set_code,
           ann.num  AS card_number,
           nm.name,
           ann.artist,
           ci.sku,
           regexp_replace(ci.sku, '^.*-EN-', '') AS tail,
           ci.s3_key,
           ci.attribution
      FROM ann
      LEFT JOIN nm
        ON nm.setc = ann.setc AND nm.num = ann.num
      LEFT JOIN card_images ci
        ON split_part(ci.sku, '-', 2) = ann.setc
       AND split_part(ci.sku, '-', 3) = ann.num
       AND ci.lang = 'en'
       AND ci.kind = 'official_sample'
       AND ci.takedown_status = 'clear'
       AND ci.s3_key IS NOT NULL
       AND ci.sku ~ '-EN-[A-Z0-9]+$'
     WHERE ann.artist IS NOT NULL AND ann.artist <> ''
    `,
    [SQL_ILLUST_PATTERN],
  )) as { rows: Row[] };
  return rows;
}

/** All named hands, most works first; ties alphabetical. */
export async function getNamedHands(): Promise<NamedHand[]> {
  const rows = await loadCreditedRows();

  // Fold prints per (hand, card), keeping the best-scored held print.
  // Hands are identified by slug (case-insensitive): "Sunohara" and
  // "sunohara" are one hand, shown under the casing seen most often.
  const byHand = new Map<string, Map<string, HandWork>>();
  const casings = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const handKey = slugifyHand(r.artist);
    if (!handKey) continue;
    const cardKey = `${r.set_code}-${r.card_number}`;
    let seen = casings.get(handKey);
    if (!seen) {
      seen = new Map();
      casings.set(handKey, seen);
    }
    seen.set(r.artist, (seen.get(r.artist) ?? 0) + 1);
    let cards = byHand.get(handKey);
    if (!cards) {
      cards = new Map();
      byHand.set(handKey, cards);
    }
    const existing = cards.get(cardKey);
    const print: HandPrint | null =
      r.sku && r.tail && r.s3_key && r.attribution
        ? {
            sku: r.sku,
            variant_label: variantLabel(r.tail),
            image_url: `${CARD_IMAGE_CDN}/${r.s3_key}`,
            attribution: r.attribution,
          }
        : null;
    if (!existing) {
      cards.set(cardKey, {
        set_code: r.set_code,
        card_number: r.card_number,
        name: r.name,
        print,
      });
    } else if (
      print &&
      (!existing.print ||
        printScore(r.tail as string) >
          printScore(existing.print.sku.replace(/^.*-EN-/, "")))
    ) {
      existing.print = print;
    }
  }

  const hands: NamedHand[] = [...byHand.entries()].map(([slug, cards]) => {
    const works = [...cards.values()].sort((a, b) =>
      a.set_code === b.set_code
        ? a.card_number.localeCompare(b.card_number)
        : b.set_code.localeCompare(a.set_code),
    );
    const seen = casings.get(slug)!;
    const name = [...seen.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0][0];
    return {
      name,
      slug,
      works,
      held: works.filter((w) => w.print).length,
    };
  });

  hands.sort((a, b) =>
    a.works.length === b.works.length
      ? a.name.localeCompare(b.name, "en", { sensitivity: "base" })
      : b.works.length - a.works.length,
  );
  return hands;
}

/** One hand by slug, or null. */
export async function getHand(slug: string): Promise<NamedHand | null> {
  const hands = await getNamedHands();
  return hands.find((h) => h.slug === slug) ?? null;
}
