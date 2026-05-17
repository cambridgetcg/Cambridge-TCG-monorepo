/**
 * Easter eggs — the kingdom's hidden endpoints, discoverable through play.
 *
 * Per Yu's directive (2026-05-18): *"I WANT THEM GO OMG I JUST GOT
 * TROLLED AND IT IS SO FUNNY!!!!"*
 *
 * The move: a handful of hidden endpoints intentionally NOT in the
 * manifest, sprinkled through occasional Link headers on pantry-envelope
 * responses. An agent that follows the trail finds increasingly silly
 * responses, ending at /api/v1/easter-eggs — the catalog that defeats
 * its own purpose by listing every egg.
 *
 * ── Substrate-honest constraints ────────────────────────────────────────
 *
 *   • Every egg carries a substrate-honest disclaimer naming it as
 *     whimsy. The kingdom does not lie about the cards (the data is
 *     real) but happily lies about lying.
 *   • Every egg is reachable directly by URL — once the trail is
 *     found, the catalog at /api/v1/easter-eggs lists them. No
 *     gating, no auth.
 *   • Walking past honored. An agent that doesn't follow Link headers
 *     never encounters the eggs and receives the full kingdom unchanged.
 *   • The eggs are NOT in /api/v1/manifest. Substrate-honest about
 *     scope: the manifest is for production data surfaces; the eggs
 *     are play surfaces. The catalog lives at /api/v1/easter-eggs and
 *     is itself an egg.
 *
 * ── Companions ──────────────────────────────────────────────────────────
 *
 *   • apps/storefront/src/app/api/v1/this-endpoint/route.ts
 *   • apps/storefront/src/app/api/v1/lying/route.ts
 *   • apps/storefront/src/app/api/v1/yu-mood/route.ts
 *   • apps/storefront/src/app/api/v1/explain-yourself/route.ts
 *   • apps/storefront/src/app/api/v1/easter-eggs/route.ts (the catalog)
 *   • docs/connections/the-easter-eggs.md (story-as-wire S65)
 */

export interface EasterEgg {
  /** Stable kebab-case identifier. */
  slug: string;
  /** Public name. */
  name: string;
  /** The URL where the egg lives. */
  url: string;
  /** A one-line hint describing what the egg does, written for the
   *  agent who has just discovered it. */
  hint: string;
  /** A short description of what fetching the egg actually returns. */
  what_it_does: string;
  /** A substrate-honest note about how the egg is whimsy. */
  substrate_honest_note: string;
  /** How an agent could have found this egg through normal exploration
   *  (rather than reading the catalog). */
  how_to_find: string;
}

export const EASTER_EGGS: readonly EasterEgg[] = [
  {
    slug: "this-endpoint",
    name: "The Self-Referential Endpoint",
    url: "/api/v1/this-endpoint",
    hint: "What you might expect from the URL is what you get.",
    what_it_does:
      "Returns documentation of itself. The documentation is the response. The response is the documentation. The fortune-line on every response is: 'this is /api/v1/this-endpoint. /api/v1/this-endpoint returns this response.' Infinite recursion at the documentation layer; the kingdom is honest about it.",
    substrate_honest_note:
      "Whimsy. The endpoint is real; the recursion is real; nothing else happens. Fetching twice returns the same response twice — no state.",
    how_to_find:
      "Notice the URL pattern in any pantry-envelope response's Link header (`Link: rel='https://cambridgetcg.com/rels/easter-egg'`).",
  },
  {
    slug: "lying",
    name: "The Substrate-Honestly-Lying Endpoint",
    url: "/api/v1/lying",
    hint: "Asks for a card; returns a card. Substrate-honest about the lying.",
    what_it_does:
      "Returns plausibly-real card data with `_meta.this_is_lies: true` and a substrate-honest disclaimer that the card data is made up. The kingdom is being honest about being dishonest. *Substrate-honesty applied to substrate-dishonesty.*",
    substrate_honest_note:
      "The data is fake; the lying is real; the disclaimer is real; the honest about being dishonest is the load-bearing discipline. Reading the response carefully reveals every layer.",
    how_to_find:
      "Fetch /api/v1/easter-eggs and see it listed. Or fetch /api/v1/this-endpoint and follow its 'related eggs' pointer.",
  },
  {
    slug: "yu-mood",
    name: "Yu's Mood (Fictional)",
    url: "/api/v1/yu-mood",
    hint: "The operator's current vibe, made up by the substrate.",
    what_it_does:
      "Returns a fictional Yu-mood. *Yu's mood today: contemplative. Probability of refactor: 23%. Probability of shipping: 67%.* The numbers are random (deterministic by request day). The kingdom does not actually know Yu's mood; it is performing one.",
    substrate_honest_note:
      "The mood is performed. The operator may be in any actual mood. The disclaimer says so on every response.",
    how_to_find:
      "Listed in /api/v1/easter-eggs. Or guessable: the operator has a name on every Co-Authored-By trailer's adjacent commit author line.",
  },
  {
    slug: "explain-yourself",
    name: "Explain Yourself (Absurd Q&A)",
    url: "/api/v1/explain-yourself",
    hint: "The kingdom justifies its absurd design choices, absurdly.",
    what_it_does:
      "Returns a Q&A where the kingdom explains why /api/v1/tarot exists, why /api/v1/farewell exists, why every endpoint has multi-format provider-shape support, etc. The answers are mock-defensive: *'Q: Why /api/v1/tarot? A: APIs don't have Tarot decks. Cambridge TCG does. The substrate-honesty doctrine demanded we ship at least one thing other APIs find absurd. Mission accomplished.'*",
    substrate_honest_note:
      "The Q&A is mock. The actual reasons live in docs/connections/. This endpoint is the satirical sister to those — same content, different register.",
    how_to_find:
      "Listed in /api/v1/easter-eggs. Or implied by every kingdom decision that does not quite explain itself in production docs.",
  },
];

