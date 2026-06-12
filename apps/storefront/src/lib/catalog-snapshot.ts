/**
 * catalog-snapshot — the OPTCG card catalog, served from a static file.
 *
 * The wholesale data plane (tcg-wholesale RDS) was decommissioned on
 * 2026-06-12; the play surfaces don't need a database for what they ask:
 * "which cards exist." This module answers that from
 * src/data/optcg-catalog-snapshot.json — a versioned snapshot of the
 * official Bandai cardlist (via punk-records/vegapull), regenerated with
 * `pnpm --filter cambridgetcg-storefront catalog:snapshot` when new sets
 * release.
 *
 * Substrate honesty: every response built from this module should carry
 * SNAPSHOT_PROVENANCE — the data is a dated snapshot, not a live read,
 * and the surface must say so.
 *
 * SKUs here are official card ids ("OP01-001", "OP01-001_p1" for alt-art
 * parallels). Legacy wholesale SKUs ("OP-OP14-100-JP-VTXN") embed the
 * card number, so queryCards' q-matching resolves old saved decks and
 * share links to their base card.
 */

import snapshotData from "@/data/optcg-catalog-snapshot.json";

export interface SnapshotCard {
  sku: string;
  card_number: string;
  name: string;
  set_code: string;
  set_name: string;
  rarity: string;
  image_url: string | null;
  category: string;
  cost: number | null;
  power: number | null;
  counter: number | null;
  colors: string[];
  types: string[];
}

const CARDS = snapshotData.cards as SnapshotCard[];

export const SNAPSHOT_PROVENANCE = {
  kind: "snapshot" as const,
  generated_at: snapshotData.generated_at as string,
  source: snapshotData.source as string,
  source_url: snapshotData.source_url as string,
};

function baseRarity(r: string | null | undefined): string {
  if (!r) return "";
  return r.split("/")[0].trim().toUpperCase();
}

export interface SnapshotSet {
  code: string;
  name: string;
  card_count: number;
}

let setsCache: SnapshotSet[] | null = null;

export function listSets(): SnapshotSet[] {
  if (setsCache) return setsCache;
  const bySet = new Map<string, SnapshotSet>();
  for (const c of CARDS) {
    const existing = bySet.get(c.set_code);
    if (existing) existing.card_count++;
    else bySet.set(c.set_code, { code: c.set_code, name: c.set_name, card_count: 1 });
  }
  setsCache = Array.from(bySet.values()).sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { numeric: true })
  );
  return setsCache;
}

export interface QueryParams {
  q?: string;
  set?: string;
  rarity?: string;
  sort?: string;
  limit: number;
  offset: number;
}

export function queryCards({ q, set, rarity, sort, limit, offset }: QueryParams): {
  cards: SnapshotCard[];
  total: number;
} {
  let items = CARDS;

  if (set) {
    const s = set.toUpperCase();
    items = items.filter((c) => c.set_code === s);
  }

  if (rarity) {
    // Base-rarity match: filtering "L" includes "L/P" alt-art parallels —
    // a parallel printing is still the card it parallels.
    const r = baseRarity(rarity);
    items = items.filter((c) => baseRarity(c.rarity) === r);
  }

  if (q && q.trim()) {
    const needle = q.trim().toLowerCase();
    const needleUpper = q.trim().toUpperCase();
    items = items.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        c.card_number.includes(needleUpper) ||
        c.sku.toUpperCase().includes(needleUpper) ||
        // Legacy wholesale SKUs ("OP-OP14-100-JP-VTXN") contain the card
        // number — resolve them to the base card so old saved decks and
        // share links keep loading.
        (needleUpper.length >= 8 && needleUpper.includes(c.card_number))
    );
  }

  const sorted = [...items];
  switch (sort) {
    case "name_desc":
      sorted.sort((a, b) => b.name.localeCompare(a.name) || a.sku.localeCompare(b.sku));
      break;
    case "number_asc":
      sorted.sort((a, b) =>
        a.card_number.localeCompare(b.card_number, undefined, { numeric: true }) ||
        a.sku.localeCompare(b.sku)
      );
      break;
    case "name_asc":
    default:
      sorted.sort((a, b) => a.name.localeCompare(b.name) || a.sku.localeCompare(b.sku));
      break;
  }

  return {
    cards: sorted.slice(offset, offset + limit),
    total: sorted.length,
  };
}
