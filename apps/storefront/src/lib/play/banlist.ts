// The official OPTCG banned/restricted list — the game's ONE restriction
// mechanism (there is no format rotation; see docs/research/
// optcg-rules-alignment.md, verified against Comprehensive Rules v1.2.0).
//
// Source: https://en.onepiece-cardgame.com/news/restriction.html
// Effective 2026-04-10. Re-verify when Bandai posts a new restriction news
// entry — this file is a point-in-time mirror of the official page, not
// a house judgement.

/** Cards that "cannot be included in any deck" (leader or main). */
export const BANNED_CARD_NUMBERS: ReadonlySet<string> = new Set([
  "OP06-047", // Charlotte Pudding
  "OP03-040", // Nami
  "OP06-086", // Gecko Moria
  "ST10-001", // Trafalgar Law (Leader)
  "OP06-116", // Reject
]);

/** Pairs that cannot be used together in the same deck (either order). */
export const BANNED_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["OP07-115", "EB04-058"], // I Re-Quasar Helllp!! + Borsalino
  ["OP11-040", "OP11-067"], // Monkey.D.Luffy + Charlotte Katakuri
  ["OP11-040", "OP08-069"], // Monkey.D.Luffy + Charlotte Linlin
];

export const BANLIST_EFFECTIVE = "2026-04-10";
export const BANLIST_SOURCE =
  "https://en.onepiece-cardgame.com/news/restriction.html";
