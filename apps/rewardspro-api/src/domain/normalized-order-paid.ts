import { z } from "zod";

const ExternalIdSchema = z
  .union([z.string().min(1), z.number().int().safe()])
  .transform(String);
const OptionalExternalIdSchema = ExternalIdSchema.nullish().transform(
  (value) => value ?? null,
);
const DecimalStringSchema = z.string().regex(/^\d+(?:\.\d+)?$/);
const CurrencySchema = z
  .string()
  .regex(/^[A-Za-z]{3}$/)
  .transform((value) => value.toUpperCase());
const TimestampSchema = z.string().datetime({ offset: true });

const ShopifyLineItemSchema = z
  .object({
    id: ExternalIdSchema,
    price: DecimalStringSchema.optional(),
    product_id: OptionalExternalIdSchema,
    quantity: z.number().int().positive(),
    sku: z.string().nullable().optional(),
    title: z.string().min(1),
    variant_id: OptionalExternalIdSchema,
  })
  .passthrough();

const ShopifyOrderPaidPayloadSchema = z
  .object({
    admin_graphql_api_id: z.string().min(1).optional(),
    created_at: TimestampSchema.optional(),
    currency: CurrencySchema,
    current_total_price: DecimalStringSchema.optional(),
    customer: z
      .object({
        id: ExternalIdSchema,
      })
      .passthrough()
      .nullable()
      .optional(),
    id: ExternalIdSchema,
    line_items: z.array(ShopifyLineItemSchema).default([]),
    name: z.string().min(1).nullable().optional(),
    processed_at: TimestampSchema.nullable().optional(),
    total_price: DecimalStringSchema.optional(),
  })
  .passthrough()
  .superRefine((value, context) => {
    if (value.current_total_price === undefined && value.total_price === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A reported total price is required",
        path: ["current_total_price"],
      });
    }
    if (
      value.processed_at === undefined &&
      value.created_at === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A reported timestamp is required",
        path: ["processed_at"],
      });
    }
  });

const NormalizedLineItemSchema = z
  .object({
    externalId: z.string().min(1),
    externalProductId: z.string().nullable(),
    externalVariantId: z.string().nullable(),
    quantity: z.number().int().positive(),
    sku: z.string().nullable(),
    title: z.string().min(1),
    unitPrice: z
      .object({
        amount: DecimalStringSchema,
        currency: z.string().regex(/^[A-Z]{3}$/),
      })
      .nullable(),
  })
  .strict();

export const NormalizedOrderPaidSchema = z
  .object({
    commerceConnectionId: z.string().uuid(),
    eventId: z.string().uuid(),
    occurredAt: TimestampSchema,
    order: z
      .object({
        currency: z.string().regex(/^[A-Z]{3}$/),
        externalCustomerId: z.string().nullable(),
        externalId: z.string().min(1),
        lineItems: z.array(NormalizedLineItemSchema),
        name: z.string().nullable(),
        paidAt: TimestampSchema,
        total: z.object({
          amount: DecimalStringSchema,
          currency: z.string().regex(/^[A-Z]{3}$/),
        }),
      })
      .strict(),
    provenance: z
      .object({
        mappings: z.array(
          z
            .object({
              sourcePath: z.string().min(1),
              targetPath: z.string().min(1),
              transformation: z.enum([
                "copied",
                "copied_as_string",
                "uppercased",
                "fallback",
              ]),
            })
            .strict(),
        ),
        payloadSha256: z.string().regex(/^[0-9a-f]{64}$/),
        receivedAt: TimestampSchema,
        sourceAccount: z.string().min(1),
        sourceEventId: z.string().min(1),
        sourceEventType: z.literal("orders/paid"),
        sourceKind: z.literal("provider_webhook"),
        sourceProvider: z.literal("shopify"),
      })
      .strict(),
    schemaVersion: z.literal(1),
    type: z.literal("order.paid"),
    workspaceId: z.string().uuid(),
  })
  .strict();

export type NormalizedOrderPaid = z.infer<typeof NormalizedOrderPaidSchema>;

