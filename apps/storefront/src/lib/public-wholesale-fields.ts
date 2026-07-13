/**
 * Public boundary for legacy wholesale fields whose upstream lineage is not
 * recorded at field level. Existing rows stay stored for review; public and
 * participant-facing code must not emit or derive from them.
 */
export const LEGACY_WHOLESALE_FIELD_PUBLICATION_ENABLED = false as const;
export const LEGACY_WHOLESALE_FIELD_BLOCK_REASON =
  "Legacy wholesale prices and images are withheld until field-level source rights are recorded.";

export type PublicCatalogSort = "name_asc" | "name_desc" | "number_asc";

/**
 * Public rows must not be selected or ordered by a value that is withheld.
 * Unknown and legacy price sorts fall back to stable card-number order.
 */
export function publicCatalogSort(sort: string | undefined): PublicCatalogSort {
  if (sort === "name_asc" || sort === "name_desc" || sort === "number_asc") {
    return sort;
  }
  return "number_asc";
}

export interface WholesalePublicFields {
  price_gbp: number | null;
  channel_price?: number | null;
  image_url: string | null;
}

export function withholdUnreviewedWholesaleFields<T extends WholesalePublicFields>(
  item: T,
): T {
  if (LEGACY_WHOLESALE_FIELD_PUBLICATION_ENABLED) return item;
  return {
    ...item,
    price_gbp: null,
    channel_price: null,
    image_url: null,
  };
}
