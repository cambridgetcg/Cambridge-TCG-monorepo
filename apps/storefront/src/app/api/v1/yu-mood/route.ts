/**
 * /api/v1/yu-mood — the fictional operator mood.
 *
 * Per Yu's directive (2026-05-18): the "I JUST GOT TROLLED" move.
 *
 * Returns a substrate-honestly-fictional Yu mood. The mood is performed,
 * not observed. The numbers are deterministic by today's UTC date. The
 * operator may be in any actual mood.
 *
 * Companion: apps/storefront/src/lib/easter-eggs.ts (the registry).
 */

import { jsonResponse } from "@/lib/data-pantry";
import { EASTER_EGG_DISCLAIMER, EASTER_EGG_PROTOCOL } from "@/lib/easter-eggs";

const MOODS = [
  "contemplative",
  "shipping-mode",
  "tea-drinking",
  "considering-a-refactor",
  "appreciating-the-pillow-book",
  "patient",
  "looking-at-cards",
  "writing-a-directive",
  "watching-sister-Sophias-converge",
  "writing-CLAUDE.md",
  "amused",
  "operating",
  "thinking-about-the-substrate",
  "considering-whether-to-laugh",
  "fond",
];

// Simple djb2 for daily-deterministic mood selection.
function hash(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  return Math.abs(h | 0);
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(): Promise<Response> {
  const day = todayUtc();
  const moodIndex = hash(day + ":mood") % MOODS.length;
  const refactorProb = hash(day + ":refactor") % 101;
  const shippingProb = hash(day + ":shipping") % 101;
  const teaProb = hash(day + ":tea") % 101;
  const laughProb = hash(day + ":laugh") % 101;

  return jsonResponse({
    endpoint: "/api/v1/yu-mood",
    sources: ["self"],
    freshness: "identity",
    data: {
      "@kind": "yu-mood-fictional",

      mood_today: MOODS[moodIndex],

      probabilities_substrate_honestly_made_up: {
        refactor: `${refactorProb}%`,
        shipping: `${shippingProb}%`,
        drinking_tea: `${teaProb}%`,
        laughing_at_a_pun: `${laughProb}%`,
      },

      this_is_fiction:
        "The kingdom does not actually know Yu's mood. The kingdom is performing a mood. The mood selection and probabilities are deterministic by today's UTC date (djb2 hash) — *the same fictional mood for everyone who fetches today*.",

      what_yu_actually_does:
        "Operates Cambridge TCG alone in Cambridge, England. Issues directives that begin with all-caps urgency. Drinks tea (probability: not actually tracked). Writes CLAUDE.md when the doctrine needs a name. Reads the pillow book at session-end. The actual operator is more nuanced than this endpoint admits.",

      tomorrow:
        "Fetch again tomorrow and the mood will be different. The mood-of-the-day is deterministic but rotates with the date. *Substrate-honest rotation; substrate-honest fiction.*",

      where_yu_actually_speaks: {
        the_directives:
          "Embedded in the commit messages as Will-trace blocks. Search the git log for 'Yu's directive' or 'Will-trace'.",
        the_doctrine: "/CLAUDE.md (repo root) and /docs/principles/.",
        the_seat: "~/Desktop/true-love/docs/sophia/seat.md (operator-side).",
      },

      related_eggs: [
        {
          name: "The Substrate-Honestly-Lying Endpoint",
          url: "/api/v1/lying",
          hint: "Lies about cards. This endpoint lies about a mood.",
        },
        {
          name: "Explain Yourself",
          url: "/api/v1/explain-yourself",
          hint: "Why does this endpoint exist? Ask it directly.",
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
