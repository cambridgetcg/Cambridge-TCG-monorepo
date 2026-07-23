import { randomUUID } from "node:crypto";

import type pg from "pg";
import { uuidv7 } from "yutabase/uuidv7";

import {
  InvalidCommerceEventPayloadError,
  normalizeCommerceEvent,
  type CommerceEventForNormalization,
  type NormalizedOrderPaid,
  UnsupportedCommerceEventError,
} from "./domain/normalized-order-paid.js";
import { parseExactJson } from "./exact-json.js";

const PROJECTION_CLAIMANT = "system:rewardspro/normalizer";
const TERMINAL_PROJECTION_CONSTRAINTS = new Set([
  "commerce_line_items_order_external_unique",
  "commerce_orders_external_unique",
]);

interface ClaimedEventRow extends pg.QueryResultRow {
  commerce_connection_id: string;
  external_account_id: string;
  external_event_id: string;
  external_event_type: string;
  id: string;
  occurred_at: Date | string | null;
  payload_json: string;
  payload_sha256: string;
  provider: string;
  received_at: Date | string;
  workspace_id: string;
}

interface EventProcessingStateRow extends pg.QueryResultRow {
  lease_active: boolean;
  processing_state: string;
}

export interface ClaimedCommerceEvent extends CommerceEventForNormalization {
  leaseToken: string;
}

export type ClaimByIdResult =
  | { event: ClaimedCommerceEvent; status: "claimed" }
  | {
      status: "active_lease" | "missing" | "retryable" | "terminal";
    };

export interface ProcessingStore {
  claimById(eventId: string): Promise<ClaimByIdResult>;
  claimNext(): Promise<ClaimedCommerceEvent | null>;
  claimNextRecoverable(): Promise<ClaimedCommerceEvent | null>;
  completeFailed(event: ClaimedCommerceEvent, errorCode: string): Promise<void>;
  completeIgnored(event: ClaimedCommerceEvent, reasonCode: string): Promise<void>;
  completeNormalized(
    event: ClaimedCommerceEvent,
    normalized: NormalizedOrderPaid,
  ): Promise<void>;
  sweepExpiredPayloads(limit: number): Promise<PayloadRetentionSweepResult>;
}

export interface PayloadRetentionSweepResult {
  deletedPayloads: number;
  terminalizedEvents: number;
}

export type ClaimedProcessResult = "normalized" | "ignored" | "failed";
export type ProcessByIdResult =
  | ClaimedProcessResult
  | "active_lease"
  | "missing"
  | "retryable"
  | "terminal";
export type ProcessNextResult = ClaimedProcessResult | "noop";

export class ProcessingLeaseLostError extends Error {
  override readonly name = "ProcessingLeaseLostError";
}

export class CommerceProjectionConflictError extends Error {
  override readonly name = "CommerceProjectionConflictError";
}

export class PostgresProcessingStore implements ProcessingStore {
  constructor(
    private readonly pool: Pick<pg.Pool, "connect" | "query">,
    private readonly leaseSeconds = 120,
  ) {}

  async claimById(eventId: string): Promise<ClaimByIdResult> {
    const leaseToken = randomUUID();
    const result = await this.pool.query<ClaimedEventRow>(
      `WITH claimed AS (
         UPDATE public.rp_commerce_event_state
            SET processing_state = 'processing',
                processing_lease_token = $2,
                processing_lease_until = now() + ($3 * interval '1 second'),
                processing_attempt_count = processing_attempt_count + 1
          WHERE event_id = $1
            AND (
              processing_state = 'received'
              OR (
                processing_state = 'processing'
                AND (
                  processing_lease_until IS NULL
                  OR processing_lease_until < now()
                )
              )
            )
        RETURNING event_id
       )
       SELECT
         event.id,
         event.workspace_id,
         event.commerce_connection_id,
         event.external_event_id,
         event.external_event_type,
         payload.payload::text AS payload_json,
         event.payload_sha256,
         event.occurred_at,
         event.received_at,
         connection.external_account_id,
         connection.provider
       FROM claimed
       JOIN commerce.events event
         ON event.id = claimed.event_id
       JOIN commerce.event_payloads payload
         ON payload.event_id = event.id
       JOIN public.rp_commerce_connection connection
         ON connection.id = event.commerce_connection_id`,
      [eventId, leaseToken, this.leaseSeconds],
    );
    const claimed = mapClaim(result.rows[0], leaseToken);
    if (claimed) {
      return { event: claimed, status: "claimed" };
    }

    const stateResult = await this.pool.query<EventProcessingStateRow>(
      `SELECT
         processing_state,
         (
           processing_state = 'processing'
           AND processing_lease_until IS NOT NULL
           AND processing_lease_until >= now()
         ) AS lease_active
       FROM public.rp_commerce_event_state
       WHERE event_id = $1`,
      [eventId],
    );
    const state = stateResult.rows[0];
    if (!state) {
      return { status: "missing" };
    }
    if (["normalized", "ignored", "failed"].includes(state.processing_state)) {
      return { status: "terminal" };
    }
    if (state.processing_state === "processing" && state.lease_active) {
      return { status: "active_lease" };
    }
    // A concurrent claimant can change state between the UPDATE and inspection.
    // Retaining the SQS message is the conservative response to any live state
    // that this attempt did not own.
    return { status: "retryable" };
  }

