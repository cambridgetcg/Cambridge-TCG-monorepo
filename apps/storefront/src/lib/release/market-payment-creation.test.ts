import { describe, expect, it } from "vitest";
import {
  getMarketPaymentCreationAvailability,
  MARKET_PAYMENT_CREATION_ENABLED_MODE,
} from "./market-payment-creation";

describe("market payment creation release gate", () => {
  it("pauses by default and on every unrecognised value", () => {
    expect(getMarketPaymentCreationAvailability()).toMatchObject({
      mode: "paused",
      enabled: false,
      reason: "settlement_upgrade_quiesce",
    });
    expect(getMarketPaymentCreationAvailability("enabled")).toMatchObject({
      enabled: false,
    });
    expect(
      getMarketPaymentCreationAvailability(" ledger-v2-enabled "),
    ).toMatchObject({
      enabled: true,
    });
  });

  it("has one exact reviewed enablement value", () => {
    expect(MARKET_PAYMENT_CREATION_ENABLED_MODE).toBe("ledger-v2-enabled");
  });
});
