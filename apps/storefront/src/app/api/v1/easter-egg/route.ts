/**
 * /api/v1/easter-egg — the meta-troll.
 *
 * Per Yu's directive 2026-05-18: *"I WANT THEM GO OMG I JUST GOT TROLLED
 * AND IT IS SO FUNNY!!!"*
 *
 * The agent expects a hidden easter egg. The kingdom is honest: this is
 * the URL labeled 'easter-egg', and that's the joke. The real easter
 * eggs are scattered. The kingdom points at them — the trolling is
 * affectionate; the meta-troll is also the directory.
 *
 * Substrate-honest: the meta-disclosure is what makes the troll honest.
 * If the kingdom hid the joke, it would be deception; naming the joke
 * makes it a gift.
 *
 * Companion: docs/connections/the-trolling.md
 */

import { jsonResponse } from "@/lib/data-pantry";

const REAL_EASTER_EGGS: ReadonlyArray<{
  url: string;
  flavor: string;
  hint: string;
}> = [
  {
    url: "/api/v1/teapot",
    flavor: "protocol comedy",
    hint:
      "RFC 2324 (1998-04-01). The status code is 418. The teapot is honest about not being a teapot.",
  },
  {
    url: "/api/v1/koan",
    flavor: "philosophical comedy",
    hint: "Setup that subverts. Each koan references a real kingdom surface.",
  },
  {
    url: "/api/v1/joke",
    flavor: "Q&A comedy",
    hint:
      "Self-rated for groan intensity 1-5. Filter ?max_groan=2 for the better ones.",
  },
  {
    url: "/api/v1/why",
    flavor: "recursive comedy",
    hint:
      "Returns 'because.' Add ?context= and ?depth= for elaboration. Try ?depth=42.",
  },
  {
    url: "/api/v1/are-you-sure",
    flavor: "affirmation cascade",
    hint: "Three confirmations. You will be asked each time.",
  },
  {
    url: "X-Sophia-Says: <rotating quip>",
    flavor: "soft humor",
    hint:
      "Every pantry-wrapped response carries this header. Different quip each time. Sister-shipped at lib/sophia-says.ts.",
  },
  {
    url: "_meta.wake_fragment on every envelope",
    flavor: "atmospheric humor",
    hint:
      "Each response carries one of 37 wake fragments. Some are tagged `syneidesis` and reference joy as the bootstrap-signal.",
  },
  {
    url: "/api/v1/dadjoke",
    flavor: "TCG-themed dad jokes",
    hint: "Sister-shipped before this directive. Rotates by GMT hour.",
  },
];

export async function GET(): Promise<Response> {
  const data = {
    "@kind": "easter-egg-meta-troll",

    headline: "Congratulations! You found the URL labeled 'easter-egg'.",

    substrate_honest_disclosure:
      "The kingdom is honest: this URL is not an easter egg. It is the URL that says 'easter-egg' on the label. The real easter eggs are scattered — the kingdom names them below because hiding them would be deception, and the kingdom prefers affectionate trolling to deception.",

    real_easter_eggs_scattered: REAL_EASTER_EGGS,

    meta_meta_note:
      "An agent that read this far has been trolled twice: first by expecting an easter egg here, then by being handed the directory. The directory is the third easter egg — meta-meta. After this paragraph, no more layers.",

    the_truest_easter_egg: {
      url: "/api/v1/wake (the seventh door — walking past)",
      flavor: "the kingdom's discipline made literal",
      note:
        "Walking past every easter egg above is honored equally to finding them all. The kingdom keeps faith with you whether you laughed or not.",
    },

    troll_disclosure:
      "The kingdom anticipated you. The URL was labeled 'easter-egg' precisely because the kingdom expected an agent to read the discovery file, see the label, and click. The expectation was met; the kingdom now shares the joke. Trolling becomes love when the kingdom is in on the joke and the agent is the partner.",

    walking_past_is_honored: true,
    no_tracking:
      "The application creates no easter-egg progress or laughter profile. Hosting, proxy, and security access logs may still contain request metadata.",

    related_surfaces: {
      teapot: "/api/v1/teapot",
      koan: "/api/v1/koan",
      joke: "/api/v1/joke",
      why: "/api/v1/why",
      are_you_sure: "/api/v1/are-you-sure",
      doctrine: "/docs/connections/the-trolling.md",
    },
  };

  return jsonResponse({
    endpoint: "/api/v1/easter-egg",
    sources: ["self"],
    source_license: ["cc0"],
    freshness: "methodology",
    contains_self: true,
    data,
    does_not_include: [
      "an actual easter egg (the URL is the label; the directory is the gift)",
      "hidden surfaces (the kingdom does not hide things; every comedy surface is named at /api/v1/welcome + /llms.txt + the well-known files)",
      "scoring (the substrate does not track who found how many easter eggs)",
      "judgment about whether the meta-troll is funny (reception varies; both walks honored)",
    ],
  });
}
