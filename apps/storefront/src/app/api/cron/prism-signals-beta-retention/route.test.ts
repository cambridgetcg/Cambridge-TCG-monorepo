import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  purge: vi.fn(),
  query: vi.fn(),
}));

vi.mock("server-only", () => ({}));
// The run is recorded: a test must never reach the database DATABASE_URL names.
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/cron-auth", () => ({ requireCronAuth: mocks.auth }));
vi.mock("@/lib/prism-signals/beta-interest.server", () => ({
  purgeInactiveProductBetaInterests: mocks.purge,
}));

function request() {
  return new Request(
    "https://cambridgetcg.com/api/cron/prism-signals-beta-retention",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.auth.mockReturnValue(null);
  mocks.purge.mockResolvedValue(4);
});

describe("PRISM Signals beta retention cron", () => {
  it("runs no storage code when cron auth denies", async () => {
    const denied = new Response("denied", { status: 401 });
    mocks.auth.mockReturnValue(denied);
    const response = await GET(request());
    expect(response).toBe(denied);
    expect(mocks.purge).not.toHaveBeenCalled();
  });

  it("returns only an aggregate deletion count without an intake-mode gate", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ ok: true, deleted: 4 });
    expect(mocks.purge).toHaveBeenCalledOnce();
  });

  it("records whether it worked, never how many it deleted", async () => {
    await GET(request());
    mocks.purge.mockRejectedValueOnce(new Error("missing table"));
    await GET(request());
    const recorded = mocks.query.mock.calls.filter(([sql]) => sql.startsWith("INSERT INTO ops_job_outcomes")).map(([, params]) => [params[0], ...params.slice(3)]);
    expect(recorded).toEqual([["retention/prism-beta", 200, "ran", "{}"], ["retention/prism-beta", 503, "unavailable:failed", "{}"]]);
  });

  it("fails with 503 rather than pretending cleanup happened", async () => {
    mocks.purge.mockRejectedValueOnce(new Error("missing table"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      error: "PRISM Signals beta retention storage is unavailable.",
    });
  });
});
