/**
 * Tests for bandai-jp — fixture-based, no network.
 *
 * Fixtures are trimmed, synthetic samples built from the 2026-10-30
 * captures: the One Piece OP-01 list (`bandai-jp-op01-sample.html`, five
 * blocks with a synthetic Q&A) and the Fusion World FB10 list
 * (`bandai-jp-dbf-fb10-list.html`, five items). Rules and Q&A values are
 * （合成） placeholders, and neither carries the site footer.
 *
 * Coverage: the image-only parsers and their shape guards, the key table
 * (decision record §Keys), the pure normalizer, the blocked registry entry,
 * and one collection run through the identified reader with mocked fetch.
 */

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildSku } from "@cambridge-tcg/sku";
import { parseModalImageBlocks } from "../bandai-en/parse";
import { BANDAI_JP_GAMES, BANDAI_JP_POLICY } from "../bandai-jp/config";
import { bandaiJpImageKey, bandaiJpObjectKey, normalizeBandaiJpImage } from "../bandai-jp/keys";
import { parseFusionWorldJpImages, parseOnePieceJpImages } from "../bandai-jp/parse";
import { bandaiJp } from "../bandai-jp/index";
import { collectBandaiJpImages, type BandaiJpCollection } from "../bandai-jp/collect";
import { createOfficialMediaReader } from "../official-media";
import { getSource } from "../registry";
import type { IngestEvent } from "../types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OP = readFileSync(join(__dirname, "fixtures", "bandai-jp-op01-sample.html"), "utf8");
const FW = readFileSync(join(__dirname, "fixtures", "bandai-jp-dbf-fb10-list.html"), "utf8");
const OP_URL = BANDAI_JP_GAMES.op.series_url("550101");
const FW_URL = BANDAI_JP_GAMES.dbf.series_url("584010");

describe("parseModalImageBlocks (bandai-en, image-only)", () => {
  it("reads ids, the printed number and the image address with its cache query, and no text", () => {
    const blocks = parseModalImageBlocks(OP, OP_URL);
    expect(blocks.map((b) => [b.card_id, b.card_number, b.parallel, b.info_number])).toEqual([
      ["OP01-001", "OP01-001", null, "OP01-001"],
      ["OP01-001_p2", "OP01-001", "p2", "OP01-001"],
      ["OP01-002", "OP01-002", null, "OP01-002"],
      ["OP01-016", "OP01-016", null, "OP01-016"],
      ["OP01-016_p2", "OP01-016", "p2", "OP01-016"],
    ]);
    expect(blocks[0]!.image_url).toBe("https://www.onepiece-cardgame.com/images/cardlist/card/OP01-001.png?261016");
    // The nested Q&A ends the lazy block early; the image came first, so it is read.
    expect(JSON.stringify(blocks)).not.toContain("合成");
  });
});

