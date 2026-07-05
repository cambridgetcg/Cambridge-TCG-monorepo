/**
 * Tests for the GAMES registry's `confirmed` flags.
 *
 * `confirmed: true` has exactly one meaning: cards for the game exist in
 * the production wholesale DB. Reconciled against prod 2026-07-05
 * (op 3,438 / pkm 6,370 / dbf 1,622 cards; every other code zero).
 * This test pins that reconciliation so the registry can't silently
 * drift back into claiming cards it doesn't hold. When a game's first
 * real production cards land, update BOTH the registry flag and the
 * expected lists here in the same commit — that is the ceremony.
 */

import { describe, it, expect } from "vitest";
import {
  GAMES,
  GAME_CODES,
  CONFIRMED_GAME_CODES,
  ANTICIPATED_GAME_CODES,
  isConfirmedGameCode,
  isGameCode,
} from "../games";

/** Cards verified in the production wholesale DB (2026-07-05) + internal tst. */
const EXPECTED_CONFIRMED = ["op", "pkm", "dbf", "tst"] as const;

/** Registered or anticipated codes with zero production cards. */
const EXPECTED_UNCONFIRMED = [
  "mtg", "ygo", "dbs", "wei", "vng", "dmw", "bsr", "lcg", "fab", "lgr",
  "swu", "sor", "alt", "rft", "rsh", "pkp", "gen",
] as const;

describe("GAMES confirmed flags — production-DB reconciliation", () => {
  it("confirms exactly the games whose cards exist in the prod wholesale DB (+ tst)", () => {
    expect([...CONFIRMED_GAME_CODES].sort()).toEqual([...EXPECTED_CONFIRMED].sort());
  });

  it("keeps every other registered code unconfirmed until first cards land", () => {
    for (const code of EXPECTED_UNCONFIRMED) {
      expect(GAMES[code].confirmed, `${code} should be confirmed:false`).toBe(false);
    }
  });

  it("partitions the registry completely (confirmed + unconfirmed = all codes)", () => {
    expect(EXPECTED_CONFIRMED.length + EXPECTED_UNCONFIRMED.length).toBe(GAME_CODES.length);
  });

  it("ANTICIPATED_GAME_CODES is the unconfirmed set minus tst", () => {
    expect([...ANTICIPATED_GAME_CODES].sort()).toEqual([...EXPECTED_UNCONFIRMED].sort());
  });

  it("isConfirmedGameCode agrees with the flags", () => {
    expect(isConfirmedGameCode("op")).toBe(true);
    expect(isConfirmedGameCode("dbf")).toBe(true);
    expect(isConfirmedGameCode("dmw")).toBe(false); // seeded 2026-07-05, cards pending
    expect(isConfirmedGameCode("ygo")).toBe(false);
    expect(isConfirmedGameCode("not-a-game")).toBe(false);
  });

  it("type guards stay coherent", () => {
    for (const code of GAME_CODES) {
      expect(isGameCode(code)).toBe(true);
    }
    expect(isGameCode("")).toBe(false);
  });
});
