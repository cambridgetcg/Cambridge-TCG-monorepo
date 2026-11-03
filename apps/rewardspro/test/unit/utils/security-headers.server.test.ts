import { describe, expect, it } from "vitest";
import { addSecurityHeaders } from "~/utils/security-headers.server";

describe("addSecurityHeaders", () => {
  it("sets nosniff and a referrer policy without touching the frame-ancestors CSP", () => {
    const csp =
      "frame-ancestors https://test-shop.myshopify.com https://admin.shopify.com;";
    const headers = new Headers({ "Content-Security-Policy": csp });

    addSecurityHeaders(headers);

    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Content-Security-Policy")).toBe(csp);
    expect(headers.has("X-Frame-Options")).toBe(false);
  });
});
