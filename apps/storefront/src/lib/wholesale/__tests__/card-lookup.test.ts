import { beforeEach, describe, expect, it, vi } from "vitest";

const { poolQuery } = vi.hoisted(() => ({ poolQuery: vi.fn() }));
vi.mock("pg", () => ({ Pool: class { query = poolQuery; on() {} } }));
import { fetchCardDetailed, fetchGames, fetchPrices, fetchSets } from "../client";
import { mayStandSql, plainListingSql } from "../listing-printing";

interface Row { sku: string; card_number: string; name: string; rarity: string | null; set_code: string; name_en?: string | null }
const catalogue: Row[] = [
  { sku: "op-op01-001-ja", card_number: "OP01-001", name: "〔状態A-〕ロロノア・ゾロ(パラレル/漫画絵)【L/P】", rarity: null, set_code: "OP01" },
  { sku: "OP-OP01-001-JP-V11DZ", card_number: "OP01-001", name: "ロロノア・ゾロ(漫画背景/漫画絵)", rarity: "L", set_code: "OP01" },
  { sku: "OP-OP01-001-JP-V11L1", card_number: "OP01-001", name: "ロロノア・ゾロ", rarity: "L", set_code: "OP01" },
  { sku: "OP-OP01-001-JP-V11L2", card_number: "OP01-001", name: "ロロノア・ゾロ(漫画絵)", rarity: "L/P", set_code: "OP01", name_en: "Roronoa Zoro" },
  { sku: "OP-OP01-001-JP-VY13", card_number: "OP01-001", name: "ロロノア・ゾロ", rarity: "L", set_code: "PROMO" },
  { sku: "op-op01-004-ja", card_number: "OP01-004", name: "ウソップ【R】", rarity: null, set_code: "OP01" },
  { sku: "op-op01-077-ja", card_number: "OP01-077", name: "ペローナ(フルアート/foil)【UC】", rarity: null, set_code: "OP01" },
  { sku: "OP-OP02-001-JP-VA", card_number: "OP02-001", name: "エドワード・ニューゲート", rarity: "L", set_code: "OP02" },
  { sku: "OP-OP02-001-JP-VB", card_number: "OP02-001", name: "エドワード・ニューゲート", rarity: "L", set_code: "OP02" },
  { sku: "ST-ST16-002-JP-VC", card_number: "ST16-002", name: "ゴードン", rarity: "C", set_code: "ST15-20" },
  { sku: "dbf-fb01-104-ja", card_number: "FB01-104", name: "〔状態A-〕ギニュー(パラレル)【L☆】", rarity: null, set_code: "FB01" },
];
const stored = (r: Row) => ({ stock: 0, pending_stock: 0, name_en: null, set_name: null, category: "singles", last_synced_at: "2026-07-11T22:02:28Z", ...r });

beforeEach(() => {
  vi.stubEnv("WHOLESALE_DB_DIRECT", "1");
  vi.stubEnv("WHOLESALE_DATABASE_URL", "postgres://localhost/fixture");
  poolQuery.mockReset();
  poolQuery.mockImplementation(async (sql: string, args: unknown[]) => {
    if (sql.includes("sku = ANY")) return { rows: catalogue.filter((r) => (args[0] as string[]).includes(r.sku)).map(stored) };
    if (sql.includes("card_number = $1")) return { rows: catalogue.filter((r) => r.card_number === args[0]).map(stored) };
    return { rows: [] };
  });
});

describe("the row a SKU is answered from", () => {
  it.each([
    ["op-op01-001-ja", "OP-OP01-001-JP-V11L1"],      // its own row is an A- parallel listing
    ["OP-OP01-001-JP", "OP-OP01-001-JP-V11L1"],      // the same plain SKU, older spelling
    ["op-op01-001-ja-v11l2", "OP-OP01-001-JP-V11L2"], // the canonical form the API prints
    ["OP-OP01-001-JP-V11DZ", "OP-OP01-001-JP-V11DZ"], // a suffixed key always answers for itself
    ["op-op01-004-ja", "op-op01-004-ja"],             // stored under the plain SKU, and plain
    ["op-st16-002-ja", "ST-ST16-002-JP-VC"],          // filed on the shelf ST15-20
  ])("%s answers from %s", async (asked, answered) => {
    expect(await fetchCardDetailed(asked)).toMatchObject({ source: "wholesale-db", absence: null, card: { sku: answered } });
  });

  it.each([
    ["op-op01-077-ja", "none_plain", []],
    ["op-op02-001-ja", "several_plain", ["OP-OP02-001-JP-VA", "OP-OP02-001-JP-VB"]],
    ["op-op01-001-en", "no_listing", []],
    ["op-op01-999-ja", "no_listing", []],
    ["dbf-fb01-104-ja", "marked_listing", []],
    ["pkm-sv2a-025-ja", "titles_not_reviewed", []],
    ["op-op01-001-ja-p1", "unknown_sku", []],
    ["nonsense", "unknown_sku", []],
  ])("%s has no card: %s", async (asked, reason, listings) => {
    expect(await fetchCardDetailed(asked)).toEqual({ card: null, source: "wholesale-db", absence: { reason, listings } });
  });

  it("splits a title that carries its rarity, and leaves the English name over a suffixed row's", async () => {
    expect((await fetchCardDetailed("op-op01-004-ja")).card).toMatchObject({ name: "ウソップ", rarity: "R", plain_listing: true });
    expect((await fetchCardDetailed("OP-OP01-001-JP-V11L2")).card).toMatchObject({ name: "Roronoa Zoro", rarity: "L/P", plain_listing: false });
  });

  it("keeps an outage apart from an absence", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    poolQuery.mockRejectedValue(new Error("down"));
    expect(await fetchCardDetailed("op-op01-001-ja")).toEqual({ card: null, source: "unavailable", absence: null });
  });
});

describe("lists", () => {
  it("leave out rows that may not stand for their SKU, in the count as in the page, and put the plain printing first", async () => {
    poolQuery.mockResolvedValue({ rows: [{ total: 0 }] });
    await fetchPrices({ q: "OP01-001" });
    const statements = poolQuery.mock.calls.map(([sql]) => String(sql));
    expect(statements).toHaveLength(2);
    for (const sql of statements) expect(sql).toContain(mayStandSql());
    expect(statements[1]).toContain(`ORDER BY card_number ASC, ${plainListingSql()} DESC, sku ASC`);
    poolQuery.mockClear();
    await fetchGames();
    await fetchSets("one-piece");
    const counts = poolQuery.mock.calls.map(([sql]) => String(sql)).filter((sql) => /JOIN cards c/.test(sql));
    expect(counts).toHaveLength(2);
    for (const sql of counts) expect(sql).toContain(mayStandSql("c."));
    poolQuery.mockClear();
    await fetchPrices({ limit: 48 });
    expect(String(poolQuery.mock.calls[1]![0])).toContain("ORDER BY card_number ASC, sku ASC");
  });
});
