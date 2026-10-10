import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DEFAULTS } from "@cambridge-tcg/pricing";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), select: vi.fn(), update: vi.fn(), insert: vi.fn(), set: vi.fn(), values: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select, update: mocks.update, insert: mocks.insert } }));
vi.mock("@/lib/db/schema", () => ({ channelPricing: { id: "id", channel: "channel" }, cards: { gbpJpyRate: "rate", lastSyncedAt: "date" } }));
vi.mock("@/lib/channel-pricing", () => ({ invalidateCache: mocks.invalidate }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), asc: vi.fn(), isNotNull: vi.fn(), desc: vi.fn() }));
import { GET, PATCH, POST } from "./route";

function request(method: string, fields: Record<string, unknown>) {
  return new NextRequest("https://example.test/api/admin/channel-pricing", { method,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: "cambridgetcg", label: "Cambridge", ...fields }) });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { role: "admin" } });
  mocks.update.mockReturnValue({ set: mocks.set });
  mocks.set.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockResolvedValue(undefined);
});

describe("wholesale channel pricing contract boundaries", () => {
  it("keeps admin checks before every query/write", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await GET()).status).toBe(403);
    expect((await PATCH(request("PATCH", {}))).status).toBe(403);
    expect((await POST(request("POST", {}))).status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled();
  });
  it.each([{ roundTo: 0.001 }, { roundTo: 0 }, { roundTo: "0.1" },
    { retailMultiplier: -1 }, { vatMultiplier: 0 }, { flatFeeSingles: -1 }])(
    "rejects invalid numeric config on both write paths %j", async fields => {
      expect((await PATCH(request("PATCH", fields))).status).toBe(400);
      expect((await POST(request("POST", fields))).status).toBe(400);
      expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.invalidate).not.toHaveBeenCalled();
    },
  );
  it("retains valid numeric writes and nullable default reset semantics", async () => {
    expect((await PATCH(request("PATCH", { roundTo: 0.1, flatFeeSingles: null }))).status).toBe(200);
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ roundTo: 0.1, flatFeeSingles: null }));
    expect((await POST(request("POST", { roundTo: 0.01 }))).status).toBe(201);
    expect(mocks.invalidate).toHaveBeenCalledTimes(2);
  });
  it("keeps an invalid stored channel inspectable without fabricating its sample prices", async () => {
    mocks.select.mockReturnValueOnce({ from: () => ({ orderBy: async () => [
      { ...DEFAULTS.cambridgetcg!, id: 1, roundTo: 0 }, { ...DEFAULTS.wholesale!, id: 2 },
    ] }) });
    mocks.select.mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [{ gbpJpyRate: 185 }] }) }) }) });
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.configs[0]).toMatchObject({ samples: [], samples_status: "unavailable" });
    expect(body.configs[1].samples).toHaveLength(3);
  });
});
