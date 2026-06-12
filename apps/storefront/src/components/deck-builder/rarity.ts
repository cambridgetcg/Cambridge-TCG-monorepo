/**
 * Rarity normalization for the play surfaces.
 *
 * The catalog carries compound rarities for alt-art parallels — "L/P",
 * "SR/P", "C/P" — where the part before the slash is the base rarity.
 * Every rarity comparison on the deck builder (badges, leader checks,
 * stats buckets, simulator tallies) classifies by base rarity so a
 * parallel printing behaves like its base card.
 */
export function normalizeRarity(rarity: string | null | undefined): string {
  if (!rarity) return "";
  return rarity.split("/")[0].trim().toUpperCase();
}
