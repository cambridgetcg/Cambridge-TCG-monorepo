import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: session.auth }));

import { GET } from "./route";

describe("GET /api/v1/cards/[sku]/cardrush-history", () => {
  beforeEach(() => session.auth.mockReset());

  it("asks for a session before saying anything", async () => {
    session.auth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  // Written permission exists since 2026-10-28, so the door no longer says it
  // is pending; it says why no observation comes through it.
  it("says what is true now and still returns no observations", async () => {
    session.auth.mockResolvedValue({ user: { email: "member@example.test" } });
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.error.code).toBe("SOURCE_UNAVAILABLE");
    expect(body.error.message).not.toContain("pending");
    expect(body.error.message).toContain("gathered before the written permission recorded 2026-10-28");
    expect(body.error.message).toContain("never through an API or download");
    expect(body.error.details).toMatchObject({ source: "cardrush", observations: [] });
  });
});
