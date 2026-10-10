import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("retail order-confirmation ownership guard", () => {
  it("checks local market and dedicated-flow ownership before the backup order write", () => {
    const localBindingCheck = source.indexOf("await findStripeMarketCheckoutBinding(session)");
    const dedicatedCheck = source.indexOf('checkoutSessionOwner(session) !== "retail"');
    const retailWrite = source.indexOf("await recordOrderFromStripeSession(session)");

    expect(localBindingCheck).toBeGreaterThan(-1);
    expect(dedicatedCheck).toBeGreaterThan(localBindingCheck);
    expect(retailWrite).toBeGreaterThan(dedicatedCheck);
    expect(source).not.toMatch(/expand:\s*\[[^\]]*collected_information/);
  });
});
