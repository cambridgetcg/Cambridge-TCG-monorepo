import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { laneForLang, laneSourceUrl, OFFICIAL_IMAGE_LANES } from "./official-image-lanes";

const { en, ja } = OFFICIAL_IMAGE_LANES;

describe("official image lanes", () => {
  it("is pure: no imports, so the audit and the tools read the same table", () => {
    expect(readFileSync(new URL("./official-image-lanes.ts", import.meta.url), "utf8")).not.toMatch(/^\s*import\b/m);
  });

  it("names each lane's source, decision and Japanese credit lines verbatim", () => {
    expect(en).toMatchObject({ lang: "en", source: "bandai-en", policy: "cambridge.official-en-media/2026-07-13", evidence: null, credits: null });
    expect(ja).toMatchObject({ lang: "ja", source: "bandai-jp", policy: "cambridge.official-ja-media/2026-10-30", evidence: "cambridge.official-ja-media/2026-10-30" });
    expect(ja.credits.op).toBe("©尾田栄一郎／集英社 ©尾田栄一郎／集英社・フジテレビ・東映アニメーション");
    expect(ja.credits.dbf).toBe("©バード・スタジオ／集英社 ©バード・スタジオ／集英社・東映アニメーション ©Bandai Namco Entertainment Inc.");
    expect(en.games.op.paths).toBeNull();
    expect(laneForLang("ja")).toBe(ja);
    expect(laneForLang("ko")).toBeNull();
  });

  it.each([
    ["op", "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001.png?260701", "OP-OP01-001-EN"],
    ["op", "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001_p1.png?260701", "OP-OP01-001-EN-P1"],
    ["op", "https://en.onepiece-cardgame.com/images/cardlist/card/EB01-006_r1.png", "OP-EB01-006-EN-R1"],
    ["dbf", "https://www.dbs-cardgame.com/fw/images/cards/card/en/FB10-001_f_p1.webp", "DBF-FB10-001-EN-P1"],
    ["dbf", "https://www.dbs-cardgame.com/fw/images/cards/card/en/FB10-002.webp", "DBF-FB10-002-EN"],
  ] as const)("accepts an English %s file named for its key: %s", (game, url, key) => {
    expect(laneSourceUrl(en, game, url, key)?.href).toBe(url);
  });

  it.each([
    ["op", "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001.png", "OP-OP01-001-EN-P1"],
    ["op", "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001_p1.png", "OP-OP01-001-EN"],
    ["op", "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-002.png", "OP-OP01-001-EN"],
    ["op", "https://en.onepiece-cardgame.com/cardlist/?series=569101", "OP-OP01-001-EN"],
    ["dbf", "https://www.dbs-cardgame.com/fw/images/cards/card/en/FB10-001_b.webp", "DBF-FB10-001-EN"],
    ["dbf", "https://www.dbs-cardgame.com/fw/images/cards/card/jp/FB10-001_f.webp", "DBF-FB10-001-EN"],
    ["op", "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001.png", "OP-OP01-001-JA"],
    ["op", "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001.png", "DBF-OP01-001-EN"],
  ] as const)("refuses an English %s file that names another card or lane: %s for %s", (game, url, key) => {
    expect(laneSourceUrl(en, game, url, key)).toBeNull();
  });

  it("needs the key in the Japanese lane, and allows only an empty or bare numeric query", () => {
    const url = "https://www.onepiece-cardgame.com/images/cardlist/card/OP01-001.png?261016";
    expect(laneSourceUrl(ja, "op", url)).toBeNull();
    expect(laneSourceUrl(ja, "op", url, "OP-OP01-001-JA")?.href).toBe(url);
    expect(laneSourceUrl(ja, "op", url.replace("?261016", ""), "OP-OP01-001-JA")).not.toBeNull();
    for (const query of ["?x=1", "?261016a", "?123456789", "?1&2"]) expect(laneSourceUrl(ja, "op", url.replace("?261016", query), "OP-OP01-001-JA")).toBeNull();
    expect(laneSourceUrl(ja, "dbf", "https://www.dbs-cardgame.com/fw/images/cards/card/jp/FB10-001_f.webp", "DBF-FB10-001-JA")).not.toBeNull();
    expect(laneSourceUrl(ja, "dbf", "https://www.dbs-cardgame.com/fw/images/cards/card/jp/FB10-001_f.webp?1", "DBF-FB10-001-JA")).toBeNull();
    // Japanese keys are base prints only.
    expect(laneSourceUrl(ja, "op", "https://www.onepiece-cardgame.com/images/cardlist/card/OP01-001_p2.png", "OP-OP01-001-JA-P2")).toBeNull();
  });

  it.each([
    "http://www.onepiece-cardgame.com/images/cardlist/card/OP01-001.png",
    "https://user:pw@www.onepiece-cardgame.com/images/cardlist/card/OP01-001.png",
    "https://www.onepiece-cardgame.com:8443/images/cardlist/card/OP01-001.png",
    "https://www.onepiece-cardgame.com/images/cardlist/card/OP01-001.png#x",
    "https://www.onepiece-cardgame.com/images/cardlist/card/OP01-001.png?token=1",
    " https://www.onepiece-cardgame.com/images/cardlist/card/OP01-001.png",
    "https://www.onepiece-cardgame.com.evil.invalid/images/cardlist/card/OP01-001.png",
  ])("refuses a transport outside the lane: %s", (url) => {
    expect(laneSourceUrl(ja, "op", url, "OP-OP01-001-JA")).toBeNull();
  });
});
