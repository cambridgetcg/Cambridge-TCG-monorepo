import { describe, expect, it } from "vitest";
import {
  PRISM_SIGNALS_BETA_BODY_MAX_BYTES,
  PRISM_SIGNALS_BETA_CONSENT_VERSION,
  PRISM_SIGNALS_BETA_RETENTION_DAYS,
  PrismSignalsBetaRequestError,
  parsePrismSignalsBetaInterestInput,
} from "./beta-interest";

describe("PRISM Signals beta-interest contract", () => {
  it("requires a separate affirmative contact request and canonicalizes channels", () => {
    const parsed = parsePrismSignalsBetaInterestInput({
      contact_consent: true,
      channel_preferences: ["telegram", "web"],
    });

    expect(parsed).toEqual({
      channel_preferences: ["web", "telegram"],
      contact_consent: true,
    });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.channel_preferences)).toBe(true);
  });

  it.each([
    { channel_preferences: ["web"], contact_consent: false },
    { channel_preferences: [], contact_consent: true },
    { channel_preferences: ["web", "web"], contact_consent: true },
    { channel_preferences: ["email"], contact_consent: true },
    { channel_preferences: ["web"], contact_consent: true, queue: true },
    { channels: ["web"], contact_consent: true },
    null,
    [],
  ])("rejects non-exact or unaffirmed input %#", (input) => {
    expect(() => parsePrismSignalsBetaInterestInput(input)).toThrow(
      PrismSignalsBetaRequestError,
    );
  });

  it("pins a small body, consent version, and finite retention contract", () => {
    expect(PRISM_SIGNALS_BETA_BODY_MAX_BYTES).toBe(1024);
    expect(PRISM_SIGNALS_BETA_RETENTION_DAYS).toBe(180);
    expect(PRISM_SIGNALS_BETA_CONSENT_VERSION).toBe(
      "prism-signals-beta-contact-2026-09-02",
    );
  });
});