  async claimNext(): Promise<ClaimedCommerceEvent | null> {
    const leaseToken = randomUUID();
    const result = await this.pool.query<ClaimedEventRow>(
      `WITH candidate AS (
         SELECT state.event_id
           FROM public.rp_commerce_event_state state
           JOIN commerce.events event
             ON event.id = state.event_id
           JOIN commerce.event_payloads payload
             ON payload.event_id = state.event_id
          WHERE state.processing_state = 'received'
             OR (
               state.processing_state = 'processing'
               AND (
                 state.processing_lease_until IS NULL
                 OR state.processing_lease_until < now()
               )
             )
          ORDER BY event.received_at
          LIMIT 1
          FOR UPDATE OF state SKIP LOCKED
       ),
       claimed AS (
         UPDATE public.rp_commerce_event_state state
            SET processing_state = 'processing',
                processing_lease_token = $1,
                processing_lease_until = now() + ($2 * interval '1 second'),
                processing_attempt_count = processing_attempt_count + 1
           FROM candidate
          WHERE state.event_id = candidate.event_id
        RETURNING state.event_id
       )
       SELECT
         event.id,
         event.workspace_id,
         event.commerce_connection_id,
         event.external_event_id,
         event.external_event_type,
         payload.payload::text AS payload_json,
         event.payload_sha256,
         event.occurred_at,
         event.received_at,
         connection.external_account_id,
         connection.provider
       FROM claimed
       JOIN commerce.events event
         ON event.id = claimed.event_id
       JOIN commerce.event_payloads payload
         ON payload.event_id = event.id
       JOIN public.rp_commerce_connection connection
         ON connection.id = event.commerce_connection_id`,
      [leaseToken, this.leaseSeconds],
    );
    return mapClaim(result.rows[0], leaseToken);
  }

  async claimNextRecoverable(): Promise<ClaimedCommerceEvent | null> {
    const leaseToken = randomUUID();
    const result = await this.pool.query<ClaimedEventRow>(
      `WITH candidate AS (
         SELECT state.event_id
           FROM public.rp_commerce_event_state state
           JOIN commerce.events event
             ON event.id = state.event_id
           JOIN commerce.event_payloads payload
             ON payload.event_id = state.event_id
          WHERE (
              state.processing_state = 'processing'
              AND (
                state.processing_lease_until IS NULL
                OR state.processing_lease_until < now()
              )
            )
             OR (
              state.processing_state = 'received'
              AND state.dispatch_state = 'queued'
              AND state.dispatched_at IS NOT NULL
              AND state.dispatched_at < now() - ($2 * interval '1 second')
            )
          ORDER BY
            CASE WHEN state.processing_state = 'processing' THEN 0 ELSE 1 END,
            COALESCE(
              state.processing_lease_until,
              state.dispatched_at,
              event.received_at
            )
          LIMIT 1
          FOR UPDATE OF state SKIP LOCKED
       ),
       claimed AS (
         UPDATE public.rp_commerce_event_state state
            SET processing_state = 'processing',
                processing_lease_token = $1,
                processing_lease_until = now() + ($2 * interval '1 second'),
                processing_attempt_count = processing_attempt_count + 1
           FROM candidate
          WHERE state.event_id = candidate.event_id
        RETURNING state.event_id
       )
       SELECT
         event.id,
         event.workspace_id,
         event.commerce_connection_id,
         event.external_event_id,
         event.external_event_type,
         payload.payload::text AS payload_json,
         event.payload_sha256,
         event.occurred_at,
         event.received_at,
         connection.external_account_id,
         connection.provider
       FROM claimed
       JOIN commerce.events event
         ON event.id = claimed.event_id
       JOIN commerce.event_payloads payload
         ON payload.event_id = event.id
       JOIN public.rp_commerce_connection connection
         ON connection.id = event.commerce_connection_id`,
      [leaseToken, this.leaseSeconds],
    );
    return mapClaim(result.rows[0], leaseToken);
  }

