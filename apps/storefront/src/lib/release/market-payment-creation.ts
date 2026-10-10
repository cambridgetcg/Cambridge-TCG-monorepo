export const MARKET_PAYMENT_CREATION_ENABLED_MODE =
  "ledger-v2-enabled" as const;

export interface MarketPaymentCreationAvailability {
  mode: "paused" | typeof MARKET_PAYMENT_CREATION_ENABLED_MODE;
  enabled: boolean;
  reason: "settlement_upgrade_quiesce" | null;
}

/**
 * Fail closed across rolling deployments. Absence, whitespace, and every
 * unrecognised value pause creation of new P2P provider sessions.
 *
 * Existing fulfilment/remedy routes do not read this gate.
 */
export function getMarketPaymentCreationAvailability(
  rawMode = process.env.MARKET_PAYMENT_CREATION_MODE,
): MarketPaymentCreationAvailability {
  const mode = rawMode?.trim();
  if (mode !== MARKET_PAYMENT_CREATION_ENABLED_MODE) {
    return {
      mode: "paused",
      enabled: false,
      reason: "settlement_upgrade_quiesce",
    };
  }
  return {
    mode,
    enabled: true,
    reason: null,
  };
}
