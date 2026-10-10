import { describe, it, expect, vi } from "vitest";
import { POST } from "@/app/api/orders/route";
import { isValidTransition } from "@/lib/order-transitions";

const effects = vi.hoisted(() => ({ auth: vi.fn(), transaction: vi.fn(), email: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: effects.auth }));
vi.mock("@/lib/db", () => ({ db: { transaction: effects.transaction } }));
vi.mock("@/lib/email/send-order-email", () => ({ sendOrderEmail: effects.email }));

describe("new wholesale order retirement", () => {
  it("refuses fresh admission without authentication, body parsing, writes or email", async () => {
    const response = await POST();
    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ success: false, code: "NEW_ORDERS_RETIRED" });
    expect(effects.auth).not.toHaveBeenCalled();
    expect(effects.transaction).not.toHaveBeenCalled();
    expect(effects.email).not.toHaveBeenCalled();
  });

  it.each([
    ["quoted", "confirmed"], ["confirmed", "paid"], ["paid", "ordered"],
    ["ordered", "shipped"], ["shipped", "delivered"], ["quoted", "cancelled"], ["paid", "cancelled"],
  ] as const)("preserves prior-order handling from %s to %s", (from, to) => {
    expect(isValidTransition(from, to)).toBe(true);
  });
});
