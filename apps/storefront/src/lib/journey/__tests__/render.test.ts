import { describe, expect, it } from "vitest";
import { swapSummary } from "../render";

// Regression for the walker finding: swap events fired by BOTH parties
// (address_set, shipped, receipt_confirmed) produced two undistinguished
// "Swap receipt confirmed" rows per moment. The summary now names the
// actor so a reader can tell their own action from the counterparty's.
describe("swapSummary — actor labelling", () => {
  it("names the viewer when they performed a per-party action", () => {
    expect(swapSummary("receipt_confirmed", "proposer", true)).toBe("You confirmed receipt");
    expect(swapSummary("shipped", "recipient", true)).toBe("You marked a parcel shipped");
    expect(swapSummary("address_set", "proposer", true)).toBe("You added a shipping address");
  });

  it("names the other collector when they performed it", () => {
    expect(swapSummary("receipt_confirmed", "proposer", false)).toBe(
      "The other collector confirmed receipt",
    );
    expect(swapSummary("shipped", "recipient", false)).toBe(
      "The other collector marked a parcel shipped",
    );
  });

  it("keeps proposal wording viewer-relative (role), not actor-relative", () => {
    expect(swapSummary("proposed", "proposer")).toBe("You proposed a swap");
    expect(swapSummary("proposed", "recipient")).toBe("You received a swap proposal");
  });

  it("labels the automatic shipping transition as automatic, not a person", () => {
    expect(swapSummary("shipping", "proposer", false)).toBe(
      "Both addresses in — shipping began (automatic)",
    );
  });

  it("humanizes unknown actions instead of leaking the raw kind", () => {
    expect(swapSummary("some_new_action", null)).toBe("Swap some new action");
  });
});
