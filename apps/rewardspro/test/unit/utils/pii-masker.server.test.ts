import { afterEach, describe, expect, it, vi } from "vitest";
import {
  privacySafeConsole,
  privacySafeLogTemplate,
  safeErrorDiagnostic,
  safeLogData,
  safeLog,
  safeLogMessage,
} from "~/utils/pii-masker";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("safeErrorDiagnostic", () => {
  it("keeps an error class without its sensitive message or stack", () => {
    const diagnostic = safeErrorDiagnostic(
      new TypeError("token=secret-value&customer=someone@example.com"),
    );

    expect(diagnostic).toEqual({ errorClass: "TypeError" });
    expect(JSON.stringify(diagnostic)).not.toContain("secret-value");
    expect(JSON.stringify(diagnostic)).not.toContain("someone@example.com");
  });

  it("keeps a response status without headers or redirect locations", () => {
    const diagnostic = safeErrorDiagnostic(
      new Response(null, {
        status: 302,
        headers: { Location: "https://example.test/callback?token=secret-value" },
      }),
    );

    expect(diagnostic).toEqual({ errorClass: "Response", status: 302 });
    expect(JSON.stringify(diagnostic)).not.toContain("example.test");
    expect(JSON.stringify(diagnostic)).not.toContain("secret-value");
  });

  it("classifies thrown primitive values without preserving their contents", () => {
    expect(safeErrorDiagnostic("secret-value")).toEqual({
      errorClass: "string",
    });
  });

  it("does not trust a custom error name as a diagnostic class", () => {
    const error = new Error("ordinary message");
    error.name = "token-secret-value";

    expect(safeErrorDiagnostic(error)).toEqual({ errorClass: "Error" });
  });

  it("reduces identifiers and content to presence metadata", () => {
    expect(
      safeLogData({
        shop: "merchant.myshopify.com",
        customerId: "customer-123",
        email: "someone@example.com",
        question: "Where is order #1234?",
        eventType: "points_earned",
        status: 502,
        error: new TypeError("Authorization: Bearer secret-value"),
      }),
    ).toEqual({
      shopPresent: true,
      shopLength: 22,
      customerIdPresent: true,
      customerIdLength: 12,
      emailPresent: true,
      emailLength: 19,
      questionPresent: true,
      questionLength: 21,
      eventType: "points_earned",
      status: 502,
      errorClass: "TypeError",
    });
  });

  it("keeps numbers only for explicitly operational scalar keys", () => {
    expect(
      safeLogData({
        count: 3,
        duration: 125,
        orderNumber: 8675309,
        unknownNumericField: 123456,
        values: [42],
      }),
    ).toEqual({
      count: 3,
      duration: 125,
      orderNumberPresent: true,
      unknownNumericField: {
        numberPresent: true,
        numberFinite: true,
      },
      values: [{ numberPresent: true, numberFinite: true }],
    });

    expect(safeLogData(123456)).toEqual({
      numberPresent: true,
      numberFinite: true,
    });
  });

  it("does not emit timestamps or business-object content from structured data", () => {
    expect(
      safeLogData({
        createdAt: new Date("2026-07-23T12:34:56.000Z"),
        productHandle: "secret-product-handle",
        productType: "merchant-authored-type",
        productStatus: "ACTIVE",
        variantSku: "SECRET-SKU",
        tierLabel: "VIP whales",
        lineItemProperties: "engraving=someone@example.com",
        productCount: 2,
      }),
    ).toEqual({
      createdAt: { datePresent: true },
      productHandlePresent: true,
      productHandleLength: 21,
      productTypePresent: true,
      productTypeLength: 22,
      productStatus: "ACTIVE",
      variantSkuPresent: true,
      variantSkuLength: 10,
      tierLabelPresent: true,
      tierLabelLength: 10,
      lineItemPropertiesPresent: true,
      lineItemPropertiesLength: 29,
      productCount: 2,
    });
  });

  it("does not retain dynamic path segments", () => {
    expect(
      safeLogData({
        pathname: "/customers/12345/orders/98765",
        method: "GET",
      }),
    ).toEqual({
      pathnamePresent: true,
      pathnameLength: 29,
      method: "GET",
    });
  });

  it("redacts sensitive values embedded in diagnostic messages", () => {
    const message = safeLogMessage(
      "Failed for shop merchant.myshopify.com: https://example.test/callback?token=secret",
    );

    expect(message).not.toContain("merchant.myshopify.com");
    expect(message).not.toContain("example.test");
    expect(message).not.toContain("secret");
  });

  it("sanitizes console data before emitting it", () => {
    const consoleError = vi
      .spyOn(globalThis.console, "error")
      .mockImplementation(() => undefined);

    privacySafeConsole.error("Provider failed", {
      responseBody: "customer=someone@example.com&token=secret-value",
      status: 401,
    });

    expect(consoleError).toHaveBeenCalledWith("Provider failed", {
      responseBodyPresent: true,
      responseBodyLength: 47,
      status: 401,
    });
  });

  it("sanitizes interpolated identifiers and content before concatenation", () => {
    const message = privacySafeLogTemplate`Line Item ID: ${12345}; SKU: ${
      "SECRET-SKU"
    }; Title: ${"Customer special order"}; Price: ${99.95}; Found ${3} items; status: ${
      "complete"
    }`;

    expect(message).toContain("Line Item ID: [redacted]");
    expect(message).toContain("SKU: [redacted]");
    expect(message).toContain("Title: [redacted]");
    expect(message).toContain("Price: [redacted]");
    expect(message).toContain("Found 3 items");
    expect(message).toContain("status: complete");
    expect(message).not.toContain("12345");
    expect(message).not.toContain("SECRET-SKU");
    expect(message).not.toContain("Customer special order");
    expect(message).not.toContain("99.95");
  });

  it("keeps only presence metadata for unlabelled interpolated strings", () => {
    const message = privacySafeLogTemplate`Provider detail ${"someone@example.com"}`;

    expect(message).toBe("Provider detail [value present; length=19]");
    expect(message).not.toContain("someone@example.com");
  });
});

describe("safeLog", () => {
  it("logs through the privacy-safe layer, so raw emails never reach the console", () => {
    const consoleLog = vi
      .spyOn(globalThis.console, "log")
      .mockImplementation(() => undefined);

    safeLog("Sent reminder to someone@example.com", {
      email: "someone@example.com",
      count: 2,
    });

    const logged = JSON.stringify(consoleLog.mock.calls);
    expect(logged).not.toContain("someone@example.com");
    expect(logged).toContain("[email redacted]");
    expect(consoleLog).toHaveBeenCalledWith(
      "Sent reminder to [email redacted]",
      { emailPresent: true, emailLength: 19, count: 2 },
    );
  });
});
