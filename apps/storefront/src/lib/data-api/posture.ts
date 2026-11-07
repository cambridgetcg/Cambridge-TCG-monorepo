/** Data-API release posture, read from the environment on every call.
 * Closed and unpublished unless explicitly set; see
 * docs/decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md.
 */
export type DataApiCheckoutIntake = "closed" | "test";

export function dataApiCheckoutIntake(env: NodeJS.ProcessEnv = process.env): DataApiCheckoutIntake {
  return env.DATA_API_CHECKOUT_INTAKE === "test" ? "test" : "closed";
}

export function dataApiPlansPublished(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DATA_API_PLANS_PUBLISHED === "on";
}

/** Whether the derived-data reads (/api/v1/market/*) and the account usage
 * route serve at all. Once the migrations are applied and derivation runs,
 * every member key could otherwise read derived data under "terms pending",
 * before the data-API terms and public copy exist (plan §7). Off by default;
 * while off those routes answer 404 NOT_PUBLISHED before authenticating, so
 * nothing is read and no minute or month is counted. Publishing is Yu's act. */
export function dataApiReadsPublished(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DATA_API_READS === "on";
}

/** What the plan catalogue says about buying. Test-mode checkout admits
 * operators only (users.role admin, testing the round trip), so in neither
 * state can a member buy, and there is no live intake yet: nothing is on sale. */
export type DataApiSaleStatus = "closed" | "test-mode-operators-only";

export function dataApiSaleStatus(env: NodeJS.ProcessEnv = process.env): DataApiSaleStatus {
  return dataApiCheckoutIntake(env) === "test" ? "test-mode-operators-only" : "closed";
}
