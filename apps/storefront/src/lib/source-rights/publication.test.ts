import { describe, expect, it } from "vitest";
import { tcgplayer, type SourceMeta } from "@cambridge-tcg/data-ingest";
import {
  publicSourceDecision,
  sourceAllowsPublicExactValues,
} from "./publication";

describe("public source-rights decisions", () => {
  it("treats the current TCGplayer review as internal-only and contract-only", () => {
    const decision = publicSourceDecision("tcgplayer");

    expect(decision).toMatchObject({
      source_license_tier: "internal-only",
      safe_default: "contract-only",
      exact_values_public: false,
    });
    expect(decision.reason).not.toContain("partner-redistributable");
  });

  it("requires every affirmative permission signal before publishing exact values", () => {
    const permitted: SourceMeta = {
      ...tcgplayer.meta,
      license: "cc0",
      redistribute: true,
      rights: {
        ...tcgplayer.meta.rights,
        redistribution: { verdict: "permitted", notes: "Affirmative test grant." },
        safe_default: "redistribute",
      },
    };

    expect(sourceAllowsPublicExactValues(permitted)).toBe(true);
    expect(
      sourceAllowsPublicExactValues({
        ...permitted,
        rights: { ...permitted.rights, safe_default: "contract-only" },
      }),
    ).toBe(false);
    expect(
      sourceAllowsPublicExactValues({ ...permitted, redistribute: false }),
    ).toBe(false);
  });

  it("fails an unknown archive source closed", () => {
    expect(publicSourceDecision("legacy-mystery-feed")).toMatchObject({
      source_license_tier: "internal-only",
      safe_default: "internal-only",
      exact_values_public: false,
      reviewed_at: null,
    });
  });
});
