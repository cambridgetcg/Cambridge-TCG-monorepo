import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const listSource = readFileSync(
  new URL("../../app/account/trades/page.tsx", import.meta.url),
  "utf8",
);
const detailSource = readFileSync(
  new URL("../../app/account/trades/[id]/page.tsx", import.meta.url),
  "utf8",
);

describe("market payment-window UI contract", () => {
  it("drives all Pay eligibility from a live fail-closed clock", () => {
    expect(listSource).toContain("setPaymentClockNow(Date.now()), 1_000");
    expect(listSource.match(/isPaymentWindowOpen\(/g)?.length).toBeGreaterThanOrEqual(2);
    expect(detailSource).toContain("setPaymentClockNow(Date.now()), 1_000");
    expect(detailSource).toContain("!isPaymentWindowOpen(");
    expect(`${listSource}\n${detailSource}`).not.toContain("will cancel shortly");
  });

  it("blocks repeated clicks after a failed start and announces detail errors", () => {
    expect(listSource).toContain("Boolean(payErrors[t.id])");
    expect(listSource).toContain("Boolean(payErrors[trade.id])");
    expect(detailSource).toContain("payingNow || Boolean(payError)");
    expect(detailSource).toMatch(/payError[\s\S]{0,180}role="alert"/);
  });
});