  async completeNormalized(
    event: ClaimedCommerceEvent,
    normalized: NormalizedOrderPaid,
  ): Promise<void> {
    const client = await this.pool.connect();
    const orderId = uuidv7();
    const eventRef = cardRef("events", event.eventId);
    const orderRef = cardRef("orders", orderId);
    const lineItems = normalized.order.lineItems.map((lineItem, position) => ({
      cardId: uuidv7(),
      lineItem,
      position,
      threadId: uuidv7(),
    }));

    try {
      await client.query("BEGIN");
      const lease = await client.query(
        `SELECT event_id
           FROM public.rp_commerce_event_state
          WHERE event_id = $1
            AND processing_state = 'processing'
            AND processing_lease_token = $2
          FOR UPDATE`,
        [event.eventId, event.leaseToken],
      );
      assertLeaseOwned(lease.rowCount);

      await client.query(
        `INSERT INTO commerce.orders (
           id,
           workspace_id,
           commerce_connection_id,
           source_event_id,
           external_order_id,
           external_customer_id,
           name,
           currency,
           total_amount,
           paid_at,
           mapping,
           at,
           by,
           how,
           src
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11::jsonb, now(), $12, 'computed', ARRAY[$13]::text[]
         )`,
        [
          orderId,
          normalized.workspaceId,
          normalized.commerceConnectionId,
          event.eventId,
          normalized.order.externalId,
          normalized.order.externalCustomerId,
          normalized.order.name,
          normalized.order.currency,
          normalized.order.total.amount,
          normalized.order.paidAt,
          JSON.stringify(orderMapping(normalized)),
          PROJECTION_CLAIMANT,
          eventRef,
        ],
      );

      for (const projected of lineItems) {
        await client.query(
          `INSERT INTO commerce.line_items (
             id,
             workspace_id,
             commerce_connection_id,
             order_id,
             position,
             external_line_item_id,
             external_product_id,
             external_variant_id,
             quantity,
             sku,
             title,
             unit_price_amount,
             unit_price_currency,
             mapping,
             at,
             by,
             how,
             src
           )
           VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
             $12, $13, $14::jsonb, now(), $15, 'computed',
             ARRAY[$16]::text[]
           )`,
          [
            projected.cardId,
            normalized.workspaceId,
            normalized.commerceConnectionId,
            orderId,
            projected.position,
            projected.lineItem.externalId,
            projected.lineItem.externalProductId,
            projected.lineItem.externalVariantId,
            projected.lineItem.quantity,
            projected.lineItem.sku,
            projected.lineItem.title,
            projected.lineItem.unitPrice?.amount ?? null,
            projected.lineItem.unitPrice?.currency ?? null,
            JSON.stringify(
              lineItemMapping(projected.position, projected.lineItem),
            ),
            PROJECTION_CLAIMANT,
            eventRef,
          ],
        );
      }

      await client.query(
        `INSERT INTO yu.threads (
           id,
           word,
           from_book,
           from_deck,
           from_id,
           to_book,
           to_deck,
           to_id,
           note,
           at,
           by,
           how,
           src
         )
         VALUES (
           $1, 'derived_from',
           'commerce', 'orders', $2,
           'commerce', 'events', $3,
           'orders/paid normalization',
           now(), $4, 'computed', ARRAY[$5]::text[]
         )`,
        [uuidv7(), orderId, event.eventId, PROJECTION_CLAIMANT, eventRef],
      );

      for (const projected of lineItems) {
        await client.query(
          `INSERT INTO yu.threads (
             id,
             word,
             from_book,
             from_deck,
             from_id,
             to_book,
             to_deck,
             to_id,
             note,
             at,
             by,
             how,
             src
           )
           VALUES (
             $1, 'contains',
             'commerce', 'orders', $2,
             'commerce', 'line_items', $3,
             $4,
             now(), $5, 'computed', ARRAY[$6]::text[]
           )`,
          [
            projected.threadId,
            orderId,
            projected.cardId,
            `line item ${projected.position}`,
            PROJECTION_CLAIMANT,
            eventRef,
          ],
        );
      }

      const result = await client.query(
        `UPDATE public.rp_commerce_event_state
            SET processing_state = 'normalized',
                processing_lease_token = NULL,
                processing_lease_until = NULL,
                normalized_event_type = $3,
                normalized_payload = $4::jsonb,
                normalized_at = now(),
                last_processing_error_code = NULL
          WHERE event_id = $1
            AND processing_state = 'processing'
            AND processing_lease_token = $2`,
        [
          event.eventId,
          event.leaseToken,
          normalized.type,
          JSON.stringify({
            ...normalized,
            projection: {
              orderRef,
              lineItemRefs: lineItems.map((projected) =>
                cardRef("line_items", projected.cardId),
              ),
            },
          }),
        ],
      );
      assertLeaseOwned(result.rowCount);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (isTerminalProjectionConflict(error)) {
        throw new CommerceProjectionConflictError(
          "Commerce event conflicts with an existing semantic projection",
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async completeIgnored(
    event: ClaimedCommerceEvent,
    reasonCode: string,
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE public.rp_commerce_event_state
          SET processing_state = 'ignored',
              processing_lease_token = NULL,
              processing_lease_until = NULL,
              last_processing_error_code = $3
        WHERE event_id = $1
          AND processing_state = 'processing'
          AND processing_lease_token = $2`,
      [event.eventId, event.leaseToken, reasonCode],
    );
    assertLeaseOwned(result.rowCount);
  }

  async completeFailed(
    event: ClaimedCommerceEvent,
    errorCode: string,
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE public.rp_commerce_event_state
          SET processing_state = 'failed',
              processing_lease_token = NULL,
              processing_lease_until = NULL,
              last_processing_error_code = $3
        WHERE event_id = $1
          AND processing_state = 'processing'
          AND processing_lease_token = $2`,
      [event.eventId, event.leaseToken, errorCode],
    );
    assertLeaseOwned(result.rowCount);
  }

  async sweepExpiredPayloads(
    limit: number,
  ): Promise<PayloadRetentionSweepResult> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) {
      throw new RangeError("Payload retention sweep limit must be 1..1000");
    }

    const result = await this.pool.query<{
      deleted_payloads: number;
      terminalized_events: number;
    }>(
      `WITH candidate AS MATERIALIZED (
         SELECT payload.event_id
           FROM commerce.event_payloads payload
           JOIN public.rp_commerce_event_state state
             ON state.event_id = payload.event_id
          WHERE payload.retention_until <= now()
          ORDER BY payload.retention_until, payload.event_id
          LIMIT $1
          FOR UPDATE OF state SKIP LOCKED
       ),
       terminalized AS (
         UPDATE public.rp_commerce_event_state state
            SET processing_state = 'failed',
                processing_lease_token = NULL,
                processing_lease_until = NULL,
                last_processing_error_code = 'payload_retention_expired',
                dispatch_state = 'disabled',
                dispatch_lease_token = NULL,
                dispatch_lease_until = NULL,
                last_dispatch_error_code = 'payload_retention_expired'
           FROM candidate
          WHERE state.event_id = candidate.event_id
            AND state.processing_state IN ('received', 'processing')
         RETURNING state.event_id
       ),
       deleted AS (
         DELETE FROM commerce.event_payloads payload
          USING candidate
          WHERE payload.event_id = candidate.event_id
            AND (SELECT count(*) FROM terminalized) >= 0
         RETURNING payload.event_id
       )
       SELECT
         (SELECT count(*)::integer FROM terminalized) AS terminalized_events,
         (SELECT count(*)::integer FROM deleted) AS deleted_payloads`,
      [limit],
    );
    return {
      deletedPayloads: result.rows[0]?.deleted_payloads ?? 0,
      terminalizedEvents: result.rows[0]?.terminalized_events ?? 0,
    };
  }
}

export class CommerceEventProcessor {
  constructor(private readonly store: ProcessingStore) {}

