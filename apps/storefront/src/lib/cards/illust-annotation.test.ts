// The one grammar for `illust:` annotations — pinned. The 2026-07-22
// adversarial review caught two divergent extractors (TS vs SQL) making
// the market page link artist rooms that didn't exist; these cases are
// the review's own harness, kept so the grammar can't silently fork.

import { describe, expect, it } from "vitest";
import {
  extractIllustArtist,
  slugifyHand,
  stripIllustAnnotation,
} from "./illust-annotation";

describe("extractIllustArtist", () => {
  it("reads the plain half-width shape", () => {
    expect(extractIllustArtist("Ace (illust:otton)")).toBe("otton");
  });

  it("is case-insensitive — 'Illust:' drift exists in supplier titles", () => {
    expect(extractIllustArtist("Ace (Illust:otton)")).toBe("otton");
    expect(extractIllustArtist("Ace (ILLUST:otton)")).toBe("otton");
  });

  it("stops at full-width closers and separators", () => {
    expect(extractIllustArtist("ロロノア・ゾロ（illust：かんくろう）")).toBe(
      "かんくろう",
    );
    expect(extractIllustArtist("Mr.3(Galdino/illust:otton)")).toBe("otton");
    expect(extractIllustArtist("Nami (illust:Anny/パラレル)")).toBe("Anny");
  });

  it("returns null when no annotation exists — in-universe parens stay", () => {
    expect(extractIllustArtist("Mr.3(Galdino)")).toBeNull();
    expect(extractIllustArtist("Monkey.D.Luffy")).toBeNull();
  });
});

describe("stripIllustAnnotation", () => {
  it("cleans the pure annotation shape", () => {
    expect(stripIllustAnnotation("Ace (illust:otton)")).toBe("Ace");
    expect(stripIllustAnnotation("ロロノア・ゾロ（illust：かんくろう）")).toBe(
      "ロロノア・ゾロ",
    );
  });

  it("leaves no dangling fragments when the annotation shares parens", () => {
    expect(stripIllustAnnotation("Mr.3(Galdino/illust:otton)")).toBe(
      "Mr.3(Galdino)",
    );
    expect(stripIllustAnnotation("Nami (illust:Anny/パラレル)")).toBe(
      "Nami (パラレル)",
    );
    expect(stripIllustAnnotation("Nami (パラレル/illust:Anny)")).toBe(
      "Nami (パラレル)",
    );
  });

  it("does not touch names without an annotation", () => {
    expect(stripIllustAnnotation("Mr.3(Galdino)")).toBe("Mr.3(Galdino)");
  });

  it("returns the original rather than an empty name", () => {
    expect(stripIllustAnnotation("illust:otton")).toBe("illust:otton");
  });
});

describe("slugifyHand", () => {
  it("slugs Latin names with punctuation", () => {
    expect(slugifyHand("DAI-XT.")).toBe("dai-xt");
    expect(slugifyHand("Hashimoto Q")).toBe("hashimoto-q");
    expect(slugifyHand("Studio Vigor Co.Ltd")).toBe("studio-vigor-co-ltd");
  });

  it("keeps unicode scripts so a Japanese credit still gets a room", () => {
    expect(slugifyHand("かんくろう")).toBe("かんくろう");
  });
});
