import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("retired retail confirmation boundary", () => {
  it("rejects non-retail sessions before recording or rendering confirmation", () => {
    const ownershipGuard = source.indexOf("if (!isLegacyRetailCheckoutSession(session)) notFound();");
    const writer = source.indexOf("await recordOrderFromStripeSession(session)");
    const confirmation = source.indexOf("Order Confirmed!");

    expect(ownershipGuard).toBeGreaterThan(0);
    expect(ownershipGuard).toBeLessThan(writer);
    expect(writer).toBeLessThan(confirmation);
  });
});
