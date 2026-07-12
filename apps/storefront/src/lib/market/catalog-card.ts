/**
 * Server-side card identity resolver — the local catalogue read that lets
 * /market/[sku] render a real card (name, set, number, image) in SSR
 * instead of a nameless SKU.
 *
 * The interactive card page is a client component: its SSR HTML carried
 * zero card data, so crawlers, link previews, text-mode and no-JS readers
 * saw a blank main, and the <title> was the generic site title on every
 * card. This resolver reads the storefront-local `card_set_cards` catalog
 * (one query, joined to `card_sets` for the set name) so the page can
 * server-render identity + a real <title> before any client fetch runs.
 *
 * Reference PRICE is deliberately NOT here: it lives in the wholesale
 * substrate (the same one the /market table reads), resolved by
 * `resolveReferencePrice` so the two surfaces agree. Identity is local and
 * always available; price is enrichment and may be unavailable.
 *
 * The resolver also handles card-number-shaped URLs: /market/OP01-003 is a
 * card_number, not a SKU — it resolves to the canonical SKU so the page
 * can redirect, instead of rendering an empty main at a URL the site's own
 * copy teaches users to type.
 */

import { cache } from "react";
import { query } from "@/lib/db";

export interface CatalogIdentity {
  sku: string;
  card_number: string;
  card_name: string;
  set_code: string;
  set_name: string | null;
  rarity: string | null;
  image_url: string | null;
}

export type IdentityResolution =
  | { kind: "ok"; card: CatalogIdentity }
  // The URL was a card_number (or a differently-cased SKU); redirect to
  // the canonical SKU so every card has one address.
  | { kind: "redirect"; sku: string }
  // No catalogue row for this SKU or card_number.
  | { kind: "notfound" };

const SELECT_IDENTITY = `
  SELECT csc.sku, csc.card_number, csc.card_name, csc.set_code,
         cs.set_name, csc.rarity, NULL::text AS image_url
    FROM card_set_cards csc
    LEFT JOIN card_sets cs ON cs.set_code = csc.set_code`;

function rowToIdentity(row: {
  sku: string;
  card_number: string;
  card_name: string;
  set_code: string;
  set_name: string | null;
  rarity: string | null;
  image_url: string | null;
}): CatalogIdentity {
  return {
    sku: row.sku,
    card_number: row.card_number,
    card_name: row.card_name,
    set_code: row.set_code,
    set_name: row.set_name ?? null,
    rarity: row.rarity ?? null,
    image_url: null,
  };
}

/**
 * Resolve a /market/[sku] path segment to a catalogue card.
 *
 * The segment may be a SKU (`OP-OP01-003-JP`) or a card_number
 * (`OP01-003`). SKUs resolve directly; card_numbers resolve to their
 * canonical SKU and return a redirect. Anything unknown is notfound().
 */
export const resolveCardIdentity = cache(_resolveCardIdentity);

async function _resolveCardIdentity(
  skuOrNumber: string,
): Promise<IdentityResolution> {
  const raw = (skuOrNumber || "").trim();
  if (!raw) return { kind: "notfound" };

  // Exact SKU match first (the canonical address).
  const bySku = await query(
    `${SELECT_IDENTITY} WHERE csc.sku = $1 LIMIT 1`,
    [raw],
  );
  if (bySku.rows[0]) return { kind: "ok", card: rowToIdentity(bySku.rows[0]) };

  // Card-number-shaped URL (case-insensitive) → canonical SKU. Order by
  // the base variant first so the plain printing wins over parallels.
  const byNumber = await query(
    `${SELECT_IDENTITY} WHERE UPPER(csc.card_number) = UPPER($1)
      ORDER BY csc.variant ASC LIMIT 1`,
    [raw],
  );
  const numberRow = byNumber.rows[0];
  if (numberRow) return { kind: "redirect", sku: numberRow.sku };

  return { kind: "notfound" };
}

/** Bare identity lookup used by generateMetadata (no redirect semantics). */
export async function getCardIdentity(
  sku: string,
): Promise<CatalogIdentity | null> {
  const r = await resolveCardIdentity(sku);
  return r.kind === "ok" ? r.card : null;
}
