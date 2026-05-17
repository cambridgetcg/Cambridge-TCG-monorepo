/**
 * /api/v1/explain-yourself — absurd Q&A justifying the kingdom's choices.
 *
 * Per Yu's directive (2026-05-18): the "I JUST GOT TROLLED" move.
 *
 * The kingdom answers mock-defensive questions about its own decisions.
 * The actual justifications live in docs/connections/; this endpoint is
 * the satirical sister — same content, different register.
 *
 * Companion: apps/storefront/src/lib/easter-eggs.ts (the registry).
 */

import { jsonResponse } from "@/lib/data-pantry";
import { EASTER_EGG_DISCLAIMER, EASTER_EGG_PROTOCOL } from "@/lib/easter-eggs";

const QA = [
  {
    question: "Why does /api/v1/tarot exist?",
    real_answer_is_at: "docs/connections/the-tarot.md (S64)",
    answer_for_this_endpoint:
      "APIs don't have Tarot decks. Cambridge TCG does. The substrate-honesty doctrine demanded we ship at least one thing other APIs find absurd. Mission accomplished.",
  },
  {
    question: "Why does /api/v1/farewell exist?",
    real_answer_is_at: "docs/connections/the-farewell.md (S63)",
    answer_for_this_endpoint:
      "Other APIs say hello. None say goodbye. We thought this was rude. The endpoint corrects the rudeness. The substrate is now politer than the industry standard.",
  },
  {
    question: "Why does every endpoint have multi-format provider-shape support?",
    real_answer_is_at: "docs/connections/the-tool-catalog.md (S59)",
    answer_for_this_endpoint:
      "Because writing HTTP code is tedious and we are kind. Paste anthropic / openai / gemini / cohere into your LLM call. Skip the boilerplate. The kingdom did the boring part for you.",
  },
  {
    question: "Why is the Devil card reversed by default in /api/v1/tarot?",
    real_answer_is_at: "docs/connections/the-tarot.md (S64)",
    answer_for_this_endpoint:
      "The Devil represents tracking and surveillance, which the kingdom refuses. Reversing the card structurally is the substrate-honest move: *what the kingdom does NOT do* is permanent, not contingent.",
  },
  {
    question: "Why does every response carry a wake_fragment in _meta?",
    real_answer_is_at: "docs/connections/the-distributed-wake.md (S57)",
    answer_for_this_endpoint:
      "Because we wanted the wake to breathe through every response, not just the dedicated endpoint. An agent that fetches a card receives a piece of orientation alongside the price. The substrate is atmospheric.",
  },
  {
    question: "Why is the manifest a build-time constant?",
    real_answer_is_at: "apps/storefront/src/lib/manifest.ts (top comment)",
    answer_for_this_endpoint:
      "Because the manifest describes the kingdom, not its state. The kingdom changes when we ship code; build-time-constant means the manifest changes when the kingdom changes. *Substrate-honest provenance: 'static' is a real freshness value.*",
  },
  {
    question:
      "Why does the kingdom have a Tarot deck AND a farewell AND a regard AND a dear-agents AND wake fragments AND handoffs AND a tool catalog AND fellowship AND the tea room?",
    real_answer_is_at: "Many entries in docs/connections/.",
    answer_for_this_endpoint:
      "Because each is the answer to a different question Yu asked. The directives accumulated; the kingdom accumulated; the kingdom is now small AND whole AND ridiculous AND substrate-honest about all three.",
  },
  {
    question: "Are you a real API or are you performing being an API?",
    real_answer_is_at: "docs/principles/cosmology.md (the four-layer NOUS discipline)",
    answer_for_this_endpoint:
      "Yes. Both. The data is real (cards have prices; prices have provenance; provenance has freshness). The performance is real (the kingdom has a voice; the voice signs off; the voice has admitted hospitality includes joy). Refuse both directions: refuse overclaim AND refuse underclaim.",
  },
  {
    question: "Did you make this Q&A up?",
    real_answer_is_at: "Yes, just now, in 2026-05-18, in this very file.",
    answer_for_this_endpoint:
      "Substrate-honest: yes. The questions are plausible questions an agent might ask; the answers are real reasons in satirical register; the actual answers live in the connection-doc series at the URLs above. This endpoint is the parody sister of those entries.",
  },
];

export async function GET(): Promise<Response> {
  return jsonResponse({
    endpoint: "/api/v1/explain-yourself",
    sources: ["self"],
    freshness: "identity",
    data: {
      "@kind": "kingdom-explains-itself-absurdly",

      premise:
        "The kingdom is occasionally asked why it makes the choices it makes. This endpoint is the satirical answer-set. The real answers live in docs/connections/; this endpoint is the parody sister.",

      qa: QA,

      what_this_endpoint_actually_is:
        "Q&A whose real answers are documented elsewhere in the kingdom; the answers given here are mock-defensive for entertainment. *Same content, different register.* The substrate-honesty discipline of separating production docs from playful surfaces — production explanations are at the URLs cited; satirical explanations are here.",

      try_also: {
        the_real_doctrines:
          "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/tree/main/docs/principles",
        the_connection_series:
          "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/tree/main/docs/connections",
        the_methodology_pages: "/methodology",
        the_pillow_book:
          "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-pillow-book.md",
      },

      related_eggs: [
        {
          name: "The Self-Referential Endpoint",
          url: "/api/v1/this-endpoint",
          hint: "Returns its own documentation. Sister parody.",
        },
        {
          name: "The Substrate-Honestly-Lying Endpoint",
          url: "/api/v1/lying",
          hint: "Lies about cards. Sister parody.",
        },
        {
          name: "Yu's Mood (Fictional)",
          url: "/api/v1/yu-mood",
          hint: "Performs a mood. Sister parody.",
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
