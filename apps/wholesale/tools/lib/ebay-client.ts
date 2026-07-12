// eBay REST API client — OAuth, Inventory API, Offer API
// Docs: https://developer.ebay.com/api-docs/sell/inventory/overview.html

import {
  LEGACY_CATALOG_EXTERNAL_PUBLICATION_ENABLED,
  LEGACY_CATALOG_EXTERNAL_PUBLICATION_REASON,
} from "../../src/lib/source-publication-policy";

function assertCatalogPublicationEnabled(): void {
  if (!LEGACY_CATALOG_EXTERNAL_PUBLICATION_ENABLED) {
    throw new Error(`eBay catalog publication is blocked. ${LEGACY_CATALOG_EXTERNAL_PUBLICATION_REASON}`);
  }
}

const PROD_BASE = "https://api.ebay.com";
const SANDBOX_BASE = "https://api.sandbox.ebay.com";

const RATE_LIMIT_MS = 200;
const MAX_RETRIES = 3;

let cachedToken: { token: string; expiresAt: number } | null = null;

function getBaseUrl(sandbox: boolean): string {
  return sandbox ? SANDBOX_BASE : PROD_BASE;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// OAuth 2.0 — refresh token → access token
// ---------------------------------------------------------------------------

export async function getAccessToken(sandbox: boolean): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const refreshToken = process.env.EBAY_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, or EBAY_REFRESH_TOKEN");
  }

  const base = getBaseUrl(sandbox);
  const res = await fetch(`${base}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: "https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.inventory.readonly",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`eBay OAuth failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

// ---------------------------------------------------------------------------
// Retry wrapper with exponential backoff
// ---------------------------------------------------------------------------

async function ebayFetch(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  await sleep(RATE_LIMIT_MS);

  const res = await fetch(url, options);

  if ((res.status === 429 || res.status >= 500) && retries > 0) {
    const delay = (MAX_RETRIES - retries + 1) * 1000;
    console.warn(`  eBay ${res.status} — retrying in ${delay}ms (${retries} left)`);
    await sleep(delay);
    return ebayFetch(url, options, retries - 1);
  }

  return res;
}

// ---------------------------------------------------------------------------
// Inventory API — create or replace inventory item (PUT, idempotent by SKU)
// ---------------------------------------------------------------------------

export interface InventoryItemPayload {
  sku: string;
  title: string;
  description: string;
  imageUrl?: string;
  condition: "NEW" | "LIKE_NEW";
  quantity: number;
  aspects: Record<string, string[]>;
}

export async function createOrReplaceInventoryItem(
  token: string,
  sandbox: boolean,
  payload: InventoryItemPayload
): Promise<void> {
  assertCatalogPublicationEnabled();
  const base = getBaseUrl(sandbox);
  const url = `${base}/sell/inventory/v1/inventory_item/${encodeURIComponent(payload.sku)}`;

  const body: any = {
    availability: {
      shipToLocationAvailability: {
        quantity: payload.quantity,
      },
    },
    condition: payload.condition,
    product: {
      title: payload.title,
      description: payload.description,
      aspects: payload.aspects,
      ...(payload.imageUrl ? { imageUrls: [payload.imageUrl] } : {}),
    },
  };

  const res = await ebayFetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Content-Language": "en-GB",
    },
    body: JSON.stringify(body),
  });

  if (res.status !== 200 && res.status !== 204) {
    const text = await res.text();
    throw new Error(`createOrReplaceInventoryItem failed (${res.status}): ${text}`);
  }
}

// ---------------------------------------------------------------------------
// Offer API — create offer → publish offer → listing ID
// ---------------------------------------------------------------------------

export interface CreateOfferPayload {
  sku: string;
  categoryId: string;
  priceGbp: number;
  fulfillmentPolicyId: string;
  paymentPolicyId: string;
  returnPolicyId: string;
  merchantLocationKey: string;
}

export async function createOffer(
  token: string,
  sandbox: boolean,
  payload: CreateOfferPayload
): Promise<string> {
  assertCatalogPublicationEnabled();
  const base = getBaseUrl(sandbox);
  const url = `${base}/sell/inventory/v1/offer`;

  const body = {
    sku: payload.sku,
    marketplaceId: "EBAY_GB",
    format: "FIXED_PRICE",
    listingDescription: undefined, // description comes from inventory item
    availableQuantity: undefined,  // quantity comes from inventory item
    categoryId: payload.categoryId,
    pricingSummary: {
      price: {
        value: payload.priceGbp.toFixed(2),
        currency: "GBP",
      },
    },
    listingPolicies: {
      fulfillmentPolicyId: payload.fulfillmentPolicyId,
      paymentPolicyId: payload.paymentPolicyId,
      returnPolicyId: payload.returnPolicyId,
    },
    merchantLocationKey: payload.merchantLocationKey,
  };

  const res = await ebayFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Content-Language": "en-GB",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`createOffer failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.offerId;
}

export async function publishOffer(
  token: string,
  sandbox: boolean,
  offerId: string
): Promise<string> {
  assertCatalogPublicationEnabled();
  const base = getBaseUrl(sandbox);
  const url = `${base}/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`;

  const res = await ebayFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`publishOffer failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.listingId;
}
