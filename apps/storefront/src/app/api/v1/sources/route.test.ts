import { beforeEach, describe, expect, it, vi } from "vitest";
import { listSourceMeta } from "@cambridge-tcg/data-ingest";
import {
  fetchQuarantine,
  fetchSourceLastRuns,
  fetchSourceRunHistory,
} from "@/lib/wholesale/client";
import { GET as getSources } from "./route";
import { GET as getSource } from "./[id]/route";

vi.mock("@cambridge-tcg/data-ingest", () => ({
  getSource: vi.fn(() => ({})),
  listSourceMeta: vi.fn(() => [
    {
      id: "cardrush",
      name: "CardRush",
      description: "Reviewed static description",
      upstream: "https://example.test",
      catalog_section: "the-cardrush-alignment.md",
      access: "blocked",
      license: "internal-only",
      redistribute: false,
      freshness: "page_collector",
      canonical_effort: "high",
      status: "blocked",
      games: ["op"],
      tos_notes: "Reviewed static terms note",
    },
  ]),
  sourcesByStatus: vi.fn(() => ({
    shipped: [],
    partial: [],
    planned: [],
    blocked: [{ id: "cardrush" }],
    reserved_slots: [],
  })),
}));

vi.mock("@/lib/wholesale/client", () => ({
  fetchSourceLastRuns: vi.fn(),
  fetchSourceRunHistory: vi.fn(),
  fetchQuarantine: vi.fn(),
}));

