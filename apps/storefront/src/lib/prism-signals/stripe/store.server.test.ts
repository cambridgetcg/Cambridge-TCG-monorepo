import { describe, expect, it, vi } from "vitest";
import type { ProductFlowRuntimeQueryV1 } from "@/lib/product-flow-runtime/postgres.server";
import type {
  PrismStripeSandboxConfigV1,
  PrismStripeSandboxPublicPostureV1,
} from "./config.server";
import {
  findPrismStripePortalBinding,
  readPrismStripeOwnerStatus,
} from "./store.server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ query: vi.fn(), transaction: vi.fn() }));

const posture: PrismStripeSandboxPublicPostureV1 = {
  configured: true,
  processing_available: true,
  checkout_available: true,
  portal_available: true,
  reason: "available",
};

describe("PRISM Stripe safe owner status", () => {
  it("reports no paid entitlement and no checkout for an ineligible account", async () => {
    const query: ProductFlowRuntimeQueryV1 = async () => ({ rows: [], rowCount: 0 });
    const status = await readPrismStripeOwnerStatus(
      {
        userId: "11111111-1111-4111-8111-111111111111",
        evaluatedAt: "2026-09-03T08:00:00.000Z",
        posture,
      },
      { query },
    );
    expect(status).toMatchObject({
      plan: "free",
      access: { allowed: false, reason: "no_paid_entitlement" },
      checkout: { available: false, reason: "not_eligible" },
      portal: { available: false },
    });
  });

  it("does not advertise a second checkout while a subscription is pending", async () => {
    const query: ProductFlowRuntimeQueryV1 = async () => ({
      rows: [{
        beta_eligible: true,
        stripe_customer_id: "cus_private123",
        snapshot_payload: null,
        subscription_status: "incomplete",
        cancel_at_period_end: false,
        current_period_end: null,
      }],
      rowCount: 1,
    });
    const status = await readPrismStripeOwnerStatus(
      {
        userId: "11111111-1111-4111-8111-111111111111",
        evaluatedAt: "2026-09-03T08:00:00.000Z",
        posture,
      },
      { query },
    );
    expect(status).toMatchObject({
      plan: "all",
      access: { allowed: false },
      subscription: { status: "incomplete" },
      checkout: { available: false, reason: "existing_subscription" },
      portal: { available: true },
    });
    expect(JSON.stringify(status)).not.toMatch(/cus_|pf_|price_|sub_/);
  });

  it("does not read storage for a portal when portal configuration is absent", async () => {
    const query = vi.fn();
    const config = { portalConfigurationId: null } as PrismStripeSandboxConfigV1;
    await expect(findPrismStripePortalBinding(
      { userId: "user", config },
      { query },
    )).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
});
