import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  graphql: vi.fn(),
  billingRequest: vi.fn(),
  billingRequire: vi.fn(),
  updatePlanLimit: vi.fn(),
  unlockShop: vi.fn(),
  testMode: vi.fn(),
  trialDays: vi.fn(),
  trialLog: vi.fn(),
}));

vi.mock("~/shopify.server", () => ({ authenticate: { admin: mocks.authenticate } }));
vi.mock("~/db.server", () => ({ default: {} }));
vi.mock("~/utils/plan-access-control.server", () => ({ updatePlanLimit: mocks.updatePlanLimit, unlockShop: mocks.unlockShop }));
vi.mock("~/utils/billing-test-mode.server", () => ({ isTestMode: mocks.testMode, getTestMode: mocks.testMode }));
vi.mock("~/utils/billing-success-detection.server", () => ({ detectNewSubscription: vi.fn() }));
vi.mock("~/services/billing/trial-eligibility.server", () => ({ getTrialDaysForRequest: mocks.trialDays, logTrialAttempt: mocks.trialLog }));

import { action } from "~/routes/app.billing";
import { createSubscription } from "~/services/billing/plan-subscription.server";
import { GraphQLBillingService } from "~/services/billing/graphql-billing.service";

function request(actionName: string) {
  return new Request("https://test.example.com/app/billing", {
    method: "POST",
    body: new URLSearchParams({ action: actionName }),
  });
}

beforeEach(() => {
  mocks.authenticate.mockResolvedValue({
    session: { shop: "existing-shop.myshopify.com" },
    billing: { request: mocks.billingRequest, require: mocks.billingRequire },
    admin: { graphql: mocks.graphql },
  });
});

describe("new paid subscription retirement", () => {
  it.each(["pro", "pro-annual", "max", "max-annual", "ultra", "ultra-annual"])("rejects direct %s subscription requests without contacting billing", async (plan) => {
    const response = await action({ request: request(`subscribe-${plan}`) } as any);
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ success: false, code: "NEW_PAID_SUBSCRIPTIONS_RETIRED" });
    expect(mocks.billingRequest).not.toHaveBeenCalled();
    expect(mocks.graphql).not.toHaveBeenCalled();
    expect(mocks.updatePlanLimit).not.toHaveBeenCalled();
  });

  it("still rejects a crafted unknown paid plan", async () => {
    const response = await action({ request: request("subscribe-invented") } as any);
    expect(response.status).toBe(400);
    expect(mocks.billingRequest).not.toHaveBeenCalled();
  });

  it("blocks both service entry points before provider calls or entitlement writes", async () => {
    const billing = { request: mocks.billingRequest, require: mocks.billingRequire };
    const admin = { graphql: mocks.graphql } as any;
    const direct = await createSubscription("existing-shop.myshopify.com", "pro", billing, admin);
    const graphql = await new GraphQLBillingService(admin).createSubscription({ shop: "existing-shop.myshopify.com", planType: "max", isUpgrade: true });
    expect(direct).toMatchObject({ success: false, code: "NEW_PAID_SUBSCRIPTIONS_RETIRED" });
    expect(graphql).toMatchObject({ success: false, code: "NEW_PAID_SUBSCRIPTIONS_RETIRED" });
    for (const fn of [mocks.billingRequest, mocks.billingRequire, mocks.graphql, mocks.updatePlanLimit, mocks.unlockShop, mocks.testMode, mocks.trialDays, mocks.trialLog]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it("keeps explicit cancellation routed to the existing cancellation service", async () => {
    const cancel = vi.spyOn(GraphQLBillingService.prototype, "cancelSubscription").mockResolvedValueOnce({ success: true });
    const response = await action({ request: request("cancel-subscription") } as any);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, cancelled: true });
    expect(cancel).toHaveBeenCalledWith("existing-shop.myshopify.com");
    expect(mocks.billingRequest).not.toHaveBeenCalled();
    cancel.mockRestore();
  });
});
