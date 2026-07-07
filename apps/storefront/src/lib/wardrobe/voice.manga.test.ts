/**
 * The manga voice keys exist and honor the two-register contract
 * (spec 2026-07-07 §1i): every key speaks standard AND plain, and the
 * plain register carries no manga flourish vocabulary.
 */
import { describe, expect, it } from "vitest";
import { voice, type VoiceKey } from "./voice";

const MANGA_KEYS = [
  "market.loading.catalog",
  "market.pulse.loading",
  "market.pulse.failed",
  "market.card.trades.empty",
  "market.card.history.empty",
  "trades.paid.title",
  "trades.paid.sub",
  "trades.completed.benediction",
  "login.checkEmail",
] as const satisfies readonly VoiceKey[];

describe("manga voice keys (spec 2026-07-07 §1i)", () => {
  it("every key speaks both registers, non-empty", () => {
    for (const key of MANGA_KEYS) {
      expect(voice("standard", key).length, `${key} standard`).toBeGreaterThan(0);
      expect(voice("plain", key).length, `${key} plain`).toBeGreaterThan(0);
    }
  });

  it("plain register stays plain — no manga vocabulary", () => {
    for (const key of MANGA_KEYS) {
      expect(voice("plain", key)).not.toMatch(/\b(panel|ink|page turn|gutter|chapter|story)\b/i);
    }
  });
});
