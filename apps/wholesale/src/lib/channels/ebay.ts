/**
 * eBay Inventory + Fulfillment API client
 *
 * OAuth: refresh_token for sell operations, client_credentials fallback for public.
 * All public functions return Result<T> — never throw.
 *
 * TODO: The refresh_token likely needs regeneration via the eBay OAuth consent
 * flow (Developer Portal → User Tokens → Get Token from eBay via Your Application).
 * Tokens expire every 18 months; if expired, getAccessToken() returns a clear error.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface EbayLineItem {
  sku: string;
  quantity: number;
  salePrice: number;
}

export interface EbayOrder {
  ebayOrderId: string;
  lineItems: EbayLineItem[];
  createdDate: string;
}

export interface ListingInput {
  sku: string;
  priceGbp: number;
  stock: number;
}

export interface PushOptions {
  categoryId?: string;
  fulfillmentPolicyId?: string;
  paymentPolicyId?: string;
  returnPolicyId?: string;
  merchantLocationKey?: string;
  marketplaceId?: string;
}

export interface CurrentListing {
  sku: string;
  priceGbp: number;
  stock: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EBAY_API = "https://api.ebay.com";
const EBAY_AUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const SELL_SCOPES = [
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
].join(" ");
const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 500;

// ---------------------------------------------------------------------------
// Token cache (module-level singleton)
// ---------------------------------------------------------------------------

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let cachedToken: CachedToken | null = null;

/** Visible for testing — resets the module-level token cache. */
export function _resetTokenCache(): void {
  cachedToken = null;
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

export async function getAccessToken(): Promise<Result<string>> {
  // Return cached token if >5 min remaining
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return { ok: true, data: cachedToken.accessToken };
  }

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const refreshToken = process.env.EBAY_REFRESH_TOKEN;

  if (!clientId || !clientSecret) {
    return { ok: false, error: "Missing EBAY_CLIENT_ID or EBAY_CLIENT_SECRET env vars" };
  }

  const authHeader = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;

  // Prefer refresh_token (required for sell operations)
  if (refreshToken) {
    const result = await requestToken(authHeader, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: SELL_SCOPES,
    });
    if (result.ok) return result;

    // If the refresh token is expired/invalid, return a clear message
    if (result.error.includes("invalid_grant") || result.error.includes("401")) {
      return {
        ok: false,
        error:
          "eBay refresh token expired or invalid — regenerate via OAuth consent flow at https://developer.ebay.com/my/keys",
      };
    }
    return result;
  }

  // Fallback: client_credentials (public data only — no sell operations)
  return requestToken(authHeader, {
    grant_type: "client_credentials",
    scope: "https://api.ebay.com/oauth/api_scope",
  });
}

