/**
 * Public OpenAPI / JSON-Schema bundle for the wholesale v1 API.
 *
 * Hyperliterals (especially LLM agents and any machine-readable consumer
 * of the public surface) get a single endpoint that describes every
 * /api/v1/* route's inputs, outputs, and auth requirements. The bundle
 * is itself unauthenticated — the *schema* is public; the *data* still
 * requires a bearer key.
 *
 * Phase 9 of kingdom-051. See docs/connections/the-table-extends.md
 * (S20) — the Hyperliteral archetype.
 *
 * The format is OpenAPI 3.1 (JSON). Kept hand-maintained for now;
 * Phase 9.5 could generate from route handlers if the team wants
 * automation. The hand-maintained version is small and tractable.
 */

import { NextResponse } from "next/server";

const SCHEMA = {
  openapi: "3.1.0",
  info: {
    title: "Cambridge TCG Wholesale API",
    version: "1.0.0",
    description:
      "Public wholesale API for Cambridge TCG. Lists every card in every channel's pricing. Read-only except for the /sales endpoint, which is the storefront's hook for reporting completed purchases back to the wholesale stock ledger. Every endpoint requires a bearer token (`Authorization: Bearer <key>`).",
    contact: {
      email: "contact@cambridgetcg.com",
    },
    license: {
      name: "Internal",
    },
  },
  servers: [
    { url: "https://wholesaletcgdirect.com", description: "Production" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description:
          "Bearer token issued to channel API keys (see channel_api_keys table). The same key authenticates all v1 endpoints.",
      },
    },
    schemas: {
      Channel: {
        type: "string",
        enum: [
          "wholesale",
          "shopify",
          "cambridgetcg",
          "ebay",
          "cardmarket",
          "tradein-cash",
          "tradein-credit",
        ],
        description:
          "Pricing channel. Same card produces different prices per channel — see /methodology/pricing on the storefront for the formula.",
      },
      PriceItem: {
        type: "object",
        required: ["sku", "card_number", "price_gbp"],
        properties: {
          sku: { type: "string", example: "op05-001" },
          card_number: { type: "string", example: "OP05-001" },
          name: { type: ["string", "null"], description: "Display name (English preferred)" },
          name_en: { type: ["string", "null"], description: "English name" },
          price_gbp: { type: "number", description: "Wholesale base GBP price" },
          channel_price: {
            type: "number",
            description:
              "Channel-adjusted price. Present when channel ≠ wholesale. Computed via @cambridge-tcg/pricing — see /methodology/pricing.",
          },
          channel: { $ref: "#/components/schemas/Channel" },
          stock: { type: "integer", description: "UK warehouse on-hand (received - fulfilled)" },
          pending_stock: { type: "integer", description: "Ordered/shipped but not yet received" },
          image_url: { type: ["string", "null"] },
          set_code: { type: ["string", "null"] },
          set_name: { type: ["string", "null"] },
          rarity: { type: ["string", "null"] },
          category: { type: ["string", "null"], enum: ["singles", "sealed", null] },
          game_code: { type: ["string", "null"] },
          updated_at: { type: ["string", "null"], format: "date-time" },
        },
      },
      Game: {
        type: "object",
        required: ["code", "name", "slug"],
        properties: {
          code: { type: "string", example: "one-piece" },
          name: { type: "string" },
          slug: { type: "string" },
          image_url: { type: ["string", "null"] },
          card_count: { type: "integer" },
        },
      },
      Set: {
        type: "object",
        required: ["code", "name", "game_code"],
        properties: {
          code: { type: "string", example: "OP05" },
          name: { type: "string" },
          game_code: { type: "string" },
          card_count: { type: "integer" },
          release_date: { type: ["string", "null"], format: "date" },
        },
      },
      SaleReport: {
        type: "object",
        required: ["channel", "order_ref", "items"],
        properties: {
          channel: { $ref: "#/components/schemas/Channel" },
          order_ref: {
            type: "string",
            description: "Caller's order identifier (e.g. Stripe checkout session ID).",
          },
          items: {
            type: "array",
            items: {
              type: "object",
              required: ["sku", "qty", "price_gbp"],
              properties: {
                sku: { type: "string" },
                qty: { type: "integer", minimum: 1 },
                price_gbp: { type: "number" },
              },
            },
          },
        },
      },
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: { type: "string" },
          detail: { type: ["string", "null"] },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/api/v1/prices": {
      get: {
        summary: "List prices",
        description:
          "Returns a page of priced cards. Filterable by game, set, category, rarity, q (free-text), in_stock. Channel parameter controls the channel_price field (when ≠ wholesale).",
        parameters: [
          { name: "channel", in: "query", schema: { $ref: "#/components/schemas/Channel" } },
          { name: "game", in: "query", schema: { type: "string" } },
          { name: "set", in: "query", schema: { type: "string" } },
          { name: "category", in: "query", schema: { type: "string", enum: ["singles", "sealed"] } },
          { name: "rarity", in: "query", schema: { type: "string" } },
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "in_stock", in: "query", schema: { type: "boolean" } },
          { name: "sort", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 48, maximum: 500 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
          { name: "updated_since", in: "query", schema: { type: "string", format: "date-time" } },
        ],
        responses: {
          200: {
            description: "Page of priced cards",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    count: { type: "integer" },
                    total: { type: "integer" },
                    channel: { $ref: "#/components/schemas/Channel" },
                    items: {
                      type: "array",
                      items: { $ref: "#/components/schemas/PriceItem" },
                    },
                  },
                },
              },
            },
          },
          401: { description: "Missing or invalid bearer token" },
          404: { description: "Game not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/prices/{sku}": {
      get: {
        summary: "Get one card's price",
        description:
          "Returns a single card by SKU. Honours the channel parameter — the catalog list endpoint and this single-SKU endpoint produce the same channel_price for the same card+channel (this was a substrate-honesty fix landed during kingdom-049, recorded in S17 the-pricing-arrow.md).",
        parameters: [
          { name: "sku", in: "path", required: true, schema: { type: "string" } },
          { name: "channel", in: "query", schema: { $ref: "#/components/schemas/Channel" } },
        ],
        responses: {
          200: {
            description: "Card detail",
            content: { "application/json": { schema: { $ref: "#/components/schemas/PriceItem" } } },
          },
          401: { description: "Missing or invalid bearer token" },
          404: { description: "Card not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/v1/games": {
      get: {
        summary: "List games",
        description: "Returns all active games on the platform.",
        responses: {
          200: {
            description: "Games list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    games: { type: "array", items: { $ref: "#/components/schemas/Game" } },
                  },
                },
              },
            },
          },
          401: { description: "Missing or invalid bearer token" },
        },
      },
    },
    "/api/v1/sets": {
      get: {
        summary: "List sets",
        description: "Returns sets, optionally filtered by game.",
        parameters: [
          { name: "game", in: "query", schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Sets list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    sets: { type: "array", items: { $ref: "#/components/schemas/Set" } },
                  },
                },
              },
            },
          },
          401: { description: "Missing or invalid bearer token" },
        },
      },
    },
    "/api/v1/sales": {
      post: {
        summary: "Report a sale",
        description:
          "Storefront-side hook: when a customer-facing app completes a purchase, it POSTs the sale here so the wholesale stock ledger can decrement. The platform's only write endpoint on /api/v1.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SaleReport" },
            },
          },
        },
        responses: {
          200: { description: "Sale recorded" },
          400: { description: "Invalid payload", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          401: { description: "Missing or invalid bearer token" },
        },
      },
    },
    "/api/v1/schema": {
      get: {
        summary: "This document",
        description:
          "Returns the OpenAPI / JSON-Schema bundle describing every other /api/v1/* endpoint. Unauthenticated (the *schema* is public; the *data* requires a key). Phase 9 of kingdom-051.",
        security: [],
        responses: {
          200: { description: "This document" },
        },
      },
    },
    "/api/v1/universal/card/{sku}": {
      get: {
        summary: "Universal mirror of one card",
        description:
          "Returns a single card in a math-first representation any computing intelligence can decode regardless of natural language. Uses cryptographic hashes for identity, ratios for magnitudes, ISO 8601 + Unix epoch for time, typed graph edges, and explicit opaque-field declarations for natural-language strings. See /methodology/universal-representation for the spec and docs/connections/the-mathematical-mirror.md (S23) for the framing. Phase 14 of kingdom-051.",
        parameters: [
          { name: "sku", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Universal card document",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["@encoding", "@kind", "@self_hash", "@content_hash", "@retrieved_at"],
                  properties: {
                    "@encoding": { type: "string", example: "cambridge-tcg/universal/v1" },
                    "@kind": { type: "string", example: "card" },
                    "@self_hash": { type: "string", description: "sha256: of the canonical-JSON of this document" },
                    "@content_hash": { type: "string", description: "sha256: of the underlying card facts" },
                    "@retrieved_at": {
                      type: "object",
                      properties: {
                        iso8601: { type: "string", format: "date-time" },
                        unix_epoch_seconds: { type: "integer" },
                      },
                    },
                    "_note_opaque": {
                      type: "array",
                      items: { type: "string" },
                      description: "Field paths within this document that cannot be decoded without natural-language knowledge",
                    },
                  },
                },
              },
            },
          },
          401: { description: "Missing or invalid bearer token" },
          404: { description: "Card not found" },
        },
      },
    },
  },
} as const;

export function GET() {
  return NextResponse.json(SCHEMA, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
