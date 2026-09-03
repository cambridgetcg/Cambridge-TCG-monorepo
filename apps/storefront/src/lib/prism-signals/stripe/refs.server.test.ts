import { describe, expect, it, vi } from "vitest";
import {
  derivePrismStripeOpaqueRef,
  newPrismStripeOpaqueRef,
} from "./refs.server";

vi.mock("server-only", () => ({}));

const SECRET = "reference-secret-with-at-least-32-chars";

describe("PRISM Stripe opaque references", () => {
  it("is deterministic, one-way in representation, and domain-separated", () => {
    const raw = "cus_sensitive-provider-id";
    const first = derivePrismStripeOpaqueRef(SECRET, "stripe_customer", raw);
    expect(first).toBe(
      derivePrismStripeOpaqueRef(SECRET, "stripe_customer", raw),
    );
    expect(first).toMatch(/^pf_[A-Za-z0-9_-]{43}$/);
    expect(first).not.toContain(raw);
    expect(first).not.toBe(
      derivePrismStripeOpaqueRef(SECRET, "stripe_subscription", raw),
    );
  });

  it("creates random local correlation refs without provider material", () => {
    const refs = new Set(Array.from({ length: 8 }, newPrismStripeOpaqueRef));
    expect(refs.size).toBe(8);
    for (const ref of refs) expect(ref).toMatch(/^pf_[A-Za-z0-9_-]{32}$/);
  });

  it("rejects weak secrets, invalid namespaces, and unbounded inputs", () => {
    expect(() => derivePrismStripeOpaqueRef("short", "customer", "x")).toThrow();
    expect(() => derivePrismStripeOpaqueRef(SECRET, "Bad.Space", "x")).toThrow();
    expect(() => derivePrismStripeOpaqueRef(SECRET, "customer", "")).toThrow();
  });
});
