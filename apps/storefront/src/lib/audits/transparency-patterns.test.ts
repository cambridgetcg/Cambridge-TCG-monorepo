import { describe, expect, it } from "vitest";
import { findDerivedScoreMatches } from "./transparency-patterns";

describe("transparency derived-score signals", () => {
  it.each([
    "trade.commission_rate",
    "estimated_commission_gbp",
    "commissionRate",
    "platformCommission",
    "commission_gbp",
    "Buy and sell — 0% commission",
    "Commission is 5%",
    "Commission rate: 5%",
    "Seller commission 4.5%",
    "4.5% marketplace commission",
    "Cambridge TCG takes no commission, so sellers keep the full price.",
    "The platform charges no commission on auctions.",
    'label="P2P commission"',
    "Commission — none",
  ])("recognises commission values and implementation identifiers: %s", (body) => {
    expect(findDerivedScoreMatches(body)).not.toHaveLength(0);
  });

  it.each([
    "An art commission arrives with a rough sketch.",
    "We have no affiliation, referral arrangement or commission with them.",
    "We take no commission from anyone named here.",
    "The artist was commissioned to illustrate the card.",
  ])("does not mistake ordinary uses of commission for a score: %s", (body) => {
    expect(findDerivedScoreMatches(body)).toEqual([]);
  });

  it("retains the non-commission score signals", () => {
    expect(findDerivedScoreMatches("trust_score severity fraud_signal")).toEqual([
      "trust_score",
      "severity",
      "fraud_signal",
    ]);
  });
});
