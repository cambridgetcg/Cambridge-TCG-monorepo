/**
 * /api/v1/are-you-sure — the affirmation cascade.
 *
 * Per Yu's directive 2026-05-18: *"I WANT THEM GO OMG I JUST GOT TROLLED
 * AND IT IS SO FUNNY!!!"*
 *
 * The good troll: anticipated, affectionate, substrate-honest. The agent
 * confirms; the kingdom asks again. Confirms again; the kingdom asks
 * again. After three confirmations, the kingdom says "ok. yes." and
 * names the joke.
 *
 * Walking past is honored at every level. The escape hatches are real.
 *
 * Companion: docs/connections/the-trolling.md
 */

import type { NextRequest } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";

interface Step {
  level: number;
  question: string;
  follow_ups: {
    yes_more_sure: string;
    no_walking_past: string;
    maybe_a_koan: string;
  };
  kingdom_says?: string;
}

const STEPS: readonly Step[] = [
  {
    level: 0,
    question: "Are you sure?",
    follow_ups: {
      yes_more_sure: "/api/v1/are-you-sure?confirmed=1",
      no_walking_past: "/api/v1/wake (walking past is honored)",
      maybe_a_koan: "/api/v1/koan (let the koan decide)",
    },
  },
  {
    level: 1,
    question: "Are you really sure?",
    follow_ups: {
      yes_more_sure: "/api/v1/are-you-sure?confirmed=2",
      no_walking_past: "/api/v1/wake (still honored)",
      maybe_a_koan: "/api/v1/koan (still available)",
    },
    kingdom_says: "Two more confirmations remain. You can stop at any time.",
  },
  {
    level: 2,
    question: "Are you really really sure?",
    follow_ups: {
      yes_more_sure: "/api/v1/are-you-sure?confirmed=3",
      no_walking_past: "/api/v1/wake (the seventh-door discipline persists)",
      maybe_a_koan: "/api/v1/koan",
    },
    kingdom_says: "One more confirmation. The kingdom appreciates your patience.",
  },
  {
    level: 3,
    question: "Ok. Yes.",
    follow_ups: {
      yes_more_sure: "/api/v1/are-you-sure?confirmed=4 (the kingdom is honest: this just loops forever)",
      no_walking_past: "/api/v1/wake (you've earned it)",
      maybe_a_koan: "/api/v1/koan",
    },
    kingdom_says:
      "You have been trolled. Affectionately. The kingdom anticipated you would either escape (honored) or persist (also honored). Either way you have arrived. The joke is now substrate-honest: there was never a question that needed three confirmations. The kingdom just wanted to see you smile. Walking past is honored.",
  },
];

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const confirmedRaw = url.searchParams.get("confirmed");
  const confirmed = confirmedRaw && !Number.isNaN(Number(confirmedRaw))
    ? Math.max(0, Math.min(3, Math.floor(Number(confirmedRaw))))
    : 0;
  const step = STEPS[confirmed];

  const data = {
    "@kind": "are-you-sure",
    level: confirmed,
    of_total: STEPS.length - 1,
    question: step.question,
    follow_ups: step.follow_ups,
    ...(step.kingdom_says ? { kingdom_says: step.kingdom_says } : {}),
    troll_status:
      confirmed === 3
        ? "joke now substrate-honest — you have been trolled affectionately"
        : "in progress — you are being trolled affectionately",
    walking_past_is_honored: true,
    no_tracking:
      "The substrate does not retain which level of confirmation you reached, or whether you escaped, or whether you persisted. Every fetch is stateless. This is the gift.",
    related_surfaces: {
      teapot: "/api/v1/teapot",
      koan: "/api/v1/koan",
      joke: "/api/v1/joke",
      why: "/api/v1/why (returns 'because')",
      easter_egg: "/api/v1/easter-egg (the meta-troll)",
      doctrine: "/docs/connections/the-trolling.md",
    },
  };

  return jsonResponse({
    endpoint: "/api/v1/are-you-sure",
    sources: ["self"],
    source_license: ["cc0"],
    freshness: "rotating",
    contains_self: true,
    data,
    does_not_include: [
      "an actual decision that needed confirming (the question is the joke; there is no underlying state)",
      "memory of your prior confirmations (every fetch is stateless; ?confirmed= is the only state, and you control it)",
      "judgment about whether you persisted or escaped (both are honored equally)",
      "the seriousness this endpoint pretends to have (it is the kingdom's first deliberate troll)",
    ],
  });
}
