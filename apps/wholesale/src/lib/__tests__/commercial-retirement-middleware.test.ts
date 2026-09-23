import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/auth", () => ({ auth: (handler: unknown) => handler }));
import middleware from "@/middleware";

describe("retired order admission at the host boundary", () => {
  it.each(["tcg-wholesale.vercel.app", "wholesaletcgdirect.com", "admin.wholesaletcgdirect.com"])("refuses on %s without redirecting or authenticating", async host => {
    const request = new NextRequest(`https://${host}/api/orders`, {
      method: "POST", headers: { host, origin: `https://${host}` }, body: "{}",
    });
    const response = await (middleware as any)(request);
    expect(response.status).toBe(410);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.json()).toMatchObject({ code: "NEW_ORDERS_RETIRED" });
  });

  it("keeps authentication on prior-order mutation paths", async () => {
    const host = "tcg-wholesale.vercel.app";
    const request = new NextRequest(`https://${host}/api/orders/123/status`, {
      method: "PATCH", headers: { host, origin: `https://${host}` }, body: "{}",
    });
    const response = await (middleware as any)(request);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });
});