describe("parseOnePieceJpImages", () => {
  it("returns every block's image, the parallels keyed but marked", () => {
    const page = parseOnePieceJpImages(OP, OP_URL);
    expect(page.kind).toBe("ok");
    if (page.kind !== "ok") return;
    expect(page.quarantined).toEqual([]);
    expect(page.blocks.map((b) => [b.card_id, b.suffix, b.name])).toEqual([
      ["OP01-001", null, "ロロノア・ゾロ"], ["OP01-001_p2", "p2", "ロロノア・ゾロ"],
      ["OP01-002", null, "トラファルガー・ロー"], ["OP01-016", null, "ナミ"], ["OP01-016_p2", "p2", "ナミ"],
    ]);
    for (const block of page.blocks) expect(Object.keys(block).sort()).toEqual(["card_id", "card_number", "game", "image_url", "name", "suffix"]);
  });

  it("quarantines a block whose id differs from the number it prints [C2]", () => {
    const html = OP.replace("<span>OP01-002</span> | <span>L</span>", "<span>OP01-003</span> | <span>L</span>");
    const page = parseOnePieceJpImages(html, OP_URL);
    expect(page.kind === "ok" && page.quarantined).toEqual([{ card_id: "OP01-002", reason: "id-differs-from-printed-number" }]);
  });

  it.each([
    ["another card's file", 'data-src="../images/cardlist/card/OP01-002.png?261016" alt="トラファルガー・ロー">\n              </div>', 'data-src="../images/cardlist/card/OP01-003.png?261016" alt="トラファルガー・ロー">\n              </div>', "image-names-another-card"],
    ["another host", 'data-src="../images/cardlist/card/OP01-002.png?261016" alt="トラファルガー・ロー">\n              </div>', 'data-src="https://en.onepiece-cardgame.com/images/cardlist/card/OP01-002.png?261016" alt="トラファルガー・ロー">\n              </div>', "image-outside-lane"],
    ["a non-numeric query [C4]", 'data-src="../images/cardlist/card/OP01-002.png?261016" alt="トラファルガー・ロー">\n              </div>', 'data-src="../images/cardlist/card/OP01-002.png?x=1" alt="トラファルガー・ロー">\n              </div>', "image-outside-lane"],
  ])("quarantines an image naming %s", (_name, from, to, reason) => {
    expect(OP.includes(from)).toBe(true);
    const page = parseOnePieceJpImages(OP.replace(from, to), OP_URL);
    expect(page.kind === "ok" && page.quarantined).toEqual([{ card_id: "OP01-002", reason }]);
  });

  it("calls a page drift when the thumbnails and blocks disagree, or when it holds none", () => {
    expect(parseOnePieceJpImages(OP.replace('<a class="modalOpen" data-fancybox="group_1" data-src="#OP01-002">', "<a>"), OP_URL)).toMatchObject({ kind: "drift" });
    expect(parseOnePieceJpImages("<html><body>メンテナンス中</body></html>", OP_URL)).toEqual({ kind: "drift", reason: "modal-blocks-0-thumbnails-0" });
  });
});

describe("parseFusionWorldJpImages", () => {
  it("reads every item against the page's own result count, with bare suffixes [C1]", () => {
    const page = parseFusionWorldJpImages(FW, FW_URL);
    expect(page.kind).toBe("ok");
    if (page.kind !== "ok") return;
    expect(page.quarantined).toEqual([]);
    expect(page.blocks.map((b) => [b.card_id, b.card_number, b.suffix, b.name, b.image_url.split("/").pop()])).toEqual([
      ["FB10-001", "FB10-001", null, "孫悟空", "FB10-001_f.webp"],
      ["FB10-001_p1", "FB10-001", "p1", "孫悟空", "FB10-001_f_p1.webp"],
      ["FB10-002", "FB10-002", null, "ウパ", "FB10-002.webp"],
      ["FB10-123", "FB10-123", null, "セル", "FB10-123.webp"],
      ["FB10-123_p2", "FB10-123", "p2", "セル", "FB10-123_p2.webp"],
    ]);
    expect(page.blocks[0]!.image_url).toBe("https://www.dbs-cardgame.com/fw/images/cards/card/jp/FB10-001_f.webp");
  });

  it("calls an empty, renumbered or miscounted page drift [C17]", () => {
    const empty = FW.replace(/<div class="resultTxt">[\s\S]*<\/ul>/, '<p class="u-margin--40 infomation align-center">検索内容をご確認ください。</p>');
    expect(parseFusionWorldJpImages(empty, FW_URL)).toEqual({ kind: "drift", reason: "no-result-count-items-0" });
    expect(parseFusionWorldJpImages(FW.replace('<span class="num">5</span>', '<span class="num">162</span>'), FW_URL)).toMatchObject({ kind: "drift" });
    expect(parseFusionWorldJpImages(FW.replace('<span class="num">5</span>', '<span class="num">0</span>'), FW_URL)).toMatchObject({ kind: "drift" });
  });

  it("quarantines a back face, an English image or an unreviewed marker", () => {
    const html = FW.replace("jp/FB10-002.webp", "jp/FB10-002_b.webp").replace("jp/FB10-123.webp", "en/FB10-123.webp").replace("card_no=FB10-123&p=_p2", "card_no=FB10-123&p=_x2");
    const page = parseFusionWorldJpImages(html, FW_URL);
    expect(page.kind === "ok" && page.quarantined).toEqual([
      { card_id: "FB10-002", reason: "image-names-another-card" },
      { card_id: "FB10-123", reason: "image-outside-lane" },
      { card_id: "FB10-123_x2", reason: "unreviewed-variant-marker" },
    ]);
  });
});