export interface CommerceEventForNormalization {
  commerceConnectionId: string;
  eventId: string;
  externalAccountId: string;
  externalEventId: string;
  externalEventType: string;
  occurredAt: string | null;
  payload: unknown;
  payloadSha256: string;
  provider: string;
  receivedAt: string;
  workspaceId: string;
}

export class UnsupportedCommerceEventError extends Error {
  override readonly name = "UnsupportedCommerceEventError";
}

export class InvalidCommerceEventPayloadError extends Error {
  override readonly name = "InvalidCommerceEventPayloadError";
}

export function normalizeCommerceEvent(
  event: CommerceEventForNormalization,
): NormalizedOrderPaid {
  if (
    event.externalEventType !== "orders/paid" ||
    event.provider !== "shopify" ||
    !isShopifyDomain(event.externalAccountId)
  ) {
    throw new UnsupportedCommerceEventError("Unsupported commerce event");
  }

  const payloadResult = ShopifyOrderPaidPayloadSchema.safeParse(event.payload);
  if (!payloadResult.success) {
    throw new InvalidCommerceEventPayloadError(
      "Invalid orders/paid provider payload",
    );
  }
  const payload = payloadResult.data;
  const totalAmount = payload.current_total_price ?? payload.total_price;
  const paidAt = payload.processed_at ?? payload.created_at;
  if (!totalAmount || !paidAt) {
    throw new InvalidCommerceEventPayloadError(
      "Invalid orders/paid provider payload",
    );
  }

  const externalOrderId = payload.admin_graphql_api_id ?? payload.id;
  const occurredAt = paidAt ?? event.occurredAt ?? event.receivedAt;
  const normalized = {
    commerceConnectionId: event.commerceConnectionId,
    eventId: event.eventId,
    occurredAt,
    order: {
      currency: payload.currency,
      externalCustomerId: payload.customer?.id ?? null,
      externalId: externalOrderId,
      lineItems: payload.line_items.map((lineItem) => ({
        externalId: lineItem.id,
        externalProductId: lineItem.product_id,
        externalVariantId: lineItem.variant_id,
        quantity: lineItem.quantity,
        sku: lineItem.sku ?? null,
        title: lineItem.title,
        unitPrice:
          lineItem.price === undefined
            ? null
            : { amount: lineItem.price, currency: payload.currency },
      })),
      name: payload.name ?? null,
      paidAt,
      total: {
        amount: totalAmount,
        currency: payload.currency,
      },
    },
    provenance: {
      mappings: [
        {
          sourcePath: payload.admin_graphql_api_id
            ? "payload.admin_graphql_api_id"
            : "payload.id",
          targetPath: "order.externalId",
          transformation: payload.admin_graphql_api_id
            ? ("copied" as const)
            : ("copied_as_string" as const),
        },
        {
          sourcePath:
            payload.current_total_price !== undefined
              ? "payload.current_total_price"
              : "payload.total_price",
          targetPath: "order.total.amount",
          transformation:
            payload.current_total_price !== undefined
              ? ("copied" as const)
              : ("fallback" as const),
        },
        {
          sourcePath: "payload.currency",
          targetPath: "order.currency",
          transformation: "uppercased" as const,
        },
        {
          sourcePath:
            payload.processed_at !== undefined && payload.processed_at !== null
              ? "payload.processed_at"
              : "payload.created_at",
          targetPath: "order.paidAt",
          transformation:
            payload.processed_at !== undefined && payload.processed_at !== null
              ? ("copied" as const)
              : ("fallback" as const),
        },
      ],
      payloadSha256: event.payloadSha256,
      receivedAt: event.receivedAt,
      sourceAccount: event.externalAccountId,
      sourceEventId: event.externalEventId,
      sourceEventType: "orders/paid" as const,
      sourceKind: "provider_webhook" as const,
      sourceProvider: "shopify" as const,
    },
    schemaVersion: 1 as const,
    type: "order.paid" as const,
    workspaceId: event.workspaceId,
  };

  const result = NormalizedOrderPaidSchema.safeParse(normalized);
  if (!result.success) {
    throw new InvalidCommerceEventPayloadError(
      "Normalized orders/paid contract validation failed",
    );
  }
  return result.data;
}

function isShopifyDomain(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value);
}
