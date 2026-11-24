import { describe, expect, it, vi } from "vitest";
import { guestWalk, walkReport } from "./guest-walk";

const NOW = Date.parse("2026-11-25T08:40:00Z");
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();
const collector = (hours: number, suspended: string | null = ago(600)) => ({ data: { collector: { collection: { scheduled: true }, hosts: [{ host: "one.example", last_success_at: ago(hours), suspended_at: null }, { host: "two.example", last_success_at: null, suspended_at: suspended }] } } });
const PNG = new Uint8Array(6_000); PNG.set([0x89, 0x50, 0x4e, 0x47]);

/** Every answer a whole walk gets on a good day. */
const good = (): Record<string, unknown> => ({
  "/": '<form action="/prices/search" method="get">',
  "/prices/search": "<code>OP-OP01-001-JP</code>",
  "/api/v1/search/cards": { data: { matches: [{ sku: "op-op01-001-ja", name: "ロロノア・ゾロ", confidence: "exact" }], next_step: "/api/v1/cards/op-op01-001-ja/everything" } },
  "/api/v1/cards/op-op01-001-ja/everything": { data: { card: { sku: "op-op01-001-ja", card_number: "OP01-001", rarity: "L" }, prices_today: { rows: [], note: "No stored source row is currently cleared for publication." } } },
  "/api/v1/universal/card/op-op01-001-ja": { "@kind": "card", "@content_hash": "sha256:00", name: { natural_token: "Roronoa Zoro" }, image_url: "https://images.example/op01-001.png", image_attribution: "Bandai" },
  "/op01-001.png": PNG,
  "/api/v1/sources/cardmarket": collector(3), "/api/v1/sources/cardrush": collector(2), "/api/v1/sources/tcgplayer": collector(1),
  "/api/v1/health": { data: { database: { answered: true, clock: ago(0) }, jobs: [{ job: "derive/market", state: "ok" }, { job: "pull/traffic", state: "off" }], daily_check: { at: ago(24), outcome: "ran" } } },
  "/api/v1/pulls": { data: { games: [{ slug: "one-piece", sections: [{ rates: [{ basis: "a box count", sourceUrl: "https://source.example" }] }] }] } },
  "/api/v1/play/practice": { how: { new_game: { body: { starter_id: ["st-15"] } } } },
  "/api/v1/play/starters/st-15": { data: { cards: [{ quantity: 50 }], leader: { resolved: true }, cards_unresolved: 0 } },
  "/api/v1/feedback": { data: { accepting_messages: false, contact: "contact@example.test" } },
});

function walk(change: (answers: Record<string, unknown>) => void = () => {}, options: { outside?: boolean; respond?: (path: string, pass: number) => Response | Error | undefined } = {}) {
  const answers = good();
  change(answers);
  const asked: string[] = [];
  const fetch = vi.fn(async (input: URL) => {
    const url = new URL(input);
    asked.push(url.pathname + url.search);
    const special = options.respond?.(url.pathname, Number(url.searchParams.get("walk")?.split("-")[1] ?? 0));
    if (special instanceof Error) throw special;
    if (special) return special;
    const answer = answers[url.pathname];
    if (answer === undefined) return new Response("", { status: 404 });
    return new Response(answer instanceof Uint8Array || typeof answer === "string" ? answer as string : JSON.stringify(answer), { headers: { "x-vercel-cache": "MISS", "cf-cache-status": "DYNAMIC" } });
  });
  const result = guestWalk({ fetch: fetch as unknown as typeof globalThis.fetch, now: () => NOW, sleep: async () => {}, outside: options.outside ?? true });
  return result.then(done => ({ ...done, asked }));
}

