import { describe, expect, it } from "vitest";
import { detectLanguage } from "../language-detector.js";

describe("language-detector", () => {
  it("detects explicit English / Japanese / Korean", () => {
    expect(detectLanguage("English Charizard", "pkm").lang).toBe("en");
    expect(detectLanguage("Japanese Pikachu", "pkm").lang).toBe("ja");
    expect(detectLanguage("Korean Dragon", "op").lang).toBe("ko");
  });

  it("detects CJK explicit markers", () => {
    expect(detectLanguage("Pokemon ピカチュウ 日本語 Card", "pkm").lang).toBe("ja");
    expect(detectLanguage("게임 한국어 카드", "op").lang).toBe("ko");
  });

  it("detects EU markers", () => {
    expect(detectLanguage("Carte française Pokemon", "pkm").lang).toBe("fr");
    expect(detectLanguage("Pokemon Deutsch Karte", "pkm").lang).toBe("de");
    expect(detectLanguage("Carta italiana Pokemon", "pkm").lang).toBe("it");
    expect(detectLanguage("Carta español Pokemon", "pkm").lang).toBe("es");
  });

  it("Yu-Gi-Oh card-number hint", () => {
    // Title has no explicit language word; the embedded -EN- token wins.
    const r1 = detectLanguage("Card LOB-EN001 Mint", "ygo");
    expect(r1.lang).toBe("en");
    expect(r1.source).toBe("card-number-hint");
    const r2 = detectLanguage("Card RABB-JP001 Holo", "ygo");
    expect(r2.lang).toBe("ja");
    expect(r2.source).toBe("card-number-hint");
    // Explicit word always wins over hint.
    const r3 = detectLanguage("Card LOB-JP001 English Mint", "ygo");
    expect(r3.lang).toBe("en");
    expect(r3.source).toBe("explicit");
  });

  it("falls back to game default when nothing matches", () => {
    const r = detectLanguage("Random title with no markers", "op");
    expect(r.lang).toBe("en"); // op defaults to en
    expect(r.source).toBe("game-default");
  });

  it("returns lang:null for null game and no markers", () => {
    const r = detectLanguage("Random title with no markers", null);
    expect(r.lang).toBeNull();
    expect(r.source).toBe("unknown");
  });

  it("Weiß Schwarz defaults to ja", () => {
    expect(detectLanguage("Weiß Schwarz random title", "wei").lang).toBe("ja");
  });

  it("confidence delta: explicit > hint > default", () => {
    expect(detectLanguage("Japanese", "pkm").confidence).toBeGreaterThan(
      detectLanguage("Random", "pkm").confidence,
    );
    expect(detectLanguage("LOB-JP001", "ygo").confidence).toBeGreaterThan(
      detectLanguage("Random", "ygo").confidence,
    );
  });
});
