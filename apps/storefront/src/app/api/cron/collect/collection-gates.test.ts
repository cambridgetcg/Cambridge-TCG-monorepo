import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Each collect route's gate against the copy that says what Cambridge
// collects (scheduledCollection, /api/v1/sources member_pricing.collection):
// both read collectionOn, so for any flag value the route runs its collector
// exactly when the copy names it.
const collectors = vi.hoisted(() => ({ cardmarket: vi.fn(), cardrush: vi.fn(), tcgplayer: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/cron-auth", () => ({ requireCronAuth: () => null }));
vi.mock("@/lib/datafeed/cardmarket-collector", () => ({ collectCardmarketMemberPrices: collectors.cardmarket }));
vi.mock("@/lib/datafeed/collectors/cardrush", () => ({ collectCardRush: collectors.cardrush }));
vi.mock("@/lib/datafeed/collectors/tcgplayer", () => ({ collectTcgplayer: collectors.tcgplayer }));

import { DATA_COLLECT_FLAGS, collectionSchedule, scheduledCollection, type CollectedSource } from "@/lib/datafeed/collection-flags";
import { GET as cardmarket } from "./cardmarket/route";
import { GET as cardrush } from "./cardrush/route";
import { GET as tcgplayer } from "./tcgplayer/route";

const ROUTES: Record<CollectedSource, (request: Request) => Promise<Response>> = { cardmarket, cardrush, tcgplayer };
const VALUES = [undefined, "", "on", "ON", " on", "on ", "on\n", "true", "1", "off"];
const SOURCES = Object.keys(DATA_COLLECT_FLAGS) as CollectedSource[];

beforeEach(() => {
  for (const collect of Object.values(collectors)) collect.mockReset().mockResolvedValue({ ran: false, reason: "run-in-progress" });
  for (const flag of Object.values(DATA_COLLECT_FLAGS)) vi.stubEnv(flag, undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("collect route gates and the scheduling copy", () => {
  it("covers every collected source", () => {
    expect(Object.keys(ROUTES).sort()).toEqual([...SOURCES].sort());
  });

  it.each(SOURCES.flatMap(source => VALUES.map(value => [source, value] as const)))("%s with its flag %j: the route runs exactly when the copy says it is collected", async (source, value) => {
    vi.stubEnv(DATA_COLLECT_FLAGS[source], value);
    const response = await ROUTES[source](new Request(`https://cambridgetcg.com/api/cron/collect/${source}`));
    const ran = collectors[source].mock.calls.length > 0;
    const copied = scheduledCollection()?.includes(collectionSchedule(source)) ?? false;
    expect(ran).toBe(copied);
    expect(ran).toBe(value === "on");
    if (!ran) await expect(response.json()).resolves.toEqual({ ok: true, ran: false, reason: "disabled" });
    for (const other of SOURCES.filter(name => name !== source)) expect(collectors[other]).not.toHaveBeenCalled();
  });
});
