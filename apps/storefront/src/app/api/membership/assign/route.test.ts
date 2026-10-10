import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAdmin: vi.fn(),
  query: vi.fn(),
  recalculateTier: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/membership/db", () => ({
  recalculateTier: mocks.recalculateTier,
}));

import { POST } from "./route";

beforeEach(() => {
  mocks.isAdmin.mockReset();
  mocks.query.mockReset();
  mocks.recalculateTier.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("manual membership account-admission boundary", () => {
  it("cannot create a user while production admission is paused", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ACCOUNT_ADMISSION_MODE", "paused");
    mocks.isAdmin.mockResolvedValue(true);
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: "og-tier", name: "OG" }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await POST(new Request(
      "https://cambridgetcg.com/api/membership/assign",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "new@example.com", tierName: "OG" }),
      },
    ));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toMatchObject({
      code: "ACCOUNT_ADMISSION_PAUSED",
    });
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.query.mock.calls.some(([sql]) => (
      String(sql).includes("INSERT INTO users")
    ))).toBe(false);
  });

  it("preserves tier assignment for an existing user while admission is paused", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ACCOUNT_ADMISSION_MODE", "paused");
    mocks.isAdmin.mockResolvedValue(true);
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: "og-tier", name: "OG" }] })
      .mockResolvedValueOnce({ rows: [{ id: "existing-user" }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await POST(new Request(
      "https://cambridgetcg.com/api/membership/assign",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "existing@example.com",
          tierName: "OG",
        }),
      },
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      userId: "existing-user",
      created: false,
      tier: "OG",
    });
    expect(mocks.query).toHaveBeenCalledTimes(3);
  });
});
