import { describe, expect, it } from "vitest";

import {
  InvalidCommerceEventPayloadError,
  normalizeCommerceEvent,
  NormalizedOrderPaidSchema,
  UnsupportedCommerceEventError,
  type CommerceEventForNormalization,
} from "../src/domain/normalized-order-paid.js";

const EVENT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000002";
const CONNECTION_ID = "30000000-0000-4000-8000-000000000003";

function event(
  overrides: Partial<CommerceEventForNormalization> = {},
): CommerceEventForNormalization {
  return {
    commerceConnectionId: CONNECTION_ID,
    eventId: EVENT_ID,
    externalAccountId: "example.myshopify.com",
    externalEventId: "shopify-webhook-1",
    externalEventType: "orders/paid",
    occurredAt: "2026-07-23T10:00:01Z",
    payload: {
      admin_graphql_api_id: "gid://shopify/Order/42",
      currency: "gbp",
      current_total_price: "12.50",
      customer: { id: 7, email: "not-copied@example.test" },
      id: 42,
      line_items: [
        {
          id: 91,
          price: "12.50",
          product_id: 92,
          quantity: 1,
          sku: "CARD-1",
          title: "A card",
          variant_id: 93,
        },
      ],
      name: "#1042",
      processed_at: "2026-07-23T10:00:00Z",
    },
    payloadSha256: "a".repeat(64),
    provider: "shopify",
    receivedAt: "2026-07-23T10:00:02Z",
    workspaceId: WORKSPACE_ID,
    ...overrides,
  };
}

describe("order.paid normalization contract", () => {
  it("normalizes reported order facts and preserves path-level provenance", () => {
    const normalized = normalizeCommerceEvent(event());

    expect(NormalizedOrderPaidSchema.parse(normalized)).toEqual(normalized);
    expect(normalized.type).toBe("order.paid");
    expect(normalized.order).toMatchObject({
      currency: "GBP",
      externalCustomerId: "7",
      externalId: "gid://shopify/Order/42",
      total: { amount: "12.50", currency: "GBP" },
    });
    expect(normalized.provenance).toMatchObject({
      payloadSha256: "a".repeat(64),
      sourceAccount: "example.myshopify.com",
      sourceEventId: "shopify-webhook-1",
      sourceKind: "provider_webhook",
      sourceProvider: "shopify",
    });
    expect(normalized.provenance.mappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourcePath: "payload.current_total_price",
          targetPath: "order.total.amount",
        }),
      ]),
    );
    expect(JSON.stringify(normalized)).not.toContain("not-copied@example.test");
  });

  it("records fallback provenance for legacy total and timestamp fields", () => {
    const normalized = normalizeCommerceEvent(
      event({
        payload: {
          created_at: "2026-07-23T10:00:00Z",
          currency: "USD",
          id: "42",
          line_items: [],
          total_price: "4.00",
        },
      }),
    );

    expect(normalized.order.total.amount).toBe("4.00");
    expect(normalized.provenance.mappings).toEqual(
      expect.arrayContaining([
        {
          sourcePath: "payload.total_price",
          targetPath: "order.total.amount",
          transformation: "fallback",
        },
        {
          sourcePath: "payload.created_at",
          targetPath: "order.paidAt",
          transformation: "fallback",
        },
      ]),
    );
  });

  it("rejects unsupported topics rather than inventing a normalized shape", () => {
    expect(() =>
      normalizeCommerceEvent(event({ externalEventType: "orders/cancelled" })),
    ).toThrow(UnsupportedCommerceEventError);
  });

  it("rejects provider payloads without required reported facts", () => {
    expect(() =>
      normalizeCommerceEvent(event({ payload: { currency: "GBP", id: 42 } })),
    ).toThrow(InvalidCommerceEventPayloadError);
  });

  it("rejects unsafe numeric Shopify IDs instead of persisting rounded identity", () => {
    expect(() =>
      normalizeCommerceEvent(
        event({
          payload: {
            currency: "GBP",
            current_total_price: "12.50",
            id: Number.MAX_SAFE_INTEGER + 2,
            line_items: [],
            processed_at: "2026-07-23T10:00:00Z",
          },
        }),
      ),
    ).toThrow(InvalidCommerceEventPayloadError);
  });

  it("preserves exact 64-bit Shopify ids decoded from jsonb text", () => {
    const normalized = normalizeCommerceEvent(
      event({
        payload: {
          currency: "GBP",
          current_total_price: "12.50",
          customer: { id: "820982911946154509" },
          id: "820982911946154508",
          line_items: [
            {
              id: "820982911946154510",
              product_id: "820982911946154511",
              quantity: 1,
              title: "Exact identity",
              variant_id: "820982911946154512",
            },
          ],
          processed_at: "2026-07-23T10:00:00Z",
        },
      }),
    );

    expect(normalized.order.externalId).toBe("820982911946154508");
    expect(normalized.order.externalCustomerId).toBe("820982911946154509");
    expect(normalized.order.lineItems[0]).toMatchObject({
      externalId: "820982911946154510",
      externalProductId: "820982911946154511",
      externalVariantId: "820982911946154512",
    });
  });
});
