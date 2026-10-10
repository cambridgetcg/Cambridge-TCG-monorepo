import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CheckoutReturnStatus from "./CheckoutReturnStatus";

describe("PRISM Stripe Checkout return", () => {
  it("renders a non-granting unknown state before owner verification", () => {
    const markup = renderToStaticMarkup(<CheckoutReturnStatus />);
    expect(markup).toContain("Checking owner status");
    expect(markup).toContain("No Free, All, payment, or access conclusion");
    expect(markup).not.toContain("All test access is active");
    expect(markup).not.toMatch(/session_id|checkout session/i);
  });
});
