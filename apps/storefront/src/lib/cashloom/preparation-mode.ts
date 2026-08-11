import "server-only";

export type CashloomPaymentPreparationMode = "disabled" | "record_only";

/**
 * New writes are opt-in on every deployment. Reads remain available through
 * the route so disabling the writer never hides already-recorded evidence.
 */
export function resolveCashloomPaymentPreparationMode(
  configured = process.env.CASHLOOM_PAYMENT_PREPARATION_MODE,
): CashloomPaymentPreparationMode {
  return configured?.trim() === "record_only" ? "record_only" : "disabled";
}
