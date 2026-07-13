import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAdmin: vi.fn(),
  query: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@cambridge-tcg/email", () => ({ sendMail: mocks.sendMail }));

import { POST } from "./route";

beforeEach(() => {
  mocks.isAdmin.mockReset();
  mocks.query.mockReset();
  mocks.sendMail.mockReset();
});

describe("OG claim publication boundary", () => {
  it("stops non-admin submissions before reading the body or claim database", async () => {
    mocks.isAdmin.mockResolvedValue(false);
    const request = {
      json: vi.fn(() => {
        throw new Error("body must not be inspected");
      }),
    } as unknown as Request;

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body).toMatchObject({
      status: "og-claims-disabled",
      body_inspected: false,
      claim_database_accessed: false,
    });
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("keeps explicit admin rejection available", async () => {
    mocks.isAdmin.mockResolvedValue(true);
    mocks.query.mockResolvedValue({ rows: [] });

    const response = await POST(new Request("https://cambridgetcg.com/api/og/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject", claimId: "claim-1" }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "rejected" });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
});