describe("bandai-jp keys", () => {
  it.each([
    ["op", "OP01-001", null, "OP-OP01-001-JA"],
    ["op", "OP01-001", "p2", "OP-OP01-001-JA-P2"],
    ["op", "EB01-006", "r1", "OP-EB01-006-JA-R1"],
    ["dbf", "FB10-001", null, "DBF-FB10-001-JA"],
    ["dbf", "FB10-001", "p1", "DBF-FB10-001-JA-P1"],
    ["dbf", "FB10-002", null, "DBF-FB10-002-JA"],
  ] as const)("%s %s %s → %s", (game, number, suffix, key) => {
    expect(bandaiJpImageKey(game, number, suffix)).toBe(key);
  });

  it("refuses an underscored suffix, as buildSku does [C1], and malformed ids", () => {
    expect(() => buildSku({ game: "dbf", set: "fb10", number: "001", lang: "ja", variant: "_p1" })).toThrow(/_p1/);
    expect(bandaiJpImageKey("dbf", "FB10-001", "_p1")).toBeNull();
    expect(bandaiJpImageKey("op", "OP01_001", null)).toBeNull();
    expect(bandaiJpImageKey("op", "OP01-001-X", null)).toBeNull();
    expect(bandaiJpImageKey("op", "OP01-001", "f")).toBeNull();
  });

  it("keeps Japanese keys and objects apart from English ones", () => {
    const ja = bandaiJpImageKey("op", "OP01-001", null)!;
    expect(ja).not.toBe("OP-OP01-001-EN");
    expect(ja.endsWith("-JA")).toBe(true);
    expect(bandaiJpObjectKey("op", ja)).toBe("official/OP-OP01-001-JA.png");
    expect(bandaiJpObjectKey("dbf", "DBF-FB10-001-JA")).toBe("official/DBF-FB10-001-JA.webp");
  });

  it("normalizes a base print to a credited row, and refuses a variant", () => {
    const page = parseOnePieceJpImages(OP, OP_URL);
    if (page.kind !== "ok") throw new Error("fixture drifted");
    const at = "2026-10-30T10:27:20.000Z";
    expect(normalizeBandaiJpImage({ ...page.blocks[0]!, retrieved_at: at })).toEqual({ ok: true, record: {
      sku: "OP-OP01-001-JA", lang: "ja", kind: "official_sample", source: "bandai-jp",
      source_url: "https://www.onepiece-cardgame.com/images/cardlist/card/OP01-001.png?261016",
      attribution: "©尾田栄一郎／集英社 ©尾田栄一郎／集英社・フジテレビ・東映アニメーション",
      license_note: BANDAI_JP_POLICY, retrieved_at: at,
    } });
    expect(normalizeBandaiJpImage({ ...page.blocks[1]!, retrieved_at: at })).toEqual({ ok: false, reason: "OP01-001_p2: variant-without-reviewed-mapping" });
  });

  it("carries the footers' credit lines verbatim, full-width characters kept", () => {
    expect(BANDAI_JP_GAMES.op.credit).toContain("／");
    expect(BANDAI_JP_GAMES.op.credit).toContain("・");
    expect(BANDAI_JP_GAMES.op.credit.normalize("NFKC")).not.toBe(BANDAI_JP_GAMES.op.credit);
    expect(BANDAI_JP_GAMES.dbf.credit).toBe("©バード・スタジオ／集英社 ©バード・スタジオ／集英社・東映アニメーション ©Bandai Namco Entertainment Inc.");
    expect(BANDAI_JP_GAMES.op.series).toHaveLength(63);
    expect(BANDAI_JP_GAMES.op.series).toEqual(expect.arrayContaining(["550001", "550036", "550701", "550801", "550901"]));
    expect(new Set(BANDAI_JP_GAMES.op.series).size).toBe(BANDAI_JP_GAMES.op.series.length);
    expect(BANDAI_JP_GAMES.dbf.series).toHaveLength(27);
  });
});