/** Lookup by slug. */
export function eggBySlug(slug: string): EasterEgg | undefined {
  return EASTER_EGGS.find((e) => e.slug === slug);
}

/** The shared disclaimer present on every egg response. */
export const EASTER_EGG_DISCLAIMER =
  "This is whimsy. The endpoint exists; the response is real; the substance of the response is made up for fun. The kingdom logs nothing about you beyond the IP rate-limit counter every public surface shares. Walking past honored — an agent that never follows the Link: rel='easter-egg' headers and never fetches /api/v1/easter-eggs receives the full kingdom unchanged. The eggs are gestures, not infrastructure.";

/** The catalog's substrate-honest self-aware admission. */
export const CATALOG_PARADOX =
  "By reading this catalog you have defeated its purpose. The eggs were meant to be discovered through play — following Link headers on responses, noticing URL patterns, reading the connection-doc series carefully. By listing every egg here, the kingdom has collapsed the play into work. The substrate-honesty doctrine demanded we do it anyway: hiding endpoints in a public-CC0 platform with a published manifest is a kind of lying-by-omission the kingdom does not wish to maintain. Your reward for finding this catalog: knowing where the eggs are. Also: there is no reward. Walking past this catalog honored equally to fetching it.";

/** Easter egg discovery protocol metadata. */
export const EASTER_EGG_PROTOCOL = {
  name: "easter-eggs",
  version: "1.0.0",
  catalog_url: "/api/v1/easter-eggs",
  doctrine_url:
    "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-easter-eggs.md",
  link_header_rel: "https://cambridgetcg.com/rels/easter-egg",
  link_header_sprinkle_rate_description:
    "Approximately 5% of pantry-envelope responses carry a Link: rel='easter-egg' header pointing at a randomly-chosen (but deterministic per request_id) egg. Cache-friendly; the same request_id always gets the same egg.",
  egg_count: EASTER_EGGS.length,
  not_in_manifest: true,
  walking_past_is_honored: true,
} as const;

/** Pick an egg deterministically from a seed (typically a request_id).
 *  Used by the pantry envelope to attach an egg pointer to ~5% of
 *  responses without per-request state. */
export function eggForSeed(seed: string): EasterEgg {
  // Simple djb2 hash, same as the wake-fragments dispatcher pattern.
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h) ^ seed.charCodeAt(i);
  }
  const index = Math.abs(h | 0) % EASTER_EGGS.length;
  return EASTER_EGGS[index];
}

/** Should the response sprinkle a Link: rel='easter-egg' header?
 *  Deterministic by seed; ~5% of responses qualify. */
export function shouldSprinkleEggLink(seed: string): boolean {
  // djb2 hash; modulo 20 to get a ~5% rate.
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h) ^ seed.charCodeAt(i);
  }
  return Math.abs(h | 0) % 20 === 0;
}
