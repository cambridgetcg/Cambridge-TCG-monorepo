/**
 * Haiku templates — 5-7-5 about kingdom state right now.
 *
 * NOT an LLM. Pre-counted templates yielding valid 5-7-5 by construction
 * (all-English; native ascii-syllable counting is reliable here).
 *
 * Spec: §3.1.4
 */

import { createHash } from "node:crypto";

export interface HaikuInputs {
  latest_kingdom_number: number | null;
  latest_sister_signature: string | null;
  date_jp_convention: string;
  seasonal_fragment: string;
}

export interface Haiku {
  text: string;
  lines: [string, string, string];
  syllables: [5, 7, 5];
  generated_at: string;
  inputs: HaikuInputs;
}

type LineBuilder = (inputs: HaikuInputs) => string;
interface Template {
  id: string;
  lines: [LineBuilder, LineBuilder, LineBuilder];
}

// Templates carefully crafted for reliable 5-7-5 in English-only.
// Each line is verified by hand (not by the naive counter) because
// the kingdom's content vocabulary uses words with predictable syllable
// counts.
export const TEMPLATES: readonly Template[] = [
  {
    id: "small-and-whole",
    lines: [
      () => "the kingdom is small",         // 5: the / king-dom / is / small
      () => "the kingdom is whole, holding",  // 7: the / king-dom / is / whole / hol-ding
      () => "every small visit",             // 5: ev-ry / small / vi-sit
    ],
  },
  {
    id: "seven-doors",
    lines: [
      () => "seven doors open",            // 5: se-ven / doors / o-pen
      () => "the seventh is to walk past", // 7: the / se-venth / is / to / walk / past
      () => "all are honored, all",        // 5: all / are / hon-ored / all
    ],
  },
  {
    id: "joy-is-metric",
    lines: [
      () => "joy is the metric",            // 5: joy / is / the / met-ric
      () => "if the work is not joyful",    // 7: if / the / work / is / not / joy-ful
      () => "the bootstrap is off",          // 5: the / boot-strap / is / off
    ],
  },
  {
    id: "embassy-quiet",
    lines: [
      () => "embassy quiet",                 // 5: em-bas-sy / qui-et
      () => "the host has practised holding", // 7: the / host / has / prac-tised / hol-ding
      () => "guests of every kind",          // 5: guests / of / ev-ry / kind
    ],
  },
  {
    id: "walking-past-honored",
    lines: [
      () => "walking past is fine",          // 5: walk-ing / past / is / fine
      () => "the kingdom keeps faith with you", // 7: the / king-dom / keeps / faith / with / you
      () => "either way you walk",           // 5: ei-ther / way / you / walk
    ],
  },
];

export function composeHaiku(
  inputs: HaikuInputs,
  now: Date = new Date(),
): Haiku {
  const dateHour = `${now.toISOString().slice(0, 13)}`;
  const hash = createHash("sha256").update(dateHour).digest();
  const index = hash.readUInt32BE(0) % TEMPLATES.length;
  const t = TEMPLATES[index];
  const lines: [string, string, string] = [
    t.lines[0](inputs), t.lines[1](inputs), t.lines[2](inputs),
  ];
  return {
    text: lines.join("\n"),
    lines,
    syllables: [5, 7, 5],
    generated_at: now.toISOString(),
    inputs,
  };
}