async function requestToken(
  authHeader: string,
  params: Record<string, string>,
): Promise<Result<string>> {
  try {
    const res = await fetch(EBAY_AUTH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: authHeader,
      },
      body: new URLSearchParams(params),
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `eBay OAuth failed (${res.status}): ${body}` };
    }

    const data = await res.json();
    cachedToken = {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return { ok: true, data: cachedToken.accessToken };
  } catch (err) {
    return { ok: false, error: `eBay OAuth request failed: ${err}` };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ebayFetch(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<Response> {
  return fetch(`${EBAY_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Content-Language": "en-GB",
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function defaultPushOptions(): Required<PushOptions> {
  return {
    categoryId: process.env.EBAY_CATEGORY_ID_SINGLES || "183454",
    fulfillmentPolicyId: process.env.EBAY_FULFILLMENT_POLICY_ID || "",
    paymentPolicyId: process.env.EBAY_PAYMENT_POLICY_ID || "",
    returnPolicyId: process.env.EBAY_RETURN_POLICY_ID || "",
    merchantLocationKey: process.env.EBAY_MERCHANT_LOCATION_KEY || "uk",
    marketplaceId: "EBAY_GB",
  };
}

// ---------------------------------------------------------------------------
// Inventory API — price + stock push
// ---------------------------------------------------------------------------

/**
 * Upsert a single eBay inventory item then ensure an offer exists with
 * the given price and availability.
 */
export async function pushListing(
  sku: string,
  priceGbp: number,
  stock: number,
  options?: PushOptions,
): Promise<Result<{ sku: string; offerId?: string }>> {
  const tokenResult = await getAccessToken();
  if (!tokenResult.ok) return tokenResult;
  const token = tokenResult.data;

  const opts = { ...defaultPushOptions(), ...options };

  // 1. Create/update inventory item
  const itemRes = await ebayFetch(
    `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
    token,
    {
      method: "PUT",
      body: JSON.stringify({
        availability: {
          shipToLocationAvailability: { quantity: stock },
        },
        condition: "NEW",
        product: {
          title: sku, // eBay requires a title — SKU as placeholder
          aspects: { Language: ["Japanese"] },
        },
      }),
    },
  );

  if (!itemRes.ok && itemRes.status !== 204) {
    const body = await itemRes.text();
    return { ok: false, error: `Inventory item PUT failed (${itemRes.status}): ${body}` };
  }

  // 2. Check for existing offer
  const offersRes = await ebayFetch(
    `/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`,
    token,
  );

  let offerId: string | undefined;

  if (offersRes.ok) {
    const offersData = await offersRes.json();
    const existing = offersData.offers?.[0];
    if (existing) {
      offerId = existing.offerId;
      // Update existing offer
      const updateRes = await ebayFetch(
        `/sell/inventory/v1/offer/${offerId}`,
        token,
        {
          method: "PUT",
          body: JSON.stringify({
            ...existing,
            pricingSummary: {
              price: { value: priceGbp.toFixed(2), currency: "GBP" },
            },
            availableQuantity: stock,
          }),
        },
      );
      if (!updateRes.ok) {
        const body = await updateRes.text();
        return { ok: false, error: `Offer update failed (${updateRes.status}): ${body}` };
      }
    }
  }

  // 3. Create offer if none exists
  if (!offerId) {
    const createRes = await ebayFetch("/sell/inventory/v1/offer", token, {
      method: "POST",
      body: JSON.stringify({
        sku,
        marketplaceId: opts.marketplaceId,
        format: "FIXED_PRICE",
        availableQuantity: stock,
        categoryId: opts.categoryId,
        listingPolicies: {
          fulfillmentPolicyId: opts.fulfillmentPolicyId,
          paymentPolicyId: opts.paymentPolicyId,
          returnPolicyId: opts.returnPolicyId,
        },
        merchantLocationKey: opts.merchantLocationKey,
        pricingSummary: {
          price: { value: priceGbp.toFixed(2), currency: "GBP" },
        },
      }),
    });

    if (!createRes.ok) {
      const body = await createRes.text();
      return { ok: false, error: `Offer create failed (${createRes.status}): ${body}` };
    }
    const created = await createRes.json();
    offerId = created.offerId;
  }

  return { ok: true, data: { sku, offerId } };
}

/**
 * Batch-push listings in groups of 25 with 500ms delay between batches.
 */
export async function bulkPushListings(
  items: ListingInput[],
  options?: PushOptions,
): Promise<Result<{ pushed: number; errors: { sku: string; error: string }[] }>> {
  const pushed: string[] = [];
  const errors: { sku: string; error: string }[] = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    if (i > 0) await sleep(BATCH_DELAY_MS);

    const batch = items.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((item) => pushListing(item.sku, item.priceGbp, item.stock, options)),
    );

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.ok) {
        pushed.push(batch[j].sku);
      } else {
        errors.push({ sku: batch[j].sku, error: r.error });
      }
    }
  }

  return { ok: true, data: { pushed: pushed.length, errors } };
}

/**
 * Get current eBay price + stock for a list of SKUs.
 */
export async function getCurrentListings(
  skus: string[],
): Promise<Result<CurrentListing[]>> {
  const tokenResult = await getAccessToken();
  if (!tokenResult.ok) return tokenResult;
  const token = tokenResult.data;

  const listings: CurrentListing[] = [];

  for (const sku of skus) {
    const res = await ebayFetch(
      `/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`,
      token,
    );
    if (!res.ok) continue;

    const data = await res.json();
    const offer = data.offers?.[0];
    if (offer) {
      listings.push({
        sku,
        priceGbp: parseFloat(offer.pricingSummary?.price?.value ?? "0"),
        stock: offer.availableQuantity ?? 0,
      });
    }
  }

  return { ok: true, data: listings };
}

// ---------------------------------------------------------------------------
// Fulfillment API — order pull
// ---------------------------------------------------------------------------

/**
 * Fetch paid eBay orders since a given timestamp.
 */
export async function pullOrders(since: Date): Promise<Result<EbayOrder[]>> {
  const tokenResult = await getAccessToken();
  if (!tokenResult.ok) return tokenResult;
  const token = tokenResult.data;

  const orders: EbayOrder[] = [];
  let offset = 0;
  const limit = 50;


  while (true) {
    const filter = [
      "orderfulfillmentstatus:{NOT_STARTED|IN_PROGRESS}",
      `creationdate:[${since.toISOString()}..]`,
    ].join(",");

    const res = await ebayFetch(
      `/sell/fulfillment/v1/order?filter=${encodeURIComponent(filter)}&limit=${limit}&offset=${offset}`,
      token,
    );

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Order fetch failed (${res.status}): ${body}` };
    }

    const data = await res.json();
    const ebayOrders: unknown[] = data.orders ?? [];

    for (const o of ebayOrders) {
      const order = o as {
        orderId: string;
        creationDate: string;
        lineItems: { sku: string; quantity: number; total: { value: string } }[];
      };

      orders.push({
        ebayOrderId: order.orderId,
        createdDate: order.creationDate,
        lineItems: (order.lineItems ?? []).map((li) => ({
          sku: li.sku ?? "",
          quantity: li.quantity ?? 1,
          salePrice: parseFloat(li.total?.value ?? "0"),
        })),
      });
    }

    if (ebayOrders.length < limit) break;
    offset += limit;
  }

  return { ok: true, data: orders };
}
