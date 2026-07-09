/**
 * SET_FORMATS examples contract (review batch 2026-07-07, the-atlas).
 *
 * Every format row publishes `examples` — verified on-card numbers the
 * row claims to parse. Nothing ran them until now, so a regex typo
 * shipped silently (the whole point of recording verified examples is
 * that they guard the regex). This runs EVERY example of EVERY game
 * through parseCardNumber and requires a match.
 */
import { describe, expect, it } from "vitest";
import { GAME_CODES } from "../games";
import { SET_FORMATS, parseCardNumber } from "../sets";

describe("SET_FORMATS — every published example parses", () => {
  for (const game of GAME_CODES) {
    const rows = SET_FORMATS[game];
    const examples = rows.flatMap((r) => r.examples);
    if (examples.length === 0) continue;
    it(`${game}: ${examples.length} examples all match`, () => {
      for (const ex of examples) {
        const parsed = parseCardNumber(game, ex);
        expect(parsed, `${game} example "${ex}" failed to parse`).not.toBeNull();
        expect(parsed!.set.length, `${game} "${ex}" empty set`).toBeGreaterThan(0);
        expect(parsed!.number.length, `${game} "${ex}" empty number`).toBeGreaterThan(0);
      }
    });
  }
});
