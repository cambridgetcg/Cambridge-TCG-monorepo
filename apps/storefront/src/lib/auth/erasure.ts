/**
 * Account erasure waits while Stripe may still bill a test subscription the
 * account holds, so recurring billing is never left without a local owner or
 * cancellation path. Two database guards say so: PRISM Signals'
 * (drizzle/0136) and the data-API plans' (drizzle/0142). Each refuses the
 * DELETE with SQLSTATE 23503 and its own message; this module turns that
 * refusal into an answer a person can act on, instead of a bare foreign-key
 * failure. It never cancels anything itself.
 */

export type AccountErasureHold = "data-api-subscription" | "prism-signals-subscription";

const GUARDS: readonly (readonly [message: string, hold: AccountErasureHold])[] = Object.freeze([
  ["cannot erase a data-API subscription before Stripe reports it ended", "data-api-subscription"],
  ["cannot erase PRISM Stripe account mapping before provider subscription termination", "prism-signals-subscription"],
]);

const EXPLANATIONS: Readonly<Record<AccountErasureHold, string>> = Object.freeze({
  "data-api-subscription":
    "The account holds a data-API test subscription that Stripe has not reported ended. Cancel it in Stripe; once the data-API webhook records the cancellation, the account can be deleted.",
  "prism-signals-subscription":
    "The account holds a PRISM Signals test subscription that Stripe has not reported ended. Cancel it in Stripe; once the PRISM webhook records the termination, the account can be deleted.",
});

export class AccountErasureHeldError extends Error {
  readonly code = "ACCOUNT_ERASURE_HELD";
  readonly status = 409;
  readonly hold: AccountErasureHold;

  constructor(hold: AccountErasureHold, options?: { cause?: unknown }) {
    super(EXPLANATIONS[hold], options);
    this.name = "AccountErasureHeldError";
    this.hold = hold;
  }
}

/** Which erasure guard refused a DELETE, or null for any other error. */
export function accountErasureHold(error: unknown): AccountErasureHold | null {
  if (typeof error !== "object" || error === null) return null;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code !== "23503" || typeof message !== "string") return null;
  return GUARDS.find(([text]) => message.includes(text))?.[1] ?? null;
}
