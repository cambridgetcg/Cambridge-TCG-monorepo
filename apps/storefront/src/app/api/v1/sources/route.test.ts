import { beforeEach, describe, expect, it, vi } from "vitest";
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
      freshness: "catalog",
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
});

describe("public source projections", () => {
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
});