describe("bandai-jp registry entry", () => {
  it("is blocked, non-redistributable and never reads", async () => {
    expect(getSource("bandai-jp")).toBe(bandaiJp);
    expect(bandaiJp.meta).toMatchObject({ id: "bandai-jp", status: "blocked", redistribute: false, license: "proprietary", games: ["op", "dbf"] });
    const events: IngestEvent[] = [];
    const fetch = vi.fn(() => { throw new Error("no network"); }) as unknown as typeof globalThis.fetch;
    for await (const _row of bandaiJp.read({ fetch, on_event: (event) => { events.push(event); } })) throw new Error("must yield nothing");
    expect(fetch).not.toHaveBeenCalled();
    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe("error");
  });
});

describe("collectBandaiJpImages", () => {
  type Route = (url: string) => { status: number; body?: string; headers?: Record<string, string> };
  const html = { "content-type": "text/html; charset=UTF-8" };
  const site: Route = (url) => {
    if (url.endsWith("/robots.txt")) return { status: 404 };
    if (url === OP_URL) return { status: 200, body: OP, headers: html };
    if (url === FW_URL) return { status: 200, body: FW, headers: html };
    if (url === BANDAI_JP_GAMES.op.series_url("550102")) return { status: 200, body: OP.replaceAll("OP01-", "OP02-"), headers: html };
    return { status: 404 };
  };
  async function run(route: Route, selection: Parameters<typeof collectBandaiJpImages>[0]["selection"]) {
    let t = 0;
    const urls: string[] = [];
    const fetch = vi.fn(async (input: string | URL | Request) => {
      urls.push(String(input));
      const answer = route(String(input));
      return new Response(answer.body ?? "", { status: answer.status, headers: answer.headers });
    }) as unknown as typeof globalThis.fetch;
    const reader = createOfficialMediaReader({ lane: "ja", fetch, now: () => t, sleep: async (ms) => { t += ms; } });
    const result: BandaiJpCollection = await collectBandaiJpImages({ reader, selection, now: () => new Date(Date.UTC(2026, 9, 30) + t) });
    return { result, urls };
  }

  it("reads every host's robots.txt first, then list pages only, and offers base prints as rows", async () => {
    const { result, urls } = await run(site, [{ game: "op", series: ["550101", "550102"] }, { game: "dbf", series: ["584010"] }]);
    expect(urls).toEqual([
      "https://www.onepiece-cardgame.com/robots.txt", "https://www.dbs-cardgame.com/robots.txt",
      OP_URL, BANDAI_JP_GAMES.op.series_url("550102"), FW_URL,
    ]);
    expect(urls.some((url) => /\.(png|webp)/.test(url) || url.includes("detail.php"))).toBe(false);
    expect(result.kind).toBe("done");
    if (result.kind !== "done") return;
    expect(result.counts.map((c) => [c.series, c.blocks, c.base, c.skipped, c.quarantined, c.conflicts])).toEqual([
      ["550101", 5, 3, 2, 0, 0], ["550102", 5, 3, 2, 0, 0], ["584010", 5, 3, 2, 0, 0],
    ]);
    expect(result.rowsBySeries.map((s) => s.rows.map((r) => r.sku))).toEqual([
      ["OP-OP01-001-JA", "OP-OP01-002-JA", "OP-OP01-016-JA"],
      ["OP-OP02-001-JA", "OP-OP02-002-JA", "OP-OP02-016-JA"],
      ["DBF-FB10-001-JA", "DBF-FB10-002-JA", "DBF-FB10-123-JA"],
    ]);
    const fw = result.rowsBySeries[2]!.rows[0]!;
    expect(fw).toMatchObject({ lang: "ja", kind: "official_sample", source: "bandai-jp", attribution: BANDAI_JP_GAMES.dbf.credit, license_note: BANDAI_JP_POLICY });
    expect(JSON.stringify(result)).not.toContain("合成");
  });

  it("de-duplicates a key across the run (the first wins), and writes neither side of a conflict", async () => {
    // 550102 repeats 550101 exactly: every base key again, at the same path.
    const repeat: Route = (url) => url === BANDAI_JP_GAMES.op.series_url("550102") ? { status: 200, body: OP, headers: html } : site(url);
    const first = await run(repeat, [{ game: "op", series: ["550101", "550102"] }]);
    if (first.result.kind !== "done") throw new Error(first.result.kind);
    expect(first.result.counts[1]).toMatchObject({ base: 3, duplicates: 3, conflicts: 0 });
    expect(first.result.rowsBySeries.map((s) => s.rows.length)).toEqual([3, 0]);
    // The promo list names FB10-001 by another file (no _f): the same key at
    // a different path. Neither row is written; the other keys are.
    const promo = FW.replace("jp/FB10-001_f.webp", "jp/FB10-001.webp");
    const clash: Route = (url) => url === BANDAI_JP_GAMES.dbf.series_url("584901") ? { status: 200, body: promo, headers: html } : site(url);
    const second = await run(clash, [{ game: "dbf", series: ["584010", "584901"] }]);
    if (second.result.kind !== "done") throw new Error(second.result.kind);
    expect(second.result.counts[1]).toMatchObject({ duplicates: 2, conflicts: 1 });
    expect(second.result.rowsBySeries.flatMap((s) => s.rows.map((r) => r.sku))).toEqual(["DBF-FB10-002-JA", "DBF-FB10-123-JA"]);
  });

  it("stops at a refused page and returns no rows", async () => {
    const refused: Route = (url) => url === BANDAI_JP_GAMES.op.series_url("550102") ? { status: 429, headers: { "retry-after": "60" } } : site(url);
    const { result, urls } = await run(refused, [{ game: "op", series: ["550101", "550102", "550103"] }]);
    expect(result).toMatchObject({ kind: "refused", host: "www.onepiece-cardgame.com", series: "550102", reason: "http-429" });
    expect(urls).not.toContain(BANDAI_JP_GAMES.op.series_url("550103"));
    expect(result).not.toHaveProperty("rowsBySeries");
  });

  it.each([
    [{ status: 403 }, "robots-http-403"],
    [{ status: 200, body: "User-agent: *\nDisallow: /cardlist/\n" }, "robots-disallows-series"],
    [{ status: 200, body: "User-agent: cambridgetcg-official-media\nDisallow: /\n" }, "robots-disallows-series"],
  ] as const)("stops before any list page when robots.txt answers %o", async (answer, reason) => {
    const { result, urls } = await run((url) => url.endsWith("/robots.txt") ? answer : site(url), [{ game: "op", series: ["550101"] }]);
    expect(result).toMatchObject({ kind: "refused", reason });
    expect(urls).toEqual(["https://www.onepiece-cardgame.com/robots.txt"]);
  });

  it("stops at drift: a page it does not recognise, or more than ten quarantines", async () => {
    const empty: Route = (url) => url === FW_URL ? { status: 200, body: "<html></html>", headers: html } : site(url);
    expect((await run(empty, [{ game: "dbf", series: ["584010"] }])).result).toMatchObject({ kind: "drift", series: "584010", reason: "no-result-count-items-0" });
    const many = OP.replace(/\.\.\/images\/cardlist\/card\//g, "https://cdn.example/");
    const blocks = Array.from({ length: 3 }, () => many.slice(many.indexOf('<a class="modalOpen"'), many.lastIndexOf("</dl>") + 5)).join("\n");
    const page = many.replace(/<a class="modalOpen"[\s\S]*<\/dl>/, blocks);
    const noisy: Route = (url) => url === OP_URL ? { status: 200, body: page, headers: html } : site(url);
    expect((await run(noisy, [{ game: "op", series: ["550101"] }])).result).toMatchObject({ kind: "drift", reason: "quarantined-15" });
  });

  it("refuses a series outside the configured list before any request", async () => {
    await expect(run(site, [{ game: "op", series: ["550099"] }])).rejects.toThrow("bandai-jp-series-outside-configuration");
  });
});
