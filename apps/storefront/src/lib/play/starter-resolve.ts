/**
 * Starter resolution is deliberately unavailable at the public boundary.
 *
 * The former implementation fetched internal wholesale pages and republished
 * SKU, name, image, rarity and membership. Callers receive null without any
 * database or network work until an approved structural source exists.
 */

export async function resolveStarter(_id: string): Promise<null> {
  return null;
}