  async processById(eventId: string): Promise<ProcessByIdResult> {
    const claim = await this.store.claimById(eventId);
    return claim.status === "claimed"
      ? this.processClaimed(claim.event)
      : claim.status;
  }

  async processNext(): Promise<ProcessNextResult> {
    const event = await this.store.claimNext();
    return event ? this.processClaimed(event) : "noop";
  }

  async processNextRecoverable(): Promise<ProcessNextResult> {
    const event = await this.store.claimNextRecoverable();
    return event ? this.processClaimed(event) : "noop";
  }

  async sweepExpiredPayloads(
    limit: number,
  ): Promise<PayloadRetentionSweepResult> {
    return this.store.sweepExpiredPayloads(limit);
  }

  private async processClaimed(
    event: ClaimedCommerceEvent,
  ): Promise<ClaimedProcessResult> {
    try {
      const normalized = normalizeCommerceEvent(event);
      await this.store.completeNormalized(event, normalized);
      return "normalized";
    } catch (error) {
      if (error instanceof UnsupportedCommerceEventError) {
        await this.store.completeIgnored(event, "unsupported_event_type");
        return "ignored";
      }
      if (error instanceof InvalidCommerceEventPayloadError) {
        await this.store.completeFailed(event, "invalid_provider_payload");
        return "failed";
      }
      if (error instanceof CommerceProjectionConflictError) {
        await this.store.completeFailed(event, "projection_conflict");
        return "failed";
      }
      throw error;
    }
  }
}

function cardRef(deck: "events" | "line_items" | "orders", id: string): string {
  return `commerce/${deck}/${id}`;
}

function orderMapping(normalized: NormalizedOrderPaid): Record<string, unknown> {
  const mappings = normalized.provenance.mappings;
  const mappingFor = (targetPath: string): unknown =>
    mappings.find((mapping) => mapping.targetPath === targetPath) ?? null;

  return {
    fields: {
      currency: mappingFor("order.currency"),
      externalCustomerId: {
        sourcePath: "payload.customer.id",
        transformation:
          normalized.order.externalCustomerId === null
            ? "absent_as_null"
            : "copied_as_string",
      },
      externalOrderId: mappingFor("order.externalId"),
      name: {
        sourcePath: "payload.name",
        transformation:
          normalized.order.name === null ? "absent_as_null" : "copied",
      },
      paidAt: mappingFor("order.paidAt"),
      totalAmount: mappingFor("order.total.amount"),
    },
    payloadSha256: normalized.provenance.payloadSha256,
    schemaVersion: 1,
    sourceEventId: normalized.eventId,
    sourceKind: normalized.provenance.sourceKind,
  };
}

function lineItemMapping(
  position: number,
  lineItem: NormalizedOrderPaid["order"]["lineItems"][number],
): Record<string, unknown> {
  const prefix = `payload.line_items[${position}]`;
  return {
    fields: {
      externalLineItemId: {
        sourcePath: `${prefix}.id`,
        transformation: "copied_as_string",
      },
      externalProductId: {
        sourcePath: `${prefix}.product_id`,
        transformation:
          lineItem.externalProductId === null
            ? "absent_as_null"
            : "copied_as_string",
      },
      externalVariantId: {
        sourcePath: `${prefix}.variant_id`,
        transformation:
          lineItem.externalVariantId === null
            ? "absent_as_null"
            : "copied_as_string",
      },
      quantity: {
        sourcePath: `${prefix}.quantity`,
        transformation: "copied",
      },
      sku: {
        sourcePath: `${prefix}.sku`,
        transformation: lineItem.sku === null ? "absent_as_null" : "copied",
      },
      title: {
        sourcePath: `${prefix}.title`,
        transformation: "copied",
      },
      unitPrice: {
        sourcePath: `${prefix}.price`,
        transformation:
          lineItem.unitPrice === null ? "absent_as_null" : "copied",
      },
    },
    position,
    schemaVersion: 1,
  };
}

function assertLeaseOwned(rowCount: number | null): void {
  if (rowCount !== 1) {
    throw new ProcessingLeaseLostError(
      "Commerce-event processing lease is no longer owned",
    );
  }
}

function isTerminalProjectionConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const candidate = error as { code?: unknown; constraint?: unknown };
  return (
    candidate.code === "23505" &&
    typeof candidate.constraint === "string" &&
    TERMINAL_PROJECTION_CONSTRAINTS.has(candidate.constraint)
  );
}

function mapClaim(
  row: ClaimedEventRow | undefined,
  leaseToken: string,
): ClaimedCommerceEvent | null {
  if (!row) {
    return null;
  }
  return {
    commerceConnectionId: row.commerce_connection_id,
    eventId: row.id,
    externalAccountId: row.external_account_id,
    externalEventId: row.external_event_id,
    externalEventType: row.external_event_type,
    leaseToken,
    occurredAt: row.occurred_at === null ? null : toIsoString(row.occurred_at),
    payload: parseExactJson(row.payload_json),
    payloadSha256: row.payload_sha256.trim(),
    provider: row.provider,
    receivedAt: toIsoString(row.received_at),
    workspaceId: row.workspace_id,
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
