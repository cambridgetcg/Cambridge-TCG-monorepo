/**
 * Shopify REST API client for product/inventory management.
 *
 * Auth: OAuth client_credentials grant (tokens expire every 24h).
 * Falls back to static SHOPIFY_ACCESS_TOKEN if client ID/secret not set.
 *
 * Rate limit: 2 req/s (Shopify standard plan: burst 40, steady 2/s).
 * We enforce 500ms between requests.
 */

const SHOPIFY_API_VERSION = "2024-10";

export interface ShopifyProduct {
  productId: string;
  variantId: string;
  inventoryItemId: string;
}

export interface CardForShopify {
  sku: string;
  cardNumber: string;
  name: string;
  nameEn: string | null;
  setCode: string | null;
  setName: string | null;
  rarity: string | null;
  price: number;
  imageUrl: string | null;
  stock: number;
}

export interface ShopifyOrder {
  id: number;
  order_number: number;
  created_at: string;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  currency: string;
  line_items: Array<{
    id: number;
    title: string;
    sku: string;
    quantity: number;
    price: string;
    variant_id: number;
    product_id: number;
  }>;
  customer?: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
  };
}

/** Minimum delay between API requests (ms) */
const REQUEST_DELAY_MS = 500;

/** Buffer before expiry to trigger refresh (5 minutes) */
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export class ShopifyClient {
  private store: string;
  private accessToken: string;
  private clientId: string;
  private clientSecret: string;
  private tokenExpiresAt: number = 0;
  private baseUrl: string;

  constructor(opts?: {
    store?: string;
    accessToken?: string;
    clientId?: string;
    clientSecret?: string;
  }) {
    this.store = opts?.store ?? process.env.SHOPIFY_STORE ?? "";
    this.accessToken = opts?.accessToken ?? process.env.SHOPIFY_ACCESS_TOKEN ?? "";
    this.clientId = opts?.clientId ?? process.env.SHOPIFY_CLIENT_ID ?? "";
    this.clientSecret = opts?.clientSecret ?? process.env.SHOPIFY_CLIENT_SECRET ?? "";

    if (!this.store) throw new Error("SHOPIFY_STORE is required");

    // If we have client credentials, we can fetch tokens on demand
    // If we only have a static access token, use that
    if (!this.clientId && !this.accessToken) {
      throw new Error("Either SHOPIFY_CLIENT_ID+SECRET or SHOPIFY_ACCESS_TOKEN is required");
    }

    this.baseUrl = `https://${this.store}/admin/api/${SHOPIFY_API_VERSION}`;
  }

  /**
   * Get a valid access token, refreshing via client_credentials if needed.
   */
  private async getAccessToken(): Promise<string> {
    // If using static token (no client credentials), return as-is
    if (!this.clientId || !this.clientSecret) {
      return this.accessToken;
    }

    // Check if token is still valid (with buffer)
    if (this.accessToken && Date.now() < this.tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS) {
      return this.accessToken;
    }

    // Fetch new token via client_credentials grant
    const res = await fetch(
      `https://${this.store}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: "client_credentials",
        }),
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Shopify OAuth token exchange failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
      scope: string;
    };

    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;

    return this.accessToken;
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ data: T; headers: Headers }> {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}/${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Shopify ${method} ${path} → ${res.status} ${res.statusText}: ${text}`
      );
    }

    const data = (await res.json()) as T;
    return { data, headers: res.headers };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Fetch all products from the store and return a Map keyed by SKU.
   * Handles cursor-based pagination automatically.
   */
  async getAllProductsBySku(): Promise<Map<string, ShopifyProduct>> {
    const skuMap = new Map<string, ShopifyProduct>();
    let nextUrl: string | null =
      `${this.baseUrl}/products.json?limit=250&fields=id,variants`;

    while (nextUrl) {
      const token = await this.getAccessToken();
      const res = await fetch(nextUrl, {
        headers: {
          "X-Shopify-Access-Token": token,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Shopify GET products → ${res.status} ${res.statusText}: ${text}`
        );
      }

      const data = (await res.json()) as {
        products: Array<{
          id: number;
          variants: Array<{
            id: number;
            sku: string;
            inventory_item_id: number;
          }>;
        }>;
      };

      for (const product of data.products) {
        for (const variant of product.variants) {
          const sku = variant.sku?.trim();
          if (sku) {
            skuMap.set(sku, {
              productId: String(product.id),
              variantId: String(variant.id),
              inventoryItemId: String(variant.inventory_item_id),
            });
          }
        }
      }

      // Parse Link header for next page
      const linkHeader = res.headers.get("Link") ?? "";
      nextUrl = parseLinkNext(linkHeader);

      if (nextUrl) {
        await this.sleep(REQUEST_DELAY_MS);
      }
    }

    return skuMap;
  }

  /**
   * Create a new product in Shopify.
   * Returns the product/variant/inventory IDs.
   */
  async createProduct(card: CardForShopify): Promise<ShopifyProduct> {
    const title = `${card.cardNumber} ${card.nameEn ?? card.name} Japanese`.trim();
    const setName = card.setName ?? card.setCode ?? "Unknown Set";

    const tags = [
      "one-piece",
      "japanese",
      card.setCode ?? "",
      card.rarity ?? "",
    ].filter(Boolean);

    const productBody: Record<string, unknown> = {
      title,
      body_html: `<p>Japanese One Piece TCG card. Condition: Near Mint.</p><p>Set: ${setName}</p>`,
      vendor: "Cambridge TCG",
      product_type: "Trading Card",
      tags,
      status: card.stock > 0 ? "active" : "draft",
      variants: [
        {
          sku: card.sku,
          price: card.price.toFixed(2),
          inventory_management: "shopify",
          inventory_policy: "deny",
          fulfillment_service: "manual",
        },
      ],
    };

    // Only add image if we have a URL
    if (card.imageUrl) {
      productBody.images = [{ src: card.imageUrl }];
    }

    const { data } = await this.request<{
      product: {
        id: number;
        variants: Array<{
          id: number;
          inventory_item_id: number;
        }>;
      };
    }>("POST", "products.json", { product: productBody });

    const product = data.product;
    const variant = product.variants[0];

    return {
      productId: String(product.id),
      variantId: String(variant.id),
      inventoryItemId: String(variant.inventory_item_id),
    };
  }

  /**
   * Update the price of a specific variant.
   */
  async updatePrice(variantId: string, price: number): Promise<void> {
    await this.request("PUT", `variants/${variantId}.json`, {
      variant: {
        id: variantId,
        price: price.toFixed(2),
      },
    });
  }

  /**
   * Set the inventory level for an inventory item at a location.
   */
  async updateInventory(
    inventoryItemId: string,
    locationId: string,
    quantity: number
  ): Promise<void> {
    await this.request("POST", "inventory_levels/set.json", {
      inventory_item_id: inventoryItemId,
      location_id: locationId,
      available: quantity,
    });
  }

  /**
   * Set a product's published status (active = published, draft = hidden).
   */
  async setProductStatus(
    productId: string,
    status: "active" | "draft"
  ): Promise<void> {
    await this.request("PUT", `products/${productId}.json`, {
      product: {
        id: productId,
        status,
      },
    });
  }

  /**
   * Get the store's primary location ID (used for inventory updates).
   * Cached after first call.
   */
  private _locationId: string | null = null;

  async getLocationId(): Promise<string> {
    if (this._locationId) return this._locationId;

    const { data } = await this.request<{
      locations: Array<{ id: number; name: string; active: boolean }>;
    }>("GET", "locations.json");

    const active = data.locations.filter((l) => l.active);
    if (active.length === 0) {
      throw new Error("No active Shopify locations found");
    }

    // Use "Shop location" if present, otherwise first active location
    const shop = active.find((l) => l.name === "Shop location") ?? active[0];
    this._locationId = String(shop.id);
    return this._locationId;
  }

  // ── Orders API ────────────────────────────────────────────────────────────

  /**
   * Fetch recent orders. Defaults to unfulfilled orders.
   */
  async getOrders(opts?: {
    status?: "open" | "closed" | "cancelled" | "any";
    fulfillment_status?: "shipped" | "partial" | "unshipped" | "any" | "unfulfilled";
    financial_status?: "authorized" | "pending" | "paid" | "partially_paid" | "refunded" | "voided" | "any";
    limit?: number;
    since_id?: string;
    created_at_min?: string;
  }): Promise<ShopifyOrder[]> {
    const params = new URLSearchParams();
    params.set("status", opts?.status ?? "any");
    if (opts?.fulfillment_status) params.set("fulfillment_status", opts.fulfillment_status);
    if (opts?.financial_status) params.set("financial_status", opts.financial_status);
    params.set("limit", String(opts?.limit ?? 50));
    if (opts?.since_id) params.set("since_id", opts.since_id);
    if (opts?.created_at_min) params.set("created_at_min", opts.created_at_min);

    const { data } = await this.request<{ orders: ShopifyOrder[] }>(
      "GET",
      `orders.json?${params.toString()}`
    );

    return data.orders;
  }

  /**
   * Fetch a single order by ID.
   */
  async getOrder(orderId: string | number): Promise<ShopifyOrder> {
    const { data } = await this.request<{ order: ShopifyOrder }>(
      "GET",
      `orders/${orderId}.json`
    );
    return data.order;
  }

  /**
   * Register a webhook with Shopify.
   */
  async registerWebhook(topic: string, address: string, format: "json" | "xml" = "json"): Promise<{ id: number }> {
    const { data } = await this.request<{
      webhook: { id: number; topic: string; address: string };
    }>("POST", "webhooks.json", {
      webhook: { topic, address, format },
    });
    return { id: data.webhook.id };
  }

  /**
   * List all registered webhooks.
   */
  async listWebhooks(): Promise<Array<{ id: number; topic: string; address: string }>> {
    const { data } = await this.request<{
      webhooks: Array<{ id: number; topic: string; address: string }>;
    }>("GET", "webhooks.json");
    return data.webhooks;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseLinkNext(linkHeader: string): string | null {
  if (!linkHeader) return null;

  for (const part of linkHeader.split(",")) {
    const [urlPart, relPart] = part.trim().split(";");
    if (relPart?.trim() === 'rel="next"') {
      return urlPart.trim().replace(/^<|>$/g, "");
    }
  }

  return null;
}