// The storefront database, for page collectors' member_price_batches. Unset
// by default: like @/lib/db without DATABASE_URL, it throws on load.
const storefront = vi.hoisted(() => ({ query: null as null | ((sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>) }));
vi.mock("@/lib/db", () => ({
  get query() {
    if (!storefront.query) throw new Error("@cambridge-tcg/db: DATABASE_URL environment variable is required");
    return storefront.query;
  },
}));

const mockLastRuns = vi.mocked(fetchSourceLastRuns);
const mockRunHistory = vi.mocked(fetchSourceRunHistory);
const mockQuarantine = vi.mocked(fetchQuarantine);

const RUN = {
  source_id: "cardrush",
  triggered_at: "2026-07-12T09:00:00.000Z",
  finished_at: "2026-07-12T09:01:00.000Z",
  status: "done",
  spec_version: "1.0.0",
  triggered_by: "operator-secret-label",
  rows_read: 5,
  rows_normalized: 4,
  rows_written: 3,
  rows_quarantined: 1,
  errors: 0,
  notes: "upstream title and query must stay private",
};

beforeEach(() => {
  mockLastRuns.mockReset();
  mockRunHistory.mockReset();
  mockQuarantine.mockReset();
  storefront.query = null;
});

describe("public source projections", () => {
  it("separates daily member permissions from legacy run availability", async () => {
    const base = listSourceMeta()[0]!;
    vi.mocked(listSourceMeta).mockReturnValueOnce([
      { ...base, id: "cardmarket" },
      { ...base, id: "scryfall" },
    ]);
    mockLastRuns.mockResolvedValueOnce(null);
    const body = await (await getSources()).json();
    expect(body.data.sources[0].member_pricing).toMatchObject({
      cadence: "daily",
      reviewed_uses: ["member-display", "member-api", "member-download"],
      methodology: "/methodology/member-pricing",
    });
    expect(body.data.sources[1].member_pricing.reviewed_uses).toEqual(["member-display"]);
    expect(body.data.sources[0].member_pricing.availability_note).toContain("not activation");
    expect(body.data.sources[0].last_run).toBeUndefined();
    expect(body.data.sources[0]).not.toHaveProperty("prices");
  });
  it("lists CardRush and TCGplayer as display-only page sources, not as running feeds", async () => {
    const base = listSourceMeta()[0]!;
    vi.mocked(listSourceMeta).mockReturnValueOnce([{ ...base, id: "cardrush" }, { ...base, id: "tcgplayer" }]);
    mockLastRuns.mockResolvedValueOnce(null);
    const body = await (await getSources()).json();
    for (const entry of body.data.sources) {
      expect(entry.member_pricing).toMatchObject({ reviewed_uses: ["member-display"], cadence: "live-page" });
      expect(entry.member_pricing.evidence_url).toBe(`repo:docs/decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md#${entry.id}`);
      expect(entry.member_pricing.availability_note).toContain("not activation or collection evidence");
      expect(entry.status).toBe("blocked");
    }
  });
  it("says whether each collector is scheduled from its flag, and keeps the manual wording while none is", async () => {
    const base = listSourceMeta()[0]!;
    const sources = () => (["cardmarket", "scryfall", "tcgplayer"] as const).map((id) => ({ ...base, id }));
    vi.mocked(listSourceMeta).mockReturnValueOnce(sources()).mockReturnValueOnce(sources()).mockReturnValueOnce(sources());
    mockLastRuns.mockResolvedValue(null);
    try {
      vi.stubEnv("DATA_COLLECT_CARDMARKET", "off");
      const off = (await (await getSources()).json()).data.sources;
      expect(off.map((entry: { member_pricing: { collection: unknown } }) => entry.member_pricing.collection)).toEqual([
        { flag: "DATA_COLLECT_CARDMARKET", scheduled: false }, { flag: null, scheduled: false }, { flag: "DATA_COLLECT_TCGPLAYER", scheduled: false },
      ]);
      expect(off[0].member_pricing.availability_note).toContain("not a Cambridge collection schedule; Cambridge imports are manual and none is scheduled.");

      vi.stubEnv("DATA_COLLECT_CARDMARKET", "on");
      const on = (await (await getSources()).json()).data.sources;
      expect(on[0].member_pricing.collection).toEqual({ flag: "DATA_COLLECT_CARDMARKET", scheduled: true });
      expect(on[2].member_pricing.collection).toEqual({ flag: "DATA_COLLECT_TCGPLAYER", scheduled: false });
      for (const entry of on) {
        expect(entry.member_pricing.availability_note).toContain("Cambridge collects Cardmarket's One Piece files daily, as collection.scheduled shows; other imports are manual.");
        expect(entry.member_pricing.availability_note).not.toContain("none is scheduled");
        expect(entry.member_pricing.availability_note).not.toContain("Cardmarket on a schedule");
      }

      vi.stubEnv("DATA_COLLECT_TCGPLAYER", "on");
      const both = (await (await getSources()).json()).data.sources;
      expect(both[0].member_pricing.availability_note).toContain("Cambridge collects Cardmarket's One Piece files daily and TCGplayer price guides hourly (stalest sets first), as collection.scheduled shows");
    } finally {
      vi.unstubAllEnvs();
      mockLastRuns.mockReset();
    }
  });
  it("strips free-text fields from the source collection", async () => {
    mockLastRuns.mockResolvedValueOnce([RUN]);

    const response = await getSources();
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(serialized).not.toContain(RUN.notes);
    expect(serialized).not.toContain(RUN.triggered_by);
    expect(body.data.sources[0].last_run.notes).toBeUndefined();
    expect(body.data.sources[0].last_run.triggered_by).toBeUndefined();
    expect(body._meta.sources).toEqual([
      "ctcg-derived",
      "wholesale-rds.ingest_run",
    ]);
    expect(body._meta.source_license).toEqual(["proprietary", "internal-only"]);
    expect(body._meta.license).toBe("NOASSERTION");
  });

  it("lists every freshness key the data spec declares, the collectors' included", async () => {
    mockLastRuns.mockResolvedValueOnce(null);
    const { freshness_keys } = (await (await getSources()).json()).data.conventions;
    expect(freshness_keys).toBe(
      "catalog (24h) / price_current (5min) / price_historical (immutable) / market_signal (1min) / status (30s) / methodology (24h) / identity (1h) / adopters (24h) / directory (10min) / live (5s) / rotating (5min) / page_collector (6h) / daily_file (26h). See packages/data-spec/src/freshness.ts.",
    );
  });

  it("returns structured run counts without fetching or publishing quarantine text", async () => {
    mockLastRuns.mockResolvedValueOnce([RUN]);
    mockRunHistory.mockResolvedValueOnce({
      runs: [{ id: 42, ...RUN }],
      next_cursor: null,
      window: {
        start: "2026-07-05T00:00:00.000Z",
        end: "2026-07-12T00:00:00.000Z",
        hours: 168,
      },
      filter: { source: "cardrush", status: null },
      queried_at: "2026-07-12T09:02:00.000Z",
    });

    const response = await getSource(
      new Request("https://example.test/api/v1/sources/cardrush?window=7d") as never,
      { params: Promise.resolve({ id: "cardrush" }) },
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(mockQuarantine).not.toHaveBeenCalled();
    expect(serialized).not.toContain(RUN.notes);
    expect(serialized).not.toContain(RUN.triggered_by);
    expect(body.data.last_run).not.toHaveProperty("notes");
    expect(body.data.last_run).not.toHaveProperty("triggered_by");
    expect(body.data.recent_runs[0]).not.toHaveProperty("id");
    expect(body.data.quarantine_publication).toMatchObject({ available: false });
    expect(body._meta.source_license).toEqual(["proprietary", "internal-only"]);
    expect(body._meta.license).toBe("NOASSERTION");
  });

  // A collector's runs are member_price_batches rows. A legacy ingest_run row
  // comes from a locked path (CardRush, TCGplayer) or none at all
  // (Cardmarket) and must not set its health.
  describe("collector health", () => {
    const detail = async (id: string) =>
      (await (await getSource(new Request(`https://example.test/api/v1/sources/${id}`) as never, { params: Promise.resolve({ id }) })).json());
    /** The newest batch at `insertedAt`, recording `observations`; the newest one that recorded any at `observedAt`. */
    /** price_collector_hosts (0146) is not provisioned here; withHosts below provisions it. */
    const batchesAt = (insertedAt: string | null, observations = 317, observedAt: string | null = insertedAt) => async (sql: string) => {
      if (sql.includes("to_regclass")) return { rows: [{ provisioned: sql.includes("to_regclass('member_price_batches')") }] };
      if (sql.includes("b.id < $2")) return { rows: observedAt ? [{ inserted_at: new Date(observedAt) }] : [] };
      return { rows: insertedAt ? [{ id: "9", inserted_at: new Date(insertedAt), source_rows: 320, missing_prices: 1, quarantined: 2, observed: observations > 0 }] : [] };
    };

    it("reads CardRush's latest batch, not a fresh legacy ingest_run", async () => {
      mockLastRuns.mockResolvedValue([{ ...RUN, finished_at: new Date().toISOString() }]);
      mockRunHistory.mockResolvedValue(null);
      storefront.query = batchesAt(new Date(Date.now() - 50 * 3_600_000).toISOString());
      const body = await detail("cardrush");
      expect(body.data.health).toMatchObject({ state: "very_stale", basis: "member_price_batches" });
      expect(body.data.health.reason).toMatch(/^latest batch with observations written 50\.0h ago; freshness budget 6\.0h \(2x exceeded\)$/);
      expect(body.data.collector).toMatchObject({
        batches: "member_price_batches", available: true,
        latest_batch: { source_rows: 320, missing_prices: 1, quarantined: 2, observed: true },
        collection: { flag: "DATA_COLLECT_CARDRUSH", scheduled: false },
      });
      expect(body.data.last_run).not.toBeNull();
      expect(body._meta.sources).toEqual(["ctcg-derived", "wholesale-rds.ingest_run", "storefront-rds.member_price_batches"]);
      expect(body._meta.source_license).toEqual(["proprietary", "internal-only", "internal-only"]);
      expect(body._meta.does_not_include.join(" ")).toContain("Health counts a batch as fresh only if it recorded observations.");
    });

    it("is healthy within six hours of the last batch, stale after, and never_run before the first", async () => {
      mockLastRuns.mockResolvedValue(null);
      mockRunHistory.mockResolvedValue(null);
      storefront.query = batchesAt(new Date(Date.now() - 3 * 3_600_000).toISOString());
      expect((await detail("cardrush")).data.health).toEqual({ state: "healthy", reason: "latest batch with observations within freshness budget", basis: "member_price_batches" });
      storefront.query = batchesAt(new Date(Date.now() - 7 * 3_600_000).toISOString());
      expect((await detail("cardrush")).data.health).toMatchObject({ state: "stale", reason: expect.stringContaining("freshness budget 6.0h") });
      storefront.query = batchesAt(null);
      expect((await detail("cardrush")).data.health.state).toBe("never_run");
    });

    it("says failing, not healthy, when the batches within the budget recorded no observations", async () => {
      mockLastRuns.mockResolvedValue(null);
      mockRunHistory.mockResolvedValue(null);
      storefront.query = batchesAt(new Date(Date.now() - 600_000).toISOString(), 0, new Date(Date.now() - 9 * 3_600_000).toISOString());
      const body = await detail("cardrush");
      expect(body.data.health).toEqual({
        state: "failing", basis: "member_price_batches",
        reason: "batches written within the freshness budget 6.0h recorded no observations; latest batch with observations written 9.0h ago",
      });
      expect(body.data.collector.latest_batch).toMatchObject({ observed: false });
    });

    it("reads Cardmarket's daily batches against a daily budget, not ingest_run", async () => {
      const base = listSourceMeta()[0]!;
      const cardmarket = { ...base, id: "cardmarket" as const, freshness: "daily_file" as const };
      vi.mocked(listSourceMeta).mockReturnValueOnce([cardmarket]).mockReturnValueOnce([cardmarket]);
      mockLastRuns.mockResolvedValue([]);
      mockRunHistory.mockResolvedValue(null);
      storefront.query = batchesAt(new Date(Date.now() - 25 * 3_600_000).toISOString());
      const body = await detail("cardmarket");
      expect(body.data.health).toEqual({ state: "healthy", reason: "latest batch with observations within freshness budget", basis: "member_price_batches" });
      expect(body.data.collector).toMatchObject({ batches: "member_price_batches", collection: { flag: "DATA_COLLECT_CARDMARKET", scheduled: false } });
      storefront.query = batchesAt(new Date(Date.now() - 30 * 3_600_000).toISOString());
      expect((await detail("cardmarket")).data.health).toMatchObject({ state: "stale", reason: expect.stringMatching(/^latest batch with observations written 30\.0h ago; freshness budget 26\.0h$/) });
    });

    it("says unknown, with the reason, when the batches cannot be read", async () => {
      mockLastRuns.mockResolvedValue([RUN]);
      mockRunHistory.mockResolvedValue(null);
      const body = await detail("cardrush");
      expect(body.data.health).toEqual({ state: "unknown", reason: "the storefront database is not configured here", basis: "member_price_batches" });
      expect(body.data.collector).toMatchObject({ available: false, reason: "the storefront database is not configured here", latest_batch: null });
      expect(body._meta.sources).toEqual(["ctcg-derived", "wholesale-rds.ingest_run"]);
    });

    /** Batches as batchesAt answers them, and price_collector_hosts holding `hosts` (or not provisioned). */
    const withHosts = (batches: ReturnType<typeof batchesAt>, hosts: Record<string, unknown>[] | null) => async (sql: string) => {
      if (sql.includes("to_regclass('price_collector_hosts')")) return { rows: [{ provisioned: hosts !== null }] };
      if (sql.includes("FROM price_collector_hosts")) return { rows: hosts ?? [] };
      return batches(sql);
    };
    const hostRow = (source: string, host: string, fields: Record<string, unknown>) => ({
      source, host, consecutive_refusals: 0, last_success_at: null, last_refusal_at: null, last_refusal_reason: null, not_before: null, suspended_at: null, suspended_reason: null, ...fields,
    });
    const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000);

    it("reads failing while one CardRush host is suspended though another collects, and lists every host", async () => {
      mockLastRuns.mockResolvedValue(null);
      mockRunHistory.mockResolvedValue(null);
      storefront.query = withHosts(batchesAt(hoursAgo(1).toISOString()), [
        hostRow("cardrush", "www.cardrush-op.jp", { last_success_at: hoursAgo(1) }),
        hostRow("cardrush", "www.cardrush-db.jp", { consecutive_refusals: 3, last_refusal_at: hoursAgo(2), last_refusal_reason: "http-403", not_before: hoursAgo(-4), suspended_at: hoursAgo(2), suspended_reason: "http-403" }),
        // Another source's row is not this one's.
        hostRow("tcgplayer", "www.tcgplayer.com", { consecutive_refusals: 3, last_refusal_at: hoursAgo(2), last_refusal_reason: "http-403", suspended_at: hoursAgo(2), suspended_reason: "http-403" }),
      ]);
      const body = await detail("cardrush");
      expect(body.data.health).toEqual({
        state: "failing", basis: "member_price_batches",
        reason: "www.cardrush-db.jp suspended after 3 refused runs in a row (http-403); batches: latest batch with observations within freshness budget",
      });
      expect(body.data.collector.hosts_available).toBe(true);
      expect(body.data.collector.hosts.map((host: { host: string; state: string }) => [host.host, host.state])).toEqual([
        ["www.cardrush-op.jp", "ok"], ["www.cardrush-pokemon.jp", "never_run"], ["www.cardrush-db.jp", "suspended"],
        ["www.cardrush-digimon.jp", "never_run"], ["www.cardrush-vanguard.jp", "never_run"], ["www.cardrush-bs.jp", "never_run"],
      ]);
      expect(body.data.collector.hosts[2]).toMatchObject({ consecutive_refusals: 3, last_refusal_reason: "http-403", suspended_reason: "http-403", suspended_at: expect.any(String), not_before: expect.any(String) });
      expect(body._meta.sources).toEqual(["ctcg-derived", "storefront-rds.member_price_batches", "storefront-rds.price_collector_hosts"]);
      expect(body._meta.source_license).toEqual(["proprietary", "internal-only", "internal-only"]);
    });

    it("reads repeated TCGplayer refusals as failing, not stale", async () => {
      const base = listSourceMeta()[0]!;
      const tcgplayer = { ...base, id: "tcgplayer" as const };
      vi.mocked(listSourceMeta).mockReturnValueOnce([tcgplayer]);
      mockLastRuns.mockResolvedValue(null);
      mockRunHistory.mockResolvedValue(null);
      // The last batch nine hours ago; every run since was refused, and a refused run writes no batch.
      storefront.query = withHosts(batchesAt(hoursAgo(9).toISOString()), [
        hostRow("tcgplayer", "infinite-api.tcgplayer.com", { consecutive_refusals: 2, last_success_at: hoursAgo(9), last_refusal_at: hoursAgo(1), last_refusal_reason: "http-429", not_before: hoursAgo(-5) }),
      ]);
      const body = await detail("tcgplayer");
      expect(body.data.health).toMatchObject({ state: "failing", basis: "member_price_batches" });
      expect(body.data.health.reason).toMatch(/^infinite-api\.tcgplayer\.com refused on its last 2 runs \(http-429\); batches: latest batch with observations written 9\.0h ago/);
    });

    it("keeps the batches' health, and says so, when the host table is not provisioned", async () => {
      mockLastRuns.mockResolvedValue(null);
      mockRunHistory.mockResolvedValue(null);
      storefront.query = withHosts(batchesAt(hoursAgo(1).toISOString()), null);
      const body = await detail("cardrush");
      expect(body.data.health.state).toBe("healthy");
      expect(body.data.collector).toMatchObject({ hosts_available: false, hosts_reason: "price_collector_hosts is not provisioned (migration 0146)" });
      expect(body.data.collector.hosts.every((host: { state: string }) => host.state === "unknown")).toBe(true);
      expect(body._meta.sources).toEqual(["ctcg-derived", "storefront-rds.member_price_batches"]);
    });

    it("lists each collected source's hosts in the source list, and none for a source without a collector", async () => {
      const base = listSourceMeta()[0]!;
      vi.mocked(listSourceMeta).mockReturnValueOnce((["cardmarket", "scryfall", "tcgplayer"] as const).map((id) => ({ ...base, id, freshness: id === "cardmarket" ? "daily_file" as const : "page_collector" as const })));
      mockLastRuns.mockResolvedValue(null);
      storefront.query = withHosts(batchesAt(null), [
        hostRow("tcgplayer", "mpapi.tcgplayer.com", { consecutive_refusals: 3, last_refusal_at: hoursAgo(2), last_refusal_reason: "http-403", suspended_at: hoursAgo(2), suspended_reason: "http-403" }),
      ]);
      const body = await (await getSources()).json();
      const [cardmarket, scryfall, tcgplayer] = body.data.sources;
      expect(cardmarket.collector).toEqual({ hosts_available: true, hosts: [expect.objectContaining({ host: "downloads.s3.cardmarket.com", state: "never_run" })] });
      expect(scryfall).not.toHaveProperty("collector");
      expect(tcgplayer.collector.hosts.map((host: { host: string; state: string }) => [host.host, host.state])).toEqual([
        ["www.tcgplayer.com", "never_run"], ["mpapi.tcgplayer.com", "suspended"], ["infinite-api.tcgplayer.com", "never_run"],
      ]);
      expect(body._meta.sources).toEqual(["ctcg-derived", "storefront-rds.price_collector_hosts"]);
      expect(body._meta.source_license).toEqual(["proprietary", "internal-only"]);
      // Unreadable, every host is listed as unknown and the envelope does not claim the table.
      storefront.query = null;
      vi.mocked(listSourceMeta).mockReturnValueOnce([{ ...base, id: "tcgplayer" }]);
      const offline = await (await getSources()).json();
      expect(offline.data.sources[0].collector).toMatchObject({ hosts_available: false, hosts_reason: "the storefront database is not configured here" });
      expect(offline._meta.sources).toEqual(["ctcg-derived"]);
    });

    it("leaves a source without a collector on ingest_run, and reads no batches for it", async () => {
      const base = listSourceMeta()[0]!;
      vi.mocked(listSourceMeta).mockReturnValueOnce([{ ...base, id: "ebay", freshness: "market_signal" }]);
      mockLastRuns.mockResolvedValue([{ ...RUN, source_id: "ebay", finished_at: new Date().toISOString() }]);
      mockRunHistory.mockResolvedValue(null);
      storefront.query = vi.fn();
      const body = await detail("ebay");
      expect(body.data.health).toEqual({ state: "healthy", reason: "within freshness budget", basis: "ingest_run" });
      expect(body.data.collector).toBeNull();
      expect(storefront.query).not.toHaveBeenCalled();
    });
  });
});
