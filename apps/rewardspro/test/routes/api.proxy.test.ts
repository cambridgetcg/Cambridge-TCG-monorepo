/**
 * Proxy endpoint response shape tests
 *
 * Validates that ALL error responses from the proxy follow the standardized shape:
 *   { success: false, error: string, message: string }
 *
 * And all success responses include:
 *   { success: true, ... }
 *
 * These tests catch field name mismatches between frontend and backend
 * (e.g. the data.message vs data.error bug that masked raffle purchase errors).
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const PROXY_FILE = path.resolve(__dirname, "../../app/routes/api.proxy.$.tsx");

describe("api.proxy.$.tsx response shape contract", () => {
  let source: string;

  // Read the source file once — these are static analysis tests
  beforeAll(() => {
    source = fs.readFileSync(PROXY_FILE, "utf-8");
  });

  it("should have a proxyError helper defined", () => {
    expect(source).toContain("function proxyError(");
  });

  it("proxyError helper should include both error and message fields", () => {
    // Extract the proxyError function body
    const fnMatch = source.match(/function proxyError\([^)]*\)\s*\{([\s\S]*?)\n\}/);
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![1];
    expect(fnBody).toContain("error:");
    expect(fnBody).toContain("message:");
  });

  it("POST handler (action) should use proxyError for all error responses", () => {
    // Extract the action function body (POST handler)
    const actionStart = source.indexOf("export async function action(");
    expect(actionStart).toBeGreaterThan(-1);
    const actionSource = source.slice(actionStart);

    // Find all lines with success: false in the action handler
    const lines = actionSource.split("\n");
    const violations: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip the proxyError function definition itself
      if (line.includes("function proxyError")) continue;
      // Check for raw json error returns (not using proxyError)
      if (line.includes("success: false") && line.includes("json(") && !line.includes("proxyError")) {
        violations.push(`Action line ${i + 1}: ${line.trim()}`);
      }
    }

    expect(violations).toEqual([]);
  });
});

describe("Shopify GID assertion helper", () => {
  // Import dynamically to avoid module resolution issues in test
  let assertShopifyGid: (id: string, label?: string) => void;
  let isShopifyGid: (id: string) => boolean;
  let toShopifyGid: (id: string | number | null | undefined, resource: string) => string | null;

  beforeAll(async () => {
    const mod = await import("../utils/shopify-id-normalizer");
    assertShopifyGid = mod.assertShopifyGid;
    isShopifyGid = mod.isShopifyGid;
    toShopifyGid = mod.toShopifyGid;
  });

  describe("assertShopifyGid", () => {
    it("should accept valid Shopify GIDs", () => {
      expect(() => assertShopifyGid("gid://shopify/Product/12345")).not.toThrow();
      expect(() => assertShopifyGid("gid://shopify/ProductVariant/67890")).not.toThrow();
      expect(() => assertShopifyGid("gid://shopify/Collection/1")).not.toThrow();
    });

    it("should reject database UUIDs", () => {
      expect(() => assertShopifyGid("ad7ca9e1-21a0-44fc-adb0-4d17dc7902da", "Product")).toThrow(
        /Invalid Shopify GID.*database UUID/
      );
    });

    it("should reject raw numeric IDs", () => {
      expect(() => assertShopifyGid("12345", "Product")).toThrow(
        /Invalid Shopify GID.*raw numeric ID/
      );
    });

    it("should reject empty strings", () => {
      expect(() => assertShopifyGid("", "Product")).toThrow(/Invalid Shopify GID/);
    });
  });

  describe("isShopifyGid", () => {
    it("should return true for valid GIDs", () => {
      expect(isShopifyGid("gid://shopify/Product/12345")).toBe(true);
    });

    it("should return false for UUIDs", () => {
      expect(isShopifyGid("ad7ca9e1-21a0-44fc-adb0-4d17dc7902da")).toBe(false);
    });

    it("should return false for numeric IDs", () => {
      expect(isShopifyGid("12345")).toBe(false);
    });
  });

  describe("toShopifyGid", () => {
    it("should pass through valid GIDs", () => {
      expect(toShopifyGid("gid://shopify/Product/123", "Product")).toBe("gid://shopify/Product/123");
    });

    it("should convert numeric IDs to GIDs", () => {
      expect(toShopifyGid("123", "Product")).toBe("gid://shopify/Product/123");
      expect(toShopifyGid(456, "ProductVariant")).toBe("gid://shopify/ProductVariant/456");
    });

    it("should return null for UUIDs (cannot safely convert)", () => {
      expect(toShopifyGid("ad7ca9e1-21a0-44fc-adb0-4d17dc7902da", "Product")).toBeNull();
    });

    it("should return null for null/undefined/empty", () => {
      expect(toShopifyGid(null, "Product")).toBeNull();
      expect(toShopifyGid(undefined, "Product")).toBeNull();
      expect(toShopifyGid("", "Product")).toBeNull();
    });
  });
});
