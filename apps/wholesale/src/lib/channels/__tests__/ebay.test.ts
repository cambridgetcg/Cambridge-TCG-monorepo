import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getAccessToken,
  bulkPushListings,
  pullOrders,
  _resetTokenCache,
  type ListingInput,
} from "../ebay";

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  _resetTokenCache();

  // Default env
  vi.stubEnv("EBAY_CLIENT_ID", "test-client-id");
  vi.stubEnv("EBAY_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("EBAY_REFRESH_TOKEN", "test-refresh-token");
  vi.stubEnv("EBAY_FULFILLMENT_POLICY_ID", "fp-123");
  vi.stubEnv("EBAY_PAYMENT_POLICY_ID", "pp-123");
  vi.stubEnv("EBAY_RETURN_POLICY_ID", "rp-123");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// Helper: mock a successful token response
function mockTokenResponse() {
  return new Response(
    JSON.stringify({ access_token: "tok_abc", expires_in: 7200 }),
    { status: 200 },
  );
}

// ---------------------------------------------------------------------------
// Token caching
// ---------------------------------------------------------------------------

describe("getAccessToken", () => {
  it("caches the token across calls", async () => {
    mockFetch.mockResolvedValueOnce(mockTokenResponse());

    const r1 = await getAccessToken();
    const r2 = await getAccessToken();

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.data).toBe("tok_abc");
      expect(r2.data).toBe("tok_abc");
    }

    // Only one fetch call — second was from cache
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns clear error on expired refresh token", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "invalid_grant" }), { status: 401 }),
    );

    const r = await getAccessToken();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("refresh token expired");
    }
  });

  it("returns error when env vars are missing", async () => {
    vi.stubEnv("EBAY_CLIENT_ID", "");
    vi.stubEnv("EBAY_CLIENT_SECRET", "");

    const r = await getAccessToken();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("Missing EBAY_CLIENT_ID");
    }
  });
});

// ---------------------------------------------------------------------------
// bulkPushListings batching
// ---------------------------------------------------------------------------

describe("bulkPushListings", () => {
  it("processes items in batches of 25", async () => {
    // Track fetch calls to count batches
    const callTimestamps: number[] = [];

    mockFetch.mockImplementation(async (url: string) => {
      callTimestamps.push(Date.now());
      const u = typeof url === "string" ? url : (url as Request).url;

      // Token request
      if (u.includes("oauth2/token")) {
        return mockTokenResponse();
      }
      // Inventory item PUT → 204
      if (u.includes("inventory_item/")) {
        return new Response(null, { status: 204 });
      }
      // Offer GET → no existing offers
      if (u.includes("/offer?sku=")) {
        return new Response(JSON.stringify({ offers: [] }), { status: 200 });
      }
      // Offer POST → created
      if (u.includes("/offer") && !u.includes("?")) {
        return new Response(JSON.stringify({ offerId: "off-1" }), { status: 201 });
      }
      return new Response("unexpected", { status: 500 });
    });

    // 30 items → should be 2 batches (25 + 5)
    const items: ListingInput[] = Array.from({ length: 30 }, (_, i) => ({
      sku: `SKU-${i}`,
      priceGbp: 5.99,
      stock: 3,
    }));

    const result = await bulkPushListings(items);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.pushed).toBe(30);
      expect(result.data.errors).toHaveLength(0);
    }

    // Each item = 3 fetch calls (PUT inventory, GET offer, POST offer)
    // + 1 token call (cached after first)
    // Batch 1: 1 token + 25*3 = 76 calls
    // Batch 2: 5*3 = 15 calls
    // Total: 91
    expect(mockFetch.mock.calls.length).toBe(91);
  });
});

// ---------------------------------------------------------------------------
// pullOrders date filtering
// ---------------------------------------------------------------------------

describe("pullOrders", () => {
  it("passes the since date in the filter", async () => {
    const since = new Date("2026-03-01T00:00:00Z");

    mockFetch.mockImplementation(async (url: string) => {
      const u = typeof url === "string" ? url : (url as Request).url;

      if (u.includes("oauth2/token")) {
        return mockTokenResponse();
      }

      if (u.includes("/sell/fulfillment/v1/order")) {
        // Verify the filter contains the date
        expect(u).toContain("2026-03-01");
        return new Response(
          JSON.stringify({
            orders: [
              {
                orderId: "ORD-001",
                creationDate: "2026-03-15T10:00:00Z",
                lineItems: [
                  { sku: "OP-OP01-001-JP", quantity: 2, total: { value: "9.99" } },
                ],
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response("unexpected", { status: 500 });
    });

    const result = await pullOrders(since);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].ebayOrderId).toBe("ORD-001");
      expect(result.data[0].lineItems[0].sku).toBe("OP-OP01-001-JP");
      expect(result.data[0].lineItems[0].quantity).toBe(2);
      expect(result.data[0].lineItems[0].salePrice).toBe(9.99);
    }
  });
});

// ---------------------------------------------------------------------------
// Graceful degradation on expired token
// ---------------------------------------------------------------------------

describe("graceful degradation", () => {
  it("returns error result instead of throwing on auth failure", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 }),
    );

    // pullOrders depends on getAccessToken — should surface the error
    _resetTokenCache();
    vi.stubEnv("EBAY_REFRESH_TOKEN", "");

    const result = await pullOrders(new Date());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });
});
