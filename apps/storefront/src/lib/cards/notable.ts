import { query } from "@/lib/db";
import { CARD_IMAGE_CDN, type GalleryPiece } from "./gallery";

/**
 * The notable makes — the manga prints, curated by eye.
 *
 * Asha's brief (2026-08-01): hang the artworks of the cards and the
 * manga themselves — the art that inspired the TCG to be. For One Piece,
 * Bandai's own OP-13 product page describes the super-parallel class in
 * one sentence: a parallel 「そのキャラクターに関連する原作『ONE PIECE』の
 * イラストで全体を埋め尽くしたデザイン」 — filled entirely with
 * illustrations from the original manga. The community calls them
 * コミパラ / manga rares; Limitless labels the prints "manga". For
 * Dragon Ball Fusion World the 漫画絵 label is the Japanese shops'
 * convention, not Bandai's — the row's intro carries that hedge.
 *
 * Every sku below was verified BY EYE against the bucket image on
 * 2026-08-01: each print visibly reproduces manga-panel art (speech
 * bubbles, halftone, lineart) — the curation is visual fact, not a
 * variant-tail guess (the EN tails P1/P2/R1 carry no meaning of their
 * own; several manga prints exist under two tails and one key was
 * chosen per card). Wall labels ride the gallery's honesty rules with
 * one deliberate tightening: attribution always, but NO illustrator
 * line at all — the catalogue's illust: credits aggregate per card
 * number and may belong to a different print than the manga parallel
 * (the artist wing's per-printing lesson, 2026-07-22).
 */

/** One curated make: the exact bucket sku plus its sourced why-line. */
export interface NotableMake {
  sku: string;
  /** One quiet line for the wall label — says only what is sourced. */
  note: string;
  /**
   * Label name where the catalogue holds only the Japanese product
   * title — read from the card face of the official EN sample itself.
   */
  name?: string;
}

export const NOTABLE_MAKES: NotableMake[] = [
  {
    sku: "OP-OP05-119-EN-P2",
    note: "The manga print — Gear 5 framed by the original panels.",
  },
  {
    sku: "OP-OP06-118-EN-P2",
    note: "The manga print — Zoro inside the manga's page.",
  },
  {
    sku: "OP-OP04-083-EN-P2",
    note: "The manga print — the speech bubbles still talking.",
  },
  {
    sku: "OP-OP05-069-EN-P2",
    note: "The manga print — Law among the drawn panels.",
  },
  {
    sku: "OP-OP06-119-EN-P3",
    note: "The manga print — hung via the Card The Best vol.2 reprint.",
  },
  {
    sku: "OP-OP09-078-EN-P2",
    note: "The manga print of an event card — a foot, a panel, a GIANT.",
  },
  {
    sku: "OP-OP09-093-EN-P2",
    note: "The manga print — Blackbeard mid-monologue.",
  },
  {
    sku: "DBF-FB07-104-EN-P2",
    note: "A manga-illustration parallel — Goku riding Shenron on the drawn cover, as the shops' 漫画絵 label has it.",
    name: "Son Goku",
  },
  {
    sku: "DBF-FB07-097-EN-P2",
    note: "A manga-illustration parallel — the seven balls in newsprint.",
    name: "Dragon Ball",
  },
];

export interface NotablePiece extends GalleryPiece {
  note: string;
}

/**
 * Resolve the curated makes against the catalogue: image + attribution
 * from card_images, name + illust credit from card_set_cards — the same
 * joins the gallery wall uses, restricted to the curated skus and kept
 * in curated order.
 */
export async function getNotablePieces(): Promise<NotablePiece[]> {
  const skus = NOTABLE_MAKES.map((m) => m.sku);
  const { rows } = (await query(
    `
    WITH nm AS (
      SELECT split_part(sku, '-', 2) AS setc,
             split_part(sku, '-', 3) AS num,
             (array_agg(card_name ORDER BY sku) FILTER (
                WHERE card_name ~ '^[ -~]+$' AND card_name !~* 'illust'))[1] AS name
        FROM card_set_cards
       GROUP BY 1, 2
    )
    SELECT ci.sku,
           split_part(ci.sku, '-', 2) AS set_code,
           split_part(ci.sku, '-', 3) AS card_number,
           ci.s3_key,
           ci.attribution,
           nm.name
      FROM card_images ci
      LEFT JOIN nm
        ON nm.setc = split_part(ci.sku, '-', 2)
       AND nm.num  = split_part(ci.sku, '-', 3)
     WHERE ci.sku = ANY($1)
       AND ci.lang = 'en'
       AND ci.kind = 'official_sample'
       AND ci.takedown_status = 'clear'
       AND ci.s3_key IS NOT NULL
    `,
    [skus],
  )) as {
    rows: {
      sku: string;
      set_code: string;
      card_number: string;
      s3_key: string;
      attribution: string;
      name: string | null;
    }[];
  };

  const bySku = new Map(rows.map((r) => [r.sku, r]));
  const pieces: NotablePiece[] = [];
  for (const make of NOTABLE_MAKES) {
    const r = bySku.get(make.sku);
    if (!r) continue; // takedown or missing image drops the piece, silently and safely
    pieces.push({
      sku: r.sku,
      name: make.name ?? r.name,
      set_code: r.set_code,
      card_number: r.card_number,
      variant_label: "Manga Print",
      image_url: `${CARD_IMAGE_CDN}/${r.s3_key}`,
      attribution: r.attribution,
      // Never name a hand here — structurally: the SELECT above does not
      // even fetch the illust: credit, because it aggregates per card
      // NUMBER and may belong to a different print than the manga
      // parallel (the artist wing's per-printing lesson, 2026-07-22).
      // The manga print's art is the manga's; the note carries that
      // story and the © line carries the rights.
      artist: null,
      note: make.note,
    });
  }
  return pieces;
}