describe("the guest walk", () => {
  it("passes every step on a good day, with GETs that no edge copy can answer", async () => {
    const done = await walk();
    expect(done.failed).toEqual([]);
    expect(done.steps).toHaveLength(12);
    expect(done.asked).toHaveLength(14);
    expect(done.asked.filter(path => !path.startsWith("/op01")).every(path => path.includes("walk="))).toBe(true);
    expect(walkReport(done).split("\n").at(-1)).toBe("failing: none");
  });

  it("asks about the daily check only from outside", async () => {
    expect((await walk(undefined, { outside: false })).steps.map(step => step.id)).not.toContain("daily");
    expect((await walk(answers => { (answers["/api/v1/health"] as { data: { daily_check: unknown } }).data.daily_check = { at: ago(31), outcome: "ran" }; })).failed).toEqual(["daily"]);
    expect((await walk(answers => { (answers["/api/v1/health"] as { data: { daily_check: unknown } }).data.daily_check = { at: ago(2), outcome: "unavailable:mail-refused" }; })).failed).toEqual(["daily"]);
  });

  it.each<[string, (answers: Record<string, unknown>) => void]>([
    ["home", answers => { answers["/"] = "<p>hello</p>"; }],
    ["find", answers => { answers["/prices/search"] = "Card search is unavailable right now."; }],
    ["search", answers => { answers["/api/v1/search/cards"] = { data: { matches: [{ name: "〔状態A-〕ロロノア・ゾロ(パラレル/漫画絵)【L/P】" }], next_step: "/api/v1/cards/op-op01-001-ja/everything" } }; }],
    ["card", answers => { (answers["/api/v1/cards/op-op01-001-ja/everything"] as { data: { prices_today: { note: string } } }).data.prices_today.note = ""; }],
    ["prices", answers => { answers["/api/v1/sources/cardrush"] = collector(9); }],
    ["pulls", answers => { answers["/api/v1/pulls"] = { data: { games: [{ slug: "one-piece", sections: [{ rates: [{ basis: "a box count", sourceUrl: null }] }] }] } }; }],
    ["play", answers => { answers["/api/v1/play/starters/st-15"] = { data: { cards: [{ quantity: 49 }], leader: { resolved: true }, cards_unresolved: 1 } }; }],
    ["write", answers => { answers["/api/v1/feedback"] = { data: {} }; }],
  ])("%s fails on its own when its answer is wrong", async (id, change) => {
    expect((await walk(change)).failed).toEqual([id]);
  });

  it("wants a picture that is an image, with its credit", async () => {
    const doc = "/api/v1/universal/card/op-op01-001-ja";
    expect((await walk(answers => { answers["/op01-001.png"] = "<html>not here</html>"; })).failed).toEqual(["picture"]);
    expect((await walk(answers => { (answers[doc] as { image_attribution: unknown }).image_attribution = null; })).failed).toEqual(["picture"]);
    expect((await walk(answers => { delete answers[doc]; })).failed).toEqual(["example", "picture"]);
  });

  it("lives with a host suspended long ago, and names one suspended lately or a source switched off", async () => {
    const lately = await walk(answers => { answers["/api/v1/sources/cardrush"] = collector(2, ago(20)); });
    expect(lately.steps.find(step => step.id === "prices")).toMatchObject({ ok: false, parts: ["two.example"] });
    expect(walkReport(lately).split("\n").at(-1)).toBe("failing: prices.two.example");
    expect((await walk(answers => { (answers["/api/v1/sources/tcgplayer"] as { data: { collector: { collection: { scheduled: boolean } } } }).data.collector.collection.scheduled = false; })).failed).toEqual(["prices"]);
  });

  it("names each job that is behind", async () => {
    const done = await walk(answers => { (answers["/api/v1/health"] as { data: { jobs: unknown } }).data.jobs = [{ job: "collect/cardrush", state: "late" }, { job: "derive/market", state: "failing" }]; });
    expect(done.steps.find(step => step.id === "health")).toMatchObject({ ok: false, says: "collect/cardrush is late, derive/market is failing", parts: ["collect/cardrush", "derive/market"] });
  });

  it("counts an edge copy, a browser check and a refusal as broken, and tries a step twice first", async () => {
    const copy = (headers: Record<string, string>) => walk(undefined, { respond: path => path === "/api/v1/feedback" ? new Response("{}", { headers }) : undefined });
    expect((await copy({ "cf-cache-status": "HIT" })).failed).toEqual(["write"]);
    expect((await copy({ "x-vercel-cache": "STALE" })).failed).toEqual(["write"]);
    expect((await copy({ "cf-mitigated": "challenge" })).steps.at(-1)!.says).toContain("browser check");
    expect((await walk(undefined, { respond: (path, pass) => path === "/api/v1/feedback" && pass === 1 ? new Response("", { status: 502 }) : undefined })).failed).toEqual([]);
    expect((await walk(undefined, { respond: path => path === "/api/v1/feedback" ? new Error("ECONNREFUSED 10.0.0.1") : undefined })).steps.at(-1)).toMatchObject({ ok: false, says: "it could not be reached or read" });
  });
});
