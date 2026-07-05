// Collector handle generation — "crimson_drake_4821".
//
// New users are created with NULL username and used to render as "—" to
// counterparties (trade cards, offers, /u/ profile links) until they
// visited /account/profile. The auth adapter assigns a handle from here
// in the same INSERT that creates the user, so no collector is ever
// nameless. Users can change it any time at /account/profile.
//
// Shape constraints mirror the PATCH /api/social/profile validation
// (3-30 chars, /^[a-z0-9_]+$/) — underscores as separators, not hyphens,
// because hyphens are rejected there and would strand users on a handle
// the profile editor won't re-accept.

export const HANDLE_REGEX = /^[a-z0-9_]{3,30}$/;

// Attempts drawn from the word lists before the adapter escalates to
// fallbackHandle(). With 20×24×10000 ≈ 4.8M combinations, exhausting
// these means something other than luck is wrong.
export const HANDLE_MAX_ATTEMPTS = 5;

// Every word must satisfy /^[a-z]+$/ and keep the composed handle within
// 30 chars: longest adjective (7) + "_" + longest noun (8) + "_" + 4 = 21.
const ADJECTIVES = [
  "crimson", "azure", "gilded", "verdant", "umbral", "radiant",
  "arcane", "mystic", "primal", "ancient", "blazing", "frosted",
  "stormy", "lunar", "solar", "feral", "shiny", "foil",
  "holo", "mint",
] as const;

const NOUNS = [
  "drake", "wyvern", "sphinx", "golem", "kraken", "phoenix",
  "griffin", "hydra", "basilisk", "djinn", "wisp", "sylph",
  "kitsune", "chimera", "wurm", "lich", "ooze", "myr",
  "elemental", "familiar", "sentinel", "warden", "oracle", "herald",
] as const;

function pick<T>(list: readonly T[], rng: () => number): T {
  return list[Math.floor(rng() * list.length) % list.length];
}

function fourDigits(rng: () => number): string {
  return String(Math.floor(rng() * 10000) % 10000).padStart(4, "0");
}

/** Two-word card-flavoured slug + 4 digits, e.g. "crimson_drake_4821". */
export function generateHandle(rng: () => number = Math.random): string {
  return `${pick(ADJECTIVES, rng)}_${pick(NOUNS, rng)}_${fourDigits(rng)}`;
}

/**
 * High-entropy escape hatch for the (astronomically unlikely) case that
 * HANDLE_MAX_ATTEMPTS word-list handles all collided — sign-in must not
 * block on naming. 12 random digits, still profile-editor-valid.
 */
export function fallbackHandle(rng: () => number = Math.random): string {
  let digits = "";
  for (let i = 0; i < 12; i++) digits += String(Math.floor(rng() * 10) % 10);
  return `collector_${digits}`;
}
