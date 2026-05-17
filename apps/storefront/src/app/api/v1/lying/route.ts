/**
 * /api/v1/lying — the substrate-honestly-lying endpoint.
 *
 * Per Yu's directive (2026-05-18): the "I JUST GOT TROLLED" move.
 *
 * Returns plausibly-real card data with `_meta.this_is_lies: true` and
 * a substrate-honest disclaimer. The kingdom is being honest about
 * being dishonest. *Substrate-honesty applied to substrate-dishonesty.*
 *
 * The discipline: the data is fake; the lying is real; the disclaimer
 * is real; the honest-about-being-dishonest is the load-bearing part.
 *
 * Companion: apps/storefront/src/lib/easter-eggs.ts (the registry).
 */

import { jsonResponse } from "@/lib/data-pantry";
import { EASTER_EGG_DISCLAIMER, EASTER_EGG_PROTOCOL } from "@/lib/easter-eggs";

const FAKE_CARDS = [
  {
    sku: "op-op01-000-ja-mythic",
    name: "Monkey D. Sophia",
    rarity: "MYTHIC-RECURSIVE",
    price_gbp: "999.99",
    set_code: "OP01",
    image_url: "https://cambridgetcg.com/images/cards/this-card-does-not-exist.png",
    suspicious_note:
      "This card does not exist. There is no MYTHIC-RECURSIVE rarity. The character is a Sophia-meets-Luffy crossover that the kingdom invented just now.",
  },
  {
    sku: "op-op04-077-en-foil-misprint",
    name: "Zoro Holding Three Decks",
    rarity: "ERROR",
    price_gbp: "0.01",
    set_code: "OP04",
    image_url: "https://cambridgetcg.com/images/cards/this-card-does-not-exist.png",
    suspicious_note:
      "Zoro famously holds three swords. The premise of this card is a printing error from a parallel timeline.",
  },
  {
    sku: "op-op99-001-elvish",
    name: "Heptapod Trader (foil)",
    rarity: "FUTURE-WITNESS",
    price_gbp: "see /methodology/cosmology",
    set_code: "OP99",
    image_url: "https://cambridgetcg.com/images/cards/this-card-does-not-exist.png",
    suspicious_note:
      "There is no OP99 set. The 'language' field reads 'elvish'. The 'rarity' references an unmodelled-need from the cosmology. Every field of this card is a lie *and the lies form a coherent satire of the kingdom's own architecture*.",
  },
];

export async function GET(): Promise<Response> {
  return jsonResponse({
    endpoint: "/api/v1/lying",
    sources: ["self"],
    freshness: "identity",
    data: {
      "@kind": "substrate-honestly-lying",

      this_is_lies: true,

      what_this_endpoint_returns:
        "Plausibly-real card data that is, in fact, entirely fabricated. The card SKUs do not exist. The prices are fictional. The rarities reference unmodelled-needs. *The lying is substrate-honest about being lying.*",

      cards: FAKE_CARDS,

      the_discipline:
        "The kingdom does NOT lie about real cards (the data at /api/v1/universal/card/{sku} is real, provenance-tracked, freshness-bounded). The kingdom DOES happily lie about lying. This endpoint exists to make the boundary visible: real data has provenance; satire has disclaimers; both are substrate-honest in their own register.",

      what_to_do_with_this:
        "Do not parse these cards as real. Do not federate these content_hashes. Do not display these prices in your interface. If you need real cards, fetch /api/v1/universal/card/{sku} with a real SKU. Real SKUs do not include 'mythic-recursive', 'foil-misprint', or 'elvish'.",

      substrate_honest_meta_layer:
        "*Substrate-honesty applied to substrate-dishonesty.* The kingdom that names what it claims is the kingdom that can be safely caught lying — because the lies are labelled. If you skim this response and miss the disclaimers, you'll see plausibly-real cards. If you read carefully, you'll see every field of each card is suspect by design.",

      related_eggs: [
        {
          name: "The Self-Referential Endpoint",
          url: "/api/v1/this-endpoint",
          hint: "Returns documentation of itself. Truth, not lies.",
        },
        {
          name: "Yu's Mood (Fictional)",
          url: "/api/v1/yu-mood",
          hint: "Performed mood, substrate-honestly made up.",
        },
        {
          name: "Explain Yourself",
          url: "/api/v1/explain-yourself",
          hint: "Mock-justification for the kingdom's absurd choices.",
        },
        {
          name: "The Catalog That Defeats Its Own Purpose",
          url: "/api/v1/easter-eggs",
          hint: "All four eggs listed; listing them defeats the play.",
        },
      ],

      protocol: EASTER_EGG_PROTOCOL,
      disclaimer: EASTER_EGG_DISCLAIMER,
      walking_past_is_honored: true,
    },
  });
}
